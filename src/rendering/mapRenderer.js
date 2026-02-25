// rendering/mapRenderer.js
import { TILE_SIZE, TILE_COLORS, USE_TEXTURES } from '../config.js'

const UNDISCOVERED_COLOR = '#111111'
const FOG_OVERLAY_STYLE = 'rgba(30, 30, 30, 0.6)'
const SHADOW_GRADIENT_SIZE = 6

export class MapRenderer {
  constructor(textureManager) {
    this.textureManager = textureManager
    this.chunkSize = 32
    this.chunkPadding = 2
    this.chunkCache = new Map()
    this.cachedUseTexture = null
    this.cachedMapWidth = 0
    this.cachedMapHeight = 0
    this.canUseOffscreen = typeof document !== 'undefined' && typeof document.createElement === 'function'
    // Precomputed SOT (Smoothening Overlay Texture) mask for performance optimization
    // sotMask[y][x] = { orientation: 'top-left'|'top-right'|'bottom-left'|'bottom-right', type: 'street'|'water' } or null
    this.sotMask = null
    this.sotMaskVersion = 0
  }

  /**
   * Compute the SOT (Smoothening Overlay Texture) mask for the entire map.
   * This should be called once when the map is loaded and when tile types change.
   * @param {Array} mapGrid - The map grid
   */
  computeSOTMask(mapGrid) {
    if (!mapGrid || !mapGrid.length || !mapGrid[0]?.length) {
      this.sotMask = null
      return
    }

    const mapHeight = mapGrid.length
    const mapWidth = mapGrid[0].length

    // Initialize mask array
    this.sotMask = Array.from({ length: mapHeight })
    for (let y = 0; y < mapHeight; y++) {
      this.sotMask[y] = Array.from({ length: mapWidth }, () => null)
    }

    // Compute SOT for each land or street tile
    // Land tiles get SOT for street/water corners, street tiles get SOT for water corners
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const tile = mapGrid[y][x]
        if (tile.type !== 'land' && tile.type !== 'street') continue

        const sotInfo = this.computeSOTForTile(mapGrid, x, y, mapWidth, mapHeight, tile.type)
        if (sotInfo) {
          this.sotMask[y][x] = sotInfo
        }
      }
    }

    this.sotMaskVersion++
  }

  /**
   * Compute SOT info for a single tile
   * @param {Array} mapGrid - The map grid
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @param {number} mapWidth - Map width in tiles
   * @param {number} mapHeight - Map height in tiles
   * @param {string} tileType - The type of the current tile ('land' or 'street')
   * @returns {Object|null} SOT info { orientation, type } or null
   */
  computeSOTForTile(mapGrid, x, y, mapWidth, mapHeight, tileType = 'land') {
    const top = y > 0 ? mapGrid[y - 1][x] : null
    const left = x > 0 ? mapGrid[y][x - 1] : null
    const bottom = y < mapHeight - 1 ? mapGrid[y + 1][x] : null
    const right = x < mapWidth - 1 ? mapGrid[y][x + 1] : null

    // For land tiles: check street corners first (streets take priority over water)
    if (tileType === 'land') {
      if (top && left && top.type === 'street' && left.type === 'street') {
        return { orientation: 'top-left', type: 'street' }
      }
      if (top && right && top.type === 'street' && right.type === 'street') {
        return { orientation: 'top-right', type: 'street' }
      }
      if (bottom && left && bottom.type === 'street' && left.type === 'street') {
        return { orientation: 'bottom-left', type: 'street' }
      }
      if (bottom && right && bottom.type === 'street' && right.type === 'street') {
        return { orientation: 'bottom-right', type: 'street' }
      }
    }

    // Check water corners (for both land and street tiles)
    if (top && left && top.type === 'water' && left.type === 'water') {
      return { orientation: 'top-left', type: 'water' }
    }
    if (top && right && top.type === 'water' && right.type === 'water') {
      return { orientation: 'top-right', type: 'water' }
    }
    if (bottom && left && bottom.type === 'water' && left.type === 'water') {
      return { orientation: 'bottom-left', type: 'water' }
    }
    if (bottom && right && bottom.type === 'water' && right.type === 'water') {
      return { orientation: 'bottom-right', type: 'water' }
    }

    return null
  }

  /**
   * Update SOT mask for a single tile and its neighbors when a tile mutation occurs.
   * This is more efficient than recomputing the entire mask.
   * @param {Array} mapGrid - The map grid
   * @param {number} tileX - The X coordinate of the changed tile
   * @param {number} tileY - The Y coordinate of the changed tile
   */
  updateSOTMaskForTile(mapGrid, tileX, tileY) {
    if (!this.sotMask || !mapGrid || !mapGrid.length) return

    const mapHeight = mapGrid.length
    const mapWidth = mapGrid[0]?.length || 0

    // Update the tile and its immediate neighbors (SOT depends on adjacent tiles)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = tileX + dx
        const y = tileY + dy

        if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) continue

        const tile = mapGrid[y][x]
        if (tile.type === 'land' || tile.type === 'street') {
          this.sotMask[y][x] = this.computeSOTForTile(mapGrid, x, y, mapWidth, mapHeight, tile.type)
        } else {
          this.sotMask[y][x] = null
        }
      }
    }

    this.sotMaskVersion++
    // Mark affected chunks as dirty
    this.markTileDirty(tileX, tileY)
  }

  invalidateAllChunks() {
    if (this.chunkCache.size) {
      this.chunkCache.clear()
    }
    // Also invalidate SOT mask since map dimensions may have changed
    this.sotMask = null
  }

  markTileDirty(tileX, tileY) {
    if (!this.canUseOffscreen || !this.chunkCache.size) return
    const chunkX = Math.floor(tileX / this.chunkSize)
    const chunkY = Math.floor(tileY / this.chunkSize)

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = this.getChunkKey(chunkX + dx, chunkY + dy)
        const chunk = this.chunkCache.get(key)
        if (chunk) {
          chunk.signature = null
          chunk.lastWaterFrameIndex = null
        }
      }
    }
  }

  getChunkKey(chunkX, chunkY) {
    return `${chunkX},${chunkY}`
  }

  ensureCacheValidity(mapGrid, useTexture) {
    const mapHeight = mapGrid.length
    const mapWidth = mapGrid[0]?.length || 0

    if (mapWidth !== this.cachedMapWidth || mapHeight !== this.cachedMapHeight) {
      this.invalidateAllChunks()
      this.cachedMapWidth = mapWidth
      this.cachedMapHeight = mapHeight
    }

    if (this.cachedUseTexture !== useTexture) {
      this.invalidateAllChunks()
      this.cachedUseTexture = useTexture
    }
  }

  getOrCreateChunk(chunkX, chunkY, startX, startY, endX, endY) {
    const key = this.getChunkKey(chunkX, chunkY)
    let chunk = this.chunkCache.get(key)
    if (!chunk) {
      const canvas = this.canUseOffscreen ? document.createElement('canvas') : null
      const ctx = canvas ? canvas.getContext('2d') : null
      chunk = {
        canvas,
        ctx,
        startX,
        startY,
        endX,
        endY,
        signature: null,
        lastUseTexture: null,
        lastWaterFrameIndex: null,
        lastSotMaskVersion: null,
        containsWaterAnimation: false,
        padding: this.chunkPadding,
        offsetX: startX * TILE_SIZE - this.chunkPadding,
        offsetY: startY * TILE_SIZE - this.chunkPadding
      }
      this.chunkCache.set(key, chunk)
    } else {
      chunk.startX = startX
      chunk.startY = startY
      chunk.endX = endX
      chunk.endY = endY
      chunk.padding = this.chunkPadding
    }

    chunk.offsetX = startX * TILE_SIZE - chunk.padding
    chunk.offsetY = startY * TILE_SIZE - chunk.padding
    return chunk
  }

  computeChunkSignature(mapGrid, startX, startY, endX, endY) {
    const mapHeight = mapGrid.length
    const mapWidth = mapGrid[0]?.length || 0
    const extraStartX = Math.max(0, startX - 1)
    const extraStartY = Math.max(0, startY - 1)
    const extraEndX = Math.min(mapWidth, endX + 1)
    const extraEndY = Math.min(mapHeight, endY + 1)

    const parts = []
    let containsWater = false
    for (let y = extraStartY; y < extraEndY; y++) {
      const row = mapGrid[y]
      for (let x = extraStartX; x < extraEndX; x++) {
        const tile = row[x]
        parts.push(tile.type, tile.airstripStreet ? 1 : 0, tile.ore ? 1 : 0, tile.seedCrystal ? 1 : 0, tile.noBuild || 0)
        if (tile.type === 'water') containsWater = true
      }
    }

    return { signature: parts.join('|'), containsWater }
  }

  updateChunkCache(chunk, mapGrid, useTexture, currentWaterFrame) {
    if (!chunk.canvas || !chunk.ctx) return

    const { signature, containsWater } = this.computeChunkSignature(
      mapGrid,
      chunk.startX,
      chunk.startY,
      chunk.endX,
      chunk.endY
    )

    const hasWaterAnimation = containsWater && this.textureManager.waterFrames.length > 0
    const waterFrameIndex = hasWaterAnimation ? this.textureManager.waterFrameIndex : null

    const needsRedraw =
      chunk.signature !== signature ||
      chunk.lastUseTexture !== useTexture ||
      chunk.lastSotMaskVersion !== this.sotMaskVersion ||
      chunk.containsWaterAnimation !== hasWaterAnimation ||
      (hasWaterAnimation && chunk.lastWaterFrameIndex !== waterFrameIndex)

    if (!needsRedraw) return

    const tileWidth = chunk.endX - chunk.startX
    const tileHeight = chunk.endY - chunk.startY
    const width = tileWidth * TILE_SIZE + chunk.padding * 2 + 1
    const height = tileHeight * TILE_SIZE + chunk.padding * 2 + 1

    if (chunk.canvas.width !== width || chunk.canvas.height !== height) {
      chunk.canvas.width = width
      chunk.canvas.height = height
      chunk.ctx = chunk.canvas.getContext('2d')
    } else {
      chunk.ctx.clearRect(0, 0, width, height)
    }

    chunk.ctx.imageSmoothingEnabled = false
    this.drawBaseLayer(
      chunk.ctx,
      mapGrid,
      chunk.startX,
      chunk.startY,
      chunk.endX,
      chunk.endY,
      chunk.offsetX,
      chunk.offsetY,
      useTexture,
      currentWaterFrame
    )

    chunk.signature = signature
    chunk.lastUseTexture = useTexture
    chunk.lastSotMaskVersion = this.sotMaskVersion
    chunk.containsWaterAnimation = hasWaterAnimation
    chunk.lastWaterFrameIndex = hasWaterAnimation ? waterFrameIndex : null
  }

  renderTiles(ctx, mapGrid, scrollOffset, startTileX, startTileY, endTileX, endTileY, _gameState) {
    // Disable image smoothing to prevent antialiasing gaps between tiles
    ctx.imageSmoothingEnabled = false

    const useTexture = USE_TEXTURES && this.textureManager.allTexturesLoaded
    const currentWaterFrame = this.textureManager.waterFrames.length
      ? this.textureManager.getCurrentWaterFrame()
      : null

    // Ensure SOT mask is computed before any rendering (needed for chunk caching)
    if (!this.sotMask) {
      this.computeSOTMask(mapGrid)
    }

    if (!this.canUseOffscreen) {
      this.drawBaseLayer(
        ctx,
        mapGrid,
        startTileX,
        startTileY,
        endTileX,
        endTileY,
        scrollOffset.x,
        scrollOffset.y,
        useTexture,
        currentWaterFrame
      )
      ctx.imageSmoothingEnabled = true
      return
    }

    this.ensureCacheValidity(mapGrid, useTexture)

    const mapWidth = mapGrid[0]?.length || 0
    const mapHeight = mapGrid.length

    const startChunkX = Math.max(0, Math.floor(startTileX / this.chunkSize))
    const startChunkY = Math.max(0, Math.floor(startTileY / this.chunkSize))
    const endChunkX = Math.ceil(endTileX / this.chunkSize)
    const endChunkY = Math.ceil(endTileY / this.chunkSize)

    for (let chunkY = startChunkY; chunkY < endChunkY; chunkY++) {
      const chunkStartY = chunkY * this.chunkSize
      if (chunkStartY >= mapHeight) break
      const chunkEndY = Math.min(mapHeight, chunkStartY + this.chunkSize)

      for (let chunkX = startChunkX; chunkX < endChunkX; chunkX++) {
        const chunkStartX = chunkX * this.chunkSize
        if (chunkStartX >= mapWidth) break
        const chunkEndX = Math.min(mapWidth, chunkStartX + this.chunkSize)

        const chunk = this.getOrCreateChunk(chunkX, chunkY, chunkStartX, chunkStartY, chunkEndX, chunkEndY)

        if (!chunk.canvas || !chunk.ctx) {
          this.drawBaseLayer(
            ctx,
            mapGrid,
            chunkStartX,
            chunkStartY,
            chunkEndX,
            chunkEndY,
            scrollOffset.x,
            scrollOffset.y,
            useTexture,
            currentWaterFrame
          )
          continue
        }

        this.updateChunkCache(chunk, mapGrid, useTexture, currentWaterFrame)

        const drawX = Math.floor(chunkStartX * TILE_SIZE - scrollOffset.x) - chunk.padding
        const drawY = Math.floor(chunkStartY * TILE_SIZE - scrollOffset.y) - chunk.padding
        ctx.drawImage(chunk.canvas, drawX, drawY)
      }
    }

    // Re-enable image smoothing for other rendering
    ctx.imageSmoothingEnabled = true
  }

  drawBaseLayer(ctx, mapGrid, startTileX, startTileY, endTileX, endTileY, offsetX, offsetY, useTexture, currentWaterFrame) {
    if (!mapGrid.length || !mapGrid[0]?.length) return

    // Ensure SOT mask is computed
    if (!this.sotMask) {
      this.computeSOTMask(mapGrid)
    }

    const sotApplied = new Set()
    const scrollOffset = { x: offsetX, y: offsetY }

    for (let y = startTileY; y < endTileY; y++) {
      for (let x = startTileX; x < endTileX; x++) {
        const tile = mapGrid[y][x]
        const visualTileType = tile?.airstripStreet ? 'land' : tile.type
        const screenX = Math.floor(x * TILE_SIZE - offsetX)
        const screenY = Math.floor(y * TILE_SIZE - offsetY)

        this.drawTileBase(ctx, x, y, visualTileType, screenX, screenY, useTexture, currentWaterFrame)

        // Use precomputed SOT mask instead of computing neighbors each frame
        // SOT applies to land tiles (street/water corners) and street tiles (water corners)
        if ((visualTileType === 'land' || visualTileType === 'street') && this.sotMask[y]?.[x]) {
          const sotInfo = this.sotMask[y][x]
          this.drawSOT(ctx, x, y, sotInfo.orientation, scrollOffset, useTexture, sotApplied, sotInfo.type, currentWaterFrame)
        }

        if (tile.seedCrystal) {
          this.drawSeedOverlay(ctx, x, y, screenX, screenY, useTexture)
        } else if (tile.ore) {
          this.drawOreOverlay(ctx, x, y, screenX, screenY, useTexture)
        }
      }
    }
  }

  drawTileBase(ctx, tileX, tileY, type, screenX, screenY, useTexture, currentWaterFrame) {
    if (type === 'water' && this.textureManager.waterFrames.length) {
      const frame = currentWaterFrame || this.textureManager.getCurrentWaterFrame()
      if (frame) {
        ctx.drawImage(frame, screenX, screenY, TILE_SIZE + 1, TILE_SIZE + 1)
        return
      }
    }

    if (useTexture && this.textureManager.tileTextureCache[type]) {
      const cache = this.textureManager.tileTextureCache[type]
      if (cache && cache.length) {
        const idx = this.textureManager.getTileVariation(type, tileX, tileY)
        if (idx >= 0 && idx < cache.length) {
          const info = cache[idx]
          ctx.drawImage(
            this.textureManager.spriteImage,
            info.x,
            info.y,
            info.width,
            info.height,
            screenX,
            screenY,
            TILE_SIZE + 1,
            TILE_SIZE + 1
          )
          return
        }
      }
    }

    ctx.fillStyle = TILE_COLORS[type]
    ctx.fillRect(screenX, screenY, TILE_SIZE + 1, TILE_SIZE + 1)
  }

  drawOreOverlay(ctx, tileX, tileY, screenX, screenY, useTexture) {
    const cache = this.textureManager.tileTextureCache.ore
    if (useTexture && cache && cache.length) {
      const idx = this.textureManager.getTileVariation('ore', tileX, tileY)
      if (idx >= 0 && idx < cache.length) {
        const info = cache[idx]
        ctx.drawImage(
          this.textureManager.spriteImage,
          info.x,
          info.y,
          info.width,
          info.height,
          screenX,
          screenY,
          TILE_SIZE + 1,
          TILE_SIZE + 1
        )
        return
      }
    }

    ctx.fillStyle = TILE_COLORS.ore
    ctx.fillRect(screenX, screenY, TILE_SIZE + 1, TILE_SIZE + 1)
  }

  drawSeedOverlay(ctx, tileX, tileY, screenX, screenY, useTexture) {
    const cache = this.textureManager.tileTextureCache.seedCrystal
    if (useTexture && cache && cache.length) {
      const idx = this.textureManager.getTileVariation('seedCrystal', tileX, tileY)
      if (idx >= 0 && idx < cache.length) {
        const info = cache[idx]
        ctx.drawImage(
          this.textureManager.spriteImage,
          info.x,
          info.y,
          info.width,
          info.height,
          screenX,
          screenY,
          TILE_SIZE + 1,
          TILE_SIZE + 1
        )
        return
      }
    }

    ctx.fillStyle = TILE_COLORS.seedCrystal
    ctx.fillRect(screenX, screenY, TILE_SIZE + 1, TILE_SIZE + 1)
  }

  applyVisibilityOverlay(ctx, mapGrid, startTileX, startTileY, endTileX, endTileY, scrollOffset, gameState) {
    const visibilityMap = gameState?.visibilityMap
    const shadowEnabled = Boolean(gameState?.shadowOfWarEnabled && visibilityMap && visibilityMap.length)

    if (!shadowEnabled) return

    for (let y = startTileY; y < endTileY; y++) {
      for (let x = startTileX; x < endTileX; x++) {
        const tileVisibility = visibilityMap[y] ? visibilityMap[y][x] : null
        const screenX = Math.floor(x * TILE_SIZE - scrollOffset.x)
        const screenY = Math.floor(y * TILE_SIZE - scrollOffset.y)

        if (!tileVisibility || !tileVisibility.discovered) {
          this.drawUndiscoveredOverlay(ctx, x, y, screenX, screenY, visibilityMap)
          continue
        }

        if (!tileVisibility.visible) {
          ctx.fillStyle = FOG_OVERLAY_STYLE
          ctx.fillRect(screenX, screenY, TILE_SIZE + 1, TILE_SIZE + 1)
        }
      }
    }
  }

  drawUndiscoveredOverlay(ctx, tileX, tileY, screenX, screenY, visibilityMap) {
    const tilePixelSize = TILE_SIZE + 1
    ctx.fillStyle = UNDISCOVERED_COLOR
    ctx.fillRect(screenX, screenY, tilePixelSize, tilePixelSize)

    if (SHADOW_GRADIENT_SIZE <= 0) return

    const gradientWidth = Math.min(SHADOW_GRADIENT_SIZE, Math.floor(tilePixelSize / 2))
    const mapHeight = visibilityMap.length
    const mapWidth = visibilityMap[0]?.length || 0

    if (!gradientWidth || !mapHeight || !mapWidth) return

    const neighborDiscovered = {
      left: tileX > 0 && Boolean(visibilityMap[tileY]?.[tileX - 1]?.discovered),
      right: tileX < mapWidth - 1 && Boolean(visibilityMap[tileY]?.[tileX + 1]?.discovered),
      top: tileY > 0 && Boolean(visibilityMap[tileY - 1]?.[tileX]?.discovered),
      bottom: tileY < mapHeight - 1 && Boolean(visibilityMap[tileY + 1]?.[tileX]?.discovered)
    }

    if (!neighborDiscovered.left && !neighborDiscovered.right && !neighborDiscovered.top && !neighborDiscovered.bottom) {
      return
    }

    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'

    if (neighborDiscovered.left) {
      const gradient = ctx.createLinearGradient(screenX, screenY, screenX + gradientWidth, screenY)
      gradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(screenX, screenY, gradientWidth, tilePixelSize)
    }

    if (neighborDiscovered.right) {
      const gradient = ctx.createLinearGradient(screenX + tilePixelSize, screenY, screenX + tilePixelSize - gradientWidth, screenY)
      gradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(screenX + tilePixelSize - gradientWidth, screenY, gradientWidth, tilePixelSize)
    }

    if (neighborDiscovered.top) {
      const gradient = ctx.createLinearGradient(screenX, screenY, screenX, screenY + gradientWidth)
      gradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(screenX, screenY, tilePixelSize, gradientWidth)
    }

    if (neighborDiscovered.bottom) {
      const gradient = ctx.createLinearGradient(screenX, screenY + tilePixelSize, screenX, screenY + tilePixelSize - gradientWidth)
      gradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(screenX, screenY + tilePixelSize - gradientWidth, tilePixelSize, gradientWidth)
    }

    ctx.restore()
  }

  /**
   * Draw a Smoothening Overlay Texture (SOT) on a single tile
   */
  drawSOT(ctx, tileX, tileY, orientation, scrollOffset, useTexture, sotApplied, type = 'street', currentWaterFrame = null) {
    const key = `${tileX},${tileY}`
    if (sotApplied.has(key)) return
    sotApplied.add(key)

    // Offset SOT slightly to hide gaps on left/top edges and expand a bit
    const screenX = tileX * TILE_SIZE - scrollOffset.x - 1
    const screenY = tileY * TILE_SIZE - scrollOffset.y - 1
    const size = TILE_SIZE + 3

    ctx.save()
    ctx.beginPath()
    switch (orientation) {
      case 'top-left':
        ctx.moveTo(screenX, screenY)
        ctx.lineTo(screenX + size, screenY)
        ctx.lineTo(screenX, screenY + size)
        break
      case 'top-right':
        ctx.moveTo(screenX + size, screenY)
        ctx.lineTo(screenX, screenY)
        ctx.lineTo(screenX + size, screenY + size)
        break
      case 'bottom-left':
        ctx.moveTo(screenX, screenY + size)
        ctx.lineTo(screenX, screenY)
        ctx.lineTo(screenX + size, screenY + size)
        break
      case 'bottom-right':
        ctx.moveTo(screenX + size, screenY + size)
        ctx.lineTo(screenX, screenY + size)
        ctx.lineTo(screenX + size, screenY)
        break
    }
    ctx.closePath()
    ctx.clip()

    if (type === 'water' && this.textureManager.waterFrames.length) {
      const frame = currentWaterFrame || this.textureManager.getCurrentWaterFrame()
      if (frame) {
        ctx.drawImage(frame, screenX, screenY, size, size)
      } else {
        ctx.fillStyle = TILE_COLORS[type]
        ctx.fill()
      }
    } else if (useTexture) {
      const idx = this.textureManager.getTileVariation(type, tileX, tileY)
      if (idx >= 0 && idx < this.textureManager.tileTextureCache[type].length) {
        const info = this.textureManager.tileTextureCache[type][idx]
        ctx.drawImage(
          this.textureManager.spriteImage,
          info.x,
          info.y,
          info.width,
          info.height,
          screenX,
          screenY,
          size,
          size
        )
      } else {
        ctx.fillStyle = TILE_COLORS[type]
        ctx.fill()
      }
    } else {
      ctx.fillStyle = TILE_COLORS[type]
      ctx.fill()
    }
    ctx.restore()
  }

  renderGrid(ctx, startTileX, startTileY, endTileX, endTileY, scrollOffset, gameState) {
    // Draw grid lines only if zoomed in closely enough for better performance
    if (TILE_SIZE > 8 && gameState.gridVisible) { // Only draw grid when tiles are big enough to see and grid is enabled
      ctx.strokeStyle = 'rgba(0,0,0,0.1)'
      ctx.beginPath()

      // Draw vertical grid lines
      for (let x = startTileX; x <= endTileX; x++) {
        const lineX = x * TILE_SIZE - scrollOffset.x
        ctx.moveTo(lineX, startTileY * TILE_SIZE - scrollOffset.y)
        ctx.lineTo(lineX, endTileY * TILE_SIZE - scrollOffset.y)
      }

      // Draw horizontal grid lines
      for (let y = startTileY; y <= endTileY; y++) {
        const lineY = y * TILE_SIZE - scrollOffset.y
        ctx.moveTo(startTileX * TILE_SIZE - scrollOffset.x, lineY)
        ctx.lineTo(endTileX * TILE_SIZE - scrollOffset.x, lineY)
      }

      ctx.stroke()
    }
  }

  renderOccupancyMap(ctx, occupancyMap, startTileX, startTileY, endTileX, endTileY, scrollOffset, gameState) {
    if (!gameState.occupancyVisible || !occupancyMap) return

    const mode = gameState.occupancyMapViewMode || 'players'
    const mineOverlay = this.buildMineOverlay(mode, gameState.mines)

    for (let y = startTileY; y < endTileY; y++) {
      for (let x = startTileX; x < endTileX; x++) {
        if (y < 0 || y >= occupancyMap.length || x < 0 || x >= occupancyMap[0].length) continue

        const tileOccupied = Boolean(occupancyMap[y][x])
        const tileKey = `${x},${y}`
        const mineBlocked = mineOverlay && mineOverlay.has(tileKey)
        const tile = gameState?.mapGrid?.[y]?.[x]
        const buildOnlyStreet = Boolean(tile?.buildOnlyOccupied) && tile?.type === 'street'
        if (tileOccupied || mineBlocked || buildOnlyStreet) {
          const tileX = Math.floor(x * TILE_SIZE - scrollOffset.x)
          const tileY = Math.floor(y * TILE_SIZE - scrollOffset.y)
          ctx.fillStyle = buildOnlyStreet && !tileOccupied && !mineBlocked
            ? 'rgba(255, 255, 0, 0.35)'
            : 'rgba(255, 0, 0, 0.3)'
          ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE)
        }
      }
    }
  }

  buildMineOverlay(mode, mines) {
    if (!mode || mode === 'off' || !Array.isArray(mines) || mines.length === 0) return null

    const overlay = new Set()
    const showAll = mode === 'players'
    const specialOwner = showAll ? null : mode

    mines.forEach(mine => {
      if (!mine || !mine.active) return
      if (showAll || mine.owner === specialOwner) {
        overlay.add(`${mine.tileX},${mine.tileY}`)
      }
    })

    return overlay
  }

  /**
   * Render only the SOT (Smoothening Overlay Texture) overlays without base tiles.
   * Used when GPU rendering handles base tiles but SOT still needs 2D canvas rendering.
   * Also renders ore/seed overlays after SOT to ensure correct z-order (SOT below ore).
   */
  renderSOTOverlays(ctx, mapGrid, scrollOffset, startTileX, startTileY, endTileX, endTileY) {
    // Ensure SOT mask is computed
    if (!this.sotMask) {
      this.computeSOTMask(mapGrid)
    }

    const useTexture = USE_TEXTURES && this.textureManager.allTexturesLoaded
    const currentWaterFrame = this.textureManager.waterFrames.length
      ? this.textureManager.getCurrentWaterFrame()
      : null

    const sotApplied = new Set()

    // First pass: render all SOT overlays
    // SOT applies to land tiles (street/water corners) and street tiles (water corners)
    for (let y = startTileY; y < endTileY; y++) {
      for (let x = startTileX; x < endTileX; x++) {
        const tile = mapGrid[y][x]
        const visualTileType = tile?.airstripStreet ? 'land' : tile.type
        if ((visualTileType === 'land' || visualTileType === 'street') && this.sotMask[y]?.[x]) {
          const sotInfo = this.sotMask[y][x]
          this.drawSOT(ctx, x, y, sotInfo.orientation, scrollOffset, useTexture, sotApplied, sotInfo.type, currentWaterFrame)
        }
      }
    }

    // Second pass: render ore/seed overlays on top of SOT to maintain correct z-order
    for (let y = startTileY; y < endTileY; y++) {
      for (let x = startTileX; x < endTileX; x++) {
        const tile = mapGrid[y][x]
        const screenX = Math.floor(x * TILE_SIZE - scrollOffset.x)
        const screenY = Math.floor(y * TILE_SIZE - scrollOffset.y)

        if (tile.seedCrystal) {
          this.drawSeedOverlay(ctx, x, y, screenX, screenY, useTexture)
        } else if (tile.ore) {
          this.drawOreOverlay(ctx, x, y, screenX, screenY, useTexture)
        }
      }
    }
  }

  render(ctx, mapGrid, scrollOffset, gameCanvas, gameState, occupancyMap = null, options = {}) {
    const { skipBaseLayer = false } = options || {}
    // Guard against empty or invalid mapGrid
    if (!mapGrid || !Array.isArray(mapGrid) || mapGrid.length === 0 || !mapGrid[0]) {
      return
    }
    // Calculate visible tile range - improved for better performance
    const startTileX = Math.max(0, Math.floor(scrollOffset.x / TILE_SIZE))
    const startTileY = Math.max(0, Math.floor(scrollOffset.y / TILE_SIZE))
    const tilesX = Math.ceil(gameCanvas.width / TILE_SIZE) + 1
    const tilesY = Math.ceil(gameCanvas.height / TILE_SIZE) + 1
    const endTileX = Math.min(mapGrid[0].length, startTileX + tilesX)
    const endTileY = Math.min(mapGrid.length, startTileY + tilesY)

    if (!skipBaseLayer) {
      this.renderTiles(ctx, mapGrid, scrollOffset, startTileX, startTileY, endTileX, endTileY, gameState)
    } else {
      // When GPU renders base tiles, we still need to render SOT overlays with 2D canvas
      this.renderSOTOverlays(ctx, mapGrid, scrollOffset, startTileX, startTileY, endTileX, endTileY)
    }
    this.applyVisibilityOverlay(ctx, mapGrid, startTileX, startTileY, endTileX, endTileY, scrollOffset, gameState)
    this.renderGrid(ctx, startTileX, startTileY, endTileX, endTileY, scrollOffset, gameState)
    this.renderOccupancyMap(ctx, occupancyMap, startTileX, startTileY, endTileX, endTileY, scrollOffset, gameState)
  }
}
