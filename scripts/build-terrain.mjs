// Offline only: all alpha shaping and material compositing are baked to PNG.
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { BLOB_MASKS, terrainHash } from '../src/rendering/organicTerrain.js'
const dir = new URL('../public/images/terrain/', import.meta.url)
await mkdir(dir, { recursive: true })
const source = sharp(new URL('source/materials.webp', dir).pathname)
const { width, height } = await source.metadata()
async function material(top) {
  return source.clone().extract({left: 0, top, width, height: Math.floor(height / 2)})
    .resize(512, 512).removeAlpha().raw().toBuffer()
}
const grass = await sharp(new URL('source/meadow.webp', dir).pathname).resize(512, 512).blur(0.45).removeAlpha().raw().toBuffer()
const road = await material(Math.floor(height / 2))
// Periodic reflection gives exact wrap continuity; broad color modulation is
// also periodic and shared by every tile edge, rather than per-tile tinting.
function sample(data, x, y, channel) {
  const mirror = v => { const a = ((v % 512) + 512) % 512; return a < 256 ? a : 511 - a }
  return data[(mirror(y) * 512 + mirror(x)) * 3 + channel]
}
const grassOut = Buffer.alloc(512 * 512 * 4)
for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
  const macro = 1
  const i = (y * 512 + x) * 4
  for (let c = 0; c < 3; c++) grassOut[i + c] = Math.min(255, grass[(y * 512 + x) * 3 + c] * macro)
  grassOut[i + 3] = 255
}
const layers = [{input: await sharp(grassOut, {raw:{width:512,height:512,channels:4}}).png().toBuffer(), left:0, top:0}]
const dryGrass = Buffer.from(grassOut)
for (let y=0;y<512;y++)for(let x=0;x<512;x++) {
  const strength=Math.pow(Math.sin(Math.PI*x/511)*Math.sin(Math.PI*y/511),2)
  for(let c=0;c<3;c++) {
    const i=(y*512+x)*4+c
    dryGrass[i]=Math.round(grassOut[i]*(1+strength*[0.08,0.015,-0.045][c]))
  }
}
layers.push({input:await sharp(dryGrass,{raw:{width:512,height:512,channels:4}}).png().toBuffer(),left:512,top:0})
for (let m = 0; m < BLOB_MASKS.length; m++) for (let variant = 0; variant < 4; variant++) {
  const mask = BLOB_MASKS[m], pixels = Buffer.alloc(80 * 80 * 4)
  for (let py = 0; py < 80; py++) for (let px = 0; px < 80; px++) {
    const x = px - 8, y = py - 8
    // Exposed edges wander smoothly and carry fine grass/gravel intrusion.
    const wiggle = t => 2.0 * Math.sin(t * 0.23) + 1.1 * Math.sin(t * 0.61)
    let d = 100
    if (!(mask & 1)) d = Math.min(d, y - 2 + wiggle(x))
    if (!(mask & 2)) d = Math.min(d, 61 - x + wiggle(y))
    if (!(mask & 4)) d = Math.min(d, 61 - y + wiggle(x))
    if (!(mask & 8)) d = Math.min(d, x - 2 + wiggle(y))
    for (const [bits, diagonal, cx, cy] of [[3,16,64,0],[6,32,64,64],[12,64,0,64],[9,128,0,0]]) {
      if ((mask & bits) === bits && !(mask & diagonal)) d = Math.min(d, Math.hypot(x-cx,y-cy)-25 + wiggle(x+y)*0.5)
      if ((mask & bits) === 0 && (mask & 15) !== 0) {
        const ox = cx === 0 ? 52 : 12, oy = cy === 0 ? 52 : 12
        d = Math.min(d, 52 - Math.hypot(x-ox,y-oy) + wiggle(x+y)*0.4)
      }
    }
    if ((mask & 15) === 0) d = 29 - Math.hypot(x-32,y-32) + wiggle(x+y)
    // Connected sides stop at the cell edge; exposed sides can scatter into grass.
    if ((x < 0 && (mask & 8)) || (x > 63 && (mask & 2)) || (y < 0 && (mask & 1)) || (y > 63 && (mask & 4))) d = -10
    const noise = (terrainHash(x,y,variant) % 100) / 100
    const alpha = Math.max(0,Math.min(1,(d + noise * 1.8) / 3))
    const i = (py * 80 + px) * 4
    for(let c=0;c<3;c++) pixels[i+c] = sample(road,x+variant*64,y+variant*64,c) * (d < 4 ? [1.12,1.08,0.9][c] : 1)
    pixels[i+3] = Math.round(alpha*255)
  }
  const index=m*4+variant
  layers.push({input:await sharp(pixels,{raw:{width:80,height:80,channels:4}}).png().toBuffer(),left:index%16*80,top:512+Math.floor(index/16)*80})
}
await sharp({create:{width:1280,height:1472,channels:4,background:'#00000000'}}).composite(layers).png().toFile(new URL('organic-atlas.png',dir).pathname)
await writeFile(new URL('organic-atlas.json',dir),JSON.stringify({version:2,tileSize:64,grassBlocks:2,roadStride:80,roadY:512,variants:4,columns:16,masks:BLOB_MASKS,details:'terrain-details.json',source:'OpenAI imagegen; see specs/organic-terrain.md'},null,2)+'\n')
console.log('Built organic-atlas.png: 128 grass regions, 188 road sprites')

await import('./build-terrain-details.mjs')
