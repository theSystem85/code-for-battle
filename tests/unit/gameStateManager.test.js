import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  playSound: vi.fn(),
  playPositionalSound: vi.fn(),
  clearFactoryFromMapGrid: vi.fn(),
  resolveUnitCollisions: vi.fn(),
  removeUnitOccupancy: vi.fn(),
  registerUnitWreck: vi.fn(),
  releaseWreckAssignment: vi.fn(),
  detonateTankerTruck: vi.fn(),
  detonateAmmunitionTruck: vi.fn(),
  distributeMineLayerPayload: vi.fn(),
  removeSmokeParticle: vi.fn((gameState, index) => {
    gameState.smokeParticles.splice(index, 1)
  }),
  gameRandom: vi.fn(() => 0),
  isHost: vi.fn(() => true),
  getPlayableViewportWidth: vi.fn(() => 128),
  getPlayableViewportHeight: vi.fn(() => 128)
}))

vi.mock('../../src/network/gameCommandSync.js', () => ({ isHost: mocks.isHost }))
vi.mock('../../src/logic.js', () => ({ explosions: [] }))
vi.mock('../../src/sound.js', () => ({
  playSound: mocks.playSound,
  playPositionalSound: mocks.playPositionalSound,
  audioContext: { currentTime: 0 }
}))
vi.mock('../../src/factories.js', () => ({ clearFactoryFromMapGrid: mocks.clearFactoryFromMapGrid }))
vi.mock('../../src/units.js', () => ({
  resolveUnitCollisions: mocks.resolveUnitCollisions,
  removeUnitOccupancy: mocks.removeUnitOccupancy
}))
vi.mock('../../src/game/unitWreckManager.js', () => ({
  registerUnitWreck: mocks.registerUnitWreck,
  releaseWreckAssignment: mocks.releaseWreckAssignment
}))
vi.mock('../../src/game/tankerTruckUtils.js', () => ({ detonateTankerTruck: mocks.detonateTankerTruck }))
vi.mock('../../src/game/ammunitionTruckLogic.js', () => ({
  detonateAmmunitionTruck: mocks.detonateAmmunitionTruck
}))
vi.mock('../../src/game/mineSystem.js', () => ({ distributeMineLayerPayload: mocks.distributeMineLayerPayload }))
vi.mock('../../src/utils/smokeUtils.js', () => ({ removeSmokeParticle: mocks.removeSmokeParticle }))
vi.mock('../../src/utils/gameRandom.js', () => ({ gameRandom: mocks.gameRandom }))
vi.mock('../../src/utils/layoutMetrics.js', () => ({
  getPlayableViewportWidth: mocks.getPlayableViewportWidth,
  getPlayableViewportHeight: mocks.getPlayableViewportHeight
}))

const {
  playSound,
  playPositionalSound,
  clearFactoryFromMapGrid,
  resolveUnitCollisions,
  removeUnitOccupancy,
  registerUnitWreck,
  releaseWreckAssignment,
  detonateTankerTruck,
  detonateAmmunitionTruck,
  removeSmokeParticle,
  gameRandom,
  isHost
} = mocks

import {
  updateMapScrolling,
  updateOreSpread,
  updateExplosions,
  updateSmokeParticles,
  updateDustParticles,
  cleanupDestroyedUnits,
  cleanupDestroyedFactories,
  updateUnitCollisions,
  checkGameEndConditions,
  updateGameTime,
  handleRightClickDeselect,
  updateCameraFollow
} from '../../src/game/gameStateManager.js'
import {
  KEYBOARD_SCROLL_SPEED,
  INERTIA_DECAY,
  INERTIA_STOP_THRESHOLD,
  ORE_SPREAD_INTERVAL,
  TILE_SIZE,
  WIND_DIRECTION,
  WIND_STRENGTH
} from '../../src/config.js'
import { explosions } from '../../src/logic.js'
import { isHost as isHostImport } from '../../src/network/gameCommandSync.js'

