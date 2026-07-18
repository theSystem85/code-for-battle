import { describe, expect, it } from 'vitest'
import { canPlaceBuilding, isTileValid } from '../../src/validation/buildingPlacement.js'
import { buildOccupancyMap, findPath } from '../../src/units.js'
import {
  getShipyardServiceWaterTiles,
  getShipyardWaterLocalTiles,
  isNavalUnitInShipyardServiceArea
} from '../../src/utils/navalUtils.js'
import { updateShipyardServiceLogic } from '../../src/game/shipyardServiceLogic.js'

function createMap(width, height, type = 'land') {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type, building: null, seedCrystal: false }))
  )
}

describe('naval integration', () => {
  it('requires the lower half of a 4x4 Shipyard footprint to be water', () => {
    const mapGrid = createMap(20, 20)
    for (let y = 7; y <= 9; y++) {
      for (let x = 5; x <= 8; x++) mapGrid[y][x].type = 'water'
    }
    const factories = [{ id: 'player', x: 1, y: 5, width: 3, height: 3 }]

    expect(getShipyardWaterLocalTiles(4, 4)).toHaveLength(8)
    expect(canPlaceBuilding('shipyard', 5, 5, mapGrid, [], [], factories, 'player')).toBe(true)
    expect(isTileValid(5, 5, mapGrid, [], [], factories, 'shipyard', { x: 5, y: 5 })).toBe(true)
    expect(isTileValid(5, 7, mapGrid, [], [], factories, 'shipyard', { x: 5, y: 5 })).toBe(true)

    mapGrid[7][5].type = 'land'
    expect(canPlaceBuilding('shipyard', 5, 5, mapGrid, [], [], factories, 'player')).toBe(false)
  })

  it('finds water-only paths and keeps water terrain free in the occupancy map', () => {
    const mapGrid = createMap(8, 8, 'water')
    mapGrid[3][3].type = 'land'
    const destroyer = {
      id: 'destroyer-1',
      owner: 'player1',
      isNaval: true,
      health: 500,
      x: 32,
      y: 32
    }
    const occupancyMap = buildOccupancyMap([destroyer], mapGrid)
    const path = findPath(
      { x: 1, y: 1, owner: 'player1' },
      { x: 6, y: 6 },
      mapGrid,
      occupancyMap,
      undefined,
      { movementType: 'water', unitOwner: 'player1', strictDestination: true }
    )

    expect(occupancyMap[1][1]).toBe(1)
    expect(occupancyMap[2][2]).toBe(1)
    expect(path.length).toBeGreaterThan(1)
    expect(path.every(tile => mapGrid[tile.y][tile.x].type === 'water')).toBe(true)
  })

  it('clips the three-tile Shipyard service area to water and gates each refill by its support building', () => {
    const mapGrid = createMap(20, 20, 'water')
    const shipyard = {
      type: 'shipyard', owner: 'player1', x: 5, y: 5, width: 4, height: 4,
      health: 450, constructionFinished: true
    }
    const unit = {
      id: 'destroyer-1', owner: 'player1', type: 'destroyer', isNaval: true,
      x: 10 * 32, y: 7 * 32, health: 250, maxHealth: 500,
      gas: 3000, maxGas: 6000, ammunition: 30, maxAmmunition: 60,
      crew: { driver: false, commander: true, loader: true, gunner: true },
      movement: { isMoving: false, currentSpeed: 0 }
    }
    const buildings = [
      shipyard,
      { type: 'gasStation', owner: 'player1', health: 50 },
      { type: 'ammunitionFactory', owner: 'player1', health: 250 },
      { type: 'hospital', owner: 'player1', health: 200 },
      { type: 'vehicleWorkshop', owner: 'player1', health: 300 }
    ]

    expect(isNavalUnitInShipyardServiceArea(unit, shipyard, mapGrid)).toBe(true)
    expect(getShipyardServiceWaterTiles(shipyard, mapGrid)).not.toHaveLength(0)

    updateShipyardServiceLogic([unit], buildings, mapGrid, 10000)

    expect(unit.gas).toBe(unit.maxGas)
    expect(unit.ammunition).toBe(unit.maxAmmunition)
    expect(unit.health).toBe(unit.maxHealth)
    expect(unit.crew.driver).toBe(true)
  })
})
