// rendering/minimapRenderer.js
import { TILE_SIZE, TILE_COLORS, PARTY_COLORS } from '../config.js'
import { videoOverlay } from '../ui/videoOverlay.js'
import { gameRandom } from '../utils/gameRandom.js'
import { gameState } from '../gameState.js'
import { renderProfiler } from '../performance/renderProfiler.js'
import { PROFILER_SPAN_IDS } from '../performance/profilerIds.js'
import { getCanvasViewportRecord } from './prepared/canvasViewportRegistry.js'

const MINIMAP_UNDISCOVERED_COLOR = '#111111'
const MINIMAP_FOG_COLOR = 'rgba(30, 30, 30, 0.6)'
const TERRAIN_REVISION = Symbol('minimapTerrainRevision')
const RESOURCE_REVISION = Symbol('minimapResourceRevision')
const TILE_WATCHERS_INSTALLED = Symbol('minimapTileWatchersInstalled')
const VISIBILITY_STATE = Symbol('minimapVisibilityState')
const VISIBILITY_WATCHER_INSTALLED = Symbol('minimapVisibilityWatcherInstalled')
const CELL_HASH_SEEDS = Object.freeze([0x45d9f3b, 0x119de1f3, 0x344b5409, 0x27d4eb2d])

function getCellToken(index, channel) {
  let value = Math.imul(index + 1, CELL_HASH_SEEDS[channel])
  value ^= value >>> 16
  value = Math.imul(value, 0x45d9f3b)
  return (value ^ (value >>> 16)) >>> 0
}

function isFriendlyOwner(owner, humanPlayer) {
  return owner === humanPlayer || owner === 'player' ||
    (humanPlayer === 'player1' && owner === 'player1')
}

export class MinimapRenderer {
  constructor() {
    this.terrainCacheCanvas = document.createElement('canvas')
    this.terrainCacheCtx = this.terrainCacheCanvas.getContext('2d')
    this.resourceCacheCanvas = document.createElement('canvas')
    this.resourceCacheCtx = this.resourceCacheCanvas.getContext('2d')
    this.visibilityCacheCanvas = document.createElement('canvas')
    this.visibilityCacheCtx = this.visibilityCacheCanvas.getContext('2d')
    // Preserve the old public cache aliases for diagnostics and integrations.
    this.mapCacheCanvas = this.terrainCacheCanvas
    this.mapCacheCtx = this.terrainCacheCtx
    this.cachedMapWidth = 0
    this.cachedMapHeight = 0
    this.cachedBackingWidth = 0
    this.cachedBackingHeight = 0
    this.cachedMapGrid = null
    this.cachedVisibilityMap = null
    this.cachedTerrainRevision = -1
    this.cachedResourceRevision = -1
    this.cachedVisibilityHashA = -1
    this.cachedVisibilityHashB = -1
    this.terrainInvalidation = 1
    this.resourceInvalidation = 1
    this.visibilityInvalidation = 1
    this.cachedTerrainInvalidation = 0
    this.cachedResourceInvalidation = 0
    this.cachedVisibilityInvalidation = 0

    // Cache for the "radar offline" base layer (background + label).
    this.radarOfflineCanvas = document.createElement('canvas')
    this.radarOfflineCtx = this.radarOfflineCanvas.getContext('2d')

    // Cache for radar-offline grain texture (white snow) reused by animation passes.
    this.radarOfflineGrainCanvas = document.createElement('canvas')
    this.radarOfflineGrainCtx = this.radarOfflineGrainCanvas.getContext('2d')

    this.cachedOfflineWidth = 0
    this.cachedOfflineHeight = 0
    this.radarOfflineAnimationStart = performance.now()
  }

  invalidateCache() {
    this.invalidateTerrainCache()
    this.invalidateResourceCache()
  }

  invalidateTerrainCache() {
    this.terrainInvalidation++
  }

  invalidateResourceCache() {
    this.resourceInvalidation++
  }

  invalidateVisibilityCache() {
    this.visibilityInvalidation++
  }

  render(minimapCtx, minimapCanvas, mapGrid, scrollOffset, gameCanvas, units, buildings, gameState) {
    const minimapRecord = getCanvasViewportRecord(minimapCanvas)
    const viewport = minimapRecord.viewport
    const pixelRatio = viewport.density
    const minimapLogicalWidth = viewport.logicalWidth
    const minimapLogicalHeight = viewport.logicalHeight
    const backingWidth = viewport.backingWidth
    const backingHeight = viewport.backingHeight

    minimapCtx.setTransform(1, 0, 0, 1, 0, 0)
    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height)

