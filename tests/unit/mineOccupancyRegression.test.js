import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../setup.js'
vi.mock('../../src/main.js', () => ({ units: [], factories: [], bullets: [] }))
vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [], cleanupDestroyedSelectedUnits: vi.fn() }))
vi.mock('../../src/sound.js', () => ({ playSound: vi.fn(), playPositionalSound: vi.fn(() => Promise.resolve(null)), audioContext: null, getMasterVolume: () => 0 }))

import { gameState } from '../../src/gameState.js'
import { createUnit, findPath, findPathForOwner } from '../../src/units.js'
import { updateUnitPosition } from '../../src/game/movementCore.js'
import { deployMine, updateMines, rebuildMineLookup, getMineAtTile } from '../../src/game/mineSystem.js'
import { getCachedPath, updateGlobalPathfinding } from '../../src/game/pathfinding.js'
import { pathCache } from '../../src/game/pathCache.js'
import { beginFactoryExit, updateFactoryExits, FACTORY_EXIT_DURATION } from '../../src/game/factoryExit.js'
import { TILE_SIZE } from '../../src/config.js'
import { canPlaceBuilding, isTileValid } from '../../src/validation/buildingPlacement.js'
import { addFixedOccupancy, addMovableOccupancy } from '../../src/game/occupancyTags.js'

