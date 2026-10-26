import { beforeEach, describe, expect, it, vi } from 'vitest'

const { canPlaceBuilding, exitBuildingPlacementMode } = vi.hoisted(() => ({
  canPlaceBuilding: vi.fn(),
  exitBuildingPlacementMode: vi.fn()
}))

vi.mock('../../src/buildings.js', () => ({
  canPlaceBuilding,
  createBuilding: vi.fn(() => ({ owner: null })),
  placeBuilding: vi.fn(),
  updatePowerSupply: vi.fn(),
  buildingData: { powerPlant: { displayName: 'Power Plant', width: 1, height: 1 } },
  isTileValid: vi.fn(() => true)
}))
vi.mock('../../src/productionQueue.js', () => ({
  productionQueue: {
    completedBuildings: [{ type: 'powerPlant', button: {} }],
    addItem: vi.fn(),
    exitBuildingPlacementMode
  }
}))
vi.mock('../../src/replaySystem.js', () => ({
  completeFinishedReplaySession: vi.fn(),
  isReplayFinishedPaused: vi.fn(() => false),
  isReplayInteractionLocked: vi.fn(() => false),
  isReplayModeActive: vi.fn(() => false),
  recordReplayCommand: vi.fn()
}))

import { gameState } from '../../src/gameState.js'
import { EventHandlers } from '../../src/ui/eventHandlers.js'

function touch(type, x, y) {
  return new window.PointerEvent(type, {
    bubbles: true,
    pointerId: 7,
    pointerType: 'touch',
    clientX: x,
    clientY: y
  })
}

describe('touch building placement preview', () => {
  let canvas
  let handlers

  beforeEach(() => {
    vi.useFakeTimers()
    canPlaceBuilding.mockReturnValue(true)
    exitBuildingPlacementMode.mockReset()
    canvas = document.createElement('canvas')
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 })
    handlers = Object.create(EventHandlers.prototype)
    Object.assign(handlers, {
      canvasManager: { getGameCanvas: () => canvas },
      units: [],
      factories: [],
      mapGrid: Array.from({ length: 20 }, () => Array(20).fill(0)),
      mobileChainBuildGesture: null,
      mobileChainBuildSuppressClickUntil: 0,
      handleBuildingPlacement: vi.fn(() => {
        gameState.buildingPlacementMode = false
        gameState.currentBuildingType = null
      })
    })
    gameState.mapGrid = handlers.mapGrid
    gameState.scrollOffset = { x: 0, y: 0 }
    gameState.buildings = []
    gameState.blueprints = []
    gameState.buildingPlacementMode = true
    gameState.currentBuildingType = 'powerPlant'
    gameState.mobileBuildPaintMode = false
    handlers.setupMobileChainBuildGesture(canvas)
  })

  it('[U06241] shows the desktop placement overlay on touch hold and places on release', () => {
    canvas.dispatchEvent(touch('pointerdown', 96, 128))
    expect(gameState.cursorX).toBe(96)
    expect(gameState.cursorY).toBe(128)
    vi.advanceTimersByTime(220)
    expect(gameState.mobileBuildPaintMode).toBe(false)
    canvas.dispatchEvent(touch('pointerup', 96, 128))
    expect(handlers.handleBuildingPlacement).toHaveBeenCalledOnce()
  })

  it('[U06242] enters chain planning only after a hold followed by a drag', () => {
    canvas.dispatchEvent(touch('pointerdown', 96, 128))
    vi.advanceTimersByTime(220)
    canvas.dispatchEvent(touch('pointermove', 144, 128))
    expect(gameState.mobileBuildPaintMode).toBe(true)
    expect(gameState.mobileBuildPaintTiles.length).toBeGreaterThan(1)
    expect(handlers.handleBuildingPlacement).not.toHaveBeenCalled()
  })

  it('[U06243] uses an invalid release as the touch cancellation path', () => {
    handlers.handleBuildingPlacement.mockImplementation(() => {})
    canvas.dispatchEvent(touch('pointerdown', 96, 128))
    canvas.dispatchEvent(touch('pointerup', 96, 128))
    expect(exitBuildingPlacementMode).toHaveBeenCalledOnce()
  })
})
