import { describe, it, expect, vi } from 'vitest'
import { BLOB_MASKS, biomeTransitionCoverage, normalizeBlobMask, terrainMask, terrainHash, OrganicTerrain, roadVisualMask, roadFringeMask, isCliffChain, cliffConnections, cliffVariant, getSotDrawBounds } from '../../src/rendering/organicTerrain.js'

describe('organic terrain topology', () => {
  it('publishes terrain readiness once after every required asset has decoded', async() => {
    const ready = vi.fn()
    const resolvers = new Map()
    const terrain = new OrganicTerrain(ready, null, {
      assetLoader: (entry) => new Promise(resolve => resolvers.set(entry.key, resolve))
    })

    expect(terrain.ready).toBe(false)
    for (const [key, resolve] of resolvers) {
      if (key !== 'cliffs') resolve({ key, naturalWidth: 64, naturalHeight: 64 })
    }
    await Promise.resolve()
    expect(ready).not.toHaveBeenCalled()
    resolvers.get('cliffs')({ key: 'cliffs', naturalWidth: 64, naturalHeight: 64 })
    await terrain.readiness

    expect(terrain.ready).toBe(true)
    expect(terrain.getProgress()).toMatchObject({ state: 'ready', completed: 7, total: 7 })
    expect(ready).toHaveBeenCalledOnce()
  })

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
  it('draws the selected biome source material as a continuously addressed base tile', () => {
    const source = { complete: true, naturalWidth: 1024, naturalHeight: 1024 }
    const terrain = Object.create(OrganicTerrain.prototype)
    terrain.textureManager = { integratedBiomeTag: 'snow' }
    terrain.biomeImages = { snow: [source], grass: [] }
    const drawImage = vi.fn()

    terrain.drawGrass({ drawImage }, 17, 19, 64, 96, 32)

    expect(drawImage).toHaveBeenCalledWith(source, 544, 608, 32, 32, 64, 96, 32, 32)
  })
  it('uses the oriented SOT alpha as the biome transition mask', () => {
    const terrain = Object.create(OrganicTerrain.prototype)
    terrain.details = { id: 'details' }
    terrain.drawBiome = vi.fn()
    terrain.biomeSotTileCache = new Map()
    const operations = []
    const sotContext = {
      clearRect: vi.fn(),
      drawImage: (...args) => operations.push(args),
      globalCompositeOperation: 'source-over'
    }
    const sotCanvas = { width: 0, height: 0, getContext: () => sotContext }
    const createElement = vi.spyOn(document, 'createElement').mockReturnValueOnce(sotCanvas)
    const output = { drawImage: vi.fn() }

    terrain.drawBiomeSot(output, 3, 7, 96, 224, 32, 'bottom-right', 'sand')

    expect(terrain.drawBiome).toHaveBeenCalledWith(sotContext, 3, 7, 0, 0, 32, 'sand')
    expect(operations).toHaveLength(1)
    expect(operations[0][0]).toBe(terrain.details)
    expect(operations[0][2]).toBe(0)
    expect(output.drawImage).toHaveBeenCalledWith(sotCanvas, 0, 0, 32, 32, 95, 223, 33, 33)
    expect(sotContext.globalCompositeOperation).toBe('source-over')
    createElement.mockRestore()
  })
  it('reuses cached biome SOT composites after the first draw', () => {
    const terrain = Object.create(OrganicTerrain.prototype)
    terrain.biomeSotTileCache = new Map([['32|3|7|bottom-right|sand', { id: 'cached-sot' }]])
    const output = { drawImage: vi.fn() }

    terrain.drawBiomeSot(output, 3, 7, 96, 224, 32, 'bottom-right', 'sand')

    expect(output.drawImage).toHaveBeenCalledWith({ id: 'cached-sot' }, 0, 0, 32, 32, 95, 223, 33, 33)
  })
  it('stitches the exposed side of every outward and inward SOT corner', () => {
    expect(['top-left', 'top-right', 'bottom-right', 'bottom-left'].map(orientation =>
      getSotDrawBounds(100, 200, 32, orientation)
    )).toEqual([
      { x: 100, y: 200, size: 33 },
      { x: 99, y: 200, size: 33 },
      { x: 99, y: 199, size: 33 },
      { x: 100, y: 199, size: 33 }
    ])
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
  it('renders long narrow rock chains exclusively as ordinary boulders', () => {
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
    expect(calls.every(call => call[0] === terrain.details)).toBe(true)
  })
  it('keeps a small L-shaped rock cluster in the boulder pool', () => {
    const grid = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => ({ type: 'land' })))
    for (const [x, y] of [[2, 2], [2, 3], [2, 4], [3, 4], [4, 4]]) grid[y][x].type = 'rock'
    const terrain = Object.create(OrganicTerrain.prototype)
    terrain.cliffs = { complete: true, naturalWidth: 3600 }
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
    terrain.drawCliffs(ctx, grid, 0, 0, 6, 6, 0, 0, 32)
    expect(calls).toHaveLength(5)
    expect(calls.every(call => call[0] === terrain.details)).toBe(true)
  })
  it('uses a continuous macro sprite for aligned two-tile-deep straight runs', () => {
    const grid = Array.from({ length: 9 }, (_, y) => Array.from({ length: 12 }, (_, x) => ({
      type: y >= 3 && y <= 5 && x >= 3 && x <= 6 ? 'rock' : 'land'
    })))
    const terrain = new OrganicTerrain(() => {})
    const calls = []
    terrain.cliffs = { complete: true, naturalWidth: 3600 }
    terrain.details = {}
    const ctx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      rect: () => {},
      clip: () => {},
      drawImage: (...args) => calls.push(args)
    }
    terrain.drawCliffs(ctx, grid, 0, 0, 12, 9, 0, 0, 32)
    expect(calls.some(call => call[0] === terrain.cliffs && call[2] >= 8 * 160 && (call[3] > 160 || call[4] > 160))).toBe(true)
    expect(calls.some(call => call[0] === terrain.cliffs && call[2] >= 8 * 160 && call[3] === 160 && call[4] === 224)).toBe(true)
  })
  it('uses macro artwork for straight segments on every terrace level', () => {
    const grid = Array.from({ length: 15 }, (_, y) => Array.from({ length: 15 }, (_, x) => ({
      type: x >= 2 && x <= 12 && y >= 2 && y <= 12 ? 'rock' : 'land'
    })))
    const terrain = new OrganicTerrain(() => {})
    const calls = []
    terrain.cliffs = { complete: true, naturalWidth: 4096 }
    terrain.details = {}
    const ctx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      rect: () => {},
      clip: () => {},
      drawImage: (...args) => calls.push(args)
    }
    terrain.drawCliffs(ctx, grid, 0, 0, 15, 15, 0, 0, 32)
    const straightCellXs = new Set([3, 6, 9, 12].map(mask => mask * 160))
    const condensedStraightCalls = calls.filter(call => call[0] === terrain.cliffs && call[2] < 1280 && straightCellXs.has(call[1]))
    expect(condensedStraightCalls).toHaveLength(0)
  })
  it('enlarges plateau crack details while retaining the plateau clip', () => {
    const grid = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => ({
      type: x >= 2 && x <= 4 && y >= 2 && y <= 4 ? 'rock' : 'land'
    })))
    const terrain = Object.create(OrganicTerrain.prototype)
    terrain.cliffs = { complete: true, naturalWidth: 4096 }
    terrain.details = {}
    const calls = []
    const ctx = {
      save: () => {}, restore: () => {}, beginPath: () => {}, rect: () => {}, clip: () => {},
      drawImage: (...args) => calls.push(args)
    }
    terrain.drawCliffs(ctx, grid, 0, 0, 7, 7, 0, 0, 32)
    const detailCalls = calls.filter(call => call[0] === terrain.cliffs && call[1] === 16 * 160)
    const plateauDetail = detailCalls[0]
    expect(plateauDetail).toBeDefined()
    expect(detailCalls).toHaveLength(1)
    expect(plateauDetail.slice(-2)).toEqual([160, 160])
    expect(calls.findIndex(call => call === plateauDetail)).toBeLessThan(
      calls.findIndex(call => call[0] === terrain.cliffs && call !== plateauDetail)
    )
  })
  it('keeps cliff palettes constant inside broad geological regions', () => {
    const variants = new Set()
    for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) variants.add(cliffVariant(x, y))
    expect(variants.size).toBe(1)
    expect(cliffVariant(25, 25, 1)).toBe(cliffVariant(25, 25, 5))
  })
  it('connects full roads to the legs of neighboring SOT wedges', () => {
    const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ type: 'land' })))
    grid[0][0].type = grid[0][1].type = grid[1][0].type = 'street'
    expect(roadFringeMask(grid, 1, 1) & 1).toBe(1)
    expect(roadVisualMask(grid, 1, 0) & 4).toBe(4)
    expect(roadVisualMask(grid, 0, 1) & 2).toBe(2)
  })
  it('keeps legacy road fringes on oriented corner triangles', () => {
    const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ type: 'land' })))
    grid[0][0].type = grid[0][1].type = grid[1][0].type = 'street'
    const terrain = Object.create(OrganicTerrain.prototype)
    terrain.drawTriangle = vi.fn()
    terrain.drawRoadFringe({}, grid, 1, 1, 32, 32, 32)
    expect(terrain.drawTriangle).toHaveBeenCalledWith({}, 1, 1, 32, 32, 32, 'top-left', 'street')
  })
  it('shares biome transition endpoints across turned land boundaries', () => {
    const center = [0, 0.5, 0.75, 0]
    const right = [0.5, 1, 1, 0.75]
    const below = [0, 0.75, 1, 0]
    for (let t = 0; t <= 1; t += 0.125) {
      expect(biomeTransitionCoverage(center, 1, t)).toBeCloseTo(biomeTransitionCoverage(right, 0, t), 10)
      expect(biomeTransitionCoverage(center, t, 1)).toBeCloseTo(biomeTransitionCoverage(below, t, 0), 10)
    }
    expect(biomeTransitionCoverage(center, 1, 1)).toBeGreaterThan(0)
    expect(biomeTransitionCoverage(center, 1, 1)).toBeLessThan(1)
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
