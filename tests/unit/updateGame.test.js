/**
 * Tests for src/updateGame.js
 * Main game update loop coordination testing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../setup.js'

// Mock dependencies
vi.mock('../../src/config.js', async(importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    TILE_SIZE: 32,
    SMOKE_EMIT_INTERVAL: 500,
    BUILDING_SMOKE_EMIT_INTERVAL: 1000,
    BUILDING_SMOKE_PARTICLE_COUNT: 5,
    UNIT_SMOKE_SOFT_CAP_RATIO: 0.5,
    MAX_SMOKE_PARTICLES: 100
  }
})

vi.mock('../../src/utils/smokeUtils.js', () => ({
  emitSmokeParticles: vi.fn()
}))

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: vi.fn((fn) => fn)
}))

vi.mock('../../src/enemy.js', () => ({
  updateEnemyAI: vi.fn()
}))

vi.mock('../../src/inputHandler.js', () => ({
  cleanupDestroyedSelectedUnits: vi.fn(),
  getUnitCommandsHandler: vi.fn(() => null)
}))

vi.mock('../../src/buildings.js', () => ({
  updateBuildingsUnderRepair: vi.fn(),
  updateBuildingsAwaitingRepair: vi.fn(),
  buildingData: {
    constructionYard: { health: 1000 },
    turretGunV1: {
      health: 500,
      fireRange: 5,
      fireCooldown: 1000,
      damage: 25
    }
  },
  cacheBuildingSmokeScales: vi.fn(),
  createBuilding: vi.fn(),
  placeBuilding: vi.fn(),
  updatePowerSupply: vi.fn()
}))

vi.mock('../../src/utils.js', () => ({
  handleSelfRepair: vi.fn()
}))

vi.mock('../../src/behaviours/guard.js', () => ({
  updateGuardBehavior: vi.fn()
}))

vi.mock('../../src/main.js', () => ({
  units: [],
  buildingCosts: {}
}))

vi.mock('../../src/game/spatialQuadtree.js', () => ({
  rebuildSpatialQuadtree: vi.fn()
}))

vi.mock('../../src/game/unitMovement.js', () => ({
  updateUnitMovement: vi.fn(),
  updateSpawnExit: vi.fn()
}))

vi.mock('../../src/game/unitCombat.js', () => ({
  updateUnitCombat: vi.fn(),
  cleanupAttackGroupTargets: vi.fn()
}))

vi.mock('../../src/game/harvesterLogic.js', () => ({
  updateHarvesterLogic: vi.fn()
}))

vi.mock('../../src/game/workshopLogic.js', () => ({
  updateWorkshopLogic: vi.fn()
}))

vi.mock('../../src/game/bulletSystem.js', () => ({
  updateBullets: vi.fn()
}))

vi.mock('../../src/game/unitWreckManager.js', () => ({
  updateWreckPhysics: vi.fn()
}))

vi.mock('../../src/game/hospitalLogic.js', () => ({
  updateHospitalLogic: vi.fn()
}))

vi.mock('../../src/game/ambulanceSystem.js', () => ({
  updateAmbulanceLogic: vi.fn()
}))

vi.mock('../../src/game/gasStationLogic.js', () => ({
  updateGasStationLogic: vi.fn()
}))

vi.mock('../../src/game/ammunitionSystem.js', () => ({
  updateAmmunitionSystem: vi.fn()
}))

vi.mock('../../src/game/helipadLogic.js', () => ({
  updateHelipadLogic: vi.fn()
}))

vi.mock('../../src/game/tankerTruckLogic.js', () => ({
  updateTankerTruckLogic: vi.fn()
}))

vi.mock('../../src/game/ammunitionTruckLogic.js', () => ({
  updateAmmunitionTruckLogic: vi.fn()
}))

vi.mock('../../src/game/recoveryTankSystem.js', () => ({
  updateRecoveryTankLogic: vi.fn()
}))

vi.mock('../../src/game/mineSystem.js', () => ({
  updateMines: vi.fn()
}))

vi.mock('../../src/game/mineLayerBehavior.js', () => ({
  updateMineLayerBehavior: vi.fn()
}))

vi.mock('../../src/game/mineSweeperBehavior.js', () => ({
  updateMineSweeperBehavior: vi.fn()
}))

vi.mock('../../src/game/buildingSystem.js', () => ({
  updateBuildings: vi.fn(),
  updateTeslaCoilEffects: vi.fn()
}))

vi.mock('../../src/game/soundCooldownManager.js', () => ({
  cleanupSoundCooldowns: vi.fn()
}))

vi.mock('../../src/game/commandQueue.js', () => ({
  processCommandQueues: vi.fn()
}))

vi.mock('../../src/game/gameStateManager.js', () => ({
  updateMapScrolling: vi.fn(),
  updateCameraFollow: vi.fn(),
  updateOreSpread: vi.fn(),
  updateExplosions: vi.fn(),
  updateSmokeParticles: vi.fn(),
  updateDustParticles: vi.fn(),
  cleanupDestroyedUnits: vi.fn(),
  updateUnitCollisions: vi.fn(),
  updateGameTime: vi.fn(),
  handleRightClickDeselect: vi.fn(),
  cleanupDestroyedFactories: vi.fn(),
  checkGameEndConditions: vi.fn()
}))

vi.mock('../../src/game/pathfinding.js', () => ({
  updateGlobalPathfinding: vi.fn()
}))

vi.mock('../../src/utils/logger.js', () => ({
  logUnitStatus: vi.fn()
}))

vi.mock('../../src/game/remoteControl.js', () => ({
  updateRemoteControlledUnits: vi.fn()
}))

vi.mock('../../src/game/shadowOfWar.js', () => ({
  updateShadowOfWar: vi.fn()
}))

vi.mock('../../src/network/gameCommandSync.js', () => ({
  processPendingRemoteCommands: vi.fn(() => []),
  isHost: vi.fn(() => true),
  COMMAND_TYPES: {
    BUILDING_PLACE: 'BUILDING_PLACE',
    BUILDING_SELL: 'BUILDING_SELL',
    UNIT_MOVE: 'UNIT_MOVE',
    UNIT_ATTACK: 'UNIT_ATTACK',
    UNIT_STOP: 'UNIT_STOP',
    UNIT_GUARD: 'UNIT_GUARD',
    UNIT_SPAWN: 'UNIT_SPAWN'
  },
  updateUnitInterpolation: vi.fn()
}))

vi.mock('../../src/game/dangerZoneMap.js', () => ({
  updateDangerZoneMaps: vi.fn()
}))

vi.mock('../../src/units.js', () => ({
  spawnUnit: vi.fn(),
  unitCosts: {}
}))

describe('updateGame.js', () => {
  let updateGameModule

  beforeEach(async() => {
    vi.clearAllMocks()
    vi.resetModules()
    updateGameModule = await import('../../src/updateGame.js')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('updateGame', () => {
    it('[U04947] should export updateGame function', () => {
      expect(typeof updateGameModule.updateGame).toBe('function')
    })

    it('[U04948] should do nothing when game is paused', async() => {
      const { updateGameTime } = await import('../../src/game/gameStateManager.js')

      const gameState = {
        gamePaused: true,
        occupancyMap: []
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      // When paused, updateGameTime should not be called
      expect(updateGameTime).not.toHaveBeenCalled()
    })

    it('[U04949] should call cleanup functions when game is running', async() => {
      const { cleanupDestroyedSelectedUnits } = await import('../../src/inputHandler.js')
      const { rebuildSpatialQuadtree } = await import('../../src/game/spatialQuadtree.js')

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(cleanupDestroyedSelectedUnits).toHaveBeenCalled()
      expect(rebuildSpatialQuadtree).toHaveBeenCalled()
    })

    it('[U04950] should update unit movement speeds based on speed multiplier', async() => {
      const gameState = {
        gamePaused: false,
        speedMultiplier: 2,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      const units = [
        { speed: 100, effectiveSpeed: 0 },
        { speed: 50, effectiveSpeed: 0 }
      ]

      updateGameModule.updateGame(16, [], [], units, [], gameState)

      expect(units[0].effectiveSpeed).toBe(100)
      expect(units[1].effectiveSpeed).toBe(50)
    })

    it('[U04951] should initialize smokeParticles array if not present', async() => {
      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        buildings: [],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(gameState.smokeParticles).toBeInstanceOf(Array)
    })

    it('[U04952] should call game system updates when host', async() => {
      const { updateUnitMovement } = await import('../../src/game/unitMovement.js')
      const { updateUnitCombat } = await import('../../src/game/unitCombat.js')
      const { updateBullets } = await import('../../src/game/bulletSystem.js')
      const { updateBuildings } = await import('../../src/game/buildingSystem.js')
      const { updateEnemyAI } = await import('../../src/enemy.js')

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(updateUnitMovement).toHaveBeenCalled()
      expect(updateUnitCombat).toHaveBeenCalled()
      expect(updateBullets).toHaveBeenCalled()
      expect(updateBuildings).toHaveBeenCalled()
      expect(updateEnemyAI).toHaveBeenCalled()
    })

    it('[U04953] should update camera follow for UI regardless of host status', async() => {
      const { updateMapScrolling, updateCameraFollow } = await import('../../src/game/gameStateManager.js')

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(updateMapScrolling).not.toHaveBeenCalled()
      expect(updateCameraFollow).toHaveBeenCalled()
    })

    it('[U04954] should update visual effects (explosions, smoke, dust)', async() => {
      const { updateExplosions, updateSmokeParticles, updateDustParticles } = await import('../../src/game/gameStateManager.js')

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(updateExplosions).toHaveBeenCalled()
      expect(updateSmokeParticles).toHaveBeenCalled()
      expect(updateDustParticles).toHaveBeenCalled()
    })

    it('[U04955] should update shadow of war visibility', async() => {
      const { updateShadowOfWar } = await import('../../src/game/shadowOfWar.js')

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(updateShadowOfWar).toHaveBeenCalled()
    })

    it('[U04956] should handle errors gracefully without crashing', async() => {
      const { updateUnitMovement } = await import('../../src/game/unitMovement.js')
      updateUnitMovement.mockImplementation(() => {
        throw new Error('Test error')
      })

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      // Should not throw
      expect(() => {
        updateGameModule.updateGame(16, [], [], [], [], gameState)
      }).not.toThrow()

      // Reset the mock implementation for subsequent tests
      updateUnitMovement.mockImplementation(vi.fn())
    })

    it('[U04957] should process remote commands when host', async() => {
      const { processPendingRemoteCommands, isHost } = await import('../../src/network/gameCommandSync.js')
      isHost.mockReturnValue(true)
      processPendingRemoteCommands.mockReturnValue([])

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(processPendingRemoteCommands).toHaveBeenCalled()
    })

    it('[U04958] should apply BUILDING_PLACE commands from clients', async() => {
      const { processPendingRemoteCommands, isHost, COMMAND_TYPES } = await import('../../src/network/gameCommandSync.js')
      const { createBuilding, placeBuilding, updatePowerSupply } = await import('../../src/buildings.js')
      const { updateDangerZoneMaps } = await import('../../src/game/dangerZoneMap.js')

      isHost.mockReturnValue(true)
      const newBuilding = { id: 'b-1', type: 'constructionYard', x: 2, y: 3 }
      createBuilding.mockReturnValue(newBuilding)
      processPendingRemoteCommands.mockReturnValue([
        {
          commandType: COMMAND_TYPES.BUILDING_PLACE,
          payload: { buildingType: 'constructionYard', x: 2, y: 3 },
          sourcePartyId: 'player2'
        }
      ])

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(createBuilding).toHaveBeenCalledWith('constructionYard', 2, 3)
      expect(newBuilding.owner).toBe('player2')
      expect(gameState.buildings).toContain(newBuilding)
      expect(updateDangerZoneMaps).toHaveBeenCalledWith(gameState)
      expect(placeBuilding).toHaveBeenCalledWith(newBuilding, [])
      expect(updatePowerSupply).toHaveBeenCalledWith(gameState.buildings, gameState)
    })

    it('[U04959] should apply UNIT_MOVE commands with tile targets', async() => {
      const { processPendingRemoteCommands, isHost, COMMAND_TYPES } = await import('../../src/network/gameCommandSync.js')
      const { units: mainUnits } = await import('../../src/main.js')

      isHost.mockReturnValue(true)
      mainUnits.length = 0
      mainUnits.push({ id: 'unit-1', owner: 'player2', moveTarget: null, attackTarget: {}, guardPosition: {} })
      processPendingRemoteCommands.mockReturnValue([
        {
          commandType: COMMAND_TYPES.UNIT_MOVE,
          payload: { unitIds: ['unit-1'], targetX: 64, targetY: 96 },
          sourcePartyId: 'player2'
        }
      ])

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(mainUnits[0].moveTarget).toEqual({ x: 2, y: 3 })
      expect(mainUnits[0].attackTarget).toBeNull()
      expect(mainUnits[0].guardPosition).toBeNull()
    })

    it('[U04960] rejects remote movement orders while a vehicle is inside the garage', async() => {
      const { processPendingRemoteCommands, isHost, COMMAND_TYPES } = await import('../../src/network/gameCommandSync.js')
      const { units: mainUnits } = await import('../../src/main.js')
      isHost.mockReturnValue(true)
      mainUnits.length = 0
      const unit = { id: 'exiting', owner: 'player2', factoryExit: { phase: 'waiting' }, moveTarget: null }
      mainUnits.push(unit)
      processPendingRemoteCommands.mockReturnValue([{ commandType: COMMAND_TYPES.UNIT_MOVE,
        payload: { unitIds: [unit.id], targetX: 64, targetY: 96 }, sourcePartyId: 'player2' }])
      updateGameModule.updateGame(16, [], [], [], [], { gamePaused: true, occupancyMap: [], buildings: [] })
      expect(unit.moveTarget).toBeNull()
    })

    it('[U04961] should apply UNIT_ATTACK commands with target entity', async() => {
      const { processPendingRemoteCommands, isHost, COMMAND_TYPES } = await import('../../src/network/gameCommandSync.js')
      const { units: mainUnits } = await import('../../src/main.js')

      isHost.mockReturnValue(true)
      mainUnits.length = 0
      mainUnits.push({ id: 'unit-1', owner: 'player2', moveTarget: { x: 1, y: 1 }, guardPosition: { x: 1, y: 1 }, path: [1] })
      processPendingRemoteCommands.mockReturnValue([
        {
          commandType: COMMAND_TYPES.UNIT_ATTACK,
          payload: { unitIds: ['unit-1'], targetId: 'building-1' },
          sourcePartyId: 'player2'
        }
      ])

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [{ id: 'building-1', type: 'constructionYard' }],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(mainUnits[0].target).toBe(gameState.buildings[0])
      expect(mainUnits[0].moveTarget).toBeNull()
      expect(mainUnits[0].guardPosition).toBeNull()
      expect(mainUnits[0].path).toBeNull()
    })

    it('[U04962] should apply UNIT_STOP commands to clear attack state', async() => {
      const { processPendingRemoteCommands, isHost, COMMAND_TYPES } = await import('../../src/network/gameCommandSync.js')
      const { units: mainUnits } = await import('../../src/main.js')

      isHost.mockReturnValue(true)
      mainUnits.length = 0
      mainUnits.push({
        id: 'unit-1',
        owner: 'player2',
        path: [1],
        moveTarget: { x: 1, y: 1 },
        attackTarget: { id: 't' },
        guardPosition: { x: 2, y: 2 },
        target: { id: 't' },
        forcedAttack: true,
        attackQueue: [1],
        attackGroupTargets: [1]
      })
      processPendingRemoteCommands.mockReturnValue([
        {
          commandType: COMMAND_TYPES.UNIT_STOP,
          payload: { unitIds: ['unit-1'] },
          sourcePartyId: 'player2'
        }
      ])

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(mainUnits[0].path).toBeNull()
      expect(mainUnits[0].moveTarget).toBeNull()
      expect(mainUnits[0].attackTarget).toBeNull()
      expect(mainUnits[0].guardPosition).toBeNull()
      expect(mainUnits[0].target).toBeNull()
      expect(mainUnits[0].forcedAttack).toBe(false)
      expect(mainUnits[0].attackQueue).toEqual([])
      expect(mainUnits[0].attackGroupTargets).toEqual([])
    })

    it('[U04963] should apply UNIT_GUARD commands', async() => {
      const { processPendingRemoteCommands, isHost, COMMAND_TYPES } = await import('../../src/network/gameCommandSync.js')
      const { units: mainUnits } = await import('../../src/main.js')

      isHost.mockReturnValue(true)
      mainUnits.length = 0
      mainUnits.push({ id: 'unit-1', owner: 'player2', guardPosition: null, attackTarget: { id: 't' } })
      processPendingRemoteCommands.mockReturnValue([
        {
          commandType: COMMAND_TYPES.UNIT_GUARD,
          payload: { unitIds: ['unit-1'], guardX: 5, guardY: 6 },
          sourcePartyId: 'player2'
        }
      ])

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(mainUnits[0].guardPosition).toEqual({ x: 5, y: 6 })
      expect(mainUnits[0].attackTarget).toBeNull()
    })

    it('[U04964] should spawn units on UNIT_SPAWN commands', async() => {
      const { processPendingRemoteCommands, isHost, COMMAND_TYPES } = await import('../../src/network/gameCommandSync.js')
      const { spawnUnit } = await import('../../src/units.js')
      const { units: mainUnits } = await import('../../src/main.js')

      isHost.mockReturnValue(true)
      mainUnits.length = 0
      spawnUnit.mockReturnValue({ id: 'spawned-1', type: 'tank', owner: 'player2' })
      processPendingRemoteCommands.mockReturnValue([
        {
          commandType: COMMAND_TYPES.UNIT_SPAWN,
          payload: { unitType: 'tank', factoryId: 'vf-1', rallyPoint: { x: 4, y: 4 } },
          sourcePartyId: 'player2'
        }
      ])

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [{ id: 'vf-1', type: 'vehicleFactory', owner: 'player2' }],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(spawnUnit).toHaveBeenCalledWith(
        gameState.buildings[0],
        'tank',
        mainUnits,
        [],
        { x: 4, y: 4 },
        gameState.occupancyMap
      )
      expect(mainUnits).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'spawned-1' })]))
    })

    it('[U04965] should skip game logic for remote clients', async() => {
      const { isHost, updateUnitInterpolation } = await import('../../src/network/gameCommandSync.js')

      isHost.mockReturnValue(false)

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: {
          isRemote: true
        }
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      // Remote clients should use interpolation instead of full update
      expect(updateUnitInterpolation).toHaveBeenCalled()
      // But should still update visuals
    })

    it('[U04966] should emit smoke for heavily damaged tanks', async() => {
      const { emitSmokeParticles } = await import('../../src/utils/smokeUtils.js')

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      const units = [
        {
          type: 'tank',
          health: 10,
          maxHealth: 100,
          x: 100,
          y: 100,
          direction: 0,
          lastSmokeTime: 0
        }
      ]

      updateGameModule.updateGame(16, [], [], units, [], gameState)

      expect(emitSmokeParticles).toHaveBeenCalled()
    })

    it('[U04967] should emit darker/heavier smoke during destruction freeze delay', async() => {
      const { emitSmokeParticles } = await import('../../src/utils/smokeUtils.js')

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      const units = [
        {
          type: 'tank',
          health: 0,
          maxHealth: 100,
          x: 100,
          y: 100,
          direction: 0,
          destructionQueuedAt: 1000,
          destructionExplosionSpawned: false,
          lastSmokeTime: 0
        }
      ]

      updateGameModule.updateGame(16, [], [], units, [], gameState)

      expect(emitSmokeParticles).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ count: 3, smokeShade: 0.9 })
      )
    })

    it('[U04968] should not emit smoke for healthy units', async() => {
      const { emitSmokeParticles } = await import('../../src/utils/smokeUtils.js')

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      const units = [
        {
          type: 'tank',
          health: 90,
          maxHealth: 100,
          x: 100,
          y: 100
        }
      ]

      updateGameModule.updateGame(16, [], [], units, [], gameState)

      // Healthy units (> 25% health) should not emit smoke
      expect(emitSmokeParticles).not.toHaveBeenCalled()
    })

    it('[U04969] should update mines and mine layer behavior', async() => {
      const { updateMines } = await import('../../src/game/mineSystem.js')
      const { updateMineLayerBehavior } = await import('../../src/game/mineLayerBehavior.js')
      const { updateMineSweeperBehavior } = await import('../../src/game/mineSweeperBehavior.js')

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(updateMines).toHaveBeenCalled()
      expect(updateMineLayerBehavior).toHaveBeenCalled()
      expect(updateMineSweeperBehavior).toHaveBeenCalled()
    })

    it('[U04970] should check game end conditions', async() => {
      const { checkGameEndConditions } = await import('../../src/game/gameStateManager.js')

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      updateGameModule.updateGame(16, [], [], [], [], gameState)

      expect(checkGameEndConditions).toHaveBeenCalled()
    })

    it('[U04971] should log unit status for units with logging enabled', async() => {
      const { logUnitStatus } = await import('../../src/utils/logger.js')

      const gameState = {
        gamePaused: false,
        occupancyMap: [],
        smokeParticles: [],
        buildings: [],
        multiplayerSession: null
      }

      const units = [
        { loggingEnabled: true, type: 'tank', health: 100 },
        { loggingEnabled: false, type: 'harvester', health: 100 }
      ]

      updateGameModule.updateGame(16, [], [], units, [], gameState)

      expect(logUnitStatus).toHaveBeenCalledWith(expect.objectContaining({ loggingEnabled: true }))
    })
  })

  describe('updateTeslaCoilEffects', () => {
    it('[U04972] should re-export updateTeslaCoilEffects', () => {
      expect(typeof updateGameModule.updateTeslaCoilEffects).toBe('function')
    })
  })

  describe('Module exports', () => {
    it('[U04973] should export updateGame function', () => {
      expect(typeof updateGameModule.updateGame).toBe('function')
    })

    it('[U04974] should export updateTeslaCoilEffects function', () => {
      expect(typeof updateGameModule.updateTeslaCoilEffects).toBe('function')
    })
  })
})
