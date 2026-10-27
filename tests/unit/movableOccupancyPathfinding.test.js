import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import '../setup.js'
import { TILE_SIZE } from '../../src/config.js'
import { gameState } from '../../src/gameState.js'
import {
  addFixedOccupancy,
  addMovableOccupancy,
  fixedOccupancyCount,
  hasFixedOccupancy,
  hasMovableOccupancy,
  movableOccupancyCount
} from '../../src/game/occupancyTags.js'
import {
  buildOccupancyMap,
  findPath,
  removeUnitOccupancy,
  updateUnitOccupancy
} from '../../src/units.js'
import { MapRenderer } from '../../src/rendering/mapRenderer.js'
import { createTestMapGrid } from '../testUtils.js'
import { createCommandPathOptions } from '../../src/input/unitCommands/commandPathOptions.js'
import { updateGlobalPathfinding } from '../../src/game/pathfinding.js'
import { pathCache } from '../../src/game/pathCache.js'

function landGrid(width, height) {
  const mapGrid = createTestMapGrid(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      mapGrid[y][x].type = 'land'
    }
  }
  return mapGrid
}

function unitAt(tileX, tileY) {
  return { x: tileX * TILE_SIZE, y: tileY * TILE_SIZE, health: 100 }
}

describe('movable occupancy pathfinding', () => {
  beforeEach(() => {
    gameState.unitWrecks = []
  })

  afterEach(() => {
    gameState.unitWrecks = []
    pathCache.clear()
  })

  it.each(['land', 'water', 'amphibious'])('[U07020] avoids movable occupants only for the initial %s order', movementType => {
    const mapGrid = landGrid(12, 9)
    if (movementType === 'water') {
      for (const row of mapGrid) for (const tile of row) tile.type = 'water'
    }
    const unit = { ...unitAt(1, 4), tileX: 1, tileY: 4, owner: 'player1',
      type: movementType === 'amphibious' ? 'hovercraft' : 'tank',
      isNaval: movementType === 'water' }
    const blockers = [3, 4, 5, 6].map(x => ({ ...unitAt(x, 4), isNaval: unit.isNaval }))
    const occupancy = buildOccupancyMap([unit, ...blockers], mapGrid)
    const start = { x: 1, y: 4 }
    const end = { x: 9, y: 4 }
    const options = { ...createCommandPathOptions([unit, ...blockers], mapGrid), movementType }
    const initialPath = findPath(start, end, mapGrid, occupancy, undefined, options)
    expect(initialPath.at(-1)).toEqual(end)
    expect(initialPath.some(tile => tile.y !== 4)).toBe(true)

    // Exhaust the path to force the actual automatic recovery path request.
    unit.moveTarget = end
    unit.path = []
    unit.lastPathCalcTime = 1
    updateGlobalPathfinding([unit], mapGrid, occupancy, {
      humanPlayer: unit.owner, simulationTime: 10000, lastGlobalPathCalc: 0
    })
    expect(unit.path.at(-1)).toEqual(end)
    expect(unit.path.every(tile => tile.y === 4)).toBe(true)

    // A fresh order takes a fresh snapshot and avoids occupants again.
    expect(findPath(start, end, mapGrid, occupancy, undefined, options)).toEqual(initialPath)
  })

  it('[U07019] does not let own movable occupancy block a diagonal departure', () => {
    const mapGrid = landGrid(8, 8)
    const occupancy = buildOccupancyMap([unitAt(2, 2)], mapGrid)
    const path = findPath({ x: 2, y: 2 }, { x: 6, y: 6 }, mapGrid, occupancy,
      undefined, { includeMovableOccupancy: true })
    expect(path).toEqual([{ x: 2, y: 2 }, { x: 6, y: 6 }])
  })

  it('[U05475] tags units and wrecks as movable and buildings as fixed', () => {
    const mapGrid = landGrid(8, 8)
    mapGrid[1][1].type = 'water'
    mapGrid[2][2].building = { type: 'powerPlant' }
    gameState.unitWrecks = [unitAt(4, 4)]

    const occupancy = buildOccupancyMap([unitAt(3, 3)], mapGrid)

    expect(hasFixedOccupancy(occupancy[1][1])).toBe(true)
    expect(hasMovableOccupancy(occupancy[1][1])).toBe(false)
    expect(fixedOccupancyCount(occupancy[2][2])).toBe(1)
    expect(movableOccupancyCount(occupancy[3][3])).toBe(1)
    expect(hasFixedOccupancy(occupancy[3][3])).toBe(false)
    expect(movableOccupancyCount(occupancy[4][4])).toBe(1)
  })

  it('[U05476] routes the shortest path through units and wrecks', () => {
    const mapGrid = landGrid(10, 6)
    gameState.unitWrecks = [unitAt(6, 2)]
    const occupancy = buildOccupancyMap([unitAt(3, 2), unitAt(4, 2)], mapGrid)
    const start = { x: 0, y: 2 }
    const end = { x: 8, y: 2 }

    const path = findPath(start, end, mapGrid, occupancy)
    gameState.unitWrecks = []
    const clearPath = findPath(start, end, mapGrid, buildOccupancyMap([], mapGrid))

    expect(path[0]).toEqual(start)
    expect(path[path.length - 1]).toEqual(end)
    // Smoothing may drop intermediate tiles. Staying on this row means the
    // straight line through the units and the wreck was accepted.
    expect(path.every(tile => tile.y === 2)).toBe(true)
    expect(path).toEqual(clearPath)
  })

  it('[U05477] keeps a destination that is only occupied by a unit', () => {
    const mapGrid = landGrid(8, 8)
    const occupancy = buildOccupancyMap([unitAt(5, 5)], mapGrid)

    const path = findPath({ x: 1, y: 5 }, { x: 5, y: 5 }, mapGrid, occupancy)

    expect(path[path.length - 1]).toEqual({ x: 5, y: 5 })
  })

  it('[U05478] still routes around buildings and other fixed occupancy', () => {
    const mapGrid = landGrid(10, 8)
    mapGrid[3][4].building = { type: 'powerPlant' }
    const occupancy = buildOccupancyMap([], mapGrid)
    for (let x = 1; x <= 7; x++) occupancy[5][x] = addFixedOccupancy(occupancy[5][x], 1)

    const aroundBuilding = findPath({ x: 2, y: 3 }, { x: 6, y: 3 }, mapGrid, occupancy)
    const aroundFixedWall = findPath({ x: 4, y: 2 }, { x: 4, y: 7 }, mapGrid, occupancy)

    expect(aroundBuilding.some(tile => tile.x === 4 && tile.y === 3)).toBe(false)
    expect(aroundBuilding[aroundBuilding.length - 1]).toEqual({ x: 6, y: 3 })
    expect(aroundFixedWall.some(tile => tile.y === 5 && tile.x >= 1 && tile.x <= 7)).toBe(false)
    expect(aroundFixedWall[aroundFixedWall.length - 1]).toEqual({ x: 4, y: 7 })
  })

  it('[U05479] does not let movable occupancy clear a fixed blocker on the same tile', () => {
    const mapGrid = landGrid(6, 6)
    mapGrid[2][2].building = { type: 'powerPlant' }
    const occupancy = buildOccupancyMap([unitAt(2, 2)], mapGrid)

    expect(hasFixedOccupancy(occupancy[2][2])).toBe(true)
    expect(hasMovableOccupancy(occupancy[2][2])).toBe(true)

    const path = findPath({ x: 0, y: 2 }, { x: 4, y: 2 }, mapGrid, occupancy)
    expect(path.some(tile => tile.x === 2 && tile.y === 2)).toBe(false)
  })

  it('[U05480] moves only the movable count and leaves fixed occupancy in place', () => {
    const mapGrid = landGrid(8, 8)
    const occupancy = buildOccupancyMap([], mapGrid)
    occupancy[2][2] = addMovableOccupancy(addFixedOccupancy(0, 1), 1)
    const unit = unitAt(5, 5)

    updateUnitOccupancy(unit, 2, 2, occupancy)

    expect(fixedOccupancyCount(occupancy[2][2])).toBe(1)
    expect(movableOccupancyCount(occupancy[2][2])).toBe(0)
    expect(movableOccupancyCount(occupancy[5][5])).toBe(1)
    expect(hasFixedOccupancy(occupancy[5][5])).toBe(false)

    occupancy[5][5] = addMovableOccupancy(addFixedOccupancy(occupancy[5][5], 1), 0)
    removeUnitOccupancy(unit, occupancy)
    expect(fixedOccupancyCount(occupancy[5][5])).toBe(1)
    expect(movableOccupancyCount(occupancy[5][5])).toBe(0)
  })

  it('[U05481] paints movable occupancy orange and keeps fixed and build-only colors', () => {
    const renderer = new MapRenderer({})
    const occupancyMap = [[
      0,
      addMovableOccupancy(0, 2),
      addFixedOccupancy(0, 1),
      addMovableOccupancy(addFixedOccupancy(0, 1), 1),
      0
    ]]
    const mapGrid = [[
      { type: 'land' },
      { type: 'land' },
      { type: 'land' },
      { type: 'land' },
      { type: 'street', buildOnlyOccupied: 1 }
    ]]
    const fills = []
    const ctx = {
      fillStyle: '',
      fillRect() {
        fills.push(this.fillStyle)
      }
    }

    renderer.renderOccupancyMap(ctx, occupancyMap, 0, 0, 5, 1, { x: 0, y: 0 }, {
      occupancyVisible: true,
      occupancyMapViewMode: 'off',
      mapGrid
    })

    expect(fills).toEqual([
      'rgba(255, 140, 0, 0.55)',
      'rgba(255, 0, 0, 0.3)',
      'rgba(255, 0, 0, 0.3)',
      'rgba(255, 255, 0, 0.35)'
    ])
  })
})
