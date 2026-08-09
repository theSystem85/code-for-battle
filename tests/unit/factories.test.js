/**
 * Tests for Factories System
 *
 * Tests factory initialization including:
 * - Factory placement for different player counts
 * - Map grid updates for factory tiles
 * - Street network generation between factories
 * - Factory removal and tile restoration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '../setup.js'
import { gameState } from '../../src/gameState.js'
import { createTestMapGrid, resetGameState } from '../testUtils.js'

// Mock dependencies
vi.mock('../../src/config.js', async(importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    MAP_TILES_X: 100,
    MAP_TILES_Y: 100
  }
})

vi.mock('../../src/buildings.js', () => ({
  buildingData: {
    constructionYard: { width: 3, height: 3, health: 1000 }
  },
  createBuilding: vi.fn((type, x, y) => ({
    id: `${type}-${x}-${y}`,
    type: type,
    x: x,
    y: y,
    width: 3,
    height: 3,
    health: 1000,
    maxHealth: 1000,
    power: 0
  }))
}))

// Import after mocking
import { initFactories, clearFactoryFromMapGrid } from '../../src/factories.js'
import { createBuilding } from '../../src/buildings.js'

describe('factories.js', () => {
  let mapGrid
  let factories

  beforeEach(() => {
    vi.clearAllMocks()
    resetGameState()

    mapGrid = createTestMapGrid(100, 100)
    factories = []
    gameState.playerCount = 2
    gameState.humanPlayer = 'player1'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initFactories', () => {
    describe('Factory Creation', () => {
      it('should create factories for 2 players by default', () => {
        gameState.playerCount = 2

        initFactories(factories, mapGrid)

        expect(factories.length).toBe(2)
      })

      it('should create factories for 3 players when playerCount is 3', () => {
        gameState.playerCount = 3

        initFactories(factories, mapGrid)

        expect(factories.length).toBe(3)
      })

      it('should create factories for 4 players when playerCount is 4', () => {
        gameState.playerCount = 4

        initFactories(factories, mapGrid)

        expect(factories.length).toBe(4)
      })

      it('should clear existing factories before creating new ones', () => {
        factories.push({ id: 'old-factory', type: 'constructionYard' })

        initFactories(factories, mapGrid)

        expect(factories.find(f => f.id === 'old-factory')).toBeUndefined()
      })

      it('should call createBuilding for each factory', () => {
        gameState.playerCount = 2

        initFactories(factories, mapGrid)

        expect(createBuilding).toHaveBeenCalledTimes(2)
        expect(createBuilding).toHaveBeenCalledWith('constructionYard', expect.any(Number), expect.any(Number))
      })
    })

    describe('Factory Properties', () => {
      it('should set factory owner to corresponding player id', () => {
        gameState.playerCount = 2

        initFactories(factories, mapGrid)

        expect(factories[0].owner).toBe('player1')
        expect(factories[1].owner).toBe('player2')
      })

      it('should set factory id to player id', () => {
        gameState.playerCount = 2

        initFactories(factories, mapGrid)

        expect(factories[0].id).toBe('player1')
        expect(factories[1].id).toBe('player2')
      })

      it('should mark factories as construction finished', () => {
        initFactories(factories, mapGrid)

        factories.forEach(factory => {
          expect(factory.constructionFinished).toBe(true)
        })
      })

      it('should set initial budget for each factory', () => {
        initFactories(factories, mapGrid)

        factories.forEach(factory => {
          expect(factory.budget).toBe(20000)
        })
      })

      it('should set productionCountdown to 0', () => {
        initFactories(factories, mapGrid)

        factories.forEach(factory => {
          expect(factory.productionCountdown).toBe(0)
        })
      })

      it('should mark human player factory correctly', () => {
        gameState.humanPlayer = 'player1'
        gameState.playerCount = 2

        initFactories(factories, mapGrid)

        expect(factories[0].isHuman).toBe(true)
        expect(factories[1].isHuman).toBe(false)
      })
    })

    describe('Factory Positioning', () => {
      it('should place player1 factory in bottom-left area', () => {
        gameState.playerCount = 2

        initFactories(factories, mapGrid)

        const factory = factories.find(f => f.id === 'player1')
        // player1 is at { x: 0.1, y: 0.9 } - bottom-left
        expect(factory.x).toBeLessThan(50)
        expect(factory.y).toBeGreaterThan(50)
      })

      it('should place player2 factory in top-right area', () => {
        gameState.playerCount = 2

        initFactories(factories, mapGrid)

        const factory = factories.find(f => f.id === 'player2')
        // player2 is at { x: 0.9, y: 0.1 } - top-right
        expect(factory.x).toBeGreaterThan(50)
        expect(factory.y).toBeLessThan(50)
      })

      it('should place player3 factory in top-left area', () => {
        gameState.playerCount = 3

        initFactories(factories, mapGrid)

        const factory = factories.find(f => f.id === 'player3')
        // player3 is at { x: 0.1, y: 0.1 } - top-left
        expect(factory.x).toBeLessThan(50)
        expect(factory.y).toBeLessThan(50)
      })

      it('should place player4 factory in bottom-right area', () => {
        gameState.playerCount = 4

        initFactories(factories, mapGrid)

        const factory = factories.find(f => f.id === 'player4')
        // player4 is at { x: 0.9, y: 0.9 } - bottom-right
        expect(factory.x).toBeGreaterThan(50)
        expect(factory.y).toBeGreaterThan(50)
      })
    })

    describe('Map Grid Updates', () => {
      it('should mark factory tiles with building reference', () => {
        initFactories(factories, mapGrid)

        const factory = factories[0]
        for (let y = factory.y; y < factory.y + factory.height; y++) {
          for (let x = factory.x; x < factory.x + factory.width; x++) {
            expect(mapGrid[y][x].building).toBe(factory)
          }
        }
      })

      it('should store original tile types before marking', () => {
        initFactories(factories, mapGrid)

        factories.forEach(factory => {
          expect(factory.originalTiles).toBeDefined()
          expect(factory.originalTiles.length).toBe(factory.height)
        })
      })

      it('should remove ore from factory tiles', () => {
        // Place ore where factory will go
        const factoryX = 10 - 1 // Centered around x: 10
        const factoryY = 10 - 1

        for (let y = factoryY; y < factoryY + 3; y++) {
          for (let x = factoryX; x < factoryX + 3; x++) {
            if (mapGrid[y] && mapGrid[y][x]) {
              mapGrid[y][x].ore = true
            }
          }
        }

        initFactories(factories, mapGrid)

        factories.forEach(factory => {
          for (let y = factory.y; y < factory.y + factory.height; y++) {
            for (let x = factory.x; x < factory.x + factory.width; x++) {
              // ore should be falsy (false or 0)
              expect(mapGrid[y][x].ore).toBeFalsy()
            }
          }
        })
      })

      it('should clear texture variation cache for tiles with ore', () => {
        // Place ore with texture variation
        // Initialize factory area with ore and textureVariation
        gameState.playerCount = 2
        for (let x = 7; x < 12; x++) {
          for (let y = 7; y < 12; y++) {
            if (mapGrid[y] && mapGrid[y][x]) {
              mapGrid[y][x].ore = true
              mapGrid[y][x].textureVariation = 'variation1'
            }
          }
        }

        initFactories(factories, mapGrid)

        factories.forEach(f => {
          for (let y = f.y; y < f.y + f.height; y++) {
            for (let x = f.x; x < f.x + f.width; x++) {
              // textureVariation should be cleared (null or undefined)
              expect(mapGrid[y][x].textureVariation).toBeFalsy()
            }
          }
        })
      })

      it('should set undefined tiles to street type', () => {
        // Create sparse map grid
        const sparseMap = []
        for (let y = 0; y < 100; y++) {
          sparseMap[y] = []
          for (let x = 0; x < 100; x++) {
            // Leave some tiles undefined
            if (Math.random() > 0.5) {
              sparseMap[y][x] = { type: 'land' }
            }
          }
        }

        initFactories(factories, sparseMap)

        // Verify factory tiles are initialized
        factories.forEach(factory => {
          for (let y = factory.y; y < factory.y + factory.height; y++) {
            for (let x = factory.x; x < factory.x + factory.width; x++) {
              expect(sparseMap[y][x]).toBeDefined()
            }
          }
        })
      })
    })

    describe('Street Network - Two Factories', () => {
      it('should create L-shaped street connection between 2 factories', () => {
        gameState.playerCount = 2

        initFactories(factories, mapGrid)

        // Count street tiles - should have connection
        let streetCount = 0
        for (let y = 0; y < 100; y++) {
          for (let x = 0; x < 100; x++) {
            if (mapGrid[y][x].type === 'street') {
              streetCount++
            }
          }
        }

        expect(streetCount).toBeGreaterThan(0)
      })

      it('should create streets with 2-tile thickness', () => {
        gameState.playerCount = 2

        initFactories(factories, mapGrid)

        const factory1 = factories[0]
        const factory1CenterY = factory1.y + Math.floor(factory1.height / 2)

        // Check for horizontal street on both rows (thickness = 2)
        let consecutiveStreets = 0
        for (let x = 0; x < 100; x++) {
          if (mapGrid[factory1CenterY][x]?.type === 'street' &&
              mapGrid[factory1CenterY + 1][x]?.type === 'street') {
            consecutiveStreets++
          }
        }

        expect(consecutiveStreets).toBeGreaterThan(0)
      })
    })

    describe('Street Network - Multiple Factories', () => {
      it('should not throw when processing 4 factories', () => {
        gameState.playerCount = 4

        // Should not throw even if factories are far apart
        expect(() => initFactories(factories, mapGrid)).not.toThrow()

        // Exactly 4 factories should be created
        expect(factories.length).toBe(4)
      })
    })
  })

  describe('clearFactoryFromMapGrid', () => {
    it('should clear building reference from factory tiles', () => {
      initFactories(factories, mapGrid)
      const factory = factories[0]

      clearFactoryFromMapGrid(factory, mapGrid)

      for (let y = factory.y; y < factory.y + factory.height; y++) {
        for (let x = factory.x; x < factory.x + factory.width; x++) {
          expect(mapGrid[y][x].building).toBeUndefined()
        }
      }
    })

    it('should restore original tile types', () => {
      // Set up original tile types
      for (let y = 5; y < 10; y++) {
        for (let x = 5; x < 10; x++) {
          mapGrid[y][x].type = 'grass'
        }
      }

      initFactories(factories, mapGrid)
      const factory = factories[0]

      clearFactoryFromMapGrid(factory, mapGrid)

      // Original tiles should be restored
      for (let y = factory.y; y < factory.y + factory.height; y++) {
        for (let x = factory.x; x < factory.x + factory.width; x++) {
          expect(mapGrid[y][x].type).toBeDefined()
        }
      }
    })

    it('should default to land type when no original tiles saved', () => {
      initFactories(factories, mapGrid)
      const factory = factories[0]

      // Remove original tiles data
      factory.originalTiles = null

      clearFactoryFromMapGrid(factory, mapGrid)

      for (let y = factory.y; y < factory.y + factory.height; y++) {
        for (let x = factory.x; x < factory.x + factory.width; x++) {
          expect(mapGrid[y][x].type).toBe('land')
        }
      }
    })

    it('should ensure ore property exists when restoring tiles', () => {
      initFactories(factories, mapGrid)
      const factory = factories[0]
      factory.originalTiles = null

      // Remove ore property before clearing
      for (let y = factory.y; y < factory.y + factory.height; y++) {
        for (let x = factory.x; x < factory.x + factory.width; x++) {
          delete mapGrid[y][x].ore
        }
      }

      clearFactoryFromMapGrid(factory, mapGrid)

      for (let y = factory.y; y < factory.y + factory.height; y++) {
        for (let x = factory.x; x < factory.x + factory.width; x++) {
          expect(mapGrid[y][x].ore).toBe(false)
        }
      }
    })

    it('should handle missing map grid rows gracefully', () => {
      initFactories(factories, mapGrid)
      const factory = factories[0]

      // Create holes in map grid
      delete mapGrid[factory.y]

      // Should not throw
      expect(() => clearFactoryFromMapGrid(factory, mapGrid)).not.toThrow()
    })

    it('should handle missing map grid cells gracefully', () => {
      initFactories(factories, mapGrid)
      const factory = factories[0]

      // Create holes in map grid cells
      delete mapGrid[factory.y + 1][factory.x]

      // Should not throw
      expect(() => clearFactoryFromMapGrid(factory, mapGrid)).not.toThrow()
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined playerCount by defaulting to 2', () => {
      gameState.playerCount = undefined

      initFactories(factories, mapGrid)

      expect(factories.length).toBe(2)
    })

    it('should handle zero playerCount by defaulting to 2', () => {
      gameState.playerCount = 0

      // 0 is falsy, should default to 2
      initFactories(factories, mapGrid)

      expect(factories.length).toBe(2)
    })

    it('should clip playerCount to maximum of 4', () => {
      gameState.playerCount = 6

      initFactories(factories, mapGrid)

      // playerIds.slice(0, 6) will still only have 4 elements
      expect(factories.length).toBe(4)
    })
  })
})
