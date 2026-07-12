// rendering/minimapRenderer.js
import { TILE_SIZE, TILE_COLORS, PARTY_COLORS } from '../config.js'
import { videoOverlay } from '../ui/videoOverlay.js'
import { gameRandom } from '../utils/gameRandom.js'
import { gameState } from '../gameState.js'
import {
  getPlayableViewportHeight,
  getPlayableViewportWidth
} from '../utils/layoutMetrics.js'
import { getCanvasPixelRatio } from './renderingUtils.js'

const MINIMAP_UNDISCOVERED_COLOR = '#111111'
const MINIMAP_FOG_COLOR = 'rgba(30, 30, 30, 0.6)'

export class MinimapRenderer {
  constructor() {
    // Cache for static minimap content (terrain/ore) so we don't redraw every frame
    this.mapCacheCanvas = document.createElement('canvas')
    this.mapCacheCtx = this.mapCacheCanvas.getContext('2d')
    this.cachedMapWidth = 0
    this.cachedMapHeight = 0
    this.cacheDirty = true

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
    this.cacheDirty = true
  }

  render(minimapCtx, minimapCanvas, mapGrid, scrollOffset, gameCanvas, units, buildings, gameState) {
    // Get the pixel ratio and CSS dimensions
    const pixelRatio = getCanvasPixelRatio(minimapCanvas)

    // Clear the entire canvas with proper scaling
    minimapCtx.setTransform(1, 0, 0, 1, 0, 0) // Reset transform
    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height)

    // Use logical/CSS dimensions for calculations
    const minimapLogicalWidth = parseInt(minimapCanvas.style.width, 10) || 250
    const minimapLogicalHeight = parseInt(minimapCanvas.style.height, 10) || 150

    const gridReady = Array.isArray(mapGrid) && mapGrid.length > 0 && Array.isArray(mapGrid[0])

    if (!gridReady) {
      minimapCtx.fillStyle = '#000'
      minimapCtx.fillRect(0, 0, minimapLogicalWidth, minimapLogicalHeight)
      minimapCtx.fillStyle = '#fff'
      minimapCtx.font = '12px "Rajdhani", "Arial Narrow", sans-serif'
      minimapCtx.textAlign = 'center'
      minimapCtx.textBaseline = 'middle'
      minimapCtx.fillText('Generating map…', minimapLogicalWidth / 2, minimapLogicalHeight / 2)
      return
    }

    const mapWidth = mapGrid[0].length
    const mapHeight = mapGrid.length

    // Calculate scale based on logical dimensions
    const scaleX = minimapLogicalWidth / (mapWidth * TILE_SIZE)
    const scaleY = minimapLogicalHeight / (mapHeight * TILE_SIZE)

    // Apply pixel ratio scaling
    minimapCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

    // Check if there's a video overlay playing
    if (videoOverlay.isVideoPlaying()) {
      // Render video overlay over the minimap
      this.renderVideoOverlay(minimapCtx, minimapLogicalWidth, minimapLogicalHeight)
      return // Skip normal minimap rendering while video is playing
    }

    // Modified: Check if radar is active instead of lowEnergyMode to determine visibility
    // Only draw the minimap if we have radar capability
    if (gameState && gameState.radarActive === false) {
      // If radar is disabled, draw a static/noise pattern instead of the actual map
      this.renderRadarOffline(minimapCtx, minimapLogicalWidth, minimapLogicalHeight)

      return // Skip the rest of the rendering
    }

    const visibilityMap = gameState?.visibilityMap
    const shadowEnabled = Boolean(gameState?.shadowOfWarEnabled && visibilityMap && visibilityMap.length)
    const friendlyOwners = new Set([gameState?.humanPlayer, 'player'])
    if (gameState?.humanPlayer === 'player1') {
      friendlyOwners.add('player1')
    }

    const isTileVisible = (tileX, tileY) => {
      if (!shadowEnabled) return true
      if (!visibilityMap || tileY < 0 || tileY >= visibilityMap.length) return false
      const row = visibilityMap[tileY]
      if (!row || tileX < 0 || tileX >= row.length) return false
      const cell = row[tileX]
      return Boolean(cell && cell.visible)
    }

    const isTileDiscovered = (tileX, tileY) => {
      if (!shadowEnabled) return true
      if (!visibilityMap || tileY < 0 || tileY >= visibilityMap.length) return false
      const row = visibilityMap[tileY]
      if (!row || tileX < 0 || tileX >= row.length) return false
      const cell = row[tileX]
      return Boolean(cell && cell.discovered)
    }

