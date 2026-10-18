/**
 * Unit tests for network/inputBuffer.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  InputBuffer,
  LOCKSTEP_INPUT_TYPES,
  createAttackInput,
  createBuildInput,
  createLockstepInput,
  createMoveInput,
  createNoOpInput,
  createPauseInput,
  createProduceInput,
  createSellInput,
  createStopInput,
  deserializeInput,
  serializeInput
} from '../../src/network/inputBuffer.js'

const buildInput = (overrides = {}) => ({
  tick: 5,
  peerId: 'peer-a',
  type: LOCKSTEP_INPUT_TYPES.UNIT_MOVE,
  payload: { unitIds: ['u1'], targetX: 1, targetY: 2 },
  timestamp: 1000,
  ...overrides
})

describe('inputBuffer', () => {
  let buffer

  beforeEach(() => {
    buffer = new InputBuffer()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('InputBuffer.addInput', () => {
    it('[U02077] stores inputs by tick and exposes them via getInputsForTick', () => {
      const input = buildInput()

      buffer.addInput(input.tick, input)

      expect(buffer.getInputsForTick(input.tick)).toEqual([input])
    })

    it('[U02078] prevents duplicates with same peer, type, and payload', () => {
      const input = buildInput()
      const duplicate = buildInput({ timestamp: 2000 })

      buffer.addInput(input.tick, input)
      buffer.addInput(input.tick, duplicate)

      expect(buffer.getInputsForTick(input.tick)).toHaveLength(1)
    })

    it('[U02079] allows different payloads from same peer and type', () => {
      buffer.addInput(3, buildInput({ tick: 3, payload: { unitIds: ['u1'], targetX: 2, targetY: 3 } }))
      buffer.addInput(3, buildInput({ tick: 3, payload: { unitIds: ['u1'], targetX: 5, targetY: 6 } }))

      expect(buffer.getInputsForTick(3)).toHaveLength(2)
    })

    it('[U02080] allows same payload from different peers', () => {
      buffer.addInput(4, buildInput({ tick: 4, peerId: 'peer-a' }))
      buffer.addInput(4, buildInput({ tick: 4, peerId: 'peer-b' }))

      expect(buffer.getInputsForTick(4)).toHaveLength(2)
    })
  })

  describe('tick queries', () => {
    it('[U02081] hasInputsForTick returns false when no inputs exist', () => {
      expect(buffer.hasInputsForTick(1)).toBe(false)
    })

    it('[U02082] hasInputsForTick returns true when inputs exist', () => {
      buffer.addInput(2, buildInput({ tick: 2 }))

      expect(buffer.hasInputsForTick(2)).toBe(true)
    })

    it('[U02083] confirmTick marks ticks as confirmed', () => {
      buffer.confirmTick(7)

      expect(buffer.isTickConfirmed(7)).toBe(true)
      expect(buffer.isTickConfirmed(8)).toBe(false)
    })
  })

  describe('buffer management', () => {
    it('[U02084] clearBefore removes older ticks and confirmations', () => {
      buffer.addInput(1, buildInput({ tick: 1 }))
      buffer.addInput(2, buildInput({ tick: 2 }))
      buffer.addInput(3, buildInput({ tick: 3 }))
      buffer.confirmTick(1)
      buffer.confirmTick(2)

      buffer.clearBefore(3)

      expect(buffer.getInputsForTick(1)).toEqual([])
      expect(buffer.getInputsForTick(2)).toEqual([])
      expect(buffer.getInputsForTick(3)).toHaveLength(1)
      expect(buffer.isTickConfirmed(1)).toBe(false)
      expect(buffer.isTickConfirmed(2)).toBe(false)
      expect(buffer.isTickConfirmed(3)).toBe(false)
      expect(buffer._oldestTick).toBe(3)
    })

    it('[U02085] clear resets buffer state', () => {
      buffer.addInput(1, buildInput({ tick: 1 }))
      buffer.confirmTick(1)

      buffer.clear()

      expect(buffer.getBufferedTickCount()).toBe(0)
      expect(buffer.getTotalInputCount()).toBe(0)
      expect(buffer.isTickConfirmed(1)).toBe(false)
      expect(buffer._oldestTick).toBe(0)
    })
  })

  describe('buffer stats', () => {
    it('[U02086] reports buffered tick count', () => {
      buffer.addInput(1, buildInput({ tick: 1 }))
      buffer.addInput(3, buildInput({ tick: 3 }))

      expect(buffer.getBufferedTickCount()).toBe(2)
    })

    it('[U02087] calculates tick ranges with data and without', () => {
      expect(buffer.getTickRange()).toEqual({ min: 0, max: 0 })

      buffer.addInput(5, buildInput({ tick: 5 }))
      buffer.addInput(10, buildInput({ tick: 10 }))

      expect(buffer.getTickRange()).toEqual({ min: 5, max: 10 })
    })

    it('[U02088] counts total inputs across ticks', () => {
      buffer.addInput(1, buildInput({ tick: 1 }))
      buffer.addInput(1, buildInput({ tick: 1, peerId: 'peer-b' }))
      buffer.addInput(2, buildInput({ tick: 2 }))

      expect(buffer.getTotalInputCount()).toBe(3)
    })

    it('[U02089] exports a debug state summary', () => {
      buffer.addInput(1, buildInput({ tick: 1, peerId: 'alpha', type: LOCKSTEP_INPUT_TYPES.UNIT_STOP }))
      buffer.addInput(2, buildInput({ tick: 2, peerId: 'beta', type: LOCKSTEP_INPUT_TYPES.BUILD_PLACE }))

      expect(buffer.getDebugState()).toEqual({
        1: [{ peerId: 'alpha', type: LOCKSTEP_INPUT_TYPES.UNIT_STOP, tick: 1 }],
        2: [{ peerId: 'beta', type: LOCKSTEP_INPUT_TYPES.BUILD_PLACE, tick: 2 }]
      })
    })
  })

  describe('input factories', () => {
    it('[U02090] createLockstepInput builds a lockstep-ready command with timestamp and id', () => {
      vi.spyOn(globalThis.performance, 'now').mockReturnValue(1234)
      vi.spyOn(Math, 'random').mockReturnValue(0.123456789)

      const input = createLockstepInput(LOCKSTEP_INPUT_TYPES.UNIT_MOVE, { foo: 'bar' }, 9, 'peer-x')
      const suffix = (0.123456789).toString(36).substr(2, 9)

      expect(input).toMatchObject({
        tick: 9,
        peerId: 'peer-x',
        type: LOCKSTEP_INPUT_TYPES.UNIT_MOVE,
        payload: { foo: 'bar' },
        timestamp: 1234
      })
      expect(input.id).toBe(`peer-x-9-${LOCKSTEP_INPUT_TYPES.UNIT_MOVE}-${suffix}`)
    })

    it('[U02091] creates specific input payloads', () => {
      expect(createMoveInput(['u1', 'u2'], 4, 7, true)).toEqual({
        type: LOCKSTEP_INPUT_TYPES.UNIT_MOVE,
        payload: { unitIds: ['u1', 'u2'], targetX: 4, targetY: 7, queued: true }
      })

      expect(createAttackInput(['u3'], 't1', 'unit')).toEqual({
        type: LOCKSTEP_INPUT_TYPES.UNIT_ATTACK,
        payload: { unitIds: ['u3'], targetId: 't1', targetType: 'unit', queued: false }
      })

      expect(createStopInput(['u4'])).toEqual({
        type: LOCKSTEP_INPUT_TYPES.UNIT_STOP,
        payload: { unitIds: ['u4'] }
      })

      expect(createBuildInput('barracks', 1, 2)).toEqual({
        type: LOCKSTEP_INPUT_TYPES.BUILD_PLACE,
        payload: { buildingType: 'barracks', x: 1, y: 2 }
      })

      expect(createProduceInput('tank', 'building')).toEqual({
        type: LOCKSTEP_INPUT_TYPES.PRODUCE_START,
        payload: { itemType: 'tank', producerType: 'building' }
      })

      expect(createSellInput('b1')).toEqual({
        type: LOCKSTEP_INPUT_TYPES.BUILD_SELL,
        payload: { buildingId: 'b1' }
      })

      expect(createNoOpInput()).toEqual({
        type: LOCKSTEP_INPUT_TYPES.NO_OP,
        payload: {}
      })

      expect(createPauseInput(true)).toEqual({
        type: LOCKSTEP_INPUT_TYPES.GAME_PAUSE,
        payload: { paused: true }
      })

      expect(createPauseInput(false)).toEqual({
        type: LOCKSTEP_INPUT_TYPES.GAME_RESUME,
        payload: { paused: false }
      })
    })
  })

  describe('serialization helpers', () => {
    it('[U02092] serializes and deserializes inputs', () => {
      const input = buildInput({ tick: 11 })

      const serialized = serializeInput(input)
      const parsed = deserializeInput(serialized)

      expect(parsed).toEqual(input)
    })

    it('[U02093] returns null and logs a warning when deserialization fails', () => {
      const warnSpy = vi.spyOn(window.logger, 'warn').mockImplementation(() => {})

      const result = deserializeInput('{not-json')

      expect(result).toBeNull()
      expect(warnSpy).toHaveBeenCalled()
    })
  })
})
