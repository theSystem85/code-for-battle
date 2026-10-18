/**
 * Unit tests for src/tankConfigUtil.js
 *
 * Tests tank image configuration printing utility.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock dependencies
vi.mock('../../src/rendering/tankImageRenderer.js', () => ({
  getTankImageConfig: vi.fn(() => ({
    tankV1: {
      bodyOffset: { x: 0, y: 0 },
      turretOffset: { x: 5, y: -2 },
      scale: 1.0
    },
    tankV2: {
      bodyOffset: { x: 0, y: 0 },
      turretOffset: { x: 6, y: -3 },
      scale: 1.1
    },
    tankV3: {
      bodyOffset: { x: 0, y: 0 },
      turretOffset: { x: 7, y: -4 },
      scale: 1.2
    }
  }))
}))

// Mock process.env before import
vi.stubGlobal('process', {
  env: {
    NODE_ENV: 'development'
  }
})

import { printTankImageConfig } from '../../src/tankConfigUtil.js'
import { getTankImageConfig } from '../../src/rendering/tankImageRenderer.js'

describe('tankConfigUtil.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock window.logger
    if (!globalThis.window) {
      globalThis.window = {}
    }
    globalThis.window.logger = vi.fn()
  })

  describe('printTankImageConfig()', () => {
    it('[U04329] should print all tank configurations when variant is "all"', () => {
      printTankImageConfig('all')

      expect(window.logger).toHaveBeenCalledWith('Current Tank Image Configuration:')
      expect(window.logger).toHaveBeenCalledWith(expect.stringContaining('tankV1'))
    })

    it('[U04330] should print all tank configurations by default', () => {
      printTankImageConfig()

      expect(window.logger).toHaveBeenCalledWith('Current Tank Image Configuration:')
    })

    it('[U04331] should print specific tank variant configuration', () => {
      printTankImageConfig('tankV1')

      expect(window.logger).toHaveBeenCalledWith('Current Tank Image Configuration for tankV1:')
      expect(window.logger).toHaveBeenCalledWith(expect.stringContaining('bodyOffset'))
    })

    it('[U04332] should print tankV2 configuration', () => {
      printTankImageConfig('tankV2')

      expect(window.logger).toHaveBeenCalledWith('Current Tank Image Configuration for tankV2:')
    })

    it('[U04333] should print tankV3 configuration', () => {
      printTankImageConfig('tankV3')

      expect(window.logger).toHaveBeenCalledWith('Current Tank Image Configuration for tankV3:')
    })

    it('[U04334] should log error for invalid variant', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      printTankImageConfig('invalidVariant')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid variant')
      )

      consoleErrorSpy.mockRestore()
    })

    it('[U04335] should call getTankImageConfig to retrieve configuration', () => {
      printTankImageConfig('all')

      expect(getTankImageConfig).toHaveBeenCalled()
    })

    it('[U04336] should output JSON formatted configuration', () => {
      printTankImageConfig('tankV1')

      // Check that logger was called with properly formatted JSON
      const calls = window.logger.mock.calls
      const jsonOutput = calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('bodyOffset')
      )

      expect(jsonOutput).toBeDefined()
      expect(() => JSON.parse(jsonOutput[0])).not.toThrow()
    })
  })

  describe('Development mode window exposure', () => {
    it('[U04337] should expose utility to window in development mode', async() => {
      // Re-import module to check window exposure
      // Note: The window exposure happens at module load time
      expect(window.tankConfigUtil).toBeDefined()
      expect(typeof window.tankConfigUtil.printTankImageConfig).toBe('function')
    })
  })
})
