import * as THREE from 'three'
import { buildPedestal } from './museum.js'

/**
 * Staggered gallery layout — 15 pedestals at fixed world positions.
 *
 * Layout: 5 rows, front (z≈+1) to back (z≈-11), x spread widens in
 * middle rows. Column heights vary for "高低错落" visual rhythm.
 *
 * Returns:
 *   slots[i]      — { group, plateMat, pedestalTopY, position }
 *   hitObjects    — invisible click-boxes (each has userData.slotIndex)
 */

// prettier-ignore
const SLOT_DEFS = [
  // Row 0 — single front hero
  { x:  0.0, z:  1.0, columnHeight: 1.7 },
  // Row 1 — two flankers
  { x: -3.5, z: -1.5, columnHeight: 0.8 },
  { x:  4.0, z: -1.5, columnHeight: 1.3 },
  // Row 2 — four, widest spread
  { x: -7.0, z: -4.5, columnHeight: 1.5 },
  { x: -2.0, z: -5.0, columnHeight: 2.0 },
  { x:  3.0, z: -4.5, columnHeight: 0.7 },
  { x:  7.5, z: -5.0, columnHeight: 1.9 },
  // Row 3 — three
  { x: -5.5, z: -8.0, columnHeight: 2.1 },
  { x:  0.5, z: -8.5, columnHeight: 0.9 },
  { x:  5.5, z: -8.0, columnHeight: 1.4 },
  // Row 4 — five back row
  { x: -8.5, z:-11.0, columnHeight: 1.0 },
  { x: -3.5, z:-11.5, columnHeight: 1.6 },
  { x:  1.0, z:-11.0, columnHeight: 2.2 },
  { x:  5.5, z:-11.5, columnHeight: 0.8 },
  { x:  9.5, z:-10.5, columnHeight: 1.3 },
]

export function buildGallery(scene) {
  const slots      = []
  const hitObjects = []

  SLOT_DEFS.forEach(({ x, z, columnHeight }, i) => {
    const { group, plateMat, pedestalTopY } = buildPedestal({ columnHeight })
    group.position.set(x, 0, z)
    scene.add(group)

    // Invisible hit-box covering pedestal + exhibit space above it
    const hitH  = pedestalTopY + 2.5
    const hitGeo = new THREE.BoxGeometry(2.2, hitH, 2.2)
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    const hitBox = new THREE.Mesh(hitGeo, hitMat)
    hitBox.position.y = hitH / 2
    hitBox.userData.slotIndex = i
    group.add(hitBox)
    hitObjects.push(hitBox)

    slots.push({
      group,
      plateMat,
      pedestalTopY,
      position: new THREE.Vector3(x, 0, z),
    })
  })

  return { slots, hitObjects }
}
