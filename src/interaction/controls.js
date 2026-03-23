// Animation state machine + UI event bindings

export function setupControls({ lights, bloom, predModel, predAction, predMixer,
  bonesModel, bonesAction, bonesMixer, onAlive }) {

  const btnLife = document.getElementById('btn-life')
  const toggleView = document.getElementById('toggle-view')
  const btnMesh = document.getElementById('btn-mesh')
  const btnBones = document.getElementById('btn-bones')
  const flash = document.getElementById('flash')

  let alive = false
  let showingBones = false

  // Sync mixer time across both models
  function syncTime(seconds) {
    if (predAction) predAction.time = seconds % (predAction.getClip().duration || 1)
    if (bonesAction) bonesAction.time = seconds % (bonesAction.getClip().duration || 1)
  }

  // ── Bring to Life ──────────────────────────────────────────────────────
  btnLife.addEventListener('click', () => {
    if (alive) return
    alive = true
    btnLife.disabled = true

    // Signal main loop to switch to composer render (bloom)
    if (onAlive) onAlive()

    // 1. CSS flash
    flash.style.transition = 'opacity 0.05s ease-in'
    flash.style.opacity = '1'
    setTimeout(() => {
      flash.style.transition = 'opacity 0.6s ease-out'
      flash.style.opacity = '0'
    }, 80)

    // 2. Bloom pulse
    let t = 0
    const pulse = setInterval(() => {
      t += 0.05
      bloom.strength = Math.max(0, 3.5 * Math.exp(-t * 3))
      if (t > 2) {
        bloom.strength = 0.4  // settle at a gentle ambient bloom
        clearInterval(pulse)
      }
    }, 16)

    // 3. Start animations
    if (predAction) { predAction.reset(); predAction.play() }
    if (bonesAction) { bonesAction.reset(); bonesAction.play() }

    // 4. Brighten lights (decay=0, so these values are direct intensities)
    animateLightIntensity(lights.spotKey, 3.5, 1200)
    animateLightIntensity(lights.spotRim, 1.2, 1200)
    animateLightIntensity(lights.pointFill, 1.0, 1200)
    animateLightIntensity(lights.ambientLight, 0.35, 1200)

    // 5. Show toggle
    setTimeout(() => {
      toggleView.style.display = 'flex'
      btnLife.textContent = 'Alive'
    }, 800)
  })

  // ── Toggle mesh / bones ────────────────────────────────────────────────
  btnMesh.addEventListener('click', () => {
    if (!showingBones) return
    showingBones = false
    btnMesh.classList.add('active')
    btnBones.classList.remove('active')

    // Map normalized time from bones → GT so they show the same frame
    if (bonesAction && predAction) {
      const norm = bonesAction.time / (bonesAction.getClip().duration || 1)
      predAction.time = norm * (predAction.getClip().duration || 1)
    }
    predModel.visible = true
    bonesModel.visible = false
  })

  btnBones.addEventListener('click', () => {
    if (showingBones) return
    showingBones = true
    btnBones.classList.add('active')
    btnMesh.classList.remove('active')

    // Map normalized time from GT → bones so they show the same frame
    if (predAction && bonesAction) {
      const norm = predAction.time / (predAction.getClip().duration || 1)
      bonesAction.time = norm * (bonesAction.getClip().duration || 1)
    }
    bonesModel.visible = true
    predModel.visible = false
  })

  // Returns mixer update function for the render loop
  return function updateMixers(delta) {
    if (!alive) return
    if (!showingBones) predMixer.update(delta)
    else bonesMixer.update(delta)
  }
}

function animateLightIntensity(light, target, durationMs) {
  const start = light.intensity
  const startTime = performance.now()
  function step() {
    const p = Math.min((performance.now() - startTime) / durationMs, 1)
    light.intensity = start + (target - start) * easeOut(p)
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3) }
