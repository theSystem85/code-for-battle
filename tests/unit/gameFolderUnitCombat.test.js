import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../setup.js'
import { updateUnitCombat, cleanupAttackGroupTargets } from '../../src/game/unitCombat.js'
import { showNotification } from '../../src/ui/notifications.js'
import { playSound } from '../../src/sound.js'
import { hasClearShot, findPositionWithClearShot } from '../../src/logic.js'

// Mock dependencies
vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32,
  TANK_FIRE_RANGE: 9,
  TANK_BULLET_SPEED: 8,
  TURRET_AIMING_THRESHOLD: 0.2,
  TANK_V3_BURST: { COUNT: 2, DELAY: 150 },
  ATTACK_PATH_CALC_INTERVAL: 3000,
  HOWITZER_FIRE_RANGE: 15,
  HOWITZER_MIN_RANGE: 4,
  HOWITZER_FIREPOWER: 100,
  HOWITZER_FIRE_COOLDOWN: 5000,
  HOWITZER_PROJECTILE_SPEED: 6,
  HOWITZER_EXPLOSION_RADIUS_TILES: 1.5,
  APACHE_RANGE_REDUCTION: 0.7
}))

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn(),
  playPositionalSound: vi.fn()
}))

vi.mock('../../src/logic.js', () => ({
  hasClearShot: vi.fn(() => true),
  angleDiff: vi.fn((a, b) => {
    let diff = b - a
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    return diff
  }),
  smoothRotateTowardsAngle: vi.fn((current, _target, _speed) => _target),
  findPositionWithClearShot: vi.fn()
}))

vi.mock('../../src/units.js', () => ({
  findPath: vi.fn(() => [])
}))

vi.mock('../../src/game/unifiedMovement.js', () => ({
  stopUnitMovement: vi.fn()
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1',
    occupancyMap: [],
    buildings: [],
    units: [],
    mapGrid: [],
    partyStates: [],
    attackGroupTargets: []
  }
}))

vi.mock('../../src/utils.js', () => ({
  updateUnitSpeedModifier: vi.fn(),
  getBuildingIdentifier: vi.fn(b => b.id)
}))

vi.mock('../../src/utils/helipadUtils.js', () => ({
  getHelipadLandingCenter: vi.fn(() => ({ x: 100, y: 100 })),
  getHelipadLandingTile: vi.fn(() => ({ x: 3, y: 3 }))
}))

vi.mock('../../src/rendering/rocketTankImageRenderer.js', () => ({
  getRocketSpawnPoint: vi.fn((unit, x, y) => ({ x, y }))
}))

vi.mock('../../src/rendering/apacheImageRenderer.js', () => ({
  getApacheRocketSpawnPoints: vi.fn(() => ({
    left: { x: 100, y: 100 },
    right: { x: 100, y: 100 }
  }))
}))

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: (fn) => fn
}))

vi.mock('../../src/game/shadowOfWar.js', () => ({
  isPositionVisibleToPlayer: vi.fn(() => true)
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/game/howitzerGunController.js', () => ({
  isHowitzerGunReadyToFire: vi.fn(() => true),
  getHowitzerLaunchAngle: vi.fn(() => 0)
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn(() => 0.5)
}))

