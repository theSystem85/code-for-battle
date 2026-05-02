// gameLoop.js
// Handle game loop and animation management

import { gameState } from '../gameState.js'
import { updateGame } from '../updateGame.js'
import { renderGame, renderMinimap } from '../rendering.js'
import { updateBuildingsUnderRepair, updateBuildingsAwaitingRepair } from '../buildings.js'
import { updateEnergyBar } from '../ui/energyBar.js'
import { updateMoneyBar } from '../ui/moneyBar.js'
import { milestoneSystem } from './milestoneSystem.js'
import { FPSDisplay } from '../ui/fpsDisplay.js'
import { logPerformance } from '../performanceUtils.js'
import { pauseAllSounds, resumeAllSounds } from '../sound.js'
import { updateMapScrolling } from './gameStateManager.js'
import { isLockstepEnabled, processLockstepTick } from '../network/gameCommandSync.js'
import { LOCKSTEP_CONFIG, MS_PER_TICK } from '../network/lockstepManager.js'
import { advanceSimulationTime, getFixedSimulationStepMs, getSimulationTime } from './time.js'

export class GameLoop {
  constructor(canvasManager, productionController, mapGrid, factories, units, bullets, productionQueue, moneyEl, gameTimeEl) {
    this.canvasManager = canvasManager
    this.productionController = productionController
    this.mapGrid = mapGrid
    this.factories = factories
    this.units = units
    this.bullets = bullets
    this.productionQueue = productionQueue
    this.moneyEl = moneyEl
    this.moneyDisplays = new Set()
    if (moneyEl) {
      this.moneyDisplays.add(moneyEl)
    }
    this.gameTimeEl = gameTimeEl

    this.lastFrameTime = null
    this.gameInitialized = false
    this.allAssetsLoaded = false
    this.running = false
    this.animationId = null
    this.frameTimeoutId = null
    this.fpsDisplay = new FPSDisplay()
    this.forceRender = false
    this.lastMinimapRenderTime = 0

    // Track last UI update values to avoid unnecessary DOM writes
    this.lastMoneyDisplayed = null
    this.lastMoneyUpdate = 0
    this.lastGameTimeUpdate = 0
    this.lastEnergyUpdate = 0
    this.lastMoneyBarUpdate = 0

    // Set the production controller reference in milestone system
    milestoneSystem.setProductionController(productionController)

    // Set the production controller reference in production queue
    productionQueue.setProductionController(productionController)

    // Track pause state to manage audio playback
    this.wasPaused = gameState.gamePaused

    this.refreshMobileDisplays()
  }

  refreshMobileDisplays() {
    if (this.moneyEl && !this.moneyDisplays.has(this.moneyEl)) {
      this.moneyDisplays.add(this.moneyEl)
    }

    const mobileMoneyValue = document.getElementById('mobileMoneyValue')
    if (mobileMoneyValue) {
      this.moneyDisplays.add(mobileMoneyValue)
    }
  }

  setAssetsLoaded(loaded) {
    this.allAssetsLoaded = loaded
  }

  start() {
    this.running = true
    this.lastFrameTime = null
    this.forceRender = true
    this.scheduleNextFrame()
  }

  stop() {
    this.running = false
    this.cancelScheduledFrame()
  }

