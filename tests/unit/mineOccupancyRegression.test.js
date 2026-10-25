import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../setup.js'
vi.mock('../../src/main.js', () => ({ units: [], factories: [], bullets: [] }))
vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [], cleanupDestroyedSelectedUnits: vi.fn() }))
vi.mock('../../src/sound.js', () => ({ playSound: vi.fn(), playPositionalSound: vi.fn(() => Promise.resolve(null)), audioContext: null, getMasterVolume: () => 0 }))

import { gameState } from '../../src/gameState.js'
import { createUnit, findPath, findPathForOwner } from '../../src/units.js'
import { updateUnitPosition } from '../../src/game/movementCore.js'
import { deployMine, updateMines, rebuildMineLookup, getMineAtTile } from '../../src/game/mineSystem.js'
import { getCachedPath } from '../../src/game/pathfinding.js'
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
