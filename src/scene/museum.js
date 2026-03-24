import * as THREE from 'three'

// Returns a standalone pedestal group + its nameplate material.
// The group is positioned at (0,0,0); caller places it in the scene/carousel.
export function buildPedestal() {
  const group = new THREE.Group()

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x6a6460,
    roughness: 0.75,
    metalness: 0.05,
  })

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.15, 32), stoneMat)
  base.receiveShadow = true
  base.castShadow = true
  group.add(base)

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.4, 32), stoneMat)
  column.position.y = 0.775
  column.receiveShadow = true
  column.castShadow = true
  group.add(column)

  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.75, 0.1, 32), stoneMat)
  top.position.y = 1.55
  top.receiveShadow = true
  top.castShadow = true
  group.add(top)

  const plateMat = new THREE.MeshStandardMaterial({ color: 0xb8943a, roughness: 0.4, metalness: 0.7 })
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.28, 0.04), plateMat)
  plate.position.set(0, 0.55, 0.66)
  group.add(plate)

  return { group, plateMat }
}

export function buildMuseum(scene) {
  // ── Background & Fog ───────────────────────────────────────────────────
  scene.background = new THREE.Color(0x0d0b10)
  scene.fog = new THREE.FogExp2(0x0d0b10, 0.045)

  // ── Floor (marble) ────────────────────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(30, 30)
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x4a4540,
    roughness: 0.25,
    metalness: 0.3,
  })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // ── Lights ────────────────────────────────────────────────────────────
  // Use decay=0 for all lights so intensity is direct and predictable.

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.25)
  scene.add(ambientLight)

  const hemi = new THREE.HemisphereLight(0x334466, 0x553311, 0.4)
  scene.add(hemi)

  // Key spotlight from above-front — main exhibit light (targets world origin)
  const spotKey = new THREE.SpotLight(0xfff5e0, 2.0, 0, Math.PI / 7, 0.35, 0)
  spotKey.position.set(2, 7, 3)
  spotKey.target.position.set(0, 1.8, 0)
  spotKey.castShadow = true
  spotKey.shadow.mapSize.width = 1024
  spotKey.shadow.mapSize.height = 1024
  spotKey.shadow.camera.near = 1
  spotKey.shadow.camera.far = 20
  spotKey.shadow.bias = -0.001
  scene.add(spotKey)
  scene.add(spotKey.target)

  // Rim light — blue from behind for depth
  const spotRim = new THREE.SpotLight(0x2244aa, 0.8, 0, Math.PI / 5, 0.6, 0)
  spotRim.position.set(-3, 5, -4)
  spotRim.target.position.set(0, 1.8, 0)
  scene.add(spotRim)
  scene.add(spotRim.target)

  // Warm fill — subtle from front-left
  const pointFill = new THREE.PointLight(0xcc8833, 0.6, 0, 0)
  pointFill.position.set(-3, 3, 2)
  scene.add(pointFill)

  return { spotKey, spotRim, pointFill, ambientLight, hemi }
}

export function setPlateLabel(plateMat, animal, action) {
  const W = 700, H = 140
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#7a5c1e'
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = '#c9a84c'
  ctx.lineWidth = 3
  ctx.strokeRect(8, 8, W - 16, H - 16)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 38px Georgia, serif'

  ctx.fillStyle = '#f0d88a'
  ctx.fillText(animal.toUpperCase(), W / 2, H * 0.34)

  ctx.fillStyle = '#f0d88a'
  ctx.fillText(action.toUpperCase(), W / 2, H * 0.72)

  const tex = new THREE.CanvasTexture(canvas)
  plateMat.map = tex
  plateMat.color.set(0xffffff)
  plateMat.needsUpdate = true
}
