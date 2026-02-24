import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn(),
  playPositionalSound: vi.fn()
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/utils/inputUtils.js', () => ({
  isForceAttackModifierActive: vi.fn(() => false),
  isGuardModifierActive: vi.fn(() => false)
}))

vi.mock('../../src/game/unitWreckManager.js', () => ({
  findWreckAtTile: vi.fn()
}))

vi.mock('../../src/game/waypointSounds.js', () => ({
  markWaypointsAdded: vi.fn()
}))

vi.mock('../../src/behaviours/retreat.js', () => ({
  initiateRetreat: vi.fn()
}))

vi.mock('../../src/game/remoteControl.js', () => ({
  suspendRemoteControlAutoFocus: vi.fn()
}))

vi.mock('../../src/benchmark/benchmarkTracker.js', () => ({
  notifyBenchmarkManualCameraControl: vi.fn()
}))

vi.mock('../../src/input/attackGroupHandler.js', () => ({
  AttackGroupHandler: class {
    constructor() {
      this.isAttackGroupSelecting = false
      this.attackGroupWasDragging = false
      this.potentialAttackGroupStart = { x: 0, y: 0 }
      this.hasSelectedCombatUnits = false
      this.attackGroupStartWorld = null
    }

    shouldStartAttackGroupMode() {
      return false
    }

    handleMouseUp() {}

    updateAGFCapability() {}
  }
}))

vi.mock('../../src/input/keybindings.js', () => ({
  keybindingManager: {
    matchesPointerAction: vi.fn(() => false)
  },
  KEYBINDING_CONTEXTS: {
    MAP_EDIT_ON: 'map-edit-on',
    MAP_EDIT_OFF: 'map-edit-off'
  }
}))

vi.mock('../../src/input/mineInputHandler.js', () => ({
  hasMineLayerSelected: vi.fn(() => false),
  hasMineSweeperSelected: vi.fn(() => false),
  handleMineLayerClick: vi.fn(),
  handleMineLayerAreaDeploy: vi.fn(),
  handleMineSweeperRectangleSweep: vi.fn(),
  handleMineSweeperFreeformSweep: vi.fn()
}))

vi.mock('../../src/mapEditor.js', () => ({
  handlePointerDown: vi.fn(),
  handlePointerMove: vi.fn(),
  handlePointerUp: vi.fn(),
  pipetteTile: vi.fn()
}))

vi.mock('../../src/ui/mapEditorControls.js', () => ({
  notifyMapEditorWheel: vi.fn()
}))

vi.mock('../../src/main.js', () => ({
  units: []
}))

vi.mock('../../src/inputHandler.js', () => ({
  selectedUnits: [],
  selectionActive: false,
  selectionStartExport: { x: 0, y: 0 },
  selectionEndExport: { x: 0, y: 0 },
  setRenderScheduler: vi.fn(),
  setupInputHandling: vi.fn(),
  getUnitCommandsHandler: vi.fn(),
  getCursorManager: vi.fn(),
  getMouseHandler: vi.fn(),
  getSelectionManager: vi.fn()
}))

import { MouseHandler } from '../../src/input/mouseHandler.js'
import {
  isRallyPointTileBlocked,
  isUtilityUnit,
  shouldStartUtilityQueueMode,
  createSyntheticMouseEvent,
  createSyntheticMouseEventFromCoords,
  getTouchCenter,
  handleContextMenu,
  updateAGFCapability,
  isOverRecoveryTankAt,
  isOverDamagedUnitAt,
  findEnemyTarget,
  selectWreck
} from '../../src/input/mouseHandler.js'
import { gameState } from '../../src/gameState.js'
import { TILE_SIZE, TANK_FIRE_RANGE } from '../../src/config.js'
import { GAME_DEFAULT_CURSOR } from '../../src/input/cursorStyles.js'
import { createTestMapGrid, resetGameState } from '../testUtils.js'
import { playSound } from '../../src/sound.js'
import { showNotification } from '../../src/ui/notifications.js'
import { findWreckAtTile } from '../../src/game/unitWreckManager.js'

