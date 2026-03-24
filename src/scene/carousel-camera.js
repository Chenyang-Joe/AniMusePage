import * as THREE from 'three'
import { Debug } from '../utils/debug.js'

const TWO_PI = Math.PI * 2

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/**
 * Controls the camera to "fly" between exhibit viewpoints instead of rotating
 * the carousel. Each slot has a fixed world position; the camera moves to face it.
 *
 * Slot world positions (with carouselGroup.rotation.y = 0):
 *   slot[i] world = (R·sin(θ), 0, R − R·cos(θ))  where θ = i·2π/N
 *
 * Camera position for slot i:
 *   camPos = (R/2·sin(θ), 3.5, R − R/2·cos(θ))   — between circle center and exhibit
 *   target = (R·sin(θ), 2.0, R − R·cos(θ))        — exhibit center at mid-height
 */
export class CarouselCamera {
  constructor(camera, orbit, N = 15, R = 12) {
    this._camera = camera
    this._orbit  = orbit
    this.N = N
    this.R = R
    this._flying = false
    this._t      = 1
    this._from   = { camPos: new THREE.Vector3(), target: new THREE.Vector3() }
    this._to     = { camPos: new THREE.Vector3(), target: new THREE.Vector3() }
    this._onDone = null
    this.SPEED   = 1.0   // tween duration ≈ 1/SPEED seconds
  }

  // Returns the ideal camera position and orbit target for slot i.
  viewForSlot(i) {
    const θ = i * TWO_PI / this.N
    const R = this.R
    return {
      camPos: new THREE.Vector3(R / 2 * Math.sin(θ), 3.5, R - R / 2 * Math.cos(θ)),
      target: new THREE.Vector3(R * Math.sin(θ),      2.0, R - R * Math.cos(θ)),
    }
  }

  // Smoothly fly camera to face slot i; calls onComplete when the tween finishes.
  flyTo(index, onComplete) {
    const view = this.viewForSlot(index)
    this._from.camPos.copy(this._camera.position)
    this._from.target.copy(this._orbit.target)
    this._to.camPos.copy(view.camPos)
    this._to.target.copy(view.target)
    this._t      = 0
    this._flying = true
    this._orbit.enabled = false
    this._onDone = onComplete ?? null
    Debug.log('camera',
      `flyTo ${index} |` +
      ` camPos=(${view.camPos.x.toFixed(1)},${view.camPos.y.toFixed(1)},${view.camPos.z.toFixed(1)})` +
      ` target=(${view.target.x.toFixed(1)},${view.target.z.toFixed(1)})`)
  }

  get flying() { return this._flying }

  // Call every frame. Advances the tween; re-enables orbit on completion.
  update(delta) {
    if (!this._flying) return
    this._t = Math.min(this._t + delta * this.SPEED, 1)
    const ease = easeInOut(this._t)

    this._camera.position.lerpVectors(this._from.camPos, this._to.camPos, ease)
    this._orbit.target.lerpVectors(this._from.target, this._to.target, ease)
    this._camera.lookAt(this._orbit.target)

    if (this._t >= 1) {
      this._flying = false
      this._orbit.enabled = true
      this._orbit.update()   // sync internal spherical state to new position/target
      if (this._onDone) { this._onDone(); this._onDone = null }
    }
  }
}
