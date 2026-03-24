import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildMuseum } from './scene/museum.js'
import { buildCarousel } from './scene/carousel.js'
import { CarouselCamera } from './scene/carousel-camera.js'
import { ExhibitManager } from './scene/exhibit-manager.js'
import { buildPostProcessing } from './scene/postprocessing.js'
import { setupControls } from './interaction/controls.js'
import { SparkleEffect } from './effects/sparkle.js'
import { PageManager } from './interaction/page-manager.js'
import yaml from 'js-yaml'

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
renderer.toneMappingExposure = 1.0
container.appendChild(renderer.domElement)

// ── Scene & Camera ─────────────────────────────────────────────────────────
const scene  = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.set(0, 25, 12)
camera.lookAt(0, 0, 12)

// ── Orbit Controls ─────────────────────────────────────────────────────────
const orbit = new OrbitControls(camera, renderer.domElement)
orbit.target.set(0, 0, 12)
orbit.enableDamping = true
orbit.dampingFactor = 0.05
orbit.minDistance = 2
orbit.maxDistance = 12
orbit.maxPolarAngle = Math.PI / 2
orbit.enabled = false
orbit.update()

// ── Museum Scene (lights + floor, no pedestal) ─────────────────────────────
const lights = buildMuseum(scene)

// ── Carousel (15 pedestals on circle R=12, fixed — camera moves instead) ──────
const N = 14, R = 12
const { slots, update: updateTween } = buildCarousel(scene, N, R)

// ── Camera controller — flies between exhibit viewpoints ───────────────────
const carouselCamera = new CarouselCamera(camera, orbit, N, R)

// ── Post-processing ────────────────────────────────────────────────────────
const { composer, bloom } = buildPostProcessing(renderer, scene, camera)

// ── Sparkle effect ─────────────────────────────────────────────────────────
const sparkle = new SparkleEffect(scene)

// ── Loading UI ─────────────────────────────────────────────────────────────
const loadingEl  = document.getElementById('loading')
const loadingBar = document.getElementById('loading-bar')
loadingBar.style.width = '10%'

// ── Load manifest + activate first exhibit ─────────────────────────────────
const BASE = import.meta.env.BASE_URL
fetch(`${BASE}models/exhibits/exhibits.yaml`)
  .then(r => r.text())
  .then(text => yaml.load(text))
  .then(async manifest => {
    const manager = new ExhibitManager(slots, manifest)

    await manager.loadAll((i, total) => {
      loadingBar.style.width = `${10 + 90 * (i + 1) / total}%`
    })
    manager.activeIndex = 0

    // Pre-warm the composer so its GPU buffers are initialized before first use.
    // Without this, the first composer.render() call has uninitialized bloom buffers
    // which cause a yellow/dim tint on the first "Bring to Life".
    bloom.strength = 0
    composer.render()
    renderer.render(scene, camera)  // restore plain render

    loadingEl.style.opacity = '0'
    setTimeout(() => { loadingEl.style.display = 'none' }, 800)

    // ── Page manager (landing ↔ demo transitions) ─────────────────────
    const pageManager = new PageManager(camera, orbit, carouselCamera, manager)

    // ── Controls ───────────────────────────────────────────────────────
    let needsBloom = false
    const { updateUI, resetActiveToStatic } = setupControls({
      lights,
      bloom,
      manager,
      carouselCamera,
      manifest,
      onAlive: () => {
        needsBloom = true
        // Sparkle around the active exhibit's world position
        const { target } = carouselCamera.viewForSlot(manager.activeIndex)
        sparkle.startContinuous(new THREE.Vector3(target.x, 1.6, target.z))
      },
      onResetBloom: () => { needsBloom = false; bloom.strength = 0; sparkle.stopContinuous() },
    })
    updateUI()

    // Reset exhibit to static when leaving demo
    pageManager._onLeaveDemo = resetActiveToStatic

    // ── Render loop ───────────────────────────────────────────────────
    const clock = new THREE.Clock()

    function animate() {
      requestAnimationFrame(animate)
      const delta = clock.getDelta()
      pageManager.update(delta)
      carouselCamera.update(delta)          // advance camera fly (calls orbit.update on completion)
      if (!carouselCamera.flying && pageManager.state === 'demo') orbit.update()
      updateTween(delta)
      manager.update(delta)

      const { updatePredFloor, updateBonesFloor } = manager.getFloorTracker()
      updatePredFloor()
      updateBonesFloor()
      sparkle.update(delta)

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
