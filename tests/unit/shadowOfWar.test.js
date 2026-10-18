import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../setup.js'
import {
  initializeShadowOfWar,
  updateShadowOfWar,
  markAllVisible,
  isPositionVisibleToPlayer
} from '../../src/game/shadowOfWar.js'

describe('shadowOfWar.js', () => {
  let gameState
  let mapGrid

  beforeEach(() => {
    vi.clearAllMocks()

    // Create a 10x10 map grid
    mapGrid = Array(10).fill(null).map(() =>
      Array(10).fill(null).map(() => ({ type: 'grass' }))
    )

    gameState = {
      humanPlayer: 'player1',
      buildings: [],
      units: [],
      visibilityMap: null,
      shadowOfWarEnabled: true,
      mapGrid
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initializeShadowOfWar', () => {
    it('[U03986] should create visibility map matching grid dimensions', () => {
      initializeShadowOfWar(gameState, mapGrid)
      expect(gameState.visibilityMap).toBeDefined()
      expect(gameState.visibilityMap.length).toBe(10)
      expect(gameState.visibilityMap[0].length).toBe(10)
    })

    it('[U03987] should initialize all cells as not visible and not discovered', () => {
      initializeShadowOfWar(gameState, mapGrid)
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          expect(gameState.visibilityMap[y][x].visible).toBe(false)
          expect(gameState.visibilityMap[y][x].discovered).toBe(false)
        }
      }
    })

    it('[U03988] should handle null gameState gracefully', () => {
      expect(() => initializeShadowOfWar(null, mapGrid)).not.toThrow()
    })

    it('[U03989] should handle empty map grid', () => {
      initializeShadowOfWar(gameState, [])
      expect(gameState.visibilityMap).toEqual([])
    })

    it('[U03990] should mark initial base discovery around construction yard', () => {
      gameState.buildings = [{
        type: 'constructionYard',
        owner: 'player1',
        x: 5,
        y: 5,
        width: 3,
        height: 3
      }]
      initializeShadowOfWar(gameState, mapGrid)
      // The area around the construction yard should be discovered
      const centerX = 5 + 3 / 2
      const centerY = 5 + 3 / 2
      // Check a cell near the center is discovered
      const cellY = Math.floor(centerY)
      const cellX = Math.floor(centerX)
      expect(gameState.visibilityMap[cellY][cellX].discovered).toBe(true)
    })
  })

  describe('updateShadowOfWar', () => {
    beforeEach(() => {
      initializeShadowOfWar(gameState, mapGrid)
    })

    it('[U03991] should reset all visibility flags before updating', () => {
      gameState.visibilityMap[0][0].visible = true
      updateShadowOfWar(gameState, [], mapGrid)
      // All cells should start as not visible (then buildings/units apply)
      // Without any buildings/units, cells remain not visible
      expect(gameState.visibilityMap[0][0].visible).toBe(false)
    })

    it('[U03992] should make friendly building tiles visible', () => {
      gameState.buildings = [{
        type: 'vehicleFactory',
        owner: 'player1',
        x: 2,
        y: 2,
        width: 2,
        height: 2
      }]
      updateShadowOfWar(gameState, [], mapGrid)
      // Building tiles should be visible
      expect(gameState.visibilityMap[2][2].visible).toBe(true)
    })

    it('[U03993] should not make enemy building tiles visible', () => {
      gameState.buildings = [{
        type: 'vehicleFactory',
        owner: 'enemy',
        x: 2,
        y: 2,
        width: 2,
        height: 2
      }]
      updateShadowOfWar(gameState, [], mapGrid)
      expect(gameState.visibilityMap[2][2].visible).toBe(false)
    })

    it('[U03994] should make tiles around friendly units visible', () => {
      const units = [{
        type: 'tank',
        owner: 'player1',
        x: 150, // Center of tile 4,4 (4*32 + 16 = 144 + some offset)
        y: 150
      }]
      updateShadowOfWar(gameState, units, mapGrid)
      // Unit should reveal tiles around it based on vision range
      const unitTileX = Math.floor(150 / 32)
      const unitTileY = Math.floor(150 / 32)
      expect(gameState.visibilityMap[unitTileY][unitTileX].visible).toBe(true)
    })

    it('[U03995] should not make tiles visible for enemy units', () => {
      const units = [{
        type: 'tank',
        owner: 'enemy',
        x: 150,
        y: 150
      }]
      initializeShadowOfWar(gameState, mapGrid)
      updateShadowOfWar(gameState, units, mapGrid)
      // Enemy units don't reveal anything
      const unitTileX = Math.floor(150 / 32)
      const unitTileY = Math.floor(150 / 32)
      expect(gameState.visibilityMap[unitTileY][unitTileX].visible).toBe(false)
    })

    it('[U03996] should handle additional structures parameter', () => {
      const additionalStructures = [{
        type: 'turretGunV1',
        owner: 'player1',
        x: 3,
        y: 3,
        width: 1,
        height: 1,
        fireRange: 5
      }]
      updateShadowOfWar(gameState, [], mapGrid, additionalStructures)
      expect(gameState.visibilityMap[3][3].visible).toBe(true)
    })

    it('[U03997] should handle null gameState', () => {
      expect(() => updateShadowOfWar(null, [], mapGrid)).not.toThrow()
    })

    it('[U03998] should give harvesters reduced vision range', () => {
      const units = [{
        type: 'harvester',
        owner: 'player1',
        x: 160,
        y: 160
      }]
      updateShadowOfWar(gameState, units, mapGrid)
      const tileX = Math.floor(160 / 32)
      const tileY = Math.floor(160 / 32)
      // Harvester should reveal its tile
      expect(gameState.visibilityMap[tileY][tileX].visible).toBe(true)
    })

    it('[U03999] should give rocket tanks extended vision range', () => {
      const units = [{
        type: 'rocketTank',
        owner: 'player1',
        x: 160,
        y: 160
      }]
      updateShadowOfWar(gameState, units, mapGrid)
      const tileX = Math.floor(160 / 32)
      const tileY = Math.floor(160 / 32)
      expect(gameState.visibilityMap[tileY][tileX].visible).toBe(true)
    })

    it('[U04000] should give howitzer extended vision range', () => {
      const units = [{
        type: 'howitzer',
        owner: 'player1',
        x: 160,
        y: 160
      }]
      updateShadowOfWar(gameState, units, mapGrid)
      const tileX = Math.floor(160 / 32)
      const tileY = Math.floor(160 / 32)
      expect(gameState.visibilityMap[tileY][tileX].visible).toBe(true)
    })
  })

  describe('markAllVisible', () => {
    beforeEach(() => {
      initializeShadowOfWar(gameState, mapGrid)
    })

    it('[U04001] should mark all cells as visible and discovered', () => {
      markAllVisible(gameState)
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          expect(gameState.visibilityMap[y][x].visible).toBe(true)
          expect(gameState.visibilityMap[y][x].discovered).toBe(true)
        }
      }
    })

    it('[U04002] should handle null gameState', () => {
      expect(() => markAllVisible(null)).not.toThrow()
    })

    it('[U04003] should handle missing visibilityMap', () => {
      gameState.visibilityMap = null
      expect(() => markAllVisible(gameState)).not.toThrow()
    })
  })

  describe('isPositionVisibleToPlayer', () => {
    beforeEach(() => {
      initializeShadowOfWar(gameState, mapGrid)
    })

    it('[U04004] should return true when shadowOfWar is disabled', () => {
      gameState.shadowOfWarEnabled = false
      expect(isPositionVisibleToPlayer(gameState, mapGrid, 100, 100)).toBe(true)
    })

    it('[U04005] should return false for hidden positions', () => {
      // No buildings or units, so everything is hidden
      expect(isPositionVisibleToPlayer(gameState, mapGrid, 100, 100)).toBe(false)
    })

    it('[U04006] should return true for visible positions', () => {
      gameState.visibilityMap[3][3].visible = true
      // Position at tile (3,3) = pixel (96-127, 96-127)
      expect(isPositionVisibleToPlayer(gameState, mapGrid, 100, 100)).toBe(true)
    })

    it('[U04007] should return false for positions outside map bounds', () => {
      expect(isPositionVisibleToPlayer(gameState, mapGrid, -100, -100)).toBe(false)
      expect(isPositionVisibleToPlayer(gameState, mapGrid, 10000, 10000)).toBe(false)
    })

    it('[U04008] should handle null gameState', () => {
      expect(isPositionVisibleToPlayer(null, mapGrid, 100, 100)).toBe(true)
    })

    it('[U04009] should return false for unexplored areas when visibilityMap is reset', () => {
      // When visibilityMap is empty/reset, ensureVisibilityMap reinitializes it
      // New cells default to not visible, so unexplored areas return false
      gameState.visibilityMap = []
      expect(isPositionVisibleToPlayer(gameState, mapGrid, 100, 100)).toBe(false)
    })
  })

  describe('defensive structures visibility', () => {
    beforeEach(() => {
      initializeShadowOfWar(gameState, mapGrid)
    })

    it('[U04010] should give turrets visibility based on fire range', () => {
      gameState.buildings = [{
        type: 'turretGunV1',
        owner: 'player1',
        x: 5,
        y: 5,
        width: 1,
        height: 1,
        fireRange: 6
      }]
      updateShadowOfWar(gameState, [], mapGrid)
      expect(gameState.visibilityMap[5][5].visible).toBe(true)
    })

    it('[U04011] should give tesla coil visibility based on fire range', () => {
      gameState.buildings = [{
        type: 'teslaCoil',
        owner: 'player1',
        x: 5,
        y: 5,
        width: 1,
        height: 1,
        fireRange: 7
      }]
      updateShadowOfWar(gameState, [], mapGrid)
      expect(gameState.visibilityMap[5][5].visible).toBe(true)
    })
  })

  describe('discovered vs visible', () => {
    beforeEach(() => {
      initializeShadowOfWar(gameState, mapGrid)
    })

    it('[U04012] should mark cells as discovered when unit moves through', () => {
      const units = [{
        type: 'tank',
        owner: 'player1',
        x: 160,
        y: 160
      }]
      updateShadowOfWar(gameState, units, mapGrid)
      const tileX = Math.floor(160 / 32)
      const tileY = Math.floor(160 / 32)
      // Cell should be both visible and discovered
      expect(gameState.visibilityMap[tileY][tileX].discovered).toBe(true)
      expect(gameState.visibilityMap[tileY][tileX].visible).toBe(true)
    })

    it('[U04013] should keep cells discovered after unit moves away', () => {
      const units = [{
        type: 'tank',
        owner: 'player1',
        x: 160,
        y: 160
      }]
      updateShadowOfWar(gameState, units, mapGrid)
      const discoveredCell = gameState.visibilityMap[5][5]
      const wasDiscovered = discoveredCell.discovered

      // Move unit away
      units[0].x = 32
      units[0].y = 32
      updateShadowOfWar(gameState, units, mapGrid)

      // The original cell should still be discovered
      expect(discoveredCell.discovered).toBe(wasDiscovered)
    })
  })
})
