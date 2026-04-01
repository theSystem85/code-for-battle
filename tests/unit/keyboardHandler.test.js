import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { KeyboardHandler } from '../../src/input/keyboardHandler.js'
import { gameState } from '../../src/gameState.js'
import { createTestMapGrid, resetGameState } from '../testUtils.js'
import { playSound, playPositionalSound } from '../../src/sound.js'
import { findPathForOwner } from '../../src/units.js'
import { cancelUnitMovement } from '../../src/game/unifiedMovement.js'
import { broadcastUnitStop } from '../../src/network/gameCommandSync.js'
import { gameRandom } from '../../src/utils/gameRandom.js'
import { KEYBINDING_CONTEXTS } from '../../src/input/keybindings.js'
import { TILE_SIZE } from '../../src/config.js'
import { hasBlockingBuilding } from '../../src/utils/buildingPassability.js'

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn(),
  playPositionalSound: vi.fn()
}))

vi.mock('../../src/units.js', () => ({
  findPathForOwner: vi.fn()
}))

vi.mock('../../src/input/cheatSystem.js', () => ({
  CheatSystem: class {
    setSelectedUnitsRef() {}
    openDialog() {}
    updateNewUnit() {}
    cleanupDestroyedUnit() {}
  }
}))

vi.mock('../../src/utils/inputUtils.js', () => ({
  isInputFieldFocused: vi.fn(() => false)
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
    toggle: vi.fn()
  }
}))

vi.mock('../../src/ui/runtimeConfigDialog.js', () => ({
  runtimeConfigDialog: {
    openDialog: vi.fn()
  }
}))

vi.mock('../../src/input/cursorStyles.js', () => ({
  GAME_DEFAULT_CURSOR: 'default'
}))

vi.mock('../../src/input/remoteControlState.js', () => ({
  setRemoteControlAction: vi.fn(),
  getRemoteControlActionState: vi.fn(() => false)
}))

vi.mock('../../src/network/gameCommandSync.js', () => ({
  broadcastUnitStop: vi.fn()
}))

vi.mock('../../src/input/keybindings.js', () => ({
  keybindingManager: {
    matchesKeyboardAction: vi.fn()
  },
  KEYBINDING_CONTEXTS: {
    MAP_EDIT_ON: 'map-edit-on',
    MAP_EDIT_OFF: 'map-edit-off'
  }
}))

vi.mock('../../src/utils/layoutMetrics.js', () => ({
  getPlayableViewportHeight: vi.fn(() => 100),
  getPlayableViewportWidth: vi.fn(() => 200)
}))

vi.mock('../../src/benchmark/benchmarkTracker.js', () => ({
  notifyBenchmarkManualCameraControl: vi.fn()
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn()
}))

vi.mock('../../src/ui/settingsModal.js', () => ({
  openSettingsModal: vi.fn()
}))

vi.mock('../../src/utils/buildingPassability.js', () => ({
  hasBlockingBuilding: vi.fn(() => false)
}))

vi.mock('../../src/network/multiplayerStore.js', () => ({
  isLocalPartyAutomationLocked: vi.fn(() => false)
}))

vi.mock('../../src/replaySystem.js', () => ({
  createReplayUnitReferences: vi.fn(() => []),
  isReplayInteractionLocked: vi.fn(() => false),
  recordReplayCommand: vi.fn()
}))

