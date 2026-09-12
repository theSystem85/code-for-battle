import { describe, it, expect } from 'vitest'
import { buildCliffDepth, cliffContourMask, CLIFF_LEVELS } from '../../src/rendering/cliffTerrain.js'

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
  it('preserves all directional cases including diagonal saddles and reversed height', () => {
    for (let mask = 0; mask < 16; mask++) {
      const grid = plateau(4, 4)
      for (const [bit, x, y] of [[1, 1, 1], [2, 2, 1], [4, 2, 2], [8, 1, 2]]) grid[y][x].type = mask & bit ? 'rock' : 'land'
      expect(cliffContourMask(buildCliffDepth(grid, 0, 0, 4, 4), 1, 1, 1)).toBe(mask)
    }
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
})
