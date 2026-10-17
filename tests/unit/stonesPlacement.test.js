import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildDecorationLayout, buildDecorationPools } from '../../src/rendering/decorationLayout.js'
import { DECORATION_SETTINGS, normalizeDecorationSettings } from '../../src/game/decorationSettings.js'

function grid(size = 96) {
  const map = Array.from({ length: size }, () => Array.from({ length: size }, () => ({ type: 'land', biome: 'grass' })))
  for (let y = 0; y < size; y++) for (let x = 0; x < 14; x++) map[y][x].type = 'water'
  for (let y = 60; y < 66; y++) for (let x = 70; x < 76; x++) map[y][x].type = 'rock'
  return map
}
function group(id, width = 1, height = width) {
  const tags = ['grass', 'decorative', 'stones', width * height > 1 ? 'impassable' : 'passable']
  const tilesByOffset = {}
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) tilesByOffset[`${x},${y}`] = { sheetPath: 'r.webp', image: {}, rect: { x: x * 64, y: y * 64, width: 64, height: 64 }, tags }
  return { groupLabel: id, width, height, tilesByOffset, tagSet: new Set(tags) }
}
const pools = buildDecorationPools([...Array.from({ length: 10 }, (_, i) => group(`s${i}`)), ...Array.from({ length: 4 }, (_, i) => group(`l${i}`, 2))])
const stones = layout => layout.cells.filter(cell => cell && cell.offsetX === 0 && cell.offsetY === 0 && cell.group.tagSet.has('stones'))
const opts = extra => ({ salt: 11, citySeeds: 0, ruinSeeds: 0, ...extra })

describe('stones', () => {
  it('has a clamped stoneCount map setting', () => {
    expect(DECORATION_SETTINGS.stoneCount.default).toBeGreaterThan(0)
    expect(normalizeDecorationSettings({ stoneCount: 9999 }).stoneCount).toBe(DECORATION_SETTINGS.stoneCount.max)
    expect(normalizeDecorationSettings({ stoneCount: -3 }).stoneCount).toBe(0)
  })

  it('places about the requested number, mixing sizes, deterministically from the seed', () => {
    const map = grid()
    const layout = buildDecorationLayout(map, pools, opts({ stoneCount: 60 }))
    const placed = stones(layout)
    expect(placed.length).toBeGreaterThan(45)
    expect(placed.length).toBeLessThanOrEqual(60)
    expect(placed.some(cell => cell.group.width > 1)).toBe(true)
    expect(placed.filter(cell => cell.group.width === 1).length).toBeGreaterThan(placed.length / 2)
    const key = l => stones(l).map(c => `${c.group.groupLabel}@${c.anchorX},${c.anchorY}`).join('|')
    expect(key(buildDecorationLayout(map, pools, opts({ stoneCount: 60 })))).toBe(key(layout))
    expect(key(buildDecorationLayout(map, pools, opts({ stoneCount: 60, salt: 12 })))).not.toBe(key(layout))
    expect(stones(buildDecorationLayout(map, pools, opts({ stoneCount: 0 })))).toHaveLength(0)
  })

  it('favours coasts and rock surroundings and stays loosely clustered', () => {
    const map = grid()
    let near = 0
    let total = 0
    let neighbourly = 0
    for (const salt of [1, 2, 3, 4]) {
      const placed = stones(buildDecorationLayout(map, pools, opts({ salt, stoneCount: 80 })))
      for (const cell of placed) {
        total++
        const rock = Math.max(70 - cell.anchorX, cell.anchorX - 75, 60 - cell.anchorY, cell.anchorY - 65) <= 3
        if (cell.anchorX <= 17 || rock) near++
        if (placed.some(other => other !== cell && Math.hypot(other.anchorX - cell.anchorX, other.anchorY - cell.anchorY) <= 6)) neighbourly++
      }
    }
    // The coast band and the rock ring are about 6% of the land; stones there far exceed that share.
    expect(near / total).toBeGreaterThan(0.2)
    expect(neighbourly / total).toBeGreaterThan(0.6)
  })

  it('ships the rocks sheet tagged as stones with a mix of small and multi-tile props', () => {
    const sheet = JSON.parse(readFileSync('public/images/map/sprite_sheets/rocks_64x64_1024x1024_q85.json', 'utf8'))
    expect(sheet.tags).toContain('stones')
    expect(sheet.propLayout.every(prop => prop.tags.includes('stones') && prop.tags.includes('decorative'))).toBe(true)
    expect(sheet.propLayout.filter(prop => prop.w * prop.h === 1).length).toBeGreaterThan(40)
    expect(sheet.propLayout.filter(prop => prop.w * prop.h > 1).length).toBeGreaterThan(20)
    for (const prop of sheet.propLayout.filter(p => p.w * p.h > 1)) expect(prop.tags).toContain(`group_${prop.groupId}`)
  })

  it('never uses the image generator watermark (bottom-right cells) as a stone', () => {
    const sheet = JSON.parse(readFileSync('public/images/map/sprite_sheets/rocks_64x64_1024x1024_q85.json', 'utf8'))
    for (const key of ['14,14', '15,14', '14,15', '15,15']) expect(sheet.tiles[key]).toBeUndefined()
    for (const prop of sheet.propLayout) expect(prop.col + prop.w <= 14 || prop.row + prop.h <= 14).toBe(true)
  })
})
