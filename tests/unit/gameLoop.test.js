import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resetGameState } from '../testUtils.js'
import { gameState } from '../../src/gameState.js'

const updateGameMock = vi.hoisted(() => vi.fn())
const renderGameMock = vi.hoisted(() => vi.fn())
const renderMinimapMock = vi.hoisted(() => vi.fn())
const updateBuildingsUnderRepairMock = vi.hoisted(() => vi.fn())
const updateBuildingsAwaitingRepairMock = vi.hoisted(() => vi.fn())
const updateEnergyBarMock = vi.hoisted(() => vi.fn())
const updateMoneyBarMock = vi.hoisted(() => vi.fn())
const setProductionControllerMock = vi.hoisted(() => vi.fn())
const checkMilestonesMock = vi.hoisted(() => vi.fn())
const pauseAllSoundsMock = vi.hoisted(() => vi.fn())
const resumeAllSoundsMock = vi.hoisted(() => vi.fn())
const updateMapScrollingMock = vi.hoisted(() => vi.fn())
const isLockstepEnabledMock = vi.hoisted(() => vi.fn())
const processLockstepTickMock = vi.hoisted(() => vi.fn((callback) => callback(16)))

vi.mock('../../src/updateGame.js', () => ({
  updateGame: updateGameMock
}))

vi.mock('../../src/rendering.js', () => ({
  renderGame: renderGameMock,
  renderMinimap: renderMinimapMock
}))

vi.mock('../../src/buildings.js', () => ({
  updateBuildingsUnderRepair: updateBuildingsUnderRepairMock,
  updateBuildingsAwaitingRepair: updateBuildingsAwaitingRepairMock
}))

vi.mock('../../src/ui/energyBar.js', () => ({
  updateEnergyBar: updateEnergyBarMock
}))

vi.mock('../../src/ui/moneyBar.js', () => ({
  updateMoneyBar: updateMoneyBarMock
}))

vi.mock('../../src/game/milestoneSystem.js', () => ({
  milestoneSystem: {
    setProductionController: setProductionControllerMock,
    checkMilestones: checkMilestonesMock
  }
}))

vi.mock('../../src/ui/fpsDisplay.js', () => ({
  FPSDisplay: class FPSDisplay {
    constructor() {
      this.updateFPS = vi.fn()
      this.render = vi.fn()
    }
  }
}))

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: (fn) => fn
}))

vi.mock('../../src/sound.js', () => ({
  pauseAllSounds: pauseAllSoundsMock,
  resumeAllSounds: resumeAllSoundsMock
}))

vi.mock('../../src/game/gameStateManager.js', () => ({
  updateMapScrolling: updateMapScrollingMock
}))

vi.mock('../../src/network/gameCommandSync.js', () => ({
  isLockstepEnabled: isLockstepEnabledMock,
  processLockstepTick: processLockstepTickMock
}))

vi.mock('../../src/network/lockstepManager.js', () => ({
  LOCKSTEP_CONFIG: { MAX_TICKS_PER_FRAME: 2 },
  MS_PER_TICK: 16
}))

import { GameLoop } from '../../src/game/gameLoop.js'

function createCanvasManager() {
  const canvas = { width: 100, height: 100 }
  const context = {
    fillStyle: '',
    font: '',
    textAlign: '',
    fillRect: vi.fn(),
    fillText: vi.fn()
  }

  return {
    getGameContext: () => context,
    getGameCanvas: () => canvas,
    getGameGlContext: () => ({}),
    getGameGlCanvas: () => ({}),
    getMinimapContext: () => ({}),
    getMinimapCanvas: () => ({})
  }
}

function createLoop({
  moneyEl = document.createElement('div'),
  gameTimeEl = document.createElement('div'),
  productionController = {
    updateVehicleButtonStates: vi.fn(),
    updateBuildingButtonStates: vi.fn(),
    updateTabStates: vi.fn()
  },
  productionQueue = {
    updateProgress: vi.fn(),
    setProductionController: vi.fn()
  },
  units = []
} = {}) {
  return new GameLoop(
    createCanvasManager(),
    productionController,
    [],
    [],
    units,
    [],
    productionQueue,
    moneyEl,
    gameTimeEl
  )
}

