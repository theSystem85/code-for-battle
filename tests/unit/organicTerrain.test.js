import { describe, it, expect } from 'vitest'
import { BLOB_MASKS, normalizeBlobMask, terrainMask, terrainHash, OrganicTerrain, roadVisualMask, roadFringeMask, isCliffChain, cliffConnections } from '../../src/rendering/organicTerrain.js'

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
  it('uses cliffs for chains in all eight directions, preserving every blocked cell', () => {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const grid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({ type: 'land' })))
      for (let n = -2; n <= 2; n++) grid[4 + dy * n][4 + dx * n].type = 'rock'
      const before = JSON.stringify(grid)
      expect(isCliffChain(grid, 4, 4)).toBe(true)
      expect(isCliffChain(grid, 4 - dx * 2, 4 - dy * 2)).toBe(true)
      expect(cliffConnections(grid, 4, 4)).not.toBe(0)
      const terrain = Object.create(OrganicTerrain.prototype)
      const calls = []
      terrain.drawRock({ drawImage: (...args) => calls.push(args) }, grid, 4, 4, 128, 128, 32)
      expect(calls).toHaveLength(1)
      expect(calls[0][7]).toBe(64)
      expect(JSON.stringify(grid)).toBe(before)
    }
  })
  it('keeps isolated pairs as boulders', () => {
    const grid = [[{ type: 'rock' }, { type: 'rock' }]]
    expect(isCliffChain(grid, 0, 0)).toBe(false)
    expect(isCliffChain(grid, 1, 0)).toBe(false)
  })
  it('renders narrow rock chains exclusively as ordinary boulders', () => {
    const grid = Array.from({ length: 5 }, (_, y) => Array.from({ length: 7 }, (_, x) => ({
      type: y === 2 && x >= 2 && x <= 4 ? 'rock' : 'land'
    })))
    const terrain = Object.create(OrganicTerrain.prototype)
    terrain.cliffs = { complete: true, naturalWidth: 2720 }
    terrain.details = { id: 'details' }
    const calls = []
    const ctx = {
      save: () => {},
      beginPath: () => {},
      rect: () => {},
      clip: () => {},
      restore: () => {},
      drawImage: (...args) => calls.push(args)
    }
    terrain.drawCliffs(ctx, grid, 0, 0, 7, 5, 0, 0, 32)
    expect(calls).toHaveLength(3)
    expect(calls.every(call => call[2] === 2304 && call[3] === 48 && call[4] === 48)).toBe(true)
  })
  it('connects full roads to the legs of neighboring SOT wedges', () => {
    const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ type: 'land' })))
    grid[0][0].type = grid[0][1].type = grid[1][0].type = 'street'
    expect(roadFringeMask(grid, 1, 1) & 1).toBe(1)
    expect(roadVisualMask(grid, 1, 0) & 4).toBe(4)
    expect(roadVisualMask(grid, 0, 1) & 2).toBe(2)
  })
  it('does not place a ground lip across a connected water SOT leg', () => {
    const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ type: 'water' })))
    grid[1][2].type = 'land'
    const sot = Array.from({ length: 3 }, () => Array(3).fill(null))
    sot[1][2] = { type: 'water', orientation: 'top-left' }
    const terrain = Object.create(OrganicTerrain.prototype)
    const calls = []
    const ctx = { drawImage: (...args) => calls.push(args) }
    terrain.drawCoast(ctx, grid, 1, 1, 32, 32, 32, null, sot)
    expect(calls).toHaveLength(0)
    sot[1][2] = null
    terrain.drawCoast(ctx, grid, 1, 1, 32, 32, 32, null, sot)
    expect(calls).toHaveLength(1)
  })

})
