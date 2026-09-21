import { describe, expect, it } from 'vitest'
import { assignMapBiomes } from '../../src/game/mapBiomes.js'

function makeGrid(width, height, type = 'land') {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => ({ type })))
}

const mixedSettings = {
  activeSpriteSheetBiomeTag: 'mixed',
  mapBiomeRegionCount: 16,
  mapBiomeDistribution: 'random',
  mapBiomeWeights: { grass: 25, soil: 25, sand: 25, snow: 25 },
  mapSnowOnPlateaus: false
}

describe('mixed map biomes', () => {
  it('is deterministic and creates organic blended region boundaries', () => {
    const first = makeGrid(60, 60)
    const second = makeGrid(60, 60)
    assignMapBiomes(first, 9123, mixedSettings)
    assignMapBiomes(second, 9123, mixedSettings)

    expect(first.map(row => row.map(tile => [tile.biome, tile.biomeRegion, tile.biomeBlend]))).toEqual(
      second.map(row => row.map(tile => [tile.biome, tile.biomeRegion, tile.biomeBlend]))
    )
    expect(new Set(first.flat().map(tile => tile.biome)).size).toBeGreaterThanOrEqual(3)
    expect(first.flat().filter(tile => tile.biomeBlend?.alpha > 0).length).toBeGreaterThan(20)
  })

  it('adds transition metadata where biome regions meet only diagonally', () => {
    const grid = makeGrid(80, 80)
    assignMapBiomes(grid, 9123, { ...mixedSettings, mapBiomeRegionCount: 32 })
    const regionBiomes = new Map()
    for (const tile of grid.flat()) {
      if (!regionBiomes.has(tile.biomeRegion)) regionBiomes.set(tile.biomeRegion, tile.biomeBlend?.biome || tile.biome)
    }
    let diagonalOnlyTransitions = 0
    let fractionalCornerTransitions = 0
    for (let y = 1; y < grid.length - 1; y++) for (let x = 1; x < grid[0].length - 1; x++) {
      const tile = grid[y][x]
      if (!tile.biomeBlend) continue
      expect(tile.biomeBlend.cornerWeights).toHaveLength(4)
      if (tile.biomeBlend.cornerWeights.some(weight => weight > 0 && weight < 1)) fractionalCornerTransitions++
      const isLowerDifferentRegion = (dx, dy) => {
        const neighbor = grid[y + dy][x + dx]
        return neighbor.biomeRegion < tile.biomeRegion &&
          regionBiomes.get(neighbor.biomeRegion) !== regionBiomes.get(tile.biomeRegion)
      }
      const cardinal = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => isLowerDifferentRegion(dx, dy))
      const diagonal = [[-1, -1], [1, -1], [1, 1], [-1, 1]].some(([dx, dy]) => isLowerDifferentRegion(dx, dy))
      if (!cardinal && diagonal) diagonalOnlyTransitions++
    }
    expect(diagonalOnlyTransitions).toBeGreaterThan(0)
    expect(fractionalCornerTransitions).toBeGreaterThan(diagonalOnlyTransitions)
  })

  it('uses four-color-style region assignment to avoid matching adjacent regions', () => {
    const grid = makeGrid(70, 70)
    assignMapBiomes(grid, 44, mixedSettings)
    const regionBiomes = new Map()
    for (const tile of grid.flat()) {
      if (!regionBiomes.has(tile.biomeRegion)) regionBiomes.set(tile.biomeRegion, tile.biomeBlend ? tile.biomeBlend.biome : tile.biome)
    }
    let sharedEdges = 0
    let matchingRegionEdges = 0
    let validTransitionEdges = 0
    for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[0].length; x++) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const neighbor = grid[y + dy]?.[x + dx]
        if (!neighbor || neighbor.biomeRegion === grid[y][x].biomeRegion) continue
        sharedEdges++
        if (regionBiomes.get(neighbor.biomeRegion) === regionBiomes.get(grid[y][x].biomeRegion)) matchingRegionEdges++
        if (neighbor.biome === grid[y][x].biome && (neighbor.biomeBlend || grid[y][x].biomeBlend)) validTransitionEdges++
      }
    }
    expect(sharedEdges).toBeGreaterThan(0)
    expect(matchingRegionEdges / sharedEdges).toBeLessThan(0.08)
    expect(validTransitionEdges).toBeGreaterThan(0)
  })

  it('adds sand only beside ocean-connected water and not an enclosed lake', () => {
    const grid = makeGrid(40, 40)
    for (let y = 0; y < 40; y++) grid[y][0].type = 'water'
    for (let y = 18; y <= 21; y++) for (let x = 18; x <= 21; x++) grid[y][x].type = 'water'
    assignMapBiomes(grid, 5, {
      ...mixedSettings,
      mapBiomeWeights: { grass: 100, soil: 0, sand: 20, snow: 0 }
    })

    expect(grid[20][2].biome === 'sand' || grid[20][2].biomeBlend?.biome === 'sand').toBe(true)
    expect(grid[20][17].biome).toBe('grass')
    expect(grid[20][17].biomeBlend?.biome).not.toBe('sand')
  })

  it('uses corner-weighted biome blending around every inland shoreline edge', () => {
    const cases = [
      ['north', grid => { for (let x = 0; x < 24; x++) grid[0][x].type = 'water' }, 2, 12, [1, 1, 0.5, 0.5]],
      ['south', grid => { for (let x = 0; x < 24; x++) grid[23][x].type = 'water' }, 21, 12, [0.5, 0.5, 1, 1]],
      ['west', grid => { for (let y = 0; y < 24; y++) grid[y][0].type = 'water' }, 12, 2, [1, 0.5, 0.5, 1]],
      ['east', grid => { for (let y = 0; y < 24; y++) grid[y][23].type = 'water' }, 12, 21, [0.5, 1, 1, 0.5]]
    ]
    for (const [name, setup, y, x, expectedCornerWeights] of cases) {
      const grid = makeGrid(24, 24)
      setup(grid)
      assignMapBiomes(grid, 123, {
        ...mixedSettings,
        mapBiomeRegionCount: 1,
        mapBiomeWeights: { grass: 100, soil: 0, sand: 20, snow: 0 }
      })
      const blend = grid[y][x].biomeBlend
      expect(blend?.biome, name).toBe('sand')
      expect(blend.cornerWeights, name).toEqual(expectedCornerWeights)
    }
  })

  it('treats plateau snow as an independent overlay setting', () => {
    const grid = makeGrid(15, 15)
    for (let y = 5; y <= 9; y++) for (let x = 5; x <= 9; x++) grid[y][x].type = 'rock'
    assignMapBiomes(grid, 8, {
      activeSpriteSheetBiomeTag: 'soil',
      mapSnowOnPlateaus: true
    })

    for (let y = 5; y <= 9; y++) for (let x = 5; x <= 9; x++) {
      expect(grid[y][x].biome).toBe('snow')
    }
    expect(grid[2][2].biome).toBe('soil')
  })

  it('keeps plateau snow dominant over shoreline sand', () => {
    const grid = makeGrid(20, 20)
    for (let x = 0; x < 20; x++) grid[0][x].type = 'water'
    for (let y = 1; y <= 5; y++) for (let x = 5; x <= 9; x++) grid[y][x].type = 'rock'
    assignMapBiomes(grid, 9, { ...mixedSettings, mapBiomeRegionCount: 1, mapShorelineWidth: 4, mapSnowOnPlateaus: true })
    expect(grid[2][7].biome).toBe('snow')
    expect(grid[2][7].biomeBlend).toBeUndefined()
  })

  it('keeps the sand coastline source when snow covers a shore plateau', () => {
    const grid = makeGrid(20, 20)
    for (let x = 0; x < 20; x++) grid[0][x].type = 'water'
    for (let y = 1; y <= 5; y++) for (let x = 5; x <= 9; x++) grid[y][x].type = 'rock'
    assignMapBiomes(grid, 10, { ...mixedSettings, mapBiomeRegionCount: 1, mapShorelineWidth: 4, mapSnowOnPlateaus: true })

    expect(grid[1][5].biome).toBe('snow')
    expect(grid[1][5].shorelineBiome).toBe('sand')
    expect(grid[5][9].biome).toBe('snow')
  })

  it('uses the configured shoreline width in tiles', () => {
    const grid = makeGrid(20, 20)
    for (let x = 0; x < 20; x++) grid[0][x].type = 'water'
    assignMapBiomes(grid, 10, { ...mixedSettings, mapBiomeRegionCount: 1, mapBiomeWeights: { grass: 100, soil: 0, sand: 20, snow: 0 }, mapSnowOnPlateaus: false, mapShorelineWidth: 3 })
    expect(grid[3][10].biomeBlend?.biome).toBe('sand')
    expect(grid[4][10].biomeBlend?.biome).not.toBe('sand')
  })
})
