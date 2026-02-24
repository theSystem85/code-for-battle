// rendering/renderer.js
import { TextureManager } from './textureManager.js'
import { MapRenderer } from './mapRenderer.js'
import { BuildingRenderer } from './buildingRenderer.js'
import { UnitRenderer } from './unitRenderer.js'
import { EffectsRenderer } from './effectsRenderer.js'
import { MovementTargetRenderer } from './movementTargetRenderer.js'
import { RetreatTargetRenderer } from './retreatTargetRenderer.js'
import { GuardRenderer } from './guardRenderer.js'
import { PathPlanningRenderer } from './pathPlanningRenderer.js'
import { UIRenderer } from './uiRenderer.js'
import { MinimapRenderer } from './minimapRenderer.js'
import { HarvesterHUD } from '../ui/harvesterHUD.js'
import { DangerZoneRenderer } from './dangerZoneRenderer.js'
import { preloadTankImages } from './tankImageRenderer.js'
import { preloadHarvesterImage } from './harvesterImageRenderer.js'
import { preloadRocketTankImage } from './rocketTankImageRenderer.js'
import { preloadAmbulanceImage } from './ambulanceImageRenderer.js'
import { preloadTankerTruckImage } from './tankerTruckImageRenderer.js'
import { preloadRecoveryTankImage } from './recoveryTankImageRenderer.js'
import { preloadAmmunitionTruckImage } from './ammunitionTruckImageRenderer.js'
import { preloadMineLayerImage } from './mineLayerImageRenderer.js'
import { preloadMineSweeperImage } from './mineSweeperImageRenderer.js'
import { preloadHowitzerImage } from './howitzerImageRenderer.js'
import { WreckRenderer } from './wreckRenderer.js'
import { renderMineIndicators, renderMineDeploymentPreview, renderSweepAreaPreview, renderFreeformSweepPreview } from './mineRenderer.js'
import { GameWebGLRenderer } from './webglRenderer.js'
import { selectedUnits } from '../inputHandler.js'
import { TILE_SIZE } from '../config.js'

export class Renderer {
  constructor() {
    this.textureManager = new TextureManager()
    this.mapRenderer = new MapRenderer(this.textureManager)
    this.buildingRenderer = new BuildingRenderer()
    this.unitRenderer = new UnitRenderer()
    this.effectsRenderer = new EffectsRenderer()
    this.uiRenderer = new UIRenderer()
    this.minimapRenderer = new MinimapRenderer()
    this.movementTargetRenderer = new MovementTargetRenderer()
    this.retreatTargetRenderer = new RetreatTargetRenderer()
    this.guardRenderer = new GuardRenderer()
    this.pathPlanningRenderer = new PathPlanningRenderer()
    this.harvesterHUD = new HarvesterHUD()
    this.dangerZoneRenderer = new DangerZoneRenderer()
    this.wreckRenderer = new WreckRenderer()
    this.gpuRenderer = null
  }


  getRenderableAttackQueue(entity) {
    if (!entity) {
      return []
    }

    if (Array.isArray(entity.attackQueue) && entity.attackQueue.length > 0) {
      return entity.attackQueue.filter(target => target && (target.health === undefined || target.health > 0))
    }

    if (entity.isBuilding) {
      const queue = []
      if (entity.forcedAttackTarget && (entity.forcedAttackTarget.health === undefined || entity.forcedAttackTarget.health > 0)) {
        queue.push(entity.forcedAttackTarget)
      }
      if (Array.isArray(entity.forcedAttackQueue) && entity.forcedAttackQueue.length > 0) {
        queue.push(...entity.forcedAttackQueue.filter(target => target && (target.health === undefined || target.health > 0)))
      }
      return queue
    }

    return []
  }

  getEntityCenterWorld(entity) {
    if (!entity) {
      return null
    }

    if (entity.isBuilding) {
      return {
        x: (entity.x + entity.width / 2) * TILE_SIZE,
        y: (entity.y + entity.height / 2) * TILE_SIZE
      }
    }

    if (typeof entity.x === 'number' && typeof entity.y === 'number') {
      return { x: entity.x + TILE_SIZE / 2, y: entity.y + TILE_SIZE / 2 }
    }

    return null
  }

