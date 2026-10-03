/**
 * Unit tests for src/inputHandler.js
 *
 * Tests the main input handler module that coordinates mouse, keyboard,
 * cursor, and selection management for the game.
 */

// Track instances created by mocked constructors (use global with individual vars)
globalThis.__test__cursorManager = null
globalThis.__test__mouseHandler = null
globalThis.__test__keyboardHandler = null
globalThis.__test__selectionManager = null
globalThis.__test__cheatSystem = null

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock gameState first
vi.mock('../../src/gameState.js', () => ({
  gameState: {
    mapGrid: [],
    factories: [],
    humanPlayer: 'player1',
    multiplayerSession: null,
    selectionActive: false,
    selectionStart: { x: 0, y: 0 },
    selectionEnd: { x: 0, y: 0 },
    cheatDialogOpen: false,
    runtimeConfigDialogOpen: false
  }
}))

// Mock input system components - using class syntax for proper constructors
vi.mock('../../src/input/cursorManager.js', () => ({
  CursorManager: class {
    constructor() {
      globalThis.__test__cursorManager = this
      this.updateForceAttackMode = vi.fn()
      this.updateGuardMode = vi.fn()
      this.updateCustomCursor = vi.fn()
      this.refreshCursor = vi.fn()
    }
  }
}))

vi.mock('../../src/input/mouseHandler.js', () => ({
  MouseHandler: class {
    constructor() {
      globalThis.__test__mouseHandler = this
      this.setRenderScheduler = vi.fn()
      this.setupMouseEvents = vi.fn()
    }
  }
}))

vi.mock('../../src/input/keyboardHandler.js', () => ({
  KeyboardHandler: class {
    constructor() {
      globalThis.__test__keyboardHandler = this
      this.setRenderScheduler = vi.fn()
      this.setPlayerFactory = vi.fn()
      this.setupKeyboardEvents = vi.fn()
      this.setUnitCommands = vi.fn()
      this.setMouseHandler = vi.fn()
      this._cheatSystem = { id: 'cheat-system' }
      globalThis.__test__cheatSystem = this._cheatSystem
      this.getCheatSystem = () => this._cheatSystem
    }
  }
}))

vi.mock('../../src/input/selectionManager.js', () => ({
  SelectionManager: class {
    constructor() {
      globalThis.__test__selectionManager = this
      this.cleanupDestroyedSelectedUnits = vi.fn()
    }
  }
}))

vi.mock('../../src/input/unitCommands.js', () => ({
  UnitCommandsHandler: class {}
}))

vi.mock('../../src/input/cursorStyles.js', () => ({
  GAME_DEFAULT_CURSOR: 'default',
  preloadCursorAssets: vi.fn()
}))

vi.mock('../../src/utils/inputUtils.js', () => ({
  isForceAttackModifierActive: vi.fn(() => false),
  isGuardModifierActive: vi.fn(() => false)
}))

vi.mock('../../src/network/multiplayerSessionEvents.js', () => ({
  observeMultiplayerSession: vi.fn()
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/ui/policies/index.js', () => ({
  installUnitPolicyUi: vi.fn()
}))

// Mock DOM elements
const mockCanvas = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  getBoundingClientRect: vi.fn(() => ({
    left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600
  }))
}

const mockSidebar = {
  getBoundingClientRect: vi.fn(() => ({
    left: 700, top: 0, right: 800, bottom: 600
  }))
}

