import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const TILE = 64
const COLS = 16
const OUT_DIR = path.resolve('public/images/map/terrain')
const IMAGE_PATH = path.join(OUT_DIR, 'organic_terrain.webp')
const META_PATH = path.join(OUT_DIR, 'organic_terrain.json')
const directions = [['top', 1], ['right', 2], ['bottom', 4], ['left', 8]]

function hash(seed) {
  let value = seed >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  return value >>> 0
}

function speckles(seed, count, palette, radius = 1.4) {
  let output = ''
  for (let index = 0; index < count; index++) {
    seed = hash(seed + index * 7919)
    const x = 4 + (seed % 5600) / 100
    seed = hash(seed)
    const y = 4 + (seed % 5600) / 100
    const color = palette[seed % palette.length]
    const r = radius * (0.45 + ((seed >>> 8) % 80) / 100)
    output += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`
  }
  return output
}

function roadSvg(mask, variant) {
  const edge = [17, 19, 16][variant]
  const center = [47, 46, 48][variant]
  const arms = [
    mask & 1 ? `<path d="M${edge} 34 Q22 30 20 0 H45 Q43 19 ${center} 34Z"/>` : '',
    mask & 2 ? `<path d="M31 ${edge} Q35 23 64 19 V46 Q45 43 31 ${center}Z"/>` : '',
    mask & 4 ? `<path d="M${edge} 31 Q25 38 20 64 H46 Q43 47 ${center} 31Z"/>` : '',
    mask & 8 ? `<path d="M34 ${edge} Q27 23 0 20 V45 Q18 42 34 ${center}Z"/>` : ''
  ].join('')
  const isolated = mask === 0 ? '<ellipse cx="32" cy="32" rx="17" ry="15"/>' : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs><filter id="rough"><feTurbulence baseFrequency=".11" numOctaves="2" seed="${variant + mask * 3}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3"/></filter></defs>
    <g fill="#8d7656" opacity=".42" filter="url(#rough)" transform="translate(0 1)">${arms}${isolated}</g>
    <g fill="#74624b" filter="url(#rough)">${arms}${isolated}</g>
    <g opacity=".72">${speckles(mask * 97 + variant * 31, 34, ['#9b896b', '#554a3c', '#b09c79'], 1)}</g>
    <g opacity=".8">${speckles(mask * 151 + variant, 8, ['#66744b', '#718153'], 1.4)}</g>
  </svg>`
}

function rockSvg(mask, variant) {
  const links = [
    mask & 1 ? '<path d="M22 35L19 0H45L43 35Z"/>' : '',
    mask & 2 ? '<path d="M30 21L64 19V46L31 43Z"/>' : '',
    mask & 4 ? '<path d="M22 30L19 64H46L43 30Z"/>' : '',
    mask & 8 ? '<path d="M34 20L0 18V45L34 43Z"/>' : ''
  ].join('')
  const rocks = Array.from({ length: 10 }, (_, index) => {
    const n = hash(mask * 991 + variant * 313 + index * 71)
    const x = 14 + n % 37
    const y = 13 + (n >>> 7) % 39
    const rx = 4 + (n >>> 13) % 8
    const ry = 3 + (n >>> 18) % 6
    return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${index % 3 === 0 ? '#817866' : '#5d5a50'}"/><path d="M${x-rx+2} ${y-1} Q${x} ${y-ry} ${x+rx-1} ${y}" fill="#a79b80" opacity=".72"/>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><filter id="r"><feTurbulence baseFrequency=".09" numOctaves="2" seed="${mask + variant * 17}"/><feDisplacementMap in="SourceGraphic" scale="4"/></filter></defs><g filter="url(#r)" fill="#58564d">${links}<ellipse cx="32" cy="32" rx="20" ry="18"/>${rocks}</g><g opacity=".65">${speckles(mask * 43 + variant, 14, ['#77715f', '#49483f', '#a09272'], 1.5)}</g></svg>`
}

function macroSvg(variant) {
  const colors = variant % 2 ? ['#665f32', '#73683b'] : ['#31552f', '#3c6538']
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="g"><stop stop-color="${colors[0]}" stop-opacity=".2"/><stop offset="1" stop-color="${colors[1]}" stop-opacity="0"/></radialGradient></defs><ellipse cx="${20 + variant * 5}" cy="${38 - variant * 3}" rx="30" ry="23" fill="url(#g)"/>${speckles(variant * 811, 7, [colors[0]], .8)}</svg>`
}

await fs.mkdir(OUT_DIR, { recursive: true })
const tiles = []
const metadata = {}
for (let variant = 0; variant < 3; variant++) {
  for (let mask = 0; mask < 16; mask++) {
    tiles.push({ svg: roadSvg(mask, variant), tags: ['street', 'organic', `variant_${variant}`, ...directions.filter(([, bit]) => mask & bit).map(([name]) => name)] })
  }
}
for (let variant = 0; variant < 2; variant++) {
  for (let mask = 0; mask < 16; mask++) {
    tiles.push({ svg: rockSvg(mask, variant), tags: ['organic-rock', `variant_${variant}`, ...directions.filter(([, bit]) => mask & bit).map(([name]) => name)] })
  }
}
for (let variant = 0; variant < 8; variant++) tiles.push({ svg: macroSvg(variant), tags: ['grass-macro', `variant_${variant}`] })

const rows = Math.ceil(tiles.length / COLS)
const composites = []
for (let index = 0; index < tiles.length; index++) {
  const col = index % COLS
  const row = Math.floor(index / COLS)
  const png = await sharp(Buffer.from(tiles[index].svg)).png().toBuffer()
  composites.push({ input: png, left: col * TILE, top: row * TILE })
  metadata[`${col},${row}`] = { tags: tiles[index].tags, rect: { x: col * TILE, y: row * TILE, width: TILE, height: TILE }, col, row }
}
await sharp({ create: { width: COLS * TILE, height: rows * TILE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(composites).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(IMAGE_PATH)
await fs.writeFile(META_PATH, JSON.stringify({ schemaVersion: 1, sheetPath: 'images/map/terrain/organic_terrain.webp', tileSize: TILE, columns: COLS, rows, blendMode: 'normal', displayName: 'Organic terrain overlays', tiles: metadata }, null, 2) + '\n')
console.log(`Generated ${tiles.length} tiles in ${IMAGE_PATH}`)
