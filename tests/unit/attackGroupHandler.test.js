/**
 * Unit tests for src/input/attackGroupHandler.js
 *
 * Tests Attack Group Focus (AGF) functionality including
 * selection detection, enemy target finding, and attack queue setup.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock dependencies
vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1',
    buildings: [],
    buildingPlacementMode: false,
    repairMode: false,
    sellMode: false,
    attackGroupMode: false,
    attackGroupStart: { x: 0, y: 0 },
    attackGroupEnd: { x: 0, y: 0 },
    disableAGFRendering: false,
    selectionActive: false,
    selectionStart: { x: 0, y: 0 },
    selectionEnd: { x: 0, y: 0 },
    attackGroupTargets: [],
    altKeyDown: false
  }
}))

vi.mock('../../src/game/waypointSounds.js', () => ({
  markWaypointsAdded: vi.fn()
}))

import { AttackGroupHandler } from '../../src/input/attackGroupHandler.js'
import { gameState } from '../../src/gameState.js'
import { markWaypointsAdded } from '../../src/game/waypointSounds.js'

describe('AttackGroupHandler', () => {
  let handler
  let selectedUnits
  let unitCommands
  let mapGrid

  beforeEach(() => {
    vi.clearAllMocks()

    handler = new AttackGroupHandler()

    // Reset gameState
    gameState.humanPlayer = 'player1'
    gameState.buildings = []
    gameState.buildingPlacementMode = false
    gameState.repairMode = false
    gameState.sellMode = false
    gameState.attackGroupMode = false
    gameState.attackGroupStart = { x: 0, y: 0 }
    gameState.attackGroupEnd = { x: 0, y: 0 }
    gameState.disableAGFRendering = false
    gameState.selectionActive = false
    gameState.selectionStart = { x: 0, y: 0 }
    gameState.selectionEnd = { x: 0, y: 0 }
    gameState.attackGroupTargets = []
    gameState.altKeyDown = false

    selectedUnits = [
      { id: 'tank-1', type: 'tank', owner: 'player1', health: 100, isBuilding: false, commandQueue: [] }
    ]

    unitCommands = {
      isAttackGroupOperation: false,
      handleAttackCommand: vi.fn()
    }

    mapGrid = []
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const newHandler = new AttackGroupHandler()

      expect(newHandler.isAttackGroupSelecting).toBe(false)
      expect(newHandler.attackGroupStartWorld).toEqual({ x: 0, y: 0 })
      expect(newHandler.attackGroupWasDragging).toBe(false)
      expect(newHandler.potentialAttackGroupStart).toEqual({ x: 0, y: 0 })
      expect(newHandler.hasSelectedCombatUnits).toBe(false)
      expect(newHandler.disableAGFRendering).toBe(false)
    })
  })

  describe('shouldStartAttackGroupMode()', () => {
    it('should return true for selected combat units', () => {
      const result = handler.shouldStartAttackGroupMode(selectedUnits)

      expect(result).toBe(true)
    })

    it('should return false for empty selection', () => {
      const result = handler.shouldStartAttackGroupMode([])

      expect(result).toBe(false)
    })

    it('should return false for null selection', () => {
      const result = handler.shouldStartAttackGroupMode(null)

      expect(result).toBeFalsy()
    })

    it('should return false for harvesters', () => {
      const harvesters = [
        { id: 'harvester-1', type: 'harvester', owner: 'player1', health: 100, isBuilding: false }
      ]

      const result = handler.shouldStartAttackGroupMode(harvesters)

      expect(result).toBe(false)
    })

    it('should return false for ambulances (service vehicles)', () => {
      const ambulances = [
        { id: 'amb-1', type: 'ambulance', owner: 'player1', health: 100, isBuilding: false }
      ]

      const result = handler.shouldStartAttackGroupMode(ambulances)

      expect(result).toBe(false)
    })

    it('should return false for tanker trucks (service vehicles)', () => {
      const tankers = [
        { id: 'tanker-1', type: 'tankerTruck', owner: 'player1', health: 100, isBuilding: false }
      ]

      const result = handler.shouldStartAttackGroupMode(tankers)

      expect(result).toBe(false)
    })

    it('should return false for recovery tanks (service vehicles)', () => {
      const recoveryTanks = [
        { id: 'rt-1', type: 'recoveryTank', owner: 'player1', health: 100, isBuilding: false }
      ]

      const result = handler.shouldStartAttackGroupMode(recoveryTanks)

      expect(result).toBe(false)
    })

    it('should return false for mine sweepers (service vehicles)', () => {
      const sweepers = [
        { id: 'ms-1', type: 'mineSweeper', owner: 'player1', health: 100, isBuilding: false }
      ]

      const result = handler.shouldStartAttackGroupMode(sweepers)

      expect(result).toBe(false)
    })

    it('should return false for mine layers (service vehicles)', () => {
      const layers = [
        { id: 'ml-1', type: 'mineLayer', owner: 'player1', health: 100, isBuilding: false }
      ]

      const result = handler.shouldStartAttackGroupMode(layers)

      expect(result).toBe(false)
    })

    it('should return false when factory is selected', () => {
      const unitsWithFactory = [
        { id: 'tank-1', type: 'tank', owner: 'player1', health: 100, isBuilding: false },
        { type: 'vehicleFactory', isBuilding: true }
      ]

      const result = handler.shouldStartAttackGroupMode(unitsWithFactory)

      expect(result).toBe(false)
    })

    it('should return false in building placement mode', () => {
      gameState.buildingPlacementMode = true

      const result = handler.shouldStartAttackGroupMode(selectedUnits)

      expect(result).toBe(false)
    })

    it('should return false in repair mode', () => {
      gameState.repairMode = true

      const result = handler.shouldStartAttackGroupMode(selectedUnits)

      expect(result).toBe(false)
    })

    it('should return false in sell mode', () => {
      gameState.sellMode = true

      const result = handler.shouldStartAttackGroupMode(selectedUnits)

      expect(result).toBe(false)
    })

    it('should return false when already in attack group mode', () => {
      gameState.attackGroupMode = true

      const result = handler.shouldStartAttackGroupMode(selectedUnits)

      expect(result).toBe(false)
    })

    it('should return false for enemy units', () => {
      const enemyUnits = [
        { id: 'enemy-tank', type: 'tank', owner: 'enemy', health: 100, isBuilding: false }
      ]

      const result = handler.shouldStartAttackGroupMode(enemyUnits)

      expect(result).toBe(false)
    })

    it('should return true if at least one combat unit among service vehicles', () => {
      const mixedUnits = [
        { id: 'harvester-1', type: 'harvester', owner: 'player1', health: 100, isBuilding: false },
        { id: 'tank-1', type: 'tank', owner: 'player1', health: 100, isBuilding: false },
        { id: 'ambulance-1', type: 'ambulance', owner: 'player1', health: 100, isBuilding: false }
      ]

      const result = handler.shouldStartAttackGroupMode(mixedUnits)

      expect(result).toBe(true)
    })

    it('should return true for selected defensive buildings', () => {
      const defensiveBuildings = [
        { id: 'turret-1', type: 'rocketTurret', owner: 'player1', health: 100, isBuilding: true }
      ]

      const result = handler.shouldStartAttackGroupMode(defensiveBuildings)

      expect(result).toBe(true)
    })
  })

  describe('handleMouseUp()', () => {
    it('should reset attack group state after handling', () => {
      handler.isAttackGroupSelecting = true
      handler.attackGroupWasDragging = false

      handler.handleMouseUp(100, 100, [], selectedUnits, unitCommands, mapGrid, null)

      expect(handler.isAttackGroupSelecting).toBe(false)
      expect(gameState.attackGroupMode).toBe(false)
    })

    it('should call standard command function when not dragging', () => {
      handler.attackGroupWasDragging = false
      const standardCommandFn = vi.fn()

      handler.handleMouseUp(100, 100, [], selectedUnits, unitCommands, mapGrid, standardCommandFn)

      expect(standardCommandFn).toHaveBeenCalledWith(
        100, 100, selectedUnits, unitCommands, mapGrid, gameState.altKeyDown
      )
    })

    it('should find and attack enemies in attack group area when dragging', () => {
      handler.attackGroupWasDragging = true
      gameState.attackGroupStart = { x: 0, y: 0 }
      gameState.attackGroupEnd = { x: 100, y: 100 }

      const enemies = [
        { id: 'enemy-1', owner: 'enemy', health: 100, x: 16, y: 16 }
      ]

      handler.handleMouseUp(100, 100, enemies, selectedUnits, unitCommands, mapGrid, null)

      expect(unitCommands.handleAttackCommand).toHaveBeenCalled()
    })

    it('should queue AGF command with alt key pressed', () => {
      handler.attackGroupWasDragging = true
      gameState.attackGroupStart = { x: 0, y: 0 }
      gameState.attackGroupEnd = { x: 100, y: 100 }
      gameState.altKeyDown = true

      const enemies = [
        { id: 'enemy-1', owner: 'enemy', health: 100, x: 16, y: 16 }
      ]

      handler.handleMouseUp(100, 100, enemies, selectedUnits, unitCommands, mapGrid, null)

      expect(selectedUnits[0].commandQueue.length).toBe(1)
      expect(selectedUnits[0].commandQueue[0].type).toBe('agf')
      expect(markWaypointsAdded).toHaveBeenCalled()
    })

    it('should disable AGF rendering temporarily', () => {
      vi.useFakeTimers()

      handler.handleMouseUp(100, 100, [], selectedUnits, unitCommands, mapGrid, null)

      expect(gameState.disableAGFRendering).toBe(true)

      vi.advanceTimersByTime(60)

      expect(gameState.disableAGFRendering).toBe(false)

      vi.useRealTimers()
    })
  })

  describe('resetAttackGroupState()', () => {
    it('should reset all attack group state properties', () => {
      handler.isAttackGroupSelecting = true
      handler.attackGroupWasDragging = true
      handler.hasSelectedCombatUnits = true
      handler.potentialAttackGroupStart = { x: 50, y: 50 }
      handler.attackGroupStartWorld = { x: 100, y: 100 }
      gameState.selectionActive = true
      gameState.selectionStart = { x: 10, y: 10 }
      gameState.selectionEnd = { x: 20, y: 20 }

      handler.resetAttackGroupState()

      expect(handler.isAttackGroupSelecting).toBe(false)
      expect(handler.attackGroupWasDragging).toBe(false)
      expect(handler.hasSelectedCombatUnits).toBe(false)
      expect(handler.potentialAttackGroupStart).toEqual({ x: 0, y: 0 })
      expect(handler.attackGroupStartWorld).toEqual({ x: 0, y: 0 })
      expect(gameState.selectionActive).toBe(false)
      expect(gameState.selectionStart).toEqual({ x: 0, y: 0 })
      expect(gameState.selectionEnd).toEqual({ x: 0, y: 0 })
    })
  })

  describe('findEnemyUnitsInAttackGroup()', () => {
    it('should find enemy units within attack group bounds', () => {
      gameState.attackGroupStart = { x: 0, y: 0 }
      gameState.attackGroupEnd = { x: 100, y: 100 }

      const units = [
        { id: 'enemy-1', owner: 'enemy', health: 100, x: 16, y: 16 },
        { id: 'enemy-2', owner: 'enemy', health: 100, x: 200, y: 200 }
      ]

      const enemies = handler.findEnemyUnitsInAttackGroup(units)

      expect(enemies.length).toBe(1)
      expect(enemies[0].id).toBe('enemy-1')
    })

    it('should not include player units', () => {
      gameState.attackGroupStart = { x: 0, y: 0 }
      gameState.attackGroupEnd = { x: 100, y: 100 }

      const units = [
        { id: 'tank-1', owner: 'player1', health: 100, x: 16, y: 16 },
        { id: 'enemy-1', owner: 'enemy', health: 100, x: 16, y: 16 }
      ]

      const enemies = handler.findEnemyUnitsInAttackGroup(units)

      expect(enemies.length).toBe(1)
      expect(enemies[0].owner).toBe('enemy')
    })

    it('should not include dead units', () => {
      gameState.attackGroupStart = { x: 0, y: 0 }
      gameState.attackGroupEnd = { x: 100, y: 100 }

      const units = [
        { id: 'enemy-1', owner: 'enemy', health: 0, x: 16, y: 16 }
      ]

      const enemies = handler.findEnemyUnitsInAttackGroup(units)

      expect(enemies.length).toBe(0)
    })

    it('should include enemy buildings within bounds', () => {
      gameState.attackGroupStart = { x: 0, y: 0 }
      gameState.attackGroupEnd = { x: 200, y: 200 }
      gameState.buildings = [
        { id: 'enemy-building', owner: 'enemy', health: 500, x: 2, y: 2, width: 2, height: 2 }
      ]

      const enemies = handler.findEnemyUnitsInAttackGroup([])

      expect(enemies.length).toBe(1)
      expect(enemies[0].id).toBe('enemy-building')
    })

    it('should handle inverted attack group bounds', () => {
      gameState.attackGroupStart = { x: 100, y: 100 }
      gameState.attackGroupEnd = { x: 0, y: 0 }

      const units = [
        { id: 'enemy-1', owner: 'enemy', health: 100, x: 16, y: 16 }
      ]

      const enemies = handler.findEnemyUnitsInAttackGroup(units)

      expect(enemies.length).toBe(1)
    })

    it('should handle "player" owner as human player', () => {
      gameState.humanPlayer = 'player1'
      gameState.attackGroupStart = { x: 0, y: 0 }
      gameState.attackGroupEnd = { x: 100, y: 100 }

      const units = [
        { id: 'unit-1', owner: 'player', health: 100, x: 16, y: 16 },
        { id: 'enemy-1', owner: 'enemy', health: 100, x: 16, y: 16 }
      ]

      const enemies = handler.findEnemyUnitsInAttackGroup(units)

      expect(enemies.length).toBe(1)
      expect(enemies[0].owner).toBe('enemy')
    })
  })

  describe('setupAttackQueue()', () => {
    it('should set up attack queue for combat units', () => {
      const enemyTargets = [
        { id: 'enemy-1', owner: 'enemy', health: 100 },
        { id: 'enemy-2', owner: 'enemy', health: 100 }
      ]

      handler.setupAttackQueue(selectedUnits, enemyTargets, unitCommands, mapGrid)

      expect(selectedUnits[0].attackQueue.length).toBe(2)
      expect(selectedUnits[0].target).toBe(enemyTargets[0])
    })

    it('should filter out harvesters from combat units', () => {
      const mixedUnits = [
        { id: 'harvester-1', type: 'harvester', owner: 'player1', attackQueue: [] },
        { id: 'tank-1', type: 'tank', owner: 'player1', attackQueue: [] }
      ]
      const enemyTargets = [
        { id: 'enemy-1', owner: 'enemy', health: 100 }
      ]

      handler.setupAttackQueue(mixedUnits, enemyTargets, unitCommands, mapGrid)

      expect(mixedUnits[0].attackQueue.length).toBe(0) // Harvester unchanged
      expect(mixedUnits[1].attackQueue.length).toBe(1) // Tank has attack queue
    })

    it('should clear previous target before setting new attack queue', () => {
      selectedUnits[0].target = { id: 'old-target' }
      const enemyTargets = [
        { id: 'enemy-1', owner: 'enemy', health: 100 }
      ]

      handler.setupAttackQueue(selectedUnits, enemyTargets, unitCommands, mapGrid)

      expect(selectedUnits[0].target).toBe(enemyTargets[0])
    })

    it('should call handleAttackCommand with first target', () => {
      const enemyTargets = [
        { id: 'enemy-1', owner: 'enemy', health: 100 }
      ]

      handler.setupAttackQueue(selectedUnits, enemyTargets, unitCommands, mapGrid)

      expect(unitCommands.handleAttackCommand).toHaveBeenCalledWith(
        expect.any(Array),
        enemyTargets[0],
        mapGrid,
        false
      )
    })

    it('should set attackGroupTargets in gameState', () => {
      const enemyTargets = [
        { id: 'enemy-1', owner: 'enemy', health: 100 }
      ]

      handler.setupAttackQueue(selectedUnits, enemyTargets, unitCommands, mapGrid)

      expect(gameState.attackGroupTargets).toEqual(enemyTargets)
    })

    it('should set and reset isAttackGroupOperation flag', () => {
      const enemyTargets = [
        { id: 'enemy-1', owner: 'enemy', health: 100 }
      ]

      handler.setupAttackQueue(selectedUnits, enemyTargets, unitCommands, mapGrid)

      // After setupAttackQueue completes, flag should be reset
      expect(unitCommands.isAttackGroupOperation).toBe(false)
    })

    it('queues AGF targets for selected defensive buildings with newest queued target first', () => {
      const turret = {
        id: 'turret-1',
        type: 'rocketTurret',
        owner: 'player1',
        isBuilding: true,
        holdFire: true,
        forcedAttackTarget: null,
        forcedAttackQueue: []
      }
      const targets = [
        { id: 'enemy-1', owner: 'enemy', health: 100 },
        { id: 'enemy-2', owner: 'enemy', health: 100 }
      ]

      handler.setupAttackQueue([turret], targets, unitCommands, mapGrid)

      expect(turret.holdFire).toBe(false)
      expect(turret.forcedAttack).toBe(true)
      expect(turret.forcedAttackTarget).toBe(targets[0])
      expect(turret.forcedAttackQueue).toEqual([targets[1]])
    })

  })

  it('prepends newly queued AGF targets ahead of existing building forced queue entries', () => {
    const turret = {
      id: 'turret-2',
      type: 'rocketTurret',
      owner: 'player1',
      isBuilding: true,
      holdFire: false,
      forcedAttackTarget: { id: 'enemy-active', owner: 'enemy', health: 100 },
      forcedAttackQueue: [
        { id: 'enemy-old-1', owner: 'enemy', health: 100 },
        { id: 'enemy-old-2', owner: 'enemy', health: 100 }
      ]
    }
    const targets = [
      { id: 'enemy-new-1', owner: 'enemy', health: 100 },
      { id: 'enemy-new-2', owner: 'enemy', health: 100 }
    ]

    handler.setupAttackQueue([turret], targets, unitCommands, mapGrid)

    expect(turret.forcedAttackQueue.map(target => target.id)).toEqual([
      'enemy-new-2',
      'enemy-new-1',
      'enemy-old-1',
      'enemy-old-2'
    ])
  })


  describe('shouldDisableAGFRendering()', () => {
    it('should return the disableAGFRendering flag', () => {
      handler.disableAGFRendering = true
      expect(handler.shouldDisableAGFRendering()).toBe(true)

      handler.disableAGFRendering = false
      expect(handler.shouldDisableAGFRendering()).toBe(false)
    })
  })

  describe('updateAGFCapability()', () => {
    it('should update hasSelectedCombatUnits based on selection', () => {
      handler.hasSelectedCombatUnits = false

      handler.updateAGFCapability(selectedUnits)

      expect(handler.hasSelectedCombatUnits).toBe(true)
    })

    it('should set false when no combat units selected', () => {
      handler.hasSelectedCombatUnits = true
      const nonCombatUnits = [
        { type: 'harvester', owner: 'player1', isBuilding: false }
      ]

      handler.updateAGFCapability(nonCombatUnits)

      expect(handler.hasSelectedCombatUnits).toBe(false)
    })
  })
})
