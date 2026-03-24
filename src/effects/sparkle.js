import * as THREE from 'three'

// 4-pointed star texture
let _tex = null
function getTex() {
  if (_tex) return _tex
  const S = 128
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const ctx = c.getContext('2d')

  const g = ctx.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2)
  g.addColorStop(0,    'rgba(255,255,255,1)')
  g.addColorStop(0.08, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.15)')
  g.addColorStop(1,    'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)

  const hg = ctx.createLinearGradient(0, S/2, S, S/2)
  hg.addColorStop(0,    'rgba(255,255,255,0)')
  hg.addColorStop(0.45, 'rgba(255,255,255,0.08)')
  hg.addColorStop(0.5,  'rgba(255,255,255,0.85)')
  hg.addColorStop(0.55, 'rgba(255,255,255,0.08)')
  hg.addColorStop(1,    'rgba(255,255,255,0)')
  ctx.fillStyle = hg
  ctx.fillRect(0, S/2 - 1.5, S, 3)

  const vg = ctx.createLinearGradient(S/2, 0, S/2, S)
  vg.addColorStop(0,    'rgba(255,255,255,0)')
  vg.addColorStop(0.45, 'rgba(255,255,255,0.08)')
  vg.addColorStop(0.5,  'rgba(255,255,255,0.85)')
  vg.addColorStop(0.55, 'rgba(255,255,255,0.08)')
  vg.addColorStop(1,    'rgba(255,255,255,0)')
  ctx.fillStyle = vg
  ctx.fillRect(S/2 - 1.5, 0, 3, S)

  _tex = new THREE.CanvasTexture(c)
  return _tex
}

/**
 * Continuous sparkle effect while exhibit is alive.
 * startContinuous(center): begin emitting around center every INTERVAL seconds.
 * stopContinuous():        stop emitting; existing particles finish naturally.
 * update(delta):           call every frame.
 */
export class SparkleEffect {
  constructor(scene) {
    this.scene      = scene
    this._systems   = []
    this._running   = false
    this._center    = new THREE.Vector3()
    this._accum     = 0
    this.INTERVAL   = 0.22  // seconds between micro-bursts
  }

  startContinuous(center) {
    this._center.copy(center)
    this._running = true
    this._accum   = this.INTERVAL  // emit immediately on start
  }

  stopContinuous() {
    this._running = false
  }

  update(delta) {
    // Emit micro-bursts while running
    if (this._running) {
      this._accum += delta
      if (this._accum >= this.INTERVAL) {
        this._accum = 0
        this._emitBurst(this._center)
      }
    }

    // Advance all active systems
    for (let i = this._systems.length - 1; i >= 0; i--) {
      const s = this._systems[i]
      s.age += delta
      const t = Math.min(s.age / s.duration, 1)

      // Fade out in the last 40% of lifetime
      s.mat.opacity = t < 0.6 ? 1.0 : 1.0 - (t - 0.6) / 0.4

      const attr = s.geo.attributes.position
      for (let j = 0; j < s.vel.length; j++) {
        attr.setX(j, attr.getX(j) + s.vel[j].x * delta)
        attr.setY(j, attr.getY(j) + s.vel[j].y * delta)
        attr.setZ(j, attr.getZ(j) + s.vel[j].z * delta)
        s.vel[j].y -= 0.25 * delta   // gentle gravity arc
        s.vel[j].x *= 0.98
        s.vel[j].z *= 0.98
      }
      attr.needsUpdate = true

      if (t >= 1) {
        this.scene.remove(s.pts)
        s.geo.dispose()
        s.mat.dispose()
        this._systems.splice(i, 1)
      }
    }
  }

  _emitBurst(center) {
    this._addLayer(center, { count: 7,  color: 0xffffff, size: 0.18, duration: 1.6 })
    if (Math.random() < 0.6) {
      this._addLayer(center, { count: 4, color: 0xe8e4e0, size: 0.08, duration: 1.2 })
    }
  }

  _addLayer(center, { count, color, size, duration }) {
    const pos = new Float32Array(count * 3)
    const vel = []

    for (let i = 0; i < count; i++) {
      // Spawn at random angle on a ring around the model, at random height
      const angle  = Math.random() * Math.PI * 2
      const r      = 0.8 + Math.random() * 0.9   // ring radius 0.8–1.7
      const height = Math.random() * 3.2           // spread along full model height

      pos[i*3]   = center.x + r * Math.cos(angle)
      pos[i*3+1] = center.y + height
      pos[i*3+2] = center.z + r * Math.sin(angle)

      // Tangential velocity (slight orbital drift) + upward float
      const tangent = 0.25 + Math.random() * 0.25
      vel.push({
        x: -Math.sin(angle) * tangent + (Math.random() - 0.5) * 0.15,
        y:  0.5 + Math.random() * 0.9,
        z:  Math.cos(angle) * tangent + (Math.random() - 0.5) * 0.15,
      })
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))

    const mat = new THREE.PointsMaterial({
      map:             getTex(),
      size,
      sizeAttenuation: true,
      transparent:     true,
      opacity:         1.0,
      depthWrite:      false,
      blending:        THREE.AdditiveBlending,
      color,
    })

    const pts = new THREE.Points(geo, mat)
    this.scene.add(pts)
    this._systems.push({ pts, geo, mat, vel, age: 0, duration })
  }
}
