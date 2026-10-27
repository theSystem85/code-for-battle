import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/benchmark/benchmarkRunner.js', () => ({ attachBenchmarkButton: vi.fn() }))
vi.mock('../../src/benchmark/benchmarkScenario.js', () => ({
  setupBenchmarkScenario: vi.fn(),
  teardownBenchmarkScenario: vi.fn()
}))
vi.mock('../../src/main.js', () => ({
  getCurrentGame: vi.fn(() => null),
  factories: [],
  mapGrid: [],
  units: [],
  bullets: []
}))
vi.mock('../../src/game/gameOrchestrator.js', () => ({}))

import { findBuildingPosition } from '../../src/ai/enemyBuilding.js'
import { findSimpleBuildingPosition } from '../../src/ai/enemyAIPlayer.js'
import { prepareCityBuildings } from '../../src/game/cityBuildings.js'
import {
  PLACEMENT_OVERLAY_GREEN,
  PLACEMENT_OVERLAY_ORANGE,
  PLACEMENT_OVERLAY_RED,
  canPlaceBuilding,
  isBuildingFootprintInBuildRange,
  isDecorativeBuildBlocker,
  isTileValid,
  placementTileOverlayFill
} from '../../src/validation/buildingPlacement.js'

const factory = { id: 'player1', owner: 'player1', x: 1, y: 1, width: 3, height: 3 }
const aiFactory = { id: 'ai1', owner: 'ai1', x: 4, y: 4, width: 3, height: 3 }

function grid(width, height, type = 'land') {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => ({
    type,
    biome: 'grass',
    building: null,
    seedCrystal: false,
    noBuild: false
  })))
}

function emptyLayout(width, height) {
  const count = width * height
  return {
    width,
    height,
    cells: Array(count).fill(null),
    groundDetails: Array(count).fill(null),
    cityStreets: []
  }
}

function stamp(layout, anchorX, anchorY, tags, width = 1, height = 1) {
  const group = {
    width,
    height,
    tagSet: new Set(['grass', 'decorative', ...tags]),
    tilesByOffset: {}
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      layout.cells[(anchorY + y) * layout.width + (anchorX + x)] = {
        group,
        anchorX,
        anchorY,
        offsetX: x,
        offsetY: y,
        biome: 'grass',
        footprintWidth: width,
        footprintHeight: height
      }
    }
  }
  return group
}

function publish(map, layout) {
  prepareCityBuildings(map, layout)
  return map
}

