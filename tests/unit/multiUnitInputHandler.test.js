import { describe, it, expect, vi } from 'vitest'
import {
  filterEligibleUnits,
  applyCommandsToUnit,
  distributeCommandsToUnits
} from '../../src/input/multiUnitInputHandler.js'

describe('multiUnitInputHandler', () => {
  describe('filterEligibleUnits', () => {
    it('[U03040] filters out dead units and buildings by default', () => {
      const aliveUnit = { id: 'u1', health: 100 }
      const deadUnit = { id: 'u2', health: 0 }
      const building = { id: 'b1', health: 100, isBuilding: true }

      const result = filterEligibleUnits([aliveUnit, deadUnit, building, null])

      expect(result).toEqual([aliveUnit])
    })

    it('[U03041] allows buildings when configured', () => {
      const building = { id: 'b1', health: 100, isBuilding: true }
      const result = filterEligibleUnits([building], { allowBuildings: true })

      expect(result).toEqual([building])
    })

    it('[U03042] returns an empty array for non-arrays', () => {
      expect(filterEligibleUnits(null)).toEqual([])
    })
  })

  describe('applyCommandsToUnit', () => {
    it('[U03043] replaces the command queue and clears current command when not queueing', () => {
      const unit = {
        id: 'u1',
        commandQueue: [{ type: 'move', x: 1, y: 1 }],
        currentCommand: { type: 'move', x: 1, y: 1 }
      }
      const commands = [{ type: 'attack', targetId: 'enemy1' }]

      applyCommandsToUnit(unit, commands, { queue: false })

      expect(unit.commandQueue).toEqual(commands)
      expect(unit.currentCommand).toBeNull()
    })

    it('[U03044] appends commands when queueing and preserves current command', () => {
      const unit = {
        id: 'u1',
        commandQueue: [{ type: 'move', x: 2, y: 2 }],
        currentCommand: { type: 'move', x: 2, y: 2 }
      }
      const commands = [{ type: 'attack', targetId: 'enemy2' }]

      applyCommandsToUnit(unit, commands, { queue: true })

      expect(unit.commandQueue).toEqual([
        { type: 'move', x: 2, y: 2 },
        { type: 'attack', targetId: 'enemy2' }
      ])
      expect(unit.currentCommand).toEqual({ type: 'move', x: 2, y: 2 })
    })
  })

  describe('distributeCommandsToUnits', () => {
    it('[U03045] distributes commands in round-robin order and resets queues when not queueing', () => {
      const units = [
        { id: 'u1', health: 100, commandQueue: [{ type: 'move', x: 0, y: 0 }], currentCommand: { type: 'move', x: 0, y: 0 } },
        { id: 'u2', health: 100, commandQueue: [], currentCommand: { type: 'move', x: 1, y: 1 } }
      ]
      const targets = [{ x: 5 }, { x: 6 }, { x: 7 }]
      const createCommand = vi.fn((target) => ({ type: 'move', x: target.x }))

      const assignments = distributeCommandsToUnits(units, targets, createCommand, { queue: false })

      expect(createCommand).toHaveBeenCalledTimes(3)
      expect(units[0].commandQueue).toEqual([
        { type: 'move', x: 5 },
        { type: 'move', x: 7 }
      ])
      expect(units[1].commandQueue).toEqual([{ type: 'move', x: 6 }])
      expect(units[0].currentCommand).toBeNull()
      expect(units[1].currentCommand).toBeNull()
      expect(assignments).toEqual([
        { unit: units[0], commands: [{ type: 'move', x: 5 }, { type: 'move', x: 7 }] },
        { unit: units[1], commands: [{ type: 'move', x: 6 }] }
      ])
    })

    it('[U03046] skips null commands and ignores ineligible units', () => {
      const aliveUnit = { id: 'u1', health: 100, commandQueue: [] }
      const deadUnit = { id: 'u2', health: 0, commandQueue: [{ type: 'move', x: 9 }] }
      const building = { id: 'b1', health: 100, isBuilding: true, commandQueue: [{ type: 'move', x: 8 }] }
      const secondUnit = { id: 'u3', health: 100, commandQueue: [] }
      const targets = [{ x: 1 }, { x: 2 }]

      const assignments = distributeCommandsToUnits(
        [aliveUnit, deadUnit, building, secondUnit],
        targets,
        (target, index) => (index === 1 ? null : { type: 'move', x: target.x }),
        { queue: false }
      )

      expect(aliveUnit.commandQueue).toEqual([{ type: 'move', x: 1 }])
      expect(secondUnit.commandQueue).toEqual([])
      expect(deadUnit.commandQueue).toEqual([{ type: 'move', x: 9 }])
      expect(building.commandQueue).toEqual([{ type: 'move', x: 8 }])
      expect(assignments).toEqual([
        { unit: aliveUnit, commands: [{ type: 'move', x: 1 }] },
        { unit: secondUnit, commands: [] }
      ])
    })

    it('[U03047] appends commands when queueing', () => {
      const units = [
        { id: 'u1', health: 100, commandQueue: [{ type: 'move', x: 1 }] },
        { id: 'u2', health: 100, commandQueue: [{ type: 'move', x: 2 }] }
      ]
      const targets = [{ x: 3 }, { x: 4 }]

      distributeCommandsToUnits(units, targets, (target) => ({ type: 'move', x: target.x }), { queue: true })

      expect(units[0].commandQueue).toEqual([{ type: 'move', x: 1 }, { type: 'move', x: 3 }])
      expect(units[1].commandQueue).toEqual([{ type: 'move', x: 2 }, { type: 'move', x: 4 }])
    })

    it('[U03048] returns empty array when targets is empty', () => {
      const units = [{ id: 'u1', health: 100, commandQueue: [] }]
      const result = distributeCommandsToUnits(units, [], () => ({ type: 'move' }))

      expect(result).toEqual([])
      expect(units[0].commandQueue).toEqual([])
    })

    it('[U03049] returns empty array when createCommand is not a function', () => {
      const units = [{ id: 'u1', health: 100, commandQueue: [] }]
      const targets = [{ x: 1 }]
      const result = distributeCommandsToUnits(units, targets, null)

      expect(result).toEqual([])
    })

    it('[U03050] handles single unit with multiple targets', () => {
      const unit = { id: 'u1', health: 100, commandQueue: [] }
      const targets = [{ x: 1 }, { x: 2 }, { x: 3 }]

      const assignments = distributeCommandsToUnits([unit], targets, (t) => ({ type: 'move', x: t.x }))

      expect(assignments[0].commands).toEqual([
        { type: 'move', x: 1 },
        { type: 'move', x: 2 },
        { type: 'move', x: 3 }
      ])
    })

    it('[U03051] does not modify unit when queueing with no commands assigned', () => {
      const unit = { id: 'u1', health: 100, commandQueue: [{ type: 'move', x: 0 }] }
      const secondUnit = { id: 'u2', health: 100, commandQueue: [] }
      const targets = [{ x: 1 }]

      distributeCommandsToUnits([unit, secondUnit], targets, (t) => ({ type: 'move', x: t.x }), { queue: true })

      expect(unit.commandQueue).toEqual([{ type: 'move', x: 0 }, { type: 'move', x: 1 }])
      expect(secondUnit.commandQueue).toEqual([])
    })

    it('[U03052] creates commandQueue if it does not exist when queueing', () => {
      const unit = { id: 'u1', health: 100 }
      const commands = [{ type: 'move', x: 1 }]

      applyCommandsToUnit(unit, commands, { queue: true })

      expect(unit.commandQueue).toEqual(commands)
    })

    it('[U03053] handles undefined commands parameter', () => {
      const unit = { id: 'u1', health: 100, commandQueue: [] }

      applyCommandsToUnit(unit, undefined)

      expect(unit.commandQueue).toEqual([])
    })

    it('[U03054] does nothing when unit is null', () => {
      expect(() => applyCommandsToUnit(null, [{ type: 'move' }])).not.toThrow()
    })

    it('[U03055] filters out units with undefined health', () => {
      const validUnit = { id: 'u1', health: 100 }
      const invalidUnit = { id: 'u2' }

      const result = filterEligibleUnits([validUnit, invalidUnit])

      expect(result).toEqual([validUnit])
    })

    it('[U03056] filters out units with negative health', () => {
      const validUnit = { id: 'u1', health: 50 }
      const deadUnit = { id: 'u2', health: -10 }

      const result = filterEligibleUnits([validUnit, deadUnit])

      expect(result).toEqual([validUnit])
    })

    it('[U03057] allows buildings when allowBuildings is true', () => {
      const unit = { id: 'u1', health: 100 }
      const building = { id: 'b1', health: 200, isBuilding: true }

      const result = filterEligibleUnits([unit, building], { allowBuildings: true })

      expect(result).toEqual([unit, building])
    })

    it('[U03058] handles multiple targets per unit in round-robin distribution', () => {
      const unit1 = { id: 'u1', health: 100, commandQueue: [] }
      const unit2 = { id: 'u2', health: 100, commandQueue: [] }
      const targets = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 5 }]

      distributeCommandsToUnits([unit1, unit2], targets, (t) => ({ type: 'move', x: t.x }))

      expect(unit1.commandQueue.length).toBe(3)
      expect(unit2.commandQueue.length).toBe(2)
      expect(unit1.commandQueue.map(c => c.x)).toEqual([1, 3, 5])
      expect(unit2.commandQueue.map(c => c.x)).toEqual([2, 4])
    })

    it('[U03059] returns assignment information for each unit', () => {
      const unit1 = { id: 'u1', health: 100, commandQueue: [] }
      const unit2 = { id: 'u2', health: 100, commandQueue: [] }
      const targets = [{ x: 1 }, { x: 2 }]

      const assignments = distributeCommandsToUnits([unit1, unit2], targets, (t) => ({ type: 'move', x: t.x }))

      expect(assignments).toHaveLength(2)
      expect(assignments[0].unit).toBe(unit1)
      expect(assignments[0].commands).toEqual([{ type: 'move', x: 1 }])
      expect(assignments[1].unit).toBe(unit2)
      expect(assignments[1].commands).toEqual([{ type: 'move', x: 2 }])
    })

    it('[U03060] passes target index to createCommand function', () => {
      const units = [{ id: 'u1', health: 100, commandQueue: [] }]
      const targets = [{ x: 1 }, { x: 2 }]
      const createCommand = vi.fn((target, index) => ({ type: 'move', x: target.x, index }))

      distributeCommandsToUnits(units, targets, createCommand)

      expect(createCommand).toHaveBeenCalledWith({ x: 1 }, 0)
      expect(createCommand).toHaveBeenCalledWith({ x: 2 }, 1)
    })

    it('[U03061] handles empty selectedUnits array', () => {
      const targets = [{ x: 1 }]
      const result = distributeCommandsToUnits([], targets, (t) => ({ type: 'move', x: t.x }))

      expect(result).toEqual([])
    })

    it('[U03062] handles null selectedUnits', () => {
      const targets = [{ x: 1 }]
      const result = distributeCommandsToUnits(null, targets, (t) => ({ type: 'move', x: t.x }))

      expect(result).toEqual([])
    })
  })
})
