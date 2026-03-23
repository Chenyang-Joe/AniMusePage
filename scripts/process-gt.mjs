/**
 * Process GT GLB: subsample morph targets + meshopt compression + generate floor data.
 * Reads data/viz/gt/*.glb, writes:
 *   public/models/gt.glb
 *   public/models/gt_floor.json
 *
 * Usage: node scripts/process-gt.mjs [step=1] [keepFrac=1.0]
 *   step=1 keepFrac=0.75 → keep every frame, first 75% (245 targets, ~94MB)
 *   step=3            → keep every 3rd frame, all of them (110 targets, ~43MB)
 */
import { NodeIO, PropertyType } from '@gltf-transform/core'
import { ALL_EXTENSIONS }        from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { prune }                 from '@gltf-transform/functions'
import { writeFileSync, readdirSync } from 'fs'

const STEP      = parseInt(process.argv[2] ?? '1', 10)
const KEEP_FRAC = parseFloat(process.argv[3] ?? '1.0')
const GT_DIR = 'data/viz/gt'
const DST_GLB   = 'public/models/gt.glb'
const DST_FLOOR = 'public/models/gt_floor.json'
const DST_META  = 'public/models/gt_meta.json'

await MeshoptDecoder.ready
await MeshoptEncoder.ready

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  })

// Find the GT GLB file
const files = readdirSync(GT_DIR).filter(f => f.endsWith('.glb'))
if (!files.length) throw new Error(`No GLB found in ${GT_DIR}`)
const SRC = `${GT_DIR}/${files[0]}`
console.log(`Reading ${SRC} …`)
const doc = await io.read(SRC)

const meshes = doc.getRoot().listMeshes()
if (!meshes.length) throw new Error('No meshes found')

const prim    = meshes[0].listPrimitives()[0]
const baseAcc = prim.getAttribute('POSITION')
const targets = prim.listTargets()
const n       = targets.length
const nVerts  = baseAcc.getCount()

console.log(`Vertices: ${nVerts}, Morph targets: ${n}`)

// ── Subsample + truncate ─────────────────────────────────────────────────
const keep = new Set()
for (let i = 0; i < n; i += STEP) keep.add(i)
keep.add(n - 1)
let keepArr = [...keep].sort((a, b) => a - b)
if (KEEP_FRAC < 1.0) keepArr = keepArr.slice(0, Math.ceil(keepArr.length * KEEP_FRAC))
const nKeep = keepArr.length
console.log(`Keeping ${nKeep} targets (step=${STEP}, frac=${KEEP_FRAC})`)

const keepSet = new Set(keepArr)
for (let i = n - 1; i >= 0; i--) {
  if (!keepSet.has(i)) prim.removeTarget(targets[i])
}

// Patch animation weights
const animations = doc.getRoot().listAnimations()
for (const anim of animations) {
  for (const channel of anim.listChannels()) {
    if (channel.getTargetPath() !== 'weights') continue
    const sampler   = channel.getSampler()
    const origTimes = sampler.getInput().getArray()
    sampler.getInput().setArray(new Float32Array(keepArr.map(i => origTimes[i])))
    const newWeights = new Float32Array(nKeep * nKeep)
    for (let i = 0; i < nKeep; i++) newWeights[i * nKeep + i] = 1.0
    sampler.getOutput().setArray(newWeights)
  }
}
meshes[0].setWeights(new Array(nKeep).fill(0))

await doc.transform(prune())

// ── Generate floor data (base + delta in gltf-transform space) ─────────
console.log('Computing per-frame floor data …')
const newTargets = prim.listTargets()
const baseY = new Float32Array(nVerts)
for (let v = 0; v < nVerts; v++) baseY[v] = baseAcc.getElement(v, [])[1]

const frameMinY = []
for (let i = 0; i < newTargets.length; i++) {
  const deltaAcc = newTargets[i].getAttribute('POSITION')
  let minY = Infinity
  for (let v = 0; v < nVerts; v++) {
    const y = baseY[v] + deltaAcc.getElement(v, [])[1]
    if (y < minY) minY = y
  }
  frameMinY.push(parseFloat(minY.toFixed(6)))
}

const anim    = doc.getRoot().listAnimations()[0]
const timeArr = anim.listSamplers()[0].getInput().getArray()
const times   = Array.from(timeArr).slice(0, newTargets.length).map(t => parseFloat(t.toFixed(6)))

console.log(`minY range: [${Math.min(...frameMinY).toFixed(4)}, ${Math.max(...frameMinY).toFixed(4)}]`)
writeFileSync(DST_FLOOR, JSON.stringify({ times, minY: frameMinY }, null, 0))
console.log(`Saved floor data → ${DST_FLOOR}`)

// ── Write compressed GLB ────────────────────────────────────────────────
console.log(`Writing ${DST_GLB} …`)
await io.write(DST_GLB, doc)

// ── Write label metadata ────────────────────────────────────────────────
// Filename pattern: {Animal_Name}__{animal_name}__...{animal_name}_{action}_gt.glb
const basename   = files[0].replace(/\.glb$/i, '')
const animal     = basename.split('__')[0].replace(/_/g, ' ')          // "Aardvark Female"
const animalSnake = animal.toLowerCase().replace(/ /g, '_')
const actionMatch = basename.match(new RegExp(`${animalSnake}_([a-z0-9]+)_gt$`, 'i'))
const action     = actionMatch ? actionMatch[1] : ''                    // "enrichmentboxshake"
writeFileSync(DST_META, JSON.stringify({ animal, action }))
console.log(`Label: "${animal}" / "${action}" → ${DST_META}`)

// Stats
import { readFileSync } from 'fs'
const buf = readFileSync(DST_GLB)
const diskMB = (buf.length / 1024 / 1024).toFixed(1)
const vramMB = (nVerts * 3 * 4 * nKeep / 1024 / 1024).toFixed(1)
console.log(`\nDone!  Disk: ${diskMB} MB  |  Verts: ${nVerts.toLocaleString()}  |  Targets: ${nKeep}  |  VRAM: ${vramMB} MB`)
