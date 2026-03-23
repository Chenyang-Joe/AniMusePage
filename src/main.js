import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildMuseum, setPlateLabel } from './scene/museum.js'
import { loadModels } from './scene/loader.js'
import { buildPostProcessing } from './scene/postprocessing.js'
import { setupControls } from './interaction/controls.js'

// ── Renderer ───────────────────────────────────────────────────────────────
const container = document.getElementById('canvas-container')
const renderer = new THREE.WebGLRenderer({
  antialias: false,  // post-processing handles AA; native MSAA wastes GPU with EffectComposer
  powerPreference: 'high-performance',
})
// Cap pixel ratio: retina displays at 2x cost 4x the fill rate
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap   // cheaper than PCFSoft, still soft
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2
container.appendChild(renderer.domElement)

// ── Scene & Camera ─────────────────────────────────────────────────────────
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.set(0, 3.5, 6)
camera.lookAt(0, 2, 0)

// ── Orbit Controls ─────────────────────────────────────────────────────────
const orbit = new OrbitControls(camera, renderer.domElement)
orbit.target.set(0, 2, 0)
orbit.enableDamping = true
orbit.dampingFactor = 0.05
orbit.minDistance = 2
orbit.maxDistance = 12
orbit.maxPolarAngle = Math.PI / 2
orbit.update()

// ── Museum Scene ───────────────────────────────────────────────────────────
const { plate, plateMat, ...lights } = buildMuseum(scene)

// ── Post-processing ────────────────────────────────────────────────────────
const { composer, bloom } = buildPostProcessing(renderer, scene, camera)

// ── Loading UI ─────────────────────────────────────────────────────────────
const loadingEl = document.getElementById('loading')
const loadingBar = document.getElementById('loading-bar')
const progress = { mesh: 0, bones: 0 }

function onProgress(key, p) {
  progress[key] = p
  loadingBar.style.width = `${(progress.mesh + progress.bones) / 2 * 100}%`
}

// ── Load Models ────────────────────────────────────────────────────────────
loadModels(scene, onProgress).then(models => {
  loadingEl.style.opacity = '0'
  setTimeout(() => { loadingEl.style.display = 'none' }, 800)
  document.getElementById('btn-life').disabled = false

  const updateMixers = setupControls({ lights, bloom, ...models })

  // Apply nameplate label from GT metadata
  const { label } = models
  if (label.animal) setPlateLabel(plateMat, label.animal, 'Exploring in the Grass')

  // Per-frame floor tracking: CPU vertex iteration with current morph weights
  const { predModel, bonesModel, predMeshNode, baseLocalMinY, floorScaleY, initialOffsetY } = models
  const _predPos      = predMeshNode.geometry.attributes.position
  const _predMorphPos = predMeshNode.geometry.morphAttributes.position  // deltas
  const _predWeights  = predMeshNode.morphTargetInfluences

  function updatePredFloor() {
    let frameLocalMinY = Infinity
    for (let v = 0; v < _predPos.count; v++) {
      let y = _predPos.getY(v)
      for (let m = 0; m < _predWeights.length; m++) {
        if (_predWeights[m] > 1e-6) y += _predWeights[m] * _predMorphPos[m].getY(v)
      }
      if (y < frameLocalMinY) frameLocalMinY = y
    }
    predModel.position.y = initialOffsetY - (frameLocalMinY - baseLocalMinY) * floorScaleY
  }

  // Bones uses node/TRS animation (no morph targets), so Box3.setFromObject is correct.
  // Zero out Y first so the box isn't skewed by last frame's position offset.
  const _bonesBox = new THREE.Box3()
  function updateBonesFloor() {
    bonesModel.position.y = 0
    _bonesBox.setFromObject(bonesModel)
    bonesModel.position.y = 1.6 - _bonesBox.min.y
  }

  // ── Render loop ──────────────────────────────────────────────────────────
  const clock = new THREE.Clock()
  let needsBloom = false

  models.onAlive = () => { needsBloom = true }

  function animate() {
    requestAnimationFrame(animate)
    const delta = clock.getDelta()
    orbit.update()
    updateMixers(delta)
    updatePredFloor()   // keep GT feet on pedestal every frame
    updateBonesFloor()  // keep bones feet on pedestal every frame

    if (needsBloom) {
      composer.render()
    } else {
      renderer.render(scene, camera)
    }
  }
  animate()

}).catch(err => {
  console.error('Failed to load models:', err)
  loadingEl.innerHTML = '<span style="color:#c0392b">Failed to load models.<br>Check console.</span>'
})

// ── Resize ─────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
})