    const gridReady = Array.isArray(mapGrid) && mapGrid.length > 0 && Array.isArray(mapGrid[0])

    if (!gridReady) {
      const token = renderProfiler.startSpan(PROFILER_SPAN_IDS.MINIMAP_BASE)
      minimapCtx.fillStyle = '#000'
      minimapCtx.fillRect(0, 0, backingWidth, backingHeight)
      minimapCtx.fillStyle = '#fff'
      minimapCtx.font = `${12 * pixelRatio}px "Rajdhani", "Arial Narrow", sans-serif`
      minimapCtx.textAlign = 'center'
      minimapCtx.textBaseline = 'middle'
      minimapCtx.fillText('Generating map…', backingWidth / 2, backingHeight / 2)
      renderProfiler.endSpan(token)
      return
    }

    const mapWidth = mapGrid[0].length
    const mapHeight = mapGrid.length
    const scaleX = minimapLogicalWidth / (mapWidth * TILE_SIZE)
    const scaleY = minimapLogicalHeight / (mapHeight * TILE_SIZE)

    if (videoOverlay.isVideoPlaying()) {
      const token = renderProfiler.startSpan(PROFILER_SPAN_IDS.MINIMAP_VIDEO)
      try {
        this.renderVideoOverlay(minimapCtx, backingWidth, backingHeight, pixelRatio)
      } finally {
        renderProfiler.endSpan(token)
      }
      return
    }

    if (gameState && gameState.radarActive === false) {
      const token = renderProfiler.startSpan(PROFILER_SPAN_IDS.MINIMAP_BASE)
      try {
        this.renderRadarOffline(minimapCtx, backingWidth, backingHeight, pixelRatio)
      } finally {
        renderProfiler.endSpan(token)
      }
      return
    }

    const visibilityMap = gameState?.visibilityMap
    const shadowEnabled = Boolean(gameState?.shadowOfWarEnabled && visibilityMap && visibilityMap.length)
    const humanPlayer = gameState?.humanPlayer

    let token = renderProfiler.startSpan(PROFILER_SPAN_IDS.MINIMAP_BASE)
    try {
      this.ensureMapCache(mapGrid, backingWidth, backingHeight)
      minimapCtx.drawImage(this.terrainCacheCanvas, 0, 0)
      minimapCtx.drawImage(this.resourceCacheCanvas, 0, 0)
    } finally {
      renderProfiler.endSpan(token)
    }

    if (shadowEnabled) {
      token = renderProfiler.startSpan(PROFILER_SPAN_IDS.MINIMAP_FOG)
      try {
        this.ensureVisibilityCache(visibilityMap, mapWidth, mapHeight, backingWidth, backingHeight)
        minimapCtx.drawImage(this.visibilityCacheCanvas, 0, 0)
      } finally {
        renderProfiler.endSpan(token)
      }
    }

    minimapCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    token = renderProfiler.startSpan(PROFILER_SPAN_IDS.MINIMAP_ENTITIES)
    try {
      for (let index = 0; index < units.length; index++) {
        const unit = units[index]
        if (unit.embarkedOnId) continue
        const friendly = isFriendlyOwner(unit.owner, humanPlayer)
        if (unit.type === 'submarine' && unit.depthState === 'submerged' && !friendly) continue
        const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
        const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
        if (
          shadowEnabled &&
          !friendly &&
          (!this.isTileDiscovered(visibilityMap, tileX, tileY) ||
            !this.isTileVisible(visibilityMap, tileX, tileY))
        ) {
          continue
        }

        minimapCtx.fillStyle = PARTY_COLORS[unit.owner] || '#888'
        minimapCtx.beginPath()
        minimapCtx.arc(
          (unit.x + TILE_SIZE / 2) * scaleX,
          (unit.y + TILE_SIZE / 2) * scaleY,
          3,
          0,
          2 * Math.PI
        )
        minimapCtx.fill()
      }

      if (buildings) {
        for (let index = 0; index < buildings.length; index++) {
          const building = buildings[index]
          if (
            shadowEnabled &&
            !isFriendlyOwner(building.owner, humanPlayer) &&
            (!this.isStructureDiscovered(visibilityMap, building) ||
              !this.isStructureVisible(visibilityMap, building))
          ) {
            continue
          }

          minimapCtx.fillStyle = PARTY_COLORS[building.owner] || '#888'
          minimapCtx.fillRect(
            building.x * TILE_SIZE * scaleX,
            building.y * TILE_SIZE * scaleY,
            building.width * TILE_SIZE * scaleX,
            building.height * TILE_SIZE * scaleY
          )
        }
      }

      const gameRecord = getCanvasViewportRecord(gameCanvas)
      minimapCtx.strokeStyle = '#FF0'
      minimapCtx.lineWidth = 2
      minimapCtx.strokeRect(
        scrollOffset.x * scaleX,
        scrollOffset.y * scaleY,
        gameRecord.playableWidth * scaleX,
        gameRecord.playableHeight * scaleY
      )
    } finally {
      renderProfiler.endSpan(token)
    }
  }

  isTileVisible(visibilityMap, tileX, tileY) {
    if (!visibilityMap || tileY < 0 || tileY >= visibilityMap.length) return false
    const row = visibilityMap[tileY]
    if (!row || tileX < 0 || tileX >= row.length) return false
    return Boolean(row[tileX]?.visible)
  }

  isTileDiscovered(visibilityMap, tileX, tileY) {
    if (!visibilityMap || tileY < 0 || tileY >= visibilityMap.length) return false
    const row = visibilityMap[tileY]
    if (!row || tileX < 0 || tileX >= row.length) return false
    return Boolean(row[tileX]?.discovered)
  }

  isStructureDiscovered(visibilityMap, structure) {
    return this.isStructureInVisibilityState(visibilityMap, structure, false)
  }

  isStructureVisible(visibilityMap, structure) {
    return this.isStructureInVisibilityState(visibilityMap, structure, true)
  }

  isStructureInVisibilityState(visibilityMap, structure, requireVisible) {
    if (!structure) return false
    const width = Math.max(1, Math.round(structure.width || 1))
    const height = Math.max(1, Math.round(structure.height || 1))
    const startX = Math.floor(structure.x)
    const startY = Math.floor(structure.y)

    for (let offsetY = 0; offsetY < height; offsetY++) {
      for (let offsetX = 0; offsetX < width; offsetX++) {
        const tileX = startX + offsetX
        const tileY = startY + offsetY
        if (requireVisible
          ? this.isTileVisible(visibilityMap, tileX, tileY)
          : this.isTileDiscovered(visibilityMap, tileX, tileY)) {
          return true
        }
      }
    }
    return false
  }

  /**
   * Render video overlay directly on the minimap canvas
   */
  renderVideoOverlay(minimapCtx, minimapWidth, minimapHeight, pixelRatio = 1) {
    // Get the current video element from the overlay
    const videoElement = videoOverlay.getCurrentVideo()

    if (!videoElement || videoElement.readyState < 2) {
      // Video not ready, show loading state
      minimapCtx.fillStyle = '#000'
      minimapCtx.fillRect(0, 0, minimapWidth, minimapHeight)

      minimapCtx.fillStyle = '#00ff00'
      minimapCtx.font = `${14 * pixelRatio}px "Rajdhani", "Arial Narrow", sans-serif`
      minimapCtx.textAlign = 'center'
      minimapCtx.fillText('Loading...', minimapWidth / 2, minimapHeight / 2)
      return
    }

    // Calculate video dimensions maintaining aspect ratio
    const videoAspectRatio = videoElement.videoWidth / videoElement.videoHeight
    const minimapAspectRatio = minimapWidth / minimapHeight

    let renderWidth, renderHeight, offsetX, offsetY

    if (videoAspectRatio > minimapAspectRatio) {
      // Video is wider, fit to width
      renderWidth = minimapWidth
      renderHeight = minimapWidth / videoAspectRatio
      offsetX = 0
      offsetY = (minimapHeight - renderHeight) / 2
    } else {
      // Video is taller or same ratio, fit to height
      renderHeight = minimapHeight
      renderWidth = minimapHeight * videoAspectRatio
      offsetX = (minimapWidth - renderWidth) / 2
      offsetY = 0
    }

    // Clear the minimap area
    minimapCtx.fillStyle = '#000'
    minimapCtx.fillRect(0, 0, minimapWidth, minimapHeight)

    // Draw the video frame
    try {
      minimapCtx.drawImage(
        videoElement,
        offsetX,
        offsetY,
        renderWidth,
        renderHeight
      )
    } catch (error) {
      window.logger.warn('Failed to draw video frame:', error)
      // Fallback to loading text
      minimapCtx.fillStyle = '#ff0000'
      minimapCtx.font = `${12 * pixelRatio}px "Rajdhani", "Arial Narrow", sans-serif`
      minimapCtx.textAlign = 'center'
      minimapCtx.fillText('Video Error', minimapWidth / 2, minimapHeight / 2)
    }

    // Draw the video without additional borders or progress bars
  }

  ensureMapCache(mapGrid, backingWidth, backingHeight) {
    if (!Array.isArray(mapGrid) || mapGrid.length === 0 || !Array.isArray(mapGrid[0])) {
      return
    }
    const width = mapGrid[0].length
    const height = mapGrid.length

    this.installTileWatchers(mapGrid)
    this.ensureCacheDimensions(backingWidth, backingHeight)

    const mapChanged = mapGrid !== this.cachedMapGrid ||
      width !== this.cachedMapWidth ||
      height !== this.cachedMapHeight
    const terrainRevision = mapGrid[TERRAIN_REVISION] || 0
    const resourceRevision = mapGrid[RESOURCE_REVISION] || 0

    if (
      mapChanged ||
      terrainRevision !== this.cachedTerrainRevision ||
      this.terrainInvalidation !== this.cachedTerrainInvalidation
    ) {
      this.rebuildTerrainCache(mapGrid, width, height, backingWidth, backingHeight)
      this.cachedTerrainRevision = terrainRevision
      this.cachedTerrainInvalidation = this.terrainInvalidation
    }

    if (
      mapChanged ||
      resourceRevision !== this.cachedResourceRevision ||
      this.resourceInvalidation !== this.cachedResourceInvalidation
    ) {
      this.rebuildResourceCache(mapGrid, width, height, backingWidth, backingHeight)
      this.cachedResourceRevision = resourceRevision
      this.cachedResourceInvalidation = this.resourceInvalidation
    }

    this.cachedMapGrid = mapGrid
    this.cachedMapWidth = width
    this.cachedMapHeight = height
  }

  ensureCacheDimensions(backingWidth, backingHeight) {
    if (
      backingWidth === this.cachedBackingWidth &&
      backingHeight === this.cachedBackingHeight
    ) {
      return
    }

    this.cachedBackingWidth = backingWidth
    this.cachedBackingHeight = backingHeight
    this.terrainCacheCanvas.width = backingWidth
    this.terrainCacheCanvas.height = backingHeight
    this.resourceCacheCanvas.width = backingWidth
    this.resourceCacheCanvas.height = backingHeight
    this.visibilityCacheCanvas.width = backingWidth
    this.visibilityCacheCanvas.height = backingHeight
    this.cachedTerrainRevision = -1
    this.cachedResourceRevision = -1
    this.cachedVisibilityHashA = -1
    this.cachedVisibilityHashB = -1
  }

  rebuildTerrainCache(mapGrid, width, height, backingWidth, backingHeight) {
    const ctx = this.terrainCacheCtx
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, backingWidth, backingHeight)

    for (let y = 0; y < height; y++) {
      const top = Math.floor((y * backingHeight) / height)
      const bottom = Math.ceil(((y + 1) * backingHeight) / height)
      for (let x = 0; x < width; x++) {
        const tile = mapGrid[y][x]
        ctx.fillStyle = TILE_COLORS[tile.type]
        const left = Math.floor((x * backingWidth) / width)
        const right = Math.ceil(((x + 1) * backingWidth) / width)
        ctx.fillRect(left, top, right - left, bottom - top)
      }
    }
  }

  rebuildResourceCache(mapGrid, width, height, backingWidth, backingHeight) {
    const ctx = this.resourceCacheCtx
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, backingWidth, backingHeight)
    ctx.fillStyle = 'rgba(255,165,0,0.5)'

    for (let y = 0; y < height; y++) {
      const top = Math.floor((y * backingHeight) / height)
      const bottom = Math.ceil(((y + 1) * backingHeight) / height)
      for (let x = 0; x < width; x++) {
        const tile = mapGrid[y][x]
        if (tile.ore) {
          const left = Math.floor((x * backingWidth) / width)
          const right = Math.ceil(((x + 1) * backingWidth) / width)
          ctx.fillRect(left, top, right - left, bottom - top)
        }
      }
    }
  }

  ensureVisibilityCache(visibilityMap, mapWidth, mapHeight, backingWidth, backingHeight) {
    const state = this.installVisibilityWatchers(visibilityMap)
    if (!state) return
    const visibilityChanged = visibilityMap !== this.cachedVisibilityMap ||
      state.hashA !== this.cachedVisibilityHashA ||
      state.hashB !== this.cachedVisibilityHashB ||
      this.visibilityInvalidation !== this.cachedVisibilityInvalidation
    if (!visibilityChanged) return

    const ctx = this.visibilityCacheCtx
    ctx.clearRect(0, 0, backingWidth, backingHeight)
    for (let y = 0; y < mapHeight; y++) {
      const row = visibilityMap[y]
      const top = Math.floor((y * backingHeight) / mapHeight)
      const bottom = Math.ceil(((y + 1) * backingHeight) / mapHeight)
      for (let x = 0; x < mapWidth; x++) {
        const cell = row?.[x]
        if (cell?.visible) continue
        ctx.fillStyle = cell?.discovered ? MINIMAP_FOG_COLOR : MINIMAP_UNDISCOVERED_COLOR
        const left = Math.floor((x * backingWidth) / mapWidth)
        const right = Math.ceil(((x + 1) * backingWidth) / mapWidth)
        ctx.fillRect(left, top, right - left, bottom - top)
      }
    }

    this.cachedVisibilityMap = visibilityMap
    this.cachedVisibilityHashA = state.hashA
    this.cachedVisibilityHashB = state.hashB
    this.cachedVisibilityInvalidation = this.visibilityInvalidation
  }

  renderRadarOffline(minimapCtx, minimapWidth, minimapHeight, pixelRatio = 1) {
    if (this.cachedOfflineWidth !== minimapWidth || this.cachedOfflineHeight !== minimapHeight) {
      this.cachedOfflineWidth = minimapWidth
      this.cachedOfflineHeight = minimapHeight

      this.radarOfflineCanvas.width = minimapWidth
      this.radarOfflineCanvas.height = minimapHeight
      this.radarOfflineGrainCanvas.width = minimapWidth
      this.radarOfflineGrainCanvas.height = minimapHeight

      const baseCtx = this.radarOfflineCtx
      baseCtx.fillStyle = '#222'
      baseCtx.fillRect(0, 0, minimapWidth, minimapHeight)
      baseCtx.fillStyle = '#d22'
      baseCtx.font = `${24 * pixelRatio}px "Rajdhani", "Arial Narrow", sans-serif`
      baseCtx.textAlign = 'center'
      baseCtx.textBaseline = 'middle'
      baseCtx.fillText('RADAR OFFLINE', minimapWidth / 2, minimapHeight / 2)

      const grainCtx = this.radarOfflineGrainCtx
      grainCtx.clearRect(0, 0, minimapWidth, minimapHeight)
      for (let i = 0; i < 420; i++) {
        const x = gameRandom() * minimapWidth
        const y = gameRandom() * minimapHeight
        const size = (gameRandom() * 2 + 0.6) * pixelRatio
        const opacity = gameRandom() * 0.45
        grainCtx.fillStyle = `rgba(255,255,255,${opacity})`
        grainCtx.fillRect(x, y, size, size)
      }

      this.radarOfflineAnimationStart = performance.now()
    }

    minimapCtx.drawImage(this.radarOfflineCanvas, 0, 0)
    minimapCtx.drawImage(this.radarOfflineGrainCanvas, 0, 0)

    if (gameState?.radarOfflineAnimationEnabled === false) {
      return
    }

    const elapsedSeconds = (performance.now() - this.radarOfflineAnimationStart) / 1000

    // Old-TV style moving/flickering snow by scrolling/re-wrapping cached grain texture.
    const grainShiftX = (elapsedSeconds * 27 * pixelRatio) % minimapWidth
    const grainShiftY = (elapsedSeconds * 43 * pixelRatio) % minimapHeight
    minimapCtx.save()
    minimapCtx.globalAlpha = 0.28
    minimapCtx.globalCompositeOperation = 'screen'
    minimapCtx.drawImage(this.radarOfflineGrainCanvas, -grainShiftX, -grainShiftY)
    minimapCtx.drawImage(this.radarOfflineGrainCanvas, minimapWidth - grainShiftX, -grainShiftY)
    minimapCtx.drawImage(this.radarOfflineGrainCanvas, -grainShiftX, minimapHeight - grainShiftY)
    minimapCtx.drawImage(
      this.radarOfflineGrainCanvas,
      minimapWidth - grainShiftX,
      minimapHeight - grainShiftY
    )

    // Add a small random speckle burst each frame so snow visibly flickers.
    for (let i = 0; i < 70; i++) {
      const x = gameRandom() * minimapWidth
      const y = gameRandom() * minimapHeight
      const size = (gameRandom() * 1.8 + 0.4) * pixelRatio
      const opacity = gameRandom() * 0.5 + 0.1
      minimapCtx.fillStyle = `rgba(255,255,255,${opacity})`
      minimapCtx.fillRect(x, y, size, size)
    }
    minimapCtx.restore()

    // Subtle horizontal jitter line to mimic weak analog signal sync drift.
    const jitterY = (elapsedSeconds * 58 * pixelRatio) % minimapHeight
    minimapCtx.fillStyle = 'rgba(255,255,255,0.09)'
    minimapCtx.fillRect(0, jitterY, minimapWidth, pixelRatio)
  }

  installTileWatchers(mapGrid) {
    if (!Array.isArray(mapGrid) || mapGrid.length === 0 || !Array.isArray(mapGrid[0])) {
      return
    }

    if (mapGrid[TILE_WATCHERS_INSTALLED]) return
    mapGrid[TERRAIN_REVISION] = mapGrid[TERRAIN_REVISION] || 0
    mapGrid[RESOURCE_REVISION] = mapGrid[RESOURCE_REVISION] || 0

    const height = mapGrid.length
    const width = mapGrid[0].length

    for (let y = 0; y < height; y++) {
      const row = mapGrid[y]
      if (!Array.isArray(row)) continue
      for (let x = 0; x < width; x++) {
        const tile = row[x]
        if (!tile) continue

        let oreValue = tile.ore
        Object.defineProperty(tile, 'ore', {
          get() {
            return oreValue
          },
          set(newValue) {
            if (oreValue !== newValue) {
              oreValue = newValue
              mapGrid[RESOURCE_REVISION]++
            }
          },
          configurable: true,
          enumerable: true
        })

        let typeValue = tile.type
        Object.defineProperty(tile, 'type', {
          get() {
            return typeValue
          },
          set(newValue) {
            if (typeValue !== newValue) {
              typeValue = newValue
              mapGrid[TERRAIN_REVISION]++
            }
          },
          configurable: true,
          enumerable: true
        })

      }
    }

    mapGrid[TILE_WATCHERS_INSTALLED] = true
  }

  installVisibilityWatchers(visibilityMap) {
    if (!Array.isArray(visibilityMap) || visibilityMap.length === 0) return null
    const existingState = visibilityMap[VISIBILITY_STATE]
    if (existingState) return existingState

    const state = { hashA: 0, hashB: 0 }
    let cellIndex = 0
    for (let y = 0; y < visibilityMap.length; y++) {
      const row = visibilityMap[y]
      if (!Array.isArray(row)) continue
      for (let x = 0; x < row.length; x++, cellIndex++) {
        const cell = row[x]
        if (!cell || cell[VISIBILITY_WATCHER_INSTALLED]) continue

        let discoveredValue = cell.discovered
        const discoveredTokenA = getCellToken(cellIndex, 0)
        const discoveredTokenB = getCellToken(cellIndex, 2)
        if (discoveredValue) {
          state.hashA = (state.hashA ^ discoveredTokenA) >>> 0
          state.hashB = (state.hashB ^ discoveredTokenB) >>> 0
        }
        Object.defineProperty(cell, 'discovered', {
          get() {
            return discoveredValue
          },
          set(newValue) {
            if (Boolean(discoveredValue) !== Boolean(newValue)) {
              state.hashA = (state.hashA ^ discoveredTokenA) >>> 0
              state.hashB = (state.hashB ^ discoveredTokenB) >>> 0
            }
            discoveredValue = newValue
          },
          configurable: true,
          enumerable: true
        })

        let visibleValue = cell.visible
        const visibleTokenA = getCellToken(cellIndex, 1)
        const visibleTokenB = getCellToken(cellIndex, 3)
        if (visibleValue) {
          state.hashA = (state.hashA ^ visibleTokenA) >>> 0
          state.hashB = (state.hashB ^ visibleTokenB) >>> 0
        }
        Object.defineProperty(cell, 'visible', {
          get() {
            return visibleValue
          },
          set(newValue) {
            if (Boolean(visibleValue) !== Boolean(newValue)) {
              state.hashA = (state.hashA ^ visibleTokenA) >>> 0
              state.hashB = (state.hashB ^ visibleTokenB) >>> 0
            }
            visibleValue = newValue
          },
          configurable: true,
          enumerable: true
        })

        cell[VISIBILITY_WATCHER_INSTALLED] = true
      }
    }
    visibilityMap[VISIBILITY_STATE] = state
    return state
  }
}