describe('KeyboardHandler', () => {
  let handler

  beforeEach(() => {
    resetGameState()
    document.body.innerHTML = ''
    handler = new KeyboardHandler()
    handler.showNotification = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('returns the correct keybinding context based on map edit mode', () => {
    gameState.mapEditMode = false
    expect(handler.getKeybindingContext()).toBe(KEYBINDING_CONTEXTS.MAP_EDIT_OFF)

    gameState.mapEditMode = true
    expect(handler.getKeybindingContext()).toBe(KEYBINDING_CONTEXTS.MAP_EDIT_ON)
  })


  it('binds sidebar performance widget button to FPS overlay toggle', () => {
    document.body.innerHTML = '<button id="performanceWidgetBtn" type="button"></button>'
    handler = new KeyboardHandler()
    handler.showNotification = vi.fn()

    const mapGrid = createTestMapGrid(4, 4)
    handler.setupKeyboardEvents([], [], mapGrid, [])

    document.getElementById('performanceWidgetBtn').click()

    expect(gameState.fpsVisible).toBe(true)
    expect(playSound).toHaveBeenCalledWith('confirmed', 0.5)
  })

  it('cancels active modes and clears selections on escape', () => {
    const sellBtn = document.createElement('button')
    sellBtn.id = 'sellBtn'
    sellBtn.classList.add('active')
    document.body.appendChild(sellBtn)

    const repairBtn = document.createElement('button')
    repairBtn.id = 'repairBtn'
    repairBtn.classList.add('active')
    document.body.appendChild(repairBtn)

    const gameCanvas = document.createElement('canvas')
    gameCanvas.id = 'gameCanvas'
    document.body.appendChild(gameCanvas)

    const mouseHandler = {
      resetAttackGroupState: vi.fn(),
      updateAGFCapability: vi.fn()
    }

    handler.setMouseHandler(mouseHandler)

    const unit = { id: 'u1', owner: gameState.humanPlayer, selected: true }
    const factory = { id: 'f1', selected: true }
    const building = { id: 'b1', owner: gameState.humanPlayer, selected: true }

    handler.selectedUnits = [unit]
    handler.units = [unit]
    handler.factories = [factory]
    gameState.buildings = [building]

    gameState.attackGroupMode = true
    gameState.buildingPlacementMode = true
    gameState.repairMode = true
    gameState.sellMode = true

    handler.handleEscapeKey()

    expect(mouseHandler.resetAttackGroupState).toHaveBeenCalled()
    expect(gameState.buildingPlacementMode).toBe(false)
    expect(gameState.repairMode).toBe(false)
    expect(gameState.sellMode).toBe(false)
    expect(handler.selectedUnits).toHaveLength(0)
    expect(unit.selected).toBe(false)
    expect(factory.selected).toBe(false)
    expect(building.selected).toBe(false)
    expect(sellBtn.classList.contains('active')).toBe(false)
    expect(repairBtn.classList.contains('active')).toBe(false)
    expect(mouseHandler.updateAGFCapability).toHaveBeenCalledWith(handler.selectedUnits)
    expect(handler.showNotification).toHaveBeenCalledWith('Selection cleared', 1000)
  })

  it('toggles alert mode for eligible units and plays feedback', () => {
    const unit = { type: 'tank-v2', alertMode: false }

    handler.handleAlertMode([unit])

    expect(unit.alertMode).toBe(true)
    expect(playSound).toHaveBeenCalledWith('unitSelection')
    expect(handler.showNotification).toHaveBeenCalledWith('Alert mode ON for 1 unit(s)', 2000)
  })

  it('warns when alert mode is used with no eligible units', () => {
    handler.handleAlertMode([{ type: 'harvester' }])

    expect(handler.showNotification).toHaveBeenCalledWith(
      'Alert mode is available for Tank V2, Ambulance, Tanker Truck and Recovery Tank units.',
      2000
    )
    expect(playSound).not.toHaveBeenCalled()
  })

  it('delegates sell hotkey to stop attacking when units are selected', () => {
    handler.selectedUnits = [{ id: 'u1' }]
    handler.handleStopAttacking = vi.fn()

    handler.handleSellMode()

    expect(handler.handleStopAttacking).toHaveBeenCalled()
    expect(gameState.sellMode).toBe(false)
  })

  it('toggles sell mode UI state when no units are selected', () => {
    const sellBtn = document.createElement('button')
    sellBtn.id = 'sellBtn'
    document.body.appendChild(sellBtn)

    const gameCanvas = document.createElement('canvas')
    gameCanvas.id = 'gameCanvas'
    document.body.appendChild(gameCanvas)

    handler.selectedUnits = []

    handler.handleSellMode()

    expect(gameState.sellMode).toBe(true)
    expect(sellBtn.classList.contains('active')).toBe(true)
    expect(gameCanvas.classList.contains('sell-mode')).toBe(true)
    expect(gameCanvas.style.cursor).toBe('default')
    expect(handler.showNotification).toHaveBeenCalledWith(
      'Sell mode activated - Click on a building to sell it for 70% of build price',
      3000
    )

    handler.handleSellMode()

    expect(gameState.sellMode).toBe(false)
    expect(sellBtn.classList.contains('active')).toBe(false)
    expect(gameCanvas.classList.contains('sell-mode')).toBe(false)
    expect(handler.showNotification).toHaveBeenLastCalledWith('Sell mode deactivated', 2000)
  })

  it('activates repair mode and disables sell mode', () => {
    const sellBtn = document.createElement('button')
    sellBtn.id = 'sellBtn'
    sellBtn.classList.add('active')
    document.body.appendChild(sellBtn)

    const repairBtn = document.createElement('button')
    repairBtn.id = 'repairBtn'
    document.body.appendChild(repairBtn)

    const gameCanvas = document.createElement('canvas')
    gameCanvas.id = 'gameCanvas'
    gameCanvas.classList.add('sell-mode')
    document.body.appendChild(gameCanvas)

    gameState.sellMode = true

    handler.handleRepairMode()

    expect(gameState.repairMode).toBe(true)
    expect(gameState.sellMode).toBe(false)
    expect(sellBtn.classList.contains('active')).toBe(false)
    expect(repairBtn.classList.contains('active')).toBe(true)
    expect(gameCanvas.classList.contains('repair-mode')).toBe(true)
    expect(gameCanvas.classList.contains('sell-mode')).toBe(false)
    expect(handler.showNotification).toHaveBeenCalledWith(
      'Repair mode activated. Click on a building to repair it.'
    )
  })

  it('returns false when Apache shift-space is used without apaches', () => {
    expect(handler.handleApacheShiftSpace([])).toBe(false)
    expect(handler.handleApacheShiftSpace([{ type: 'tank' }])).toBe(false)
  })

  it('toggles Apache manual flight state and plays positional sound', () => {
    const groundedApache = {
      type: 'apache',
      x: 100,
      y: 200,
      path: [{ x: 1, y: 1 }],
      moveTarget: { x: 5, y: 5 },
      flightPlan: ['route'],
      helipadLandingRequested: true,
      remoteControlActive: false,
      flightState: 'grounded'
    }

    const flyingApache = {
      type: 'apache',
      x: 200,
      y: 300,
      path: [{ x: 2, y: 2 }],
      moveTarget: { x: 6, y: 6 },
      flightPlan: ['route'],
      helipadLandingRequested: true,
      remoteControlActive: false,
      flightState: 'airborne'
    }

    const result = handler.handleApacheShiftSpace([groundedApache, flyingApache])

    expect(result).toBe(true)
    expect(groundedApache.path).toEqual([])
    expect(groundedApache.moveTarget).toBeNull()
    expect(groundedApache.flightPlan).toBeNull()
    expect(groundedApache.helipadLandingRequested).toBe(false)
    expect(groundedApache.remoteControlActive).toBe(true)
    expect(groundedApache.manualFlightState).toBe('takeoff')
    expect(groundedApache.manualFlightHoverRequested).toBe(true)
    expect(groundedApache.autoHoldAltitude).toBe(true)

    expect(flyingApache.manualFlightState).toBe('land')
    expect(flyingApache.manualFlightHoverRequested).toBe(false)
    expect(flyingApache.autoHoldAltitude).toBe(false)
    expect(playPositionalSound).toHaveBeenCalledWith('movement', 150, 250, 0.5)
  })

  it('validates dodge positions against map bounds, terrain, and occupancy', () => {
    const mapGrid = createTestMapGrid(3, 3)
    mapGrid[1][1].type = 'water'
    mapGrid[2][2].building = { id: 'building' }
    mapGrid[0][2].seedCrystal = true

    vi.mocked(hasBlockingBuilding).mockImplementation(tile => Boolean(tile?.building))

    expect(handler.isValidDodgePosition(1, 1, mapGrid, [])).toBe(false)
    expect(handler.isValidDodgePosition(2, 2, mapGrid, [])).toBe(false)
    expect(handler.isValidDodgePosition(2, 0, mapGrid, [])).toBe(false)
    expect(handler.isValidDodgePosition(-1, 0, mapGrid, [])).toBe(false)

    const units = [{ x: TILE_SIZE * 0, y: TILE_SIZE * 1 }]
    expect(handler.isValidDodgePosition(0, 1, mapGrid, units)).toBe(false)

    expect(handler.isValidDodgePosition(0, 0, mapGrid, [])).toBe(true)
  })

  it('alerts when dodge command is issued with no selection', () => {
    handler.handleDodgeCommand([], [], createTestMapGrid(3, 3))

    expect(handler.showNotification).toHaveBeenCalledWith('No units selected for dodge command', 2000)
  })

  it('issues a dodge path and feedback for valid units', () => {
    const mapGrid = createTestMapGrid(5, 5)
    const unit = {
      x: 2 * TILE_SIZE,
      y: 2 * TILE_SIZE,
      movement: {
        isMoving: true,
        velocity: { x: 1, y: 0 }
      },
      owner: gameState.humanPlayer,
      path: [{ x: 2, y: 2 }],
      target: { id: 'enemy' }
    }

    const units = [unit]

    gameRandom.mockReturnValue(0.4)
    findPathForOwner.mockReturnValue([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 }
    ])

    handler.handleDodgeCommand([unit], units, mapGrid)

    expect(findPathForOwner).toHaveBeenCalledWith(
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      mapGrid,
      null,
      gameState.humanPlayer
    )
    expect(unit.isDodging).toBe(true)
    expect(unit.originalPath).toEqual([{ x: 2, y: 2 }])
    expect(unit.originalTarget).toEqual({ id: 'enemy' })
    expect(unit.path).toEqual([
      { x: 3, y: 2 },
      { x: 4, y: 2 }
    ])
    expect(handler.showNotification).toHaveBeenCalledWith('Unit dodging!', 1500)
    expect(playPositionalSound).toHaveBeenCalled()
  })

  it('assigns control groups only to player-owned units', () => {
    const unit = { id: 'u1', type: 'tank', owner: gameState.humanPlayer }
    const factory = { id: 'f1', type: 'factory', owner: gameState.humanPlayer }

    handler.handleControlGroupAssignment('1', [unit, factory])

    expect(handler.controlGroups['1']).toEqual([unit])
    expect(unit.groupNumber).toBe('1')
    expect(factory.groupNumber).toBeUndefined()
    expect(playSound).toHaveBeenCalledWith('unitSelection')
    expect(handler.showNotification).toHaveBeenCalledWith('Group 1 assigned', 2000)
  })

  it('selects control group units and focuses on double press', () => {
    const mapGrid = createTestMapGrid(10, 10)
    const unitAlive = {
      id: 'u1',
      owner: gameState.humanPlayer,
      health: 50,
      x: 5 * TILE_SIZE,
      y: 4 * TILE_SIZE,
      selected: false
    }
    const unitDead = {
      id: 'u2',
      owner: gameState.humanPlayer,
      health: 0,
      x: 2 * TILE_SIZE,
      y: 2 * TILE_SIZE,
      selected: true
    }

    const units = [unitAlive, unitDead]
    const selectedUnits = [{ id: 'prev', owner: gameState.humanPlayer, selected: true }]

    handler.controlGroups['1'] = [unitAlive, unitDead]
    handler.lastGroupKeyPressed = '1'
    handler.lastGroupKeyPressTime = 900
    handler.requestRenderFrame = vi.fn()

    const gameCanvas = document.createElement('canvas')
    gameCanvas.id = 'gameCanvas'
    document.body.appendChild(gameCanvas)

    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000)

    handler.handleControlGroupSelection('1', units, selectedUnits, mapGrid)

    expect(handler.controlGroups['1']).toEqual([unitAlive])
    expect(selectedUnits).toEqual([unitAlive])
    expect(unitAlive.selected).toBe(true)
    expect(unitDead.selected).toBe(false)
    expect(handler.requestRenderFrame).toHaveBeenCalled()

    const expectedMaxX = mapGrid[0].length * TILE_SIZE - 200
    const expectedMaxY = mapGrid.length * TILE_SIZE - 100
    expect(gameState.scrollOffset.x).toBe(Math.max(0, Math.min(unitAlive.x - 100, expectedMaxX)))
    expect(gameState.scrollOffset.y).toBe(Math.max(0, Math.min(unitAlive.y - 50, expectedMaxY)))

    nowSpy.mockRestore()
  })

  it('stops attacks and broadcasts stop commands for player units', () => {
    const unit = {
      owner: gameState.humanPlayer,
      target: { id: 'enemy' },
      attackQueue: ['shot'],
      attackGroupTargets: ['target'],
      isDodging: true,
      dodgeEndTime: 123,
      originalPath: [{ x: 1, y: 1 }],
      originalTarget: { id: 'enemy' }
    }

    handler.selectedUnits = [unit]

    handler.handleStopAttacking()

    expect(unit.target).toBeNull()
    expect(unit.attackQueue).toEqual([])
    expect(unit.attackGroupTargets).toEqual([])
    expect(unit.isDodging).toBe(false)
    expect(unit.dodgeEndTime).toBeNull()
    expect(unit.originalPath).toBeNull()
    expect(unit.originalTarget).toBeNull()
    expect(cancelUnitMovement).toHaveBeenCalledWith(unit)
    expect(broadcastUnitStop).toHaveBeenCalledWith([unit])
    expect(handler.showNotification).toHaveBeenCalledWith('1 unit stopped attacking', 2000)
  })

  it('cycles occupancy map modes and updates visibility', () => {
    gameState.playerCount = 2
    gameState.occupancyMapViewIndex = 0
    gameState.occupancyMapViewMode = 'off'
    gameState.occupancyVisible = false

    handler.handleOccupancyMapToggle()

    expect(gameState.occupancyMapViewMode).toBe('players')
    expect(gameState.occupancyVisible).toBe(true)
    expect(handler.showNotification).toHaveBeenCalledWith('Occupancy map: Players', 2000)
  })

  it('formats occupancy mode labels for known modes', () => {
    expect(handler.formatOccupancyModeLabel('off')).toBe('OFF')
    expect(handler.formatOccupancyModeLabel('players')).toBe('Players')
    expect(handler.formatOccupancyModeLabel('player4')).toBe('Player 4')
    expect(handler.formatOccupancyModeLabel('custom')).toBe('custom')
  })

  it('rebuilds control groups from unit group numbers', () => {
    const unitA = { id: 'a', groupNumber: '1' }
    const unitB = { id: 'b', groupNumber: '2' }
    handler.rebuildControlGroupsFromUnits([unitA, unitB])

    expect(handler.controlGroups['1']).toEqual([unitA])
    expect(handler.controlGroups['2']).toEqual([unitB])
  })

  it('clears forced attacks for buildings when stopping', () => {
    const unit = {
      id: 'u1',
      owner: gameState.humanPlayer,
      target: { id: 'enemy' }
    }
    const building = {
      id: 'b1',
      isBuilding: true,
      owner: gameState.humanPlayer,
      forcedAttackTarget: { id: 'enemy' },
      forcedAttack: true,
      holdFire: false
    }

    handler.selectedUnits = [unit, building]

    handler.handleStopAttacking()

    // Building state should be updated
    expect(building.forcedAttackTarget).toBeNull()
    expect(building.forcedAttack).toBe(false)
    expect(building.holdFire).toBe(true)
    // Buildings use 'return' after processing so they're not included in broadcastUnitStop
    // Only non-building player units are broadcast
    expect(broadcastUnitStop).toHaveBeenCalledWith([unit])
  })
})
