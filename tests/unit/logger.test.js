import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  logEntries,
  log,
  getLogs,
  downloadLogs,
  enableUnitLogging,
  disableUnitLogging,
  toggleUnitLogging,
  getUnitStatus,
  logUnitStatus
} from '../../src/utils/logger.js'

describe('logger', () => {
  beforeEach(() => {
    // Clear log entries
    logEntries.length = 0
    // Mock window.logger
    if (typeof window !== 'undefined') {
      window.logger = vi.fn()
    }
  })

  afterEach(() => {
    logEntries.length = 0
  })

  describe('log', () => {
    it('[U02397] adds entry to logEntries', () => {
      log('test message')

      expect(logEntries).toHaveLength(1)
      expect(logEntries[0]).toContain('test message')
    })

    it('[U02398] includes timestamp in log entry', () => {
      log('test message')

      // Should have ISO timestamp format at start
      expect(logEntries[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T/)
    })

    it('[U02399] accumulates multiple log entries', () => {
      log('message 1')
      log('message 2')
      log('message 3')

      expect(logEntries).toHaveLength(3)
    })
  })

  describe('getLogs', () => {
    it('[U02400] returns empty string when no logs', () => {
      expect(getLogs()).toBe('')
    })

    it('[U02401] returns single log entry', () => {
      log('test message')

      const logs = getLogs()
      expect(logs).toContain('test message')
    })

    it('[U02402] joins multiple entries with newlines', () => {
      log('message 1')
      log('message 2')

      const logs = getLogs()
      expect(logs).toContain('message 1')
      expect(logs).toContain('message 2')
      expect(logs.split('\n')).toHaveLength(2)
    })
  })

  describe('downloadLogs', () => {
    it('[U02403] creates a blob URL and triggers a download', () => {
      log('download me')

      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
      const clickSpy = vi.fn()
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(() => ({
        click: clickSpy
      }))

      downloadLogs('test.log')

      expect(createSpy).toHaveBeenCalled()
      expect(clickSpy).toHaveBeenCalled()
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock')

      createElementSpy.mockRestore()
      revokeSpy.mockRestore()
      createSpy.mockRestore()
    })
  })

  describe('enableUnitLogging', () => {
    it('[U02404] sets loggingEnabled to true', () => {
      const unit = { id: 'unit1', type: 'tank' }

      enableUnitLogging(unit)

      expect(unit.loggingEnabled).toBe(true)
    })

    it('[U02405] logs that logging started', () => {
      const unit = { id: 'unit1', type: 'tank' }

      enableUnitLogging(unit)

      expect(logEntries).toHaveLength(1)
      expect(logEntries[0]).toContain('Started logging for unit unit1')
      expect(logEntries[0]).toContain('tank')
    })
  })

  describe('disableUnitLogging', () => {
    it('[U02406] sets loggingEnabled to false', () => {
      const unit = { id: 'unit1', type: 'tank', loggingEnabled: true }

      disableUnitLogging(unit)

      expect(unit.loggingEnabled).toBe(false)
    })

    it('[U02407] logs that logging stopped', () => {
      const unit = { id: 'unit1', type: 'harvester' }

      disableUnitLogging(unit)

      expect(logEntries).toHaveLength(1)
      expect(logEntries[0]).toContain('Stopped logging for unit unit1')
      expect(logEntries[0]).toContain('harvester')
    })
  })

  describe('toggleUnitLogging', () => {
    it('[U02408] enables logging when currently disabled', () => {
      const unit = { id: 'unit1', type: 'tank', loggingEnabled: false }

      toggleUnitLogging(unit)

      expect(unit.loggingEnabled).toBe(true)
    })

    it('[U02409] disables logging when currently enabled', () => {
      const unit = { id: 'unit1', type: 'tank', loggingEnabled: true }

      toggleUnitLogging(unit)

      expect(unit.loggingEnabled).toBe(false)
    })

    it('[U02410] enables logging when loggingEnabled is undefined', () => {
      const unit = { id: 'unit1', type: 'tank' }

      toggleUnitLogging(unit)

      expect(unit.loggingEnabled).toBe(true)
    })
  })

  describe('getUnitStatus', () => {
    it('[U02411] returns "retreating" when isRetreating is true', () => {
      const unit = { isRetreating: true }
      expect(getUnitStatus(unit)).toBe('retreating')
    })

    it('[U02412] returns "dodging" when isDodging is true', () => {
      const unit = { isDodging: true }
      expect(getUnitStatus(unit)).toBe('dodging')
    })

    it('[U02413] returns "harvesting" when harvesting is true', () => {
      const unit = { harvesting: true }
      expect(getUnitStatus(unit)).toBe('harvesting')
    })

    it('[U02414] returns "unloading" when unloadingAtRefinery is true', () => {
      const unit = { unloadingAtRefinery: true }
      expect(getUnitStatus(unit)).toBe('unloading')
    })

    it('[U02415] returns "attacking target" when target and isAttacking', () => {
      const unit = { target: { id: 'enemy' }, isAttacking: true }
      expect(getUnitStatus(unit)).toBe('attacking target')
    })

    it('[U02416] returns "moving to target" when moveTarget exists', () => {
      const unit = { moveTarget: { x: 100, y: 100 } }
      expect(getUnitStatus(unit)).toBe('moving to target')
    })

    it('[U02417] returns "moving" when movement.isMoving is true', () => {
      const unit = { movement: { isMoving: true } }
      expect(getUnitStatus(unit)).toBe('moving')
    })

    it('[U02418] returns "idle" when no special state', () => {
      const unit = {}
      expect(getUnitStatus(unit)).toBe('idle')
    })

    it('[U02419] prioritizes retreating over other states', () => {
      const unit = {
        isRetreating: true,
        isDodging: true,
        harvesting: true
      }
      expect(getUnitStatus(unit)).toBe('retreating')
    })

    it('[U02420] prioritizes dodging over harvesting', () => {
      const unit = {
        isDodging: true,
        harvesting: true
      }
      expect(getUnitStatus(unit)).toBe('dodging')
    })

    it('[U02421] returns "idle" when isAttacking but no target', () => {
      const unit = { isAttacking: true, target: null }
      expect(getUnitStatus(unit)).toBe('idle')
    })

    it('[U02422] returns "idle" when target exists but not attacking', () => {
      const unit = { target: { id: 'enemy' }, isAttacking: false }
      expect(getUnitStatus(unit)).toBe('idle')
    })
  })

  describe('logUnitStatus', () => {
    it('[U02423] logs status when changed', () => {
      const unit = { id: 'unit1', type: 'tank', isRetreating: true }

      logUnitStatus(unit)

      expect(logEntries).toHaveLength(1)
      expect(logEntries[0]).toContain('unit1')
      expect(logEntries[0]).toContain('tank')
      expect(logEntries[0]).toContain('retreating')
    })

    it('[U02424] updates lastLoggedStatus', () => {
      const unit = { id: 'unit1', type: 'tank', isRetreating: true }

      logUnitStatus(unit)

      expect(unit.lastLoggedStatus).toBe('retreating')
    })

    it('[U02425] does not log when status unchanged', () => {
      const unit = { id: 'unit1', type: 'tank', isRetreating: true, lastLoggedStatus: 'retreating' }

      logUnitStatus(unit)

      expect(logEntries).toHaveLength(0)
    })

    it('[U02426] logs when status changes from previous', () => {
      const unit = { id: 'unit1', type: 'tank', isRetreating: true, lastLoggedStatus: 'idle' }

      logUnitStatus(unit)

      expect(logEntries).toHaveLength(1)
      expect(unit.lastLoggedStatus).toBe('retreating')
    })
  })
})
