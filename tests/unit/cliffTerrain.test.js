import { describe, it, expect } from 'vitest'
import { buildCliffDepth, cliffContourMask, isPlateauTile, CLIFF_LEVELS } from '../../src/rendering/cliffTerrain.js'

const plateau = (size, margin = 1) => Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => ({ type: x >= margin && y >= margin && x < size - margin && y < size - margin ? 'rock' : 'land' })))

describe('terraced cliff elevation', () => {
  it('raises wider interiors with three contour levels and never changes gameplay tiles', () => {
    const grid = plateau(17), before = JSON.stringify(grid)
    const depth = buildCliffDepth(grid, 0, 0, 17, 17)
    const value = (x, y) => depth.values[(y - depth.top) * depth.width + x - depth.left]
    expect([0, 1, 2, 3, 4, 5, 8].map(x => value(x, 8))).toEqual([0, 1, 2, 3, 4, 5, 5])
    expect(CLIFF_LEVELS).toEqual([1, 3, 5])
    expect(cliffContourMask(depth, 7, 7, 1)).toBe(15)
    expect(cliffContourMask(depth, 7, 7, 5)).toBe(15)
    expect(JSON.stringify(grid)).toBe(before)
  })
  it('requires a solid three-tile width before classifying rocks as plateau', () => {
    const narrow = Array.from({ length: 9 }, (_, y) => Array.from({ length: 9 }, (_, x) => ({ type: x === 4 || y === 4 ? 'rock' : 'land' })))
    const wide = plateau(9, 3)
    const narrowDepth = buildCliffDepth(narrow, 0, 0, 9, 9)
    const wideDepth = buildCliffDepth(wide, 0, 0, 9, 9)
    expect(narrow.flatMap((row, y) => row.map((tile, x) => tile.type === 'rock' && isPlateauTile(narrowDepth, x, y))).some(Boolean)).toBe(false)
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) {
      expect(isPlateauTile(wideDepth, x, y)).toBe(true)
    }
    expect(cliffContourMask(wideDepth, 2, 2, 1)).not.toBe(0)
  })
  it('gives identical terrace contours when baked from neighboring chunk patches', () => {
    const grid = plateau(48)
    grid[19][20].type = 'land'
    const a = buildCliffDepth(grid, 0, 0, 24, 24)
    const b = buildCliffDepth(grid, 16, 0, 40, 24)
    for (let y = 1; y < 23; y++) for (let x = 17; x < 23; x++) for (const level of CLIFF_LEVELS) {
      expect(cliffContourMask(a, x, y, level)).toBe(cliffContourMask(b, x, y, level))
    }
  })
  it('responds to holes and map boundaries without stale elevation state', () => {
    const grid = plateau(17, 0)
    const before = buildCliffDepth(grid, 0, 0, 17, 17)
    grid[8][8].type = 'water'
    const after = buildCliffDepth(grid, 0, 0, 17, 17)
    expect(cliffContourMask(before, 7, 7, 5)).toBe(15)
    expect(cliffContourMask(after, 7, 7, 5)).toBe(0)
    expect(cliffContourMask(after, -1, -1, 1)).toBe(4)
  })

  it('never classifies a non-rock tile as part of a plateau', () => {
    const grid = plateau(11)
    grid[5][5].type = 'land'
    const depth = buildCliffDepth(grid, 0, 0, 11, 11)
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
      if (isPlateauTile(depth, x, y)) expect(grid[y][x].type).toBe('rock')
    }
  })
})
