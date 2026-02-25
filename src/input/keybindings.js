// keybindings.js
// Centralized keybinding definitions, persistence, and matching helpers

import versionInfo from '../version.json' with { type: 'json' }

const STORAGE_KEY = 'rts-custom-keybindings'

// Context buckets allow us to show map-edit on/off groupings even if the
// current session never toggles the editor. The runtime helpers use the
// provided context value to pick the right binding list.
export const KEYBINDING_CONTEXTS = {
  DEFAULT: 'gameplay',
  MAP_EDIT_ON: 'map-edit-on',
  MAP_EDIT_OFF: 'map-edit-off'
}

// Default bindings are grouped by device type so the editor modal can render
// keyboard, mouse, and touch gestures side-by-side. Mouse and touch entries
// are informational for gestures that the game already recognizes.
const DEFAULT_BINDINGS = {
  keyboard: [
    { id: 'toggle-help', label: 'Toggle Controls Help', input: 'i', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'open-cheats', label: 'Open Cheat Console', input: 'c', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'open-runtime-config', label: 'Open Runtime Config', input: 'k', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'toggle-grid', label: 'Toggle Grid', input: 'g', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'toggle-occupancy', label: 'Toggle Occupancy Map', input: 'o', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'toggle-dzm', label: 'Cycle Danger Zone Map', input: 'z', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'toggle-tanks', label: 'Toggle Tank Images', input: 't', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'toggle-fps', label: 'Toggle FPS Overlay', input: 'p', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'toggle-performance', label: 'Toggle Performance Dialog', input: 'm', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'toggle-waypoints', label: 'Toggle Waypoint Paths', input: 'w', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'toggle-entity-opacity', label: 'Cycle Unit/Building Image Opacity', input: 'y', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'toggle-alert', label: 'Toggle Alert Mode', input: 'a', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'toggle-sell', label: 'Toggle Sell/Stop', input: 's', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'toggle-repair', label: 'Toggle Repair Mode', input: 'r', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'repair-to-workshop', label: 'Send to Workshop', input: 'Shift+W', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'dodge', label: 'Dodge Command', input: 'x', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'focus-factory', label: 'Focus on Factory', input: 'h', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'focus-selection', label: 'Focus on Selection / Toggle Auto Focus', input: 'e', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'formation', label: 'Toggle Formation Mode', input: 'f', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'logging', label: 'Toggle Unit Logging', input: 'l', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'escape', label: 'Cancel / Deselect', input: 'Escape', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'remote-forward', label: 'Remote Control Forward / Camera Up', input: 'ArrowUp', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'remote-backward', label: 'Remote Control Backward / Camera Down', input: 'ArrowDown', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'remote-left', label: 'Remote Control Left / Camera Left', input: 'ArrowLeft', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'remote-right', label: 'Remote Control Right / Camera Right', input: 'ArrowRight', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'remote-fire', label: 'Remote Control Fire', input: 'Space', context: KEYBINDING_CONTEXTS.DEFAULT },
    // Map edit specific bindings are separated for clarity
    { id: 'map-edit-toggle', label: 'Toggle Map Edit Mode', input: 'Shift+M', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'map-edit-paint', label: 'Paint Tile', input: 'Shift+Mouse1', context: KEYBINDING_CONTEXTS.MAP_EDIT_ON }
  ],
  mouse: [
    { id: 'select', label: 'Select Unit/Building', input: 'Mouse1', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'select-add', label: 'Add to Selection', input: 'Shift+Mouse1', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'select-type', label: 'Select Visible Type', input: 'Double Mouse1', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'force-attack', label: 'Force Attack Click', input: 'Ctrl+Mouse1', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'guard', label: 'Guard Click', input: 'Alt+Mouse1', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'command', label: 'Move / Attack', input: 'Mouse2', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'queue-command', label: 'Queue Command', input: 'Shift+Mouse2', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'scroll-drag', label: 'Pan Map', input: 'Mouse2', context: KEYBINDING_CONTEXTS.DEFAULT }
  ],
  touch: [
    { id: 'tap-select', label: 'Tap to Select', input: 'Tap', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'double-tap-select', label: 'Double Tap Select Type', input: 'Double Tap', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'two-finger-tap', label: 'Two-Finger Tap (Secondary Action)', input: 'Double Finger Tap', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'double-tap-command', label: 'Double Tap Move / Attack', input: 'Double Tap & Hold', context: KEYBINDING_CONTEXTS.DEFAULT },
    { id: 'pinch-camera', label: 'Pinch to Zoom/Pan', input: 'Pinch/Drag', context: KEYBINDING_CONTEXTS.DEFAULT }
  ]
}

function loadStoredOverrides() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return { keyboard: {}, mouse: {}, touch: {} }
    const parsed = JSON.parse(stored)
    return {
      keyboard: parsed.keyboard || {},
      mouse: parsed.mouse || {},
      touch: parsed.touch || {}
    }
  } catch (err) {
    console.warn('Failed to load stored keybindings', err)
    return { keyboard: {}, mouse: {}, touch: {} }
  }
}

function persistOverrides(overrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch (err) {
    console.warn('Failed to persist keybindings', err)
  }
}

