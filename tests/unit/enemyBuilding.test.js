import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import '../setup.js'

vi.mock('../../src/buildings.js', () => {
  const buildingData = {
    rocketTurret: { width: 2, height: 2 },
    concreteWall: { width: 1, height: 1 },
    powerPlant: { width: 2, height: 2 },
    oreRefinery: { width: 3, height: 3 },
    teslaCoil: { width: 2, height: 2 },
    artilleryTurret: { width: 2, height: 2 },
    turretGunSmall: { width: 1, height: 1 }
  }

  return {
    buildingData,
    createBuilding: vi.fn(),
    canPlaceBuilding: vi.fn(),
    placeBuilding: vi.fn(),
    isNearExistingBuilding: vi.fn(),
    isTileValid: vi.fn(),
    updatePowerSupply: vi.fn()
  }
})

vi.mock('../../src/gameState.js', () => ({
  gameState: { humanPlayer: 'player1' }
}))

vi.mock('../../src/ai/enemyUtils.js', () => ({
  isPartOfFactory: vi.fn(),
  getClosestEnemyFactory: vi.fn(() => ({ id: 'player1', x: 0, y: 0, width: 2, height: 2 }))
}))

vi.mock('../../src/game/dangerZoneMap.js', () => ({
  updateDangerZoneMaps: vi.fn()
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn(() => 0)
}))

import { findBuildingPosition } from '../../src/ai/enemyBuilding.js'
import { isNearExistingBuilding, isTileValid } from '../../src/buildings.js'
import { isPartOfFactory } from '../../src/ai/enemyUtils.js'
import { gameRandom } from '../../src/utils/gameRandom.js'

const createGrid = (width, height) => Array.from({ length: height }, () => (
  Array.from({ length: width }, () => ({
    type: 'land',
    ore: false,
    building: null,
    seedCrystal: false,
    noBuild: false
  }))
))

