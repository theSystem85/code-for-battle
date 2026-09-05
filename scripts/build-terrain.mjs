// Offline only: all alpha shaping and material compositing are baked to PNG.
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { BLOB_MASKS, terrainHash } from '../src/rendering/organicTerrain.js'
const dir = new URL('../public/images/terrain/', import.meta.url)
await mkdir(dir, { recursive: true })
const source = sharp(new URL('source/materials.png', dir).pathname)
const { width, height } = await source.metadata()
async function material(top) {
  return source.clone().extract({left: 0, top, width, height: Math.floor(height / 2)})
    .resize(512, 512).removeAlpha().raw().toBuffer()
}
const grass = await material(0)
const road = await material(Math.floor(height / 2))
// Periodic reflection gives exact wrap continuity; broad color modulation is
// also periodic and shared by every tile edge, rather than per-tile tinting.
function sample(data, x, y, channel) {
  const mirror = v => { const a = ((v % 512) + 512) % 512; return a < 256 ? a : 511 - a }
  return data[(mirror(y) * 512 + mirror(x)) * 3 + channel]
}
const grassOut = Buffer.alloc(512 * 512 * 4)
for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
  const macro = 1 + 0.065 * Math.sin(x * Math.PI / 256) * Math.cos(y * Math.PI / 256) + 0.035 * Math.cos((x + y) * Math.PI / 128)
  const i = (y * 512 + x) * 4
  for (let c = 0; c < 3; c++) grassOut[i + c] = Math.min(255, sample(grass, x, y, c) * macro * [1.03, 1.12, 1.02][c])
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
// Four exterior wedges bridge diagonal stairs on adjacent grass cells.
for (let corner=0;corner<4;corner++) for(let variant=0;variant<4;variant++) {
  const pixels=Buffer.alloc(64*64*4)
  for(let y=0;y<64;y++)for(let x=0;x<64;x++) {
    const u=corner===1||corner===2?63-x:x, v=corner>=2?63-y:y
    const d=60-u-v+1.4*Math.sin((u-v)*0.3)
    const i=(y*64+x)*4
    for(let c=0;c<3;c++)pixels[i+c]=sample(road,x+variant*64,y+variant*64,c)
    pixels[i+3]=Math.round(255*Math.max(0,Math.min(1,d/4)))
  }
  layers.push({input:await sharp(pixels,{raw:{width:64,height:64,channels:4}}).png().toBuffer(),left:(corner*4+variant)*64,top:1632})
}
const rocks = sharp(new URL('source/rocks.png',dir).pathname)
const rm = await rocks.metadata()
for(let i=0;i<6;i++) {
  const cropped=await rocks.clone().extract({left:Math.floor(i%3*rm.width/3),top:Math.floor(Math.floor(i/3)*rm.height/2),width:Math.floor(rm.width/3),height:Math.floor(rm.height/2)}).png().toBuffer()
  const input=await sharp(cropped).trim({threshold:8}).resize(160,160,{fit:'contain',background:'#00000000'}).png().toBuffer()
  layers.push({input,left:i*160,top:1472})
  for(let layout=0;layout<4;layout++) {
    const w=layout&1?75:43, h=layout&2?75:43
    layers.push({input:await sharp(input).resize(w,h,{fit:'fill'}).png().toBuffer(),left:i*80,top:1712+layout*80})
  }
}
await sharp({create:{width:1280,height:2032,channels:4,background:'#00000000'}}).composite(layers).png().toFile(new URL('organic-atlas.png',dir).pathname)
await writeFile(new URL('organic-atlas.json',dir),JSON.stringify({version:1,tileSize:64,grassBlocks:2,fringeY:1632,bakedRockY:1712,bakedRockStride:80,bakedRockSizes:[43,75],roadStride:80,roadY:512,variants:4,columns:16,masks:BLOB_MASKS,rockY:1472,rockStride:160,templates:['cluster','ridge','diagonal','corner','endcap','mass'],source:'OpenAI imagegen; see specs/organic-terrain.md'},null,2)+'\n')
console.log('Built organic-atlas.png: 128 grass regions, 188 road sprites, 6 rock formations')
