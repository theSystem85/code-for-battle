import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  canPlayCriticalDamageSound,
  recordCriticalDamageSoundPlayed,
  cleanupSoundCooldowns
} from '../../src/game/soundCooldownManager.js'

// Mock config
vi.mock('../../src/config.js', () => ({
  CRITICAL_DAMAGE_SOUND_COOLDOWN: 5000
}))

describe('soundCooldownManager', () => {
  beforeEach(() => {
    // Reset the internal state by cleaning up with empty array
    cleanupSoundCooldowns([])
  })

  describe('canPlayCriticalDamageSound', () => {
    it('[U04090] returns true for unit that has never played sound', () => {
      const unit = { id: 'unit1' }
      expect(canPlayCriticalDamageSound(unit, 1000)).toBe(true)
    })

    it('[U04091] returns false for null unit', () => {
      expect(canPlayCriticalDamageSound(null, 1000)).toBe(false)
    })

    it('[U04092] returns false for undefined unit', () => {
      expect(canPlayCriticalDamageSound(undefined, 1000)).toBe(false)
    })

    it('[U04093] returns false for unit without id', () => {
      const unit = { type: 'tank' }
      expect(canPlayCriticalDamageSound(unit, 1000)).toBe(false)
    })

    it('[U04094] returns false if cooldown has not elapsed', () => {
      const unit = { id: 'unit1' }
      const initialTime = 1000

      // Record a sound was played
      recordCriticalDamageSoundPlayed(unit, initialTime)

      // Check if can play again after 3 seconds (before 5s cooldown)
      expect(canPlayCriticalDamageSound(unit, initialTime + 3000)).toBe(false)
    })

    it('[U04095] returns true if cooldown has elapsed', () => {
      const unit = { id: 'unit1' }
      const initialTime = 1000

      // Record a sound was played
      recordCriticalDamageSoundPlayed(unit, initialTime)

      // Check if can play again after 5 seconds (exactly at cooldown)
      expect(canPlayCriticalDamageSound(unit, initialTime + 5000)).toBe(true)
    })

    it('[U04096] returns true if more than cooldown has elapsed', () => {
      const unit = { id: 'unit1' }
      const initialTime = 1000

      // Record a sound was played
      recordCriticalDamageSoundPlayed(unit, initialTime)

      // Check if can play again after 10 seconds
      expect(canPlayCriticalDamageSound(unit, initialTime + 10000)).toBe(true)
    })

    it('[U04097] tracks different units independently', () => {
      const unit1 = { id: 'unit1' }
      const unit2 = { id: 'unit2' }
      const initialTime = 1000

      // Record sound for unit1
      recordCriticalDamageSoundPlayed(unit1, initialTime)

      // Unit1 should be on cooldown, unit2 should be available
      expect(canPlayCriticalDamageSound(unit1, initialTime + 1000)).toBe(false)
      expect(canPlayCriticalDamageSound(unit2, initialTime + 1000)).toBe(true)
    })
  })

  describe('recordCriticalDamageSoundPlayed', () => {
    it('[U04098] records sound for valid unit', () => {
      const unit = { id: 'unit1' }

      recordCriticalDamageSoundPlayed(unit, 1000)

      // Should now be on cooldown
      expect(canPlayCriticalDamageSound(unit, 1500)).toBe(false)
    })

    it('[U04099] does nothing for null unit', () => {
      expect(() => recordCriticalDamageSoundPlayed(null, 1000)).not.toThrow()
    })

    it('[U04100] does nothing for undefined unit', () => {
      expect(() => recordCriticalDamageSoundPlayed(undefined, 1000)).not.toThrow()
    })

    it('[U04101] does nothing for unit without id', () => {
      const unit = { type: 'tank' }
      expect(() => recordCriticalDamageSoundPlayed(unit, 1000)).not.toThrow()
    })

    it('[U04102] updates timestamp when sound is played again', () => {
      const unit = { id: 'unit1' }

      // First recording
      recordCriticalDamageSoundPlayed(unit, 1000)

      // Wait for cooldown to expire
      expect(canPlayCriticalDamageSound(unit, 6000)).toBe(true)

      // Record again at new time
      recordCriticalDamageSoundPlayed(unit, 6000)

      // Should be on cooldown again
      expect(canPlayCriticalDamageSound(unit, 7000)).toBe(false)
      expect(canPlayCriticalDamageSound(unit, 11000)).toBe(true)
    })
  })

  describe('cleanupSoundCooldowns', () => {
    it('[U04103] clears all entries when given empty array', () => {
      const unit = { id: 'unit1' }

      // Record a sound
      recordCriticalDamageSoundPlayed(unit, 1000)

      // Verify it's tracked
      expect(canPlayCriticalDamageSound(unit, 1500)).toBe(false)

      // Cleanup with empty units
      cleanupSoundCooldowns([])

      // Now the unit should be able to play (no longer tracked)
      expect(canPlayCriticalDamageSound(unit, 1500)).toBe(true)
    })

    it('[U04104] clears all entries when given null', () => {
      const unit = { id: 'unit1' }

      recordCriticalDamageSoundPlayed(unit, 1000)
      cleanupSoundCooldowns(null)

      expect(canPlayCriticalDamageSound(unit, 1500)).toBe(true)
    })

    it('[U04105] clears all entries when given undefined', () => {
      const unit = { id: 'unit1' }

      recordCriticalDamageSoundPlayed(unit, 1000)
      cleanupSoundCooldowns(undefined)

      expect(canPlayCriticalDamageSound(unit, 1500)).toBe(true)
    })

    it('[U04106] keeps entries for units that still exist', () => {
      const unit1 = { id: 'unit1' }
      const unit2 = { id: 'unit2' }

      recordCriticalDamageSoundPlayed(unit1, 1000)
      recordCriticalDamageSoundPlayed(unit2, 1000)

      // Only unit1 still exists
      cleanupSoundCooldowns([unit1])

      // Unit1 should still be on cooldown, unit2 should be cleared
      expect(canPlayCriticalDamageSound(unit1, 1500)).toBe(false)
      expect(canPlayCriticalDamageSound(unit2, 1500)).toBe(true)
    })

    it('[U04107] removes entries for destroyed units', () => {
      const unit1 = { id: 'unit1' }
      const unit2 = { id: 'unit2' }
      const unit3 = { id: 'unit3' }

      recordCriticalDamageSoundPlayed(unit1, 1000)
      recordCriticalDamageSoundPlayed(unit2, 1000)
      recordCriticalDamageSoundPlayed(unit3, 1000)

      // Only unit2 still exists
      cleanupSoundCooldowns([unit2])

      expect(canPlayCriticalDamageSound(unit1, 1500)).toBe(true)
      expect(canPlayCriticalDamageSound(unit2, 1500)).toBe(false)
      expect(canPlayCriticalDamageSound(unit3, 1500)).toBe(true)
    })

    it('[U04108] handles units without id in the active units array', () => {
      const unit1 = { id: 'unit1' }
      const unitWithoutId = { type: 'tank' }

      recordCriticalDamageSoundPlayed(unit1, 1000)

      // Pass units array with one that has no id
      expect(() => cleanupSoundCooldowns([unit1, unitWithoutId])).not.toThrow()

      // Unit1 should still be tracked
      expect(canPlayCriticalDamageSound(unit1, 1500)).toBe(false)
    })
  })
})
