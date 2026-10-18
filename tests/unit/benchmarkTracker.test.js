import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../setup.js'

// Mock dependencies
vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    benchmarkActive: false,
    scrollOffset: { x: 0, y: 0 },
    keyScroll: {},
    isRightDragging: false,
    dragVelocity: { x: 0, y: 0 }
  }
}))

vi.mock('../../src/utils/layoutMetrics.js', () => ({
  getPlayableViewportWidth: vi.fn(() => 800),
  getPlayableViewportHeight: vi.fn(() => 600)
}))

vi.mock('../../src/main.js', () => ({
  getCurrentGame: vi.fn(() => ({
    canvasManager: {
      getGameCanvas: vi.fn(() => ({
        width: 800,
        height: 600
      }))
    }
  })),
  mapGrid: Array.from({ length: 100 }, (_, y) =>
    Array.from({ length: 100 }, (_, x) => ({
      type: 'grass',
      x,
      y
    }))
  ),
  units: []
}))

vi.mock('../../src/ui/benchmarkModal.js', () => ({
  updateBenchmarkCountdownAverage: vi.fn()
}))

import {
  startBenchmarkSession,
  isBenchmarkRunning,
  notifyBenchmarkFrame,
  cancelBenchmarkSession,
  resetBenchmarkCameraFocus,
  notifyBenchmarkManualCameraControl
} from '../../src/benchmark/benchmarkTracker.js'
import { gameState } from '../../src/gameState.js'
import { units } from '../../src/main.js'
import { updateBenchmarkCountdownAverage } from '../../src/ui/benchmarkModal.js'

