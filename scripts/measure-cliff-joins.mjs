import sharp from 'sharp'
import { pathToFileURL } from 'node:url'
import { cliffMacroRect } from '../src/rendering/cliffTerrain.js'

// Premultiply alpha so invisible gutter RGB does not influence the result.
export async function measureCliffJoins(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let sum = 0, samples = 0, max = 0
  for (const mask of [6, 9]) for (let variant = 0; variant < 8; variant++) {
    const rect = cliffMacroRect(mask, 4, variant)
    for (let x = 0; x < rect.width; x++) {
      const a = ((rect.y + 48) * info.width + rect.x + x) * 4
      const b = ((rect.y + 48 + 255) * info.width + rect.x + x) * 4
      for (let c = 0; c < 3; c++) {
        const delta = Math.abs(data[a + c] * data[a + 3] / 255 - data[b + c] * data[b + 3] / 255)
        sum += delta
        samples++
        max = Math.max(max, delta)
      }
    }
  }
  return { meanPremultipliedRGBJump: sum / samples, maxJump: max, samples }
}

async function main() {
  for (const path of process.argv.slice(2)) console.log(path, await measureCliffJoins(path))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1 })
}
