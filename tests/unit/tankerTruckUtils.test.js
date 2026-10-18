import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../setup.js'
import {
  computeTankerKamikazeApproach,
  detonateTankerTruck,
  clearTankerKamikazeState,
  updateKamikazeTargetPoint
} from '../../src/game/tankerTruckUtils.js'

// Mock dependencies
vi.mock('../../src/units.js', () => ({
  findPath: vi.fn()
}))

vi.mock('../../src/logic.js', () => ({
  triggerExplosion: vi.fn()
}))

vi.mock('../../src/ui/distortionEffect.js', () => ({
  triggerDistortionEffect: vi.fn()
}))

vi.mock('../../src/config.js', async() => {
  const actual = await vi.importActual('../../src/config.js')
  return {
    ...actual,
    TILE_SIZE: 32,
    TANKER_SUPPLY_CAPACITY: 10000
  }
})

import { findPath } from '../../src/units.js'
import { triggerExplosion } from '../../src/logic.js'
import { triggerDistortionEffect } from '../../src/ui/distortionEffect.js'

describe('tankerTruckUtils.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('computeTankerKamikazeApproach', () => {
    it('[U04399] should return null if tanker is missing', () => {
      const result = computeTankerKamikazeApproach(null, {}, [[0]], {})
      expect(result).toBe(null)
    })

    it('[U04400] should return null if target is missing', () => {
      const tanker = { x: 0, y: 0, owner: 1 }
      const result = computeTankerKamikazeApproach(tanker, null, [[0]], {})
      expect(result).toBe(null)
    })

    it('[U04401] should return null if mapGrid is missing', () => {
      const tanker = { x: 0, y: 0, owner: 1 }
      const target = { x: 10, y: 10 }
      const result = computeTankerKamikazeApproach(tanker, target, null, {})
      expect(result).toBe(null)
    })

    it('[U04402] should return null if mapGrid is empty', () => {
      const tanker = { x: 0, y: 0, owner: 1 }
      const target = { x: 10, y: 10 }
      const result = computeTankerKamikazeApproach(tanker, target, [], {})
      expect(result).toBe(null)
    })

    it('[U04403] should compute path using tileX/tileY when available', () => {
      const tanker = { tileX: 5, tileY: 5, owner: 1 }
      const target = { tileX: 10, tileY: 10 }
      const mapGrid = Array(20).fill(null).map(() => Array(20).fill(0))
      const path = [{ x: 5, y: 5 }, { x: 6, y: 6 }]

      findPath.mockReturnValue(path)

      const result = computeTankerKamikazeApproach(tanker, target, mapGrid, {})

      expect(result).not.toBe(null)
      expect(result.path).toBe(path)
      expect(result.destinationTile).toBeDefined()
      expect(result.moveTarget).toBeDefined()
    })

    it('[U04404] should compute path using pixel coordinates when tileX/tileY missing', () => {
      const tanker = { x: 160, y: 160, owner: 1 }
      const target = { x: 320, y: 320 }
      const mapGrid = Array(20).fill(null).map(() => Array(20).fill(0))
      const path = [{ x: 5, y: 5 }, { x: 10, y: 10 }]

      findPath.mockReturnValue(path)

      const result = computeTankerKamikazeApproach(tanker, target, mapGrid, {})

      expect(result).not.toBe(null)
      expect(findPath).toHaveBeenCalled()
    })

    it('[U04405] should try multiple approach offsets', () => {
      const tanker = { tileX: 5, tileY: 5, owner: 1 }
      const target = { tileX: 10, tileY: 10 }
      const mapGrid = Array(20).fill(null).map(() => Array(20).fill(0))

      // First few attempts return no path, then succeed
      findPath
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(null)
        .mockReturnValueOnce([{ x: 5, y: 5 }, { x: 10, y: 10 }])

      const result = computeTankerKamikazeApproach(tanker, target, mapGrid, {})

      expect(result).not.toBe(null)
      expect(findPath).toHaveBeenCalledTimes(3)
    })

    it('[U04406] should skip out-of-bounds offsets', () => {
      const tanker = { tileX: 0, tileY: 0, owner: 1 }
      const target = { tileX: 0, tileY: 0 }
      const mapGrid = Array(5).fill(null).map(() => Array(5).fill(0))

      findPath.mockReturnValue([{ x: 0, y: 0 }])

      const result = computeTankerKamikazeApproach(tanker, target, mapGrid, {})

      expect(result).not.toBe(null)
      // Should not call findPath for out-of-bounds positions
      expect(findPath.mock.calls.every(call => {
        const dest = call[1]
        return dest.x >= 0 && dest.y >= 0 && dest.x < 5 && dest.y < 5
      })).toBe(true)
    })

    it('[U04407] should use fallback path if no offset path found', () => {
      const tanker = { tileX: 5, tileY: 5, owner: 1 }
      const target = { tileX: 10, tileY: 10 }
      const mapGrid = Array(20).fill(null).map(() => Array(20).fill(0))
      const fallbackPath = [{ x: 5, y: 5 }, { x: 10, y: 10 }]

      // All offset attempts fail
      findPath.mockImplementation((start, dest, grid, occ, _u, _opts) => {
        // Last call without occupancy map is the fallback
        if (occ === null) {
          return fallbackPath
        }
        return null
      })

      const result = computeTankerKamikazeApproach(tanker, target, mapGrid, {})

      expect(result).not.toBe(null)
      expect(result.path).toBe(fallbackPath)
    })

    it('[U04408] should return null if no path found', () => {
      const tanker = { tileX: 5, tileY: 5, owner: 1 }
      const target = { tileX: 10, tileY: 10 }
      const mapGrid = Array(20).fill(null).map(() => Array(20).fill(0))

      findPath.mockReturnValue(null)

      const result = computeTankerKamikazeApproach(tanker, target, mapGrid, {})

      expect(result).toBe(null)
    })

    it('[U04409] should handle target with width and height', () => {
      const tanker = { tileX: 5, tileY: 5, owner: 1 }
      const target = { x: 10, y: 10, width: 4, height: 4 }
      const mapGrid = Array(20).fill(null).map(() => Array(20).fill(0))

      findPath.mockReturnValue([{ x: 5, y: 5 }, { x: 12, y: 12 }])

      const result = computeTankerKamikazeApproach(tanker, target, mapGrid, {})

      expect(result).not.toBe(null)
      // Should target center of building (10 + 4/2 = 12)
    })

    it('[U04410] should return null if target has no valid coordinates', () => {
      const tanker = { tileX: 5, tileY: 5, owner: 1 }
      const target = {} // No x, y, tileX, or tileY
      const mapGrid = Array(20).fill(null).map(() => Array(20).fill(0))

      const result = computeTankerKamikazeApproach(tanker, target, mapGrid, {})

      expect(result).toBe(null)
    })
  })

  describe('detonateTankerTruck', () => {
    it('[U04411] should return false if unit is null', () => {
      const result = detonateTankerTruck(null, [], [])
      expect(result).toBe(false)
    })

    it('[U04412] should return false if unit is already dead', () => {
      const unit = { health: 0, type: 'tankerTruck' }
      const result = detonateTankerTruck(unit, [], [])
      expect(result).toBe(false)
    })

    it('[U04413] should return false if already detonated', () => {
      const unit = { health: 100, _tankerDetonated: true, type: 'tankerTruck', x: 100, y: 100 }
      const result = detonateTankerTruck(unit, [], [])
      expect(result).toBe(false)
      expect(triggerExplosion).not.toHaveBeenCalled()
    })

    it('[U04414] should detonate tanker and trigger explosion', () => {
      const unit = {
        type: 'tankerTruck',
        health: 100,
        x: 100,
        y: 100,
        supplyGas: 5000,
        maxSupplyGas: 10000
      }

      const result = detonateTankerTruck(unit, [], [])

      expect(result).toBe(true)
      expect(unit.health).toBe(0)
      expect(unit._tankerDetonated).toBe(true)
      expect(triggerExplosion).toHaveBeenCalled()
    })

    it('[U04415] should calculate explosion radius based on fuel', () => {
      const fullTank = {
        type: 'tankerTruck',
        health: 100,
        x: 100,
        y: 100,
        supplyGas: 10000,
        maxSupplyGas: 10000
      }

      detonateTankerTruck(fullTank, [], [])

      const explosionCall = triggerExplosion.mock.calls[0]
      const radius = explosionCall[8]

      // Full tank: 32 * (3 + 1.0 * 2) = 32 * 5 = 160
      expect(radius).toBe(160)
    })

    it('[U04416] should calculate smaller explosion for empty tank', () => {
      const emptyTank = {
        type: 'tankerTruck',
        health: 100,
        x: 100,
        y: 100,
        supplyGas: 0,
        maxSupplyGas: 10000
      }

      vi.clearAllMocks()
      detonateTankerTruck(emptyTank, [], [])

      const explosionCall = triggerExplosion.mock.calls[0]
      const radius = explosionCall[8]

      // Empty tank: 32 * (3 + 0 * 2) = 32 * 3 = 96
      expect(radius).toBe(96)
    })

    it('[U04417] should use default capacity if maxSupplyGas not set', () => {
      const unit = {
        type: 'tankerTruck',
        health: 100,
        x: 100,
        y: 100
        // No supplyGas or maxSupplyGas set
      }

      const result = detonateTankerTruck(unit, [], [])

      expect(result).toBe(true)
      expect(triggerExplosion).toHaveBeenCalled()
    })

    it('[U04418] should clear all kamikaze state', () => {
      const unit = {
        type: 'tankerTruck',
        health: 100,
        x: 100,
        y: 100,
        kamikazeMode: true,
        kamikazeTargetId: 'target1',
        kamikazeTargetType: 'building',
        kamikazeTargetPoint: { x: 200, y: 200 },
        kamikazeLastPathTime: 1000,
        kamikazeTargetBuilding: {}
      }

      detonateTankerTruck(unit, [], [])

      expect(unit.kamikazeMode).toBe(false)
      expect(unit.kamikazeTargetId).toBe(null)
      expect(unit.kamikazeTargetType).toBe(null)
      expect(unit.kamikazeTargetPoint).toBe(null)
      expect(unit.kamikazeLastPathTime).toBe(null)
      expect(unit.kamikazeTargetBuilding).toBe(null)
    })

    it('[U04419] should clear movement state', () => {
      const unit = {
        type: 'tankerTruck',
        health: 100,
        x: 100,
        y: 100,
        moveTarget: { x: 200, y: 200 },
        path: [{ x: 1, y: 1 }],
        commandQueue: ['cmd1'],
        currentCommand: 'cmd2'
      }

      detonateTankerTruck(unit, [], [])

      expect(unit.moveTarget).toBe(null)
      expect(unit.path).toEqual([])
      expect(unit.commandQueue).toEqual([])
      expect(unit.currentCommand).toBe(null)
    })

    it('[U04420] should clear refuel state', () => {
      const unit = {
        type: 'tankerTruck',
        health: 100,
        x: 100,
        y: 100,
        refuelTarget: {},
        refuelTimer: 5000,
        emergencyTarget: {},
        emergencyMode: true
      }

      detonateTankerTruck(unit, [], [])

      expect(unit.refuelTarget).toBe(null)
      expect(unit.refuelTimer).toBe(0)
      expect(unit.emergencyTarget).toBe(null)
      expect(unit.emergencyMode).toBe(false)
      expect(unit.supplyGas).toBe(0)
    })

    it('[U04421] should stop unit movement', () => {
      const unit = {
        type: 'tankerTruck',
        health: 100,
        x: 100,
        y: 100,
        movement: {
          velocity: { x: 5, y: 5 },
          targetVelocity: { x: 10, y: 10 },
          isMoving: true,
          currentSpeed: 10
        }
      }

      detonateTankerTruck(unit, [], [])

      expect(unit.movement.velocity.x).toBe(0)
      expect(unit.movement.velocity.y).toBe(0)
      expect(unit.movement.targetVelocity.x).toBe(0)
      expect(unit.movement.targetVelocity.y).toBe(0)
      expect(unit.movement.isMoving).toBe(false)
      expect(unit.movement.currentSpeed).toBe(0)
    })

    it('[U04422] should trigger distortion effect with gameState', () => {
      const unit = {
        type: 'tankerTruck',
        health: 100,
        x: 100,
        y: 100,
        supplyGas: 10000,
        maxSupplyGas: 10000
      }
      const gameState = {}

      detonateTankerTruck(unit, [], [], gameState)

      expect(triggerDistortionEffect).toHaveBeenCalledWith(
        116, // x + TILE_SIZE / 2
        116, // y + TILE_SIZE / 2
        160, // radius
        gameState
      )
    })

    it('[U04423] should not trigger distortion effect without gameState', () => {
      const unit = {
        type: 'tankerTruck',
        health: 100,
        x: 100,
        y: 100
      }

      vi.clearAllMocks()
      detonateTankerTruck(unit, [], [])

      expect(triggerDistortionEffect).not.toHaveBeenCalled()
    })
  })

  describe('clearTankerKamikazeState', () => {
    it('[U04424] should clear all kamikaze state from tanker', () => {
      const unit = {
        type: 'tankerTruck',
        kamikazeMode: true,
        kamikazeTargetId: 'target1',
        kamikazeTargetType: 'building',
        kamikazeTargetPoint: { x: 200, y: 200 },
        kamikazeLastPathTime: 1000,
        kamikazeTargetBuilding: {},
        _tankerDetonated: true,
        moveTarget: { x: 100, y: 100 }
      }

      clearTankerKamikazeState(unit)

      expect(unit.kamikazeMode).toBe(false)
      expect(unit.kamikazeTargetId).toBe(null)
      expect(unit.kamikazeTargetType).toBe(null)
      expect(unit.kamikazeTargetPoint).toBe(null)
      expect(unit.kamikazeLastPathTime).toBe(null)
      expect(unit.kamikazeTargetBuilding).toBe(null)
      expect(unit._tankerDetonated).toBe(false)
      expect(unit.moveTarget).toBe(null)
    })

    it('[U04425] should do nothing if unit is null', () => {
      expect(() => {
        clearTankerKamikazeState(null)
      }).not.toThrow()
    })

    it('[U04426] should do nothing if unit is not a tanker truck', () => {
      const unit = {
        type: 'tank',
        kamikazeMode: true
      }

      clearTankerKamikazeState(unit)

      expect(unit.kamikazeMode).toBe(true) // Should not be modified
    })
  })

  describe('updateKamikazeTargetPoint', () => {
    it('[U04427] should return null if unit is null', () => {
      const result = updateKamikazeTargetPoint(null, {})
      expect(result).toBe(null)
    })

    it('[U04428] should return null if unit is not a tanker truck', () => {
      const unit = { type: 'tank' }
      const result = updateKamikazeTargetPoint(unit, {})
      expect(result).toBe(null)
    })

    it('[U04429] should return null if target is null', () => {
      const unit = { type: 'tankerTruck' }
      const result = updateKamikazeTargetPoint(unit, null)
      expect(result).toBe(null)
    })

    it('[U04430] should calculate point for target with tileX/tileY', () => {
      const unit = { type: 'tankerTruck' }
      const target = { tileX: 10, tileY: 20, x: 320, y: 640 }

      const result = updateKamikazeTargetPoint(unit, target)

      expect(result).not.toBe(null)
      expect(result.x).toBe(320 + 16) // x + TILE_SIZE / 2
      expect(result.y).toBe(640 + 16) // y + TILE_SIZE / 2
      expect(unit.kamikazeTargetPoint).toBe(result)
    })

    it('[U04431] should calculate point for building target', () => {
      const unit = { type: 'tankerTruck' }
      const target = { x: 10, y: 20, width: 4, height: 3 }

      const result = updateKamikazeTargetPoint(unit, target)

      expect(result).not.toBe(null)
      expect(result.x).toBe((10 + 4 / 2) * 32) // (x + width/2) * TILE_SIZE
      expect(result.y).toBe((20 + 3 / 2) * 32) // (y + height/2) * TILE_SIZE
      expect(unit.kamikazeTargetPoint).toBe(result)
    })

    it('[U04432] should default to width/height of 1 if not specified', () => {
      const unit = { type: 'tankerTruck' }
      const target = { x: 10, y: 20 }

      const result = updateKamikazeTargetPoint(unit, target)

      expect(result).not.toBe(null)
      expect(result.x).toBe((10 + 1 / 2) * 32)
      expect(result.y).toBe((20 + 1 / 2) * 32)
    })

    it('[U04433] should prefer tileX/tileY over x/y', () => {
      const unit = { type: 'tankerTruck' }
      const target = {
        tileX: 5,
        tileY: 5,
        x: 10,
        y: 10
      }

      const result = updateKamikazeTargetPoint(unit, target)

      // Should use tileX/tileY (which uses pixel x/y)
      expect(result.x).toBe(10 + 16)
      expect(result.y).toBe(10 + 16)
    })

    it('[U04434] should return null if target has no valid coordinates', () => {
      const unit = { type: 'tankerTruck' }
      const target = {} // No coordinates

      const result = updateKamikazeTargetPoint(unit, target)

      expect(result).toBe(null)
    })
  })
})
