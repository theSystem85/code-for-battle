import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '../setup.js'

// Mock the sound module
vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn()
}))

import {
  markWaypointsAdded,
  handleAltKeyRelease,
  resetWaypointTracking
} from '../../src/game/waypointSounds.js'
import { playSound } from '../../src/sound.js'

describe('waypointSounds.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the internal state before each test
    resetWaypointTracking()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('markWaypointsAdded', () => {
    it('[U05093] should mark that waypoints were added', () => {
      markWaypointsAdded()

      // Verify by checking that handleAltKeyRelease plays sound
      handleAltKeyRelease()
      expect(playSound).toHaveBeenCalled()
    })

    it('[U05094] should not throw when called multiple times', () => {
      expect(() => {
        markWaypointsAdded()
        markWaypointsAdded()
        markWaypointsAdded()
      }).not.toThrow()
    })

    it('[U05095] should set state that persists until Alt key is released', () => {
      markWaypointsAdded()

      // State should persist
      handleAltKeyRelease()
      expect(playSound).toHaveBeenCalledTimes(1)
    })
  })

  describe('handleAltKeyRelease', () => {
    it('[U05096] should not play sound if no waypoints were added', () => {
      handleAltKeyRelease()

      expect(playSound).not.toHaveBeenCalled()
    })

    it('[U05097] should play sound when waypoints were added', () => {
      markWaypointsAdded()

      handleAltKeyRelease()

      expect(playSound).toHaveBeenCalledWith(
        'chainOfCommandsReceived',
        1.0,
        0,
        true
      )
    })

    it('[U05098] should reset state after playing sound', () => {
      markWaypointsAdded()
      handleAltKeyRelease()

      // Second release should not play sound
      handleAltKeyRelease()

      expect(playSound).toHaveBeenCalledTimes(1)
    })

    it('[U05099] should use stackable sound queue (true parameter)', () => {
      markWaypointsAdded()
      handleAltKeyRelease()

      expect(playSound).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        true // stackable = true
      )
    })

    it('[U05100] should use correct volume (1.0)', () => {
      markWaypointsAdded()
      handleAltKeyRelease()

      expect(playSound).toHaveBeenCalledWith(
        expect.any(String),
        1.0,
        expect.any(Number),
        expect.any(Boolean)
      )
    })

    it('[U05101] should use correct pan value (0)', () => {
      markWaypointsAdded()
      handleAltKeyRelease()

      expect(playSound).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        0,
        expect.any(Boolean)
      )
    })

    it('[U05102] should play the chainOfCommandsReceived sound', () => {
      markWaypointsAdded()
      handleAltKeyRelease()

      expect(playSound).toHaveBeenCalledWith(
        'chainOfCommandsReceived',
        expect.any(Number),
        expect.any(Number),
        expect.any(Boolean)
      )
    })
  })

  describe('resetWaypointTracking', () => {
    it('[U05103] should clear waypoint added state', () => {
      markWaypointsAdded()
      resetWaypointTracking()

      handleAltKeyRelease()

      expect(playSound).not.toHaveBeenCalled()
    })

    it('[U05104] should not throw when called with no state', () => {
      expect(() => resetWaypointTracking()).not.toThrow()
    })

    it('[U05105] should not throw when called multiple times', () => {
      expect(() => {
        resetWaypointTracking()
        resetWaypointTracking()
        resetWaypointTracking()
      }).not.toThrow()
    })

    it('[U05106] should allow new waypoints to be tracked after reset', () => {
      markWaypointsAdded()
      resetWaypointTracking()
      markWaypointsAdded()

      handleAltKeyRelease()

      expect(playSound).toHaveBeenCalledTimes(1)
    })
  })

  describe('integration scenarios', () => {
    it('[U05107] should handle typical Alt+click waypoint workflow', () => {
      // User presses Alt and clicks to add waypoints
      markWaypointsAdded()
      markWaypointsAdded()
      markWaypointsAdded()

      // User releases Alt key
      handleAltKeyRelease()

      // Sound should play once
      expect(playSound).toHaveBeenCalledTimes(1)
      expect(playSound).toHaveBeenCalledWith('chainOfCommandsReceived', 1.0, 0, true)
    })

    it('[U05108] should handle Alt press without adding waypoints', () => {
      // User presses Alt but doesn't add any waypoints
      resetWaypointTracking() // Alt key pressed

      // User releases Alt key
      handleAltKeyRelease()

      // No sound should play
      expect(playSound).not.toHaveBeenCalled()
    })

    it('[U05109] should handle multiple Alt key press/release cycles', () => {
      // First cycle - add waypoints
      markWaypointsAdded()
      handleAltKeyRelease()

      // Second cycle - add waypoints again
      markWaypointsAdded()
      handleAltKeyRelease()

      // Third cycle - no waypoints
      resetWaypointTracking()
      handleAltKeyRelease()

      // Sound should have played twice
      expect(playSound).toHaveBeenCalledTimes(2)
    })

    it('[U05110] should properly reset between Alt key sessions', () => {
      // First session
      markWaypointsAdded()
      handleAltKeyRelease()
      expect(playSound).toHaveBeenCalledTimes(1)

      // Prepare for new session
      resetWaypointTracking()

      // Second session without waypoints
      handleAltKeyRelease()
      expect(playSound).toHaveBeenCalledTimes(1) // Still 1, no new sound

      // Third session with waypoints
      markWaypointsAdded()
      handleAltKeyRelease()
      expect(playSound).toHaveBeenCalledTimes(2) // Now 2
    })
  })
})
