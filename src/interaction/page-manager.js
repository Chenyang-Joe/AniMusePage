import * as THREE from 'three'

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

const OVERHEAD = {
  camPos: new THREE.Vector3(0, 25, 12),
  target: new THREE.Vector3(0, 0, 12),
}

const FLY_SPEED = 0.7

export class PageManager {
  constructor(camera, orbit, carouselCamera, manager) {
    this._camera = camera
    this._orbit  = orbit
    this._cc     = carouselCamera
    this._manager = manager

    this.state   = 'landing'  // 'landing' | 'flying' | 'demo'
    this._onLeaveDemo = null

    this._t      = 1
    this._from   = { camPos: new THREE.Vector3(), target: new THREE.Vector3() }
    this._to     = { camPos: new THREE.Vector3(), target: new THREE.Vector3() }
    this._onDone = null
    this._queue  = []  // chained flight phases

    this._landingEl    = document.getElementById('landing-page')
    this._controlsEl   = document.getElementById('controls')
    this._exhibitInfo  = document.getElementById('exhibit-info')
    this._btnBack      = document.getElementById('btn-back-overview')
    this._btnAbstract  = document.getElementById('btn-abstract')
    this._abstractPage = document.getElementById('abstract-page')
    this._btnCloseAbs  = document.getElementById('btn-close-abstract')

    this._onWheel = this._onWheel.bind(this)
    this._onTouchStart = this._onTouchStart.bind(this)
    this._onTouchMove = this._onTouchMove.bind(this)
    this._touchStartY = 0

    window.addEventListener('wheel', this._onWheel, { passive: false })
    window.addEventListener('touchstart', this._onTouchStart, { passive: true })
    window.addEventListener('touchmove', this._onTouchMove, { passive: false })

    this._btnBack.addEventListener('click', () => this.flyToLanding())
    this._btnAbstract.addEventListener('click', () => this._showAbstract())
    this._btnCloseAbs.addEventListener('click', () => this._hideAbstract())

    this._setOverheadCamera()
    this._orbit.enabled = false
    this._showLanding()
  }

  _setOverheadCamera() {
    this._camera.position.copy(OVERHEAD.camPos)
    this._orbit.target.copy(OVERHEAD.target)
    this._camera.lookAt(OVERHEAD.target)
  }

  _setEl(el, visible) {
    el.style.opacity = visible ? '1' : '0'
    el.style.pointerEvents = visible ? 'auto' : 'none'
  }

  _showLanding() {
    this._setEl(this._landingEl, true)
    this._setEl(this._controlsEl, false)
    this._setEl(this._exhibitInfo, false)
    this._setEl(this._btnBack, false)
    this._setEl(this._btnAbstract, false)
  }

  _showDemo() {
    this._setEl(this._landingEl, false)
    this._setEl(this._abstractPage, false)
    this._setEl(this._controlsEl, true)
    this._setEl(this._exhibitInfo, true)
    this._setEl(this._btnBack, true)
    this._setEl(this._btnAbstract, true)
  }

  _showAbstract() {
    if (this.state !== 'demo') return
    this._setEl(this._abstractPage, true)
    this._setEl(this._controlsEl, false)
    this._setEl(this._exhibitInfo, false)
    this._setEl(this._btnBack, false)
    this._setEl(this._btnAbstract, false)
  }

  _hideAbstract() {
    this._setEl(this._abstractPage, false)
    this._setEl(this._controlsEl, true)
    this._setEl(this._exhibitInfo, true)
    this._setEl(this._btnBack, true)
    this._setEl(this._btnAbstract, true)
  }

  // Start a flight; if queue has entries, they chain automatically
  _startFly(fromCam, fromTgt, toCam, toTgt, speed, onDone) {
    this._from.camPos.copy(fromCam)
    this._from.target.copy(fromTgt)
    this._to.camPos.copy(toCam)
    this._to.target.copy(toTgt)
    this._flySpeed = speed
    this._t = 0
    this._onDone = onDone
  }

  _onWheel(e) {
    if (this.state === 'landing' && e.deltaY > 30) {
      e.preventDefault()
      this.flyToDemo()
    }
  }

  _onTouchStart(e) {
    this._touchStartY = e.touches[0].clientY
  }

  _onTouchMove(e) {
    if (this.state !== 'landing') return
    const dy = this._touchStartY - e.touches[0].clientY
    if (dy > 50) {
      e.preventDefault()
      this.flyToDemo()
    }
  }

  flyToDemo() {
    if (this.state !== 'landing') return
    this.state = 'flying'

    const slot0 = this._cc.viewForSlot(0)
    const activeIdx = this._manager.activeIndex

    this._landingEl.style.opacity = '0'
    this._landingEl.style.pointerEvents = 'none'

    // Phase 1: descend from overhead to slot 0
    this._startFly(
      this._camera.position, this._orbit.target,
      slot0.camPos, slot0.target,
      FLY_SPEED,
      () => {
        if (activeIdx === 0) {
          this.state = 'demo'
          this._orbit.enabled = true
          this._orbit.update()
          this._showDemo()
          return
        }
        // Phase 2: fly from slot 0 to the previously active exhibit
        const view = this._cc.viewForSlot(activeIdx)
        this._startFly(
          slot0.camPos, slot0.target,
          view.camPos, view.target,
          1.0,
          () => {
            this.state = 'demo'
            this._orbit.enabled = true
            this._orbit.update()
            this._showDemo()
          }
        )
      }
    )
  }

  flyToLanding() {
    if (this.state !== 'demo') return
    this.state = 'flying'

    if (this._onLeaveDemo) this._onLeaveDemo()
    this._orbit.enabled = false

    // Fade out demo UI immediately
    this._controlsEl.style.opacity = '0'
    this._controlsEl.style.pointerEvents = 'none'
    this._exhibitInfo.style.opacity = '0'
    this._btnBack.style.opacity = '0'
    this._btnBack.style.pointerEvents = 'none'

    // Phase 1: fly to slot 0 view
    const slot0 = this._cc.viewForSlot(0)
    this._startFly(
      this._camera.position, this._orbit.target,
      slot0.camPos, slot0.target,
      1.0,
      () => {
        // Phase 2: straight up to overhead
        this._startFly(
          slot0.camPos, slot0.target,
          OVERHEAD.camPos, OVERHEAD.target,
          FLY_SPEED,
          () => {
            this.state = 'landing'
            this._showLanding()
          }
        )
      }
    )
  }

  update(delta) {
    if (this.state !== 'flying') return
    this._t = Math.min(this._t + delta * (this._flySpeed || FLY_SPEED), 1)
    const ease = easeInOut(this._t)

    this._camera.position.lerpVectors(this._from.camPos, this._to.camPos, ease)
    this._orbit.target.lerpVectors(this._from.target, this._to.target, ease)
    this._camera.lookAt(this._orbit.target)

    if (this._t >= 1) {
      if (this._onDone) { const cb = this._onDone; this._onDone = null; cb() }
    }
  }
}
