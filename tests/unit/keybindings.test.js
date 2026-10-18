import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { KeybindingManager, keybindingManager, KEYBINDING_CONTEXTS } from '../../src/input/keybindings.js'

vi.mock('../../src/version.json', () => ({
  default: {
    version: '1.0.0',
    commit: 'abc123'
  }
}))

describe('keybindings.js', () => {
  let mockLocalStorage

  beforeEach(() => {
    mockLocalStorage = {}
    globalThis.localStorage = {
      getItem: vi.fn((key) => mockLocalStorage[key] || null),
      setItem: vi.fn((key, value) => {
        mockLocalStorage[key] = value
      }),
      removeItem: vi.fn((key) => {
        delete mockLocalStorage[key]
      })
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('KEYBINDING_CONTEXTS', () => {
    it('[U02220] exports the correct context constants', () => {
      expect(KEYBINDING_CONTEXTS.DEFAULT).toBe('gameplay')
      expect(KEYBINDING_CONTEXTS.MAP_EDIT_ON).toBe('map-edit-on')
      expect(KEYBINDING_CONTEXTS.MAP_EDIT_OFF).toBe('map-edit-off')
    })
  })

  describe('KeybindingManager', () => {
    describe('constructor', () => {
      it('[U02221] loads stored overrides from localStorage', () => {
        mockLocalStorage['rts-custom-keybindings'] = JSON.stringify({
          keyboard: { 'toggle-help': { input: 'h' } },
          mouse: {},
          touch: {}
        })

        const manager = new KeybindingManager()

        expect(globalThis.localStorage.getItem).toHaveBeenCalledWith('rts-custom-keybindings')
        expect(manager.overrides.keyboard['toggle-help'].input).toBe('h')
      })

      it('[U02222] initializes with empty overrides if no stored data', () => {
        const manager = new KeybindingManager()

        expect(manager.overrides).toEqual({ keyboard: {}, mouse: {}, touch: {} })
      })

      it('[U02223] handles corrupted localStorage data gracefully', () => {
        mockLocalStorage['rts-custom-keybindings'] = 'invalid-json{'

        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const manager = new KeybindingManager()

        expect(manager.overrides).toEqual({ keyboard: {}, mouse: {}, touch: {} })
        expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to load stored keybindings', expect.any(Error))

        consoleWarnSpy.mockRestore()
      })

      it('[U02224] clones default bindings', () => {
        const manager = new KeybindingManager()

        expect(Array.isArray(manager.defaults.keyboard)).toBe(true)
        expect(Array.isArray(manager.defaults.mouse)).toBe(true)
        expect(Array.isArray(manager.defaults.touch)).toBe(true)
        expect(manager.defaults.keyboard.length).toBeGreaterThan(0)
      })
    })

    describe('getBindingsByDevice', () => {
      it('[U02225] returns default bindings when no overrides exist', () => {
        const manager = new KeybindingManager()
        const keyboardBindings = manager.getBindingsByDevice('keyboard')

        expect(keyboardBindings.length).toBeGreaterThan(0)
        expect(keyboardBindings[0]).toHaveProperty('id')
        expect(keyboardBindings[0]).toHaveProperty('label')
        expect(keyboardBindings[0]).toHaveProperty('input')
        expect(keyboardBindings[0].isCustom).toBe(false)
      })

      it('[U02226] merges custom bindings with defaults', () => {
        const manager = new KeybindingManager()
        manager.overrides.keyboard = { 'toggle-help': { input: 'h' } }

        const bindings = manager.getBindingsByDevice('keyboard')
        const toggleHelpBinding = bindings.find(b => b.id === 'toggle-help')

        expect(toggleHelpBinding.input).toBe('h')
        expect(toggleHelpBinding.isCustom).toBe(true)
      })

      it('[U02227] returns empty array for unknown device', () => {
        const manager = new KeybindingManager()
        const bindings = manager.getBindingsByDevice('unknown')

        expect(bindings).toEqual([])
      })

      it('[U02228] marks unchanged overrides as not custom', () => {
        const manager = new KeybindingManager()
        const originalBinding = manager.getBindingsByDevice('keyboard')[0]
        manager.overrides.keyboard = { [originalBinding.id]: { input: originalBinding.input } }

        const bindings = manager.getBindingsByDevice('keyboard')
        const binding = bindings.find(b => b.id === originalBinding.id)

        expect(binding.isCustom).toBe(false)
      })
    })

    describe('updateBinding', () => {
      it('[U02229] updates a binding and persists to localStorage', () => {
        const manager = new KeybindingManager()
        manager.updateBinding('keyboard', 'toggle-help', 'h')

        expect(manager.overrides.keyboard['toggle-help']).toEqual({ input: 'h' })
        expect(globalThis.localStorage.setItem).toHaveBeenCalledWith(
          'rts-custom-keybindings',
          expect.stringContaining('toggle-help')
        )
      })

      it('[U02230] creates overrides object for device if it does not exist', () => {
        const manager = new KeybindingManager()
        delete manager.overrides.keyboard

        manager.updateBinding('keyboard', 'toggle-help', 'h')

        expect(manager.overrides.keyboard).toBeDefined()
        expect(manager.overrides.keyboard['toggle-help']).toEqual({ input: 'h' })
      })

      it('[U02231] handles localStorage errors gracefully', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        globalThis.localStorage.setItem = vi.fn(() => {
          throw new Error('Storage quota exceeded')
        })

        const manager = new KeybindingManager()
        expect(() => manager.updateBinding('keyboard', 'toggle-help', 'h')).not.toThrow()

        expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to persist keybindings', expect.any(Error))
        consoleWarnSpy.mockRestore()
      })
    })

    describe('resetBinding', () => {
      it('[U02232] removes a binding override and persists', () => {
        const manager = new KeybindingManager()
        manager.overrides.keyboard = { 'toggle-help': { input: 'h' } }

        manager.resetBinding('keyboard', 'toggle-help')

        expect(manager.overrides.keyboard['toggle-help']).toBeUndefined()
        expect(globalThis.localStorage.setItem).toHaveBeenCalled()
      })

      it('[U02233] does nothing if no overrides exist for device', () => {
        const manager = new KeybindingManager()
        delete manager.overrides.keyboard

        manager.resetBinding('keyboard', 'toggle-help')

        expect(globalThis.localStorage.setItem).not.toHaveBeenCalled()
      })
    })

    describe('resetAll', () => {
      it('[U02234] clears all overrides and persists', () => {
        const manager = new KeybindingManager()
        manager.overrides = {
          keyboard: { 'toggle-help': { input: 'h' } },
          mouse: { select: { input: 'Mouse1' } },
          touch: {}
        }

        manager.resetAll()

        expect(manager.overrides).toEqual({ keyboard: {}, mouse: {}, touch: {} })
        expect(globalThis.localStorage.setItem).toHaveBeenCalled()
      })
    })

    describe('exportBindings', () => {
      it('[U02235] exports bindings with version metadata', () => {
        const manager = new KeybindingManager()
        const exported = manager.exportBindings()
        const data = JSON.parse(exported)

        expect(data.appVersion).toBe('1.0.0')
        expect(data.commit).toBe('abc123')
        expect(data.exportedAt).toBeDefined()
        expect(data.bindings).toBeDefined()
        expect(data.bindings.keyboard).toBeDefined()
        expect(data.bindings.mouse).toBeDefined()
        expect(data.bindings.touch).toBeDefined()
      })

      it('[U02236] includes custom bindings in export', () => {
        const manager = new KeybindingManager()
        manager.updateBinding('keyboard', 'toggle-help', 'h')

        const exported = manager.exportBindings()
        const data = JSON.parse(exported)

        const toggleHelpBinding = data.bindings.keyboard.find(b => b.id === 'toggle-help')
        expect(toggleHelpBinding.input).toBe('h')
        expect(toggleHelpBinding.isCustom).toBe(true)
      })
    })

    describe('importBindings', () => {
      it('[U02237] imports bindings and persists', () => {
        const manager = new KeybindingManager()
        const importData = {
          bindings: {
            keyboard: [
              { id: 'toggle-help', input: 'h' },
              { id: 'open-cheats', input: 'x' }
            ],
            mouse: [],
            touch: []
          }
        }

        manager.importBindings(importData)

        expect(manager.overrides.keyboard['toggle-help']).toEqual({ input: 'h' })
        expect(manager.overrides.keyboard['open-cheats']).toEqual({ input: 'x' })
        expect(globalThis.localStorage.setItem).toHaveBeenCalled()
      })

      it('[U02238] handles invalid import data gracefully', () => {
        const manager = new KeybindingManager()

        expect(() => manager.importBindings(null)).not.toThrow()
        expect(() => manager.importBindings({})).not.toThrow()
        expect(() => manager.importBindings({ bindings: null })).not.toThrow()
      })

      it('[U02239] skips invalid entries during import', () => {
        const manager = new KeybindingManager()
        const importData = {
          bindings: {
            keyboard: [
              { id: 'toggle-help', input: 'h' },
              { id: null, input: 'x' },
              { id: 'open-cheats' },
              null
            ],
            mouse: [],
            touch: []
          }
        }

        manager.importBindings(importData)

        expect(manager.overrides.keyboard['toggle-help']).toEqual({ input: 'h' })
        expect(manager.overrides.keyboard['open-cheats']).toBeUndefined()
      })
    })

    describe('normalizeKeyboardEvent', () => {
      it('[U02240] normalizes a simple key press', () => {
        const manager = new KeybindingManager()
        const event = { key: 'i', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

        const normalized = manager.normalizeKeyboardEvent(event)

        expect(normalized).toBe('i')
      })

      it('[U02241] normalizes key with modifiers', () => {
        const manager = new KeybindingManager()
        const event = { key: 'S', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }

        const normalized = manager.normalizeKeyboardEvent(event)

        expect(normalized).toBe('Ctrl+Shift+s')
      })

      it('[U02242] normalizes space key', () => {
        const manager = new KeybindingManager()
        const event = { key: ' ', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

        const normalized = manager.normalizeKeyboardEvent(event)

        expect(normalized).toBe('Space')
      })

      it('[U02243] excludes modifier keys from key part', () => {
        const manager = new KeybindingManager()
        const event = { key: 'Control', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false }

        const normalized = manager.normalizeKeyboardEvent(event)

        expect(normalized).toBe('Ctrl')
      })

      it('[U02244] preserves special key names', () => {
        const manager = new KeybindingManager()
        const event = { key: 'ArrowUp', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

        const normalized = manager.normalizeKeyboardEvent(event)

        expect(normalized).toBe('ArrowUp')
      })

      it('[U02245] includes all modifiers', () => {
        const manager = new KeybindingManager()
        const event = { key: 'a', ctrlKey: true, shiftKey: true, altKey: true, metaKey: true }

        const normalized = manager.normalizeKeyboardEvent(event)

        expect(normalized).toBe('Ctrl+Meta+Shift+Alt+a')
      })
    })

    describe('matchesKeyboardAction', () => {
      it('[U02246] matches when normalized inputs are equal', () => {
        const manager = new KeybindingManager()
        const event = { key: 'i', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

        const matches = manager.matchesKeyboardAction(event, 'toggle-help')

        expect(matches).toBe(true)
      })

      it('[U02247] does not match when inputs differ', () => {
        const manager = new KeybindingManager()
        const event = { key: 'x', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

        const matches = manager.matchesKeyboardAction(event, 'toggle-help')

        expect(matches).toBe(false)
      })

      it('[U02248] returns false for unknown action', () => {
        const manager = new KeybindingManager()
        const event = { key: 'z', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

        const matches = manager.matchesKeyboardAction(event, 'unknown-action')

        expect(matches).toBe(false)
      })

      it('[U02249] matches custom binding', () => {
        const manager = new KeybindingManager()
        manager.updateBinding('keyboard', 'toggle-help', 'h')
        const event = { key: 'h', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

        const matches = manager.matchesKeyboardAction(event, 'toggle-help')

        expect(matches).toBe(true)
      })

      it('[U02250] respects context when matching', () => {
        const manager = new KeybindingManager()
        const event = { key: 'M', ctrlKey: false, shiftKey: true, altKey: false, metaKey: false }

        const matches = manager.matchesKeyboardAction(event, 'map-edit-toggle', KEYBINDING_CONTEXTS.DEFAULT)

        expect(matches).toBe(true)
      })
    })

    describe('normalizeKeyboardInput', () => {
      it('[U02251] normalizes multi-part input', () => {
        const manager = new KeybindingManager()
        const normalized = manager.normalizeKeyboardInput('Ctrl+Shift+A')

        expect(normalized).toBe('Ctrl+Shift+a')
      })

      it('[U02252] handles empty input', () => {
        const manager = new KeybindingManager()
        const normalized = manager.normalizeKeyboardInput('')

        expect(normalized).toBe('')
      })

      it('[U02253] handles null input', () => {
        const manager = new KeybindingManager()
        const normalized = manager.normalizeKeyboardInput(null)

        expect(normalized).toBe('')
      })

      it('[U02254] trims whitespace from parts', () => {
        const manager = new KeybindingManager()
        const normalized = manager.normalizeKeyboardInput('Ctrl + Shift + A')

        expect(normalized).toBe('Ctrl+Shift+a')
      })

      it('[U02255] filters empty parts', () => {
        const manager = new KeybindingManager()
        const normalized = manager.normalizeKeyboardInput('Ctrl++A')

        expect(normalized).toBe('Ctrl+a')
      })
    })

    describe('pointerEventToString', () => {
      it('[U02256] converts a simple mouse click', () => {
        const manager = new KeybindingManager()
        const event = { button: 0, detail: 1, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

        const str = manager.pointerEventToString(event)

        expect(str).toBe('Mouse1')
      })

      it('[U02257] converts a double click', () => {
        const manager = new KeybindingManager()
        const event = { button: 0, detail: 2, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

        const str = manager.pointerEventToString(event)

        expect(str).toBe('Double Mouse1')
      })

      it('[U02258] includes modifiers for mouse events', () => {
        const manager = new KeybindingManager()
        const event = { button: 0, detail: 1, ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }

        const str = manager.pointerEventToString(event)

        expect(str).toBe('Ctrl+Shift+Mouse1')
      })

      it('[U02259] handles right click', () => {
        const manager = new KeybindingManager()
        const event = { button: 2, detail: 1, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

        const str = manager.pointerEventToString(event)

        expect(str).toBe('Mouse3')
      })

      it('[U02260] converts touch tap', () => {
        const manager = new KeybindingManager()
        const event = { touches: [{}], detail: 1 }

        const str = manager.pointerEventToString(event)

        expect(str).toBe('Tap')
      })

      it('[U02261] converts double tap', () => {
        const manager = new KeybindingManager()
        const event = { touches: [{}], detail: 2 }

        const str = manager.pointerEventToString(event)

        expect(str).toBe('Double Tap')
      })

      it('[U02262] converts two-finger tap', () => {
        const manager = new KeybindingManager()
        const event = { touches: [{}, {}], detail: 1 }

        const str = manager.pointerEventToString(event)

        expect(str).toBe('Double Finger Tap')
      })

      it('[U02263] uses changedTouches if touches is not available', () => {
        const manager = new KeybindingManager()
        const event = { changedTouches: [{}, {}], detail: 1 }

        const str = manager.pointerEventToString(event)

        expect(str).toBe('Double Finger Tap')
      })
    })

    describe('matchesPointerAction', () => {
      it('[U02264] matches mouse action', () => {
        const manager = new KeybindingManager()
        const event = { button: 0, detail: 1, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

        const matches = manager.matchesPointerAction('mouse', event, 'select')

        expect(matches).toBe(true)
      })

      it('[U02265] does not match incorrect pointer action', () => {
        const manager = new KeybindingManager()
        const event = { button: 2, detail: 1, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

        const matches = manager.matchesPointerAction('mouse', event, 'select')

        expect(matches).toBe(false)
      })

      it('[U02266] returns false for unknown action', () => {
        const manager = new KeybindingManager()
        const event = { button: 0, detail: 1, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

        const matches = manager.matchesPointerAction('mouse', event, 'unknown')

        expect(matches).toBe(false)
      })
    })

    describe('normalizePointerInput', () => {
      it('[U02267] normalizes pointer input', () => {
        const manager = new KeybindingManager()
        const normalized = manager.normalizePointerInput('Ctrl + Shift + Mouse1')

        expect(normalized).toBe('Ctrl+Shift+Mouse1')
      })

      it('[U02268] handles empty input', () => {
        const manager = new KeybindingManager()
        const normalized = manager.normalizePointerInput('')

        expect(normalized).toBe('')
      })

      it('[U02269] handles null input', () => {
        const manager = new KeybindingManager()
        const normalized = manager.normalizePointerInput(null)

        expect(normalized).toBe('')
      })
    })

    describe('getBindingForAction', () => {
      it('[U02270] finds binding by action id and context', () => {
        const manager = new KeybindingManager()
        const binding = manager.getBindingForAction('keyboard', 'toggle-help', KEYBINDING_CONTEXTS.DEFAULT)

        expect(binding).toBeDefined()
        expect(binding.id).toBe('toggle-help')
      })

      it('[U02271] returns undefined for unknown action', () => {
        const manager = new KeybindingManager()
        const binding = manager.getBindingForAction('keyboard', 'unknown-action')

        expect(binding).toBeUndefined()
      })

      it('[U02272] falls back to default context', () => {
        const manager = new KeybindingManager()
        const binding = manager.getBindingForAction('keyboard', 'toggle-help', KEYBINDING_CONTEXTS.MAP_EDIT_ON)

        expect(binding).toBeDefined()
        expect(binding.id).toBe('toggle-help')
      })
    })
  })

  describe('keybindingManager singleton', () => {
    it('[U02273] exports a singleton instance', () => {
      expect(keybindingManager).toBeInstanceOf(KeybindingManager)
    })

    it('[U02274] is the same instance across multiple imports', () => {
      const instance1 = keybindingManager
      const instance2 = keybindingManager

      expect(instance1).toBe(instance2)
    })
  })
})
