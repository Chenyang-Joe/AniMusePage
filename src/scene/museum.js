import * as THREE from 'three'

// Returns a standalone pedestal group + its nameplate material.
// The group is positioned at (0,0,0); caller places it in the scene/carousel.
export function buildPedestal() {
  const group = new THREE.Group()

  // Light marble/stone — reads clearly against a bright white gallery
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xd0ccc4,
    roughness: 0.55,
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

  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.0, 0.1, 32), stoneMat)
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
  // Warm light grey — feels like a real gallery room rather than a black void
  scene.background = new THREE.Color(0xe0dcd6)
  scene.fog = new THREE.FogExp2(0xe0dcd6, 0.012)

  // ── Floor (polished marble) ────────────────────────────────────────────
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xd4d0c8,
    roughness: 0.4,
    metalness: 0.15,
  })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, 12)
  floor.receiveShadow = true
  scene.add(floor)

  // ── Octagonal gallery walls ────────────────────────────────────────────
  // Regular octagon centered at (0, 12) in XZ, apothem D=38 (distance from
  // center to each wall face).  Side length = 2D·tan(π/8) ≈ 31.5 units.
  // rotation.y for each wall: PlaneGeometry default normal is +Z; rotating by α
  // gives normal (sin α, 0, cos α), so each wall faces the octagon interior.
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xeae6e0,
    roughness: 0.85,
    metalness: 0.0,
  })
  const D    = 38
  const S2   = Math.SQRT2
  const SIDE = Math.ceil(2 * D * Math.tan(Math.PI / 8))  // ≈ 31
  const CX = 0, CZ = 12

  // [dx, dz, rotation.y]  — dx/dz are offsets from carousel center (0, 12)
  for (const [dx, dz, ry] of [
    [ 0,      -D,        0             ],  // back   (behind slot 0)
    [-D/S2,   -D/S2,     Math.PI / 4   ],  // back-left
    [-D,       0,        Math.PI / 2   ],  // left
    [-D/S2,    D/S2,     3*Math.PI / 4 ],  // front-left
    [ 0,       D,        Math.PI       ],  // front  (beyond far exhibits)
    [ D/S2,    D/S2,    -3*Math.PI / 4 ],  // front-right
    [ D,       0,       -Math.PI / 2   ],  // right
    [ D/S2,   -D/S2,    -Math.PI / 4   ],  // back-right
  ]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(SIDE, 14), wallMat)
    wall.position.set(CX + dx, 7, CZ + dz)
    wall.rotation.y = ry
    wall.receiveShadow = true
    scene.add(wall)
  }

  // Ceiling
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0xf0ece7, roughness: 1.0, metalness: 0 }),
  )
  ceil.rotation.x = Math.PI / 2
  ceil.position.set(0, 10, 12)
  scene.add(ceil)

  // ── Lights ────────────────────────────────────────────────────────────

  // Bright ambient — the foundation of the gallery's even illumination
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
  scene.add(ambientLight)

  // Hemisphere: cool white sky, warm white ground — neutral indoor daylight
  const hemi = new THREE.HemisphereLight(0xf0f5ff, 0xe8e0d5, 0.6)
  scene.add(hemi)

  // Ceiling grid — 8 warm point lights covering the full carousel circle (z: 0–24)
  // Stored so controls can dim them during "alive" theatrical mode
  const ceilLights = []
  for (const [x, y, z] of [
    [-5, 8.5,  2], [5, 8.5,  2],
    [-5, 8.5,  9], [5, 8.5,  9],
    [-5, 8.5, 16], [5, 8.5, 16],
    [-5, 8.5, 23], [5, 8.5, 23],
  ]) {
    const pl = new THREE.PointLight(0xfff8f0, 2.0, 22, 1)
    pl.position.set(x, y, z)
    scene.add(pl)
    ceilLights.push(pl)
  }

  // Key spotlight — pure white, sharp beam on exhibit (starts at slot 0)
  const spotKey = new THREE.SpotLight(0xffffff, 2.2, 0, Math.PI / 7, 0.3, 0)
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

  // Rim light — soft blue-white for depth (starts at slot 0)
  const spotRim = new THREE.SpotLight(0x8899ff, 0.5, 0, Math.PI / 5, 0.6, 0)
  spotRim.position.set(-3, 5, -4)
  spotRim.target.position.set(0, 1.8, 0)
  scene.add(spotRim)
  scene.add(spotRim.target)

  // Fill — very subtle cool, no orange (starts at slot 0)
  const pointFill = new THREE.PointLight(0xd0e8ff, 0.3, 0, 0)
  pointFill.position.set(-3, 3, 2)
  scene.add(pointFill)

  return { spotKey, spotRim, pointFill, ambientLight, hemi, ceilLights }
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
