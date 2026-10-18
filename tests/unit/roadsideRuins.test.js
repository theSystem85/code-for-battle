import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildDecorationLayout, buildDecorationPools, buildDecorationConstraints } from '../../src/rendering/decorationLayout.js'

const grid = (size = 96) => Array.from({ length: size }, () => Array.from({ length: size }, () => ({ type: 'land', biome: 'grass' })))
function group(id, tags = [], width = 1, height = width) {
  const tilesByOffset = {}
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    tilesByOffset[`${x},${y}`] = { sheetPath: 'u.webp', image: {}, rect: { x: x * 64, y: y * 64, width: 64, height: 64 }, tags: ['universal', 'decorative', ...tags] }
  }
  return { groupLabel: id, width, height, tilesByOffset, tagSet: new Set(['universal', 'decorative', ...tags]) }
}
const anchors = layout => layout.cells.filter(cell => cell && cell.offsetX === 0 && cell.offsetY === 0)

describe('roadside, ruins and rare props', () => {
  it('[U03836] places roadside props only directly next to roads, sparsely and deterministically', () => {
    const map = grid()
    for (let i = 0; i < 96; i++) { map[48][i].type = 'street'; map[i][20].type = 'street' }
    const pools = buildDecorationPools([group('wreck', ['roadside', 'passable']), group('barrels', ['roadside', 'passable']), group('bush', ['trees', 'passable'])])
    const layout = buildDecorationLayout(map, pools, { salt: 9, citySeeds: 0, ruinSeeds: 0 })
    const constraints = buildDecorationConstraints(map)
    const roadside = anchors(layout).filter(cell => cell.group.tagSet.has('roadside'))
    expect(roadside.length).toBeGreaterThan(0)
    const adjacent = map.flat().filter((tile, i) => tile.type === 'land' && constraints.roadDistance[i] === 1).length
    expect(roadside.length).toBeLessThan(adjacent / 6)
    for (const cell of roadside) expect(constraints.roadDistance[cell.anchorY * 96 + cell.anchorX]).toBe(1)
    const again = buildDecorationLayout(map, pools, { salt: 9, citySeeds: 0, ruinSeeds: 0 })
    expect(anchors(again).map(c => `${c.anchorX},${c.anchorY}`)).toEqual(anchors(layout).map(c => `${c.anchorX},${c.anchorY}`))
  })

  it('[U03837] places a rare prop at most once per map', () => {
    const map = grid(128)
    const pools = buildDecorationPools([group('tower', ['ruins', 'rare', 'impassable']), group('wall', ['ruins', 'impassable'])])
    const layout = buildDecorationLayout(map, pools, { salt: 3, ruinSeeds: 6, ruinClusterSize: 12, citySeeds: 0 })
    const towers = anchors(layout).filter(cell => cell.group.groupLabel === 'tower')
    const walls = anchors(layout).filter(cell => cell.group.groupLabel === 'wall')
    expect(towers.length).toBeLessThanOrEqual(1)
    expect(walls.length).toBeGreaterThan(towers.length)
  })

  it('[U03838] retags dtv2_universal into ruins plus roadside, with the water tower and fuel depot rare', () => {
    const sheet = JSON.parse(readFileSync('public/images/map/sprite_sheets/dtv2_universal.json', 'utf8'))
    const byId = Object.fromEntries(sheet.propLayout.map(prop => [prop.id, prop.tags]))
    for (const tags of Object.values(byId)) expect(tags.includes('ruins') !== tags.includes('roadside')).toBe(true)
    expect(Object.values(byId).filter(tags => tags.includes('ruins')).length).toBeGreaterThanOrEqual(10)
    for (const id of ['universal_water_tower', 'universal_fuel_depot']) expect(byId[id]).toEqual(expect.arrayContaining(['ruins', 'rare']))
    for (const prop of sheet.propLayout) {
      for (let y = prop.row; y < prop.row + prop.h; y++) for (let x = prop.col; x < prop.col + prop.w; x++) {
        for (const tag of ['ruins', 'roadside', 'rare']) expect(sheet.tiles[`${x},${y}`].tags.includes(tag)).toBe(prop.tags.includes(tag))
      }
    }
  })
})