  cancelScheduledFrame() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }

    if (this.frameTimeoutId) {
      clearTimeout(this.frameTimeoutId)
      this.frameTimeoutId = null
    }
  }

  requestRender() {
    if (!this.running) {
      return
    }
    // Set forceRender to ensure paused frames render (needed for map editor)
    this.forceRender = true
    this.scheduleNextFrame()
  }

  resumeFromPause() {
    if (!this.running) {
      return
    }

    this.forceRender = true
    this.lastFrameTime = null
    this.scheduleNextFrame()
  }

  scheduleNextFrame() {
    if (!this.running || this.animationId || this.frameTimeoutId) {
      return
    }

    if (gameState.frameLimiterEnabled !== false) {
      this.animationId = requestAnimationFrame((timestamp) => this.animate(timestamp))
      return
    }

    this.frameTimeoutId = setTimeout(() => {
      this.frameTimeoutId = null
      this.animate(performance.now())
    }, 0)
  }

  hasActiveScrollActivity() {
    const velocityThreshold = 0.02
    const velocityX = Math.abs(gameState.dragVelocity.x)
    const velocityY = Math.abs(gameState.dragVelocity.y)
    const keyScrollActive = gameState.keyScroll.up || gameState.keyScroll.down || gameState.keyScroll.left || gameState.keyScroll.right
    const velocityActive = velocityX > velocityThreshold || velocityY > velocityThreshold

    return gameState.isRightDragging || keyScrollActive || velocityActive
  }

  isMobileRenderProfile() {
    const body = typeof document !== 'undefined' ? document.body : null
    return Boolean(
      body?.classList.contains('is-touch') ||
      body?.classList.contains('mobile-landscape') ||
      body?.classList.contains('mobile-portrait')
    )
  }

  getMinimapRenderIntervalMs() {
    return this.isMobileRenderProfile() ? 250 : 0
  }

  shouldRenderMinimap(now, force = false) {
    const interval = this.getMinimapRenderIntervalMs()
    if (force || interval <= 0 || now - this.lastMinimapRenderTime >= interval) {
      this.lastMinimapRenderTime = now
      return true
    }
    return false
  }

  renderMinimapIfDue(now, minimapCtx, minimapCanvas, gameCanvas, force = false) {
    if (!this.shouldRenderMinimap(now, force)) {
      return
    }

    renderMinimap(
      minimapCtx,
      minimapCanvas,
      this.mapGrid,
      gameState.scrollOffset,
      gameCanvas,
      this.units,
      gameState.buildings,
      gameState
    )
  }

  handlePausedFrame(now, gameCtx, gameCanvas, pauseStateChanged) {
    const frameStart = performance.now()
    this.lastFrameTime = null

    updateGame(0, this.mapGrid, this.factories, this.units, this.bullets, gameState)

    const gameGl = this.canvasManager.getGameGlContext()
    const gameGlCanvas = this.canvasManager.getGameGlCanvas()

    const minimapCtx = this.canvasManager.getMinimapContext()
    const minimapCanvas = this.canvasManager.getMinimapCanvas()

    const prevOffsetX = gameState.scrollOffset.x
    const prevOffsetY = gameState.scrollOffset.y

    if (!gameState.isRightDragging) {
      updateMapScrolling(gameState, this.mapGrid)

      const velocitySnapThreshold = 0.02
      if (Math.abs(gameState.dragVelocity.x) < velocitySnapThreshold) {
        gameState.dragVelocity.x = 0
      }
      if (Math.abs(gameState.dragVelocity.y) < velocitySnapThreshold) {
        gameState.dragVelocity.y = 0
      }
    }

    const offsetChanged = prevOffsetX !== gameState.scrollOffset.x || prevOffsetY !== gameState.scrollOffset.y
    const shouldRenderFrame = this.forceRender || pauseStateChanged || offsetChanged || gameState.isRightDragging

    if (shouldRenderFrame) {
      renderGame(
        gameCtx,
        gameCanvas,
        this.mapGrid,
        this.factories,
        this.units,
        this.bullets,
        gameState.buildings,
        gameState.scrollOffset,
        gameState.selectionActive,
        gameState.selectionStart,
        gameState.selectionEnd,
        gameState,
        gameGl,
        gameGlCanvas
      )

      this.renderMinimapIfDue(now, minimapCtx, minimapCanvas, gameCanvas, this.forceRender || pauseStateChanged)
    }

    this.fpsDisplay.render(gameCtx, gameCanvas)
    const totalPausedFrameMs = performance.now() - frameStart
    this.fpsDisplay.reportFrameBreakdown({
      updateMs: totalPausedFrameMs,
      renderMs: 0,
      idleMs: 0
    })

    this.forceRender = false

    // Always schedule next frame when paused to handle external unpause events
    this.scheduleNextFrame()
  }

  animate = logPerformance((timestamp) => {
    // Stop if the loop has been stopped
    if (!this.running) {
      return
    }

    this.animationId = null
    this.frameTimeoutId = null

    // Get current time and canvas contexts (used throughout the function)
    const now = timestamp || performance.now()
    const gameCtx = this.canvasManager.getGameContext()
    const gameCanvas = this.canvasManager.getGameCanvas()
    const gameGl = this.canvasManager.getGameGlContext()
    const gameGlCanvas = this.canvasManager.getGameGlCanvas()

    // Always update FPS tracking
    this.fpsDisplay.updateFPS(now)

    const pauseStateChanged = gameState.gamePaused !== this.wasPaused
    // Pause or resume sounds when game pause state changes
    if (pauseStateChanged) {
      this.wasPaused = gameState.gamePaused
      if (gameState.gamePaused) {
        pauseAllSounds()
      } else {
        resumeAllSounds()
        this.lastFrameTime = now
      }
    }

    if (!gameState.gameStarted) {
      this.fpsDisplay.reportFrameBreakdown({ updateMs: 0, renderMs: 0, idleMs: 0 })
      this.fpsDisplay.render(gameCtx, gameCanvas)
      this.scheduleNextFrame()
      return
    }

    if (gameState.gamePaused) {
      this.handlePausedFrame(now, gameCtx, gameCanvas, pauseStateChanged)
      return
    }

    // Calculate delta time with a maximum to avoid spiral of doom on slow frames
    if (!this.lastFrameTime) this.lastFrameTime = now
    const delta = Math.min(now - this.lastFrameTime, 33) // Cap at ~30 FPS equivalent
    this.lastFrameTime = now
    const frameStart = performance.now()

    // Check if game is over
    if (gameState.gameOver) {
      gameState.gamePaused = true
    }

    // Update production progress
    const simulationTime = getSimulationTime(gameState)
    this.productionQueue.updateProgress(simulationTime)

    // Update buildings under repair
    updateBuildingsUnderRepair(gameState, simulationTime)

    // Update buildings awaiting repair (countdown for buildings under attack)
    updateBuildingsAwaitingRepair(gameState, simulationTime)

    // Update energy bar display at most once per second
    if (now - this.lastEnergyUpdate >= 1000) {
      updateEnergyBar()
      this.lastEnergyUpdate = now
    }

    // Update money bar display at most once per second
    if (now - this.lastMoneyBarUpdate >= 1000) {
      if (typeof updateMoneyBar === 'function') {
        updateMoneyBar()
      }
      this.lastMoneyBarUpdate = now
    }

    // Increment frame counter
    gameState.frameCount++

    // Check for milestones periodically (every 60 frames)
    if (gameState.frameCount % 60 === 0) {
      milestoneSystem.checkMilestones(gameState)
    }

    // Update game elements - use lockstep or variable timestep
    if (isLockstepEnabled()) {
      // Lockstep mode: Fixed timestep tick-based simulation
      // Accumulate time and process ticks
      gameState.lockstep.tickAccumulator += delta

      // Process up to MAX_TICKS_PER_FRAME ticks to prevent spiral of death
      let ticksProcessed = 0
      while (gameState.lockstep.tickAccumulator >= MS_PER_TICK &&
             ticksProcessed < LOCKSTEP_CONFIG.MAX_TICKS_PER_FRAME) {
        // Process one tick with the fixed timestep
        processLockstepTick((fixedDelta) => {
          advanceSimulationTime(fixedDelta, gameState)
          updateGame(fixedDelta, this.mapGrid, this.factories, this.units, this.bullets, gameState)
        })

        gameState.lockstep.tickAccumulator -= MS_PER_TICK
        ticksProcessed++
      }

      // Cap accumulator to prevent massive catch-up after lag
      if (gameState.lockstep.tickAccumulator > MS_PER_TICK * LOCKSTEP_CONFIG.MAX_TICKS_PER_FRAME) {
        gameState.lockstep.tickAccumulator = MS_PER_TICK * LOCKSTEP_CONFIG.MAX_TICKS_PER_FRAME
      }
    } else {
      const fixedStepMs = getFixedSimulationStepMs(gameState)
      const speedMultiplier = Number.isFinite(gameState.speedMultiplier) ? Math.max(gameState.speedMultiplier, 0.5) : 1
      gameState.simulationAccumulator += delta * speedMultiplier

      let ticksProcessed = 0
      while (gameState.simulationAccumulator >= fixedStepMs &&
             ticksProcessed < LOCKSTEP_CONFIG.MAX_TICKS_PER_FRAME) {
        advanceSimulationTime(fixedStepMs, gameState)
        updateGame(fixedStepMs, this.mapGrid, this.factories, this.units, this.bullets, gameState)
        gameState.simulationAccumulator -= fixedStepMs
        ticksProcessed++
      }

      if (gameState.simulationAccumulator > fixedStepMs * LOCKSTEP_CONFIG.MAX_TICKS_PER_FRAME) {
        gameState.simulationAccumulator = fixedStepMs * LOCKSTEP_CONFIG.MAX_TICKS_PER_FRAME
      }
    }

    updateMapScrolling(gameState, this.mapGrid)
    const updateEnd = performance.now()

    // Refresh production buttons if a building was destroyed
    if (gameState.pendingButtonUpdate) {
      if (this.productionController) {
        this.productionController.updateVehicleButtonStates()
        this.productionController.updateBuildingButtonStates()
        this.productionController.updateTabStates()
      }
      gameState.pendingButtonUpdate = false
    }

    // Get minimap contexts for rendering
    const minimapCtx = this.canvasManager.getMinimapContext()
    const minimapCanvas = this.canvasManager.getMinimapCanvas()

    renderGame(gameCtx, gameCanvas, this.mapGrid, this.factories, this.units, this.bullets, gameState.buildings,
      gameState.scrollOffset, gameState.selectionActive,
      gameState.selectionStart, gameState.selectionEnd, gameState, gameGl, gameGlCanvas)

    // Render minimap with low energy effects if applicable
    this.renderMinimapIfDue(now, minimapCtx, minimapCanvas, gameCanvas)
    const renderEnd = performance.now()

    // Render FPS overlay on top of everything when game is running
    this.fpsDisplay.render(gameCtx, gameCanvas)
    const frameEnd = performance.now()
    const updateMs = Math.max(0, updateEnd - frameStart)
    const renderMs = Math.max(0, renderEnd - updateEnd)
    const idleMs = Math.max(0, frameEnd - frameStart - updateMs - renderMs)
    this.fpsDisplay.reportFrameBreakdown({ updateMs, renderMs, idleMs })
    this.canvasManager.updateAdaptivePixelRatio?.(this.fpsDisplay.fps, now)

    this.forceRender = false

    // Update money display at most every 333ms and only when the value changes
    const currentMoney = Math.floor(gameState.money)
    if (
      currentMoney !== this.lastMoneyDisplayed &&
      now - this.lastMoneyUpdate >= 333
    ) {
      this.refreshMobileDisplays()
      this.moneyDisplays.forEach((display) => {
        display.textContent = `$${currentMoney}`
      })
      const mobileMoneyDisplay = document.getElementById('mobileMoneyDisplay')
      const mobileMoneyBar = document.getElementById('mobileMoneyBar')
      if (mobileMoneyBar) {
        const maxMoney = 100000
        const moneyPercentage = Math.min(100, (currentMoney / maxMoney) * 100)
        const isPortraitCondensed = document?.body?.classList.contains('mobile-portrait')
          && document.body.classList.contains('sidebar-condensed')
        const isPwaStandalone = document?.body?.classList.contains('pwa-standalone')

        if (isPortraitCondensed && !isPwaStandalone) {
          // Vertical bar - fill from bottom to top
          mobileMoneyBar.style.height = `${moneyPercentage}%`
          mobileMoneyBar.style.width = '100%'
        } else {
          // Horizontal bar - fill from left to right
          mobileMoneyBar.style.width = `${moneyPercentage}%`
          mobileMoneyBar.style.height = '100%'
        }
      }
      // Fallback for old CSS-based approach
      if (mobileMoneyDisplay && !mobileMoneyBar) {
        const maxMoney = 100000
        const moneyPercentage = Math.min(100, (currentMoney / maxMoney) * 100)
        mobileMoneyDisplay.style.setProperty('--mobile-money-fill', `${moneyPercentage}%`)
      }
      this.lastMoneyDisplayed = currentMoney
      this.lastMoneyUpdate = now
    }

    // Update game time display at most once per second
    if (now - this.lastGameTimeUpdate >= 1000) {
      const gameTimeSeconds = Math.floor(gameState.gameTime)
      const minutes = Math.floor(gameTimeSeconds / 60)
      const seconds = gameTimeSeconds % 60
      this.gameTimeEl.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
      this.lastGameTimeUpdate = now
    }

    this.scheduleNextFrame()
  }, false, 'animate')

  // Legacy game loop for compatibility (if needed)
  legacyGameLoop(timestamp) {
    // Stop if the loop has been stopped
    if (!this.running) {
      return
    }

    // Update FPS tracking in legacy loop too
    this.fpsDisplay.updateFPS(timestamp || performance.now())

    if (!this.gameInitialized) {
      // Wait for assets to be loaded before initializing and starting the game loop
      if (!this.allAssetsLoaded) {
        // Display a loading message or spinner
        const gameCtx = this.canvasManager.getGameContext()
        const gameCanvas = this.canvasManager.getGameCanvas()
        gameCtx.fillStyle = '#000'
        gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height)
        gameCtx.font = '20px "Rajdhani", "Arial Narrow", sans-serif'
        gameCtx.fillStyle = '#fff'
        gameCtx.textAlign = 'center'
        gameCtx.fillText('Loading assets, please wait...', gameCanvas.width / (2 * (window.devicePixelRatio || 1)), gameCanvas.height / (2 * (window.devicePixelRatio || 1)))
        if (this.running) {
          this.animationId = requestAnimationFrame((timestamp) => this.legacyGameLoop(timestamp))
        }
        return
      }
      // Assets are loaded, perform one-time initializations
      this.gameInitialized = true
      this.lastTime = timestamp // Initialize lastTime
      // Call initial button state updates
      this.productionController.updateVehicleButtonStates()
      this.productionController.updateBuildingButtonStates()
    }

    const deltaTime = (timestamp - this.lastTime) * gameState.speedMultiplier
    this.lastTime = timestamp

    if (!gameState.gameOver) {
      if (!gameState.gamePaused) {
        updateGame(deltaTime, gameState, this.units, this.factories, this.bullets, this.mapGrid, this.productionQueue, this.moneyEl, this.gameTimeEl)
        updateBuildingsUnderRepair(gameState, performance.now())

        if (gameState.pendingButtonUpdate) {
          this.productionController.updateVehicleButtonStates()
          this.productionController.updateBuildingButtonStates()
          gameState.pendingButtonUpdate = false
        }
      }
    }

    const gameCtx = this.canvasManager.getGameContext()
    const gameCanvas = this.canvasManager.getGameCanvas()
    const gameGl = this.canvasManager.getGameGlContext()
    const gameGlCanvas = this.canvasManager.getGameGlCanvas()
    const minimapCtx = this.canvasManager.getMinimapContext()
    const minimapCanvas = this.canvasManager.getMinimapCanvas()

    renderGame(gameCtx, gameCanvas, this.mapGrid, this.factories, this.units, this.bullets, gameState.buildings, gameState.scrollOffset, gameState.selectionActive, gameState.selectionStart, gameState.selectionEnd, gameState, gameGl, gameGlCanvas)
    this.renderMinimapIfDue(timestamp || performance.now(), minimapCtx, minimapCanvas, gameCanvas)

    // Render FPS overlay on top of everything in legacy loop too
    this.fpsDisplay.render(gameCtx, gameCanvas)

    // Update money and time less frequently in legacy loop
    const legacyMoney = Math.floor(gameState.money)
    if (
      legacyMoney !== this.lastMoneyDisplayed &&
      timestamp - this.lastMoneyUpdate >= 333
    ) {
      this.refreshMobileDisplays()
      this.moneyDisplays.forEach((display) => {
        display.textContent = `$${legacyMoney}`
      })
      this.lastMoneyDisplayed = legacyMoney
      this.lastMoneyUpdate = timestamp
    }

    if (timestamp - this.lastGameTimeUpdate >= 1000) {
      this.gameTimeEl.textContent = Math.floor(gameState.gameTime)
      this.lastGameTimeUpdate = timestamp
    }

    if (this.running) {
      if (gameState.frameLimiterEnabled !== false) {
        this.animationId = requestAnimationFrame((nextTimestamp) => this.legacyGameLoop(nextTimestamp))
      } else {
        this.frameTimeoutId = setTimeout(() => {
          this.frameTimeoutId = null
          this.legacyGameLoop(performance.now())
        }, 0)
      }
    }
  }
}
