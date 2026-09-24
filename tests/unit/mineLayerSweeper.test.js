/**
 * Unit tests for Mine Layer and Mine Sweeper behaviors
 *
 * Tests mine deployment, capacity tracking, sweeping modes,
 * path calculation, and dust generation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock config before other imports
vi.mock('../../src/config.js', async() => {
  const actual = await vi.importActual('../../src/config.js')
  return {
    ...actual,
    TILE_SIZE: 32,
    MINE_DEPLOY_STOP_TIME: 4000,
    UNIT_PROPERTIES: {
      ...actual.UNIT_PROPERTIES,
      mineLayer: {
        health: 30,
        maxHealth: 30,
        speed: 0.528,
        deploySpeed: 0.264,
        rotationSpeed: 0.04,
        turretRotationSpeed: 0,
        mineCapacity: 20
      },
      mineSweeper: {
        health: 200,
        maxHealth: 200,
        speed: 0.231,
        sweepingSpeed: 0.099,
        rotationSpeed: 0.04,
        turretRotationSpeed: 0,
        armor: 6
      }
    }
  }
})

// Mock gameState
vi.mock('../../src/gameState.js', () => ({
  gameState: {
    mines: [],
    buildings: [],
    units: [],
    mapTilesX: 100,
    mapTilesY: 100,
    mapGrid: []
  }
}))

// Mock mineSystem
vi.mock('../../src/game/mineSystem.js', () => ({
  deployMine: vi.fn().mockReturnValue({ id: 'mock-mine-1', tileX: 5, tileY: 5 })
}))

// Mock gameRandom
vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn().mockReturnValue(0.5)
}))

import {
  updateMineLayerBehavior,
  startMineDeployment,
  isMinePlantTileBlocked
} from '../../src/game/mineLayerBehavior.js'

import {
  updateMineSweeperBehavior,
  activateSweepingMode,
  deactivateSweepingMode,
  calculateZigZagSweepPath,
  calculateFreeformSweepPath,
  generateSweepDust,
  computeSweepDustRadius
} from '../../src/game/mineSweeperBehavior.js'

import { UNIT_PROPERTIES, MINE_DEPLOY_STOP_TIME } from '../../src/config.js'
import { gameState } from '../../src/gameState.js'
import { deployMine } from '../../src/game/mineSystem.js'

describe('Mine Layer Behavior', () => {
  let mineLayer

  beforeEach(() => {
    vi.clearAllMocks()

    // Create fresh mine layer unit
    mineLayer = {
      id: 'ml-1',
      type: 'mineLayer',
      owner: 'player',
      x: 160, // tile 5
      y: 160, // tile 5
      health: 30,
      remainingMines: 10,
      speed: UNIT_PROPERTIES.mineLayer.speed,
      deployingMine: false,
      deployStartTime: null,
      commandQueue: [],
      path: [],
      moveTarget: null
    }

    // Reset gameState
    gameState.mines = []
    gameState.buildings = []
    gameState.units = []
    gameState.mapGrid = []

    // Setup map grid
    for (let y = 0; y < 20; y++) {
      gameState.mapGrid[y] = []
      for (let x = 0; x < 20; x++) {
        gameState.mapGrid[y][x] = { type: 'grass' }
      }
    }
  })

  describe('startMineDeployment()', () => {
    it('should start deployment for mine layer with remaining mines', () => {
      const result = startMineDeployment(mineLayer, 5, 5, 1000)

      expect(result).toBe(true)
      expect(mineLayer.deployingMine).toBe(true)
      expect(mineLayer.deployStartTime).toBe(1000)
      expect(mineLayer.deployTargetX).toBe(5)
      expect(mineLayer.deployTargetY).toBe(5)
    })

    it('should clear path and moveTarget when starting deployment', () => {
      mineLayer.path = [{ x: 10, y: 10 }]
      mineLayer.moveTarget = { x: 10, y: 10 }

      startMineDeployment(mineLayer, 5, 5, 1000)

      expect(mineLayer.path).toEqual([])
      expect(mineLayer.moveTarget).toBeNull()
    })

    it('should reset deploymentCompleted flag', () => {
      mineLayer.deploymentCompleted = true

      startMineDeployment(mineLayer, 5, 5, 1000)

      expect(mineLayer.deploymentCompleted).toBe(false)
    })

    it('should return false for non-mineLayer unit', () => {
      const tank = { type: 'tank', remainingMines: 10 }

      const result = startMineDeployment(tank, 5, 5, 1000)

      expect(result).toBe(false)
    })

    it('should return false when no mines remaining', () => {
      mineLayer.remainingMines = 0

      const result = startMineDeployment(mineLayer, 5, 5, 1000)

      expect(result).toBe(false)
      expect(mineLayer.deployingMine).toBeFalsy()
    })
  })

  describe('updateMineLayerBehavior()', () => {
    it('should skip non-mineLayer units', () => {
      const tank = { type: 'tank', speed: 1 }

      updateMineLayerBehavior([tank], 1000)

      expect(tank.speed).toBe(1)
    })

    it('should set deploy speed when deploying', () => {
      mineLayer.deployingMine = true
      mineLayer.speed = UNIT_PROPERTIES.mineLayer.speed

      updateMineLayerBehavior([mineLayer], 1000)

      expect(mineLayer.speed).toBe(UNIT_PROPERTIES.mineLayer.deploySpeed)
    })

    it('should set deploy speed when deploy commands queued', () => {
      mineLayer.commandQueue = [{ type: 'deployMine', x: 5, y: 5 }]
      mineLayer.speed = UNIT_PROPERTIES.mineLayer.speed

      updateMineLayerBehavior([mineLayer], 1000)

      expect(mineLayer.speed).toBe(UNIT_PROPERTIES.mineLayer.deploySpeed)
    })

    it('should restore normal speed when not deploying', () => {
      mineLayer.speed = UNIT_PROPERTIES.mineLayer.deploySpeed
      mineLayer.deployingMine = false
      mineLayer.commandQueue = []

      updateMineLayerBehavior([mineLayer], 1000)

      expect(mineLayer.speed).toBe(UNIT_PROPERTIES.mineLayer.speed)
    })

    it('should deploy mine after deploy stop time elapsed', () => {
      mineLayer.deployingMine = true
      mineLayer.deployStartTime = 1000
      mineLayer.remainingMines = 5

      updateMineLayerBehavior([mineLayer], 1000 + MINE_DEPLOY_STOP_TIME)

      expect(deployMine).toHaveBeenCalled()
      expect(mineLayer.remainingMines).toBe(4)
      expect(mineLayer.deployingMine).toBe(false)
      expect(mineLayer.deploymentCompleted).toBe(true)
    })

    it('should not deploy mine before time elapsed', () => {
      mineLayer.deployingMine = true
      mineLayer.deployStartTime = 1000
      mineLayer.remainingMines = 5

      updateMineLayerBehavior([mineLayer], 1000 + MINE_DEPLOY_STOP_TIME - 1)

      expect(deployMine).not.toHaveBeenCalled()
      expect(mineLayer.remainingMines).toBe(5)
      expect(mineLayer.deployingMine).toBe(true)
    })

    it('should mark deployment completed when no mines remaining', () => {
      mineLayer.deployingMine = true
      mineLayer.deployStartTime = 1000
      mineLayer.remainingMines = 0

      updateMineLayerBehavior([mineLayer], 1000 + MINE_DEPLOY_STOP_TIME)

      expect(deployMine).not.toHaveBeenCalled()
      expect(mineLayer.deployingMine).toBe(false)
      expect(mineLayer.deploymentCompleted).toBe(true)
    })

    it('should handle multiple mine layers', () => {
      const mineLayer2 = {
        ...mineLayer,
        id: 'ml-2',
        x: 64,
        y: 64,
        deployingMine: true,
        deployStartTime: 1000,
        remainingMines: 3
      }

      updateMineLayerBehavior([mineLayer, mineLayer2], 1000 + MINE_DEPLOY_STOP_TIME)

      // Only mineLayer2 is deploying
      expect(mineLayer.deployingMine).toBeFalsy()
      expect(mineLayer2.deployingMine).toBe(false)
      expect(mineLayer2.deploymentCompleted).toBe(true)
    })
  })

  describe('Capacity Tracking', () => {
    it('should decrement remaining mines on successful deployment', () => {
      mineLayer.deployingMine = true
      mineLayer.deployStartTime = 0
      mineLayer.remainingMines = 5

      updateMineLayerBehavior([mineLayer], MINE_DEPLOY_STOP_TIME)

      expect(mineLayer.remainingMines).toBe(4)
    })

    it('should not go below zero mines', () => {
      mineLayer.deployingMine = true
      mineLayer.deployStartTime = 0
      mineLayer.remainingMines = 0

      updateMineLayerBehavior([mineLayer], MINE_DEPLOY_STOP_TIME)

      expect(mineLayer.remainingMines).toBe(0)
    })

    it('should check remaining mines before deployment', () => {
      mineLayer.remainingMines = 0

      const result = startMineDeployment(mineLayer, 5, 5, 1000)

      expect(result).toBe(false)
    })

    it('restarts a deploy timer that was stamped ahead of the simulation clock', () => {
      mineLayer.deployingMine = true
      mineLayer.deployStartTime = 50000
      mineLayer.remainingMines = 5

      updateMineLayerBehavior([mineLayer], 1000)

      expect(deployMine).not.toHaveBeenCalled()
      expect(mineLayer.deployingMine).toBe(true)
      expect(mineLayer.deployStartTime).toBe(1000)

      updateMineLayerBehavior([mineLayer], 1000 + MINE_DEPLOY_STOP_TIME)

      expect(deployMine).toHaveBeenCalled()
      expect(mineLayer.deployingMine).toBe(false)
      expect(mineLayer.deploymentCompleted).toBe(true)
    })
  })

  describe('isMinePlantTileBlocked()', () => {
    it('ignores the mine layer standing on its own plant tile', () => {
      expect(isMinePlantTileBlocked(5, 5, mineLayer, {
        units: [mineLayer],
        mapGrid: gameState.mapGrid,
        buildings: [],
        mines: []
      })).toBe(false)
    })

    it('blocks a tile occupied by another unit center', () => {
      const tank = { id: 'tank-1', type: 'tank', health: 80, x: 5 * 32, y: 5 * 32 }

      expect(isMinePlantTileBlocked(5, 5, mineLayer, {
        units: [mineLayer, tank],
        mapGrid: gameState.mapGrid,
        buildings: [],
        mines: []
      })).toBe(true)
    })

    it('does not block a neighboring tile', () => {
      const tank = { id: 'tank-1', type: 'tank', health: 80, x: 6 * 32, y: 5 * 32 }

      expect(isMinePlantTileBlocked(5, 5, mineLayer, {
        units: [mineLayer, tank],
        mapGrid: gameState.mapGrid
      })).toBe(false)
    })
  })

})

describe('Mine Sweeper Behavior', () => {
  let mineSweeper
  let mockGameState

  beforeEach(() => {
    vi.clearAllMocks()

    mineSweeper = {
      id: 'ms-1',
      type: 'mineSweeper',
      owner: 'player',
      x: 160,
      y: 160,
      health: 200,
      speed: UNIT_PROPERTIES.mineSweeper.speed,
      sweeping: false,
      direction: 0,
      velocityX: 0,
      velocityY: 0,
      currentCommand: null,
      lastDustTime: 0
    }

    mockGameState = {
      dustParticles: []
    }
  })

  describe('activateSweepingMode()', () => {
    it('should activate sweeping mode for mine sweeper', () => {
      activateSweepingMode(mineSweeper)

      expect(mineSweeper.sweeping).toBe(true)
      expect(mineSweeper.speed).toBe(UNIT_PROPERTIES.mineSweeper.sweepingSpeed)
    })

    it('should initialize normalSpeed if not set', () => {
      delete mineSweeper.normalSpeed

      activateSweepingMode(mineSweeper)

      expect(mineSweeper.normalSpeed).toBe(UNIT_PROPERTIES.mineSweeper.speed)
    })

    it('should initialize sweepingSpeed if not set', () => {
      delete mineSweeper.sweepingSpeed

      activateSweepingMode(mineSweeper)

      expect(mineSweeper.sweepingSpeed).toBe(UNIT_PROPERTIES.mineSweeper.sweepingSpeed)
    })

    it('should not activate for non-mineSweeper', () => {
      const tank = { type: 'tank', sweeping: false, speed: 1 }

      activateSweepingMode(tank)

      expect(tank.sweeping).toBe(false)
      expect(tank.speed).toBe(1)
    })
  })

  describe('deactivateSweepingMode()', () => {
    it('should deactivate sweeping mode', () => {
      mineSweeper.sweeping = true
      mineSweeper.speed = UNIT_PROPERTIES.mineSweeper.sweepingSpeed

      deactivateSweepingMode(mineSweeper)

      expect(mineSweeper.sweeping).toBe(false)
      expect(mineSweeper.speed).toBe(UNIT_PROPERTIES.mineSweeper.speed)
    })

    it('should initialize normalSpeed if not set', () => {
      delete mineSweeper.normalSpeed
      mineSweeper.sweeping = true

      deactivateSweepingMode(mineSweeper)

      expect(mineSweeper.normalSpeed).toBe(UNIT_PROPERTIES.mineSweeper.speed)
    })

    it('should not affect non-mineSweeper', () => {
      const tank = { type: 'tank', sweeping: true, speed: 0.5 }

      deactivateSweepingMode(tank)

      expect(tank.sweeping).toBe(true)
      expect(tank.speed).toBe(0.5)
    })
  })

  describe('updateMineSweeperBehavior()', () => {
    it('should skip non-mineSweeper units', () => {
      const tank = { type: 'tank', speed: 1 }

      updateMineSweeperBehavior([tank], mockGameState, 1000)

      expect(tank.speed).toBe(1)
    })

    it('should activate sweeping when sweep command is active', () => {
      mineSweeper.currentCommand = { type: 'sweepArea', path: [{ x: 5, y: 5 }] }
      mineSweeper.sweeping = false

      updateMineSweeperBehavior([mineSweeper], mockGameState, 1000)

      expect(mineSweeper.sweeping).toBe(true)
      expect(mineSweeper.speed).toBe(mineSweeper.sweepingSpeed)
    })

    it('should deactivate sweeping when no sweep command', () => {
      mineSweeper.sweeping = true
      mineSweeper.currentCommand = null

      updateMineSweeperBehavior([mineSweeper], mockGameState, 1000)

      expect(mineSweeper.sweeping).toBe(false)
      expect(mineSweeper.speed).toBe(mineSweeper.normalSpeed)
    })

    it('should reset lastDustTime when deactivating', () => {
      mineSweeper.sweeping = true
      mineSweeper.lastDustTime = 500
      mineSweeper.currentCommand = null

      updateMineSweeperBehavior([mineSweeper], mockGameState, 1000)

      expect(mineSweeper.lastDustTime).toBe(0)
    })

    it('should generate dust when sweeping and moving', () => {
      mineSweeper.sweeping = true
      mineSweeper.currentCommand = { type: 'sweepArea', path: [] }
      mineSweeper.velocityX = 1
      mineSweeper.lastDustTime = 0

      updateMineSweeperBehavior([mineSweeper], mockGameState, 1000)

      expect(mockGameState.dustParticles.length).toBeGreaterThan(0)
    })

    it('should not generate dust when not moving', () => {
      mineSweeper.sweeping = true
      mineSweeper.currentCommand = { type: 'sweepArea', path: [] }
      mineSweeper.velocityX = 0
      mineSweeper.velocityY = 0

      updateMineSweeperBehavior([mineSweeper], mockGameState, 1000)

      expect(mockGameState.dustParticles.length).toBe(0)
    })

    it('should respect dust emission rate limit', () => {
      mineSweeper.sweeping = true
      mineSweeper.currentCommand = { type: 'sweepArea', path: [] }
      mineSweeper.velocityX = 1
      mineSweeper.lastDustTime = 950

      updateMineSweeperBehavior([mineSweeper], mockGameState, 1000)

      // 50ms since last dust, less than 100ms limit
      expect(mockGameState.dustParticles.length).toBe(0)
    })

    it('should handle multiple sweepers', () => {
      const sweeper2 = {
        ...mineSweeper,
        id: 'ms-2',
        currentCommand: { type: 'sweepArea', path: [] },
        sweeping: false
      }

      updateMineSweeperBehavior([mineSweeper, sweeper2], mockGameState, 1000)

      expect(sweeper2.sweeping).toBe(true)
    })
  })

  describe('calculateZigZagSweepPath()', () => {
    it('should generate zig-zag path for rectangular area', () => {
      const area = { startX: 0, startY: 0, endX: 2, endY: 1 }

      const path = calculateZigZagSweepPath(area)

      expect(path.length).toBe(6) // 3 x 2 tiles
    })

    it('should return empty array for null area', () => {
      const path = calculateZigZagSweepPath(null)

      expect(path).toEqual([])
    })

    it('should handle inverted area bounds', () => {
      const area = { startX: 2, startY: 2, endX: 0, endY: 0 }

      const path = calculateZigZagSweepPath(area)

      expect(path.length).toBe(9) // 3 x 3 tiles
    })

    it('should create serpentine pattern (alternating row direction)', () => {
      const area = { startX: 0, startY: 0, endX: 2, endY: 1 }

      const path = calculateZigZagSweepPath(area)

      // First row: left to right (0,0), (1,0), (2,0)
      expect(path[0]).toEqual({ x: 0, y: 0 })
      expect(path[1]).toEqual({ x: 1, y: 0 })
      expect(path[2]).toEqual({ x: 2, y: 0 })

      // Second row: right to left (2,1), (1,1), (0,1)
      expect(path[3]).toEqual({ x: 2, y: 1 })
      expect(path[4]).toEqual({ x: 1, y: 1 })
      expect(path[5]).toEqual({ x: 0, y: 1 })
    })

    it('should handle single tile area', () => {
      const area = { startX: 5, startY: 5, endX: 5, endY: 5 }

      const path = calculateZigZagSweepPath(area)

      expect(path.length).toBe(1)
      expect(path[0]).toEqual({ x: 5, y: 5 })
    })

    it('should respect horizontal orientation (right)', () => {
      const area = { startX: 0, startY: 0, endX: 2, endY: 0 }
      const orientation = { horizontal: 'right', vertical: 'top' }

      const path = calculateZigZagSweepPath(area, orientation)

      // Should start from right
      expect(path[0]).toEqual({ x: 2, y: 0 })
      expect(path[2]).toEqual({ x: 0, y: 0 })
    })

    it('should respect vertical orientation (bottom)', () => {
      const area = { startX: 0, startY: 0, endX: 0, endY: 2 }
      const orientation = { horizontal: 'left', vertical: 'bottom' }

      const path = calculateZigZagSweepPath(area, orientation)

      // Should start from bottom
      expect(path[0]).toEqual({ x: 0, y: 2 })
      expect(path[2]).toEqual({ x: 0, y: 0 })
    })
  })

  describe('calculateFreeformSweepPath()', () => {
    it('should convert Set to sorted array', () => {
      const tiles = new Set(['1,2', '0,0', '1,0'])

      const path = calculateFreeformSweepPath(tiles)

      expect(path.length).toBe(3)
    })

    it('should return empty array for null input', () => {
      const path = calculateFreeformSweepPath(null)

      expect(path).toEqual([])
    })

    it('should return empty array for empty Set', () => {
      const path = calculateFreeformSweepPath(new Set())

      expect(path).toEqual([])
    })

    it('should sort by Y then X', () => {
      const tiles = new Set(['2,1', '0,1', '1,0'])

      const path = calculateFreeformSweepPath(tiles)

      // y=0 first, then y=1 sorted by x
      expect(path[0]).toEqual({ x: 1, y: 0 })
      expect(path[1]).toEqual({ x: 0, y: 1 })
      expect(path[2]).toEqual({ x: 2, y: 1 })
    })
  })

  describe('generateSweepDust()', () => {
    it('should return null when not sweeping', () => {
      mineSweeper.sweeping = false

      const dust = generateSweepDust(mineSweeper, 1000)

      expect(dust).toBeNull()
    })

    it('should create dust particle when sweeping', () => {
      mineSweeper.sweeping = true
      mineSweeper.direction = 0
      mineSweeper.x = 100
      mineSweeper.y = 100

      const dust = generateSweepDust(mineSweeper, 1000)

      expect(dust).not.toBeNull()
      expect(dust.startTime).toBe(1000)
      expect(dust.lifetime).toBe(500)
      expect(dust.color).toBe('#D2B48C')
    })

    it('should position dust in front of unit based on direction', () => {
      mineSweeper.sweeping = true
      mineSweeper.direction = 0 // Facing right
      mineSweeper.x = 100
      mineSweeper.y = 100

      const dust = generateSweepDust(mineSweeper, 1000)

      // Dust should be offset in direction unit is facing
      expect(dust.x).toBeGreaterThan(mineSweeper.x + 16) // Center + offset
    })

    it('should have velocity in direction of movement', () => {
      mineSweeper.sweeping = true
      mineSweeper.direction = Math.PI / 2 // Facing down
      mineSweeper.x = 100
      mineSweeper.y = 100

      const dust = generateSweepDust(mineSweeper, 1000)

      expect(dust.velocity.y).toBeGreaterThan(0)
    })
  })

  describe('computeSweepDustRadius()', () => {
    it('keeps a positive radius when the dust timestamp is ahead of the render clock', () => {
      // size * (1 + ((now - startTime) / lifetime) * 0.5) with this skew is about -85.29
      const dust = {
        startTime: 11661.2375,
        lifetime: 500,
        size: 8,
        currentSize: -85.2899
      }

      const radius = computeSweepDustRadius(dust, 0)

      expect(radius).toBe(8)
      expect(radius).toBeGreaterThan(0)
    })

    it('grows dust over its lifetime and drops expired particles', () => {
      const dust = { startTime: 1000, lifetime: 500, size: 8 }

      expect(computeSweepDustRadius(dust, 1250)).toBeCloseTo(8 * 1.25)
      expect(computeSweepDustRadius(dust, 1600)).toBe(0)
    })
  })
})