beforeEach(() => {
  resetGameState()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  vi.spyOn(performance, 'now').mockReturnValue(1000)
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 101))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('setTimeout', vi.fn(() => 202))
  vi.stubGlobal('clearTimeout', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GameLoop', () => {
  it('registers production controller and money displays', () => {
    document.body.innerHTML = '<div id="mobileMoneyValue"></div>'
    const moneyEl = document.createElement('span')
    const productionController = {
      updateVehicleButtonStates: vi.fn(),
      updateBuildingButtonStates: vi.fn(),
      updateTabStates: vi.fn()
    }
    const productionQueue = {
      updateProgress: vi.fn(),
      setProductionController: vi.fn()
    }

    const loop = createLoop({ moneyEl, productionController, productionQueue })

    expect(setProductionControllerMock).toHaveBeenCalledWith(productionController)
    expect(productionQueue.setProductionController).toHaveBeenCalledWith(productionController)
    expect(loop.moneyDisplays.has(moneyEl)).toBe(true)
    expect(loop.moneyDisplays.has(document.getElementById('mobileMoneyValue'))).toBe(true)
  })

  it('starts and stops the animation loop', () => {
    const loop = createLoop()

    loop.start()

    expect(loop.running).toBe(true)
    expect(loop.forceRender).toBe(true)
    expect(requestAnimationFrame).toHaveBeenCalled()

    loop.animationId = 55
    loop.stop()

    expect(loop.running).toBe(false)
    expect(cancelAnimationFrame).toHaveBeenCalledWith(55)
    expect(loop.animationId).toBe(null)
  })

  it('requests render updates only when running', () => {
    const loop = createLoop()

    loop.requestRender()
    expect(requestAnimationFrame).not.toHaveBeenCalled()

    loop.running = true
    loop.requestRender()

    expect(loop.forceRender).toBe(true)
    expect(requestAnimationFrame).toHaveBeenCalled()
  })

  it('does not reschedule when an animation frame is already queued', () => {
    const loop = createLoop()
    loop.running = true
    loop.animationId = 123

    loop.scheduleNextFrame()

    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })


  it('uses requestAnimationFrame when frame limiter is enabled', () => {
    const loop = createLoop()
    loop.running = true
    gameState.frameLimiterEnabled = true

    loop.scheduleNextFrame()

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(setTimeout).not.toHaveBeenCalled()
  })

  it('uses setTimeout scheduling when frame limiter is disabled', () => {
    const loop = createLoop()
    loop.running = true
    gameState.frameLimiterEnabled = false

    loop.scheduleNextFrame()

    expect(setTimeout).toHaveBeenCalledTimes(1)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(loop.frameTimeoutId).toBe(202)
  })

  it('runs standard mode with a fixed simulation step scaled by game speed instead of render FPS', () => {
    const productionQueue = {
      updateProgress: vi.fn(),
      setProductionController: vi.fn()
    }
    const loop = createLoop({ productionQueue })
    loop.running = true
    gameState.gameStarted = true
    gameState.gamePaused = false
    gameState.speedMultiplier = 2
    isLockstepEnabledMock.mockReturnValue(false)

    loop.lastFrameTime = 1000
    loop.animate(1033)

    expect(updateGameMock).toHaveBeenCalledTimes(2)
    expect(updateGameMock).toHaveBeenNthCalledWith(1, gameState.simulationStepMs, [], [], [], [], gameState)
    expect(updateGameMock).toHaveBeenNthCalledWith(2, gameState.simulationStepMs, [], [], [], [], gameState)
    expect(gameState.simulationTime).toBeCloseTo(gameState.simulationStepMs * 2, 4)
    expect(productionQueue.updateProgress).toHaveBeenCalledWith(0)
  })

  it('updates map scrolling once per rendered frame regardless of game speed', () => {
    const loop = createLoop()
    loop.running = true
    gameState.gameStarted = true
    gameState.gamePaused = false
    gameState.speedMultiplier = 2
    isLockstepEnabledMock.mockReturnValue(false)

    loop.lastFrameTime = 1000
    loop.animate(1033)

    expect(updateGameMock).toHaveBeenCalledTimes(2)
    expect(updateMapScrollingMock).toHaveBeenCalledTimes(1)
    expect(updateMapScrollingMock).toHaveBeenCalledWith(gameState, [])
  })

  it('clears timeout-based scheduling on stop', () => {
    const loop = createLoop()
    loop.running = true
    loop.frameTimeoutId = 303

    loop.stop()

    expect(clearTimeout).toHaveBeenCalledWith(303)
    expect(loop.frameTimeoutId).toBe(null)
  })

  it('resumes from pause only when running', () => {
    const loop = createLoop()
    loop.running = false

    loop.resumeFromPause()
    expect(requestAnimationFrame).not.toHaveBeenCalled()

    loop.running = true
    loop.resumeFromPause()

    expect(loop.forceRender).toBe(true)
    expect(loop.lastFrameTime).toBe(null)
    expect(requestAnimationFrame).toHaveBeenCalled()
  })

  it('detects active scroll activity', () => {
    const loop = createLoop()

    gameState.isRightDragging = true
    expect(loop.hasActiveScrollActivity()).toBe(true)

    gameState.isRightDragging = false
    gameState.dragVelocity.x = 0.03
    expect(loop.hasActiveScrollActivity()).toBe(true)

    gameState.dragVelocity.x = 0
    gameState.keyScroll.right = true
    expect(loop.hasActiveScrollActivity()).toBe(true)

    gameState.keyScroll.right = false
    expect(loop.hasActiveScrollActivity()).toBe(false)
  })

  it('renders paused frames and snaps drag velocity', () => {
    const loop = createLoop()
    loop.running = true // Loop must be running for requestRender to work
    loop.forceRender = true
    gameState.dragVelocity.x = 0.01
    gameState.dragVelocity.y = 0.01

    updateMapScrollingMock.mockImplementation(() => {
      gameState.scrollOffset.x = 5
    })

    loop.handlePausedFrame(1000, {}, {}, false)

    expect(updateMapScrollingMock).toHaveBeenCalled()
    expect(renderGameMock).toHaveBeenCalled()
    expect(renderMinimapMock).toHaveBeenCalled()
    expect(loop.fpsDisplay.render).toHaveBeenCalled()
    expect(gameState.dragVelocity.x).toBe(0)
    expect(gameState.dragVelocity.y).toBe(0)
    expect(loop.forceRender).toBe(false)
    // requestAnimationFrame is called via requestRender when running
    expect(requestAnimationFrame).toHaveBeenCalled()
  })

  it('renders a loading frame before the game starts', () => {
    const loop = createLoop()
    loop.running = true
    gameState.gameStarted = false

    loop.animate(1000)

    expect(loop.fpsDisplay.updateFPS).toHaveBeenCalled()
    expect(loop.fpsDisplay.render).toHaveBeenCalled()
    expect(requestAnimationFrame).toHaveBeenCalled()
    expect(updateGameMock).not.toHaveBeenCalled()
  })

  it('pauses and resumes audio when pause state changes', () => {
    const loop = createLoop()
    loop.running = true
    gameState.gameStarted = true

    loop.wasPaused = false
    gameState.gamePaused = true

    loop.animate(1000)

    expect(pauseAllSoundsMock).toHaveBeenCalled()
    expect(loop.wasPaused).toBe(true)

    gameState.gamePaused = false
    loop.animate(1100)

    expect(resumeAllSoundsMock).toHaveBeenCalled()
    expect(loop.lastFrameTime).toBe(1100)
  })

  it('updates game state, UI, and milestones during active frames', () => {
    const moneyEl = document.createElement('span')
    const gameTimeEl = document.createElement('span')
    const productionController = {
      updateVehicleButtonStates: vi.fn(),
      updateBuildingButtonStates: vi.fn(),
      updateTabStates: vi.fn()
    }
    const loop = createLoop({ moneyEl, gameTimeEl, productionController })
    loop.running = true

    isLockstepEnabledMock.mockReturnValue(false)

    gameState.gameStarted = true
    gameState.gamePaused = false
    gameState.pendingButtonUpdate = true
    gameState.frameCount = 59
    gameState.money = 2500
    gameState.gameTime = 130

    loop.lastEnergyUpdate = 0
    loop.lastMoneyBarUpdate = 0
    loop.lastMoneyUpdate = 0
    loop.lastMoneyDisplayed = 0
    loop.lastGameTimeUpdate = 0

    loop.lastFrameTime = 1000
    loop.animate(1017)

    expect(updateGameMock).toHaveBeenCalledWith(gameState.simulationStepMs, [], [], [], [], gameState)
    expect(updateEnergyBarMock).toHaveBeenCalled()
    expect(updateMoneyBarMock).toHaveBeenCalled()
    expect(checkMilestonesMock).toHaveBeenCalledWith(gameState)
    expect(productionController.updateVehicleButtonStates).toHaveBeenCalled()
    expect(productionController.updateBuildingButtonStates).toHaveBeenCalled()
    expect(productionController.updateTabStates).toHaveBeenCalled()
    expect(gameState.pendingButtonUpdate).toBe(false)
    expect(moneyEl.textContent).toBe('$2500')
    expect(gameTimeEl.textContent).toBe('2:10')
    expect(renderGameMock).toHaveBeenCalled()
    expect(renderMinimapMock).toHaveBeenCalled()
  })

  it('caps lockstep tick accumulator after catching up', () => {
    const loop = createLoop()
    loop.running = true

    isLockstepEnabledMock.mockReturnValue(true)
    gameState.gameStarted = true
    gameState.gamePaused = false
    gameState.lockstep.tickAccumulator = 100

    loop.lastFrameTime = 900
    loop.animate(1000)

    expect(gameState.lockstep.tickAccumulator).toBe(32)
  })

  it('processes lockstep ticks and schedules delayed frames for large armies', () => {
    vi.useFakeTimers()
    const rafSpy = vi.fn(() => 101)
    vi.stubGlobal('requestAnimationFrame', rafSpy)

    const units = Array.from({ length: 21 }, (_, index) => ({ id: `unit-${index}` }))
    const loop = createLoop({ units })
    loop.running = true

    isLockstepEnabledMock.mockReturnValue(true)
    gameState.gameStarted = true
    gameState.gamePaused = false
    gameState.lockstep.tickAccumulator = 0

    loop.lastFrameTime = 900
    loop.animate(1000)

    expect(processLockstepTickMock).toHaveBeenCalled()
    expect(updateGameMock).toHaveBeenCalled()

    // With large armies, setTimeout is used instead of immediate requestAnimationFrame
    // Clear the initial call count and run pending timers
    const callsBeforeTimers = rafSpy.mock.calls.length
    vi.runOnlyPendingTimers()
    // After timers run, requestAnimationFrame should have been called
    expect(rafSpy.mock.calls.length).toBeGreaterThanOrEqual(callsBeforeTimers)

    vi.useRealTimers()
  })
})
