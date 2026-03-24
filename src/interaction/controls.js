import { Debug } from '../utils/debug.js'

// Light intensities for static vs alive states.
const STATIC_LIGHTS = { spotKey: 3.0, spotRim: 0.5, pointFill: 0.3, ambientLight: 0.7, ceil: 2.0 }
const ALIVE_LIGHTS  = { spotKey: 2.2, spotRim: 0.5, pointFill: 0.3, ambientLight: 0.7, ceil: 2.0 }

export function setupControls({ lights, bloom, manager, carouselCamera, manifest, onAlive, onResetBloom }) {
  const btnLife    = document.getElementById('btn-life')
  const btnPrev    = document.getElementById('btn-prev')
  const btnNext    = document.getElementById('btn-next')
  const toggleView = document.getElementById('toggle-view')
  const btnMesh    = document.getElementById('btn-mesh')
  const btnBones   = document.getElementById('btn-bones')
  const flash      = document.getElementById('flash')
  const dotNav     = document.getElementById('dot-nav')
  const infoState  = document.querySelector('#exhibit-info .state')
  const infoSpecies = document.querySelector('#exhibit-info .species')
  const infoAction  = document.querySelector('#exhibit-info .action')
  const infoEl      = document.getElementById('exhibit-info')

  let navigating = false

  // ── Build dot indicators ──────────────────────────────────────────────
  const dots = []
  for (let i = 0; i < manager.N; i++) {
    const dot = document.createElement('button')
    dot.className = 'dot'
    dot.addEventListener('click', () => navigateTo(i))
    dotNav.appendChild(dot)
    dots.push(dot)
  }

  // ── UI sync ───────────────────────────────────────────────────────────
  function updateUI() {
    const ex = manager.getActive()
    const idx = manager.activeIndex
    const meta = manifest[idx]

    // Dots
    dots.forEach((d, i) => d.classList.toggle('active', i === idx))

    // Exhibit info overlay
    if (meta) {
      infoSpecies.textContent = meta.animal
      infoAction.textContent = meta.action
    }

    if (!ex || ex.status !== 'loaded') {
      btnLife.disabled = true
      btnLife.textContent = 'Bring to Life'
      toggleView.style.display = 'none'
      infoState.innerHTML = '<strong>Day</strong> at the Museum'
      return
    }

    if (ex.alive) {
      btnLife.textContent = 'Return to Static'
      btnLife.disabled = false
      toggleView.style.display = 'flex'
      infoState.innerHTML = '<strong>Night</strong> at the Museum'
      infoEl.classList.add('night')
    } else {
      btnLife.textContent = 'Bring to Life'
      btnLife.disabled = false
      toggleView.style.display = 'none'
      infoState.innerHTML = '<strong>Day</strong> at the Museum'
      infoEl.classList.remove('night')
    }

    btnMesh.classList.toggle('active', !ex.showingBones)
    btnBones.classList.toggle('active',  ex.showingBones)
  }

  // ── Reset camera to default viewpoint for current slot ────────────────
  function resetCamera() {
    carouselCamera.flyTo(manager.activeIndex, null)
  }

  // ── Reset exhibit to static ───────────────────────────────────────────
  function resetToStatic(ex) {
    if (!ex || !ex.alive) return
    ex.predAction?.stop()
    ex.bonesAction?.stop()
    ex.alive = false
    if (ex.predModel)  ex.predModel.visible = true
    if (ex.bonesModel) ex.bonesModel.visible = false
    ex.showingBones = false

    if (onResetBloom) onResetBloom()

    // Restore static lighting
    animateLightIntensity(lights.spotKey,     STATIC_LIGHTS.spotKey,     600)
    animateLightIntensity(lights.spotRim,     STATIC_LIGHTS.spotRim,     600)
    animateLightIntensity(lights.pointFill,   STATIC_LIGHTS.pointFill,   600)
    animateLightIntensity(lights.ambientLight, STATIC_LIGHTS.ambientLight, 600)
    lights.ceilLights?.forEach(l => animateLightIntensity(l, STATIC_LIGHTS.ceil, 600))
  }

  // ── Bring to Life / Return to Static ──────────────────────────────────
  btnLife.addEventListener('click', () => {
    const ex = manager.getActive()
    if (!ex || ex.status !== 'loaded') return

    // Return to static
    if (ex.alive) {
      resetToStatic(ex)
      updateUI()
      return
    }

    // Bring to life
    ex.alive = true
    if (onAlive) onAlive()

    flash.style.backgroundColor = 'rgba(255, 255, 255, 1)'
    flash.style.transition = 'opacity 0.15s ease-in'
    flash.style.opacity = '0.25'
    setTimeout(() => {
      flash.style.transition = 'opacity 1.2s ease-out'
      flash.style.opacity = '0'
    }, 200)

    let t = 0
    const pulse = setInterval(() => {
      t += 0.05
      bloom.strength = Math.max(0, 2.5 * Math.exp(-t * 2.5))
      if (t > 2.5) { bloom.strength = 0.4; clearInterval(pulse) }
    }, 16)

    if (ex.predAction) { ex.predAction.reset(); ex.predAction.play() }
    if (ex.bonesAction) { ex.bonesAction.reset(); ex.bonesAction.play() }

    animateLightIntensity(lights.spotKey,     ALIVE_LIGHTS.spotKey,     1200)
    animateLightIntensity(lights.spotRim,     ALIVE_LIGHTS.spotRim,     1200)
    animateLightIntensity(lights.pointFill,   ALIVE_LIGHTS.pointFill,   1200)
    animateLightIntensity(lights.ambientLight, ALIVE_LIGHTS.ambientLight, 1200)
    lights.ceilLights?.forEach(l => animateLightIntensity(l, ALIVE_LIGHTS.ceil, 1200))

    updateUI()
  })

  // ── Mesh / Bones toggle ───────────────────────────────────────────────
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

  // ── Navigation ────────────────────────────────────────────────────────
  function navigateTo(targetIdx) {
    if (navigating) return
    if (targetIdx === manager.activeIndex) return
    navigating = true

    const prevIdx = manager.activeIndex
    const N = manager.N

    // Reset previous exhibit
    resetToStatic(manager.exhibits[prevIdx])

    // Move spotlights to destination slot
    const { target: slotTarget } = carouselCamera.viewForSlot(targetIdx)
    const sx = slotTarget.x, sz = slotTarget.z
    const theta = targetIdx * Math.PI * 2 / N
    const inX = -Math.sin(theta), inZ = Math.cos(theta)
    const ltX = inZ, ltZ = -inX

    lights.spotKey.position.set(sx + inX*3 + ltX*2, 7, sz + inZ*3 + ltZ*2)
    lights.spotKey.target.position.set(sx, 1.8, sz)
    lights.spotKey.target.updateMatrixWorld()
    lights.spotRim.position.set(sx - inX*4 - ltX*3, 5, sz - inZ*4 - ltZ*3)
    lights.spotRim.target.position.set(sx, 1.8, sz)
    lights.spotRim.target.updateMatrixWorld()
    lights.pointFill.position.set(sx + inX*2 - ltX*3, 3, sz + inZ*2 - ltZ*3)

    animateLightIntensity(lights.spotKey,     STATIC_LIGHTS.spotKey,     600)
    animateLightIntensity(lights.spotRim,     STATIC_LIGHTS.spotRim,     600)
    animateLightIntensity(lights.pointFill,   STATIC_LIGHTS.pointFill,   600)
    animateLightIntensity(lights.ambientLight, STATIC_LIGHTS.ambientLight, 600)
    lights.ceilLights?.forEach(l => animateLightIntensity(l, STATIC_LIGHTS.ceil, 600))

    Debug.log('controls', `navigate prev=${prevIdx} → next=${targetIdx}`)

    setNavDisabled(true)
    updateUI()

    manager.activate(targetIdx).then(() => {
      if (!navigating) updateUI()
    })

    carouselCamera.flyTo(targetIdx, () => {
      navigating = false
      setNavDisabled(false)
      updateUI()
    })
  }

  function setNavDisabled(disabled) {
    btnPrev.disabled = disabled
    btnNext.disabled = disabled
    dots.forEach(d => { d.disabled = disabled })
  }

  btnPrev.addEventListener('click', () => {
    const next = ((manager.activeIndex - 1) % manager.N + manager.N) % manager.N
    navigateTo(next)
  })
  btnNext.addEventListener('click', () => {
    const next = (manager.activeIndex + 1) % manager.N
    navigateTo(next)
  })

  updateUI()

  function resetActiveToStatic() {
    const ex = manager.getActive()
    if (ex) {
      resetToStatic(ex)
      updateUI()
    }
  }

  return { updateUI, resetActiveToStatic, resetCamera }
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