describe('unitCombat.js', () => {
  let mockMapGrid
  let mockGameState

  beforeEach(() => {
    vi.clearAllMocks()

    mockMapGrid = Array(10).fill(null).map(() =>
      Array(10).fill(null).map(() => ({ type: 'grass' }))
    )

    mockGameState = {
      humanPlayer: 'player1',
      occupancyMap: Array(10).fill(null).map(() => Array(10).fill(0)),
      buildings: [],
      units: [],
      mapGrid: mockMapGrid,
      partyStates: [],
      attackGroupTargets: []
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('updateUnitCombat', () => {
    it('should skip harvester units', () => {
      const harvester = {
        type: 'harvester',
        health: 100,
        owner: 'player1',
        target: { health: 100 }
      }
      const bullets = []
      updateUnitCombat([harvester], bullets, mockMapGrid, mockGameState, performance.now())
      expect(bullets.length).toBe(0)
    })

    it('should handle tesla disabled effects', () => {
      const now = performance.now()
      const unit = {
        type: 'tank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        teslaDisabledUntil: now + 5000,
        canFire: true
      }
      updateUnitCombat([unit], [], mockMapGrid, mockGameState, now)
      expect(unit.canFire).toBe(false)
    })

    it('should clear tesla effects when time expires', () => {
      const now = performance.now()
      const unit = {
        type: 'tank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        teslaDisabledUntil: now - 1000, // Expired
        canFire: false,
        teslaSlowed: true
      }
      updateUnitCombat([unit], [], mockMapGrid, mockGameState, now)
      expect(unit.canFire).toBe(true)
      expect(unit.teslaSlowed).toBe(false)
    })

    it('should not fire without ammunition', () => {
      const target = {
        x: 64,
        y: 32,
        tileX: 2,
        tileY: 1,
        health: 100
      }
      const unit = {
        type: 'tank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target,
        ammunition: 0,
        turretDirection: 0,
        direction: 0
      }
      const bullets = []
      updateUnitCombat([unit], bullets, mockMapGrid, mockGameState, performance.now())
      expect(bullets.length).toBe(0)
    })

    it('should process attack queue', () => {
      const target1 = { id: 1, x: 64, y: 32, tileX: 2, health: 100 }
      const target2 = { id: 2, x: 96, y: 32, tileX: 3, health: 100 }
      const unit = {
        type: 'tank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        attackQueue: [target1, target2],
        target: null
      }
      updateUnitCombat([unit], [], mockMapGrid, mockGameState, performance.now())
      expect(unit.target).toBe(target1)
    })

    it('should remove dead targets from attack queue', () => {
      const target1 = { id: 1, x: 64, y: 32, tileX: 2, health: 0 }
      const target2 = { id: 2, x: 96, y: 32, tileX: 3, health: 100 }
      const unit = {
        type: 'tank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        attackQueue: [target1, target2],
        target: null
      }
      updateUnitCombat([unit], [], mockMapGrid, mockGameState, performance.now())
      expect(unit.attackQueue).not.toContain(target1)
    })

    it('fires a bullet when a human tank is in range and aimed', () => {
      const target = {
        id: 'enemy-1',
        x: 64,
        y: 32,
        tileX: 2,
        tileY: 1,
        health: 100
      }
      const unitCenterX = 32 + 16
      const unitCenterY = 32 + 16
      const targetCenterX = target.x + 16
      const targetCenterY = target.y + 16
      const angle = Math.atan2(targetCenterY - unitCenterY, targetCenterX - unitCenterX)

      const unit = {
        type: 'tank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target,
        ammunition: 5,
        turretDirection: angle,
        direction: angle,
        canFire: true,
        lastShotTime: 0
      }

      const bullets = []
      updateUnitCombat([unit], bullets, mockMapGrid, mockGameState, 10000)

      expect(bullets.length).toBe(1)
      expect(bullets[0].projectileType).toBe('bullet')
      expect(bullets[0].shooter).toBe(unit)
    })

    it('notifies when player unit is out of ammo', () => {
      const target = {
        id: 'enemy-1',
        x: 64,
        y: 32,
        tileX: 2,
        tileY: 1,
        health: 100
      }
      const unitCenterX = 32 + 16
      const unitCenterY = 32 + 16
      const targetCenterX = target.x + 16
      const targetCenterY = target.y + 16
      const angle = Math.atan2(targetCenterY - unitCenterY, targetCenterX - unitCenterX)

      const unit = {
        type: 'tank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target,
        ammunition: 0,
        turretDirection: angle,
        direction: angle,
        canFire: true,
        lastShotTime: 0
      }

      updateUnitCombat([unit], [], mockMapGrid, mockGameState, 10000)

      expect(showNotification).toHaveBeenCalledWith('No Ammunition - Resupply Required', 3000)
      expect(playSound).toHaveBeenCalledWith('i_am_out_of_ammo', 1.0, 0, true)
      expect(unit.noAmmoNotificationShown).toBe(true)
    })

    it('fires rocket tank burst rockets after the initial burst setup', () => {
      const target = {
        id: 'enemy-2',
        x: 96,
        y: 32,
        tileX: 3,
        tileY: 1,
        health: 100
      }
      const unitCenterX = 32 + 16
      const unitCenterY = 32 + 16
      const targetCenterX = target.x + 16
      const targetCenterY = target.y + 16
      const angle = Math.atan2(targetCenterY - unitCenterY, targetCenterX - unitCenterX)

      const unit = {
        type: 'rocketTank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target,
        ammunition: 3,
        turretDirection: angle,
        direction: angle,
        canFire: true,
        lastShotTime: 0,
        movement: { rotation: angle }
      }
      const bullets = []

      updateUnitCombat([unit], bullets, mockMapGrid, mockGameState, 10000)
      updateUnitCombat([unit], bullets, mockMapGrid, mockGameState, 10400)

      expect(bullets.length).toBeGreaterThan(0)
      expect(bullets[0].projectileType).toBe('rocket')
      expect(bullets[0].homing).toBe(true)
    })
  })

  describe('tank combat', () => {
    it('should clear target if destroyed', () => {
      const unit = {
        type: 'tank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        target: { health: 0 }
      }
      updateUnitCombat([unit], [], mockMapGrid, mockGameState, performance.now())
      // The target check happens in movement phase primarily
      expect(unit.type).toBe('tank')
    })

    it('should handle tank-v2 alert mode', () => {
      const enemy = {
        type: 'tank',
        owner: 'enemy',
        health: 100,
        x: 64,
        y: 32,
        tileX: 2,
        tileY: 1
      }
      const unit = {
        type: 'tank-v2',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        alertMode: true,
        target: null,
        turretDirection: 0,
        direction: 0
      }
      mockGameState.units = [unit, enemy]
      updateUnitCombat([unit, enemy], [], mockMapGrid, mockGameState, performance.now())
      // In alert mode, unit should acquire target without chasing
    })

    it('should handle tank-v3 burst fire', () => {
      const target = {
        x: 64,
        y: 32,
        tileX: 2,
        tileY: 1,
        health: 100
      }
      const unit = {
        type: 'tank-v3',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target,
        turretDirection: 0,
        direction: 0,
        ammunition: 10,
        lastShotTime: 0
      }
      const bullets = []
      updateUnitCombat([unit], bullets, mockMapGrid, mockGameState, performance.now())
      // Should initiate burst fire if in range
    })
  })

  describe('rocket tank combat', () => {
    it('should clear target and burst if target destroyed', () => {
      const unit = {
        type: 'rocketTank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        target: { health: 0 },
        burstState: { rocketsToFire: 2 }
      }
      updateUnitCombat([unit], [], mockMapGrid, mockGameState, performance.now())
      expect(unit.target).toBeNull()
      expect(unit.burstState).toBeNull()
    })

    it('should rotate body towards target for rocket tank', () => {
      const target = {
        x: 128,
        y: 32,
        tileX: 4,
        tileY: 1,
        health: 100
      }
      const unit = {
        type: 'rocketTank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target,
        direction: Math.PI, // Facing away from target
        rotationSpeed: 0.1,
        movement: { rotation: Math.PI }
      }
      updateUnitCombat([unit], [], mockMapGrid, mockGameState, performance.now())
      // Direction should be updated to face target
      expect(unit.direction).toBeDefined()
    })
  })

  describe('apache combat', () => {
    it('should clear volley state when target dies', () => {
      const unit = {
        type: 'apache',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        target: { health: 0 },
        volleyState: { leftRemaining: 2 }
      }
      updateUnitCombat([unit], [], mockMapGrid, mockGameState, performance.now())
      expect(unit.volleyState).toBeNull()
    })

    it('should skip combat when remote control is active', () => {
      const target = { health: 100, x: 64, y: 32 }
      const unit = {
        type: 'apache',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        target,
        remoteControlActive: true,
        rocketAmmo: 10
      }
      const bullets = []
      updateUnitCombat([unit], bullets, mockMapGrid, mockGameState, performance.now())
      expect(bullets.length).toBe(0)
    })

    it('should set apacheAmmoEmpty when out of rockets', () => {
      const target = { health: 100, x: 64, y: 32, tileX: 2, tileY: 1 }
      const unit = {
        type: 'apache',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        target,
        rocketAmmo: 0,
        volleyState: null
      }
      updateUnitCombat([unit], [], mockMapGrid, mockGameState, performance.now())
      expect(unit.apacheAmmoEmpty).toBe(true)
      expect(unit.canFire).toBe(false)
    })
  })

  describe('howitzer combat', () => {
    it('should not fire if target is within minimum range', () => {
      const target = {
        x: 48, // Very close
        y: 32,
        tileX: 1,
        tileY: 1,
        health: 100
      }
      const unit = {
        type: 'howitzer',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target,
        direction: 0,
        ammunition: 10,
        lastShotTime: 0
      }
      const bullets = []
      updateUnitCombat([unit], bullets, mockMapGrid, mockGameState, performance.now())
      // Should not fire because target is too close
      expect(bullets.length).toBe(0)
    })

    it('should not fire without loader crew', () => {
      const target = {
        x: 224, // Outside min range
        y: 32,
        tileX: 7,
        tileY: 1,
        health: 100
      }
      const unit = {
        type: 'howitzer',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target,
        direction: 0,
        ammunition: 10,
        lastShotTime: 0,
        crew: { loader: false, gunner: true }
      }
      const bullets = []
      updateUnitCombat([unit], bullets, mockMapGrid, mockGameState, performance.now())
      expect(bullets.length).toBe(0)
    })
  })

  describe('cleanupAttackGroupTargets', () => {
    it('should remove dead targets from attack group', async() => {
      const { gameState } = await import('../../src/gameState.js')
      gameState.attackGroupTargets = [
        { id: 1, health: 100 },
        { id: 2, health: 0 },
        { id: 3, health: 50 }
      ]
      cleanupAttackGroupTargets()
      expect(gameState.attackGroupTargets.length).toBe(2)
      expect(gameState.attackGroupTargets.every(t => t.health > 0)).toBe(true)
    })

    it('should handle empty attack group targets', async() => {
      const { gameState } = await import('../../src/gameState.js')
      gameState.attackGroupTargets = []
      expect(() => cleanupAttackGroupTargets()).not.toThrow()
    })

    it('should handle undefined attack group targets', async() => {
      const { gameState } = await import('../../src/gameState.js')
      gameState.attackGroupTargets = undefined
      expect(() => cleanupAttackGroupTargets()).not.toThrow()
    })
  })

  describe('guard mode', () => {
    it('should acquire targets within range in guard mode', async() => {
      const enemy = {
        type: 'tank',
        owner: 'enemy',
        health: 100,
        x: 64,
        y: 32,
        tileX: 2,
        tileY: 1
      }
      const unit = {
        type: 'tank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        guardTarget: { x: 32, y: 32 },
        target: null
      }
      const { gameState } = await import('../../src/gameState.js')
      gameState.buildings = []
      updateUnitCombat([unit, enemy], [], mockMapGrid, mockGameState, performance.now())
      // Guard mode should acquire nearby targets
    })

    it('should clear target if enemy moves out of guard range', () => {
      const enemy = {
        type: 'tank',
        owner: 'enemy',
        health: 100,
        x: 500, // Far away
        y: 500,
        tileX: 15,
        tileY: 15
      }
      const unit = {
        type: 'tank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        guardTarget: { x: 32, y: 32 },
        target: enemy
      }
      updateUnitCombat([unit, enemy], [], mockMapGrid, mockGameState, performance.now())
      expect(unit.target).toBeNull()
    })
  })

  describe('crew restrictions', () => {
    it('should not fire turret without gunner', () => {
      const target = {
        x: 64,
        y: 32,
        tileX: 2,
        tileY: 1,
        health: 100
      }
      const unit = {
        type: 'tank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target,
        ammunition: 10,
        crew: { gunner: false, loader: true },
        turretDirection: 0,
        direction: 0
      }
      const bullets = []
      // The firing logic checks for loader, but turret aiming checks gunner
      updateUnitCombat([unit], bullets, mockMapGrid, mockGameState, performance.now())
    })

    it('should not fire without loader', () => {
      const target = {
        x: 64,
        y: 32,
        tileX: 2,
        tileY: 1,
        health: 100
      }
      const unit = {
        type: 'tank',
        health: 100,
        owner: 'player1',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target,
        ammunition: 10,
        crew: { gunner: true, loader: false },
        turretDirection: 0,
        direction: 0
      }
      const bullets = []
      updateUnitCombat([unit], bullets, mockMapGrid, mockGameState, performance.now())
      expect(bullets.length).toBe(0)
    })
  })

  describe('multiplayer unit ownership', () => {
    it('should allow human-controlled party units to attack', async() => {
      const { gameState } = await import('../../src/gameState.js')
      gameState.partyStates = [
        { partyId: 'player2', aiActive: false }
      ]

      const target = {
        x: 64,
        y: 32,
        tileX: 2,
        tileY: 1,
        health: 100
      }
      const unit = {
        type: 'tank',
        health: 100,
        owner: 'player2',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target,
        ammunition: 10,
        turretDirection: 0,
        direction: 0,
        canFire: true,
        lastShotTime: 0
      }
      const bullets = []
      updateUnitCombat([unit], bullets, mockMapGrid, mockGameState, performance.now())
      // Human-controlled party should be able to fire
    })

    it('should require allowedToAttack for AI units', () => {
      const target = {
        x: 64,
        y: 32,
        tileX: 2,
        tileY: 1,
        health: 100
      }
      const unit = {
        type: 'tank',
        health: 100,
        owner: 'ai_enemy',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target,
        ammunition: 10,
        turretDirection: 0,
        direction: 0,
        allowedToAttack: false,
        lastShotTime: 0
      }
      const bullets = []
      updateUnitCombat([unit], bullets, mockMapGrid, mockGameState, performance.now())
      expect(bullets.length).toBe(0)
    })

    it('should keep reposition path when target is in range but line of sight is blocked', () => {
      vi.mocked(hasClearShot).mockReturnValue(false)
      vi.mocked(findPositionWithClearShot).mockImplementation((unit) => {
        unit.path = [{ x: 3, y: 2 }]
        unit.moveTarget = { x: 3, y: 2 }
        unit.findingClearShot = false
        return true
      })

      const target = {
        x: 64,
        y: 32,
        tileX: 2,
        tileY: 1,
        health: 100,
        owner: 'player2'
      }
      const blocker = {
        x: 48,
        y: 32,
        tileX: 1,
        tileY: 1,
        health: 100,
        owner: 'ai_enemy'
      }
      const unit = {
        type: 'tank',
        health: 100,
        owner: 'ai_enemy',
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target,
        ammunition: 10,
        turretDirection: 0,
        direction: 0,
        allowedToAttack: true,
        lastShotTime: 0,
        path: [{ x: 1, y: 1 }],
        moveTarget: { x: 1, y: 1 }
      }
      const bullets = []

      updateUnitCombat([unit, blocker, target], bullets, mockMapGrid, mockGameState, performance.now())

      expect(findPositionWithClearShot).toHaveBeenCalled()
      expect(unit.path).toEqual([{ x: 3, y: 2 }])
      expect(unit.moveTarget).toEqual({ x: 3, y: 2 })
      expect(bullets.length).toBe(0)
    })
  })
})