  renderQueuedAttackLines(ctx, scrollOffset) {
    if (!Array.isArray(selectedUnits) || selectedUnits.length === 0) {
      return
    }

    const selectedAttackers = selectedUnits.filter(entity => entity?.selected)
    selectedAttackers.forEach(attacker => {
      const queue = this.getRenderableAttackQueue(attacker)
      if (queue.length < 2) {
        return
      }

      const start = this.getEntityCenterWorld(attacker)
      if (!start) {
        return
      }

      let previous = start
      ctx.save()
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])

      queue.forEach(target => {
        const targetCenter = this.getEntityCenterWorld(target)
        if (!targetCenter) {
          return
        }
        ctx.beginPath()
        ctx.moveTo(previous.x - scrollOffset.x, previous.y - scrollOffset.y)
        ctx.lineTo(targetCenter.x - scrollOffset.x, targetCenter.y - scrollOffset.y)
        ctx.stroke()
        previous = targetCenter
      })

      ctx.restore()
    })
  }

  // Initialize texture loading
  preloadTextures(callback) {
    // Load both tile textures and tank images in parallel
    let texturesLoaded = false
    let tankImagesLoaded = false
    let harvesterLoaded = false
    let rocketTankLoaded = false
    let ambulanceLoaded = false
    let tankerLoaded = false
    let recoveryTankLoaded = false
    let ammunitionLoaded = false
    let howitzerLoaded = false
    let mineLayerLoaded = false
    let mineSweeperLoaded = false

    const checkAllLoaded = () => {
      if (texturesLoaded && tankImagesLoaded && harvesterLoaded && rocketTankLoaded && ambulanceLoaded && tankerLoaded && recoveryTankLoaded && ammunitionLoaded && howitzerLoaded && mineLayerLoaded && mineSweeperLoaded) {
        if (callback) callback()
      }
    }

    // Load tile textures
    this.textureManager.preloadAllTextures(() => {
      texturesLoaded = true
      checkAllLoaded()
    })

    // Load tank images
    preloadTankImages((success) => {
      if (!success) {
        window.logger.warn('Tank images failed to load, falling back to original rendering')
      }
      tankImagesLoaded = true
      checkAllLoaded()
    })

    preloadHarvesterImage((success) => {
      if (!success) {
        window.logger.warn('Harvester image failed to load')
      }
      harvesterLoaded = true
      checkAllLoaded()
    })

    preloadRocketTankImage((success) => {
      if (!success) {
        window.logger.warn('Rocket tank image failed to load')
      }
      rocketTankLoaded = true
      checkAllLoaded()
    })

    preloadAmbulanceImage((success) => {
      if (!success) {
        window.logger.warn('Ambulance image failed to load')
      }
      ambulanceLoaded = true
      checkAllLoaded()
    })

    preloadTankerTruckImage((success) => {
      if (!success) {
        window.logger.warn('Tanker truck image failed to load')
      }
      tankerLoaded = true
      checkAllLoaded()
    })

    preloadRecoveryTankImage((success) => {
      if (!success) {
        window.logger.warn('Recovery tank image failed to load')
      }
      recoveryTankLoaded = true
      checkAllLoaded()
    })

    preloadAmmunitionTruckImage((success) => {
      if (!success) {
        window.logger.warn('Ammunition truck image failed to load')
      }
      ammunitionLoaded = true
      checkAllLoaded()
    })

    preloadHowitzerImage((success) => {
      if (!success) {
        window.logger.warn('Howitzer image failed to load')
      }
      howitzerLoaded = true
      checkAllLoaded()
    })

    preloadMineLayerImage((success) => {
      if (!success) {
        window.logger.warn('Mine layer image failed to load')
      }
      mineLayerLoaded = true
      checkAllLoaded()
    })

    preloadMineSweeperImage((success) => {
      if (!success) {
        window.logger.warn('Mine sweeper image failed to load')
      }
      mineSweeperLoaded = true
      checkAllLoaded()
    })
  }

  renderGame(gameCtx, gameCanvas, mapGrid, factories, units, bullets, buildings, scrollOffset, selectionActive, selectionStart, selectionEnd, gameState, gpuContext = null, gpuCanvas = null) {
    if (!gameState || !gameCtx) {
      return
    }

    // If texture loading hasn't started yet, start it (this should only happen once)
    if (!this.textureManager.loadingStarted) {
      this.textureManager.preloadAllTextures()
    }

    gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height)

    // Check for game over first
    if (this.uiRenderer.renderGameOver(gameCtx, gameCanvas, gameState)) {
      return // Stop rendering if game is over
    }

    // Render all game elements in order
    let gpuRendered = false
    if (gpuContext && gpuCanvas) {
      if (!this.gpuRenderer) {
        this.gpuRenderer = new GameWebGLRenderer(gpuContext, this.textureManager)
      } else {
        this.gpuRenderer.setContext(gpuContext)
      }
      gpuRendered = this.gpuRenderer.render(mapGrid, scrollOffset, gpuCanvas)
    }

    // Build occupancy map for visualization if needed
    let occupancyMap = null
    if (gameState.occupancyVisible) {
      occupancyMap = gameState.occupancyMap
    }

    this.mapRenderer.render(
      gameCtx,
      mapGrid,
      scrollOffset,
      gameCanvas,
      gameState,
      occupancyMap,
      { skipBaseLayer: gpuRendered }
    )
    if (gameState.dzmOverlayIndex !== -1) {
      const ids = Object.keys(gameState.dangerZoneMaps || {})
      const pid = ids[gameState.dzmOverlayIndex]
      const dzm = pid ? gameState.dangerZoneMaps[pid] : null
      if (dzm) this.dangerZoneRenderer.render(gameCtx, dzm, scrollOffset, pid)
    }
    this.buildingRenderer.renderBases(gameCtx, buildings, mapGrid, scrollOffset)
    // Render initial construction yards using the same renderer
    this.buildingRenderer.renderBases(gameCtx, factories, mapGrid, scrollOffset)
    this.wreckRenderer.render(gameCtx, gameState.unitWrecks || [], scrollOffset)
    this.unitRenderer.renderBases(gameCtx, units, scrollOffset)
    this.effectsRenderer.render(gameCtx, bullets, gameState, units, scrollOffset)

    // Render mine indicators (skull overlays)
    renderMineIndicators(gameCtx, scrollOffset)

    // Render mine deployment and sweep previews
    if (gameState.mineDeploymentPreview) {
      renderMineDeploymentPreview(gameCtx, gameState.mineDeploymentPreview, scrollOffset)
    }
    if (gameState.sweepAreaPreview) {
      renderSweepAreaPreview(gameCtx, gameState.sweepAreaPreview, scrollOffset)
    }
    if (gameState.mineFreeformPaint) {
      renderFreeformSweepPreview(gameCtx, gameState.mineFreeformPaint, scrollOffset)
    }

    // Render movement target indicators (green triangles)
    this.movementTargetRenderer.render(gameCtx, units, scrollOffset)
    this.pathPlanningRenderer.render(gameCtx, units, scrollOffset)

    // Render retreat target indicators (orange circles)
    this.retreatTargetRenderer.renderRetreatTargets(gameCtx, units, scrollOffset)

    // Render guard mode indicators
    this.guardRenderer.render(gameCtx, units, scrollOffset)

    // Render queued attack chains (AGF ordering)
    this.renderQueuedAttackLines(gameCtx, scrollOffset)

    // Render harvester HUD overlay (if enabled)
    this.harvesterHUD.render(gameCtx, units, gameState, scrollOffset)

    this.buildingRenderer.renderOverlays(gameCtx, buildings, scrollOffset)
    this.buildingRenderer.renderOverlays(gameCtx, factories, scrollOffset)
    this.unitRenderer.renderOverlays(gameCtx, units, scrollOffset)

    this.uiRenderer.render(gameCtx, gameCanvas, gameState, selectionActive, selectionStart, selectionEnd, scrollOffset, factories, buildings, mapGrid, units)
  }

  renderMinimap(minimapCtx, minimapCanvas, mapGrid, scrollOffset, gameCanvas, units, buildings, gameState) {
    if (!minimapCtx) {
      return
    }
    this.minimapRenderer.render(minimapCtx, minimapCanvas, mapGrid, scrollOffset, gameCanvas, units, buildings, gameState)
  }

  // Expose texture manager methods for compatibility
  getOrLoadImage(baseName, extensions, callback) {
    return this.textureManager.getOrLoadImage(baseName, extensions, callback)
  }

  get allTexturesLoaded() {
    return this.textureManager.allTexturesLoaded
  }
}
