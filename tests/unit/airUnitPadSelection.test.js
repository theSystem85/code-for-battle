import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn(),
  playPositionalSound: vi.fn()
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/main.js', () => ({
  units: []
}))

import { TILE_SIZE } from '../../src/config.js'
import { gameState } from '../../src/gameState.js'
import { handleLeftMouseUp } from '../../src/input/mouseSelection.js'
import { getUnitSelectionCenter, SelectionManager } from '../../src/input/selectionManager.js'
import { getNavalRenderLengthTiles } from '../../src/utils/navalUtils.js'
import { resetGameState } from '../testUtils.js'

const CARRIER_RADIUS = TILE_SIZE * Math.max(0.65, getNavalRenderLengthTiles('aircraftCarrier') / 2)

function building(partial) {
  return {
    owner: 'player1',
    health: 400,
    selected: false,
    ...partial
  }
}

function airUnit(partial) {
  return {
    owner: 'player1',
    health: 100,
    selected: false,
    isAirUnit: true,
    altitude: 0,
    x: 0,
    y: 0,
    ...partial
  }
}

describe('air unit selection over pads', () => {
  let handler
  let selectionManager
  let unitCommands

  beforeEach(() => {
    resetGameState()
    gameState.humanPlayer = 'player1'
    gameState.repairMode = false
    gameState.sellMode = false
    gameState.buildingPlacementMode = false
    gameState.altKeyDown = false
    gameState.shiftKeyDown = false
    selectionManager = new SelectionManager()
    unitCommands = {
      handleApacheHelipadCommand: vi.fn(),
      handleLandingSpotCommand: vi.fn(() => true)
    }
    handler = {
      wasDragging: false,
      forceAttackClick: false,
      guardClick: false,
      isRecoveryTankInteraction: false,
      utilityQueueCandidate: false,
      isSelecting: false,
      attackGroupHandler: {
        isAttackGroupSelecting: false,
        hasSelectedCombatUnits: false,
        potentialAttackGroupStart: { x: 0, y: 0 },
        updateAGFCapability: vi.fn()
      },
      updateAGFCapability: vi.fn(),
      handleStandardCommands: vi.fn()
    }
  })

  function click(worldX, worldY, units, selectedUnits, detail = 1) {
    handler.wasDragging = false
    handleLeftMouseUp(handler, {
      clientX: worldX,
      clientY: worldY,
      detail,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      button: 0,
      target: {
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 })
      },
      stopPropagation: vi.fn(),
      preventDefault: vi.fn()
    }, units, [], [], selectedUnits, selectionManager, unitCommands, { updateCustomCursor: vi.fn() })
  }

  function clickUnit(unit, units, selectedUnits, detail = 1) {
    const center = getUnitSelectionCenter(unit)
    click(center.centerX, center.centerY, units, selectedUnits, detail)
    return center
  }

  function expectPointOnBuilding(pad, x, y) {
    expect(x).toBeGreaterThanOrEqual(pad.x * TILE_SIZE)
    expect(x).toBeLessThan((pad.x + pad.width) * TILE_SIZE)
    expect(y).toBeGreaterThanOrEqual(pad.y * TILE_SIZE)
    expect(y).toBeLessThan((pad.y + pad.height) * TILE_SIZE)
  }

  it('[U06560] selects an apache on a helipad instead of the helipad', () => {
    const helipad = building({ id: 'pad', type: 'helipad', x: 2, y: 2, width: 2, height: 2 })
    const apache = airUnit({ id: 'apache', type: 'apache', x: 2 * TILE_SIZE, y: 2 * TILE_SIZE })
    gameState.buildings = [helipad]
    const selectedUnits = []
    const center = clickUnit(apache, [apache], selectedUnits)

    expectPointOnBuilding(helipad, center.centerX, center.centerY)
    expect(selectedUnits).toEqual([apache])
    expect(apache.selected).toBe(true)
    expect(helipad.selected).toBe(false)
  })

  it('[U06561] selects an F-22 parked on an airstrip instead of the airstrip', () => {
    const airstrip = building({ id: 'strip', type: 'airstrip', x: 0, y: 0, width: 12, height: 6 })
    const f22 = airUnit({ id: 'f22', type: 'f22Raptor', x: 40, y: 40 })
    gameState.buildings = [airstrip]
    const selectedUnits = []
    const center = clickUnit(f22, [f22], selectedUnits)

    expectPointOnBuilding(airstrip, center.centerX, center.centerY)
    expect(selectedUnits).toEqual([f22])
    expect(f22.selected).toBe(true)
    expect(airstrip.selected).toBe(false)
  })

  it('[U06562] selects a hovering F-35 by its lifted center and leaves the strip selectable beside it', () => {
    const airstrip = building({ id: 'strip', type: 'airstrip', x: 0, y: 0, width: 12, height: 6 })
    const f35 = airUnit({ id: 'f35', type: 'f35', x: 80, y: 80, altitude: 50 })
    gameState.buildings = [airstrip]
    const selectedUnits = []
    const center = clickUnit(f35, [f35], selectedUnits)

    expect(center.centerY).toBe(f35.y + TILE_SIZE / 2 - 20)
    expectPointOnBuilding(airstrip, center.centerX, center.centerY)
    expect(selectedUnits).toEqual([f35])
    expect(airstrip.selected).toBe(false)

    const besideJet = []
    click(300, 100, [f35], besideJet)
    expect(besideJet).toEqual([airstrip])
    expect(airstrip.selected).toBe(true)
    expect(f35.selected).toBe(false)
  })

  it('[U06563] selects aircraft on a carrier even when the carrier is the earlier hit', () => {
    const carrier = {
      id: 'carrier',
      type: 'aircraftCarrier',
      owner: 'player1',
      health: 1000,
      selected: false,
      isNaval: true,
      x: 0,
      y: 0
    }
    const f35 = airUnit({ id: 'deck-f35', type: 'f35', x: 100, y: 0 })
    const apache = airUnit({ id: 'deck-apache', type: 'apache', x: 100, y: 48 })
    const units = [carrier, f35, apache]
    const selectedUnits = []
    const center = clickUnit(f35, units, selectedUnits)
    const carrierCenter = getUnitSelectionCenter(carrier)

    expect(Math.hypot(center.centerX - carrierCenter.centerX, center.centerY - carrierCenter.centerY)).toBeLessThan(CARRIER_RADIUS)
    expect(selectedUnits).toEqual([f35])
    expect(f35.selected).toBe(true)
    expect(carrier.selected).toBe(false)

    const apacheSelection = []
    clickUnit(apache, units, apacheSelection)
    expect(apacheSelection).toEqual([apache])
    expect(carrier.selected).toBe(false)

    const tanker = {
      id: 'tank',
      type: 'tank_v1',
      owner: 'player1',
      health: 100,
      selected: true,
      x: 800,
      y: 800
    }
    const withTankSelected = [tanker]
    clickUnit(f35, [carrier, f35, apache, tanker], withTankSelected)
    expect(withTankSelected).toEqual([f35])
    expect(f35.selected).toBe(true)
    expect(carrier.selected).toBe(false)
    expect(tanker.selected).toBe(false)
  })

  it('[U06564] still selects an empty helipad, airstrip, or carrier deck', () => {
    const helipad = building({ id: 'pad', type: 'helipad', x: 2, y: 2, width: 2, height: 2 })
    const apache = airUnit({ id: 'apache', type: 'apache', x: 2 * TILE_SIZE, y: 2 * TILE_SIZE })
    gameState.buildings = [helipad]
    const padSelection = []
    click(110, 110, [apache], padSelection)
    expect(Math.hypot(110 - (apache.x + TILE_SIZE / 2), 110 - (apache.y + TILE_SIZE / 2))).toBeGreaterThan(TILE_SIZE / 2)
    expect(padSelection).toEqual([helipad])
    expect(apache.selected).toBe(false)

    const airstrip = building({ id: 'strip', type: 'airstrip', x: 0, y: 0, width: 12, height: 6 })
    const f22 = airUnit({ id: 'f22', type: 'f22Raptor', x: 40, y: 40 })
    gameState.buildings = [airstrip]
    const stripSelection = []
    click(300, 100, [f22], stripSelection)
    expect(stripSelection).toEqual([airstrip])
    expect(f22.selected).toBe(false)

    const carrier = {
      id: 'carrier',
      type: 'aircraftCarrier',
      owner: 'player1',
      health: 1000,
      selected: false,
      isNaval: true,
      x: 0,
      y: 0
    }
    const deckJet = airUnit({ id: 'deck-jet', type: 'f22Raptor', x: 100, y: 0 })
    gameState.buildings = []
    const deckSelection = []
    click(TILE_SIZE / 2, TILE_SIZE / 2, [carrier, deckJet], deckSelection)
    expect(deckSelection).toEqual([carrier])
    expect(deckJet.selected).toBe(false)
  })

  it('[U06565] selects stacked aircraft from a touch tap', () => {
    const helipad = building({ id: 'pad', type: 'helipad', x: 4, y: 4, width: 2, height: 2 })
    const apache = airUnit({ id: 'apache', type: 'apache', x: 4 * TILE_SIZE, y: 4 * TILE_SIZE })
    const carrier = {
      id: 'carrier',
      type: 'aircraftCarrier',
      owner: 'player1',
      health: 1000,
      selected: false,
      isNaval: true,
      x: 400,
      y: 0
    }
    const f22 = airUnit({ id: 'f22', type: 'f22Raptor', x: 500, y: 0 })
    gameState.buildings = [helipad]
    const padSelection = []
    clickUnit(apache, [apache, carrier, f22], padSelection, 0)
    expect(padSelection).toEqual([apache])
    expect(helipad.selected).toBe(false)

    gameState.buildings = []
    const deckSelection = []
    clickUnit(f22, [carrier, f22], deckSelection, 0)
    expect(deckSelection).toEqual([f22])
    expect(carrier.selected).toBe(false)
  })

  it('[U06566] keeps a single click on one stacked aircraft from selecting every aircraft of that type', () => {
    const airstrip = building({ id: 'strip', type: 'airstrip', x: 0, y: 0, width: 12, height: 6 })
    const first = airUnit({ id: 'apache-1', type: 'apache', x: 32, y: 32 })
    const second = airUnit({ id: 'apache-2', type: 'apache', x: 160, y: 32 })
    gameState.buildings = [airstrip]
    const selectedUnits = []
    const units = [first, second]
    clickUnit(first, units, selectedUnits, 1)
    clickUnit(first, units, selectedUnits, 1)

    expect(selectedUnits).toEqual([first])
    expect(first.selected).toBe(true)
    expect(second.selected).toBe(false)
  })

  it('[U06567] leaves ordinary ground and non-pad building picks unchanged', () => {
    const helipad = building({ id: 'pad', type: 'helipad', x: 2, y: 2, width: 2, height: 2 })
    const plant = building({ id: 'plant', type: 'powerPlant', x: 30, y: 30, width: 3, height: 3 })
    const tank = {
      id: 'tank',
      type: 'tank_v1',
      owner: 'player1',
      health: 100,
      selected: false,
      x: 500,
      y: 500
    }
    const apache = airUnit({ id: 'apache', type: 'apache', x: 30 * TILE_SIZE, y: 30 * TILE_SIZE })
    const f22 = airUnit({ id: 'f22', type: 'f22Raptor', x: 30 * TILE_SIZE, y: 30 * TILE_SIZE })
    gameState.buildings = [helipad, plant]

    const tankSelection = []
    clickUnit(tank, [tank], tankSelection)
    expect(tankSelection).toEqual([tank])
    expect(helipad.selected).toBe(false)
    expect(plant.selected).toBe(false)

    const apacheSelection = []
    const apacheCenter = clickUnit(apache, [apache], apacheSelection)
    expectPointOnBuilding(plant, apacheCenter.centerX, apacheCenter.centerY)
    expect(apacheSelection).toEqual([plant])
    expect(apache.selected).toBe(false)

    plant.selected = false
    const f22Selection = []
    clickUnit(f22, [f22], f22Selection)
    expect(f22Selection).toEqual([f22])
    expect(plant.selected).toBe(false)
  })

  it('[U06568] selects a parked aircraft when another aircraft is already selected, and still lands on empty pad', () => {
    const helipad = building({ id: 'pad', type: 'helipad', x: 8, y: 8, width: 2, height: 2 })
    const flying = airUnit({ id: 'flying', type: 'apache', x: 0, y: 0, selected: true })
    const parked = airUnit({ id: 'parked', type: 'apache', x: 8 * TILE_SIZE, y: 8 * TILE_SIZE })
    gameState.buildings = [helipad]
    const selectedUnits = [flying]
    clickUnit(parked, [flying, parked], selectedUnits)

    expect(unitCommands.handleApacheHelipadCommand).not.toHaveBeenCalled()
    expect(unitCommands.handleLandingSpotCommand).not.toHaveBeenCalled()
    expect(selectedUnits).toEqual([parked])
    expect(parked.selected).toBe(true)
    expect(flying.selected).toBe(false)
    expect(helipad.selected).toBe(false)

    const landingSelection = [flying]
    flying.selected = true
    click(8 * TILE_SIZE + 28, 8 * TILE_SIZE + 28, [flying], landingSelection)
    expect(unitCommands.handleLandingSpotCommand).toHaveBeenCalledExactlyOnceWith(
      [flying], expect.objectContaining({ structure: helipad, index: 0 }), [flying]
    )
    expect(unitCommands.handleApacheHelipadCommand).not.toHaveBeenCalled()
    expect(landingSelection).toEqual([flying])
    expect(helipad.selected).toBe(false)
  })

  it('[U06569] selects the pad when the aircraft on it is destroyed or embarked', () => {
    const helipad = building({ id: 'pad', type: 'helipad', x: 2, y: 2, width: 2, height: 2 })
    const wrecked = airUnit({ id: 'wrecked', type: 'apache', x: 2 * TILE_SIZE, y: 2 * TILE_SIZE, health: 0 })
    const embarked = airUnit({
      id: 'embarked',
      type: 'f35',
      x: 2 * TILE_SIZE,
      y: 2 * TILE_SIZE,
      embarkedOnId: 'transport'
    })
    gameState.buildings = [helipad]
    const selectedUnits = []
    clickUnit(wrecked, [wrecked, embarked], selectedUnits)

    expect(selectedUnits).toEqual([helipad])
    expect(wrecked.selected).toBe(false)
    expect(embarked.selected).toBe(false)
  })

  it('[U06570] selects an enemy aircraft stacked on an enemy helipad', () => {
    const helipad = building({ id: 'enemy-pad', type: 'helipad', x: 6, y: 6, width: 2, height: 2, owner: 'player2' })
    const apache = airUnit({
      id: 'enemy-apache',
      type: 'apache',
      owner: 'player2',
      x: 6 * TILE_SIZE,
      y: 6 * TILE_SIZE
    })
    gameState.buildings = [helipad]
    const selectedUnits = []
    clickUnit(apache, [apache], selectedUnits)

    expect(selectedUnits).toEqual([apache])
    expect(apache.selected).toBe(true)
    expect(helipad.selected).toBe(false)
  })
})
