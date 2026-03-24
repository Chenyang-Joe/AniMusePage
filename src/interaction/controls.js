import * as THREE from 'three'
import { Debug } from '../utils/debug.js'

// Light intensities for static vs alive states
const STATIC_LIGHTS = { spotKey: 2.5, spotRim: 0.8, pointFill: 0.6, ambientLight: 0.5 }
const ALIVE_LIGHTS  = { spotKey: 4.0, spotRim: 1.2, pointFill: 1.0, ambientLight: 0.6 }

export function setupControls({
  camera, renderer,
  lights, bloom,
  manager, gallery, cameraController,
  onAlive, onResetBloom,
}) {
  const btnLife    = document.getElementById('btn-life')
  const btnPrev    = document.getElementById('btn-prev')
  const btnNext    = document.getElementById('btn-next')
  const toggleView = document.getElementById('toggle-view')
  const btnMesh    = document.getElementById('btn-mesh')
  const btnBones   = document.getElementById('btn-bones')
  const flash      = document.getElementById('flash')

  const raycaster = new THREE.Raycaster()
  const _mouse    = new THREE.Vector2()
  let navigating  = false
  const N         = manager.N

  // ── Move spotlights to follow a slot ───────────────────────────────────
  function moveSpotlights(pos, topY) {
    lights.spotKey.position.set(pos.x + 2, topY + 7, pos.z + 3)
    lights.spotKey.target.position.set(pos.x, topY + 0.6, pos.z)
    lights.spotRim.position.set(pos.x - 3, topY + 5, pos.z - 4)
    lights.spotRim.target.position.set(pos.x, topY + 0.6, pos.z)
    lights.pointFill.position.set(pos.x - 3, topY + 3, pos.z + 2)
  }

  // ── UI sync ────────────────────────────────────────────────────────────
  function updateUI() {
    const ex = manager.getActive()
    if (!ex || ex.status !== 'loaded') {
      btnLife.disabled = true
      btnLife.textContent = '✦ Bring Static Exhibition to Life'
      toggleView.style.display = 'none'
      return
    }

    if (ex.alive) {
      btnLife.textContent = 'Alive'
      btnLife.disabled = true
      toggleView.style.display = 'flex'
    } else {
      btnLife.textContent = '✦ Bring Static Exhibition to Life'
      btnLife.disabled = false
      toggleView.style.display = 'none'
    }

    btnMesh.classList.toggle('active', !ex.showingBones)
    btnBones.classList.toggle('active',  ex.showingBones)
  }

  // ── Bring to Life ──────────────────────────────────────────────────────
  btnLife.addEventListener('click', () => {
    const ex = manager.getActive()
    if (!ex || ex.status !== 'loaded' || ex.alive) return
    ex.alive = true

    if (onAlive) onAlive()

    // Subtle warm amber shimmer
    flash.style.backgroundColor = 'rgba(255, 180, 50, 1)'
    flash.style.transition = 'opacity 0.15s ease-in'
    flash.style.opacity = '0.25'
    setTimeout(() => {
      flash.style.transition = 'opacity 1.2s ease-out'
      flash.style.opacity = '0'
    }, 200)

    // Bloom pulse
    let t = 0
    const pulse = setInterval(() => {
      t += 0.05
      bloom.strength = Math.max(0, 3.5 * Math.exp(-t * 3))
      if (t > 2) { bloom.strength = 0.4; clearInterval(pulse) }
    }, 16)

    // Start animations
    if (ex.predAction) { ex.predAction.reset(); ex.predAction.play() }
    if (ex.bonesAction) { ex.bonesAction.reset(); ex.bonesAction.play() }

    // Brighten lights
    animateLightIntensity(lights.spotKey,     ALIVE_LIGHTS.spotKey,     1200)
    animateLightIntensity(lights.spotRim,     ALIVE_LIGHTS.spotRim,     1200)
    animateLightIntensity(lights.pointFill,   ALIVE_LIGHTS.pointFill,   1200)
    animateLightIntensity(lights.ambientLight, ALIVE_LIGHTS.ambientLight, 1200)

    setTimeout(() => updateUI(), 800)
  })

  // ── Mesh / Bones toggle ────────────────────────────────────────────────
  btnMesh.addEventListener('click', () => {
    const ex = manager.getActive()
    if (!ex || !ex.alive || !ex.showingBones) return
    ex.showingBones = false
    if (ex.bonesAction && ex.predAction) {
      const norm = ex.bonesAction.time / (ex.bonesAction.getClip().duration || 1)
      ex.predAction.time = norm * (ex.predAction.getClip().duration || 1)
    }
    ex.predModel.visible = true
    ex.bonesModel.visible = false
    updateUI()
  })

  btnBones.addEventListener('click', () => {
    const ex = manager.getActive()
    if (!ex || !ex.alive || ex.showingBones) return
    ex.showingBones = true
    if (ex.predAction && ex.bonesAction) {
      const norm = ex.predAction.time / (ex.predAction.getClip().duration || 1)
      ex.bonesAction.time = norm * (ex.bonesAction.getClip().duration || 1)
    }
    ex.bonesModel.visible = true
    ex.predModel.visible = false
    updateUI()
  })

  // ── Navigation ─────────────────────────────────────────────────────────
  function navigate(nextIdx) {
    if (navigating) return
    navigating = true

    const prevIdx = manager.activeIndex
    if (prevIdx === nextIdx) { navigating = false; return }

    // Reset previous exhibit
    const prevEx = manager.exhibits[prevIdx]
    if (prevEx.alive) {
      prevEx.predAction?.stop()
      prevEx.bonesAction?.stop()
      prevEx.alive = false
    }
    if (prevEx.predModel)  prevEx.predModel.visible = true
    if (prevEx.bonesModel) prevEx.bonesModel.visible = false
    prevEx.showingBones = false

    if (onResetBloom) onResetBloom()

    // Restore static lighting
    animateLightIntensity(lights.spotKey,     STATIC_LIGHTS.spotKey,     600)
    animateLightIntensity(lights.spotRim,     STATIC_LIGHTS.spotRim,     600)
    animateLightIntensity(lights.pointFill,   STATIC_LIGHTS.pointFill,   600)
    animateLightIntensity(lights.ambientLight, STATIC_LIGHTS.ambientLight, 600)

    // Move spotlights to new exhibit immediately
    const slot = gallery.slots[nextIdx]
    moveSpotlights(slot.position, slot.pedestalTopY)

    Debug.log('controls', `navigate ${prevIdx} → ${nextIdx}`)

    btnPrev.disabled = true
    btnNext.disabled = true
    updateUI()

    // Fly camera; activate when arrived
    cameraController.flyTo(nextIdx, () => {
      navigating = false
      btnPrev.disabled = false
      btnNext.disabled = false
      manager.activate(nextIdx).then(() => updateUI())
    })
  }

  btnPrev.addEventListener('click', () => navigate(((manager.activeIndex - 1) % N + N) % N))
  btnNext.addEventListener('click', () => navigate((manager.activeIndex + 1) % N))

  // ── Click-to-select on pedestal hit boxes ─────────────────────────────
  renderer.domElement.addEventListener('click', event => {
    if (navigating) return
    _mouse.x =  (event.clientX / window.innerWidth)  * 2 - 1
    _mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(_mouse, camera)
    const hits = raycaster.intersectObjects(gallery.hitObjects, false)
    if (hits.length > 0) {
      const idx = hits[0].object.userData.slotIndex
      if (idx !== undefined && idx !== manager.activeIndex) navigate(idx)
    }
  })

  // ── Initialize spotlights for slot 0 ──────────────────────────────────
  const s0 = gallery.slots[0]
  moveSpotlights(s0.position, s0.pedestalTopY)

  updateUI()
  return { updateUI }
}

function animateLightIntensity(light, target, durationMs) {
  const start     = light.intensity
  const startTime = performance.now()
  function step() {
    const p = Math.min((performance.now() - startTime) / durationMs, 1)
    light.intensity = start + (target - start) * easeOut(p)
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3) }
