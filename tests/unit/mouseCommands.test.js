import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/main.js', () => ({
  factories: [],
  units: [],
  bullets: [],
  mapGrid: [],
  getCurrentGame: vi.fn()
}))

import { handleFallbackCommand, handleForceAttackCommand, handleGuardTargetCommand, handleStandardCommands } from '../../src/input/mouseCommands.js'
import { gameState } from '../../src/gameState.js'
import { TILE_SIZE } from '../../src/config.js'

describe('mouseCommands fallback defense-building targeting', () => {
  beforeEach(() => {
    gameState.humanPlayer = 'player1'
    gameState.buildingPlacementMode = false
    gameState.repairMode = false
    gameState.sellMode = false
  })

  it('[U02987] queues normal-click enemy target for selected defense buildings and promotes clicked target to active', () => {
    const existingQueuedTarget = { id: 'enemy-old', owner: 'enemy', health: 100, x: 0, y: 0 }
    const activeTarget = { id: 'enemy-active', owner: 'enemy', health: 100, x: 0, y: 0 }
    const clickedEnemy = {
      id: 'enemy-clicked',
      owner: 'enemy',
      health: 100,
      x: 10 * TILE_SIZE,
      y: 6 * TILE_SIZE
    }

    const selectedTurret = {
      id: 'turret-1',
      type: 'rocketTurret',
      owner: 'player1',
      isBuilding: true,
      forcedAttackTarget: activeTarget,
      forcedAttackQueue: [existingQueuedTarget],
      holdFire: true,
      forcedAttack: false
    }

    const handler = {
      selectionManager: {
        isCommandableUnit: vi.fn().mockReturnValue(true)
      }
    }

    const unitCommands = {}
    const mapGrid = []
    const e = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }

    handleFallbackCommand(
      handler,
      clickedEnemy.x + TILE_SIZE / 2,
      clickedEnemy.y + TILE_SIZE / 2,
      [selectedTurret],
      unitCommands,
      mapGrid,
      e,
      [clickedEnemy],
      []
    )

    expect(selectedTurret.forcedAttackTarget).toBe(clickedEnemy)
    expect(selectedTurret.forcedAttackQueue.map(target => target.id)).toEqual(['enemy-active', 'enemy-old'])
    expect(selectedTurret.holdFire).toBe(false)
    expect(selectedTurret.forcedAttack).toBe(true)
  })

  it('[U02988] routes supply-only right-click on friendly airstrip to movement command', () => {
    const selectedSupply = {
      id: 'tanker-1',
      type: 'tankerTruck',
      owner: 'player1',
      isBuilding: false,
      x: 0,
      y: 0,
      health: 100
    }

    gameState.buildings = [{
      id: 'airstrip-1',
      type: 'airstrip',
      owner: 'player1',
      health: 100,
      x: 10,
      y: 6,
      width: 2,
      height: 2
    }]

    const handler = {
      gameFactories: [],
      gameUnits: [],
      selectionManager: {
        isCommandableUnit: vi.fn().mockReturnValue(true),
        isHumanPlayerBuilding: vi.fn().mockReturnValue(true)
      }
    }

    const unitCommands = {
      handleMovementCommand: vi.fn(),
      handleAttackCommand: vi.fn(),
      handleRefineryUnloadCommand: vi.fn(),
      handleRepairWorkshopCommand: vi.fn(),
      handleAmbulanceRefillCommand: vi.fn(),
      handleGasStationRefillCommand: vi.fn(),
      handleHarvesterCommand: vi.fn(),
      handleApacheHelipadCommand: vi.fn()
    }

    const mapGrid = Array.from({ length: 30 }, () =>
      Array.from({ length: 30 }, () => ({ type: 'land' }))
    )
    const e = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }
    const worldX = 10 * TILE_SIZE + TILE_SIZE / 2
    const worldY = 6 * TILE_SIZE + TILE_SIZE / 2

    handleFallbackCommand(
      handler,
      worldX,
      worldY,
      [selectedSupply],
      unitCommands,
      mapGrid,
      e,
      [],
      []
    )

    expect(unitCommands.handleMovementCommand).toHaveBeenCalledWith([selectedSupply], worldX, worldY, mapGrid)
    expect(unitCommands.handleAttackCommand).not.toHaveBeenCalled()
  })

  it('[U06533] orders every aircraft based at a selected airstrip to attack, force-attack, or guard', () => {
    const airstrip = {
      id: 'strip-1',
      type: 'airstrip',
      isBuilding: true,
      owner: 'player1',
      health: 100,
      x: 0,
      y: 0,
      width: 4,
      height: 3
    }
    const wing = {
      id: 'f35-wing',
      type: 'f35',
      owner: 'player1',
      health: 100,
      homeAirstripId: 'strip-1',
      x: 0,
      y: 0
    }
    const friendly = {
      id: 'friendly',
      type: 'tank',
      owner: 'player1',
      health: 100,
      x: 4 * TILE_SIZE,
      y: 4 * TILE_SIZE
    }
    const enemy = {
      id: 'enemy',
      type: 'tank',
      owner: 'player2',
      health: 100,
      x: 12 * TILE_SIZE,
      y: 6 * TILE_SIZE
    }
    gameState.units = [wing, friendly, enemy]
    gameState.buildings = [airstrip]
    const handler = {
      selectionManager: {
        isCommandableUnit: () => true,
        isHumanPlayerBuilding: () => false,
        isHumanPlayerUnit: unit => unit.owner === 'player1',
        clearWreckSelection: () => {}
      },
      gameUnits: [wing, enemy],
      gameFactories: []
    }
    const unitCommands = { handleAttackCommand: vi.fn() }
    const clickX = enemy.x + TILE_SIZE / 2
    const clickY = enemy.y + TILE_SIZE / 2

    handleStandardCommands(handler, clickX, clickY, [airstrip], unitCommands, [], false)
    expect(unitCommands.handleAttackCommand).toHaveBeenCalledWith([wing], enemy, [], false)

    unitCommands.handleAttackCommand.mockClear()
    wing.commandQueue = []
    handleStandardCommands(handler, clickX, clickY, [airstrip], unitCommands, [], true)
    expect(unitCommands.handleAttackCommand).not.toHaveBeenCalled()
    expect(wing.commandQueue).toEqual([{ type: 'attack', target: enemy }])

    handleForceAttackCommand(handler, clickX, clickY, [wing, enemy], [airstrip], unitCommands, [], handler.selectionManager)
    expect(wing.forcedAttack).toBe(true)
    expect(unitCommands.handleAttackCommand).toHaveBeenCalledWith([wing], enemy, [], true)

    const guarded = handleGuardTargetCommand([airstrip], friendly, handler.selectionManager)
    expect(guarded).toBe(true)
    expect(wing.guardMode).toBe(true)
    expect(wing.guardTarget).toBe(friendly)
  })
})
