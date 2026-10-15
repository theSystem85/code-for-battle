import { describe, it, expect } from 'vitest'
import {
  buildDecorationLayout,
  buildDecorationPools,
  getValidDecorationCell,
  summarizeDecorationLayout
} from '../../src/rendering/decorationLayout.js'

function group(label, width, height, tags) {
  const tilesByOffset = {}
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tilesByOffset[`${x},${y}`] = { tags: [...tags, label], rect: { x: x * 64, y: y * 64, width: 64, height: 64 } }
    }
  }
  return { groupLabel: label, width, height, area: width * height, tilesByOffset, tagSet: new Set(tags) }
}

const GROUPS = [
  group('forest', 3, 3, ['grass', 'decorative', 'summer']),
  group('lake', 3, 3, ['grass', 'decorative', 'summer', 'water', 'impassable']),
  group('springForest', 3, 2, ['grass', 'decorative', 'spring']),
  group('bush', 1, 1, ['grass', 'decorative', 'summer']),
  group('frozenLake', 2, 2, ['snow', 'decorative', 'winter', 'water', 'impassable']),
  group('snowTree', 1, 1, ['snow', 'decorative', 'winter']),
  group('logs', 2, 1, ['universal', 'decorative'])
]

function makeGrid(width, height, cellAt) {
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => cellAt(x, y)))
}

describe('decoration layout', () => {
  it('splits groups into per-biome multi-tile and 1x1 pools, respecting seasons', () => {
    const pools = buildDecorationPools(GROUPS)
    expect(pools.grass.multi.map(g => g.groupLabel)).toEqual(expect.arrayContaining(['forest', 'lake', 'logs']))
    expect(pools.grass.multi.map(g => g.groupLabel)).not.toContain('springForest')
    expect(pools.grass.single.map(g => g.groupLabel)).toEqual(['bush'])
    expect(pools.snow.multi.map(g => g.groupLabel)).toEqual(expect.arrayContaining(['frozenLake', 'logs']))
    expect(pools.snow.multi.map(g => g.groupLabel)).not.toContain('lake')
    // Larger sprites first.
    expect(pools.grass.multi[0].width * pools.grass.multi[0].height).toBe(9)
  })

  it('drops universal sprites that are mostly painted ground', () => {
    const clearing = { ...group('clearing', 3, 3, ['universal', 'decorative']), coverage: 0.9 }
    const logs = { ...group('logs2', 2, 1, ['universal', 'decorative']), coverage: 0.2 }
    const pools = buildDecorationPools([clearing, logs])
    expect(pools.snow.multi.map(g => g.groupLabel)).toEqual(['logs2'])
  })

  it('places multi-tile sprites first without overlaps, inside one biome, deterministically', () => {
    const pools = buildDecorationPools(GROUPS)
    const grid = makeGrid(80, 80, (x, y) => ({
      type: (x === 40 || y === 40) ? 'street' : 'land',
      biome: x < 30 ? 'grass' : 'snow'
    }))
    const layout = buildDecorationLayout(grid, pools)
    const again = buildDecorationLayout(grid, pools)
    expect(again.placements.map(p => `${p.group.groupLabel}@${p.anchorX},${p.anchorY}`))
      .toEqual(layout.placements.map(p => `${p.group.groupLabel}@${p.anchorX},${p.anchorY}`))

    const summary = summarizeDecorationLayout(layout)
    expect(summary.multiTile).toBeGreaterThan(10)
    expect(summary.singles).toBeGreaterThan(0)
    expect(summary.impassableMultiTile).toBeGreaterThan(0)

    const owner = new Map()
    layout.placements.forEach((placement, index) => {
      const { group: g, anchorX, anchorY, biome } = placement
      for (let gy = 0; gy < g.height; gy++) {
        for (let gx = 0; gx < g.width; gx++) {
          const key = `${anchorX + gx},${anchorY + gy}`
          expect(owner.has(key)).toBe(false)
          owner.set(key, index)
          const tile = grid[anchorY + gy][anchorX + gx]
          expect(tile.type).toBe('land')
          expect(tile.biome).toBe(biome)
        }
      }
    })
    // Every covered cell resolves to the right part of its sprite.
    const first = layout.placements[0]
    const cell = getValidDecorationCell(layout, grid, first.anchorX + first.group.width - 1, first.anchorY)
    expect(cell.offsetX).toBe(first.group.width - 1)
  })

  it('skips ore, buildings and airstrip cells and leaves undecorated cells empty', () => {
    const pools = buildDecorationPools(GROUPS)
    const grid = makeGrid(50, 50, (x) => ({ type: 'land', biome: 'grass', ore: x % 2 === 0 }))
    const layout = buildDecorationLayout(grid, pools)
    layout.cells.forEach((cell, index) => {
      if (!cell) return
      expect(grid[Math.floor(index / 50)][index % 50].ore).toBe(false)
    })
    expect(layout.placements.length).toBe(0)
    expect(layout.cells.some(cell => cell === null)).toBe(true)
  })

  it('stays fast on a large map', () => {
    const pools = buildDecorationPools(GROUPS)
    const grid = makeGrid(300, 300, (x, y) => ({ type: (x * y) % 17 === 0 ? 'water' : 'land', biome: x < 150 ? 'grass' : 'snow' }))
    const start = performance.now()
    buildDecorationLayout(grid, pools)
    expect(performance.now() - start).toBeLessThan(500)
  })
})
