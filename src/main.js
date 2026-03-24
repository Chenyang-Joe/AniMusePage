import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildMuseum } from './scene/museum.js'
import { buildCarousel } from './scene/carousel.js'
import { ExhibitManager } from './scene/exhibit-manager.js'
import { buildPostProcessing } from './scene/postprocessing.js'
import { setupControls } from './interaction/controls.js'

// ── Renderer ───────────────────────────────────────────────────────────────
const container = document.getElementById('canvas-container')
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2
container.appendChild(renderer.domElement)

// ── Scene & Camera ─────────────────────────────────────────────────────────
const scene  = new THREE.Scene()
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

// ── Museum Scene (lights + floor, no pedestal) ─────────────────────────────
const lights = buildMuseum(scene)

// ── Carousel (15 pedestals on circle R=12) ─────────────────────────────────
const N = 15, R = 12
const { slots, rotateTo, update: updateTween } = buildCarousel(scene, N, R)

// ── Post-processing ────────────────────────────────────────────────────────
const { composer, bloom } = buildPostProcessing(renderer, scene, camera)

// ── Loading UI ─────────────────────────────────────────────────────────────
const loadingEl  = document.getElementById('loading')
const loadingBar = document.getElementById('loading-bar')
loadingBar.style.width = '10%'

// ── Load manifest + activate first exhibit ─────────────────────────────────
const BASE = import.meta.env.BASE_URL
fetch(`${BASE}models/exhibits/manifest.json`)
  .then(r => r.json())
  .then(async manifest => {
    const manager = new ExhibitManager(slots, manifest)

    loadingBar.style.width = '30%'
    await manager.activate(0)
    loadingBar.style.width = '100%'

    // Pre-warm the composer so its GPU buffers are initialized before first use.
    // Without this, the first composer.render() call has uninitialized bloom buffers
    // which cause a yellow/dim tint on the first "Bring to Life".
    bloom.strength = 0
    composer.render()
    renderer.render(scene, camera)  // restore plain render

    loadingEl.style.opacity = '0'
    setTimeout(() => { loadingEl.style.display = 'none' }, 800)

    // ── Controls ───────────────────────────────────────────────────────
    let needsBloom = false
    const { updateUI } = setupControls({
      lights,
      bloom,
      manager,
      carousel: { rotateTo, update: updateTween },
      onAlive:      () => { needsBloom = true },
      onResetBloom: () => { needsBloom = false; bloom.strength = 0 },
    })
    updateUI()

    // ── Render loop ───────────────────────────────────────────────────
    const clock = new THREE.Clock()

    function animate() {
      requestAnimationFrame(animate)
      const delta = clock.getDelta()
      orbit.update()
      updateTween(delta)
      manager.update(delta)

      const { updatePredFloor, updateBonesFloor } = manager.getFloorTracker()
      updatePredFloor()
      updateBonesFloor()

      if (needsBloom) composer.render()
      else renderer.render(scene, camera)
    }
    animate()
  })
  .catch(err => {
    console.error('Failed to load manifest:', err)
    loadingEl.innerHTML = '<span style="color:#c0392b">Failed to load exhibit data.<br>Check console.</span>'
  })

// ── Resize ─────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
})
