/**
 * Process all exhibits: meshopt-compress pred+bones GLBs for each animal.
 * Reads from data/selected/viz/{pred,bones}/
 * Writes to public/models/exhibits/{0-14}/{pred.glb,bones.glb,meta.json}
 *         + public/models/exhibits/manifest.json
 *
 * Usage: node scripts/process-all-exhibits.mjs
 * No subsampling — full animation, compression only.
 */
import { NodeIO }        from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { meshopt }       from '@gltf-transform/functions'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

const PRED_DIR  = 'data/selected/viz/pred'
const BONES_DIR = 'data/selected/viz/bones'
const OUT_BASE  = 'public/models/exhibits'

await MeshoptDecoder.ready
await MeshoptEncoder.ready

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  })

const predFiles  = readdirSync(PRED_DIR).filter(f => f.endsWith('_pred.glb')).sort()
const bonesFiles = readdirSync(BONES_DIR).filter(f => f.endsWith('_bones.glb')).sort()

if (predFiles.length !== bonesFiles.length) {
  throw new Error(`Mismatch: ${predFiles.length} pred vs ${bonesFiles.length} bones`)
}

const N = predFiles.length
console.log(`[process] Found ${N} exhibits\n`)
mkdirSync(OUT_BASE, { recursive: true })

const manifest = []

for (let idx = 0; idx < N; idx++) {
  const predFile  = predFiles[idx]
  const bonesFile = bonesFiles[idx]

  // Parse animal + action from filename
  // Pattern: {Animal_Name}__{animal_name}__{...}_{animal_name}_{action}_pred.glb
  const basename    = predFile.replace(/_pred\.glb$/, '')
  const animal      = basename.split('__')[0].replace(/_/g, ' ')  // "Aardvark Female"
  const animalSnake = animal.toLowerCase().replace(/ /g, '_')
  const actionMatch = basename.match(new RegExp(`${animalSnake}_([a-z0-9]+)$`, 'i'))
  const action      = actionMatch ? actionMatch[1] : 'unknown'

  const outDir = `${OUT_BASE}/${idx}`
  mkdirSync(outDir, { recursive: true })

  // ── Pred ───────────────────────────────────────────────────────────────
  const predSrc  = `${PRED_DIR}/${predFile}`
  const predDst  = `${outDir}/pred.glb`
  const predBefore = readFileSync(predSrc).length

  const predDoc = await io.read(predSrc)
  await predDoc.transform(meshopt({ encoder: MeshoptEncoder }))
  await io.write(predDst, predDoc)
  const predAfter = readFileSync(predDst).length

  // ── Bones ──────────────────────────────────────────────────────────────
  const bonesSrc  = `${BONES_DIR}/${bonesFile}`
  const bonesDst  = `${outDir}/bones.glb`
  const bonesBefore = readFileSync(bonesSrc).length

  const bonesDoc = await io.read(bonesSrc)
  await bonesDoc.transform(meshopt({ encoder: MeshoptEncoder }))
  await io.write(bonesDst, bonesDoc)
  const bonesAfter = readFileSync(bonesDst).length

  // ── Meta ───────────────────────────────────────────────────────────────
  writeFileSync(`${outDir}/meta.json`, JSON.stringify({ animal, action }))

  manifest.push({
    index: idx,
    animal,
    action,
    predFile:  `${idx}/pred.glb`,
    bonesFile: `${idx}/bones.glb`,
  })

  console.log(`[process] ${idx.toString().padStart(2)} "${animal}" / "${action}"`)
  console.log(`          pred:  ${(predBefore/1024/1024).toFixed(1)} MB → ${(predAfter/1024/1024).toFixed(1)} MB`)
  console.log(`          bones: ${(bonesBefore/1024/1024).toFixed(1)} MB → ${(bonesAfter/1024/1024).toFixed(1)} MB\n`)
}

writeFileSync(`${OUT_BASE}/manifest.json`, JSON.stringify(manifest, null, 2))
console.log(`[process] Done! manifest → ${OUT_BASE}/manifest.json`)
