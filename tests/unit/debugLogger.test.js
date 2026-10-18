import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We need to test the module with different URL states
// So we'll mock window.location before importing
// eslint-disable-next-line no-undef
const globalRef = typeof globalThis !== 'undefined' ? globalThis : global

describe('debugLogger', () => {
  let originalWindow
  let originalConsole
  let mockLog
  let mockWarn
  let mockInfo
  let mockDebug

  beforeEach(() => {
    // Save originals
    originalWindow = globalRef.window
    originalConsole = {
      log: console.log,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    }

    // Create mock console methods
    mockLog = vi.fn()
    mockWarn = vi.fn()
    mockInfo = vi.fn()
    mockDebug = vi.fn()

    console.log = mockLog
    console.warn = mockWarn
    console.info = mockInfo
    console.debug = mockDebug
  })

  afterEach(() => {
    // Restore
    globalRef.window = originalWindow
    console.log = originalConsole.log
    console.warn = originalConsole.warn
    console.info = originalConsole.info
    console.debug = originalConsole.debug
    vi.resetModules()
  })

  describe('when debug is disabled (no ?debug param)', () => {
    beforeEach(() => {
      globalRef.window = {
        location: {
          search: ''
        }
      }
    })

    it('[U01177] logger function does not output', async() => {
      vi.resetModules()
      const { logger } = await import('../../src/utils/debugLogger.js')

      logger('test message')

      expect(mockLog).not.toHaveBeenCalled()
    })

    it('[U01178] logger.warn does not output', async() => {
      vi.resetModules()
      const { logger } = await import('../../src/utils/debugLogger.js')

      logger.warn('warning message')

      expect(mockWarn).not.toHaveBeenCalled()
    })

    it('[U01179] logger.info does not output', async() => {
      vi.resetModules()
      const { logger } = await import('../../src/utils/debugLogger.js')

      logger.info('info message')

      expect(mockInfo).not.toHaveBeenCalled()
    })

    it('[U01180] logger.debug does not output', async() => {
      vi.resetModules()
      const { logger } = await import('../../src/utils/debugLogger.js')

      logger.debug('debug message')

      expect(mockDebug).not.toHaveBeenCalled()
    })

    it('[U01181] logger.isEnabled returns false', async() => {
      vi.resetModules()
      const { logger } = await import('../../src/utils/debugLogger.js')

      expect(logger.isEnabled()).toBe(false)
    })

    it('[U01182] DEBUG_ENABLED is false', async() => {
      vi.resetModules()
      const { DEBUG_ENABLED } = await import('../../src/utils/debugLogger.js')

      expect(DEBUG_ENABLED).toBe(false)
    })
  })

  describe('when debug is enabled (?debug param present)', () => {
    beforeEach(() => {
      globalRef.window = {
        location: {
          search: '?debug'
        }
      }
    })

    it('[U01183] logger function outputs to console.log', async() => {
      vi.resetModules()
      const { logger } = await import('../../src/utils/debugLogger.js')

      logger('test message', 123)

      expect(mockLog).toHaveBeenCalledWith('test message', 123)
    })

    it('[U01184] logger.warn outputs to console.warn', async() => {
      vi.resetModules()
      const { logger } = await import('../../src/utils/debugLogger.js')

      logger.warn('warning message')

      expect(mockWarn).toHaveBeenCalledWith('warning message')
    })

    it('[U01185] logger.info outputs to console.info', async() => {
      vi.resetModules()
      const { logger } = await import('../../src/utils/debugLogger.js')

      logger.info('info message', { data: true })

      expect(mockInfo).toHaveBeenCalledWith('info message', { data: true })
    })

    it('[U01186] logger.debug outputs to console.debug', async() => {
      vi.resetModules()
      const { logger } = await import('../../src/utils/debugLogger.js')

      logger.debug('debug message')

      expect(mockDebug).toHaveBeenCalledWith('debug message')
    })

    it('[U01187] logger.isEnabled returns true', async() => {
      vi.resetModules()
      const { logger } = await import('../../src/utils/debugLogger.js')

      expect(logger.isEnabled()).toBe(true)
    })

    it('[U01188] DEBUG_ENABLED is true', async() => {
      vi.resetModules()
      const { DEBUG_ENABLED } = await import('../../src/utils/debugLogger.js')

      expect(DEBUG_ENABLED).toBe(true)
    })

    it('[U01189] handles multiple arguments', async() => {
      vi.resetModules()
      const { logger } = await import('../../src/utils/debugLogger.js')

      logger('a', 'b', 'c', 1, 2, 3)

      expect(mockLog).toHaveBeenCalledWith('a', 'b', 'c', 1, 2, 3)
    })
  })

  describe('when debug is one of multiple params', () => {
    beforeEach(() => {
      globalRef.window = {
        location: {
          search: '?invite=token&debug&mode=test'
        }
      }
    })

    it('[U01190] debug is still enabled', async() => {
      vi.resetModules()
      const { DEBUG_ENABLED, logger } = await import('../../src/utils/debugLogger.js')

      expect(DEBUG_ENABLED).toBe(true)
      expect(logger.isEnabled()).toBe(true)
    })
  })

  describe('when window is undefined (SSR/Node environment)', () => {
    beforeEach(() => {
      globalRef.window = undefined
    })

    it('[U01191] DEBUG_ENABLED defaults to false', async() => {
      vi.resetModules()
      const { DEBUG_ENABLED } = await import('../../src/utils/debugLogger.js')

      expect(DEBUG_ENABLED).toBe(false)
    })

    it('[U01192] logger does not throw', async() => {
      vi.resetModules()
      const { logger } = await import('../../src/utils/debugLogger.js')

      expect(() => logger('message')).not.toThrow()
    })
  })

  describe('exports', () => {
    it('[U01193] exports logger as named export', async() => {
      vi.resetModules()
      const module = await import('../../src/utils/debugLogger.js')

      expect(module.logger).toBeDefined()
      expect(typeof module.logger).toBe('function')
    })

    it('[U01194] exports DEBUG_ENABLED as named export', async() => {
      vi.resetModules()
      const module = await import('../../src/utils/debugLogger.js')

      expect(typeof module.DEBUG_ENABLED).toBe('boolean')
    })

    it('[U01195] exports logger as default', async() => {
      vi.resetModules()
      const module = await import('../../src/utils/debugLogger.js')

      expect(module.default).toBe(module.logger)
    })
  })
})