// Setup DOM mocks
beforeEach(() => {
  vi.stubGlobal('document', {
    getElementById: vi.fn((id) => {
      if (id === 'gameCanvas') return mockCanvas
      if (id === 'sidebar') return mockSidebar
      return null
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    body: { style: { cursor: '' } }
  })

  if (globalThis.__test__mouseHandler?.setRenderScheduler) {
    globalThis.__test__mouseHandler.setRenderScheduler.mockClear()
    globalThis.__test__mouseHandler.setupMouseEvents.mockClear()
  }

  if (globalThis.__test__keyboardHandler?.setRenderScheduler) {
    globalThis.__test__keyboardHandler.setRenderScheduler.mockClear()
    globalThis.__test__keyboardHandler.setPlayerFactory.mockClear()
    globalThis.__test__keyboardHandler.setupKeyboardEvents.mockClear()
    globalThis.__test__keyboardHandler.setUnitCommands.mockClear()
    globalThis.__test__keyboardHandler.setMouseHandler.mockClear()
  }

  if (globalThis.__test__selectionManager?.cleanupDestroyedSelectedUnits) {
    globalThis.__test__selectionManager.cleanupDestroyedSelectedUnits.mockClear()
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// Import after mocking
import {
  selectedUnits,
  selectionActive,
  selectionStartExport,
  selectionEndExport,
  setupInputHandlers,
  setRenderScheduler,
  cleanupDestroyedSelectedUnits,
  getKeyboardHandler,
  getUnitCommandsHandler
} from '../../src/inputHandler.js'

describe('inputHandler.js', () => {
  describe('exported constants', () => {
    describe('selectedUnits', () => {
      it('should be an array', () => {
        expect(Array.isArray(selectedUnits)).toBe(true)
      })

      it('should initially be empty', () => {
        expect(selectedUnits.length).toBe(0)
      })

      it('should be mutable', () => {
        const originalLength = selectedUnits.length
        selectedUnits.push({ id: 'test-unit' })
        expect(selectedUnits.length).toBe(originalLength + 1)
        selectedUnits.pop()
      })
    })

    describe('selectionActive', () => {
      it('should be a boolean', () => {
        expect(typeof selectionActive).toBe('boolean')
      })

      it('should initially be false', () => {
        expect(selectionActive).toBe(false)
      })
    })

    describe('selectionStartExport', () => {
      it('should be an object', () => {
        expect(typeof selectionStartExport).toBe('object')
      })

      it('should have x property', () => {
        expect(selectionStartExport).toHaveProperty('x')
      })

      it('should have y property', () => {
        expect(selectionStartExport).toHaveProperty('y')
      })

      it('should have initial x value of 0', () => {
        expect(selectionStartExport.x).toBe(0)
      })

      it('should have initial y value of 0', () => {
        expect(selectionStartExport.y).toBe(0)
      })
    })

    describe('selectionEndExport', () => {
      it('should be an object', () => {
        expect(typeof selectionEndExport).toBe('object')
      })

      it('should have x property', () => {
        expect(selectionEndExport).toHaveProperty('x')
      })

      it('should have y property', () => {
        expect(selectionEndExport).toHaveProperty('y')
      })

      it('should have initial x value of 0', () => {
        expect(selectionEndExport.x).toBe(0)
      })

      it('should have initial y value of 0', () => {
        expect(selectionEndExport.y).toBe(0)
      })
    })
  })

  describe('setRenderScheduler()', () => {
    it('should be a function', () => {
      expect(typeof setRenderScheduler).toBe('function')
    })

    it('should not throw when called with a callback', () => {
      expect(() => setRenderScheduler(() => {})).not.toThrow()
    })

    it('should not throw when called with null', () => {
      expect(() => setRenderScheduler(null)).not.toThrow()
    })

    it('should not throw when called with undefined', () => {
      expect(() => setRenderScheduler(undefined)).not.toThrow()
    })

    it('should forward scheduler to mouse and keyboard handlers', () => {
      setupInputHandlers([], [], [])
      const scheduler = () => {}

      setRenderScheduler(scheduler)

      // Verify behavior through public API - handlers should forward the call
      if (globalThis.__test__mouseHandler) {
        expect(globalThis.__test__mouseHandler.setRenderScheduler).toHaveBeenCalledWith(scheduler)
      }
      if (globalThis.__test__keyboardHandler) {
        expect(globalThis.__test__keyboardHandler.setRenderScheduler).toHaveBeenCalledWith(scheduler)
      }
    })
  })

  describe('cleanupDestroyedSelectedUnits()', () => {
    it('should be a function', () => {
      expect(typeof cleanupDestroyedSelectedUnits).toBe('function')
    })

    it('should not throw when called', () => {
      expect(() => cleanupDestroyedSelectedUnits()).not.toThrow()
    })

    it('should handle empty selectedUnits array', () => {
      selectedUnits.length = 0
      expect(() => cleanupDestroyedSelectedUnits()).not.toThrow()
    })

    it('should handle selectedUnits with alive units', () => {
      selectedUnits.length = 0
      selectedUnits.push({ id: 'unit-1', health: 100 })
      expect(() => cleanupDestroyedSelectedUnits()).not.toThrow()
      selectedUnits.length = 0
    })

    it('should delegate cleanup to selection manager', () => {
      setupInputHandlers([], [], [])
      selectedUnits.length = 0
      selectedUnits.push({ id: 'unit-1', health: 100 })

      cleanupDestroyedSelectedUnits()

      // Verify behavior - if handler exists, it should be called
      if (globalThis.__test__selectionManager) {
        expect(globalThis.__test__selectionManager.cleanupDestroyedSelectedUnits).toHaveBeenCalledWith(selectedUnits)
      }
      selectedUnits.length = 0
    })
  })

  describe('getKeyboardHandler()', () => {
    it('should be a function', () => {
      expect(typeof getKeyboardHandler).toBe('function')
    })

    it('should return an object', () => {
      const handler = getKeyboardHandler()
      expect(typeof handler).toBe('object')
    })

    it('should return the same handler on multiple calls', () => {
      const handler1 = getKeyboardHandler()
      const handler2 = getKeyboardHandler()
      expect(handler1).toBe(handler2)
    })

    it('should return handler with setRenderScheduler method', () => {
      const handler = getKeyboardHandler()
      expect(handler).toHaveProperty('setRenderScheduler')
    })

    it('should return handler with setupKeyboardEvents method', () => {
      const handler = getKeyboardHandler()
      expect(handler).toHaveProperty('setupKeyboardEvents')
    })
  })

  describe('setupInputHandlers()', () => {
    it('should configure the keyboard handler with player factory', () => {
      const factories = [{ id: 'player1' }, { id: 'player' }]

      setupInputHandlers([], factories, [])

      // Verify behavior - if handler exists, it should be configured
      if (globalThis.__test__keyboardHandler) {
        expect(globalThis.__test__keyboardHandler.setPlayerFactory).toHaveBeenCalledWith(factories[0])
      }
    })

    it('should expose the cheat system globally', () => {
      setupInputHandlers([], [], [])

      // Verify cheat system is exposed (may be set during import or this call)
      expect(window.cheatSystem).toBeTruthy()
    })

    it('should register mouse and keyboard listeners', () => {
      setupInputHandlers([], [], [])

      const eventTypes = document.addEventListener.mock.calls.map(call => call[0])
      expect(eventTypes).toContain('mousemove')
      expect(eventTypes).toContain('keydown')
      expect(eventTypes).toContain('keyup')
    })

    it('should update cursor manager on mouse movement', () => {
      setupInputHandlers([], [], [])

      const mouseMoveHandler = document.addEventListener.mock.calls.find(([type]) => type === 'mousemove')[1]
      const event = { clientX: 10, clientY: 10 }

      mouseMoveHandler(event)

      // Verify behavior - if handler exists, it should be called
      if (globalThis.__test__cursorManager) {
        expect(globalThis.__test__cursorManager.updateForceAttackMode).toHaveBeenCalled()
        expect(globalThis.__test__cursorManager.updateCustomCursor).toHaveBeenCalledWith(
          event,
          expect.any(Array),
          expect.any(Array),
          selectedUnits,
          []
        )
      }
    })
  })

  describe('remote cheat guard', () => {
    it('should block cheat hotkey for remote clients', async() => {
      vi.resetModules()

      const { observeMultiplayerSession } = await import('../../src/network/multiplayerSessionEvents.js')
      const { showNotification } = await import('../../src/ui/notifications.js')
      const { gameState } = await import('../../src/gameState.js')

      await import('../../src/inputHandler.js')

      const keydownHandler = document.addEventListener.mock.calls.find(([type]) => type === 'keydown')[1]

      observeMultiplayerSession.mock.calls[0][0]({ detail: { isRemote: true, localRole: 'client' } })

      const event = { key: 'c', preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() }
      keydownHandler(event)

      expect(showNotification).toHaveBeenCalledWith('Cheats are host-only for remote clients', 2300)
      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.stopImmediatePropagation).toHaveBeenCalled()

      showNotification.mockClear()
      gameState.cheatDialogOpen = true
      keydownHandler({ key: 'c', preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() })
      expect(showNotification).not.toHaveBeenCalled()
    })
  })

  describe('getUnitCommandsHandler()', () => {
    it('should be a function', () => {
      expect(typeof getUnitCommandsHandler).toBe('function')
    })

    it('should return an object', () => {
      const handler = getUnitCommandsHandler()
      expect(typeof handler).toBe('object')
    })

    it('should return the same handler on multiple calls', () => {
      const handler1 = getUnitCommandsHandler()
      const handler2 = getUnitCommandsHandler()
      expect(handler1).toBe(handler2)
    })
  })
})
