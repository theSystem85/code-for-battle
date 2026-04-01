import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const configValues = vi.hoisted(() => ({
  TILE_SIZE: 32,
  ENABLE_ENEMY_SELECTION: false,
  ENABLE_ENEMY_CONTROL: false
}))

vi.mock('../../src/config.js', async(importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    get TILE_SIZE() {
      return configValues.TILE_SIZE
    },
    get ENABLE_ENEMY_SELECTION() {
      return configValues.ENABLE_ENEMY_SELECTION
    },
    get ENABLE_ENEMY_CONTROL() {
      return configValues.ENABLE_ENEMY_CONTROL
    },
    HELIPAD_FUEL_CAPACITY: 15600,
    HELIPAD_RELOAD_TIME: 8000,
    HELIPAD_AMMO_RESERVE: 250
  }
})

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1',
    scrollOffset: { x: 0, y: 0 },
    buildings: [],
    factories: [],
    attackGroupTargets: [],
    selectedWreckId: null,
    remoteControl: {
      forward: 0,
      backward: 0,
      turnLeft: 0,
      turnRight: 0,
      turretLeft: 0,
      turretRight: 0,
      fire: 0,
      ascend: 0,
      descend: 0,
      strafeLeft: 0,
      strafeRight: 0
    },
    remoteControlSources: {},
    remoteControlAbsolute: {
      wagonDirection: null,
      wagonSpeed: 0,
      turretDirection: null,
      turretTurnFactor: 0
    },
    remoteControlAbsoluteSources: {}
  }
}))

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn()
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/utils/layoutMetrics.js', () => ({
  getPlayableViewportWidth: vi.fn(() => 100),
  getPlayableViewportHeight: vi.fn(() => 100)
}))

vi.mock('../../src/buildings.js', () => ({
  buildingData: {
    constructionYard: { cost: 3000, width: 3, height: 3 },
    powerPlant: { cost: 500, width: 2, height: 2 }
  },
  createBuilding: vi.fn(),
  canPlaceBuilding: vi.fn(),
  placeBuilding: vi.fn(),
  updatePowerSupply: vi.fn()
}))

vi.mock('../../src/main.js', () => ({
  units: [],
  factories: [],
  mapGrid: []
}))

vi.mock('../../src/ui/llmQueueTooltip.js', () => ({
  hideLlmQueueTooltip: vi.fn(),
  updateLlmQueueTooltipForSelection: vi.fn()
}))

import { SelectionManager, getUnitSelectionCenter } from '../../src/input/selectionManager.js'
import { gameState } from '../../src/gameState.js'
import { playSound } from '../../src/sound.js'
import { showNotification } from '../../src/ui/notifications.js'
import { getPlayableViewportHeight, getPlayableViewportWidth } from '../../src/utils/layoutMetrics.js'

