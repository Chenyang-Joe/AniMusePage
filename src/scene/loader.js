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

// Step 1: compute scale + offset by iterating base-pose vertices in world space.
// Box3.setFromObject is NOT used here: Three.js expands the bounding box by ALL morph targets
// regardless of current weights, giving the worst-case inflated box — not the base pose bounds.
function computePedestalTransform(model) {
  model.position.set(0, 0, 0)
  model.scale.set(1, 1, 1)
  model.updateMatrixWorld(true)

  // Find the first (and only) mesh primitive
  let predMeshNode = null
  model.traverse(n => { if (n.isMesh && !predMeshNode) predMeshNode = n })
  if (!predMeshNode) throw new Error('No mesh found in pred model')

  const pos = predMeshNode.geometry.attributes.position
  const wm  = predMeshNode.matrixWorld
  const v   = new THREE.Vector3()

  // Iterate base-pose vertices in world space
  let wMinX = Infinity, wMaxX = -Infinity
  let wMinY = Infinity, wMaxY = -Infinity
  let wMinZ = Infinity, wMaxZ = -Infinity
  let lMinY = Infinity, lMaxY = -Infinity   // local (mesh) space Y

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(wm)
    if (v.x < wMinX) wMinX = v.x;  if (v.x > wMaxX) wMaxX = v.x
    if (v.y < wMinY) wMinY = v.y;  if (v.y > wMaxY) wMaxY = v.y
    if (v.z < wMinZ) wMinZ = v.z;  if (v.z > wMaxZ) wMaxZ = v.z
    const ly = pos.getY(i)
    if (ly < lMinY) lMinY = ly;    if (ly > lMaxY) lMaxY = ly
  }

  const worldSizeY  = Math.max(wMaxY - wMinY, 0.001)
  const localSizeY  = Math.max(lMaxY - lMinY, 0.001)
  const scale       = 1.8 / worldSizeY
  const offset      = new THREE.Vector3(
    -((wMinX + wMaxX) / 2) * scale,
    1.6 - wMinY * scale,
    -((wMinZ + wMaxZ) / 2) * scale,
  )
  // floorScaleY = child_scale_Y * scale = (worldSizeY/localSizeY) * (1.8/worldSizeY) = 1.8/localSizeY
  const floorScaleY  = 1.8 / localSizeY
  const initialOffsetY = offset.y

  console.log(`[pedestal] worldSizeY=${worldSizeY.toFixed(3)} scale=${scale.toFixed(3)} wMinY=${wMinY.toFixed(4)} lMinY=${lMinY.toFixed(4)} floorScaleY=${floorScaleY.toFixed(4)}`)
  console.log(`  → script expected: lMinY≈0.4144 floorScaleY≈3.0735`)
  return { scale, offset, predMeshNode, baseLocalMinY: lMinY, floorScaleY, initialOffsetY }
}

// Step 2: apply the shared transform to any model
function applyPedestalTransform(model, scale, offset) {
  model.position.set(0, 0, 0)
  model.scale.set(1, 1, 1)
  model.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())

  model.scale.setScalar(scale)
  model.position.copy(offset)

  console.log(`[applied] size=${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} → scale=${scale.toFixed(3)} pos=(${offset.x.toFixed(2)},${offset.y.toFixed(2)},${offset.z.toFixed(2)})`)
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
      color: 0xb89a72,
      roughness: 0.85,
      metalness: 0.0,
    })
  })
}

function applyBonesMaterial(model) {
  model.traverse(node => {
    if (!node.isMesh) return
    node.castShadow = false
    node.material = new THREE.MeshBasicMaterial({
      color: 0xff8c00,
      transparent: true,
      opacity: 0.9,
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
  const { scale: sharedScale, offset: sharedOffset,
          predMeshNode, baseLocalMinY, floorScaleY, initialOffsetY } = computePedestalTransform(predModel)
  applyPedestalTransform(predModel, sharedScale, sharedOffset)
  predModel.visible = true
  slotGroup.add(predModel)

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
