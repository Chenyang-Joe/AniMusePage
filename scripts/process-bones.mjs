/**
 * Process Bones GLB: subsample animation keyframes (step=N) + meshopt compression.
 * Reads data/viz/bones/*.glb, writes public/models/bones.glb
 *
 * Usage: node scripts/process-bones.mjs [step=4]
 *   step=4 → keep every 4th keyframe; Three.js SLERP/LERPs between them at runtime
 */
import { NodeIO }        from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { readdirSync, readFileSync } from 'fs'

const STEP      = parseInt(process.argv[2] ?? '4', 10)
const BONES_DIR = 'data/viz/bones'
const DST_GLB   = 'public/models/bones.glb'

await MeshoptDecoder.ready
await MeshoptEncoder.ready

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  })

const files = readdirSync(BONES_DIR).filter(f => f.endsWith('.glb'))
if (!files.length) throw new Error(`No GLB found in ${BONES_DIR}`)
const SRC = `${BONES_DIR}/${files[0]}`
console.log(`Reading ${SRC} …`)
const doc = await io.read(SRC)

// Subsample every animation sampler by STEP, always keeping the last keyframe
for (const anim of doc.getRoot().listAnimations()) {
  for (const sampler of anim.listSamplers()) {
    const inputAcc  = sampler.getInput()
    const outputAcc = sampler.getOutput()
    const times     = inputAcc.getArray()
    const n         = times.length

    // Build keep indices
    const keep = []
    for (let i = 0; i < n; i += STEP) keep.push(i)
    if (keep[keep.length - 1] !== n - 1) keep.push(n - 1)

    const output = outputAcc.getArray()
    const stride = output.length / n  // elements per keyframe (3=vec3, 4=quat)

    const newTimes  = new Float32Array(keep.map(i => times[i]))
    const newOutput = new Float32Array(keep.length * stride)
    for (let ki = 0; ki < keep.length; ki++) {
      const i = keep[ki]
      for (let s = 0; s < stride; s++) newOutput[ki * stride + s] = output[i * stride + s]
    }

    inputAcc.setArray(newTimes)
    outputAcc.setArray(newOutput)
  }
  console.log(`  Animation "${anim.getName()}": ${doc.getRoot().listAnimations()[0].listSamplers()[0].getInput().getCount()} → kept with step=${STEP}`)
}

console.log(`Writing ${DST_GLB} …`)
await io.write(DST_GLB, doc)

const buf = readFileSync(DST_GLB)
console.log(`Done!  Disk: ${(buf.length / 1024 / 1024).toFixed(1)} MB`)
