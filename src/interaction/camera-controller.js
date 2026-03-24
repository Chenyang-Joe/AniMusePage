import * as THREE from 'three'

/**
 * Smooth camera fly-to for gallery slots.
 *
 * For each slot, the view is computed as:
 *   camPos  = (x, pedestalTopY + 2.0, z + 5.5)   — slightly above, in front
 *   target  = (x, pedestalTopY + 0.8, z)           — at mid-exhibit height
 *
 * Call update(delta) every frame. flyTo() starts a tween; it calls onComplete
 * when the camera arrives.
 */
export class CameraController {
  constructor(camera, orbit, slots) {
    this.camera = camera
    this.orbit  = orbit
    this.slots  = slots

    this._tweenFrom = null
    this._tweenTo   = null
    this._tweenT    = 1       // 1 = idle
    this._onDone    = null
    this.SPEED      = 1.6     // tween speed (higher = faster)
  }

  /** Returns { camPos, target } for a given slot index. */
  viewForSlot(slotIdx) {
    const slot = this.slots[slotIdx]
    const { x, z } = slot.position
    const topY = slot.pedestalTopY
    return {
      camPos: new THREE.Vector3(x, topY + 2.0, z + 5.5),
      target: new THREE.Vector3(x, topY + 0.8, z),
    }
  }

  /** Start a camera fly to slot slotIdx. onComplete fires when arrived. */
  flyTo(slotIdx, onComplete) {
    const { camPos, target } = this.viewForSlot(slotIdx)
    this._tweenFrom = {
      camPos: this.camera.position.clone(),
      target: this.orbit.target.clone(),
    }
    this._tweenTo = { camPos, target }
    this._tweenT  = 0
    this._onDone  = onComplete ?? null
  }

  /** Call every frame. Returns true while a tween is in progress. */
  update(delta) {
    if (this._tweenT >= 1) return false
    this._tweenT = Math.min(this._tweenT + delta * this.SPEED, 1)
    const t = easeInOut(this._tweenT)
    this.camera.position.lerpVectors(this._tweenFrom.camPos, this._tweenTo.camPos, t)
    this.orbit.target.lerpVectors(this._tweenFrom.target, this._tweenTo.target, t)
    this.orbit.update()
    if (this._tweenT >= 1) {
      if (this._onDone) { this._onDone(); this._onDone = null }
    }
    return true
  }
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}
