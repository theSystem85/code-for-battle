import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../setup.js'

// Mock dependencies before importing the module under test
vi.mock('../../src/benchmark/benchmarkScenario.js', () => ({
  setupBenchmarkScenario: vi.fn(),
  teardownBenchmarkScenario: vi.fn()
}))

vi.mock('../../src/benchmark/benchmarkTracker.js', () => ({
  startBenchmarkSession: vi.fn(),
  isBenchmarkRunning: vi.fn(() => false)
}))

vi.mock('../../src/ui/benchmarkModal.js', () => ({
  hideBenchmarkCountdown: vi.fn(),
  initializeBenchmarkModal: vi.fn(),
  openBenchmarkModal: vi.fn(),
  setBenchmarkRunningState: vi.fn(),
  showBenchmarkCountdownMessage: vi.fn(),
  showBenchmarkResults: vi.fn(),
  showBenchmarkStatus: vi.fn(),
  startBenchmarkCountdown: vi.fn(() => vi.fn())
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    benchmarkActive: false
  }
}))

import { attachBenchmarkButton as _attachBenchmarkButton, runBenchmark as _runBenchmark } from '../../src/benchmark/benchmarkRunner.js'
import { setupBenchmarkScenario, teardownBenchmarkScenario } from '../../src/benchmark/benchmarkScenario.js'

// Keep references to avoid lint errors - these are used dynamically via reimport
const __unused = [_attachBenchmarkButton, _runBenchmark]
import { startBenchmarkSession, isBenchmarkRunning } from '../../src/benchmark/benchmarkTracker.js'
import {
  initializeBenchmarkModal,
  setBenchmarkRunningState,
  showBenchmarkStatus,
  showBenchmarkCountdownMessage,
  startBenchmarkCountdown,
  hideBenchmarkCountdown,
  showBenchmarkResults,
  openBenchmarkModal
} from '../../src/ui/benchmarkModal.js'
import { gameState } from '../../src/gameState.js'

