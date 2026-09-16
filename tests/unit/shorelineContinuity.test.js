import { describe, it, expect } from 'vitest'
import { shorelineCornerMask, shorelineCoverage } from '../../src/rendering/organicTerrain.js'

describe('organic shoreline junctions', () => {
  for (const beachPattern of [false, true]) for (const inward of [false, true]) for (let rotation = 0; rotation < 4; rotation++) {
    it(`${beachPattern ? 'beach' : 'smooth'} ${inward ? 'inward' : 'outward'} corner ${rotation} connects across every edge`, () => {
      let grid = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => ({
        type: ((x < 3 && y < 3) !== inward) ? 'land' : 'water'
      })))
      for (let r = 0; r < rotation; r++) grid = grid[0].map((_, x) => grid.map(row => row[x]).reverse())
      const maskAt = (x, y) => grid[y][x].type === 'land' ? 15 : shorelineCornerMask(grid, x, y)
      let partial = 0
      for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) {
        const mask = maskAt(x, y)
        for (let i = 0; i <= 32; i++) {
          const t = i / 32
          expect(shorelineCoverage(mask, 1, t, 0.2, beachPattern)).toBeCloseTo(shorelineCoverage(maskAt(x + 1, y), 0, t, 0.2, beachPattern), 10)
          expect(shorelineCoverage(mask, t, 1, 0.2, beachPattern)).toBeCloseTo(shorelineCoverage(maskAt(x, y + 1), t, 0, 0.2, beachPattern), 10)
          const alpha = shorelineCoverage(mask, t, t, 0.2, beachPattern)
          if (alpha > 0 && alpha < 1) partial++
        }
      }
      expect(partial).toBeGreaterThan(0)
    })
  }

  it('moves the visibly irregular contour to straight sand/water edges', () => {
    const straightTopLandMask = 3
    const smoothSamples = [0.125, 0.375, 0.625, 0.875].map(u => shorelineCoverage(straightTopLandMask, u, 0.5))
    const beachSamples = [0.125, 0.375, 0.625, 0.875].map(u => shorelineCoverage(straightTopLandMask, u, 0.5, 0.2, true))

    expect(new Set(smoothSamples.map(value => value.toFixed(8))).size).toBe(1)
    expect(new Set(beachSamples.map(value => value.toFixed(8))).size).toBeGreaterThan(1)
  })
})