const performanceNow = vi.fn(() => 0)
vi.stubGlobal('performance', { now: performanceNow })

describe('gameStateManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    performanceNow.mockReturnValue(1000)
    document.body.innerHTML = '<canvas id="gameCanvas" width="256" height="256"></canvas>'
    window.devicePixelRatio = 1
    explosions.length = 0
    isHost.mockReturnValue(true)
    gameRandom.mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('updateMapScrolling', () => {
    it('returns early when map grid is empty', () => {
      const gameState = {
        scrollOffset: { x: 10, y: 10 },
        dragVelocity: { x: 0, y: 0 },
        keyScroll: { left: false, right: false, up: false, down: false },
        smoothScroll: null,
        isRightDragging: false
      }

      updateMapScrolling(gameState, [])

      expect(gameState.scrollOffset).toEqual({ x: 10, y: 10 })
    })

    it('applies keyboard scroll velocity and clamps to map bounds', () => {
      const gameState = {
        scrollOffset: { x: 200, y: 150 },
        dragVelocity: { x: 0, y: 0 },
        keyScroll: { left: true, right: false, up: false, down: false },
        smoothScroll: null,
        isRightDragging: false
      }
      const mapGrid = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ type: 'land' })))

      updateMapScrolling(gameState, mapGrid)

      expect(gameState.dragVelocity.x).toBe(KEYBOARD_SCROLL_SPEED)
      expect(gameState.scrollOffset.x).toBe(200 - KEYBOARD_SCROLL_SPEED)
    })

    it('smoothly interpolates minimap scrolling targets', () => {
      const gameState = {
        scrollOffset: { x: 0, y: 0 },
        dragVelocity: { x: 0, y: 0 },
        keyScroll: { left: false, right: false, up: false, down: false },
        smoothScroll: { active: true, targetX: 400, targetY: 400 },
        isRightDragging: false
      }
      const mapGrid = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ type: 'land' })))

      updateMapScrolling(gameState, mapGrid)

      expect(gameState.scrollOffset.x).toBeGreaterThan(0)
      expect(gameState.scrollOffset.y).toBeGreaterThan(0)
      expect(gameState.smoothScroll.active).toBe(true)
    })
  })

  describe('updateOreSpread', () => {
    it('spreads ore to adjacent tiles when conditions allow', () => {
      const mapGrid = Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({ type: 'land', ore: false, seedCrystal: false }))
      )
      mapGrid[1][1].ore = true
      const gameState = {
        simulationTime: ORE_SPREAD_INTERVAL + 10,
        lastOreUpdate: 0,
        occupancyMap: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 0)),
        buildings: []
      }
      performanceNow.mockReturnValue(0)
      gameRandom.mockReturnValue(0)

      updateOreSpread(gameState, mapGrid, [])

      expect(mapGrid[1][2].ore).toBe(true)
      expect(gameState.lastOreUpdate).toBe(ORE_SPREAD_INTERVAL + 10)
    })

    it('avoids spreading ore onto occupied tiles', () => {
      const mapGrid = Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({ type: 'land', ore: false, seedCrystal: false }))
      )
      mapGrid[1][1].ore = true
      const gameState = {
        simulationTime: ORE_SPREAD_INTERVAL + 10,
        lastOreUpdate: 0,
        occupancyMap: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 0)),
        buildings: []
      }
      gameState.occupancyMap[1][2] = 1
      performanceNow.mockReturnValue(0)
      gameRandom.mockReturnValue(0)

      updateOreSpread(gameState, mapGrid, [])

      expect(mapGrid[1][2].ore).toBe(false)
    })

    it('increases neighbor ore density on spread and respects seed density multiplier', () => {
      const mapGrid = Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({ type: 'land', ore: false, oreDensity: 0, seedCrystal: false, seedCrystalDensity: 0 }))
      )
      mapGrid[1][1].ore = true
      mapGrid[1][1].seedCrystal = true
      mapGrid[1][1].seedCrystalDensity = 3
      mapGrid[1][2].ore = true
      mapGrid[1][2].oreDensity = 2

      const gameState = {
        simulationTime: ORE_SPREAD_INTERVAL + 10,
        lastOreUpdate: 0,
        occupancyMap: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 0)),
        buildings: []
      }

      performanceNow.mockReturnValue(0)
      gameRandom.mockReturnValue(0)

      updateOreSpread(gameState, mapGrid, [])

      expect(mapGrid[1][2].oreDensity).toBe(4)
      expect(mapGrid[0][1].ore).toBe(true)
      expect(mapGrid[0][1].oreDensity).toBe(1)
    })
  })

  describe('updateExplosions', () => {
    it('removes expired explosions on the host and syncs to gameState', () => {
      const gameState = { explosions: [] }
      performanceNow.mockReturnValue(2000)
      explosions.push(
        { startTime: 0, duration: 500 },
        { startTime: 1500, duration: 1000 },
        { startTime: 'invalid', duration: 1000 }
      )
      isHost.mockReturnValue(true)

      updateExplosions(gameState)

      expect(explosions).toHaveLength(1)
      expect(gameState.explosions).toBe(explosions)
    })

    it('initializes explosions for non-host clients', () => {
      const gameState = {}
      isHost.mockReturnValue(false)

      updateExplosions(gameState)

      expect(Array.isArray(gameState.explosions)).toBe(true)
    })
  })

  describe('updateSmokeParticles', () => {
    it('removes invalid/expired particles and updates active ones', () => {
      const gameState = {
        simulationTime: 1000,
        smokeParticles: [
          { startTime: 0 },
          { startTime: 0, duration: 100, size: 4, alpha: 1, x: 0, y: 0, vx: 0, vy: 0 },
          { startTime: 900, duration: 200, size: 4, alpha: 1, x: 5, y: 6, vx: 0.2, vy: -0.1 }
        ]
      }
      performanceNow.mockReturnValue(1000)
      gameRandom.mockReturnValue(0.5)

      updateSmokeParticles(gameState)

      expect(removeSmokeParticle).toHaveBeenCalledTimes(2)
      expect(gameState.smokeParticles).toHaveLength(1)
      const particle = gameState.smokeParticles[0]
      expect(particle.x).toBeCloseTo(5 + 0.2 + WIND_DIRECTION.x * WIND_STRENGTH, 5)
      expect(particle.y).toBeCloseTo(6 - 0.1 + WIND_DIRECTION.y * WIND_STRENGTH, 5)
      expect(particle.alpha).toBeLessThan(1)
      expect(particle.size).toBeGreaterThan(4)
    })

    it('uses simulation time for particle aging when available', () => {
      const gameState = {
        simulationTime: 1000,
        smokeParticles: [
          { startTime: 900, duration: 200, size: 4, alpha: 1, x: 5, y: 6, vx: 0.2, vy: -0.1 }
        ]
      }
      performanceNow.mockReturnValue(5000)
      gameRandom.mockReturnValue(0.5)

      updateSmokeParticles(gameState)

      expect(removeSmokeParticle).not.toHaveBeenCalled()
      expect(gameState.smokeParticles).toHaveLength(1)
    })
  })

  describe('updateDustParticles', () => {
    it('updates dust positions and clears invalid entries', () => {
      const gameState = {
        dustParticles: [
          { startTime: 0 },
          { startTime: 0, lifetime: 50, size: 2, x: 0, y: 0, velocity: { x: 1, y: 1 } },
          { startTime: 900, lifetime: 200, size: 2, x: 5, y: 6, velocity: { x: 2, y: -1 } }
        ]
      }
      performanceNow.mockReturnValue(1000)

      updateDustParticles(gameState)

      expect(gameState.dustParticles).toHaveLength(1)
      const particle = gameState.dustParticles[0]
      expect(particle.x).toBe(7)
      expect(particle.y).toBe(5)
      expect(particle.alpha).toBeLessThan(1)
      expect(particle.currentSize).toBeGreaterThan(2)
    })
  })

  describe('cleanupDestroyedUnits', () => {
    it('cleans up recovery tanks and tracks wreck assignments', () => {
      const unit = {
        id: 'rec-1',
        type: 'recoveryTank',
        owner: 'enemy',
        health: 0,
        destructionQueuedAt: -2000,
        occupancyRemoved: false,
        engineSound: {
          gainNode: { gain: { cancelScheduledValues: vi.fn() } },
          source: { stop: vi.fn() }
        }
      }
      const gameState = {
        unitWrecks: [
          { assignedTankId: 'rec-1' },
          { towedBy: 'rec-1' }
        ],
        factories: [],
        buildings: [],
        occupancyMap: [],
        playerUnitsDestroyed: 0,
        enemyUnitsDestroyed: 0,
        humanPlayer: 'player1'
      }

      cleanupDestroyedUnits([unit], gameState)

      expect(releaseWreckAssignment).toHaveBeenCalledTimes(2)
      expect(registerUnitWreck).toHaveBeenCalledWith(unit, gameState)
      expect(playSound).toHaveBeenCalledWith('enemyUnitDestroyed', 1.0, 0, true)
      expect(removeUnitOccupancy).toHaveBeenCalledWith(unit, gameState.occupancyMap)
      expect(unit.destroyed).toBe(true)
      expect(unit.engineSound).toBeNull()
      expect(gameState.enemyUnitsDestroyed).toBe(1)
    })

    it('keeps destroyed units frozen for 2 seconds before cleanup', () => {
      const unit = {
        id: 'tank-1',
        type: 'tank_v1',
        owner: 'enemy',
        health: 0,
        x: 32,
        y: 64,
        direction: 1.1,
        turretDirection: 2.2,
        vx: 1.5,
        vy: -0.5,
        occupancyRemoved: false
      }
      const units = [unit]
      const gameState = {
        factories: [],
        buildings: [],
        occupancyMap: [],
        playerUnitsDestroyed: 0,
        enemyUnitsDestroyed: 0,
        humanPlayer: 'player1'
      }

      performanceNow.mockReturnValue(1000)
      cleanupDestroyedUnits(units, gameState)

      expect(units).toHaveLength(1)
      expect(unit.vx).toBe(0)
      expect(unit.vy).toBe(0)
      expect(registerUnitWreck).not.toHaveBeenCalled()
      expect(playPositionalSound).not.toHaveBeenCalledWith('explosion', expect.any(Number), expect.any(Number), expect.any(Number))

      unit.direction = 0.1
      unit.turretDirection = 0.3
      performanceNow.mockReturnValue(3001)
      cleanupDestroyedUnits(units, gameState)

      expect(units).toHaveLength(0)
      expect(unit.direction).toBe(1.1)
      expect(unit.turretDirection).toBe(2.2)
      expect(registerUnitWreck).toHaveBeenCalledWith(unit, gameState)
      expect(playPositionalSound).toHaveBeenCalledWith('explosion', 48, 80, 0.5)
    })

    it('handles specialty unit destruction paths', () => {
      const ammoTruck = { id: 'ammo-1', type: 'ammunitionTruck', owner: 'enemy', health: 0, destructionQueuedAt: -2000 }
      const tankerTruck = { id: 'tank-1', type: 'tankerTruck', owner: 'player1', health: 0, destructionQueuedAt: -2000 }
      const units = [ammoTruck, tankerTruck]
      const gameState = {
        factories: [],
        buildings: [],
        occupancyMap: [],
        playerUnitsDestroyed: 0,
        enemyUnitsDestroyed: 0,
        humanPlayer: 'player1'
      }

      cleanupDestroyedUnits(units, gameState)

      expect(detonateAmmunitionTruck).toHaveBeenCalledWith(ammoTruck, expect.any(Array), [], gameState)
      expect(detonateTankerTruck).toHaveBeenCalledWith(tankerTruck, expect.any(Array), [], gameState)
      expect(registerUnitWreck).not.toHaveBeenCalledWith(ammoTruck, gameState)
      expect(gameState.playerUnitsDestroyed).toBe(1)
      expect(units).toHaveLength(0)
    })


    it('stops apache rotor audio during destroyed-unit cleanup', () => {
      const stop = vi.fn()
      const apache = {
        id: 'apache-1',
        type: 'apache',
        owner: 'enemy',
        health: 0,
        destructionQueuedAt: -2000,
        rotorSoundRequestId: 4,
        rotorSoundLoading: true,
        rotorSound: {
          gainNode: {
            gain: {
              value: 0.25,
              cancelScheduledValues: vi.fn(),
              setValueAtTime: vi.fn(),
              linearRampToValueAtTime: vi.fn()
            }
          },
          source: { stop }
        }
      }
      const units = [apache]
      const gameState = {
        factories: [],
        buildings: [],
        occupancyMap: [],
        playerUnitsDestroyed: 0,
        enemyUnitsDestroyed: 0,
        humanPlayer: 'player1'
      }

      cleanupDestroyedUnits(units, gameState)

      expect(apache.destroyed).toBe(true)
      expect(apache.rotorSoundRequestId).toBe(5)
      expect(apache.rotorSound).toBeNull()
      expect(apache.rotorSoundLoading).toBe(false)
      expect(stop).toHaveBeenCalledWith(0.05)
      expect(units).toHaveLength(0)
    })

    it('animates apache falling and rotating during the 2 second destruction freeze', () => {
      const apache = {
        id: 'apache-fall-1',
        type: 'apache',
        owner: 'enemy',
        health: 0,
        x: 64,
        y: 96,
        direction: 0.5,
        altitude: TILE_SIZE * 2.4,
        maxAltitude: TILE_SIZE * 3,
        rotor: { angle: 0.25, speed: 0.35, targetSpeed: 0.35 },
        occupancyRemoved: false
      }
      const units = [apache]
      const gameState = {
        factories: [],
        buildings: [],
        occupancyMap: [],
        playerUnitsDestroyed: 0,
        enemyUnitsDestroyed: 0,
        humanPlayer: 'player1'
      }

      performanceNow.mockReturnValue(1000)
      cleanupDestroyedUnits(units, gameState)
      expect(units).toHaveLength(1)
      expect(apache.apacheDestructionInitialAltitude).toBeGreaterThan(0)
      const initialAltitude = apache.apacheDestructionInitialAltitude

      performanceNow.mockReturnValue(2000)
      cleanupDestroyedUnits(units, gameState)
      expect(units).toHaveLength(1)
      expect(apache.altitude).toBeLessThan(initialAltitude)
      expect(apache.apacheDestructionRenderDirection).toBeCloseTo(0.5 + (Math.PI * 0.75), 5)
      expect(apache.rotor.angle).toBeGreaterThan(0.25)
      expect(apache.rotor.speed).toBeCloseTo(0.35 * 0.25, 5)
      expect(apache.shadow?.scale).toBeGreaterThanOrEqual(0.6)
      expect(apache.shadow?.scale).toBeLessThanOrEqual(1)

      performanceNow.mockReturnValue(3001)
      cleanupDestroyedUnits(units, gameState)
      expect(units).toHaveLength(0)
      expect(apache.rotor.speed).toBe(0)
      expect(playPositionalSound).toHaveBeenCalledWith('explosion', 80, 112, 0.5)
    })
  })

  describe('cleanupDestroyedFactories', () => {
    it('removes destroyed factories and triggers explosions', () => {
      const factory = { id: 'enemy', owner: 'enemy', x: 2, y: 3, width: 3, height: 2, health: 0 }
      const factories = [factory]
      const mapGrid = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ type: 'land' })))
      const gameState = {
        humanPlayer: 'player1',
        playerBuildingsDestroyed: 0,
        enemyBuildingsDestroyed: 0,
        explosions: []
      }

      cleanupDestroyedFactories(factories, mapGrid, gameState)

      expect(clearFactoryFromMapGrid).toHaveBeenCalledWith(factory, mapGrid)
      expect(factories).toHaveLength(0)
      expect(gameState.pendingButtonUpdate).toBe(true)
      expect(gameState.enemyBuildingsDestroyed).toBe(1)
      expect(playSound).toHaveBeenCalledWith('enemyBuildingDestroyed', 1.0, 0, true)
      expect(playPositionalSound).toHaveBeenCalledWith(
        'explosion',
        (2 + 3 / 2) * TILE_SIZE,
        (3 + 2 / 2) * TILE_SIZE,
        0.5
      )
      expect(gameState.explosions).toHaveLength(1)
    })
  })

  describe('updateUnitCollisions', () => {
    it('delegates to resolveUnitCollisions', () => {
      const units = [{ id: 'u1' }]
      const mapGrid = []

      updateUnitCollisions(units, mapGrid)

      expect(resolveUnitCollisions).toHaveBeenCalledWith(units, mapGrid)
    })
  })

  describe('checkGameEndConditions', () => {
    it('skips checks before the game starts', () => {
      const gameState = { gameStarted: false, buildings: [] }

      expect(checkGameEndConditions([], gameState)).toBe(false)
    })

    it('flags single-player defeat when no buildings remain', () => {
      const gameState = {
        gameStarted: true,
        buildings: [],
        humanPlayer: 'player1',
        losses: 0
      }

      const result = checkGameEndConditions([], gameState)

      expect(result).toBe(true)
      expect(gameState.gameOver).toBe(true)
      expect(gameState.gameResult).toBe('defeat')
      expect(gameState.losses).toBe(1)
      expect(playSound).toHaveBeenCalledWith('battleLost', 1.0, 0, true)
    })

    it('marks multiplayer players as defeated without ending the game', () => {
      const gameState = {
        gameStarted: true,
        buildings: [],
        humanPlayer: 'player1',
        losses: 0,
        multiplayerSession: { isRemote: true }
      }

      const result = checkGameEndConditions([], gameState)

      expect(result).toBe(false)
      expect(gameState.localPlayerDefeated).toBe(true)
      expect(gameState.gameResult).toBe('defeat')
      expect(gameState.defeatedPlayers.has('player1')).toBe(true)
    })

    it('does not mark player1 defeated when buildings use legacy player owner id', () => {
      const gameState = {
        gameStarted: true,
        buildings: [
          { owner: 'player', type: 'constructionYard', health: 350 },
          { owner: 'player2', type: 'constructionYard', health: 350 }
        ],
        humanPlayer: 'player1',
        losses: 0,
        multiplayerSession: { isRemote: true },
        defeatedPlayers: new Set()
      }

      const result = checkGameEndConditions([], gameState)

      expect(result).toBe(false)
      expect(gameState.localPlayerDefeated).not.toBe(true)
      expect(gameState.defeatedPlayers.has('player1')).toBe(false)
    })

    it('plays defeat sounds for newly defeated players', () => {
      vi.useFakeTimers()
      const gameState = {
        gameStarted: true,
        buildings: [{ owner: 'player1', type: 'powerPlant', health: 100 }],
        humanPlayer: 'player1',
        playerCount: 3,
        defeatedPlayers: new Set()
      }
      const factories = [
        { owner: 'player3', width: 1, height: 1, health: 100 }
      ]

      checkGameEndConditions(factories, gameState)
      vi.runAllTimers()

      expect(playSound).toHaveBeenCalledWith('playerRedDefeated', 1.0, 0, true)
    })

    it('declares victory when all other players are eliminated', () => {
      const gameState = {
        gameStarted: true,
        buildings: [{ owner: 'player1', type: 'powerPlant', health: 100 }],
        humanPlayer: 'player1',
        wins: 0,
        playerCount: 2
      }
      const factories = []

      const result = checkGameEndConditions(factories, gameState)

      expect(result).toBe(true)
      expect(gameState.gameOver).toBe(true)
      expect(gameState.gameResult).toBe('victory')
      expect(gameState.wins).toBe(1)
      expect(playSound).toHaveBeenCalledWith('battleWon', 0.8, 0, true)
    })

    it('ends spectator mode when a single player remains', () => {
      const gameState = {
        gameStarted: true,
        buildings: [
          { owner: 'player2', type: 'powerPlant', health: 100 }
        ],
        humanPlayer: 'player1',
        isSpectator: true,
        playerCount: 2
      }

      const result = checkGameEndConditions([], gameState)

      expect(result).toBe(true)
      expect(gameState.gameOver).toBe(true)
      expect(gameState.gameOverMessage).toContain('Player 2')
    })
  })

  describe('updateGameTime', () => {
    it('scales delta by the speed multiplier', () => {
      const gameState = { gameTime: 0, speedMultiplier: 2 }

      updateGameTime(gameState, 500)

      expect(gameState.gameTime).toBe(0.5)
    })
  })

  describe('handleRightClickDeselect', () => {
    it('clears selection on right click', () => {
      const units = [{ selected: true }, { selected: true }]
      const gameState = { rightClick: true, isRightDragging: false }

      handleRightClickDeselect(gameState, units)

      expect(units.every(unit => unit.selected === false)).toBe(true)
      expect(gameState.rightClick).toBe(false)
    })
  })

  describe('updateCameraFollow', () => {
    it('clears follow mode if the unit is missing or deselected', () => {
      const gameState = { cameraFollowUnitId: 'unit-1' }
      const units = [{ id: 'unit-1', selected: false }]

      updateCameraFollow(gameState, units, [[{ type: 'land' }]])

      expect(gameState.cameraFollowUnitId).toBe(null)
    })

    it('centers the camera on the followed unit', () => {
      const gameState = {
        cameraFollowUnitId: 'unit-2',
        scrollOffset: { x: 0, y: 0 },
        dragVelocity: { x: 5, y: 5 }
      }
      const units = [{ id: 'unit-2', selected: true, x: 96, y: 128 }]
      const mapGrid = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ type: 'land' })))

      updateCameraFollow(gameState, units, mapGrid)

      expect(gameState.scrollOffset.x).toBe(Math.max(0, Math.min(96 - 128, mapGrid[0].length * TILE_SIZE - 256)))
      expect(gameState.scrollOffset.y).toBe(Math.max(0, Math.min(128 - 128, mapGrid.length * TILE_SIZE - 256)))
      expect(gameState.dragVelocity).toEqual({ x: 0, y: 0 })
    })
  })

  it('uses the host flag helper directly in updateExplosions', () => {
    isHostImport.mockReturnValue(false)
    const gameState = { explosions: [] }

    updateExplosions(gameState)

    expect(isHostImport).toHaveBeenCalled()
  })

  it('applies inertia decay when keyboard scrolling stops', () => {
    const gameState = {
      scrollOffset: { x: 50, y: 50 },
      dragVelocity: { x: 2, y: 2 },
      keyScroll: { left: false, right: false, up: false, down: false },
      smoothScroll: null,
      isRightDragging: false
    }
    const mapGrid = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ type: 'land' })))

    updateMapScrolling(gameState, mapGrid)

    expect(gameState.dragVelocity.x).toBeCloseTo(2 * INERTIA_DECAY, 5)
    expect(gameState.dragVelocity.y).toBeCloseTo(2 * INERTIA_DECAY, 5)
    expect(gameState.dragVelocity.x).toBeGreaterThan(INERTIA_STOP_THRESHOLD)
  })
})
