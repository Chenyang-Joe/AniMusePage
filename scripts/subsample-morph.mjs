/**
 * Subsample morph targets in pred.glb without touching mesh topology.
 * Loads the compressed GLB (decodes meshopt+quantization), keeps every Nth
 * morph target, then re-encodes with meshopt only.
 *
 * Usage: node scripts/subsample-morph.mjs [step=3]
 *   step=3 → keep every 3rd frame (~109 targets, ~10fps interpolated)
 *   step=5 → keep every 5th frame (~66 targets,  ~6fps interpolated)
 */

import { NodeIO, PropertyType } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { prune } from '@gltf-transform/functions'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const STEP = parseInt(process.argv[2] ?? '3', 10)
const SRC  = 'data/viz/pred_compressed/pred.glb'
const DST  = 'public/models/pred.glb'

await MeshoptDecoder.ready
await MeshoptEncoder.ready

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  })

console.log(`Reading ${SRC} …`)
const doc = await io.read(SRC)

const meshes = doc.getRoot().listMeshes()
if (!meshes.length) throw new Error('No meshes found')

const prim = meshes[0].listPrimitives()[0]
const targets = prim.listTargets()
const n = targets.length
console.log(`Found ${n} morph targets`)

// Determine which indices to keep
const keep = new Set()
for (let i = 0; i < n; i += STEP) keep.add(i)
keep.add(n - 1)  // always keep last frame
console.log(`Keeping ${keep.size} targets (every ${STEP}th, + last)`)

// Remove targets NOT in keep set (iterate in reverse to preserve indices)
for (let i = n - 1; i >= 0; i--) {
  if (!keep.has(i)) {
    prim.removeTarget(targets[i])
  }
}

// Patch animation: rebuild weights keyframes to match new target count
const nKeep = keep.size
const keepArr = [...keep].sort((a, b) => a - b)

const animations = doc.getRoot().listAnimations()
for (const anim of animations) {
  for (const channel of anim.listChannels()) {
    if (channel.getTargetPath() !== 'weights') continue
    const sampler = channel.getSampler()

    // Original input times — keep only times at kept indices
    const inputAcc = sampler.getInput()
    const origTimes = inputAcc.getArray()
    const newTimes = new Float32Array(keepArr.map(i => origTimes[i]))
    inputAcc.setArray(newTimes)

    // New output weights: identity matrix — frame i sets weight[i]=1, rest=0
    const newWeights = new Float32Array(nKeep * nKeep)
    for (let i = 0; i < nKeep; i++) newWeights[i * nKeep + i] = 1.0
    sampler.getOutput().setArray(newWeights)
  }
}

// Update mesh default weights
const mesh = meshes[0]
mesh.setWeights(new Array(nKeep).fill(0))

// Prune orphaned accessors/bufferViews
await doc.transform(prune())

// Write with meshopt compression only (no simplify)
console.log(`Writing ${DST} …`)
await io.write(DST, doc)

// Quick stats
const buf = readFileSync(DST)
const diskMB = (buf.length / 1024 / 1024).toFixed(1)

// Re-read JSON to count verts/targets
const jsonLen = buf.readUInt32LE(12)
const J = JSON.parse(buf.slice(20, 20 + jsonLen).toString())
const acc = J.accessors
const p = J.meshes[0].primitives[0]
const nV = acc[p.attributes.POSITION].count
const nT = (p.targets ?? []).length
const vramMB = (nV * 3 * 4 * nT / 1024 / 1024).toFixed(1)

console.log(`\nDone!`)
console.log(`  Disk:    ${diskMB} MB`)
console.log(`  Verts:   ${nV.toLocaleString()}`)
console.log(`  Targets: ${nT}`)
console.log(`  VRAM:    ${vramMB} MB`)
