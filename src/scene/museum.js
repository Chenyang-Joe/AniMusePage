import * as THREE from 'three'

/**
 * Build a hexagonal pedestal with variable column height.
 * Returns { group, plateMat, pedestalTopY } where pedestalTopY is the
 * world-Y of the top cap surface (animals stand here).
 */
export function buildPedestal({ columnHeight = 1.4 } = {}) {
  const group = new THREE.Group()

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x6a6460,
    roughness: 0.75,
    metalness: 0.05,
  })

  // All cylinders use 6 segments → hexagonal cross-section
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.15, 6), stoneMat)
  base.receiveShadow = true
  base.castShadow = true
  group.add(base)

  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, columnHeight, 6), stoneMat)
  col.position.y = 0.075 + columnHeight / 2
  col.receiveShadow = true
  col.castShadow = true
  group.add(col)

  const topCapH = 0.1
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.75, topCapH, 6), stoneMat)
  top.position.y = 0.075 + columnHeight + topCapH / 2
  top.receiveShadow = true
  top.castShadow = true
  group.add(top)

  const plateMat = new THREE.MeshStandardMaterial({ color: 0xb8943a, roughness: 0.4, metalness: 0.7 })
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.28, 0.04), plateMat)
  // Position nameplate on front face of column at ~35% height
  plate.position.set(0, 0.075 + columnHeight * 0.38, 0.66)
  group.add(plate)

  // Top surface Y in world space (animals placed here)
  const pedestalTopY = 0.075 + columnHeight + topCapH

  return { group, plateMat, pedestalTopY }
}

export function buildMuseum(scene) {
  // ── Background & Fog ───────────────────────────────────────────────────
  scene.background = new THREE.Color(0x1a1510)
  scene.fog = new THREE.FogExp2(0x1a1510, 0.025)

  // ── Floor ─────────────────────────────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(60, 60)
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x3a3228,
    roughness: 0.5,
    metalness: 0.15,
  })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // ── Ceiling plane (visual) ─────────────────────────────────────────────
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({ color: 0x0e0b08 }),
  )
  ceil.rotation.x = Math.PI / 2
  ceil.position.y = 9
  scene.add(ceil)

  // ── Lights ────────────────────────────────────────────────────────────
  const ambientLight = new THREE.AmbientLight(0xfff4e0, 0.5)
  scene.add(ambientLight)

  const hemi = new THREE.HemisphereLight(0xffe8b0, 0x3a2510, 0.5)
  scene.add(hemi)

  // Ceiling grid — 6 warm PointLights to simulate gallery overhead lighting
  for (const [x, y, z] of [
    [-6, 8.5, -2], [0, 8.5, -2], [6, 8.5, -2],
    [-6, 8.5, -8], [0, 8.5, -8], [6, 8.5, -8],
  ]) {
    const pl = new THREE.PointLight(0xffd090, 1.2, 20, 1)
    pl.position.set(x, y, z)
    scene.add(pl)
  }

  // Key spotlight — will be repositioned per exhibit by controls
  const spotKey = new THREE.SpotLight(0xfff5e0, 2.5, 0, Math.PI / 7, 0.35, 0)
  spotKey.position.set(2, 7, 3)
  spotKey.target.position.set(0, 1.8, 0)
  spotKey.castShadow = true
  spotKey.shadow.mapSize.width = 1024
  spotKey.shadow.mapSize.height = 1024
  spotKey.shadow.camera.near = 1
  spotKey.shadow.camera.far = 25
  spotKey.shadow.bias = -0.001
  scene.add(spotKey)
  scene.add(spotKey.target)

  // Rim light
  const spotRim = new THREE.SpotLight(0x2244aa, 0.8, 0, Math.PI / 5, 0.6, 0)
  spotRim.position.set(-3, 5, -4)
  spotRim.target.position.set(0, 1.8, 0)
  scene.add(spotRim)
  scene.add(spotRim.target)

  // Warm fill
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
