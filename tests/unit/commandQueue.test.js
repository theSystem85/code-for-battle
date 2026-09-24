import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processCommandQueues } from '../../src/game/commandQueue.js'
import { startMineDeployment } from '../../src/game/mineLayerBehavior.js'
import { safeSweeperDetonation, getMineAtTile } from '../../src/game/mineSystem.js'
import { activateSweepingMode } from '../../src/game/mineSweeperBehavior.js'
import { playSound } from '../../src/sound.js'
import { gameState } from '../../src/gameState.js'

// Mock all dependencies
vi.mock('../../src/game/mineLayerBehavior.js', async() => {
  const actual = await vi.importActual('../../src/game/mineLayerBehavior.js')
  return {
    ...actual,
    startMineDeployment: vi.fn()
  }
})

vi.mock('../../src/game/mineSystem.js', () => ({
  safeSweeperDetonation: vi.fn(),
  getMineAtTile: vi.fn(() => null)
}))

vi.mock('../../src/game/mineSweeperBehavior.js', () => ({
  activateSweepingMode: vi.fn()
}))

vi.mock('../../src/config.js', async() => {
  const actual = await vi.importActual('../../src/config.js')
  return {
    ...actual,
    TILE_SIZE: 32
  }
})

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn()
}))

describe('commandQueue', () => {
  let mockUnitCommands
  let mapGrid

  beforeEach(() => {
    vi.clearAllMocks()
    mockUnitCommands = {
      handleMovementCommand: vi.fn(),
      handleAttackCommand: vi.fn(),
      handleWorkshopRepairHotkey: vi.fn()
    }

    mapGrid = Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => ({ type: 'grass' }))
    )
    gameState.simulationTime = 0
    gameState.mines = []
    gameState.buildings = []
    gameState.unitWrecks = []
  })

  describe('processCommandQueues', () => {
    it('does nothing for units without command queue', () => {
      const units = [
        { id: 'unit1', type: 'tank' }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(mockUnitCommands.handleMovementCommand).not.toHaveBeenCalled()
      expect(mockUnitCommands.handleAttackCommand).not.toHaveBeenCalled()
    })

    it('does nothing for units with empty command queue', () => {
      const units = [
        { id: 'unit1', type: 'tank', commandQueue: [] }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(mockUnitCommands.handleMovementCommand).not.toHaveBeenCalled()
    })

    it('dequeues and executes move command', () => {
      const units = [
        {
          id: 'unit1',
          type: 'tank',
          commandQueue: [{ type: 'move', x: 100, y: 100 }]
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(units[0].currentCommand).toEqual({ type: 'move', x: 100, y: 100 })
      expect(units[0].commandQueue).toHaveLength(0)
      expect(mockUnitCommands.handleMovementCommand).toHaveBeenCalledWith(
        [units[0]], 100, 100, mapGrid, true
      )
    })

    it('dequeues and executes attack command', () => {
      const target = { id: 'enemy', health: 100 }
      const units = [
        {
          id: 'unit1',
          type: 'tank',
          commandQueue: [{ type: 'attack', target }]
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(mockUnitCommands.handleAttackCommand).toHaveBeenCalledWith(
        [units[0]], target, mapGrid, false, true
      )
    })

    it('executes agf command with multiple targets', () => {
      const targets = [
        { id: 'enemy1', health: 100 },
        { id: 'enemy2', health: 100 }
      ]
      const units = [
        {
          id: 'unit1',
          type: 'tank',
          commandQueue: [{ type: 'agf', targets }],
          attackQueue: []
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(units[0].attackQueue).toEqual(targets)
      expect(mockUnitCommands.handleAttackCommand).toHaveBeenCalled()
    })

    it('executes workshopRepair command', () => {
      const units = [
        {
          id: 'unit1',
          type: 'tank',
          commandQueue: [{ type: 'workshopRepair' }]
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(mockUnitCommands.handleWorkshopRepairHotkey).toHaveBeenCalledWith(
        [units[0]], mapGrid, false, true
      )
    })

    it('completes move command when path is empty', () => {
      const units = [
        {
          id: 'unit1',
          type: 'tank',
          commandQueue: [],
          currentCommand: { type: 'move', x: 100, y: 100 },
          path: [],
          moveTarget: null
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(units[0].currentCommand).toBe(null)
    })

    it('does not complete move command while path exists', () => {
      const units = [
        {
          id: 'unit1',
          type: 'tank',
          commandQueue: [],
          currentCommand: { type: 'move', x: 100, y: 100 },
          path: [{ x: 3, y: 3 }],
          moveTarget: { x: 100, y: 100 }
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(units[0].currentCommand).not.toBe(null)
    })

    it('completes attack command when target is dead', () => {
      const units = [
        {
          id: 'unit1',
          type: 'tank',
          commandQueue: [],
          currentCommand: { type: 'attack', target: { id: 'enemy', health: 0 } },
          target: { id: 'enemy', health: 0 },
          attackQueue: []
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(units[0].currentCommand).toBe(null)
    })

    it('does not complete attack command while target alive', () => {
      const target = { id: 'enemy', health: 50 }
      const units = [
        {
          id: 'unit1',
          type: 'tank',
          commandQueue: [],
          currentCommand: { type: 'attack', target },
          target,
          attackQueue: []
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(units[0].currentCommand).not.toBe(null)
    })

    it('completes workshopRepair command when not at workshop', () => {
      const units = [
        {
          id: 'unit1',
          type: 'tank',
          commandQueue: [],
          currentCommand: { type: 'workshopRepair' },
          targetWorkshop: null,
          repairingAtWorkshop: false,
          returningFromWorkshop: false,
          moveTarget: null,
          path: []
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(units[0].currentCommand).toBe(null)
    })

    it('handles null action gracefully', () => {
      const units = [
        {
          id: 'unit1',
          type: 'tank',
          commandQueue: [null]
        }
      ]

      expect(() => processCommandQueues(units, mapGrid, mockUnitCommands)).not.toThrow()
    })

    it('processes multiple units', () => {
      const units = [
        {
          id: 'unit1',
          type: 'tank',
          commandQueue: [{ type: 'move', x: 100, y: 100 }]
        },
        {
          id: 'unit2',
          type: 'tank',
          commandQueue: [{ type: 'move', x: 200, y: 200 }]
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(mockUnitCommands.handleMovementCommand).toHaveBeenCalledTimes(2)
    })

    it('processes queued commands one at a time', () => {
      const units = [
        {
          id: 'unit1',
          type: 'tank',
          commandQueue: [
            { type: 'move', x: 100, y: 100 },
            { type: 'move', x: 200, y: 200 }
          ]
        }
      ]

      // First call - should start first command
      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(units[0].currentCommand).toEqual({ type: 'move', x: 100, y: 100 })
      expect(units[0].commandQueue).toHaveLength(1)
    })

    it('defaults buildings to empty array', () => {
      const units = [
        {
          id: 'unit1',
          type: 'tank',
          commandQueue: []
        }
      ]

      expect(() => processCommandQueues(units, mapGrid, mockUnitCommands)).not.toThrow()
    })

    it('moves to mine deployment tile when deploying mine', () => {
      const units = [
        {
          id: 'unit1',
          type: 'mineLayer',
          deployingMine: false,
          commandQueue: [{ type: 'deployMine', x: 2, y: 3 }]
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(mockUnitCommands.handleMovementCommand).toHaveBeenCalledWith(
        [units[0]],
        2 * 32 + 16,
        3 * 32 + 16,
        mapGrid,
        true
      )
    })

    it('starts mine deployment when at destination', () => {
      vi.spyOn(performance, 'now').mockReturnValue(999999)
      gameState.simulationTime = 1234
      const units = [
        {
          id: 'unit1',
          type: 'mineLayer',
          deployingMine: false,
          x: 2 * 32,
          y: 3 * 32,
          path: [],
          moveTarget: null,
          currentCommand: { type: 'deployMine', x: 2, y: 3 },
          commandQueue: []
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(startMineDeployment).toHaveBeenCalledWith(units[0], 2, 3, 1234)
    })

    it('skips an occupied plant tile and continues to the next order', () => {
      const blocker = {
        id: 'tank1',
        type: 'tank',
        health: 100,
        x: 2 * 32,
        y: 3 * 32
      }
      const miner = {
        id: 'unit1',
        type: 'mineLayer',
        health: 30,
        deployingMine: true,
        deployStartTime: 50,
        x: 0,
        y: 0,
        path: [{ x: 2, y: 3 }],
        moveTarget: { x: 2, y: 3 },
        commandQueue: [{ type: 'deployMine', x: 4, y: 4 }],
        currentCommand: { type: 'deployMine', x: 2, y: 3 }
      }

      processCommandQueues([miner, blocker], mapGrid, mockUnitCommands, [])

      expect(startMineDeployment).not.toHaveBeenCalled()
      expect(miner.deployingMine).toBe(false)
      expect(miner.deployStartTime).toBeNull()
      expect(miner.path).toEqual([])
      expect(miner.moveTarget).toBeNull()
      expect(miner.currentCommand).toBeNull()

      processCommandQueues([miner, blocker], mapGrid, mockUnitCommands, [])

      expect(miner.currentCommand).toEqual({ type: 'deployMine', x: 4, y: 4 })
      expect(mockUnitCommands.handleMovementCommand).toHaveBeenCalled()
    })

    it('does not treat the mine layer itself as occupying its plant tile', () => {
      gameState.simulationTime = 2500
      const miner = {
        id: 'unit1',
        type: 'mineLayer',
        health: 30,
        deployingMine: false,
        x: 4 * 32,
        y: 4 * 32,
        path: [],
        moveTarget: null,
        commandQueue: [],
        currentCommand: { type: 'deployMine', x: 4, y: 4 }
      }

      processCommandQueues([miner], mapGrid, mockUnitCommands, [])

      expect(startMineDeployment).toHaveBeenCalledWith(miner, 4, 4, 2500)
    })

    it('skips a tile blocked by a building without starting deployment', () => {
      const miner = {
        id: 'unit1',
        type: 'mineLayer',
        health: 30,
        x: 0,
        y: 0,
        path: [{ x: 1, y: 1 }],
        moveTarget: { x: 1, y: 1 },
        commandQueue: [],
        currentCommand: { type: 'deployMine', x: 1, y: 1 }
      }
      const buildings = [{ type: 'vehicleFactory', health: 100, x: 1, y: 1, width: 3, height: 3 }]

      processCommandQueues([miner], mapGrid, mockUnitCommands, buildings)

      expect(startMineDeployment).not.toHaveBeenCalled()
      expect(miner.currentCommand).toBeNull()
    })

    it('clears minefield tracking when deployment completes', () => {
      const units = [
        {
          id: 'unit1',
          type: 'mineLayer',
          deploymentCompleted: true,
          currentCommand: { type: 'deployMine', x: 2, y: 3, areaFieldId: 'field-1' },
          commandQueue: [],
          pendingMineFieldDeployments: {
            'field-1': { remaining: 1, notified: false }
          }
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(playSound).toHaveBeenCalledWith(
        'The_mine_field_has_been_deployed_and_armed',
        1.0,
        0,
        true
      )
      expect(units[0].pendingMineFieldDeployments['field-1']).toBeUndefined()
    })

    it('initiates sweep movement and activates sweeping mode', () => {
      const units = [
        {
          id: 'unit1',
          type: 'mineSweeper',
          sweeping: false,
          commandQueue: [{ type: 'sweepArea', path: [{ x: 4, y: 2 }] }]
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands)

      expect(activateSweepingMode).toHaveBeenCalledWith(units[0])
      expect(units[0].sweepingOverrideMovement).toBe(true)
      expect(units[0].moveTarget).toEqual({ x: 4, y: 2 })
      expect(units[0].path).toEqual([{ x: 4, y: 2 }])
    })

    it('detonates mines and completes sweep action', () => {
      vi.mocked(getMineAtTile).mockReturnValue({ id: 'mine-1' })
      const units = [
        {
          id: 'unit1',
          type: 'mineSweeper',
          x: 2 * 32,
          y: 2 * 32,
          path: [],
          moveTarget: null,
          commandQueue: [],
          currentCommand: { type: 'sweepArea', path: [{ x: 2, y: 2 }] }
        }
      ]

      processCommandQueues(units, mapGrid, mockUnitCommands, [])

      expect(safeSweeperDetonation).toHaveBeenCalled()
      expect(units[0].currentCommand).toBe(null)
      expect(playSound).toHaveBeenCalledWith(
        'AllMinesOnTheFieldAreDisarmed',
        1.0,
        0,
        true
      )
    })
  })
})