function cloneDefaults() {
  return {
    keyboard: DEFAULT_BINDINGS.keyboard.map(entry => ({ ...entry })),
    mouse: DEFAULT_BINDINGS.mouse.map(entry => ({ ...entry })),
    touch: DEFAULT_BINDINGS.touch.map(entry => ({ ...entry }))
  }
}

export class KeybindingManager {
  constructor() {
    this.overrides = loadStoredOverrides()
    this.defaults = cloneDefaults()
  }

  getBindingsByDevice(device) {
    const defaults = this.defaults[device] || []
    const overridesForDevice = this.overrides[device] || {}
    return defaults.map(entry => {
      const customInput = overridesForDevice[entry.id]?.input
      return {
        ...entry,
        input: customInput || entry.input,
        isCustom: Boolean(customInput && customInput !== entry.input)
      }
    })
  }

  updateBinding(device, id, input) {
    if (!this.overrides[device]) {
      this.overrides[device] = {}
    }
    this.overrides[device][id] = { input }
    persistOverrides(this.overrides)
  }

  resetBinding(device, id) {
    if (this.overrides[device]) {
      delete this.overrides[device][id]
      persistOverrides(this.overrides)
    }
  }

  resetAll() {
    this.overrides = { keyboard: {}, mouse: {}, touch: {} }
    persistOverrides(this.overrides)
  }

  exportBindings() {
    const payload = {
      appVersion: versionInfo?.version || 'unknown',
      commit: versionInfo?.commit || 'unknown',
      exportedAt: new Date().toISOString(),
      bindings: {
        keyboard: this.getBindingsByDevice('keyboard'),
        mouse: this.getBindingsByDevice('mouse'),
        touch: this.getBindingsByDevice('touch')
      }
    }
    return JSON.stringify(payload, null, 2)
  }

  importBindings(data) {
    if (!data || !data.bindings) return
    this.overrides = {
      keyboard: this.rebuildOverrideIndex(data.bindings.keyboard),
      mouse: this.rebuildOverrideIndex(data.bindings.mouse),
      touch: this.rebuildOverrideIndex(data.bindings.touch)
    }
    persistOverrides(this.overrides)
  }

  rebuildOverrideIndex(entries = []) {
    return entries.reduce((acc, entry) => {
      if (entry?.id && entry?.input) {
        acc[entry.id] = { input: entry.input }
      }
      return acc
    }, {})
  }

  // Normalize keyboard events into comparable strings (e.g., "Ctrl+Shift+A").
  normalizeKeyboardEvent(event) {
    const parts = []
    if (event.ctrlKey) parts.push('Ctrl')
    if (event.metaKey) parts.push('Meta')
    if (event.shiftKey) parts.push('Shift')
    if (event.altKey) parts.push('Alt')

    const key = event.key === ' ' ? 'Space' : event.key
    if (key && !['Control', 'Shift', 'Meta', 'Alt'].includes(key)) {
      parts.push(key.length === 1 ? key.toLowerCase() : key)
    }
    return parts.join('+')
  }

  matchesKeyboardAction(event, actionId, context = KEYBINDING_CONTEXTS.DEFAULT) {
    const binding = this.getBindingForAction('keyboard', actionId, context)
    if (!binding) return false
    const normalized = this.normalizeKeyboardInput(binding.input)
    const incoming = this.normalizeKeyboardEvent(event)
    return normalized === incoming
  }

  normalizeKeyboardInput(input) {
    if (!input) return ''
    return input
      .split('+')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => part.length === 1 ? part.toLowerCase() : part)
      .join('+')
  }

  pointerEventToString(event) {
    if (event.touches || event.changedTouches) {
      const touchCount = event.touches?.length || event.changedTouches?.length || 0
      if (touchCount >= 2) return 'Double Finger Tap'
      return event.detail >= 2 ? 'Double Tap' : 'Tap'
    }

    const parts = []
    if (event.ctrlKey) parts.push('Ctrl')
    if (event.metaKey) parts.push('Meta')
    if (event.shiftKey) parts.push('Shift')
    if (event.altKey) parts.push('Alt')

    const buttonNames = ['Mouse1', 'Mouse2', 'Mouse3']
    const clickName = buttonNames[event.button] || `Mouse${(event.button ?? 0) + 1}`
    const prefix = event.detail >= 2 ? 'Double ' : ''
    parts.push(`${prefix}${clickName}`.trim())
    return parts.join('+')
  }

  matchesPointerAction(device, event, actionId, context = KEYBINDING_CONTEXTS.DEFAULT) {
    const binding = this.getBindingForAction(device, actionId, context)
    if (!binding) return false
    const incoming = this.pointerEventToString(event)
    const normalizedBinding = this.normalizePointerInput(binding.input)
    return normalizedBinding === this.normalizePointerInput(incoming)
  }

  normalizePointerInput(input) {
    if (!input) return ''
    return input
      .split('+')
      .map(part => part.trim())
      .filter(Boolean)
      .join('+')
  }

  getBindingForAction(device, actionId, context = KEYBINDING_CONTEXTS.DEFAULT) {
    const merged = this.getBindingsByDevice(device)
    return merged.find(entry => entry.id === actionId && (entry.context === context || entry.context === KEYBINDING_CONTEXTS.DEFAULT))
  }
}

export const keybindingManager = new KeybindingManager()
