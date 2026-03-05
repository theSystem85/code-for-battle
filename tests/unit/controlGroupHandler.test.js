import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetGameState, createTestMapGrid } from '../testUtils.js'

vi.mock('../../src/units.js', () => ({
  findPathForOwner: vi.fn()
}))

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn(),
  playPositionalSound: vi.fn()
}))

vi.mock('../../src/input/cheatSystem.js', () => ({
  CheatSystem: class {
    setSelectedUnitsRef() {}
    updateNewUnit() {}
    cleanupDestroyedUnit() {}
    openDialog() {}
  }
}))

vi.mock('../../src/utils/inputUtils.js', () => ({
  isInputFieldFocused: () => false
}))

vi.mock('../../src/utils/logger.js', () => ({
  toggleUnitLogging: vi.fn()
}))

vi.mock('../../src/game/unifiedMovement.js', () => ({
  cancelUnitMovement: vi.fn()
}))

vi.mock('../../src/game/waypointSounds.js', () => ({
  handleAltKeyRelease: vi.fn(),
  resetWaypointTracking: vi.fn()
}))

vi.mock('../../src/ui/performanceDialog.js', () => ({
  performanceDialog: {
    isOpen: () => false,
    toggleDialog: vi.fn()
  }
}))

vi.mock('../../src/ui/runtimeConfigDialog.js', () => ({
  runtimeConfigDialog: {
    openDialog: vi.fn(),
    isOpen: () => false,
    toggleDialog: vi.fn()
  }
}))

vi.mock('../../src/input/cursorStyles.js', () => ({
  GAME_DEFAULT_CURSOR: 'default'
}))

vi.mock('../../src/input/remoteControlState.js', () => ({
  setRemoteControlAction: vi.fn(),
  getRemoteControlActionState: vi.fn(() => ({}))
}))

vi.mock('../../src/network/gameCommandSync.js', () => ({
  broadcastUnitStop: vi.fn()
}))

vi.mock('../../src/input/keybindings.js', () => ({
  keybindingManager: {
    matchesKeyboardAction: vi.fn(() => false),
    matchesMouseAction: vi.fn(() => false)
  },
  KEYBINDING_CONTEXTS: {
    DEFAULT: 'gameplay',
    MAP_EDIT_ON: 'map-edit-on',
    MAP_EDIT_OFF: 'map-edit-off'
  }
}))

vi.mock('../../src/utils/layoutMetrics.js', () => ({
  getPlayableViewportHeight: vi.fn(() => 200),
  getPlayableViewportWidth: vi.fn(() => 300)
}))

vi.mock('../../src/benchmark/benchmarkTracker.js', () => ({
  notifyBenchmarkManualCameraControl: vi.fn()
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: {
    random: vi.fn(() => 0.5)
  }
}))

import { KeyboardHandler } from '../../src/input/keyboardHandler.js'
import { gameState } from '../../src/gameState.js'
import { playSound } from '../../src/sound.js'

const createUnit = (overrides = {}) => ({
  id: 'unit',
  x: 0,
  y: 0,
  health: 100,
  owner: gameState.humanPlayer,
  selected: false,
  ...overrides
})

