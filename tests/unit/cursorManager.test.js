/**
 * Unit tests for cursorManager.js
 *
 * Focus on cursor styling, terrain checks, and range cursor UI updates.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock main.js to prevent import chain reaching benchmarkScenario.js
vi.mock('../../src/main.js', () => ({
  factories: [],
  units: [],
  bullets: [],
  mapGrid: [],
  getCurrentGame: vi.fn()
}))

// Mock inputHandler.js to prevent circular import with cursorManager.js
vi.mock('../../src/inputHandler.js', () => ({
  selectedUnits: [],
  getSelectedUnits: vi.fn().mockReturnValue([]),
  setSelectedUnits: vi.fn()
}))

vi.mock('../../src/game/unitWreckManager.js', () => ({
  findWreckAtTile: vi.fn()
}))

import { CursorManager } from '../../src/input/cursorManager.js'
import { GAME_DEFAULT_CURSOR } from '../../src/input/cursorStyles.js'
import { TILE_SIZE, CURSOR_METERS_PER_TILE } from '../../src/config.js'
import { gameState } from '../../src/gameState.js'
import { findWreckAtTile } from '../../src/game/unitWreckManager.js'
import { createTestMapGrid, resetGameState } from '../testUtils.js'

const createCanvas = (rect = { left: 0, top: 0, right: 200, bottom: 200 }) => {
  const canvas = document.createElement('canvas')
  canvas.id = 'gameCanvas'
  canvas.getBoundingClientRect = () => rect
  document.body.appendChild(canvas)
  return canvas
}

const createMouseEvent = (x, y) => ({ clientX: x, clientY: y })

const setTileAt = (mapGrid, x, y, tileOverrides) => {
  if (!mapGrid[y] || !mapGrid[y][x]) {
    throw new Error('Tile out of bounds for test map grid')
  }
  mapGrid[y][x] = { ...mapGrid[y][x], ...tileOverrides }
}

describe('CursorManager', () => {
  beforeEach(() => {
    resetGameState()
    gameState.humanPlayer = 'player1'
    gameState.scrollOffset = { x: 0, y: 0 }
    gameState.isRightDragging = false
    gameState.repairMode = false
    gameState.sellMode = false
  })

  afterEach(() => {
    const canvas = document.getElementById('gameCanvas')
    if (canvas) {
      canvas.remove()
    }
    document.querySelectorAll('.range-cursor-info').forEach((node) => node.remove())
    vi.restoreAllMocks()
  })

  it('reuses existing range cursor elements when present', () => {
    const existing = document.createElement('div')
    existing.className = 'range-cursor-info'
    const text = document.createElement('div')
    text.className = 'range-cursor-info__text'
    existing.appendChild(text)
    document.body.appendChild(existing)

    const manager = new CursorManager()

    expect(manager.rangeCursorElements.container).toBe(existing)
    expect(manager.rangeCursorElements.rangeText).toBe(text)
  })

  it('formats range values with a single decimal when needed', () => {
    const manager = new CursorManager()

    expect(manager.formatRangeValue(2)).toBe('2')
    expect(manager.formatRangeValue(2.04)).toBe('2')
    expect(manager.formatRangeValue(2.05)).toBe('2.1')
  })

  it('updates range cursor display position and text when visible', () => {
    const manager = new CursorManager()
    manager.setRangeCursorInfo({
      distance: TILE_SIZE * 2,
      maxRange: TILE_SIZE * 4
    })

    manager.updateRangeCursorDisplay({ x: 12, y: 34 }, true)

    const { container, rangeText } = manager.rangeCursorElements
    const expectedDistance = Math.round((2 * CURSOR_METERS_PER_TILE))
    const expectedMax = Math.round((4 * CURSOR_METERS_PER_TILE))

    expect(rangeText.textContent).toBe(`${expectedDistance}m/${expectedMax}m`)
    expect(container.style.left).toBe('12px')
    expect(container.style.top).toBe('34px')
    expect(container.classList.contains('visible')).toBe(true)
  })


  it('renders custom range cursor text when provided', () => {
    const manager = new CursorManager()
    manager.setRangeCursorInfo({ displayText: '123m' })

    manager.updateRangeCursorDisplay({ x: 10, y: 20 }, true)

    const { rangeText } = manager.rangeCursorElements
    expect(rangeText.textContent).toBe('123m')
  })

  it('hides range cursor display when not showing', () => {
    const manager = new CursorManager()
    manager.setRangeCursorInfo({
      distance: TILE_SIZE * 2,
      maxRange: TILE_SIZE * 4
    })

    manager.updateRangeCursorDisplay({ x: 12, y: 34 }, true)
    manager.updateRangeCursorDisplay({ x: 12, y: 34 }, false)

    const { container } = manager.rangeCursorElements
    expect(container.classList.contains('visible')).toBe(false)
  })

  it('applies cursor styles and filters allowed cursor classes', () => {
    const canvas = createCanvas()
    const manager = new CursorManager()

    manager.applyCursor(canvas, 'crosshair', ['move-mode', 'unknown-mode'])

    expect(canvas.style.cursor).toBe('crosshair')
    expect(canvas.classList.contains('move-mode')).toBe(true)
    expect(canvas.classList.contains('unknown-mode')).toBe(false)
  })

  it('removes obsolete cursor classes when applying new styles', () => {
    const canvas = createCanvas()
    canvas.classList.add('move-mode')
    const manager = new CursorManager()

    manager.applyCursor(canvas, 'default', [])

    expect(canvas.classList.contains('move-mode')).toBe(false)
  })

  it('detects blocked terrain based on map bounds and occupancy', () => {
    const manager = new CursorManager()
    const mapGrid = createTestMapGrid(2, 2)

    expect(manager.isBlockedTerrain(0, 0, null)).toBe(false)
    expect(manager.isBlockedTerrain(5, 5, mapGrid)).toBe(true)

    setTileAt(mapGrid, 0, 0, { type: 'water' })
    expect(manager.isBlockedTerrain(0, 0, mapGrid)).toBe(true)

    setTileAt(mapGrid, 0, 0, { type: 'grass' })
    gameState.occupancyMap = [
      [0, 1],
      [0, 0]
    ]
    // occupancyMap returns a truthy value (1) for occupied tiles
    expect(manager.isBlockedTerrain(1, 0, mapGrid)).toBeTruthy()
  })

  it('defaults to the game cursor when outside the canvas', () => {
    const manager = new CursorManager()
    const canvas = createCanvas({ left: 0, top: 0, right: 100, bottom: 100 })
    const mapGrid = createTestMapGrid(2, 2)

    manager.updateCustomCursor(createMouseEvent(150, 150), mapGrid, [], [], [])

    expect(canvas.style.cursor).toBe(GAME_DEFAULT_CURSOR)
  })

  it('uses repair cursor when hovering a repairable factory in repair mode', () => {
    const manager = new CursorManager()
    const canvas = createCanvas()
    const mapGrid = createTestMapGrid(5, 5)
    const factories = [{
      id: 'player1',
      x: 1,
      y: 1,
      width: 2,
      height: 2,
      health: 50,
      maxHealth: 100
    }]

    gameState.repairMode = true

    const event = createMouseEvent(TILE_SIZE + 1, TILE_SIZE + 1)
    manager.updateCustomCursor(event, mapGrid, factories, [], [])

    expect(canvas.classList.contains('repair-mode')).toBe(true)
  })

  it('uses repair-blocked cursor when hovering a fully repaired factory', () => {
    const manager = new CursorManager()
    const canvas = createCanvas()
    const mapGrid = createTestMapGrid(5, 5)
    const factories = [{
      id: 'player1',
      x: 1,
      y: 1,
      width: 2,
      height: 2,
      health: 100,
      maxHealth: 100
    }]

    gameState.repairMode = true

    const event = createMouseEvent(TILE_SIZE + 1, TILE_SIZE + 1)
    manager.updateCustomCursor(event, mapGrid, factories, [], [])

    expect(canvas.classList.contains('repair-blocked-mode')).toBe(true)
  })

  it('uses sell cursor when hovering a sellable building in sell mode', () => {
    const manager = new CursorManager()
    const canvas = createCanvas()
    const mapGrid = createTestMapGrid(5, 5)

    gameState.sellMode = true
    gameState.buildings = [{
      type: 'powerPlant',
      owner: 'player1',
      x: 1,
      y: 1,
      width: 2,
      height: 2,
      isBeingSold: false
    }]

    const event = createMouseEvent(TILE_SIZE + 1, TILE_SIZE + 1)
    manager.updateCustomCursor(event, mapGrid, [], [], [])

    expect(canvas.classList.contains('sell-mode')).toBe(true)
  })

  it('uses move-blocked cursor for blocked terrain with selected units', () => {
    const manager = new CursorManager()
    const canvas = createCanvas()
    const mapGrid = createTestMapGrid(5, 5)
    setTileAt(mapGrid, 2, 2, { type: 'rock' })

    const selectedUnits = [{ owner: 'player1', type: 'tank' }]
    const event = createMouseEvent(TILE_SIZE * 2 + 1, TILE_SIZE * 2 + 1)

    manager.updateCustomCursor(event, mapGrid, [], selectedUnits, [])

    expect(canvas.classList.contains('move-blocked-mode')).toBe(true)
  })


  it('shows move cursor air distance text below cursor', () => {
    const manager = new CursorManager()
    createCanvas()
    const mapGrid = createTestMapGrid(8, 8)
    const selectedUnits = [{ owner: 'player1', type: 'tank', x: TILE_SIZE, y: TILE_SIZE, health: 100 }]

    const event = createMouseEvent(TILE_SIZE * 3, TILE_SIZE * 3)
    manager.updateCustomCursor(event, mapGrid, [], selectedUnits, [])

    const { container, rangeText } = manager.rangeCursorElements
    expect(container.classList.contains('visible')).toBe(true)
    expect(rangeText.textContent).toMatch(/^\d+m$/)
  })

  it('uses out-of-range attack cursor in force-attack mode', () => {
    const manager = new CursorManager()
    const canvas = createCanvas()
    const mapGrid = createTestMapGrid(5, 5)
    const selectedUnits = [{ owner: 'player1', type: 'tank' }]

    manager.updateForceAttackMode(true)
    manager.setIsOverEnemyOutOfRange(true)

    const event = createMouseEvent(TILE_SIZE + 1, TILE_SIZE + 1)
    manager.updateCustomCursor(event, mapGrid, [], selectedUnits, [])

    expect(canvas.classList.contains('attack-out-of-range-mode')).toBe(true)
  })

  it('shows guard cursor when guard mode is active', () => {
    const manager = new CursorManager()
    const canvas = createCanvas()
    const mapGrid = createTestMapGrid(5, 5)
    const selectedUnits = [{ owner: 'player1', type: 'tank' }]

    manager.updateGuardMode(true)

    const event = createMouseEvent(TILE_SIZE + 1, TILE_SIZE + 1)
    manager.updateCustomCursor(event, mapGrid, [], selectedUnits, [])

    expect(canvas.classList.contains('guard-mode')).toBe(true)
  })

  it('uses move-into cursor when hovering a recoverable wreck', () => {
    const manager = new CursorManager()
    const canvas = createCanvas()
    const mapGrid = createTestMapGrid(5, 5)
    const selectedUnits = [{ owner: 'player1', type: 'recoveryTank' }]

    vi.mocked(findWreckAtTile).mockReturnValue({
      assignedTankId: null,
      isBeingRestored: false,
      towedBy: null,
      isBeingRecycled: false
    })

    const event = createMouseEvent(TILE_SIZE + 1, TILE_SIZE + 1)
    manager.updateCustomCursor(event, mapGrid, [], selectedUnits, [])

    expect(canvas.classList.contains('move-into-mode')).toBe(true)
  })


  it('uses move-blocked cursor for F22 in landing sequence on the hovered airstrip', () => {
    const manager = new CursorManager()
    const canvas = createCanvas()
    const mapGrid = createTestMapGrid(12, 12)

    gameState.buildings = [{
      id: 'airstrip-1',
      type: 'airstrip',
      owner: 'player1',
      health: 100,
      x: 3,
      y: 3,
      width: 4,
      height: 4
    }]

    const selectedUnits = [{
      id: 'f22-landing',
      owner: 'player1',
      type: 'f22Raptor',
      health: 100,
      maxHealth: 100,
      flightState: 'airborne',
      f22State: 'approach_runway',
      airstripId: 'airstrip-1',
      helipadTargetId: 'airstrip-1'
    }]

    const event = createMouseEvent(TILE_SIZE * 4 + 1, TILE_SIZE * 4 + 1)
    manager.updateCustomCursor(event, mapGrid, [], selectedUnits, [])

    expect(canvas.classList.contains('move-blocked-mode')).toBe(true)
  })

  it('uses move-blocked cursor for F22 parked on the hovered airstrip', () => {
    const manager = new CursorManager()
    const canvas = createCanvas()
    const mapGrid = createTestMapGrid(12, 12)

    gameState.buildings = [{
      id: 'airstrip-1',
      type: 'airstrip',
      owner: 'player1',
      health: 100,
      x: 3,
      y: 3,
      width: 4,
      height: 4
    }]

    const selectedUnits = [{
      id: 'f22-1',
      owner: 'player1',
      type: 'f22Raptor',
      health: 100,
      maxHealth: 100,
      flightState: 'grounded',
      f22State: 'parked',
      landedHelipadId: 'airstrip-1'
    }]

    const event = createMouseEvent(TILE_SIZE * 4 + 1, TILE_SIZE * 4 + 1)
    manager.updateCustomCursor(event, mapGrid, [], selectedUnits, [])

    expect(canvas.classList.contains('move-blocked-mode')).toBe(true)
  })

  it('keeps move-into cursor for F22 parked on another airstrip', () => {
    const manager = new CursorManager()
    const canvas = createCanvas()
    const mapGrid = createTestMapGrid(12, 12)

    gameState.buildings = [{
      id: 'airstrip-2',
      type: 'airstrip',
      owner: 'player1',
      health: 100,
      x: 3,
      y: 3,
      width: 4,
      height: 4
    }]

    const selectedUnits = [{
      id: 'f22-2',
      owner: 'player1',
      type: 'f22Raptor',
      health: 100,
      maxHealth: 100,
      flightState: 'grounded',
      f22State: 'parked',
      landedHelipadId: 'airstrip-1'
    }]

    const event = createMouseEvent(TILE_SIZE * 4 + 1, TILE_SIZE * 4 + 1)
    manager.updateCustomCursor(event, mapGrid, [], selectedUnits, [])

    expect(canvas.classList.contains('move-into-mode')).toBe(true)
  })

  it('refreshes cursor with the last known mouse event', () => {
    const manager = new CursorManager()
    const mapGrid = createTestMapGrid(2, 2)
    createCanvas()
    const event = createMouseEvent(10, 10)

    manager.updateCustomCursor(event, mapGrid, [], [], [])

    const spy = vi.spyOn(manager, 'updateCustomCursor')
    manager.refreshCursor(mapGrid, [], [], [])

    expect(spy).toHaveBeenCalledWith(event, mapGrid, [], [], [])
  })

  it('logs when guard mode toggles', () => {
    const manager = new CursorManager()
    const loggerSpy = vi.spyOn(window, 'logger')

    manager.updateGuardMode(true)

    expect(manager.isGuardMode).toBe(true)
    expect(loggerSpy).toHaveBeenCalledWith('[GMF] Guard mode ENABLED')
  })
})