    const isStructureDiscovered = structure => {
      if (!structure) return false
      const width = Math.max(1, Math.round(structure.width || 1))
      const height = Math.max(1, Math.round(structure.height || 1))
      const startX = Math.floor(structure.x)
      const startY = Math.floor(structure.y)

      for (let offsetY = 0; offsetY < height; offsetY++) {
        for (let offsetX = 0; offsetX < width; offsetX++) {
          const tileX = startX + offsetX
          const tileY = startY + offsetY
          if (isTileDiscovered(tileX, tileY)) {
            return true
          }
        }
      }

      return false
    }

    const isStructureVisible = structure => {
      if (!structure) return false
      const width = Math.max(1, Math.round(structure.width || 1))
      const height = Math.max(1, Math.round(structure.height || 1))
      const startX = Math.floor(structure.x)
      const startY = Math.floor(structure.y)

      for (let offsetY = 0; offsetY < height; offsetY++) {
        for (let offsetX = 0; offsetX < width; offsetX++) {
          const tileX = startX + offsetX
          const tileY = startY + offsetY
          if (isTileVisible(tileX, tileY)) {
            return true
          }
        }
      }

      return false
    }

    // Draw cached map tiles (terrain + ore overlay)
    this.ensureMapCache(mapGrid)
    minimapCtx.drawImage(
      this.mapCacheCanvas,
      0,
      0,
      this.mapCacheCanvas.width,
      this.mapCacheCanvas.height,
      0,
      0,
      minimapLogicalWidth,
      minimapLogicalHeight
    )

    if (shadowEnabled) {
      const tileWidth = minimapLogicalWidth / mapWidth
      const tileHeight = minimapLogicalHeight / mapHeight
      const undiscoveredRects = []
      const fogRects = []

      for (let y = 0; y < mapHeight; y++) {
        const row = visibilityMap[y]
        for (let x = 0; x < mapWidth; x++) {
          const cell = row ? row[x] : null
          const destX = x * tileWidth
          const destY = y * tileHeight

          if (!cell || !cell.discovered) {
            undiscoveredRects.push(destX, destY)
          } else if (!cell.visible) {
            fogRects.push(destX, destY)
          }
        }
      }

      if (undiscoveredRects.length > 0) {
        minimapCtx.save()
        minimapCtx.globalCompositeOperation = 'destination-out'
        minimapCtx.fillStyle = '#000'
        for (let i = 0; i < undiscoveredRects.length; i += 2) {
          const destX = undiscoveredRects[i]
          const destY = undiscoveredRects[i + 1]
          minimapCtx.fillRect(destX, destY, tileWidth, tileHeight)
        }
        minimapCtx.restore()

        minimapCtx.fillStyle = MINIMAP_UNDISCOVERED_COLOR
        for (let i = 0; i < undiscoveredRects.length; i += 2) {
          const destX = undiscoveredRects[i]
          const destY = undiscoveredRects[i + 1]
          minimapCtx.fillRect(destX, destY, tileWidth, tileHeight)
        }
      }

      if (fogRects.length > 0) {
        minimapCtx.fillStyle = MINIMAP_FOG_COLOR
        for (let i = 0; i < fogRects.length; i += 2) {
          const destX = fogRects[i]
          const destY = fogRects[i + 1]
          minimapCtx.fillRect(destX, destY, tileWidth, tileHeight)
        }
      }
    }

    // Draw units with party colors
    units.forEach(unit => {
      const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
      const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
      if (
        shadowEnabled &&
        !friendlyOwners.has(unit.owner) &&
        (!isTileDiscovered(tileX, tileY) || !isTileVisible(tileX, tileY))
      ) {
        return
      }

      const partyColor = PARTY_COLORS[unit.owner]
      minimapCtx.fillStyle = partyColor || '#888' // Gray for unknown players
      const unitX = (unit.x + TILE_SIZE / 2) * scaleX
      const unitY = (unit.y + TILE_SIZE / 2) * scaleY
      minimapCtx.beginPath()
      minimapCtx.arc(unitX, unitY, 3, 0, 2 * Math.PI)
      minimapCtx.fill()
    })

    // Draw buildings if they exist with party colors
    if (buildings && buildings.length > 0) {
      buildings.forEach(building => {
        if (
          shadowEnabled &&
          !friendlyOwners.has(building.owner) &&
          (!isStructureDiscovered(building) || !isStructureVisible(building))
        ) {
          return
        }

        const partyColor = PARTY_COLORS[building.owner]
        minimapCtx.fillStyle = partyColor || '#888' // Gray for unknown players
        minimapCtx.fillRect(
          building.x * TILE_SIZE * scaleX,
          building.y * TILE_SIZE * scaleY,
          building.width * TILE_SIZE * scaleX,
          building.height * TILE_SIZE * scaleY
        )
      })
    }

    // Get logical canvas dimensions for viewport calculation
    const gameLogicalWidth = getPlayableViewportWidth(gameCanvas)
    const gameLogicalHeight = getPlayableViewportHeight(gameCanvas)

