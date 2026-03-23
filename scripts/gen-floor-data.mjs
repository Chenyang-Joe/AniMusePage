/**
 * Read the COMPRESSED pred.glb (decoded float32 world-space via gltf-transform),
 * compute actual per-frame min Y = base_pos_Y + delta_Y for each vertex,
 * write public/models/pred_floor.json.
 */
import { NodeIO }        from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { writeFileSync }  from 'fs'

await MeshoptDecoder.ready

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

console.log('Reading public/models/pred.glb …')
const doc = await io.read('public/models/pred.glb')

const prim    = doc.getRoot().listMeshes()[0].listPrimitives()[0]
const baseAcc = prim.getAttribute('POSITION')
const nVerts  = baseAcc.getCount()
const targets = prim.listTargets()

console.log(`Vertices: ${nVerts}, Morph targets: ${targets.length}`)

// Base Y values — gltf-transform decodes quantization → float32 world-space
const baseY = new Float32Array(nVerts)
for (let v = 0; v < nVerts; v++) baseY[v] = baseAcc.getElement(v, [])[1]

// Per-frame actual min Y  (base + delta)
const frameMinY = []
for (let i = 0; i < targets.length; i++) {
  const deltaAcc = targets[i].getAttribute('POSITION')
  let minY = Infinity
  for (let v = 0; v < nVerts; v++) {
    const y = baseY[v] + deltaAcc.getElement(v, [])[1]
    if (y < minY) minY = y
  }
  frameMinY.push(parseFloat(minY.toFixed(6)))
}

// Animation timestamps (one per morph target frame)
const anim    = doc.getRoot().listAnimations()[0]
const timeArr = anim.listSamplers()[0].getInput().getArray()
const times   = Array.from(timeArr).slice(0, targets.length).map(t => parseFloat(t.toFixed(6)))

console.log(`minY range: [${Math.min(...frameMinY).toFixed(4)}, ${Math.max(...frameMinY).toFixed(4)}]`)
console.log(`Frame 0 minY: ${frameMinY[0].toFixed(4)}`)

writeFileSync('public/models/pred_floor.json',
  JSON.stringify({ times, minY: frameMinY }, null, 0))

console.log('Saved → public/models/pred_floor.json')
