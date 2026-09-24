/**
 * Unit tests for src/missions/index.js
 *
 * Tests the missions index module that exports builtin missions
 * and provides mission lookup functionality.
 */

import { describe, it, expect, vi } from 'vitest'

// Mock the mission_01 module before importing
vi.mock('../../../src/missions/mission_01.js', () => ({
  mission01: {
    id: 'Mission_01',
    label: 'Mission 01: Fordline',
    description: 'Secure the Ashford ford. You start with a construction yard, one tank, and enough credits for a power plant, refinery, and factory.',
    time: 1735689600000,
    state: '{}'
  }
}))

import { builtinMissions, getBuiltinMissionById } from '../../../src/missions/index.js'

describe('missions/index.js', () => {
  describe('builtinMissions', () => {
    it('should be an array', () => {
      expect(Array.isArray(builtinMissions)).toBe(true)
    })

    it('should contain at least one mission', () => {
      expect(builtinMissions.length).toBeGreaterThanOrEqual(1)
    })

    it('should contain mission with id property', () => {
      expect(builtinMissions[0]).toHaveProperty('id')
    })

    it('should contain mission with label property', () => {
      expect(builtinMissions[0]).toHaveProperty('label')
    })

    it('should contain mission with description property', () => {
      expect(builtinMissions[0]).toHaveProperty('description')
    })

    it('should contain mission with state property', () => {
      expect(builtinMissions[0]).toHaveProperty('state')
    })

    it('should contain Mission_01 as first mission', () => {
      expect(builtinMissions[0].id).toBe('Mission_01')
    })
  })

  describe('getBuiltinMissionById', () => {
    it('should return mission when id matches', () => {
      const mission = getBuiltinMissionById('Mission_01')
      expect(mission).not.toBeNull()
      expect(mission.id).toBe('Mission_01')
    })

    it('should return null for non-existent mission id', () => {
      const mission = getBuiltinMissionById('NonExistentMission')
      expect(mission).toBeNull()
    })

    it('should return null for undefined id', () => {
      const mission = getBuiltinMissionById(undefined)
      expect(mission).toBeNull()
    })

    it('should return null for null id', () => {
      const mission = getBuiltinMissionById(null)
      expect(mission).toBeNull()
    })

    it('should return null for empty string id', () => {
      const mission = getBuiltinMissionById('')
      expect(mission).toBeNull()
    })

    it('should return correct mission label', () => {
      const mission = getBuiltinMissionById('Mission_01')
      expect(mission.label).toBe('Mission 01: Fordline')
    })

    it('should return correct mission description', () => {
      const mission = getBuiltinMissionById('Mission_01')
      expect(mission.description).toContain('Ashford ford')
    })

    it('should be case-sensitive when looking up missions', () => {
      const lowerCase = getBuiltinMissionById('mission_01')
      const upperCase = getBuiltinMissionById('MISSION_01')
      expect(lowerCase).toBeNull()
      expect(upperCase).toBeNull()
    })

    it('should handle partial id matches correctly (should not match)', () => {
      const partial = getBuiltinMissionById('Mission')
      expect(partial).toBeNull()
    })
  })
})