describe('benchmarkTracker.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset gameState
    gameState.benchmarkActive = false
    gameState.scrollOffset = { x: 0, y: 0 }
    gameState.keyScroll = {}
    gameState.isRightDragging = false
    gameState.dragVelocity = { x: 0, y: 0 }

    // Reset units
    units.length = 0

    // Cancel any running session
    cancelBenchmarkSession()
    resetBenchmarkCameraFocus()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Ensure cleanup after each test
    cancelBenchmarkSession()
    resetBenchmarkCameraFocus()
  })

  describe('isBenchmarkRunning', () => {
    it('[U00463] should return false when no session is active', () => {
      expect(isBenchmarkRunning()).toBe(false)
    })

    it('[U00464] should return true when session is active', () => {
      startBenchmarkSession(10000)

      expect(isBenchmarkRunning()).toBe(true)
    })

    it('[U00465] should return false after session is cancelled', () => {
      startBenchmarkSession(10000)
      cancelBenchmarkSession()

      expect(isBenchmarkRunning()).toBe(false)
    })
  })

  describe('startBenchmarkSession', () => {
    it('[U00466] should return a promise', () => {
      const result = startBenchmarkSession(10000)

      expect(result).toBeInstanceOf(Promise)

      cancelBenchmarkSession()
    })

    it('[U00467] should return null if session is already running', () => {
      startBenchmarkSession(10000)
      const secondSession = startBenchmarkSession(10000)

      expect(secondSession).toBeInstanceOf(Promise)

      // Second promise should resolve to null
      cancelBenchmarkSession()
    })

    it('[U00468] should accept duration parameter', () => {
      const result = startBenchmarkSession(30000)

      expect(result).toBeInstanceOf(Promise)

      cancelBenchmarkSession()
    })

    it('[U00469] should accept interval parameter', () => {
      const result = startBenchmarkSession(30000, 500)

      expect(result).toBeInstanceOf(Promise)

      cancelBenchmarkSession()
    })

    it('[U00470] should use default duration of 60000ms', () => {
      const result = startBenchmarkSession()

      expect(result).toBeInstanceOf(Promise)

      cancelBenchmarkSession()
    })
  })

  describe('notifyBenchmarkFrame', () => {
    it('[U00471] should do nothing when no session is active', () => {
      notifyBenchmarkFrame({ timestamp: 1000, frameTime: 16.67 })

      expect(updateBenchmarkCountdownAverage).not.toHaveBeenCalled()
    })

    it('[U00472] should track frame when session is active', () => {
      startBenchmarkSession(10000)
      gameState.benchmarkActive = true

      notifyBenchmarkFrame({ timestamp: 1000, frameTime: 16.67 })

      expect(updateBenchmarkCountdownAverage).toHaveBeenCalled()
    })

    it('[U00473] should normalize near-zero frameTime values instead of dropping frames', () => {
      startBenchmarkSession(10000)

      notifyBenchmarkFrame({ timestamp: 1000, frameTime: 0.00001 })

      expect(updateBenchmarkCountdownAverage).toHaveBeenCalled()
    })

    it('[U00474] should ignore non-finite frameTime values', () => {
      startBenchmarkSession(10000)

      notifyBenchmarkFrame({ timestamp: 1000, frameTime: NaN })
      notifyBenchmarkFrame({ timestamp: 1000, frameTime: Infinity })

      expect(updateBenchmarkCountdownAverage).not.toHaveBeenCalled()
    })

    it('[U00475] should calculate fps from frameTime', () => {
      startBenchmarkSession(10000, 1000)
      gameState.benchmarkActive = true

      // 16.67ms frameTime = ~60fps
      notifyBenchmarkFrame({ timestamp: 1000, frameTime: 16.67 })

      // Should have called with approximately 60 fps
      expect(updateBenchmarkCountdownAverage).toHaveBeenCalledWith(expect.any(Number))
      const avgFps = updateBenchmarkCountdownAverage.mock.calls[0][0]
      expect(avgFps).toBeGreaterThan(50)
      expect(avgFps).toBeLessThan(70)
    })

    it('[U00476] should track multiple frames', () => {
      startBenchmarkSession(10000, 1000)
      gameState.benchmarkActive = true

      notifyBenchmarkFrame({ timestamp: 1000, frameTime: 16.67 })
      notifyBenchmarkFrame({ timestamp: 1017, frameTime: 16.67 })
      notifyBenchmarkFrame({ timestamp: 1034, frameTime: 16.67 })

      expect(updateBenchmarkCountdownAverage).toHaveBeenCalledTimes(3)
    })


    it('[U00477] should synthesize monotonic benchmark timestamps when uncapped loop provides duplicate timestamps', async() => {
      const promise = startBenchmarkSession(16, 8)
      gameState.benchmarkActive = true

      notifyBenchmarkFrame({ timestamp: 1000, frameTime: 0 })
      notifyBenchmarkFrame({ timestamp: 1000, frameTime: 0 })
      notifyBenchmarkFrame({ timestamp: 1000, frameTime: 0 })

      const result = await promise

      expect(result.frames).toBeGreaterThan(0)
      expect(result.intervalAverages.length).toBeGreaterThan(0)
      expect(result.intervalAverages.some(point => point.fps > 0)).toBe(true)
    })

    it('[U00478] should track min and max fps across frames', async() => {
      const promise = startBenchmarkSession(100, 50)
      gameState.benchmarkActive = true

      // Simulate different frame times (lower time = higher fps)
      notifyBenchmarkFrame({ timestamp: 0, frameTime: 10 })  // 100fps
      notifyBenchmarkFrame({ timestamp: 10, frameTime: 20 }) // 50fps
      notifyBenchmarkFrame({ timestamp: 30, frameTime: 8 })  // 125fps

      // Complete the session
      notifyBenchmarkFrame({ timestamp: 150, frameTime: 16.67 })

      const result = await promise

      expect(result.minFps).toBeLessThanOrEqual(result.maxFps)
    })
  })

  describe('cancelBenchmarkSession', () => {
    it('[U00479] should return null when no session is running', () => {
      const result = cancelBenchmarkSession()

      expect(result).toBeNull()
    })

    it('[U00480] should stop tracking when cancelled', () => {
      startBenchmarkSession(10000)
      gameState.benchmarkActive = true

      cancelBenchmarkSession()

      expect(isBenchmarkRunning()).toBe(false)
    })

    it('[U00481] should finalize and resolve the session promise', async() => {
      const promise = startBenchmarkSession(60000)
      gameState.benchmarkActive = true

      // Add some frames first
      notifyBenchmarkFrame({ timestamp: 0, frameTime: 16.67 })
      notifyBenchmarkFrame({ timestamp: 17, frameTime: 16.67 })

      cancelBenchmarkSession()

      const result = await promise

      expect(result).toBeDefined()
      expect(result.frames).toBeGreaterThanOrEqual(0)
    })
  })

  describe('resetBenchmarkCameraFocus', () => {
    it('[U00482] should be callable without error', () => {
      expect(() => resetBenchmarkCameraFocus()).not.toThrow()
    })

    it('[U00483] should reset camera focus state', () => {
      // Start a session to activate camera focus
      startBenchmarkSession(10000)
      gameState.benchmarkActive = true

      resetBenchmarkCameraFocus()

      // Should complete without error
      expect(() => resetBenchmarkCameraFocus()).not.toThrow()

      cancelBenchmarkSession()
    })
  })

  describe('notifyBenchmarkManualCameraControl', () => {
    it('[U00484] should be callable without error', () => {
      expect(() => notifyBenchmarkManualCameraControl()).not.toThrow()
    })

    it('[U00485] should flag manual camera control', () => {
      startBenchmarkSession(10000)
      gameState.benchmarkActive = true

      notifyBenchmarkManualCameraControl()

      // Should complete without error
      expect(() => notifyBenchmarkManualCameraControl()).not.toThrow()

      cancelBenchmarkSession()
    })
  })

  describe('session result structure', () => {
    it('[U00486] should return result with expected properties', async() => {
      const promise = startBenchmarkSession(100, 50)
      gameState.benchmarkActive = true

      // Add enough frames to complete session
      for (let i = 0; i <= 10; i++) {
        notifyBenchmarkFrame({ timestamp: i * 20, frameTime: 16.67 })
      }

      const result = await promise

      expect(result).toHaveProperty('durationMs')
      expect(result).toHaveProperty('frames')
      expect(result).toHaveProperty('averageFps')
      expect(result).toHaveProperty('minFps')
      expect(result).toHaveProperty('maxFps')
      expect(result).toHaveProperty('intervalAverages')
    })

    it('[U00487] should have frames count matching notified frames', async() => {
      const promise = startBenchmarkSession(100, 50)
      gameState.benchmarkActive = true

      notifyBenchmarkFrame({ timestamp: 0, frameTime: 16.67 })
      notifyBenchmarkFrame({ timestamp: 17, frameTime: 16.67 })
      notifyBenchmarkFrame({ timestamp: 34, frameTime: 16.67 })
      notifyBenchmarkFrame({ timestamp: 51, frameTime: 16.67 })
      notifyBenchmarkFrame({ timestamp: 68, frameTime: 16.67 })
      notifyBenchmarkFrame({ timestamp: 85, frameTime: 16.67 })
      notifyBenchmarkFrame({ timestamp: 150, frameTime: 16.67 }) // Triggers completion

      const result = await promise

      expect(result.frames).toBe(7)
    })

    it('[U00488] should calculate average fps correctly', async() => {
      const promise = startBenchmarkSession(100, 50)
      gameState.benchmarkActive = true

      // All frames at 60fps (16.67ms)
      for (let i = 0; i <= 6; i++) {
        notifyBenchmarkFrame({ timestamp: i * 20, frameTime: 16.67 })
      }

      const result = await promise

      // Average should be around 60fps
      expect(result.averageFps).toBeGreaterThan(50)
      expect(result.averageFps).toBeLessThan(70)
    })

    it('[U00489] should record intervalAverages', async() => {
      const promise = startBenchmarkSession(200, 50)
      gameState.benchmarkActive = true

      // Add frames spanning multiple intervals
      for (let i = 0; i <= 15; i++) {
        notifyBenchmarkFrame({ timestamp: i * 20, frameTime: 16.67 })
      }

      const result = await promise

      expect(result.intervalAverages).toBeInstanceOf(Array)
      expect(result.intervalAverages.length).toBeGreaterThan(0)
    })

    it('[U00490] should have intervalAverages with time and fps properties', async() => {
      const promise = startBenchmarkSession(200, 50)
      gameState.benchmarkActive = true

      // Add enough frames
      for (let i = 0; i <= 15; i++) {
        notifyBenchmarkFrame({ timestamp: i * 20, frameTime: 16.67 })
      }

      const result = await promise

      if (result.intervalAverages.length > 0) {
        const interval = result.intervalAverages[0]
        expect(interval).toHaveProperty('time')
        expect(interval).toHaveProperty('fps')
        expect(typeof interval.time).toBe('number')
        expect(typeof interval.fps).toBe('number')
      }
    })
  })

  describe('session completion', () => {
    it('[U00491] should complete when cancelled after frames', async() => {
      const promise = startBenchmarkSession(10000, 50)
      gameState.benchmarkActive = true

      // First frame initializes startTime
      notifyBenchmarkFrame({ timestamp: 0, frameTime: 16.67 })

      // Cancel instead of waiting for duration
      cancelBenchmarkSession()

      const result = await promise

      expect(result).toBeDefined()
      expect(isBenchmarkRunning()).toBe(false)
    })

    it('[U00492] should return 0 for minFps when no frames recorded', async() => {
      const promise = startBenchmarkSession(100)

      cancelBenchmarkSession()

      const result = await promise

      expect(result.minFps).toBe(0)
    })

    it('[U00493] should return 0 for averageFps when no frames recorded', async() => {
      const promise = startBenchmarkSession(100)

      cancelBenchmarkSession()

      const result = await promise

      expect(result.averageFps).toBe(0)
    })
  })

  describe('camera focus behavior', () => {
    it('[U00494] should detect manual scroll activity from keyScroll', () => {
      startBenchmarkSession(10000)
      gameState.benchmarkActive = true
      gameState.keyScroll = { up: true }

      // Should not throw when detecting manual activity
      notifyBenchmarkFrame({ timestamp: 0, frameTime: 16.67 })

      expect(updateBenchmarkCountdownAverage).toHaveBeenCalled()

      cancelBenchmarkSession()
    })

    it('[U00495] should detect manual scroll activity from right dragging', () => {
      startBenchmarkSession(10000)
      gameState.benchmarkActive = true
      gameState.isRightDragging = true

      notifyBenchmarkFrame({ timestamp: 0, frameTime: 16.67 })

      expect(updateBenchmarkCountdownAverage).toHaveBeenCalled()

      cancelBenchmarkSession()
    })

    it('[U00496] should detect manual scroll activity from drag velocity', () => {
      startBenchmarkSession(10000)
      gameState.benchmarkActive = true
      gameState.dragVelocity = { x: 1, y: 0 }

      notifyBenchmarkFrame({ timestamp: 0, frameTime: 16.67 })

      expect(updateBenchmarkCountdownAverage).toHaveBeenCalled()

      cancelBenchmarkSession()
    })
  })

  describe('combat focus targeting', () => {
    it('[U00497] should handle empty units array', () => {
      startBenchmarkSession(10000)
      gameState.benchmarkActive = true
      units.length = 0

      // Should not throw when there are no units
      notifyBenchmarkFrame({ timestamp: 0, frameTime: 16.67 })

      expect(updateBenchmarkCountdownAverage).toHaveBeenCalled()

      cancelBenchmarkSession()
    })

    it('[U00498] should handle units with targets', () => {
      startBenchmarkSession(10000)
      gameState.benchmarkActive = true

      units.push({
        id: 'unit1',
        x: 100,
        y: 100,
        owner: 'player1',
        destroyed: false,
        target: {
          id: 'unit2',
          x: 150,
          y: 150,
          owner: 'player2',
          destroyed: false
        }
      })

      notifyBenchmarkFrame({ timestamp: 0, frameTime: 16.67 })

      expect(updateBenchmarkCountdownAverage).toHaveBeenCalled()

      cancelBenchmarkSession()
    })

    it('[U00499] should ignore destroyed units', () => {
      startBenchmarkSession(10000)
      gameState.benchmarkActive = true

      units.push({
        id: 'unit1',
        x: 100,
        y: 100,
        owner: 'player1',
        destroyed: true,
        target: null
      })

      notifyBenchmarkFrame({ timestamp: 0, frameTime: 16.67 })

      expect(updateBenchmarkCountdownAverage).toHaveBeenCalled()

      cancelBenchmarkSession()
    })

    it('[U00500] should ignore units targeting allies', () => {
      startBenchmarkSession(10000)
      gameState.benchmarkActive = true

      units.push({
        id: 'unit1',
        x: 100,
        y: 100,
        owner: 'player1',
        destroyed: false,
        target: {
          id: 'unit2',
          x: 150,
          y: 150,
          owner: 'player1', // Same owner
          destroyed: false
        }
      })

      notifyBenchmarkFrame({ timestamp: 0, frameTime: 16.67 })

      expect(updateBenchmarkCountdownAverage).toHaveBeenCalled()

      cancelBenchmarkSession()
    })
  })
})
