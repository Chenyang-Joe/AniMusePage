import * as THREE from 'three'
import { buildPedestal } from './museum.js'
import { Debug } from '../utils/debug.js'

/**
 * Build a rotating carousel of N pedestals on a circle of radius R.
 *
 * Carousel math:
 *   carouselGroup.position = (0, 0, R)   ← pivot at world origin
 *   slot[i] local pos = (R·sin(i·2π/N),  0,  −R·cos(i·2π/N))
 *   To center slot i:  carouselGroup.rotation.y = i · (2π/N)
 *
 * Returns:
 *   carouselGroup  — THREE.Group, already added to scene
 *   slots[i]       — { group, plateMat }  (group is in carouselGroup space)
 *   rotateTo(i, onComplete)  — smooth tween to slot i
 *   update(delta)            — call every frame to advance the tween
 */
export function buildCarousel(scene, N, R) {
  const carouselGroup = new THREE.Group()
  carouselGroup.position.set(0, 0, R)
  scene.add(carouselGroup)

  const TWO_PI = Math.PI * 2
  const slots = []

  for (let i = 0; i < N; i++) {
    const angle = i * TWO_PI / N
    const { group } = buildPedestal()
    group.position.set(
      R * Math.sin(angle),
      0,
      -R * Math.cos(angle),
    )
    // Counter-rotate so that when carousel centers this slot (rotation.y = angle),
    // the slot's world rotation.y = angle + (-angle) = 0 → faces the camera.
    group.rotation.y = -angle
    carouselGroup.add(group)
    slots.push({ group })
  }

  // ── Smooth rotation tween ─────────────────────────────────────────────
  let tweenFrom = 0
  let tweenTo   = 0
  let tweenT    = 1        // 1 = idle, 0–1 = animating
  let onDone    = null
  const TWEEN_SPEED = 2.5  // higher = faster

  function rotateTo(index, onComplete) {
    const target = index * TWO_PI / N

    // Choose shortest angular path
    let delta = ((target - carouselGroup.rotation.y) % TWO_PI + TWO_PI) % TWO_PI
    if (delta > Math.PI) delta -= TWO_PI

    tweenFrom = carouselGroup.rotation.y
    tweenTo   = carouselGroup.rotation.y + delta
    tweenT    = 0
    onDone    = onComplete ?? null

    Debug.log('carousel', `rotate to index ${index} | rotation.y: ${tweenFrom.toFixed(3)} → ${tweenTo.toFixed(3)}`)
  }

  // Rotate by a specific angle (radians), ending back at rotation.y = 0
  function rotateBy(angle, onComplete) {
    tweenFrom = carouselGroup.rotation.y
    tweenTo   = tweenFrom + angle
    tweenT    = 0
    onDone    = () => {
      // Normalize back to 0 to avoid drift
      carouselGroup.rotation.y = 0
      if (onComplete) onComplete()
    }
  }

  function update(delta) {
    if (tweenT >= 1) return
    tweenT = Math.min(tweenT + delta * TWEEN_SPEED, 1)
    const ease = tweenT < 0.5
      ? 2 * tweenT * tweenT
      : 1 - Math.pow(-2 * tweenT + 2, 2) / 2   // ease-in-out quad
    carouselGroup.rotation.y = tweenFrom + (tweenTo - tweenFrom) * ease
    if (tweenT >= 1) {
      carouselGroup.rotation.y = tweenTo
      if (onDone) { onDone(); onDone = null }
    }
  }

  return { carouselGroup, slots, rotateTo, rotateBy, update }
}