describe('mine triggering and movable placement occupancy', () => {
  beforeEach(() => {
    gameState.mapGrid = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ type: 'land' })))
    gameState.occupancyMap = Array.from({ length: 16 }, () => Array(16).fill(0))
    gameState.mines = []
    gameState.explosions = []
    gameState.buildings = []
    gameState.unitWrecks = []
    gameState.simulationTime = 10000
    rebuildMineLookup()
    pathCache.clear()
  })

  it.each(['player1', 'player2'])('[U05493] detonates an armed mine crossed between waypoints for owner %s', owner => {
    const mine = deployMine(6, 5, 'player1')
    updateMines(mine.armedAt)
    const tank = createUnit({ id: owner }, 'tank_v1', 5, 5)
    tank.direction = 0
    tank.path = [{ x: 8, y: 5 }]
    tank.moveTarget = { x: 8, y: 5 }
    const health = tank.health
    for (let tick = 0; tick < 200 && gameState.mines.length; tick++) {
      updateUnitPosition(tank, gameState.mapGrid, gameState.occupancyMap, 10000 + tick * 16, [tank], gameState)
    }
    expect(getMineAtTile(6, 5)).toBeNull()
    expect(tank.health).toBeLessThan(health)
    expect(gameState.explosions).toHaveLength(1)
  })

  function driveAcrossMine(type, unitOwner, mineOwner, sweeping) {
    gameState.mines = []
    gameState.explosions = []
    rebuildMineLookup()
    const mine = deployMine(6, 5, mineOwner)
    updateMines(mine.armedAt)
    const unit = createUnit({ id: unitOwner }, type, 5, 5)
    unit.sweeping = sweeping
    unit.direction = 0
    unit.path = [{ x: 8, y: 5 }]
    unit.moveTarget = { x: 8, y: 5 }
    const health = unit.health
    for (let tick = 0; tick < 800 && unit.tileX < 7; tick++) {
      updateUnitPosition(unit, gameState.mapGrid, gameState.occupancyMap, 10000 + tick * 16, [unit], gameState)
    }
    return { mine, unit, health }
  }

  it('[U05504] does not detonate faction mines under a mine layer or mine sweeper', () => {
    const cases = [
      ['mineLayer', 'player1', 'player1', false],
      ['mineSweeper', 'player1', 'player1', false],
      ['mineSweeper', 'player1', 'player1', true],
      ['mineLayer', 'player1', 'player', false],
      ['mineSweeper', 'player', 'player1', true]
    ]
    for (const [type, unitOwner, mineOwner, sweeping] of cases) {
      const { mine, unit, health } = driveAcrossMine(type, unitOwner, mineOwner, sweeping)
      expect(unit.tileX, `${type}/${unitOwner}/${mineOwner}/sweeping=${sweeping}`).toBeGreaterThanOrEqual(7)
      expect(getMineAtTile(6, 5)).toBe(mine)
      expect(mine.active).toBe(true)
      expect(unit.health).toBe(health)
      expect(gameState.explosions).toHaveLength(0)
    }
  })

  it('[U05505] still detonates enemy mines under a mine layer and unowned mines under a sweeping sweeper', () => {
    const enemy = driveAcrossMine('mineLayer', 'player2', 'player1', false)
    expect(enemy.unit.tileX).toBeGreaterThanOrEqual(6)
    expect(getMineAtTile(6, 5)).toBeNull()
    expect(enemy.unit.health).toBeLessThan(enemy.health)
    expect(gameState.explosions).toHaveLength(1)

    gameState.mines = []
    gameState.explosions = []
    rebuildMineLookup()
    const loose = deployMine(6, 5, 'player1')
    loose.owner = null
    updateMines(loose.armedAt)
    const sweeper = createUnit({ id: 'player1' }, 'mineSweeper', 5, 5)
    sweeper.sweeping = true
    sweeper.direction = 0
    sweeper.path = [{ x: 8, y: 5 }]
    sweeper.moveTarget = { x: 8, y: 5 }
    const health = sweeper.health
    for (let tick = 0; tick < 800 && gameState.mines.length; tick++) {
      updateUnitPosition(sweeper, gameState.mapGrid, gameState.occupancyMap, 10000 + tick * 16, [sweeper], gameState)
    }
    expect(getMineAtTile(6, 5)).toBeNull()
    expect(sweeper.health).toBeLessThan(health)
  })

  it('[U05506] routes mine layers and sweepers through their own armed mine field and still blocks tanks', () => {
    for (let y = 0; y < 16; y++) deployMine(6, y, 'player1')
    updateMines(gameState.mines[0].armedAt)
    for (const type of ['mineLayer', 'mineSweeper']) {
      pathCache.clear()
      const unit = createUnit({ id: 'player1' }, type, 3, 5)
      unit.moveTarget = { x: 10, y: 5 }
      unit.path = []
      updateGlobalPathfinding([unit], gameState.mapGrid, gameState.occupancyMap, gameState)
      expect(unit.path.at(-1), type).toEqual({ x: 10, y: 5 })
      expect(unit.path.some(tile => tile.x >= 6), type).toBe(true)
    }
    pathCache.clear()
    const tank = createUnit({ id: 'player1' }, 'tank_v1', 3, 5)
    tank.moveTarget = { x: 10, y: 5 }
    tank.path = []
    updateGlobalPathfinding([tank], gameState.mapGrid, gameState.occupancyMap, gameState)
    expect(tank.path.some(tile => tile.x >= 6)).toBe(false)
  })

  it('[U05507] rallies a mine layer through its own armed mine field', () => {
    for (let y = 0; y < 16; y++) deployMine(8, y, 'player1')
    updateMines(gameState.mines[0].armedAt)
    const factory = { id: 'factory', owner: 'player1', type: 'vehicleFactory', x: 3, y: 3, health: 100 }
    const layer = createUnit({ id: 'player1' }, 'mineLayer', 3, 6)
    beginFactoryExit(layer, factory, { x: 12, y: 6 })
    updateFactoryExits([layer], [factory], gameState.mapGrid, gameState.occupancyMap, FACTORY_EXIT_DURATION, false, findPath)
    expect(layer.factoryExit).toBeUndefined()
    expect(layer.path.at(-1)).toEqual({ x: 12, y: 6 })
    const layerRoute = [{ x: layer.tileX, y: layer.tileY }, ...layer.path]
    expect(layerRoute.some((tile, index) => {
      if (tile.x === 8) return true
      const previous = layerRoute[index - 1]
      return Boolean(previous && ((previous.x < 8 && tile.x > 8) || (previous.x > 8 && tile.x < 8)))
    })).toBe(true)

    const tank = createUnit({ id: 'player1' }, 'tank_v1', 3, 6)
    beginFactoryExit(tank, factory, { x: 12, y: 6 })
    updateFactoryExits([tank], [factory], gameState.mapGrid, gameState.occupancyMap, FACTORY_EXIT_DURATION, false, findPath)
    expect(tank.path.at(-1)).not.toEqual({ x: 12, y: 6 })
  })

  it('[U05494] avoids friendly mine fields while allowing enemy paths and invalidates paths when mines arm', () => {
    const start = { x: 3, y: 5, owner: 'player1' }
    const end = { x: 10, y: 5 }
    for (let y = 0; y < 16; y++) deployMine(6, y, 'player1')
    expect(getCachedPath(start, end, gameState.mapGrid, null).at(-1)).toEqual(end)
    updateMines(gameState.mines[0].armedAt)
    expect(pathCache.size).toBe(0)
    expect(findPathForOwner(start, end, gameState.mapGrid, null, 'player1').some(tile => tile.x >= 6)).toBe(false)
    expect(findPathForOwner(start, end, gameState.mapGrid, null, 'player2').at(-1)).toEqual(end)
  })

  it('[U05497] routes factory rally paths through a gap in a friendly mine field', () => {
    for (let y = 0; y < 16; y++) if (y !== 2) deployMine(8, y, 'player1')
    updateMines(gameState.mines[0].armedAt)
    const factory = { id: 'factory', owner: 'player1', type: 'vehicleFactory', x: 3, y: 3, health: 100 }
    const tank = createUnit({ id: 'player1' }, 'tank_v1', 3, 6)
    beginFactoryExit(tank, factory, { x: 12, y: 6 })
    updateFactoryExits([tank], [factory], gameState.mapGrid, gameState.occupancyMap, FACTORY_EXIT_DURATION, false, findPath)
    expect(tank.factoryExit).toBeUndefined()
    expect(tank.path.length).toBeGreaterThan(0)
    expect(tank.path.at(-1)).toEqual({ x: 12, y: 6 })
    expect(tank.path.some(tile => tile.y === 2)).toBe(true)
  })

  it('[U05495] blocks placement and overlay on movable occupants, including mixed occupancy, and permits cleared tiles', () => {
    for (const value of [addMovableOccupancy(0), addMovableOccupancy(addFixedOccupancy(0))]) {
      gameState.occupancyMap[5][5] = value
      expect(canPlaceBuilding('street', 5, 5, gameState.mapGrid, [], [], [], 'player1', { mapEditMode: true })).toBe(false)
      expect(isTileValid(5, 5, gameState.mapGrid, [], [], [], 'street')).toBe(false)
    }
    gameState.occupancyMap[5][5] = 0
    expect(canPlaceBuilding('street', 5, 5, gameState.mapGrid, [], [], [], 'player1', { mapEditMode: true })).toBe(true)
    expect(isTileValid(5, 5, gameState.mapGrid, [], [], [], 'street')).toBe(true)
  })

  it('[U05496] uses center occupancy and ignores occupancy belonging to a different map', () => {
    const tank = { x: 5 * TILE_SIZE - TILE_SIZE / 4, y: 5 * TILE_SIZE, health: 100 }
    expect(canPlaceBuilding('street', 5, 5, gameState.mapGrid, [tank], [], [], 'player1', { mapEditMode: true })).toBe(false)
    gameState.occupancyMap[5][5] = addMovableOccupancy(0)
    const otherMap = gameState.mapGrid.map(row => row.map(tile => ({ ...tile })))
    expect(canPlaceBuilding('street', 5, 5, otherMap, [], [], [], 'player1', { mapEditMode: true })).toBe(true)
  })
})
