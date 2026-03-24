import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { Debug } from '../utils/debug.js'

const BASE = import.meta.env.BASE_URL

export async function loadModels(scene, onProgress) {
  const loader = new GLTFLoader()
  // MeshoptDecoder.ready is a Promise — must await before loading meshopt-compressed GLBs
  await MeshoptDecoder.ready
  loader.setMeshoptDecoder(MeshoptDecoder)

  let label = { animal: '', action: '' }
  try {
    const res = await fetch(`${BASE}models/gt_meta.json`)
    label = await res.json()
  } catch {}

  const [gtGltf, bonesGltf] = await Promise.all([
    loadOne(loader, `${BASE}models/pred.glb`, p => onProgress('mesh', p)),
    loadOne(loader, `${BASE}models/bones.glb`, p => onProgress('bones', p)),
  ])

  // ── GT mesh ────────────────────────────────────────────────────────────
  const predModel = gtGltf.scene
  applyMeshMaterial(predModel)
  const { scale: sharedScale, offset: sharedOffset,
          predMeshNode, baseLocalMinY, floorScaleY, initialOffsetY } = computePedestalTransform(predModel)
  applyPedestalTransform(predModel, sharedScale, sharedOffset)
  predModel.visible = true
  scene.add(predModel)

  const predMixer = new THREE.AnimationMixer(predModel)
  const predAction = gtGltf.animations.length
    ? predMixer.clipAction(gtGltf.animations[0])
    : null
  if (predAction) {
    predAction.setLoop(THREE.LoopRepeat)
    predAction.clampWhenFinished = false
  }

  console.log('gt loaded — animations:', gtGltf.animations.length,
    'morph targets:', countMorphTargets(predModel))

  // ── Bones ─────────────────────────────────────────────────────────────
  const bonesModel = bonesGltf.scene
  applyBonesMaterial(bonesModel)
  // Use same scale as pred so bones sit inside the mesh volume correctly
  applyPedestalTransform(bonesModel, sharedScale, sharedOffset)
  bonesModel.visible = false
  scene.add(bonesModel)

  const bonesMixer = new THREE.AnimationMixer(bonesModel)
  const bonesAction = bonesGltf.animations.length
    ? bonesMixer.clipAction(bonesGltf.animations[0])
    : null
  if (bonesAction) {
    bonesAction.setLoop(THREE.LoopRepeat)
    bonesAction.clampWhenFinished = false
  }

  console.log('bones loaded — animations:', bonesGltf.animations.length,
    'nodes:', bonesGltf.scene.children.length)

  return { predModel, predMixer, predAction, bonesModel, bonesMixer, bonesAction,
           sharedScale, predMeshNode, baseLocalMinY, floorScaleY, initialOffsetY, label }
}

function loadOne(loader, url, onProgress) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, e => {
      if (e.total) onProgress(e.loaded / e.total)
    }, reject)
  })
}