describe('selectionManager', () => {
  let manager
  let getElementByIdSpy

  beforeEach(() => {
    manager = new SelectionManager()
    gameState.humanPlayer = 'player1'
    gameState.scrollOffset = { x: 0, y: 0 }
    gameState.attackGroupTargets = ['target']
    gameState.selectedWreckId = 'wreck-1'
    gameState.buildings = []
    gameState.factories = []
    configValues.ENABLE_ENEMY_SELECTION = false
    configValues.ENABLE_ENEMY_CONTROL = false

    getElementByIdSpy = vi.spyOn(document, 'getElementById').mockImplementation(() => {
      const canvas = document.createElement('canvas')
      canvas.style.width = '100px'
      canvas.style.height = '100px'
      return canvas
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('computes selection center and applies apache altitude lift', () => {
    const center = getUnitSelectionCenter({ x: 10, y: 20, type: 'apache', altitude: 5 })

    expect(center).toEqual({ centerX: 26, centerY: 20 + 16 - 2 })
  })

  it('clears wreck selection when requested', () => {
    manager.clearWreckSelection()
    expect(gameState.selectedWreckId).toBeNull()
  })

  it('respects enemy selection config when determining selectable units', () => {
    const humanUnit = { owner: 'player', health: 10 }
    const enemyUnit = { owner: 'enemy', health: 10 }

    expect(manager.isSelectableUnit(humanUnit)).toBe(true)
    expect(manager.isSelectableUnit(enemyUnit)).toBe(false)

    configValues.ENABLE_ENEMY_SELECTION = true
    expect(manager.isSelectableUnit(enemyUnit)).toBe(true)
  })

  it('marks enemy units commandable when enemy control is enabled', () => {
    const enemyUnit = { owner: 'enemy', health: 10 }
    configValues.ENABLE_ENEMY_CONTROL = true

    expect(manager.isCommandableUnit(enemyUnit)).toBe(true)
  })

  it('handles normal unit clicks by clearing previous selections and attack targets', () => {
    const clickedUnit = { id: 'u1', owner: 'player', health: 10, selected: false }
    const otherUnit = { id: 'u2', owner: 'player', health: 10, selected: true }
    const units = [clickedUnit, otherUnit]
    const factory = { id: 'f1', selected: true }
    const selectedUnits = [otherUnit]

    manager.handleUnitSelection(clickedUnit, { shiftKey: false }, units, [factory], selectedUnits)

    expect(clickedUnit.selected).toBe(true)
    expect(otherUnit.selected).toBe(false)
    expect(factory.selected).toBe(false)
    expect(selectedUnits).toEqual([clickedUnit])
    expect(gameState.attackGroupTargets).toEqual([])
    expect(playSound).toHaveBeenCalledWith('unitSelection')
  })

  it('supports shift-click toggling without double click', () => {
    const clickedUnit = { id: 'u1', owner: 'player', health: 10, selected: true }
    const selectedUnits = [clickedUnit]

    manager.handleUnitSelection(clickedUnit, { shiftKey: true }, [clickedUnit], [], selectedUnits)

    expect(clickedUnit.selected).toBe(false)
    expect(selectedUnits).toEqual([])
    expect(playSound).toHaveBeenCalledWith('unitSelection')
  })

  it('double-click selects all visible units of the same type and owner', () => {
    const clickedUnit = { id: 'u1', type: 'tank', owner: 'player', x: 10, y: 10, health: 10, selected: false }
    const visibleUnit = { id: 'u2', type: 'tank', owner: 'player', x: 40, y: 20, health: 10, selected: false }
    const offscreenUnit = { id: 'u3', type: 'tank', owner: 'player', x: 300, y: 300, health: 10, selected: true }
    const otherOwner = { id: 'u4', type: 'tank', owner: 'enemy', x: 20, y: 20, health: 10, selected: false }
    const units = [clickedUnit, visibleUnit, offscreenUnit, otherOwner]
    const factory = { id: 'f1', selected: true }
    const selectedUnits = [offscreenUnit]

    manager.lastClickedUnit = clickedUnit
    manager.lastClickTime = 1000
    vi.spyOn(performance, 'now').mockReturnValue(1100)

    manager.handleUnitSelection(clickedUnit, { shiftKey: false }, units, [factory], selectedUnits)

    expect(selectedUnits).toEqual([clickedUnit, visibleUnit])
    expect(offscreenUnit.selected).toBe(false)
    expect(factory.selected).toBe(false)
    expect(gameState.attackGroupTargets).toEqual([])
    expect(showNotification).toHaveBeenCalledWith('Selected 2 tank(s)')
    expect(playSound).toHaveBeenCalledWith('unitSelection')
    expect(getPlayableViewportWidth).toHaveBeenCalled()
    expect(getPlayableViewportHeight).toHaveBeenCalled()
    expect(getElementByIdSpy).toHaveBeenCalledWith('gameCanvas')
  })

  it('shift-double-click adds visible units of the same type to selection', () => {
    const clickedUnit = { id: 'u1', type: 'tank', owner: 'player', x: 10, y: 10, health: 10, selected: true }
    const newUnit = { id: 'u2', type: 'tank', owner: 'player', x: 30, y: 20, health: 10, selected: false }
    const units = [clickedUnit, newUnit]
    const selectedUnits = [clickedUnit]

    manager.lastClickedUnit = clickedUnit
    manager.lastClickTime = 2000
    vi.spyOn(performance, 'now').mockReturnValue(2100)

    manager.handleUnitSelection(clickedUnit, { shiftKey: true }, units, [], selectedUnits)

    expect(selectedUnits).toEqual([clickedUnit, newUnit])
    expect(newUnit.selected).toBe(true)
    expect(showNotification).toHaveBeenCalledWith('Added 2 tank(s) to selection')
    expect(playSound).toHaveBeenCalledWith('unitSelection')
  })

  it('handles factory selection by clearing units and other factories', () => {
    const selectedFactory = { id: 'f1', selected: false }
    const otherFactory = { id: 'f2', selected: true }
    gameState.factories = [selectedFactory, otherFactory]
    const unit = { id: 'u1', owner: 'player', health: 10, selected: true }
    const selectedUnits = [unit]

    manager.handleFactorySelection(selectedFactory, { shiftKey: false }, [unit], selectedUnits)

    expect(unit.selected).toBe(false)
    expect(selectedFactory.selected).toBe(true)
    expect(otherFactory.selected).toBe(false)
    expect(selectedUnits).toEqual([selectedFactory])
    expect(gameState.attackGroupTargets).toEqual([])
  })

  it('supports shift-click toggling for factories', () => {
    const selectedFactory = { id: 'f1', selected: false }
    const selectedUnits = []

    manager.handleFactorySelection(selectedFactory, { shiftKey: true }, [], selectedUnits)

    expect(selectedFactory.selected).toBe(true)
    expect(selectedUnits).toEqual([selectedFactory])
  })

  it('handles building selection by clearing units, factories, and other buildings', () => {
    const selectedBuilding = { id: 'b1', selected: false }
    const otherBuilding = { id: 'b2', selected: true }
    gameState.buildings = [selectedBuilding, otherBuilding]
    gameState.factories = [{ id: 'f1', selected: true }]
    const unit = { id: 'u1', owner: 'player', health: 10, selected: true }
    const selectedUnits = [unit]

    manager.handleBuildingSelection(selectedBuilding, { shiftKey: false }, [unit], selectedUnits)

    expect(unit.selected).toBe(false)
    expect(selectedBuilding.selected).toBe(true)
    expect(otherBuilding.selected).toBe(false)
    expect(gameState.factories[0].selected).toBe(false)
    expect(selectedUnits).toEqual([selectedBuilding])
    expect(gameState.attackGroupTargets).toEqual([])
  })

  it('supports shift-click toggling for buildings', () => {
    const selectedBuilding = { id: 'b1', selected: false }
    const selectedUnits = []

    manager.handleBuildingSelection(selectedBuilding, { shiftKey: true }, [], selectedUnits)

    expect(selectedBuilding.selected).toBe(true)
    expect(selectedUnits).toEqual([selectedBuilding])
  })

  it('selects units inside a drag selection box and clears buildings', () => {
    const unitInBox = { id: 'u1', owner: 'player', x: 10, y: 10, health: 10, selected: false }
    const unitOutBox = { id: 'u2', owner: 'player', x: 200, y: 200, health: 10, selected: true }
    const units = [unitInBox, unitOutBox]
    const factories = [{ id: 'f1', selected: true }]
    const selectedUnits = [unitOutBox]
    gameState.buildings = [{ id: 'b1', selected: true }]

    manager.handleBoundingBoxSelection(units, factories, selectedUnits, { x: 0, y: 0 }, { x: 50, y: 50 })

    expect(unitInBox.selected).toBe(true)
    expect(unitOutBox.selected).toBe(false)
    expect(selectedUnits).toEqual([unitInBox])
    expect(factories[0].selected).toBe(false)
    expect(gameState.buildings[0].selected).toBe(false)
    expect(gameState.attackGroupTargets).toEqual([])
    expect(playSound).toHaveBeenCalledWith('unitSelection')
  })

  it('resets selection state on drag selection errors', () => {
    const selectedUnits = [{ id: 'u1', health: 10 }]

    manager.handleBoundingBoxSelection([], [], selectedUnits, null, null)

    expect(selectedUnits).toEqual([])
  })

  it('filters visible units by type, owner, and viewport bounds', () => {
    const units = [
      { id: 'u1', type: 'tank', owner: 'player', x: 10, y: 10, health: 10 },
      { id: 'u2', type: 'tank', owner: 'enemy', x: 10, y: 10, health: 10 },
      { id: 'u3', type: 'tank', owner: 'player', x: 200, y: 200, health: 10 },
      { id: 'u4', type: 'jeep', owner: 'player', x: 10, y: 10, health: 10 }
    ]

    const visible = manager.getVisibleUnitsOfType('tank', units, { x: 0, y: 0 }, 100, 100, 'player')

    expect(visible).toHaveLength(1)
    expect(visible[0].id).toBe('u1')
  })

  it('selectAllOfType updates selections and returns the count', () => {
    const units = [
      { id: 'u1', type: 'tank', owner: 'player', health: 10, selected: true },
      { id: 'u2', type: 'tank', owner: 'player', health: 10, selected: false },
      { id: 'u3', type: 'jeep', owner: 'player', health: 10, selected: true }
    ]
    const selectedUnits = [units[0], units[2]]

    const count = manager.selectAllOfType('tank', units, selectedUnits, 'player')

    expect(count).toBe(2)
    expect(selectedUnits).toEqual([units[0], units[1]])
    expect(units[2].selected).toBe(false)
  })

  it('cleanupDestroyedSelectedUnits removes invalid or destroyed units safely', () => {
    const alive = { id: 'u1', health: 10 }
    const dead = { id: 'u2', health: 0 }
    const selectedUnits = [alive, dead, null]

    manager.cleanupDestroyedSelectedUnits(selectedUnits)

    expect(selectedUnits).toEqual([alive])
  })
})