const createCursorManager = () => ({
  setIsOverEnemy: vi.fn(),
  setIsOverFriendlyUnit: vi.fn(),
  setIsOverEnemyInRange: vi.fn(),
  setIsOverEnemyOutOfRange: vi.fn(),
  setRangeCursorInfo: vi.fn(),
  setIsInArtilleryRange: vi.fn(),
  setIsOutOfArtilleryRange: vi.fn()
})

describe('MouseHandler', () => {
  let originalState

  beforeEach(() => {
    originalState = {
      buildings: gameState.buildings,
      unitWrecks: gameState.unitWrecks,
      occupancyMap: gameState.occupancyMap,
      humanPlayer: gameState.humanPlayer,
      selectedUnits: gameState.selectedUnits,
      mapGrid: gameState.mapGrid,
      repairMode: gameState.repairMode,
      sellMode: gameState.sellMode,
      scrollOffset: gameState.scrollOffset,
      attackGroupMode: gameState.attackGroupMode,
      disableAGFRendering: gameState.disableAGFRendering
    }

    resetGameState()
    gameState.humanPlayer = 'player'
    gameState.selectedUnits = []
    gameState.occupancyMap = []
    gameState.unitWrecks = []
    gameState.buildings = []
  })

  afterEach(() => {
    gameState.buildings = originalState.buildings
    gameState.unitWrecks = originalState.unitWrecks
    gameState.occupancyMap = originalState.occupancyMap
    gameState.humanPlayer = originalState.humanPlayer
    gameState.selectedUnits = originalState.selectedUnits
    gameState.mapGrid = originalState.mapGrid
    gameState.repairMode = originalState.repairMode
    gameState.sellMode = originalState.sellMode
    gameState.scrollOffset = originalState.scrollOffset
    gameState.attackGroupMode = originalState.attackGroupMode
    gameState.disableAGFRendering = originalState.disableAGFRendering
  })

  it('detects blocked rally point tiles based on occupancy bounds', () => {
    const _handler = new MouseHandler()

    expect(isRallyPointTileBlocked(1, 1)).toBe(false)

    gameState.occupancyMap = [[0, 0], [0, 1]]

    expect(isRallyPointTileBlocked(5, 0)).toBe(true)
    expect(isRallyPointTileBlocked(0, 5)).toBe(true)
    expect(isRallyPointTileBlocked(1, 1)).toBe(true)
    expect(isRallyPointTileBlocked(0, 0)).toBe(false)
  })

  it('identifies utility units and queue eligibility', () => {
    const _handler = new MouseHandler()

    expect(isUtilityUnit(null)).toBe(false)
    expect(isUtilityUnit({ isUtilityUnit: true })).toBe(true)
    expect(isUtilityUnit({ type: 'ambulance' })).toBe(true)
    expect(isUtilityUnit({ type: 'tank' })).toBe(false)

    expect(shouldStartUtilityQueueMode([{ type: 'tank' }])).toBe(false)
    expect(shouldStartUtilityQueueMode([{ type: 'tankerTruck' }])).toBe(true)
  })

  it('queues utility targets within a drag selection', () => {
    const handler = new MouseHandler()
    const mapGrid = createTestMapGrid(5, 5)

    handler.selectionStart = { x: 0, y: 0 }
    handler.selectionEnd = { x: TILE_SIZE * 3, y: TILE_SIZE * 3 }

    const selectedUnits = [
      { id: 'amb-1', type: 'ambulance', owner: 'player' },
      { id: 'tank-1', type: 'tankerTruck', owner: 'player' },
      { id: 'ammo-1', type: 'ammunitionTruck', owner: 'player' },
      { id: 'rec-1', type: 'recoveryTank', owner: 'player' }
    ]

    const targetUnit = {
      id: 'target-1',
      type: 'tank',
      owner: 'player',
      x: TILE_SIZE,
      y: TILE_SIZE,
      health: 60,
      maxHealth: 100,
      maxGas: 100,
      gas: 40,
      maxAmmunition: 12,
      ammunition: 5,
      crew: { driver: false, commander: true }
    }

    const wreck = {
      id: 'wreck-1',
      x: TILE_SIZE * 2,
      y: TILE_SIZE * 2
    }

    gameState.unitWrecks = [wreck]

    const unitCommands = {
      queueUtilityTargets: vi.fn(() => true)
    }

    const selectionManager = {
      isHumanPlayerUnit: () => true
    }

    const didQueue = handler.processUtilityQueueSelection(
      [...selectedUnits, targetUnit],
      mapGrid,
      selectedUnits,
      selectionManager,
      unitCommands
    )

    expect(didQueue).toBe(true)
    expect(unitCommands.queueUtilityTargets).toHaveBeenCalledTimes(4)
    expect(unitCommands.queueUtilityTargets).toHaveBeenCalledWith(
      [selectedUnits[0]],
      [targetUnit],
      'heal',
      mapGrid
    )
    expect(unitCommands.queueUtilityTargets).toHaveBeenCalledWith(
      [selectedUnits[1]],
      [targetUnit],
      'refuel',
      mapGrid
    )
    expect(unitCommands.queueUtilityTargets).toHaveBeenCalledWith(
      [selectedUnits[2]],
      [targetUnit],
      'ammoResupply',
      mapGrid
    )
    expect(unitCommands.queueUtilityTargets).toHaveBeenCalledWith(
      [selectedUnits[3]],
      expect.arrayContaining([
        targetUnit,
        expect.objectContaining({
          id: 'wreck-1',
          isWreckTarget: true,
          queueAction: 'tow'
        })
      ]),
      'repair',
      mapGrid
    )
  })

  it('updates hover state with ranged combat info', () => {
    const _handler = new MouseHandler()
    const cursorManager = createCursorManager()
    const friendlyTank = {
      id: 'tank-1',
      type: 'tank',
      owner: 'player',
      x: 0,
      y: 0,
      level: 0
    }
    const enemyUnit = {
      id: 'enemy-1',
      type: 'tank',
      owner: 'enemy',
      x: TILE_SIZE,
      y: 0
    }
    const worldX = enemyUnit.x + TILE_SIZE / 2
    const worldY = enemyUnit.y + TILE_SIZE / 2

    _handler.updateEnemyHover(worldX, worldY, [enemyUnit], [], [friendlyTank], cursorManager)

    expect(cursorManager.setIsOverEnemy).toHaveBeenCalledWith(true)
    expect(cursorManager.setIsOverFriendlyUnit).toHaveBeenCalledWith(false)
    expect(cursorManager.setIsOverEnemyInRange).toHaveBeenCalledWith(true)
    expect(cursorManager.setIsOverEnemyOutOfRange).toHaveBeenCalledWith(false)
    expect(cursorManager.setRangeCursorInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRange: TANK_FIRE_RANGE * TILE_SIZE
      })
    )
    expect(cursorManager.setIsInArtilleryRange).toHaveBeenCalledWith(false)
    expect(cursorManager.setIsOutOfArtilleryRange).toHaveBeenCalledWith(false)
  })

  it('clears hover state when no units are selected', () => {
    const _handler = new MouseHandler()
    const cursorManager = createCursorManager()

    _handler.updateEnemyHover(0, 0, [], [], [], cursorManager)

    expect(cursorManager.setIsOverEnemy).toHaveBeenCalledWith(false)
    expect(cursorManager.setIsOverFriendlyUnit).toHaveBeenCalledWith(false)
    expect(cursorManager.setIsOverEnemyInRange).toHaveBeenCalledWith(false)
    expect(cursorManager.setIsOverEnemyOutOfRange).toHaveBeenCalledWith(false)
    expect(cursorManager.setRangeCursorInfo).toHaveBeenCalledWith(null)
  })

  it('issues force attack for building defenders and ground targets', () => {
    const _handler = new MouseHandler()
    const selectionManager = {
      isCommandableUnit: () => true,
      isHumanPlayerBuilding: b => b?.owner === 'player',
      isHumanPlayerUnit: u => u?.owner === 'player',
      clearWreckSelection: vi.fn()
    }
    const unitCommands = {
      handleAttackCommand: vi.fn()
    }
    const mapGrid = createTestMapGrid(5, 5)

    const defender = {
      id: 'turret-1',
      type: 'artilleryTurret',
      owner: 'player',
      isBuilding: true,
      holdFire: true
    }

    gameState.buildings = [
      {
        id: 'b1',
        type: 'turret',
        owner: 'enemy',
        x: 0,
        y: 0,
        width: 1,
        height: 1
      }
    ]

    const handledBuilding = _handler.handleForceAttackCommand(
      TILE_SIZE / 2,
      TILE_SIZE / 2,
      [],
      [defender],
      unitCommands,
      mapGrid,
      selectionManager
    )

    expect(handledBuilding).toBe(true)
    expect(defender.forcedAttack).toBe(true)
    expect(defender.holdFire).toBe(false)
    expect(defender.forcedAttackTarget).toBe(gameState.buildings[0])
    expect(unitCommands.handleAttackCommand).not.toHaveBeenCalled()

    gameState.buildings = []
    findWreckAtTile.mockReturnValue(null)

    const attacker = {
      id: 'unit-1',
      type: 'tank',
      owner: 'player',
      isBuilding: false
    }

    const handledGround = _handler.handleForceAttackCommand(
      TILE_SIZE * 2,
      TILE_SIZE * 3,
      [],
      [attacker],
      unitCommands,
      mapGrid,
      selectionManager
    )

    expect(handledGround).toBe(true)
    expect(attacker.forcedAttack).toBe(true)
    expect(unitCommands.handleAttackCommand).toHaveBeenCalledWith(
      [attacker],
      expect.objectContaining({
        isGroundTarget: true,
        tileX: 2,
        tileY: 3
      }),
      mapGrid,
      true
    )
  })

  it('assigns guard mode to friendly targets', () => {
    const _handler = new MouseHandler()
    const selectionManager = {
      isCommandableUnit: () => true,
      isHumanPlayerUnit: unit => unit.owner === 'player'
    }

    const guardUnit = {
      id: 'guard-1',
      type: 'tank',
      owner: 'player'
    }

    const ally = {
      id: 'ally-1',
      type: 'tank',
      owner: 'player',
      x: TILE_SIZE,
      y: TILE_SIZE
    }

    const worldX = ally.x + TILE_SIZE / 2
    const worldY = ally.y + TILE_SIZE / 2

    const handled = _handler.handleGuardCommand(
      worldX,
      worldY,
      [ally],
      [guardUnit],
      {},
      selectionManager,
      []
    )

    expect(handled).toBe(true)
    expect(guardUnit.guardTarget).toBe(ally)
    expect(guardUnit.guardMode).toBe(true)
    expect(playSound).toHaveBeenCalledWith('confirmed', 0.5)
  })


  it('does not issue move commands when only buildings are selected', () => {
    const _handler = new MouseHandler()
    const selectionManager = {
      isCommandableUnit: () => true
    }
    _handler.selectionManager = selectionManager

    const selectedBuilding = {
      id: 'building-1',
      type: 'powerPlant',
      owner: 'player',
      isBuilding: true
    }

    const unitCommands = {
      handleMovementCommand: vi.fn(),
      handleAttackCommand: vi.fn(),
      handleRefineryUnloadCommand: vi.fn(),
      handleRepairWorkshopCommand: vi.fn(),
      handleAmbulanceRefillCommand: vi.fn(),
      handleGasStationRefillCommand: vi.fn(),
      handleHarvesterCommand: vi.fn()
    }

    const mapGrid = createTestMapGrid(5, 5)

    _handler.handleStandardCommands(
      TILE_SIZE * 2,
      TILE_SIZE * 2,
      [selectedBuilding],
      unitCommands,
      mapGrid
    )

    expect(unitCommands.handleMovementCommand).not.toHaveBeenCalled()
    expect(unitCommands.handleAttackCommand).not.toHaveBeenCalled()
  })
  it('prioritizes refinery unload and ore harvesting commands', () => {
    const _handler = new MouseHandler()
    const selectionManager = {
      isCommandableUnit: () => true
    }
    _handler.selectionManager = selectionManager

    const harvester = {
      id: 'harvester-1',
      type: 'harvester',
      owner: 'player'
    }

    const unitCommands = {
      handleRefineryUnloadCommand: vi.fn(),
      handleHarvesterCommand: vi.fn()
    }

    const mapGrid = createTestMapGrid(5, 5)

    gameState.buildings = [
      {
        type: 'oreRefinery',
        owner: 'player',
        health: 100,
        x: 1,
        y: 1,
        width: 2,
        height: 2
      }
    ]

    _handler.handleStandardCommands(
      TILE_SIZE * 1.5,
      TILE_SIZE * 1.5,
      [harvester],
      unitCommands,
      mapGrid
    )

    expect(unitCommands.handleRefineryUnloadCommand).toHaveBeenCalled()

    unitCommands.handleRefineryUnloadCommand.mockClear()
    gameState.buildings = []
    mapGrid[2][2].ore = 1

    _handler.handleStandardCommands(
      TILE_SIZE * 2,
      TILE_SIZE * 2,
      [harvester],
      unitCommands,
      mapGrid
    )

    expect(unitCommands.handleHarvesterCommand).toHaveBeenCalledWith(
      [harvester],
      { x: 2, y: 2 },
      mapGrid
    )
  })

  it('creates synthetic mouse events from pointer data', () => {
    const _handler = new MouseHandler()
    const target = document.createElement('div')
    const event = {
      clientX: 10,
      clientY: 20,
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      altKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    }

    const synthetic = createSyntheticMouseEvent(event, target, 2)

    expect(synthetic.button).toBe(2)
    expect(synthetic.buttons).toBe(2)
    expect(synthetic.clientX).toBe(10)
    expect(synthetic.clientY).toBe(20)
    expect(synthetic.ctrlKey).toBe(true)
    expect(synthetic.shiftKey).toBe(true)
    expect(synthetic.target).toBe(target)
  })

  it('averages touch points for two-finger pan center', () => {
    const _handler = new MouseHandler()
    const activePointers = new Map()

    activePointers.set(1, { startX: 0, startY: 0, lastEvent: { clientX: 10, clientY: 10 } })
    activePointers.set(2, { startX: 20, startY: 20, lastEvent: null })

    const center = getTouchCenter([1, 2], activePointers)

    expect(center.x).toBe(15)
    expect(center.y).toBe(15)
  })

  it('getTouchCenter handles empty pointer array', () => {
    const _handler = new MouseHandler()
    const center = getTouchCenter([], new Map())
    expect(center).toEqual({ x: 0, y: 0 })
  })

  it('getTouchCenter handles missing pointer entry', () => {
    const _handler = new MouseHandler()
    const activePointers = new Map()
    activePointers.set(1, { startX: 10, startY: 20, lastEvent: null })

    const center = getTouchCenter([1, 999], activePointers)
    // Only pointer 1 contributes, divided by 2 still
    expect(center.x).toBe(5)
    expect(center.y).toBe(10)
  })

  it('createSyntheticMouseEventFromCoords creates event without modifier keys', () => {
    const _handler = new MouseHandler()
    const target = document.createElement('canvas')

    const event = createSyntheticMouseEventFromCoords(target, 100, 200, 0)

    expect(event.button).toBe(0)
    expect(event.buttons).toBe(1)
    expect(event.clientX).toBe(100)
    expect(event.clientY).toBe(200)
    expect(event.ctrlKey).toBe(false)
    expect(event.metaKey).toBe(false)
    expect(event.shiftKey).toBe(false)
    expect(event.altKey).toBe(false)
    expect(event.target).toBe(target)
    expect(typeof event.preventDefault).toBe('function')
    expect(typeof event.stopPropagation).toBe('function')
  })

  it('createSyntheticMouseEventFromCoords handles right-click button', () => {
    const _handler = new MouseHandler()
    const target = document.createElement('canvas')

    const event = createSyntheticMouseEventFromCoords(target, 50, 75, 2)

    expect(event.button).toBe(2)
    expect(event.buttons).toBe(2)
  })

  it('isOverRecoveryTankAt returns false when no game units', () => {
    const _handler = new MouseHandler()
    _handler.gameUnits = null
    expect(isOverRecoveryTankAt(_handler, 100, 100)).toBe(false)
  })

  it('isOverRecoveryTankAt detects recovery tank at tile position', () => {
    const _handler = new MouseHandler()
    gameState.humanPlayer = 'player'
    // Unit at pixel (32, 32) has unitTileX = floor((32 + 16)/32) = 1, unitTileY = 1
    _handler.gameUnits = [
      { type: 'recoveryTank', owner: 'player', x: TILE_SIZE, y: TILE_SIZE }
    ]
    // Mouse at worldX=48=1.5*32 gives tileX = floor(48/32) = 1
    expect(isOverRecoveryTankAt(_handler, TILE_SIZE * 1.5, TILE_SIZE * 1.5)).toBe(true)
    // Mouse at (0,0) gives tileX = 0, tileY = 0
    expect(isOverRecoveryTankAt(_handler, 0, 0)).toBe(false)
  })

  it('isOverRecoveryTankAt ignores enemy recovery tanks', () => {
    const _handler = new MouseHandler()
    gameState.humanPlayer = 'player'
    _handler.gameUnits = [
      { type: 'recoveryTank', owner: 'enemy', x: TILE_SIZE + TILE_SIZE / 2, y: TILE_SIZE + TILE_SIZE / 2 }
    ]

    expect(isOverRecoveryTankAt(_handler, TILE_SIZE * 1.5, TILE_SIZE * 1.5)).toBe(false)
  })

  it('isOverDamagedUnitAt returns false when no game units', () => {
    const _handler = new MouseHandler()
    _handler.gameUnits = null
    expect(isOverDamagedUnitAt(_handler, 100, 100, [])).toBe(false)
  })

  it('isOverDamagedUnitAt detects damaged unit at tile position', () => {
    const _handler = new MouseHandler()
    gameState.humanPlayer = 'player'
    const damagedUnit = {
      id: 'tank1',
      type: 'tank',
      owner: 'player',
      health: 50,
      maxHealth: 100,
      // Unit at pixel (32, 32) has unitTileX = floor((32 + 16)/32) = 1
      x: TILE_SIZE,
      y: TILE_SIZE
    }
    _handler.gameUnits = [damagedUnit]

    // Mouse at worldX=48 gives tileX = floor(48/32) = 1
    expect(isOverDamagedUnitAt(_handler, TILE_SIZE * 1.5, TILE_SIZE * 1.5, [])).toBe(true)
    // Returns false if unit is in selectedUnits
    expect(isOverDamagedUnitAt(_handler, TILE_SIZE * 1.5, TILE_SIZE * 1.5, [damagedUnit])).toBe(false)
  })

  it('isOverDamagedUnitAt ignores healthy units and recovery tanks', () => {
    const _handler = new MouseHandler()
    gameState.humanPlayer = 'player'
    _handler.gameUnits = [
      { type: 'tank', owner: 'player', health: 100, maxHealth: 100, x: TILE_SIZE / 2, y: TILE_SIZE / 2 },
      { type: 'recoveryTank', owner: 'player', health: 50, maxHealth: 100, x: TILE_SIZE * 1.5, y: TILE_SIZE / 2 }
    ]

    expect(isOverDamagedUnitAt(_handler, TILE_SIZE / 2, TILE_SIZE / 2, [])).toBe(false)
    expect(isOverDamagedUnitAt(_handler, TILE_SIZE * 1.5, TILE_SIZE / 2, [])).toBe(false)
  })

  it('setRenderScheduler stores the callback', () => {
    const _handler = new MouseHandler()
    const callback = vi.fn()

    _handler.setRenderScheduler(callback)

    expect(_handler.requestRenderFrame).toBe(callback)
  })

  it('updateAGFCapability delegates to attackGroupHandler', () => {
    const _handler = new MouseHandler()
    _handler.attackGroupHandler.updateAGFCapability = vi.fn()

    const selectedUnits = [{ id: 'u1', type: 'tank' }]
    updateAGFCapability(_handler, selectedUnits)

    expect(_handler.attackGroupHandler.updateAGFCapability).toHaveBeenCalledWith(selectedUnits)
  })

  it('selectWreck clears unit selections and sets selectedWreckId', () => {
    const _handler = new MouseHandler()
    const selectionManager = {
      clearAttackGroupTargets: vi.fn()
    }

    const selectedUnits = [
      { id: 'u1', selected: true },
      { id: 'u2', selected: true }
    ]
    const factories = [{ id: 'f1', selected: true }]
    gameState.buildings = [{ id: 'b1', selected: true }]
    gameState.selectedWreckId = null
    gameState.attackGroupMode = true
    gameState.disableAGFRendering = true

    const wreck = { id: 'wreck-123' }
    selectWreck(wreck, selectedUnits, factories, selectionManager)

    expect(selectedUnits.every(u => u.selected === false)).toBe(true)
    expect(selectedUnits).toHaveLength(0)
    expect(factories[0].selected).toBe(false)
    expect(gameState.buildings[0].selected).toBe(false)
    expect(selectionManager.clearAttackGroupTargets).toHaveBeenCalled()
    expect(gameState.selectedWreckId).toBe('wreck-123')
    expect(gameState.attackGroupMode).toBe(false)
    expect(gameState.disableAGFRendering).toBe(false)
  })

  it('selectWreck handles null inputs gracefully', () => {
    const _handler = new MouseHandler()
    // Should not throw
    selectWreck(null, [], [], null)
    selectWreck({ id: 'w1' }, [], null, null)
  })

  it('findEnemyTarget detects enemy buildings', () => {
    const _handler = new MouseHandler()
    _handler.gameFactories = []

    gameState.buildings = [
      {
        id: 'enemy-building',
        owner: 'enemy',
        x: 2,
        y: 2,
        width: 2,
        height: 2
      }
    ]

    const target = findEnemyTarget(TILE_SIZE * 2.5, TILE_SIZE * 2.5, [], [])
    expect(target).toBe(gameState.buildings[0])
  })

  it('findEnemyTarget detects enemy factories', () => {
    const _handler = new MouseHandler()
    _handler.gameFactories = [
      {
        id: 'enemy',
        x: 5,
        y: 5,
        width: 2,
        height: 2
      }
    ]

    gameState.buildings = []

    const target = findEnemyTarget(TILE_SIZE * 5.5, TILE_SIZE * 5.5, _handler.gameFactories, [])
    expect(target).toBe(_handler.gameFactories[0])
  })

  it('findEnemyTarget ignores player-owned buildings and factories', () => {
    const _handler = new MouseHandler()
    _handler.gameFactories = [
      {
        id: 'player',
        x: 5,
        y: 5,
        width: 2,
        height: 2
      }
    ]

    gameState.buildings = [
      {
        id: 'player-building',
        owner: 'player',
        x: 2,
        y: 2,
        width: 2,
        height: 2
      }
    ]

    const target = findEnemyTarget(TILE_SIZE * 2.5, TILE_SIZE * 2.5, _handler.gameFactories, [])
    expect(target).toBe(null)
  })

  it('cancels repair and sell modes on context menu', () => {
    const _handler = new MouseHandler()
    const gameCanvas = document.createElement('canvas')
    gameCanvas.classList.add('repair-mode', 'sell-mode')

    const repairBtn = document.createElement('button')
    repairBtn.id = 'repairBtn'
    repairBtn.classList.add('active')
    document.body.appendChild(repairBtn)

    const sellBtn = document.createElement('button')
    sellBtn.id = 'sellBtn'
    sellBtn.classList.add('active')
    document.body.appendChild(sellBtn)

    gameState.repairMode = true
    gameState.sellMode = true

    handleContextMenu({ preventDefault: vi.fn() }, gameCanvas)

    expect(gameState.repairMode).toBe(false)
    expect(gameState.sellMode).toBe(false)
    expect(repairBtn.classList.contains('active')).toBe(false)
    expect(sellBtn.classList.contains('active')).toBe(false)
    expect(gameCanvas.classList.contains('repair-mode')).toBe(false)
    expect(gameCanvas.classList.contains('sell-mode')).toBe(false)
    expect(gameCanvas.style.cursor).toBe(GAME_DEFAULT_CURSOR)
    expect(showNotification).toHaveBeenCalledWith('Action mode canceled')

    repairBtn.remove()
    sellBtn.remove()
  })
})