describe('placement overlay and decorative blockers', () => {
  it('[U06572] colors open tiles green inside base range and orange outside it', () => {
    const map = grid(20, 20)
    const near = isBuildingFootprintInBuildRange('powerPlant', 4, 4, [], [factory], 'player1')
    const far = isBuildingFootprintInBuildRange('powerPlant', 12, 12, [], [factory], 'player1')
    expect(near).toBe(true)
    expect(far).toBe(false)
    expect(isTileValid(4, 4, map, [], [], [], 'powerPlant')).toBe(true)
    expect(placementTileOverlayFill(true, near)).toBe(PLACEMENT_OVERLAY_GREEN)
    expect(placementTileOverlayFill(true, far)).toBe(PLACEMENT_OVERLAY_ORANGE)
    expect(canPlaceBuilding('powerPlant', 4, 4, map, [], [], [factory], 'player1')).toBe(true)
    expect(canPlaceBuilding('powerPlant', 12, 12, map, [], [], [factory], 'player1')).toBe(false)
    expect(isBuildingFootprintInBuildRange('powerPlant', 12, 12, [], [factory], 'player1', { mapEditMode: true })).toBe(true)
  })

  it('[U06573] keeps a blocked tile red when the rest of an in-range footprint is green', () => {
    const map = grid(20, 20)
    const layout = emptyLayout(20, 20)
    stamp(layout, 6, 4, ['stones', 'passable'])
    publish(map, layout)

    expect(isDecorativeBuildBlocker(map, 6, 4)).toBe(true)
    expect(isTileValid(4, 4, map, [], [], [], 'powerPlant')).toBe(true)
    expect(isTileValid(6, 4, map, [], [], [], 'powerPlant')).toBe(false)
    expect(isBuildingFootprintInBuildRange('powerPlant', 4, 4, [], [factory], 'player1')).toBe(true)
    expect(placementTileOverlayFill(true, true)).toBe(PLACEMENT_OVERLAY_GREEN)
    expect(placementTileOverlayFill(false, true)).toBe(PLACEMENT_OVERLAY_RED)
    expect(canPlaceBuilding('powerPlant', 4, 4, map, [], [], [factory], 'player1')).toBe(false)
    expect(canPlaceBuilding('concreteWall', 4, 4, map, [], [], [factory], 'player1')).toBe(true)
  })

  it('[U06574] rejects player placement on living city buildings and stones, including non-anchor tiles', () => {
    const map = grid(20, 20)
    const layout = emptyLayout(20, 20)
    stamp(layout, 5, 4, ['city', 'impassable'], 2, 2)
    stamp(layout, 4, 5, ['stones', 'impassable'], 1, 1)
    publish(map, layout)

    for (const [x, y] of [[5, 4], [6, 4], [5, 5], [6, 5], [4, 5]]) {
      expect(isTileValid(x, y, map, [], [], [], 'concreteWall')).toBe(false)
      expect(canPlaceBuilding('concreteWall', x, y, map, [], [], [factory], 'player1')).toBe(false)
    }
    expect(canPlaceBuilding('concreteWall', 4, 4, map, [], [], [factory], 'player1')).toBe(true)

    const city = map[4][5].cityBuilding
    city.health = 0
    expect(isDecorativeBuildBlocker(map, 5, 4)).toBe(false)
    expect(isDecorativeBuildBlocker(map, 6, 5)).toBe(false)
    expect(canPlaceBuilding('concreteWall', 5, 4, map, [], [], [factory], 'player1')).toBe(true)
    expect(isDecorativeBuildBlocker(map, 4, 5)).toBe(true)
  })

  it('[U06575] rejects an offshore stone on water for a shipyard and colors out-of-range water orange', () => {
    const map = grid(20, 20, 'water')
    map[7][4].type = 'land'
    const layout = emptyLayout(20, 20)
    stamp(layout, 6, 6, ['stones', 'offshore'])
    publish(map, layout)

    expect(isTileValid(6, 6, map, [], [], [], 'shipyard', { x: 5, y: 5 })).toBe(false)
    expect(isTileValid(7, 5, map, [], [], [], 'shipyard', { x: 5, y: 5 })).toBe(true)
    expect(canPlaceBuilding('shipyard', 5, 5, map, [], [], [factory], 'player1')).toBe(false)

    map[6][6].type = 'water'
    layout.cells[6 * 20 + 6] = null
    const distant = { id: 'player1', owner: 'player1', x: 0, y: 0, width: 1, height: 1 }
    const inRange = isBuildingFootprintInBuildRange('shipyard', 5, 5, [], [factory], 'player1')
    const outOfRange = isBuildingFootprintInBuildRange('shipyard', 5, 5, [], [distant], 'player1')
    expect(inRange).toBe(true)
    expect(outOfRange).toBe(false)
    expect(placementTileOverlayFill(isTileValid(7, 5, map, [], [], [], 'shipyard', { x: 5, y: 5 }), inRange)).toBe(PLACEMENT_OVERLAY_GREEN)
    expect(placementTileOverlayFill(isTileValid(7, 5, map, [], [], [], 'shipyard', { x: 5, y: 5 }), outOfRange)).toBe(PLACEMENT_OVERLAY_ORANGE)
    expect(placementTileOverlayFill(isTileValid(4, 7, map, [], [], [], 'shipyard', { x: 5, y: 5 }), inRange)).toBe(PLACEMENT_OVERLAY_RED)
    expect(canPlaceBuilding('shipyard', 5, 5, map, [], [], [factory], 'player1')).toBe(true)
    expect(canPlaceBuilding('shipyard', 5, 5, map, [], [], [distant], 'player1')).toBe(false)
  })

  it('[U06576] makes enemy placement search skip city buildings and stones', () => {
    const blocked = grid(24, 24)
    const blockedLayout = emptyLayout(24, 24)
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) stamp(blockedLayout, x, y, ['stones', 'impassable'])
    }
    publish(blocked, blockedLayout)
    expect(findBuildingPosition('powerPlant', blocked, [], [], [aiFactory], 'ai1')).toBeNull()
    expect(findSimpleBuildingPosition('powerPlant', blocked, [], [aiFactory], 'ai1')).toBeNull()

    const open = grid(24, 24)
    const openLayout = emptyLayout(24, 24)
    stamp(openLayout, 6, 4, ['city', 'impassable'], 2, 2)
    stamp(openLayout, 10, 4, ['stones', 'passable'])
    publish(open, openLayout)

    const advanced = findBuildingPosition('powerPlant', open, [], [], [aiFactory], 'ai1')
    const simple = findSimpleBuildingPosition('powerPlant', open, [], [aiFactory], 'ai1')
    for (const position of [advanced, simple]) {
      expect(position).toBeTruthy()
      for (let y = position.y; y < position.y + 3; y++) {
        for (let x = position.x; x < position.x + 3; x++) {
          expect(isDecorativeBuildBlocker(open, x, y)).toBe(false)
        }
      }
    }
  })
})
