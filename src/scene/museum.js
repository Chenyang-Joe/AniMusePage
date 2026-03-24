import * as THREE from 'three'

// ── Pedestal ───────────────────────────────────────────────────────────────
// Returns { group, plateMat, goldMat }.
// goldMat.emissiveIntensity starts at 0 — caller sets it to ~1.5 when "alive".
export function buildPedestal() {
  const group = new THREE.Group()

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xd0ccc4,
    roughness: 0.7,
    metalness: 0.02,
  })

  // ── Bezier Lathe: bottom disc → single curve → top disc ────────────
  const BOTTOM_R = 1.25, TOP_R = 1.15, DISC_H = 0.07
  const BODY_BOT = DISC_H, BODY_TOP = 1.53

  const curve = new THREE.CubicBezierCurve(
    new THREE.Vector2(BOTTOM_R, BODY_BOT),
    new THREE.Vector2(BOTTOM_R * 0.3, BODY_BOT + 0.15),
    new THREE.Vector2(TOP_R * 0.35, BODY_TOP - 0.2),
    new THREE.Vector2(TOP_R, BODY_TOP),
  )

  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(BOTTOM_R, 0),
    new THREE.Vector2(BOTTOM_R, DISC_H),
    ...curve.getPoints(40),
    new THREE.Vector2(TOP_R, BODY_TOP + DISC_H),  // top = 1.60
    new THREE.Vector2(0, BODY_TOP + DISC_H),
  ]

  const lathe = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), stoneMat)
  lathe.castShadow = true
  lathe.receiveShadow = true
  group.add(lathe)

  return { group }
}

// ── Museum ─────────────────────────────────────────────────────────────────
export function buildMuseum(scene) {
  // ── Background & Fog ───────────────────────────────────────────────────
  scene.background = new THREE.Color(0xe2e0de)
  scene.fog = new THREE.FogExp2(0xe2e0de, 0.012)

  // ── Floor ─────────────────────────────────────────────────────────────
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
  const D    = 38
  const S2   = Math.SQRT2
  const SIDE = Math.ceil(2 * D * Math.tan(Math.PI / 8))
  const CX = 0, CZ = 12

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xeae6e0,
    roughness: 0.85,
    metalness: 0.0,
  })

  for (const [dx, dz, ry] of [
    [ 0,      -D,        0             ],
    [-D/S2,   -D/S2,     Math.PI / 4   ],
    [-D,       0,        Math.PI / 2   ],
    [-D/S2,    D/S2,     3*Math.PI / 4 ],
    [ 0,       D,        Math.PI       ],
    [ D/S2,    D/S2,    -3*Math.PI / 4 ],
    [ D,       0,       -Math.PI / 2   ],
    [ D/S2,   -D/S2,    -Math.PI / 4   ],
  ]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(SIDE, 14), wallMat)
    wall.position.set(CX + dx, 7, CZ + dz)
    wall.rotation.y = ry
    wall.receiveShadow = true
    scene.add(wall)
  }

  // ── Ceiling ────────────────────────────────────────────────────────────
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0xf0ece7, roughness: 1.0, metalness: 0 }),
  )
  ceil.rotation.x = Math.PI / 2
  ceil.position.set(0, 10, 12)
  scene.add(ceil)

  // ── Lights ────────────────────────────────────────────────────────────
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
  scene.add(ambientLight)

  const hemi = new THREE.HemisphereLight(0xf0f5ff, 0xe8e0d5, 0.6)
  scene.add(hemi)

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

  const spotRim = new THREE.SpotLight(0x8899ff, 0.5, 0, Math.PI / 5, 0.6, 0)
  spotRim.position.set(-3, 5, -4)
  spotRim.target.position.set(0, 1.8, 0)
  scene.add(spotRim)
  scene.add(spotRim.target)

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
