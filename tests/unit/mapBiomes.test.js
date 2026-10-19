import { describe, expect, it } from 'vitest'
import { assignMapBiomes, upgradeBiomeTransitions } from '../../src/game/mapBiomes.js'
import { biomeTransitionCoverage } from '../../src/rendering/organicTerrain.js'

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
  it('[U02561] is deterministic and creates organic blended region boundaries', () => {
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

  it('[U02562] adds transition metadata where biome regions meet only diagonally', () => {
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

  it('[U02563] uses four-color-style region assignment to avoid matching adjacent regions', () => {
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

  it('[U02564] adds sand only beside ocean-connected water and not an enclosed lake', () => {
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

  it('[U02565] uses corner-weighted biome blending around every inland shoreline edge', () => {
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

  it('[U02566] treats plateau snow as an independent overlay setting', () => {
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

  it('[U02567] keeps plateau snow dominant over shoreline sand', () => {
    const grid = makeGrid(20, 20)
    for (let x = 0; x < 20; x++) grid[0][x].type = 'water'
    for (let y = 1; y <= 5; y++) for (let x = 5; x <= 9; x++) grid[y][x].type = 'rock'
    assignMapBiomes(grid, 9, { ...mixedSettings, mapBiomeRegionCount: 1, mapShorelineWidth: 4, mapSnowOnPlateaus: true })
    expect(grid[2][7].biome).toBe('snow')
    expect(grid[2][7].biomeBlend).toBeUndefined()
  })

  it('[U02568] keeps the sand coastline source when snow covers a shore plateau', () => {
    const grid = makeGrid(20, 20)
    for (let x = 0; x < 20; x++) grid[0][x].type = 'water'
    for (let y = 1; y <= 5; y++) for (let x = 5; x <= 9; x++) grid[y][x].type = 'rock'
    assignMapBiomes(grid, 10, { ...mixedSettings, mapBiomeRegionCount: 1, mapShorelineWidth: 4, mapSnowOnPlateaus: true })

    expect(grid[1][5].biome).toBe('snow')
    expect(grid[1][5].shorelineBiome).toBe('sand')
    expect(grid[5][9].biome).toBe('snow')
  })

  it('[U02569] uses the configured shoreline width in tiles', () => {
    const grid = makeGrid(20, 20)
    for (let x = 0; x < 20; x++) grid[0][x].type = 'water'
    assignMapBiomes(grid, 10, { ...mixedSettings, mapBiomeRegionCount: 1, mapBiomeWeights: { grass: 100, soil: 0, sand: 20, snow: 0 }, mapSnowOnPlateaus: false, mapShorelineWidth: 3 })
    expect(grid[3][10].biomeBlend?.biome).toBe('sand')
    expect(grid[4][10].biomeBlend?.biome).not.toBe('sand')
  })
})

function materialCoverage(tile, u, v) {
  const result = { grass: 0, soil: 0, sand: 0, snow: 0 }
  const layers = tile.biomeBlend?.layers
  result[layers?.[0]?.biome || tile.biome] = 1
  for (const layer of layers?.slice(1) || []) {
    const alpha = biomeTransitionCoverage(layer.cornerWeights, u, v, layer.underlayWeights)
    for (const biome of Object.keys(result)) result[biome] *= 1 - alpha
    result[layer.biome] += alpha
  }
  return Object.values(result)
}

it('[U05411] keeps every material continuous across curved shores and multi-biome junctions', () => {
  const grid = makeGrid(60, 60)
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    if (x < 5 + Math.floor(3 * Math.sin(y / 4))) grid[y][x].type = 'water'
  }
  const topology = grid.map(row => row.map(tile => tile.type))
  assignMapBiomes(grid, 9123, { ...mixedSettings, mapBiomeRegionCount: 32 })
  let junctions = 0, shorelineEdges = 0
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    const tile = grid[y][x]
    if (tile.type === 'water') continue
    if (tile.biomeBlend?.layers?.length >= 3) junctions++
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const neighbor = grid[y + dy]?.[x + dx]
      if (!neighbor || neighbor.type === 'water') continue
      if (tile.shorelineBiome || neighbor.shorelineBiome) shorelineEdges++
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const left = materialCoverage(tile, dx ? 1 : t, dy ? 1 : t)
        const right = materialCoverage(neighbor, dx ? 0 : t, dy ? 0 : t)
        left.forEach((coverage, i) => expect(coverage).toBeCloseTo(right[i], 10))
        expect(left.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10)
      }
    }
  }
  expect(junctions).toBeGreaterThan(0)
  expect(shorelineEdges).toBeGreaterThan(0)
  expect(grid.map(row => row.map(tile => tile.type))).toEqual(topology)
})

it('[U05412] upgrades old single-source transitions once without changing prepared layer identities', () => {
  const grid = makeGrid(3, 3)
  for (const row of grid) for (const tile of row) tile.biome = 'grass'
  grid[1][1].biomeBlend = { biome: 'sand', alpha: 0.5, cornerWeights: [0.5, 1, 1, 0.5] }
  upgradeBiomeTransitions(grid)
  expect(grid[1][1].biomeBlend.layers.map(layer => layer.biome)).toEqual(['grass', 'sand'])
  const layers = grid[1][1].biomeBlend.layers
  upgradeBiomeTransitions(grid)
  expect(grid[1][1].biomeBlend.layers).toBe(layers)
})
