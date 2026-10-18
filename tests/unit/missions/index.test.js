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
    it('[U02962] should be an array', () => {
      expect(Array.isArray(builtinMissions)).toBe(true)
    })

    it('[U02963] should contain at least one mission', () => {
      expect(builtinMissions.length).toBeGreaterThanOrEqual(1)
    })

    it('[U02964] should contain mission with id property', () => {
      expect(builtinMissions[0]).toHaveProperty('id')
    })

    it('[U02965] should contain mission with label property', () => {
      expect(builtinMissions[0]).toHaveProperty('label')
    })

    it('[U02966] should contain mission with description property', () => {
      expect(builtinMissions[0]).toHaveProperty('description')
    })

    it('[U02967] should contain mission with state property', () => {
      expect(builtinMissions[0]).toHaveProperty('state')
    })

    it('[U02968] should contain Mission_01 as first mission', () => {
      expect(builtinMissions[0].id).toBe('Mission_01')
    })
  })

  describe('getBuiltinMissionById', () => {
    it('[U02969] should return mission when id matches', () => {
      const mission = getBuiltinMissionById('Mission_01')
      expect(mission).not.toBeNull()
      expect(mission.id).toBe('Mission_01')
    })

    it('[U02970] should return null for non-existent mission id', () => {
      const mission = getBuiltinMissionById('NonExistentMission')
      expect(mission).toBeNull()
    })

    it('[U02971] should return null for undefined id', () => {
      const mission = getBuiltinMissionById(undefined)
      expect(mission).toBeNull()
    })

    it('[U02972] should return null for null id', () => {
      const mission = getBuiltinMissionById(null)
      expect(mission).toBeNull()
    })

    it('[U02973] should return null for empty string id', () => {
      const mission = getBuiltinMissionById('')
      expect(mission).toBeNull()
    })

    it('[U02974] should return correct mission label', () => {
      const mission = getBuiltinMissionById('Mission_01')
      expect(mission.label).toBe('Mission 01: Fordline')
    })

    it('[U02975] should return correct mission description', () => {
      const mission = getBuiltinMissionById('Mission_01')
      expect(mission.description).toContain('Ashford ford')
    })

    it('[U02976] should be case-sensitive when looking up missions', () => {
      const lowerCase = getBuiltinMissionById('mission_01')
      const upperCase = getBuiltinMissionById('MISSION_01')
      expect(lowerCase).toBeNull()
      expect(upperCase).toBeNull()
    })

    it('[U02977] should handle partial id matches correctly (should not match)', () => {
      const partial = getBuiltinMissionById('Mission')
      expect(partial).toBeNull()
    })
  })
})
