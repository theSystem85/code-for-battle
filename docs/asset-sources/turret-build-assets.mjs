// Generated OpenAI atlas -> transparent WebP-85 layers. Run from the repository root.
import sharp from 'sharp'
import { fileURLToPath, URL } from 'node:url'
const source = fileURLToPath(new URL('./turret-v1-v3-components.webp', import.meta.url))
const rows = [
  { base: [42, 20, 414, 392], top: [521, 49, 361, 358], barrel: [1033, 71, 80, 327] },
  { base: [42, 417, 414, 393], top: [494, 442, 416, 352], barrel: [1034, 462, 87, 337] },
  { base: [42, 810, 414, 398], top: [502, 831, 398, 361], barrel: [1038, 858, 84, 337] }
]
for (const [index, row] of rows.entries()) {
  for (const layer of ['base', 'top', 'barrel']) {
    const [left, top, width, height] = row[layer].map(value => Math.round(value * 1254 / 1280))
    const region = await sharp(source).extract({left, top, width, height}).toBuffer()
    const crop = await sharp(region).trim({threshold:20}).toBuffer()
    let result
    if (layer === 'barrel') {
      result = sharp(crop).resize(16, 88, {fit:'fill'})
    } else {
      const size = layer === 'base' ? 240 : 192
      const image = await sharp(crop).resize(size, size, {fit:'contain',background:'#00000000'}).toBuffer()
      result = sharp({create:{width:256,height:256,channels:4,background:'#00000000'}})
        .composite([{input:image,left:(256-size)/2,top:(256-size)/2}])
    }
    await result.webp({quality:85,alphaQuality:85,smartSubsample:true}).toFile(`public/images/map/buildings/turret0${index+1}_${layer}.webp`)
  }
}
