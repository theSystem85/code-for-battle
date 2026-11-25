import { describe, expect, it, vi } from 'vitest'
import {
  PLACEMENT_OVERLAY_GREEN,
  PLACEMENT_OVERLAY_ORANGE,
  PLACEMENT_OVERLAY_RED,
  canPlaceBuilding,
  isTileValid,
  placementTileOverlayFill,
  shouldShowPlacementTileAsValid
} from '../../src/validation/buildingPlacement.js'
import { TILE_SIZE } from '../../src/config.js'
import { UIRenderer } from '../../src/rendering/uiRenderer.js'
import { getValidShipyardChainLength } from '../../src/planning/blueprintPlanning.js'

vi.mock('../../src/main.js', () => ({ getCurrentGame: () => null }))
vi.mock('../../src/mapEditor.js', () => ({ renderMapEditorOverlay: vi.fn() }))
vi.mock('../../src/buildings.js', async() => ({
  ...await import('../../src/validation/buildingPlacement.js'),
  ...await import('../../src/data/buildingData.js')
}))

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

  it('[U06512] colors clear, out-of-range, and blocked footprint tiles', () => {
    expect(shouldShowPlacementTileAsValid('shipyard', true, true)).toBe(true)
    expect(shouldShowPlacementTileAsValid('shipyard', true, false)).toBe(false)
    expect(shouldShowPlacementTileAsValid('shipyard', false, true)).toBe(false)
    expect(shouldShowPlacementTileAsValid('powerPlant', true, true)).toBe(true)
    expect(shouldShowPlacementTileAsValid('powerPlant', true, false)).toBe(false)
    expect(placementTileOverlayFill(true, true)).toBe(PLACEMENT_OVERLAY_GREEN)
    expect(placementTileOverlayFill(true, false)).toBe(PLACEMENT_OVERLAY_ORANGE)
    expect(placementTileOverlayFill(false, true)).toBe(PLACEMENT_OVERLAY_RED)
    expect(placementTileOverlayFill(false, false)).toBe(PLACEMENT_OVERLAY_RED)

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

  it('[U07359] renders a fully green preview only when the shipyard footprint can be placed', () => {
    const mapGrid = grid()
    mapGrid[7][3].type = 'land'
    const state = { buildingPlacementMode: true, currentBuildingType: 'shipyard', humanPlayer: 'player1' }
    const renderer = new UIRenderer()

    function preview(x, y, units = []) {
      state.cursorX = x * TILE_SIZE
      state.cursorY = y * TILE_SIZE
      const fills = []
      const ctx = {
        fillRect() { fills.push(this.fillStyle) },
        strokeRect() {},
        fillText() {}
      }
      renderer.renderBuildingPlacement(ctx, state, { x: 0, y: 0 }, [], [factory], mapGrid, units)
      return fills
    }

    expect(preview(5, 5)).toEqual(Array(25).fill(PLACEMENT_OVERLAY_ORANGE))
    expect(canPlaceBuilding('shipyard', 5, 5, mapGrid, [], [], [factory], 'player1')).toBe(false)
    expect(preview(4, 5)).toEqual(Array(25).fill(PLACEMENT_OVERLAY_GREEN))
    expect(canPlaceBuilding('shipyard', 4, 5, mapGrid, [], [], [factory], 'player1')).toBe(true)
    const units = [{ x: 4 * TILE_SIZE, y: 5 * TILE_SIZE }]
    expect(preview(4, 5, units)).toContain(PLACEMENT_OVERLAY_RED)
    expect(canPlaceBuilding('shipyard', 4, 5, mapGrid, units, [], [factory], 'player1')).toBe(false)
  })

  it('[U07360] stops chain placement at the first shipyard without a valid shoreline footprint', () => {
    const mapGrid = grid(30)
    mapGrid[4][6].type = 'land'
    mapGrid[4][16].type = 'land'
    const state = { humanPlayer: 'player1', blueprints: [] }
    const positions = [{ x: 5, y: 5 }, { x: 10, y: 5 }, { x: 15, y: 5 }]
    expect(getValidShipyardChainLength(positions, mapGrid, [], [], [factory], state)).toBe(1)
    mapGrid[4][11].type = 'land'
    expect(getValidShipyardChainLength(positions, mapGrid, [], [], [factory], state)).toBe(3)
  })
})