// Step 1: compute scale + offset by iterating base-pose vertices.
// Box3.setFromObject is NOT used here: Three.js expands the bounding box by ALL morph targets
// regardless of current weights, giving the worst-case inflated box — not the base pose bounds.
//
// Vertices are transformed into the PARENT'S LOCAL SPACE (slotGroup local space).
// This is critical: each slotGroup has rotation.y = -angle, so world space ≠ local space.
// The computed offset is applied as model.position (also in parent local space), so they must match.
function computePedestalTransform(model) {
  model.position.set(0, 0, 0)
  model.rotation.set(0, 0, 0)
  model.scale.set(1, 1, 1)
  // Update the full parent chain so all matrixWorld values are current.
  model.updateWorldMatrix(true, true)

  // Find the first (and only) mesh primitive
  let predMeshNode = null
  model.traverse(n => { if (n.isMesh && !predMeshNode) predMeshNode = n })
  if (!predMeshNode) throw new Error('No mesh found in pred model')

  const pos = predMeshNode.geometry.attributes.position

  // Build a matrix that maps mesh vertices → parent local space.
  // If model has no parent (legacy loadModels path), fall back to world space (parent = identity).
  // Pre-multiply by the display rotation so the bounding box is computed
  // for the as-displayed (rotated) model. Without this, centering is computed
  // at rotation=0 but the offset is applied after rotation — asymmetric animals shift.
  const R_display = new THREE.Matrix4().makeRotationY(MODEL_ROTATION_Y)
  const meshToParentLocal = new THREE.Matrix4()
  if (model.parent) {
    const invParent = new THREE.Matrix4().copy(model.parent.matrixWorld).invert()
    const base = new THREE.Matrix4().multiplyMatrices(invParent, predMeshNode.matrixWorld)
    meshToParentLocal.multiplyMatrices(R_display, base)
  } else {
    meshToParentLocal.multiplyMatrices(R_display, predMeshNode.matrixWorld)
  }

  const v   = new THREE.Vector3()
  let sMinX = Infinity, sMaxX = -Infinity
  let sMinY = Infinity, sMaxY = -Infinity
  let sMinZ = Infinity, sMaxZ = -Infinity
  let lMinY = Infinity, lMaxY = -Infinity   // raw geometry Y (for floor tracking)

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(meshToParentLocal)
    if (v.x < sMinX) sMinX = v.x;  if (v.x > sMaxX) sMaxX = v.x
    if (v.y < sMinY) sMinY = v.y;  if (v.y > sMaxY) sMaxY = v.y
    if (v.z < sMinZ) sMinZ = v.z;  if (v.z > sMaxZ) sMaxZ = v.z
    const ly = pos.getY(i)
    if (ly < lMinY) lMinY = ly;    if (ly > lMaxY) lMaxY = ly
  }

  // Target height and volume-based cap.
  // Scale is first computed to make the model BASE_HEIGHT tall.
  // Then capped by cube-root of bounding box volume — this is gentler than
  // max-axis for elongated animals (e.g. crocodile) which have large volume
  // but the height cap alone makes them reasonable.
  const BASE_HEIGHT   = 1.5
  const MAX_VOL_CBRT  = 2.0   // cube-root cap: volume ≤ (2.0)³ = 8 units³

  const parentSizeY = Math.max(sMaxY - sMinY, 0.001)
  const localSizeY  = Math.max(lMaxY - lMinY, 0.001)
  const sizeX       = sMaxX - sMinX
  const sizeZ       = sMaxZ - sMinZ

  const tentativeScale = BASE_HEIGHT / parentSizeY
  const cbrtVol = Math.cbrt(Math.max(sizeX, 0.001) * parentSizeY * Math.max(sizeZ, 0.001))
  const scale = Math.min(tentativeScale, MAX_VOL_CBRT / cbrtVol)

  const offset = new THREE.Vector3(
    -((sMinX + sMaxX) / 2) * scale,   // center X over slot origin in local space
    1.6 - sMinY * scale,               // place bottom at pedestal top Y=1.6
    -((sMinZ + sMaxZ) / 2) * scale,   // center Z over slot origin in local space
  )
  const floorScaleY  = scale * parentSizeY / localSizeY
  const initialOffsetY = offset.y

  console.log(`[pedestal] parentSizeY=${parentSizeY.toFixed(3)} cbrtVol=${cbrtVol.toFixed(3)} scale=${scale.toFixed(3)} sMinY=${sMinY.toFixed(4)} lMinY=${lMinY.toFixed(4)} floorScaleY=${floorScaleY.toFixed(4)}`)
  return { scale, offset, predMeshNode, baseLocalMinY: lMinY, floorScaleY, initialOffsetY }
}

// Step 2: apply the shared transform to any model
// Rotation of −15° around Y gives a slight clockwise angle — more dynamic than dead-on front.
const MODEL_ROTATION_Y = -Math.PI * 15 / 180

function applyPedestalTransform(model, scale, offset) {
  model.position.set(0, 0, 0)
  model.rotation.set(0, 0, 0)
  model.scale.set(1, 1, 1)

  model.scale.setScalar(scale)
  model.rotation.y = MODEL_ROTATION_Y
  model.position.copy(offset)

  console.log(`[applied] scale=${scale.toFixed(3)} pos=(${offset.x.toFixed(2)},${offset.y.toFixed(2)},${offset.z.toFixed(2)})`)
}