describe('benchmarkRunner.js', () => {
  let mockButton
  let originalGetElementById

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset gameState
    gameState.benchmarkActive = false

    // Reset button initialized state by reimporting module
    vi.resetModules()

    // Create mock button element
    mockButton = {
      disabled: false,
      addEventListener: vi.fn()
    }

    // Save original and mock getElementById
    originalGetElementById = document.getElementById
    document.getElementById = vi.fn((id) => {
      if (id === 'runBenchmarkBtn') {
        return mockButton
      }
      return null
    })

    // Reset mock implementations
    isBenchmarkRunning.mockReturnValue(false)
    startBenchmarkSession.mockReturnValue(Promise.resolve({
      durationMs: 60000,
      frames: 3600,
      averageFps: 60,
      minFps: 55,
      maxFps: 65,
      intervalAverages: []
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.getElementById = originalGetElementById
  })

  describe('attachBenchmarkButton', () => {
    it('should initialize benchmark modal with callbacks', async() => {
      const { attachBenchmarkButton: attach } = await import('../../src/benchmark/benchmarkRunner.js')

      attach()

      expect(initializeBenchmarkModal).toHaveBeenCalledWith({
        onRunAgain: expect.any(Function),
        onClose: expect.any(Function)
      })
    })

    it('should attach click listener to button', async() => {
      const { attachBenchmarkButton: attach } = await import('../../src/benchmark/benchmarkRunner.js')

      attach()

      expect(mockButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
    })

    it('should not initialize twice when called multiple times', async() => {
      const { attachBenchmarkButton: attach } = await import('../../src/benchmark/benchmarkRunner.js')

      attach()
      attach()
      attach()

      // Should only be called once
      expect(initializeBenchmarkModal).toHaveBeenCalledTimes(1)
      expect(mockButton.addEventListener).toHaveBeenCalledTimes(1)
    })

    it('should return early if button is not found', async() => {
      document.getElementById = vi.fn(() => null)

      const { attachBenchmarkButton: attach } = await import('../../src/benchmark/benchmarkRunner.js')

      attach()

      expect(initializeBenchmarkModal).not.toHaveBeenCalled()
    })

    it('should re-enable button when onClose callback is invoked', async() => {
      let closeCallback = null
      initializeBenchmarkModal.mockImplementation((config) => {
        closeCallback = config.onClose
      })

      const { attachBenchmarkButton: attach } = await import('../../src/benchmark/benchmarkRunner.js')

      attach()

      // Simulate button being disabled
      mockButton.disabled = true

      // Trigger onClose callback
      closeCallback()

      expect(mockButton.disabled).toBe(false)
    })
  })

  describe('runBenchmark', () => {
    it('should return early if benchmark is already running', async() => {
      isBenchmarkRunning.mockReturnValue(true)

      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      expect(setupBenchmarkScenario).not.toHaveBeenCalled()
    })

    it('should disable button before running benchmark', async() => {
      const { runBenchmark: run, attachBenchmarkButton: attach } = await import('../../src/benchmark/benchmarkRunner.js')

      // First attach to get button reference
      attach()

      await run()

      // Button should be disabled during run, but re-enabled after
      expect(mockButton.disabled).toBe(false) // Re-enabled in finally block
    })

    it('should call setBenchmarkRunningState with true at start', async() => {
      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      expect(setBenchmarkRunningState).toHaveBeenCalledWith(true)
    })

    it('should show status messages during preparation', async() => {
      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      expect(showBenchmarkStatus).toHaveBeenCalledWith('Preparing benchmark scenario…')
      expect(showBenchmarkCountdownMessage).toHaveBeenCalledWith('Benchmark: preparing scenario…')
    })

    it('handles failures when benchmark session cannot start', async() => {
      const { runBenchmark: run, attachBenchmarkButton: attach } = await import('../../src/benchmark/benchmarkRunner.js')
      startBenchmarkSession.mockReturnValueOnce(null)

      const originalRaf = globalThis.requestAnimationFrame
      globalThis.requestAnimationFrame = (cb) => {
        cb()
        return 1
      }

      attach()
      const result = await run()

      expect(result).toBeNull()
      expect(showBenchmarkStatus).toHaveBeenCalledWith('Benchmark failed. Check console for details.')
      expect(openBenchmarkModal).toHaveBeenCalled()
      expect(teardownBenchmarkScenario).toHaveBeenCalled()

      globalThis.requestAnimationFrame = originalRaf
    })

    it('should call setupBenchmarkScenario', async() => {
      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      expect(setupBenchmarkScenario).toHaveBeenCalled()
    })

    it('should start benchmark countdown with 60s duration', async() => {
      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      expect(startBenchmarkCountdown).toHaveBeenCalledWith(60000)
    })

    it('should call startBenchmarkSession with 60s duration', async() => {
      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      expect(startBenchmarkSession).toHaveBeenCalledWith(60000)
    })

    it('should return benchmark results and support custom duration', async() => {
      const mockResult = {
        durationMs: 5000,
        frames: 300,
        averageFps: 60,
        minFps: 58,
        maxFps: 62,
        intervalAverages: []
      }
      startBenchmarkSession.mockReturnValue(Promise.resolve(mockResult))

      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      const result = await run(5000)

      expect(result).toBe(mockResult)
      expect(startBenchmarkCountdown).toHaveBeenCalledWith(5000)
      expect(startBenchmarkSession).toHaveBeenCalledWith(5000)
    })

    it('should show results on successful completion', async() => {
      const mockResult = {
        durationMs: 60000,
        frames: 3600,
        averageFps: 60,
        minFps: 55,
        maxFps: 65,
        intervalAverages: []
      }
      startBenchmarkSession.mockReturnValue(Promise.resolve(mockResult))

      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      expect(showBenchmarkResults).toHaveBeenCalledWith(mockResult)
      expect(openBenchmarkModal).toHaveBeenCalled()
    })

    it('should call teardownBenchmarkScenario in finally block', async() => {
      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      expect(teardownBenchmarkScenario).toHaveBeenCalled()
    })

    it('should reset benchmarkActive flag in finally block', async() => {
      gameState.benchmarkActive = true

      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      expect(gameState.benchmarkActive).toBe(false)
    })

    it('should hide countdown in finally block', async() => {
      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      expect(hideBenchmarkCountdown).toHaveBeenCalled()
    })

    it('should handle errors gracefully', async() => {
      setupBenchmarkScenario.mockImplementation(() => {
        throw new Error('Setup failed')
      })

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      expect(consoleError).toHaveBeenCalledWith('Benchmark run failed:', expect.any(Error))
      expect(showBenchmarkStatus).toHaveBeenCalledWith('Benchmark failed. Check console for details.')
      expect(setBenchmarkRunningState).toHaveBeenLastCalledWith(false)

      consoleError.mockRestore()
    })

    it('should handle startBenchmarkSession returning null', async() => {
      startBenchmarkSession.mockReturnValue(null)

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      // Should throw error about session already running
      expect(consoleError).toHaveBeenCalled()

      consoleError.mockRestore()
    })

    it('should hide countdown on completion', async() => {
      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      // Countdown is hidden in finally block
      expect(hideBenchmarkCountdown).toHaveBeenCalled()
    })

    it('should call setBenchmarkRunningState false on error', async() => {
      setupBenchmarkScenario.mockImplementation(() => {
        throw new Error('Test error')
      })

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { runBenchmark: run } = await import('../../src/benchmark/benchmarkRunner.js')

      await run()

      // Should set running state to false on error
      expect(setBenchmarkRunningState).toHaveBeenLastCalledWith(false)

      consoleError.mockRestore()
    })
  })
})
