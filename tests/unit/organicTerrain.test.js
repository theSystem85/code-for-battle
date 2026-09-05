import { describe, it, expect } from 'vitest'
import { BLOB_MASKS, normalizeBlobMask, terrainMask, terrainHash, OrganicTerrain } from '../../src/rendering/organicTerrain.js'

describe('organic terrain topology', () => {
  it('covers all 256 neighborhoods with exactly 47 canonical masks', () => {
    expect(BLOB_MASKS).toHaveLength(47)
    for (let mask = 0; mask < 256; mask++) {
      const result = normalizeBlobMask(mask)
      expect(BLOB_MASKS).toContain(result)
      expect(result & 15).toBe(mask & 15)
      for (const [corner, sides] of [[16, 3], [32, 6], [64, 12], [128, 9]]) {
        if (result & corner) expect(result & sides).toBe(sides)
      }
    }
  })
  it('does not connect diagonals across missing sides or runways', () => {
    const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ type: 'street' })))
    grid[0][1].airstripStreet = true
    const snapshot = JSON.stringify(grid)
    expect(terrainMask(grid, 1, 1, 'street')).toBe(110)
    expect(JSON.stringify(grid)).toBe(snapshot)
    expect(terrainMask(grid, 0, 0, 'rock')).toBe(0)
  })
  it('selects stable variants at negative and large coordinates', () => {
    const samples = new Set()
    for (let x = -100; x < 100; x++) {
      expect(terrainHash(x, 10000)).toBe(terrainHash(x, 10000))
      samples.add(terrainHash(x, 10000) % 4)
    }
    expect(samples.size).toBe(4)
  })
  it('renders a 2x2 blocked mass once and preserves its logical cells', () => {
    const grid = Array.from({ length: 2 }, () => Array.from({ length: 2 }, () => ({ type: 'rock' })))
    const calls = []
    const ctx = { drawImage: (...args) => calls.push(args) }
    const terrain = Object.create(OrganicTerrain.prototype)
    terrain.image = {}
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) terrain.drawRock(ctx, grid, x, y, x * 32, y * 32, 32)
    expect(calls).toHaveLength(1)
    expect(calls[0][7]).toBeGreaterThan(64)
    expect(grid.flat().every(tile => tile.type === 'rock')).toBe(true)
  })
})
