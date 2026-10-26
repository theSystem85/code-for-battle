import { describe, expect, it } from 'vitest'
import {
  canPlaceBuilding,
  isTileValid,
  shouldShowPlacementTileAsValid
} from '../../src/validation/buildingPlacement.js'
import { TILE_SIZE } from '../../src/config.js'

const grid = (width = 20, height = 20, type = 'water') => Array.from(
  { length: height },
  () => Array.from({ length: width }, () => ({ type, building: null, seedCrystal: false, noBuild: false }))
)
const factory = { id: 'player1', x: 1, y: 5, width: 3, height: 3 }

describe('Shipyard placement', () => {
  it('[U06510] accepts an all-water footprint touching coastal land in every direction and at a corner', () => {
    const coastTiles = [[4, 7], [10, 7], [7, 4], [7, 10], [4, 4]]
    for (const [landX, landY] of coastTiles) {
      const mapGrid = grid()
      mapGrid[landY][landX].type = 'land'
      expect(canPlaceBuilding('shipyard', 5, 5, mapGrid, [], [], [factory], 'player1')).toBe(true)
    }
  })

  it('[U06511] rejects land in the footprint, open sea, and occupied water', () => {
    const mapGrid = grid()
    mapGrid[7][4].type = 'land'
    expect(canPlaceBuilding('shipyard', 5, 5, mapGrid, [], [], [factory], 'player1')).toBe(true)

    mapGrid[6][6].type = 'land'
    expect(canPlaceBuilding('shipyard', 5, 5, mapGrid, [], [], [factory], 'player1')).toBe(false)
    mapGrid[6][6].type = 'water'
    mapGrid[7][4].type = 'water'
    expect(canPlaceBuilding('shipyard', 5, 5, mapGrid, [], [], [factory], 'player1')).toBe(false)

    mapGrid[7][4].type = 'land'
    mapGrid[6][6].building = { type: 'wreck' }
    expect(canPlaceBuilding('shipyard', 5, 5, mapGrid, [], [], [factory], 'player1')).toBe(false)
    expect(isTileValid(6, 6, mapGrid, [], [], [factory], 'shipyard', { x: 5, y: 5 })).toBe(false)
  })

  it('[U06512] marks open water green, and land or occupied water red, without changing other overlays', () => {
    expect(shouldShowPlacementTileAsValid('shipyard', true, false)).toBe(true)
    expect(shouldShowPlacementTileAsValid('shipyard', false, true)).toBe(false)
    expect(shouldShowPlacementTileAsValid('powerPlant', true, false)).toBe(false)

    const mapGrid = grid()
    mapGrid[5][5].type = 'land'
    mapGrid[5][6].building = { type: 'wreck' }
    expect(isTileValid(5, 5, mapGrid, [], [], [], 'shipyard', { x: 5, y: 5 })).toBe(false)
    expect(isTileValid(6, 5, mapGrid, [], [], [], 'shipyard', { x: 5, y: 5 })).toBe(false)
    expect(isTileValid(7, 5, mapGrid, [], [], [], 'shipyard', { x: 5, y: 5 })).toBe(true)
  })

  it('[U06503] uses a four-tile Shipyard range while other buildings retain three tiles', () => {
    const waterMap = grid()
    waterMap[5][7].type = 'land'
    const shipyardAnchor = { id: 'player1', x: 4, y: 5, width: 1, height: 1 }
    expect(canPlaceBuilding('shipyard', 8, 5, waterMap, [], [], [shipyardAnchor], 'player1')).toBe(true)

    const landMap = grid(20, 20, 'land')
    const standardAnchor = { id: 'player1', x: 1, y: 5, width: 1, height: 1 }
    expect(canPlaceBuilding('powerPlant', 5, 5, landMap, [], [], [standardAnchor], 'player1')).toBe(false)
  })

  it('[U06504] treats a unit centered on footprint water as a red blocker', () => {
    const mapGrid = grid()
    mapGrid[7][4].type = 'land'
    const unit = { x: 6 * TILE_SIZE, y: 6 * TILE_SIZE }
    expect(isTileValid(6, 6, mapGrid, [unit], [], [], 'shipyard', { x: 5, y: 5 })).toBe(false)
    expect(canPlaceBuilding('shipyard', 5, 5, mapGrid, [unit], [], [factory], 'player1')).toBe(false)
  })
})
