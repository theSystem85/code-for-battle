// rendering/renderer.js
import { TextureManager } from './textureManager.js'
import { performanceMonitor } from '../performance/performanceMonitor.js'
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
import { preloadDestroyerImage } from './destroyerImageRenderer.js'
import { preloadSupplyShipImage } from './supplyShipImageRenderer.js'
import { WreckRenderer } from './wreckRenderer.js'
import { renderMineIndicators, renderMineDeploymentPreview, renderSweepAreaPreview, renderFreeformSweepPreview } from './mineRenderer.js'
import { GameWebGLRenderer } from './webglRenderer.js'
import { GameWebGPURenderer } from './webgpuRenderer.js'
import { getCanvasLogicalSize } from './renderingUtils.js'
import { selectedUnits } from '../inputHandler.js'
import {
  RENDERER_BACKEND,
  TILE_SIZE,
  USE_PROCEDURAL_WATER_RENDERING,
  getRendererBackendChoice,
  noteActiveRendererBackend,
  setRendererBackendFailureSummary
} from '../config.js'
import { summarizeWebGPUFailure } from './rendererBackendSelection.js'
import { FRAME_PHASE, framePhases } from '../performance/framePhases.js'
import { isAirborneUnit } from '../game/movementHelpers.js'
import { renderProfiler } from '../performance/renderProfiler.js'
import { PROFILER_SPAN_IDS } from '../performance/profilerIds.js'
import {
  bindRenderingDensityPreparation,
  prepareRuntimeSprites
} from './prepared/renderingPipeline.js'

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
    this.webgpuRenderer = null
    this.gpuOverlay = {
      backend: 'cpu',
      fallbackReason: null,
      bytesInUse: null,
      maxBufferSize: null,
      vendor: '',
      architecture: '',
      drawCalls: 0,
      canvasWidth: 0,
      canvasHeight: 0,
      devicePixelRatio: 1,
      gpuMilliseconds: null
    }
    // renderGame runs once per animation frame. These containers are mutated in
    // place so a 200-entity scene does not allocate six replacement lists and
    // a target index on every one of the 75 expected frames per second.
    this.frameLayers = {
      groundedUnits: [],
      airborneUnits: [],
      visibleGroundedUnits: [],
      visibleAirborneUnits: [],
      visibleBuildings: [],
      visibleFactories: []
    }
    this.frameEntityIndex = new Map()
    this.attackQueueBuffer = []
  }

  publishGpuOverlay(gpuBackend, frameDrawCalls, wantsWebGPU, webgpuCanvas, gpuCanvas) {
    const overlay = this.gpuOverlay
    const webgpu = this.webgpuRenderer
    const activeCanvas = gpuBackend === 'webgpu' ? webgpuCanvas : gpuCanvas
    const activeRenderer = gpuBackend === 'webgpu' ? webgpu : this.gpuRenderer
    const timing = activeRenderer?.gpuTiming
    overlay.backend = gpuBackend
    overlay.fallbackReason = gpuBackend !== 'webgpu' && wantsWebGPU && webgpu?.status === 'failed'
      ? summarizeWebGPUFailure(webgpu.failureReason)
      : null
    overlay.bytesInUse = gpuBackend === 'webgpu' ? webgpu.gpuMemory.bytesInUse : null
    overlay.maxBufferSize = Number.isFinite(webgpu?.maxBufferSize) ? webgpu.maxBufferSize : null
    overlay.vendor = webgpu?.adapterInfo?.vendor || ''
    overlay.architecture = webgpu?.adapterInfo?.architecture || ''
    overlay.drawCalls = frameDrawCalls
    overlay.canvasWidth = activeCanvas?.width || 0
    overlay.canvasHeight = activeCanvas?.height || 0
    overlay.devicePixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    overlay.gpuMilliseconds = gpuBackend === 'webgpu' && timing?.available && Number.isFinite(timing.milliseconds)
      ? timing.milliseconds
      : null
  }

  partitionUnitsByRenderLayer(units) {
    const { groundedUnits, airborneUnits } = this.frameLayers
    groundedUnits.length = 0
    airborneUnits.length = 0

    ;(units || []).forEach(unit => {
      if (isAirborneUnit(unit) || unit.carrierId || unit.carrierOperation?.carrierId) {
        airborneUnits.push(unit)
        return
      }
      groundedUnits.push(unit)
    })

    return this.frameLayers
  }

  setPreparedSpriteRegistry(registry) {
    this.buildingRenderer.setPreparedSpriteRegistry(registry)
    this.wreckRenderer.setPreparedSpriteRegistry?.(registry)
  }

  frameNeedsEntityIndex(units, buildings, factories, wrecks, currentGameState) {
    if (currentGameState?.attackGroupTargets?.length) return true
    if (selectedUnits?.some(entity =>
      entity?.selected && (
        entity.target?.id !== undefined ||
        entity.attackQueue?.length ||
        entity.forcedAttackTarget?.id !== undefined ||
        entity.forcedAttackQueue?.length ||
        entity.utilityQueue?.currentTargetId ||
        entity.utilityQueue?.targets?.length
      )
    )) {
      return true
    }
    for (const unit of units || []) {
      if (
        unit?.refuelTarget?.id !== undefined ||
        unit?.ammoResupplyTarget?.id !== undefined ||
        unit?.targetRefinery ||
        unit?.utilityQueue?.currentTargetId ||
        unit?.utilityQueue?.targets?.length ||
        (unit?.selected && unit?.embarkedUnitIds?.length)
      ) {
        return true
      }
    }
    for (const building of buildings || []) {
      if (
        building?.type === 'constructionYard' ||
        building?.type === 'vehicleFactory'
      ) {
        return true
      }
    }
    return false
  }

  prepareFrameEntityIndex(units, buildings, factories, wrecks, currentGameState) {
    const index = this.frameEntityIndex
    index.clear()
    if (!this.frameNeedsEntityIndex(units, buildings, factories, wrecks, currentGameState)) {
      return null
    }

    for (const unit of units || []) {
      if (unit?.id !== undefined) index.set(`unit:${unit.id}`, unit)
    }
    for (const building of buildings || []) {
      if (!building) continue
      if (building.id !== undefined) index.set(`building:${building.id}`, building)
      if (building.type === 'oreRefinery') {
        index.set(`refinery:${building.id || `refinery_${building.x}_${building.y}`}`, building)
      }
    }
    for (const factory of factories || []) {
      if (!factory) continue
      if (factory.id !== undefined) {
        index.set(`factory:${factory.id}`, factory)
        index.set(`building:${factory.id}`, factory)
      }
      if (factory.type === 'oreRefinery') {
        index.set(`refinery:${factory.id || `refinery_${factory.x}_${factory.y}`}`, factory)
      }
    }
    for (const wreck of wrecks || []) {
      if (wreck?.id !== undefined) index.set(`wreck:${wreck.id}`, wreck)
    }
    for (const target of currentGameState.attackGroupTargets || []) {
      if (target?.id !== undefined) index.set(`attackIndicator:${target.id}`, true)
    }
    for (const selected of selectedUnits || []) {
      if (!selected?.selected) continue
      if (selected.target?.id !== undefined) index.set(`attackIndicator:${selected.target.id}`, true)
      for (const target of selected.attackQueue || []) {
        if (target?.id !== undefined) index.set(`attackIndicator:${target.id}`, true)
      }
      if (selected.isBuilding && selected.owner === currentGameState.humanPlayer) {
        let position = 1
        if (selected.forcedAttackTarget?.id !== undefined) {
          this.setMinimumFramePosition(index, `forcedAttackPosition:${selected.forcedAttackTarget.id}`, position++)
        }
        for (const target of selected.forcedAttackQueue || []) {
          if (target?.id !== undefined) {
            this.setMinimumFramePosition(index, `forcedAttackPosition:${target.id}`, position)
          }
          position++
        }
      }
      this.indexUtilityTargets(index, selected)
    }
    return index
  }

  setMinimumFramePosition(index, key, position) {
    const current = index.get(key)
    if (!Number.isFinite(current) || position < current) index.set(key, position)
  }

  indexUtilityTargets(index, selected) {
    if (!['ambulance', 'tankerTruck', 'recoveryTank'].includes(selected.type)) return
    const queue = selected.utilityQueue
    let position = 1
    if (queue?.currentTargetId) {
      this.setMinimumFramePosition(
        index,
        `utilityPosition:${queue.currentTargetType || 'unit'}:${queue.currentTargetId}`,
        position++
      )
    }
    for (const entry of queue?.targets || []) {
      const id = typeof entry === 'object' ? entry?.id : entry
      const type = typeof entry === 'object' ? (entry?.type || 'unit') : 'unit'
      if (id !== undefined) this.setMinimumFramePosition(index, `utilityPosition:${type}:${id}`, position)
      position++
    }
    const directTargets = [
      selected.repairTarget,
      selected.repairTargetUnit,
      selected.towedUnit,
      selected.healingTarget,
      selected.refuelTarget,
      selected.emergencyTarget
    ]
    for (const target of directTargets) {
      if (target?.id !== undefined) this.setMinimumFramePosition(index, `utilityPosition:unit:${target.id}`, 1)
    }
  }

  getRenderableAttackQueue(entity) {
    const queue = this.attackQueueBuffer
    queue.length = 0
    if (!entity) {
      return queue
    }

    if (Array.isArray(entity.attackQueue) && entity.attackQueue.length > 0) {
      for (const target of entity.attackQueue) {
        if (target && (target.health === undefined || target.health > 0)) queue.push(target)
      }
      return queue
    }

    if (entity.isBuilding) {
      if (entity.forcedAttackTarget && (entity.forcedAttackTarget.health === undefined || entity.forcedAttackTarget.health > 0)) {
        queue.push(entity.forcedAttackTarget)
      }
      if (Array.isArray(entity.forcedAttackQueue) && entity.forcedAttackQueue.length > 0) {
        for (const target of entity.forcedAttackQueue) {
          if (target && (target.health === undefined || target.health > 0)) queue.push(target)
        }
      }
      return queue
    }

    return queue
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

    selectedUnits.forEach(attacker => {
      if (!attacker?.selected) return
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
  preloadTextures(callback, onProgress) {
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
    let destroyerLoaded = false
    let supplyShipLoaded = false

    let spritesPrepared = false

    const checkAllLoaded = () => {
      if (typeof onProgress === 'function') {
        const loadedCount = [
          texturesLoaded,
          tankImagesLoaded,
          harvesterLoaded,
          rocketTankLoaded,
          ambulanceLoaded,
          tankerLoaded,
          recoveryTankLoaded,
          ammunitionLoaded,
          howitzerLoaded,
          mineLayerLoaded,
          mineSweeperLoaded,
          destroyerLoaded,
          supplyShipLoaded,
          spritesPrepared
        ].filter(Boolean).length
        onProgress(loadedCount / 14)
      }
      if (texturesLoaded && tankImagesLoaded && harvesterLoaded && rocketTankLoaded && ambulanceLoaded && tankerLoaded && recoveryTankLoaded && ammunitionLoaded && howitzerLoaded && mineLayerLoaded && mineSweeperLoaded && destroyerLoaded && supplyShipLoaded && spritesPrepared) {
        this.wreckRenderer.prepareCaches?.(
          this.buildingRenderer.preparedSpriteRegistry?.density ||
          (typeof window !== 'undefined' ? window.devicePixelRatio : 1)
        )
        if (callback) callback()
      }
    }

    bindRenderingDensityPreparation()
    prepareRuntimeSprites().then(prepared => {
      if (prepared?.registry) this.buildingRenderer.setPreparedSpriteRegistry(prepared.registry)
    }).catch(error => {
      if (typeof window !== 'undefined') window.logger?.warn?.('Prepared sprites unavailable, using source images', error)
    }).finally(() => {
      spritesPrepared = true
      checkAllLoaded()
    })

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

    preloadDestroyerImage((success) => {
      if (!success) {
        window.logger.warn('Destroyer image failed to load')
      }
      destroyerLoaded = true
      checkAllLoaded()
    })

    preloadSupplyShipImage((success) => {
      if (!success) {
        window.logger.warn('Supply ship image failed to load')
      }
      supplyShipLoaded = true
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

  requestWebGPUAttempt() {
    const webgpuRenderer = this.webgpuRenderer
    if (!webgpuRenderer || webgpuRenderer.status !== 'failed') return
    webgpuRenderer.needsRestore = true
  }

  renderGame(gameCtx, gameCanvas, mapGrid, factories, units, bullets, buildings, scrollOffset, selectionActive, selectionStart, selectionEnd, gameState, gpuContext = null, gpuCanvas = null, webgpuCanvas = null) {
    if (!gameState || !gameCtx) {
      return
    }

    // If texture loading hasn't started yet, start it (this should only happen once)
    if (!this.textureManager.loadingStarted) {
      this.textureManager.preloadAllTextures()
    }

    const { width: logicalCanvasWidth, height: logicalCanvasHeight } = getCanvasLogicalSize(gameCanvas)
    gameCtx.clearRect(0, 0, logicalCanvasWidth, logicalCanvasHeight)

    // Check for game over first
    if (this.uiRenderer.renderGameOver(gameCtx, gameCanvas, gameState)) {
      return // Stop rendering if game is over
    }

    const monitorTiming = performanceMonitor.recording
    framePhases.begin(FRAME_PHASE.terrain)
    let entitiesMs = 0
    let effectsMs = 0
    let uiMs = 0
    // Render all game elements in order
    let gpuRendered = false
    const hasIntegratedWaterTiles = Boolean(
      gameState.useIntegratedSpriteSheetMode &&
      this.textureManager.integratedTagBuckets?.water?.length
    )
    const needsCpuTerrainComposite = !gameState.useIntegratedSpriteSheetMode
    const hasGpuStreetAtlas = Boolean(
      needsCpuTerrainComposite &&
      this.textureManager.defaultStreetTagBuckets?.street?.some(tile => tile?.image && tile?.rect)
    )
    // Keep animated procedural water isolated from static terrain. Mixing the
    // secondary street atlas into the procedural-water draw makes WebKit run
    // the water shader across a heterogeneous batch every frame, which causes
    // a severe physical-iPhone slowdown as soon as street/SOT tiles enter the
    // viewport. Static land and street art already lives in the bounded,
    // prewarmed 2D chunk cache, so only water and its SOT wedges belong here.
    const gpuWaterOnly = Boolean(
      (gameState.useIntegratedSpriteSheetMode && !hasIntegratedWaterTiles) ||
      needsCpuTerrainComposite
    )
    const shouldUseGpuTerrain = Boolean(
      USE_PROCEDURAL_WATER_RENDERING &&
      ((gpuContext && gpuCanvas) || (webgpuCanvas && typeof navigator !== 'undefined' && navigator.gpu)) &&
      (!gameState.useIntegratedSpriteSheetMode || gpuWaterOnly)
    )

    let gpuBackend = 'cpu'
    let frameDrawCalls = 0
    const wantsWebGPU = RENDERER_BACKEND === 'webgpu' && Boolean(webgpuCanvas) && typeof navigator !== 'undefined' && Boolean(navigator.gpu)
    if (shouldUseGpuTerrain && wantsWebGPU) {
      if (!this.webgpuRenderer) {
        this.webgpuRenderer = new GameWebGPURenderer(this.textureManager, this.mapRenderer)
      } else {
        this.webgpuRenderer.setMapRenderer(this.mapRenderer)
      }
      const drawsBefore = this.webgpuRenderer.stats?.drawCalls || 0
      gpuRendered = this.webgpuRenderer.render(mapGrid, scrollOffset, webgpuCanvas, { waterOnly: gpuWaterOnly })
      if (gpuRendered) {
        gpuBackend = 'webgpu'
        frameDrawCalls = (this.webgpuRenderer.stats?.drawCalls || 0) - drawsBefore
      }
    }

    if (shouldUseGpuTerrain && !gpuRendered) {
      if (!this.gpuRenderer) {
        this.gpuRenderer = new GameWebGLRenderer(gpuContext, this.textureManager, this.mapRenderer)
      } else {
        this.gpuRenderer.setContext(gpuContext)
        this.gpuRenderer.setMapRenderer(this.mapRenderer)
      }
      const drawsBefore = this.gpuRenderer.stats?.drawCalls || 0
      gpuRendered = this.gpuRenderer.render(mapGrid, scrollOffset, gpuCanvas, { waterOnly: gpuWaterOnly })
      if (gpuRendered) {
        gpuBackend = 'webgl'
        frameDrawCalls = (this.gpuRenderer.stats?.drawCalls || 0) - drawsBefore
      }
    } else if (gpuContext && gpuCanvas) {
      gpuContext.viewport(0, 0, gpuCanvas.width, gpuCanvas.height)
      gpuContext.clearColor(0, 0, 0, 0)
      gpuContext.clear(gpuContext.COLOR_BUFFER_BIT)
    }

    const showWebGPUCanvas = gpuBackend === 'webgpu' || (
      wantsWebGPU &&
      this.webgpuRenderer &&
      this.webgpuRenderer.status !== 'failed' &&
      this.webgpuRenderer.status !== 'idle'
    )
    if (webgpuCanvas?.style) webgpuCanvas.style.display = showWebGPUCanvas ? 'block' : 'none'
    if (gpuCanvas?.style) gpuCanvas.style.display = gpuBackend === 'webgpu' ? 'none' : 'block'
    if (gpuBackend === 'webgpu') {
      setRendererBackendFailureSummary(null)
      noteActiveRendererBackend('webgpu')
    } else if (wantsWebGPU && this.webgpuRenderer?.status === 'failed') {
      setRendererBackendFailureSummary(summarizeWebGPUFailure(this.webgpuRenderer.failureReason))
      noteActiveRendererBackend('webgl')
    } else if (!wantsWebGPU && RENDERER_BACKEND !== 'webgpu') {
      setRendererBackendFailureSummary(null)
      noteActiveRendererBackend('webgl')
    }
    this.publishGpuOverlay(gpuBackend, frameDrawCalls, wantsWebGPU, webgpuCanvas, gpuCanvas)

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
      {
        skipBaseLayer: gpuRendered && !gpuWaterOnly,
        skipWaterSot: gpuRendered && (gpuBackend === 'webgpu' ? this.webgpuRenderer?.rendersWaterSot : this.gpuRenderer?.rendersWaterSot),
        skipWaterBase: gpuRendered && gpuWaterOnly,
        gpuRenderedResources: gpuRendered && !gpuWaterOnly,
        separateWaterLayer: needsCpuTerrainComposite && !gpuRendered,
        gpuRenderedStreetTerrain: gpuRendered && !gpuWaterOnly && hasGpuStreetAtlas
      }
    )
    const terrainMs = framePhases.end(FRAME_PHASE.terrain)
    framePhases.noteDrawCalls(frameDrawCalls)

    const activeGpuRenderer = gpuBackend === 'webgpu' ? this.webgpuRenderer : this.gpuRenderer
    gameState.renderStats = {
      ...(gameState.renderStats || {}),
      mapChunks: this.mapRenderer.getLastFrameChunkStats?.() || null,
      gpuTiming: activeGpuRenderer?.gpuTiming || null,
      gpuOverlay: this.gpuOverlay,
      gpuTerrain: {
        rendered: gpuRendered,
        backend: gpuBackend,
        requestedBackend: RENDERER_BACKEND,
        rendererBackendChoice: getRendererBackendChoice(),
        webgpuStatus: this.webgpuRenderer?.getStatus?.() || null,
        waterOnly: gpuWaterOnly,
        streetAtlas: gpuRendered && !gpuWaterOnly && hasGpuStreetAtlas
      }
    }
    if (gameState.dzmOverlayIndex !== -1) {
      const ids = Object.keys(gameState.dangerZoneMaps || {})
      const pid = ids[gameState.dzmOverlayIndex]
      const dzm = pid ? gameState.dangerZoneMaps[pid] : null
      if (dzm) this.dangerZoneRenderer.render(gameCtx, dzm, scrollOffset, pid)
    }
    const opacityLevel = Number.isFinite(gameState.entityImageOpacityLevel)
      ? gameState.entityImageOpacityLevel
      : 0
    const entityImageAlpha = opacityLevel === 1 ? 0.5 : (opacityLevel === 2 ? 0 : 1)

    const {
      groundedUnits,
      airborneUnits,
      visibleGroundedUnits,
      visibleAirborneUnits,
      visibleBuildings,
      visibleFactories
    } = this.partitionUnitsByRenderLayer(units)
    const frameEntityIndex = this.prepareFrameEntityIndex(
      units,
      buildings,
      factories,
      gameState.unitWrecks,
      gameState
    )
    this.unitRenderer.collectVisibleUnits(gameCtx, groundedUnits, scrollOffset, visibleGroundedUnits)
    this.unitRenderer.collectVisibleUnits(gameCtx, airborneUnits, scrollOffset, visibleAirborneUnits)
    this.buildingRenderer.collectVisibleBuildings(gameCtx, buildings, scrollOffset, visibleBuildings)
    this.buildingRenderer.collectVisibleBuildings(gameCtx, factories, scrollOffset, visibleFactories)

    framePhases.begin(FRAME_PHASE.entities)
    const entityBasesSpan = renderProfiler.startSpan(PROFILER_SPAN_IDS.ENTITY_BASES)
    gameCtx.save()
    gameCtx.globalAlpha *= entityImageAlpha
    this.buildingRenderer.renderBases(gameCtx, visibleBuildings, mapGrid, scrollOffset, true)
    // Render initial construction yards using the same renderer
    this.buildingRenderer.renderBases(gameCtx, visibleFactories, mapGrid, scrollOffset, true)
    // Naval wakes belong to the water layer beneath ships and fade after movement stops.
    this.effectsRenderer.renderShipWakes?.(gameCtx, gameState, scrollOffset)
    this.effectsRenderer.renderDepthCharges?.(gameCtx, gameState, scrollOffset)
    this.wreckRenderer.render(gameCtx, gameState.unitWrecks || [], scrollOffset, frameEntityIndex)
    this.unitRenderer.renderBases(gameCtx, visibleGroundedUnits, scrollOffset, true)
    gameCtx.restore()
    renderProfiler.endSpan(entityBasesSpan)
    entitiesMs += framePhases.end(FRAME_PHASE.entities)

    framePhases.begin(FRAME_PHASE.effects)
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
    effectsMs = framePhases.end(FRAME_PHASE.effects)

    framePhases.begin(FRAME_PHASE.ui)
    const hudSpan = renderProfiler.startSpan(PROFILER_SPAN_IDS.HUD)
    // Render movement target indicators (green triangles)
    this.movementTargetRenderer.render(gameCtx, units, scrollOffset)
    this.pathPlanningRenderer.render(gameCtx, units, scrollOffset, frameEntityIndex)

    // Render retreat target indicators (orange circles)
    this.retreatTargetRenderer.renderRetreatTargets(gameCtx, units, scrollOffset)

    // Render guard mode indicators
    this.guardRenderer.render(gameCtx, units, scrollOffset)

    // Render queued attack chains (AGF ordering)
    this.renderQueuedAttackLines(gameCtx, scrollOffset)

    // Render harvester HUD overlay (if enabled)
    this.harvesterHUD.render(gameCtx, units, gameState, scrollOffset, frameEntityIndex)

    uiMs += framePhases.end(FRAME_PHASE.ui)
    framePhases.begin(FRAME_PHASE.entities)
    const entityOverlaysSpan = renderProfiler.startSpan(PROFILER_SPAN_IDS.ENTITY_OVERLAYS)
    this.buildingRenderer.renderOverlays(gameCtx, visibleBuildings, scrollOffset, true, frameEntityIndex)
    this.buildingRenderer.renderOverlays(gameCtx, visibleFactories, scrollOffset, true, frameEntityIndex)
    this.unitRenderer.renderOverlays(gameCtx, visibleGroundedUnits, scrollOffset, frameEntityIndex, units, true)
    gameCtx.save()
    gameCtx.globalAlpha *= entityImageAlpha
    this.unitRenderer.renderBases(gameCtx, visibleAirborneUnits, scrollOffset, true)
    gameCtx.restore()
    this.unitRenderer.renderOverlays(gameCtx, visibleAirborneUnits, scrollOffset, frameEntityIndex, units, true)
    renderProfiler.endSpan(entityOverlaysSpan)
    entitiesMs += framePhases.end(FRAME_PHASE.entities)
    framePhases.begin(FRAME_PHASE.ui)
    this.buildingRenderer.renderHudHoverTooltip(gameCtx, buildings, scrollOffset, factories)

    this.uiRenderer.render(gameCtx, gameCanvas, gameState, selectionActive, selectionStart, selectionEnd, scrollOffset, factories, buildings, mapGrid, units)
    renderProfiler.endSpan(hudSpan)
    uiMs += framePhases.end(FRAME_PHASE.ui)
    if (monitorTiming) {
      performanceMonitor.recordRendererPhases({ terrainMs, entitiesMs, effectsMs, uiMs })
    }
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
