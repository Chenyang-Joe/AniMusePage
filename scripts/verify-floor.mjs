/**
 * Verify per-frame floor min Y computation.
 * Loads pred.glb, computes for each frame:
 *   frameLocalMinY = min_v( base_Y[v] + delta_Y[frame][v] )
 * Then shows stats to confirm the CPU-based approach is correct.
 */
import { NodeIO }        from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

await MeshoptDecoder.ready

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

const doc = await io.read('public/models/pred.glb')
const prim    = doc.getRoot().listMeshes()[0].listPrimitives()[0]
const baseAcc = prim.getAttribute('POSITION')
const nVerts  = baseAcc.getCount()
const targets = prim.listTargets()

// Base pose (no delta)
const baseY = new Float32Array(nVerts)
let baseLocalMinY = Infinity, baseLocalMaxY = -Infinity
for (let v = 0; v < nVerts; v++) {
  const y = baseAcc.getElement(v, [])[1]
  baseY[v] = y
  if (y < baseLocalMinY) baseLocalMinY = y
  if (y > baseLocalMaxY) baseLocalMaxY = y
}
const localSizeY  = baseLocalMaxY - baseLocalMinY
const floorScaleY = 1.8 / localSizeY

console.log(`=== Base pose (no morph) ===`)
console.log(`  baseLocalMinY : ${baseLocalMinY.toFixed(6)}`)
console.log(`  baseLocalMaxY : ${baseLocalMaxY.toFixed(6)}`)
console.log(`  localSizeY    : ${localSizeY.toFixed(6)}`)
console.log(`  floorScaleY   : ${floorScaleY.toFixed(6)}`)
console.log()

// Per-frame computation (weight[i]=1, others=0 — identity encoding)
const frameLocalMinY = new Float32Array(targets.length)
for (let i = 0; i < targets.length; i++) {
  const deltaAcc = targets[i].getAttribute('POSITION')
  let minY = Infinity
  for (let v = 0; v < nVerts; v++) {
    const y = baseY[v] + deltaAcc.getElement(v, [])[1]
    if (y < minY) minY = y
  }
  frameLocalMinY[i] = minY
}

const overallMin = Math.min(...frameLocalMinY)
const overallMax = Math.max(...frameLocalMinY)
console.log(`=== Per-frame frameLocalMinY ===`)
console.log(`  range : [${overallMin.toFixed(6)}, ${overallMax.toFixed(6)}]`)
console.log(`  delta range: [${(overallMin - baseLocalMinY).toFixed(6)}, ${(overallMax - baseLocalMinY).toFixed(6)}]`)
console.log()

// Print every 30th frame + extremes
console.log('frame | frameLocalMinY | delta        | pos.y correction')
console.log('------+----------------+--------------+-----------------')
const printFrame = i => {
  const f = frameLocalMinY[i]
  const d = f - baseLocalMinY
  const corr = -d * floorScaleY
  console.log(
    `${String(i).padStart(5)} | ${f.toFixed(6).padStart(14)} | ${d.toFixed(6).padStart(12)} | ${corr.toFixed(6)}`
  )
}
for (let i = 0; i < targets.length; i += 30) printFrame(i)
// Also print the frame with absolute min
const minFrame = frameLocalMinY.indexOf(overallMin)
const maxFrame = frameLocalMinY.indexOf(overallMax)
console.log(`--- frame with lowest minY (${minFrame}) ---`)
printFrame(minFrame)
console.log(`--- frame with highest minY (${maxFrame}) ---`)
printFrame(maxFrame)

console.log()
console.log(`NOTE: pos.y_correction = -(delta * floorScaleY)`)
console.log(`The runtime formula: predModel.position.y = initialOffsetY + pos.y_correction`)
console.log(`Negative delta (feet lower) => positive correction (model shifts UP) ✓`)
console.log(`Positive delta (feet higher) => negative correction (model shifts DOWN) ✓`)
