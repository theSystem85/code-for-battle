import { describe, expect, it } from 'vitest'
import { canPlaceBuilding, isTileValid } from '../../src/validation/buildingPlacement.js'
import { buildOccupancyMap, findPath } from '../../src/units.js'
import {
  getShipyardServiceWaterTiles,
  getShipyardWaterLocalTiles,
  isNavalUnitInShipyardServiceArea,
  addShipWake,
  DESTROYER_RENDER_LENGTH_TILES,
  DESTROYER_HULL_LENGTH_RATIO
} from '../../src/utils/navalUtils.js'
import { TILE_SIZE } from '../../src/config.js'
import { updateShipyardServiceLogic } from '../../src/game/shipyardServiceLogic.js'

function createMap(width, height, type = 'land') {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type, building: null, seedCrystal: false }))
  )
}

describe('naval integration', () => {
  it('requires the lower three rows of the 5x5 Shipyard footprint to be water', () => {
    const mapGrid = createMap(20, 20)
    for (let y = 7; y <= 10; y++) {
      for (let x = 5; x <= 9; x++) mapGrid[y][x].type = 'water'
    }
    const factories = [{ id: 'player', x: 1, y: 5, width: 3, height: 3 }]

    expect(getShipyardWaterLocalTiles(5, 5)).toHaveLength(15)
    expect(canPlaceBuilding('shipyard', 5, 5, mapGrid, [], [], factories, 'player')).toBe(true)
    expect(isTileValid(5, 5, mapGrid, [], [], factories, 'shipyard', { x: 5, y: 5 })).toBe(true)
    expect(isTileValid(5, 7, mapGrid, [], [], factories, 'shipyard', { x: 5, y: 5 })).toBe(true)

    mapGrid[7][5].type = 'land'
    expect(canPlaceBuilding('shipyard', 5, 5, mapGrid, [], [], factories, 'player')).toBe(false)
  })

  it('anchors a large stern V and smaller bow V to the rendered hull endpoints', () => {
    const unit = {
      isNaval: true,
      x: 5 * TILE_SIZE,
      y: 4 * TILE_SIZE,
      direction: 0,
      movement: { isMoving: true, currentSpeed: 0.4 }
    }
    const state = { shipWakes: [] }

    addShipWake(unit, state, 1000)

    expect(state.shipWakes).toHaveLength(2)
    const stern = state.shipWakes.find(wake => wake.kind === 'stern')
    const bow = state.shipWakes.find(wake => wake.kind === 'bow')
    const centerX = unit.x + TILE_SIZE / 2
    const hullOffset = TILE_SIZE * (DESTROYER_RENDER_LENGTH_TILES / 2) * DESTROYER_HULL_LENGTH_RATIO
    expect(stern.x).toBeCloseTo(centerX - hullOffset)
    expect(bow.x).toBeCloseTo(centerX + hullOffset)
    expect(stern.size).toBeGreaterThan(bow.size)
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
      type: 'shipyard', owner: 'player1', x: 5, y: 5, width: 5, height: 5,
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
