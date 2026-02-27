import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/main.js', () => ({
  factories: [],
  units: [],
  bullets: [],
  mapGrid: [],
  getCurrentGame: vi.fn()
}))

import { handleFallbackCommand } from '../../src/input/mouseCommands.js'
import { gameState } from '../../src/gameState.js'
import { TILE_SIZE } from '../../src/config.js'

describe('mouseCommands fallback defense-building targeting', () => {
  beforeEach(() => {
    gameState.humanPlayer = 'player1'
    gameState.buildingPlacementMode = false
    gameState.repairMode = false
    gameState.sellMode = false
  })

  it('queues normal-click enemy target for selected defense buildings and prepends new entry', () => {
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

  it('routes supply-only right-click on friendly airstrip to movement command', () => {
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
})