function applyMeshMaterial(model) {
  model.traverse(node => {
    if (!node.isMesh) return
    node.castShadow = true
    node.receiveShadow = true

    // The GLB has no NORMAL attribute — compute them so MeshStandardMaterial
    // can receive lighting. Normals are computed from base-pose geometry;
    // lighting will be approximate during animation but mesh will be visible.
    if (node.geometry) {
      node.geometry.computeVertexNormals()
    }

    node.material = new THREE.MeshStandardMaterial({
      color: 0xf0ebe3,   // ivory/bone white — reads cleanly under bright gallery lights
      roughness: 0.8,
      metalness: 0.0,
    })
  })
}

function applyBonesMaterial(model) {
  model.traverse(node => {
    if (!node.isMesh) return
    node.castShadow = false
    node.material = new THREE.MeshBasicMaterial({
      color: 0x5580c0,   // steel blue — x-ray/anatomical illustration look
      transparent: true,
      opacity: 0.88,
    })
  })
}

function countMorphTargets(model) {
  let n = 0
  model.traverse(node => {
    if (node.isMesh && node.morphTargetInfluences) n += node.morphTargetInfluences.length
  })
  return n
}

// ── Per-exhibit loader ─────────────────────────────────────────────────────
// Loads pred+bones for one exhibit index into slotGroup.
// slotGroup is the THREE.Group for that carousel slot (pedestal already there).
const _loader = new GLTFLoader()
let   _decoderReady = false

async function ensureDecoder() {
  if (_decoderReady) return
  await MeshoptDecoder.ready
  _loader.setMeshoptDecoder(MeshoptDecoder)
  _decoderReady = true
}

export async function loadExhibit(index, slotGroup, onProgress) {
  await ensureDecoder()

  const dir = `${BASE}models/exhibits/${index}`

  const [predGltf, bonesGltf] = await Promise.all([
    loadOne(_loader, `${dir}/pred.glb`,  p => onProgress?.('pred',  p)),
    loadOne(_loader, `${dir}/bones.glb`, p => onProgress?.('bones', p)),
  ])

  // ── Pred mesh ────────────────────────────────────────────────────────
  const predModel = predGltf.scene
  applyMeshMaterial(predModel)
  // Add to slotGroup BEFORE computing transform so matrixWorld includes the
  // slot's world position — this makes X/Z centering correct for any carousel slot.
  slotGroup.add(predModel)
  const { scale: sharedScale, offset: sharedOffset,
          predMeshNode, baseLocalMinY, floorScaleY, initialOffsetY } = computePedestalTransform(predModel)
  applyPedestalTransform(predModel, sharedScale, sharedOffset)
  predModel.visible = true

  const predMixer = new THREE.AnimationMixer(predModel)
  const predAction = predGltf.animations.length
    ? predMixer.clipAction(predGltf.animations[0])
    : null
  if (predAction) {
    predAction.setLoop(THREE.LoopRepeat)
    predAction.clampWhenFinished = false
  }

  // ── Bones ────────────────────────────────────────────────────────────
  const bonesModel = bonesGltf.scene
  applyBonesMaterial(bonesModel)
  applyPedestalTransform(bonesModel, sharedScale, sharedOffset)
  bonesModel.visible = false
  slotGroup.add(bonesModel)

  const bonesMixer = new THREE.AnimationMixer(bonesModel)
  const bonesAction = bonesGltf.animations.length
    ? bonesMixer.clipAction(bonesGltf.animations[0])
    : null
  if (bonesAction) {
    bonesAction.setLoop(THREE.LoopRepeat)
    bonesAction.clampWhenFinished = false
  }

  Debug.log('loader',
    `exhibit ${index} loaded | morphTargets=${countMorphTargets(predModel)}` +
    ` baseLocalMinY=${baseLocalMinY.toFixed(4)} floorScaleY=${floorScaleY.toFixed(4)} initialOffsetY=${initialOffsetY.toFixed(4)}`)

  return {
    predModel, predMixer, predAction,
    bonesModel, bonesMixer, bonesAction,
    predMeshNode, baseLocalMinY, floorScaleY, initialOffsetY,
    sharedScale,
  }
}