describe('control group handling (keyboardHandler)', () => {
  beforeEach(() => {
    resetGameState()
    gameState.humanPlayer = 'player1'
    document.body.innerHTML = ''

    const canvas = document.createElement('canvas')
    canvas.id = 'gameCanvas'
    document.body.appendChild(canvas)

    vi.clearAllMocks()
  })

  it('assigns control groups to player-owned units and skips factories', () => {
    const handler = new KeyboardHandler()
    handler.showNotification = vi.fn()

    const playerUnit = createUnit({ id: 'u1', type: 'tank' })
    const factoryUnit = createUnit({ id: 'u2', type: 'factory' })
    const enemyUnit = createUnit({ id: 'u3', type: 'tank', owner: 'enemy' })
    const selectedUnits = [playerUnit, factoryUnit, enemyUnit]

    handler.handleControlGroupAssignment(1, selectedUnits)

    expect(handler.controlGroups[1]).toEqual([playerUnit])
    expect(playerUnit.groupNumber).toBe(1)
    expect(factoryUnit.groupNumber).toBeUndefined()
    expect(enemyUnit.groupNumber).toBeUndefined()
    expect(playSound).toHaveBeenCalledWith('unitSelection')
    expect(handler.showNotification).toHaveBeenCalledWith('Group 1 assigned', 2000)
  })

  it('selects only alive units in a control group and clears existing selection', () => {
    const handler = new KeyboardHandler()
    const mapGrid = createTestMapGrid(8, 8)

    const aliveUnit = createUnit({ id: 'u1', x: 50, y: 60, selected: true })
    const deadUnit = createUnit({ id: 'u2', health: 0, selected: true })
    const missingUnit = createUnit({ id: 'u3' })
    const units = [aliveUnit, deadUnit]
    const selectedUnits = [aliveUnit, deadUnit]

    gameState.factories = [{ id: 'f1', selected: true }]
    handler.controlGroups[2] = [aliveUnit, deadUnit, missingUnit]

    handler.handleControlGroupSelection(2, units, selectedUnits, mapGrid)

    expect(handler.controlGroups[2]).toEqual([aliveUnit])
    expect(selectedUnits).toEqual([aliveUnit])
    expect(aliveUnit.selected).toBe(true)
    expect(deadUnit.selected).toBe(false)
    expect(gameState.factories[0].selected).toBe(false)
    expect(playSound).toHaveBeenCalledWith('unitSelection')
    expect(handler.lastGroupKeyPressed).toBe(2)
    expect(handler.lastGroupKeyPressTime).toBeGreaterThan(0)
  })

  it('centers the camera when the same control group is double-pressed', () => {
    const handler = new KeyboardHandler()
    handler.requestRenderFrame = vi.fn()

    const unitA = createUnit({ id: 'u1', x: 50, y: 60 })
    const unitB = createUnit({ id: 'u2', x: 200, y: 220 })
    const unitC = createUnit({ id: 'u3', x: 300, y: 350 })
    const units = [unitA, unitB, unitC]
    const selectedUnits = []
    const mapGrid = createTestMapGrid(10, 10)

    handler.controlGroups[3] = [unitA, unitB, unitC]
    handler.lastGroupKeyPressed = 3
    handler.lastGroupKeyPressTime = 1000

    vi.spyOn(performance, 'now').mockReturnValue(1200)

    handler.handleControlGroupSelection(3, units, selectedUnits, mapGrid)

    expect(gameState.scrollOffset.x).toBe(20)
    expect(gameState.scrollOffset.y).toBe(120)
    expect(playSound).toHaveBeenCalledWith('confirmed')
    expect(handler.requestRenderFrame).toHaveBeenCalled()
    expect(handler.lastGroupKeyPressed).toBe(3)
    expect(handler.lastGroupKeyPressTime).toBe(1200)
  })

  it('rebuilds control groups from unit group numbers', () => {
    const handler = new KeyboardHandler()

    const units = [
      createUnit({ id: 'u1', groupNumber: 1 }),
      createUnit({ id: 'u2', groupNumber: 2 }),
      null,
      createUnit({ id: 'u3' })
    ]

    handler.rebuildControlGroupsFromUnits(units)

    expect(handler.controlGroups).toEqual({
      1: [units[0]],
      2: [units[1]]
    })
  })

  it('handles invalid unit lists when rebuilding control groups', () => {
    const handler = new KeyboardHandler()

    handler.controlGroups = { 1: [createUnit({ id: 'old' })] }
    handler.rebuildControlGroupsFromUnits(null)

    expect(handler.controlGroups).toEqual({})
  })

  it('handles control group assignment with empty selection', () => {
    const handler = new KeyboardHandler()
    handler.showNotification = vi.fn()

    handler.handleControlGroupAssignment(1, [])

    expect(handler.controlGroups[1]).toBeUndefined()
    expect(handler.showNotification).not.toHaveBeenCalled()
    expect(playSound).not.toHaveBeenCalled()
  })

  it('does not reassign same units to a group if already assigned', () => {
    const handler = new KeyboardHandler()
    handler.showNotification = vi.fn()

    const unit1 = createUnit({ id: 'u1', type: 'tank', groupNumber: 2 })
    const unit2 = createUnit({ id: 'u2', type: 'tank', groupNumber: 2 })

    handler.controlGroups[2] = [unit1, unit2]
    handler.handleControlGroupAssignment(2, [unit1, unit2])

    expect(handler.controlGroups[2]).toEqual([unit1, unit2])
    expect(playSound).toHaveBeenCalledWith('unitSelection')
  })

  it('overwrites previous control group assignment', () => {
    const handler = new KeyboardHandler()
    handler.showNotification = vi.fn()

    const oldUnit = createUnit({ id: 'old', type: 'tank', groupNumber: 5 })
    const newUnit = createUnit({ id: 'new', type: 'tank' })

    handler.controlGroups[5] = [oldUnit]
    handler.handleControlGroupAssignment(5, [newUnit])

    expect(handler.controlGroups[5]).toEqual([newUnit])
    expect(newUnit.groupNumber).toBe(5)
    expect(oldUnit.groupNumber).toBe(5)
  })

  it('handles control group selection with no units in group', () => {
    const handler = new KeyboardHandler()
    const mapGrid = createTestMapGrid(8, 8)
    const selectedUnits = []

    handler.handleControlGroupSelection(7, [], selectedUnits, mapGrid)

    expect(selectedUnits).toEqual([])
    expect(playSound).not.toHaveBeenCalled()
  })

  it('does not center camera on single-press', () => {
    const handler = new KeyboardHandler()
    handler.requestRenderFrame = vi.fn()

    const unit = createUnit({ id: 'u1', x: 100, y: 100 })
    const units = [unit]
    const selectedUnits = []
    const mapGrid = createTestMapGrid(10, 10)

    handler.controlGroups[4] = [unit]
    handler.lastGroupKeyPressed = 5
    handler.lastGroupKeyPressTime = 0

    vi.spyOn(performance, 'now').mockReturnValue(2000)

    const initialScrollX = gameState.scrollOffset.x
    const initialScrollY = gameState.scrollOffset.y

    handler.handleControlGroupSelection(4, units, selectedUnits, mapGrid)

    expect(gameState.scrollOffset.x).toBe(initialScrollX)
    expect(gameState.scrollOffset.y).toBe(initialScrollY)
    expect(playSound).not.toHaveBeenCalledWith('confirmed')
    expect(handler.lastGroupKeyPressed).toBe(4)
  })

  it('filters buildings from control group assignment', () => {
    const handler = new KeyboardHandler()
    handler.showNotification = vi.fn()

    const tank = createUnit({ id: 'u1', type: 'tank' })
    const building = createUnit({ id: 'b1', type: 'factory' })

    handler.handleControlGroupAssignment(3, [tank, building])

    expect(handler.controlGroups[3]).toEqual([tank])
    expect(tank.groupNumber).toBe(3)
    expect(building.groupNumber).toBeUndefined()
  })

  it('rebuilds control groups from mixed unit types', () => {
    const handler = new KeyboardHandler()

    const units = [
      createUnit({ id: 'u1', groupNumber: 1 }),
      createUnit({ id: 'u2', groupNumber: 1 }),
      createUnit({ id: 'u3', groupNumber: 3 }),
      createUnit({ id: 'u4' }),
      createUnit({ id: 'u5', groupNumber: 3 })
    ]

    handler.rebuildControlGroupsFromUnits(units)

    expect(handler.controlGroups).toEqual({
      1: [units[0], units[1]],
      3: [units[2], units[4]]
    })
  })

  it('rebuilds control groups with undefined array', () => {
    const handler = new KeyboardHandler()
    handler.controlGroups = { 1: [createUnit()] }

    handler.rebuildControlGroupsFromUnits(undefined)

    expect(handler.controlGroups).toEqual({})
  })

  it('handles control group selection time threshold for double-press', () => {
    const handler = new KeyboardHandler()
    handler.requestRenderFrame = vi.fn()

    // Place unit far enough from origin that centering on it will change scroll offset
    const unit = createUnit({ id: 'u1', x: 500, y: 400 })
    const units = [unit]
    const selectedUnits = []
    const mapGrid = createTestMapGrid(100, 100) // Larger map to allow scrolling

    handler.controlGroups[2] = [unit]
    handler.lastGroupKeyPressed = 2
    handler.lastGroupKeyPressTime = 1000

    // Use time within doublePressThreshold (500ms) to trigger double-press
    vi.spyOn(performance, 'now').mockReturnValue(1400)

    const initialScrollX = gameState.scrollOffset.x
    const initialScrollY = gameState.scrollOffset.y

    handler.handleControlGroupSelection(2, units, selectedUnits, mapGrid)

    expect(gameState.scrollOffset.x).not.toBe(initialScrollX)
    expect(gameState.scrollOffset.y).not.toBe(initialScrollY)
    expect(playSound).toHaveBeenCalledWith('confirmed')
    expect(handler.requestRenderFrame).toHaveBeenCalled()
  })
})