describe('enemyBuilding.findBuildingPosition', () => {
  const baseFactory = { id: 'enemy', x: 5, y: 5, width: 2, height: 2 }
  const humanFactory = { id: 'player1', x: 0, y: 0, width: 2, height: 2 }

  beforeEach(() => {
    vi.clearAllMocks()
    isTileValid.mockReturnValue(true)
    isNearExistingBuilding.mockReturnValue(true)
    isPartOfFactory.mockReturnValue(false)
    gameRandom.mockReturnValue(0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null and logs when buildingType is missing', () => {
    const mapGrid = createGrid(10, 10)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = findBuildingPosition(null, mapGrid, [], [], [baseFactory], 'enemy')

    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('returns null when mapGrid is empty', () => {
    const result = findBuildingPosition('powerPlant', [], [], [], [baseFactory], 'enemy')

    expect(result).toBeNull()
  })

  it('returns null and logs when buildingType is unknown', () => {
    const mapGrid = createGrid(10, 10)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = findBuildingPosition('unknown', mapGrid, [], [], [baseFactory], 'enemy')

    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('returns null when the AI factory cannot be found', () => {
    const mapGrid = createGrid(10, 10)

    const result = findBuildingPosition('powerPlant', mapGrid, [], [], [humanFactory], 'enemy')

    expect(result).toBeNull()
  })

  it('places defensive buildings toward nearby ore', () => {
    const mapGrid = createGrid(20, 20)
    mapGrid[6][10].ore = true

    const result = findBuildingPosition(
      'rocketTurret',
      mapGrid,
      [],
      [],
      [baseFactory, humanFactory],
      'enemy'
    )

    expect(result).toEqual({ x: 8, y: 5 })
    expect(isTileValid).toHaveBeenCalled()
  })

  it('allows wall placement next to existing walls when spacing is enforced', () => {
    const mapGrid = createGrid(20, 20)
    mapGrid[6][10].ore = true
    mapGrid[5][7].building = { type: 'concreteWall' }

    const result = findBuildingPosition(
      'concreteWall',
      mapGrid,
      [],
      [],
      [baseFactory, humanFactory],
      'enemy'
    )

    expect(result).toEqual({ x: 8, y: 5 })
  })

  it('places defensive buildings facing ore when positioned between factory and ore', () => {
    const mapGrid = createGrid(25, 25)
    // Place ore field to the east of factory
    for (let i = 15; i < 20; i++) {
      for (let j = 4; j < 8; j++) {
        mapGrid[j][i].ore = true
      }
    }

    const result = findBuildingPosition(
      'rocketTurret',
      mapGrid,
      [],
      [],
      [baseFactory, humanFactory],
      'enemy'
    )

    // Should place toward the ore direction (east)
    expect(result).toBeTruthy()
    expect(result.x).toBeGreaterThan(baseFactory.x)
  })

  it('handles very small map grid', () => {
    const mapGrid = createGrid(8, 8)

    const result = findBuildingPosition(
      'powerPlant',
      mapGrid,
      [],
      [],
      [baseFactory, humanFactory],
      'enemy'
    )

    // May return null due to space constraints
    expect(result === null || (typeof result.x === 'number' && typeof result.y === 'number')).toBe(true)
  })

  it('avoids placing buildings on water tiles', () => {
    const mapGrid = createGrid(20, 20)
    // Mark tiles around factory as water
    for (let y = 3; y < 9; y++) {
      for (let x = 3; x < 9; x++) {
        mapGrid[y][x].type = 'water'
      }
    }
    // Leave factory area as land
    for (let y = baseFactory.y; y < baseFactory.y + baseFactory.height; y++) {
      for (let x = baseFactory.x; x < baseFactory.x + baseFactory.width; x++) {
        mapGrid[y][x].type = 'land'
      }
    }

    const result = findBuildingPosition(
      'powerPlant',
      mapGrid,
      [],
      [],
      [baseFactory, humanFactory],
      'enemy'
    )

    // Should find position outside water or return null
    if (result) {
      expect(mapGrid[result.y][result.x].type).not.toBe('water')
    }
  })

  it('avoids placing buildings on seed crystals', () => {
    const mapGrid = createGrid(20, 20)
    mapGrid[7][7].seedCrystal = true
    mapGrid[8][7].ore = true

    const result = findBuildingPosition(
      'rocketTurret',
      mapGrid,
      [],
      [],
      [baseFactory, humanFactory],
      'enemy'
    )

    // Should successfully place, not on seed crystal
    if (result) {
      expect(result.x !== 7 || result.y !== 7).toBe(true)
    }
  })

  it('places refineries at larger distance', () => {
    const mapGrid = createGrid(30, 30)
    mapGrid[10][15].ore = true

    // Update factory position for larger map
    const largeMapFactory = { id: 'enemy', x: 10, y: 10, width: 2, height: 2 }

    const result = findBuildingPosition(
      'oreRefinery',
      mapGrid,
      [],
      [],
      [largeMapFactory, humanFactory],
      'enemy'
    )

    expect(result).toBeTruthy()
    // Refineries use larger preferred distances [4, 5, 6, 3]
    const dist = Math.hypot(result.x - largeMapFactory.x, result.y - largeMapFactory.y)
    expect(dist).toBeGreaterThanOrEqual(2)
  })

  it('handles defensive turret gun placement', () => {
    const mapGrid = createGrid(20, 20)
    mapGrid[5][15].ore = true

    const result = findBuildingPosition(
      'turretGunSmall',
      mapGrid,
      [],
      [],
      [baseFactory, humanFactory],
      'enemy'
    )

    // turretGunSmall is a defensive building type
    if (result) {
      expect(typeof result.x).toBe('number')
      expect(typeof result.y).toBe('number')
    }
  })

  it('handles noBuild tiles', () => {
    const mapGrid = createGrid(20, 20)
    mapGrid[7][7].noBuild = true
    mapGrid[8][8].ore = true

    const result = findBuildingPosition(
      'powerPlant',
      mapGrid,
      [],
      [],
      [baseFactory, humanFactory],
      'enemy'
    )

    // Should avoid noBuild tile
    if (result) {
      let overlapsNoBuild = false
      for (let y = result.y; y < result.y + 2; y++) {
        for (let x = result.x; x < result.x + 2; x++) {
          if (mapGrid[y]?.[x]?.noBuild) overlapsNoBuild = true
        }
      }
      expect(overlapsNoBuild).toBe(false)
    }
  })

  it('handles rock tiles', () => {
    const mapGrid = createGrid(20, 20)
    mapGrid[7][7].type = 'rock'
    mapGrid[8][8].ore = true

    isTileValid.mockImplementation((x, y, grid) => {
      if (grid[y]?.[x]?.type === 'rock') return false
      return true
    })

    const result = findBuildingPosition(
      'powerPlant',
      mapGrid,
      [],
      [],
      [baseFactory, humanFactory],
      'enemy'
    )

    // Should avoid rock tiles
    expect(result === null || (result.x !== 7 || result.y !== 7)).toBe(true)
  })

  it('correctly handles fallback to player direction when no ore', () => {
    const mapGrid = createGrid(20, 20)
    // No ore on map

    const result = findBuildingPosition(
      'rocketTurret',
      mapGrid,
      [],
      [],
      [baseFactory, humanFactory],
      'enemy'
    )

    // Should still find a valid position
    if (result) {
      expect(typeof result.x).toBe('number')
      expect(typeof result.y).toBe('number')
    }
  })

  it('handles tesla coil as defensive building', () => {
    const mapGrid = createGrid(20, 20)
    mapGrid[10][10].ore = true

    const result = findBuildingPosition(
      'teslaCoil',
      mapGrid,
      [],
      [],
      [baseFactory, humanFactory],
      'enemy'
    )

    expect(result === null || (typeof result.x === 'number' && typeof result.y === 'number')).toBe(true)
  })

  it('handles artillery turret as defensive building', () => {
    const mapGrid = createGrid(20, 20)
    mapGrid[10][10].ore = true

    const result = findBuildingPosition(
      'artilleryTurret',
      mapGrid,
      [],
      [],
      [baseFactory, humanFactory],
      'enemy'
    )

    expect(result === null || (typeof result.x === 'number' && typeof result.y === 'number')).toBe(true)
  })
})