    // Draw viewport border
    minimapCtx.strokeStyle = '#FF0'
    minimapCtx.lineWidth = 2
    minimapCtx.strokeRect(
      scrollOffset.x * scaleX,
      scrollOffset.y * scaleY,
      gameLogicalWidth * scaleX,
      gameLogicalHeight * scaleY
    )
  }

  /**
   * Render video overlay directly on the minimap canvas
   */
  renderVideoOverlay(minimapCtx, minimapWidth, minimapHeight) {
    // Get the current video element from the overlay
    const videoElement = videoOverlay.getCurrentVideo()

    if (!videoElement || videoElement.readyState < 2) {
      // Video not ready, show loading state
      minimapCtx.fillStyle = '#000'
      minimapCtx.fillRect(0, 0, minimapWidth, minimapHeight)

      minimapCtx.fillStyle = '#00ff00'
      minimapCtx.font = '14px "Rajdhani", "Arial Narrow", sans-serif'
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
      minimapCtx.font = '12px "Rajdhani", "Arial Narrow", sans-serif'
      minimapCtx.textAlign = 'center'
      minimapCtx.fillText('Video Error', minimapWidth / 2, minimapHeight / 2)
    }

    // Draw the video without additional borders or progress bars
  }

  ensureMapCache(mapGrid) {
    if (!Array.isArray(mapGrid) || mapGrid.length === 0 || !Array.isArray(mapGrid[0])) {
      return
    }
    const width = mapGrid[0].length
    const height = mapGrid.length

    this.installTileWatchers(mapGrid)

    if (!this.cacheDirty && width === this.cachedMapWidth && height === this.cachedMapHeight) {
      return
    }

    this.cachedMapWidth = width
    this.cachedMapHeight = height
    this.mapCacheCanvas.width = width
    this.mapCacheCanvas.height = height

    const ctx = this.mapCacheCtx
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, width, height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = mapGrid[y][x]
        ctx.fillStyle = TILE_COLORS[tile.type]
        ctx.fillRect(x, y, 1, 1)

        if (tile.ore) {
          ctx.fillStyle = 'rgba(255,165,0,0.5)'
          ctx.fillRect(x, y, 1, 1)
        }
      }
    }

    this.cacheDirty = false
  }

  renderRadarOffline(minimapCtx, minimapWidth, minimapHeight) {
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
      baseCtx.font = '24px "Rajdhani", "Arial Narrow", sans-serif'
      baseCtx.textAlign = 'center'
      baseCtx.textBaseline = 'middle'
      baseCtx.fillText('RADAR OFFLINE', minimapWidth / 2, minimapHeight / 2)

      const grainCtx = this.radarOfflineGrainCtx
      grainCtx.clearRect(0, 0, minimapWidth, minimapHeight)
      for (let i = 0; i < 420; i++) {
        const x = gameRandom() * minimapWidth
        const y = gameRandom() * minimapHeight
        const size = gameRandom() * 2 + 0.6
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
    const grainShiftX = (elapsedSeconds * 27) % minimapWidth
    const grainShiftY = (elapsedSeconds * 43) % minimapHeight
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
      const size = gameRandom() * 1.8 + 0.4
      const opacity = gameRandom() * 0.5 + 0.1
      minimapCtx.fillStyle = `rgba(255,255,255,${opacity})`
      minimapCtx.fillRect(x, y, size, size)
    }
    minimapCtx.restore()

    // Subtle horizontal jitter line to mimic weak analog signal sync drift.
    const jitterY = (elapsedSeconds * 58) % minimapHeight
    minimapCtx.fillStyle = 'rgba(255,255,255,0.09)'
    minimapCtx.fillRect(0, jitterY, minimapWidth, 1)
  }

  installTileWatchers(mapGrid) {
    if (!Array.isArray(mapGrid) || mapGrid.length === 0 || !Array.isArray(mapGrid[0])) {
      return
    }

    if (mapGrid.__minimapWatchersInstalled) {
      return
    }

    const invalidate = () => {
      this.cacheDirty = true
    }

    const height = mapGrid.length
    const width = mapGrid[0].length

    for (let y = 0; y < height; y++) {
      const row = mapGrid[y]
      if (!Array.isArray(row)) continue
      for (let x = 0; x < width; x++) {
        const tile = row[x]
        if (!tile) continue
        if (tile.__minimapWatchersInstalled) {
          continue
        }

        let oreValue = tile.ore
        Object.defineProperty(tile, 'ore', {
          get() {
            return oreValue
          },
          set(newValue) {
            if (oreValue !== newValue) {
              oreValue = newValue
              invalidate()
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
              invalidate()
            }
          },
          configurable: true,
          enumerable: true
        })

        tile.__minimapWatchersInstalled = true
      }
    }

    mapGrid.__minimapWatchersInstalled = true
    this.cacheDirty = true
  }
}
