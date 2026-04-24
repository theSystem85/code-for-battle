// rendering/mapRenderer.js
import {
  TILE_SIZE,
  TILE_COLORS,
  USE_TEXTURES,
  USE_PROCEDURAL_WATER_RENDERING,
  WATER_EFFECT_TONE,
  WATER_EFFECT_SATURATION,
  WATER_EFFECT_ZOOM
} from '../config.js'
import { getTileDecalSignature } from '../game/tileDecals.js'

const UNDISCOVERED_COLOR = '#111111'
const FOG_OVERLAY_STYLE = 'rgba(30, 30, 30, 0.6)'
const SHADOW_GRADIENT_SIZE = 6
const MIN_SOT_CLUSTER_SIZE = 5

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function mixColor(colorA, colorB, amount) {
  return colorA.map((channel, index) => channel + (colorB[index] - channel) * amount)
}

function applySaturation(color, saturation) {
  const luma = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722
  return color.map(channel => luma + (channel - luma) * saturation)
}

function toRgba(color, alpha = 1) {
  return `rgba(${clampChannel(color[0])}, ${clampChannel(color[1])}, ${clampChannel(color[2])}, ${alpha})`
}

function getSotComponentKey(x, y, tileType) {
  return `${tileType}:${x},${y}`
}

function getSotComponentInfo(mapGrid, startX, startY, tileType, analysisCache = null) {
  if (!mapGrid[startY]?.[startX] || mapGrid[startY][startX].type !== tileType) return null

  const cache = analysisCache ?? new Map()
  const cacheKey = getSotComponentKey(startX, startY, tileType)
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const visited = new Set([`${startX},${startY}`])
  const queue = [[startX, startY]]
  const tiles = []
  const maxY = mapGrid.length - 1
  const maxX = mapGrid[0]?.length - 1
  let enclosed = true

  while (queue.length) {
    const [x, y] = queue.shift()
    tiles.push([x, y])
    if (x === 0 || y === 0 || x === maxX || y === maxY) {
      enclosed = false
    }

    const neighbors = [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y]
    ]

    for (const [nextX, nextY] of neighbors) {
      const neighbor = mapGrid[nextY]?.[nextX]
      if (!neighbor) {
        enclosed = false
        continue
      }

      if (neighbor.type === tileType) {
        const key = `${nextX},${nextY}`
        if (!visited.has(key)) {
          visited.add(key)
          queue.push([nextX, nextY])
        }
        continue
      }

      if (neighbor.type !== 'water') {
        enclosed = false
      }
    }
  }

  const info = { size: tiles.length, enclosed }
  for (const [x, y] of tiles) {
    cache.set(getSotComponentKey(x, y, tileType), info)
  }

  return info
}

function hasMinimumSotCluster(mapGrid, startX, startY, tileType, analysisCache = null, minSize = MIN_SOT_CLUSTER_SIZE) {
  const info = getSotComponentInfo(mapGrid, startX, startY, tileType, analysisCache)
  return Boolean(info && info.size >= minSize)
}

function isEnclosedSotIsland(mapGrid, startX, startY, tileType, analysisCache = null) {
  const info = getSotComponentInfo(mapGrid, startX, startY, tileType, analysisCache)
  return Boolean(info?.enclosed)
}

function areTilesInSameEnclosedSotComponent(mapGrid, firstX, firstY, secondX, secondY, tileType, analysisCache = null) {
  const firstInfo = getSotComponentInfo(mapGrid, firstX, firstY, tileType, analysisCache)
  const secondInfo = getSotComponentInfo(mapGrid, secondX, secondY, tileType, analysisCache)

  return Boolean(
    firstInfo &&
    secondInfo &&
    firstInfo === secondInfo &&
    firstInfo.enclosed &&
    firstInfo.size >= MIN_SOT_CLUSTER_SIZE
  )
}

function matchesInverseSotComponentPattern(mapGrid, waterX, waterY, tileType, positions, analysisCache = null) {
  const candidateTiles = positions.filter(([x, y]) => mapGrid[y]?.[x]?.type === tileType)
  if (candidateTiles.length < 2) return false

  const [firstTile, ...restTiles] = candidateTiles
  return restTiles.some(([x, y]) =>
    areTilesInSameEnclosedSotComponent(mapGrid, firstTile[0], firstTile[1], x, y, tileType, analysisCache)
  )
}

function hasSolidSotInterior(top, right, bottom, left, orientation, tileType) {
  switch (orientation) {
    case 'top-left':
      return right?.type === tileType && bottom?.type === tileType
    case 'top-right':
      return left?.type === tileType && bottom?.type === tileType
    case 'bottom-left':
      return top?.type === tileType && right?.type === tileType
    case 'bottom-right':
      return top?.type === tileType && left?.type === tileType
    default:
      return false
  }
}

function canApplySotCorner(mapGrid, x, y, tileType, orientation, top, right, bottom, left, analysisCache = null) {
  return hasMinimumSotCluster(mapGrid, x, y, tileType, analysisCache) &&
    hasSolidSotInterior(top, right, bottom, left, orientation, tileType)
}

function getInverseSotInfo(mapGrid, x, y, tileType, top, right, bottom, left, analysisCache = null) {
  if (tileType !== 'water') return null

  const candidates = ['street', 'land']
  for (const candidateType of candidates) {
    if (
      matchesInverseSotComponentPattern(
        mapGrid,
        x,
        y,
        candidateType,
        [[x, y - 1], [x - 1, y], [x - 1, y - 1]],
        analysisCache
      )
    ) {
      return { orientation: 'top-left', type: candidateType }
    }
    if (
      matchesInverseSotComponentPattern(
        mapGrid,
        x,
        y,
        candidateType,
        [[x, y - 1], [x + 1, y], [x + 1, y - 1]],
        analysisCache
      )
    ) {
      return { orientation: 'top-right', type: candidateType }
    }
    if (
      matchesInverseSotComponentPattern(
        mapGrid,
        x,
        y,
        candidateType,
        [[x, y + 1], [x - 1, y], [x - 1, y + 1]],
        analysisCache
      )
    ) {
      return { orientation: 'bottom-left', type: candidateType }
    }
    if (
      matchesInverseSotComponentPattern(
        mapGrid,
        x,
        y,
        candidateType,
        [[x, y + 1], [x + 1, y], [x + 1, y + 1]],
        analysisCache
      )
    ) {
      return { orientation: 'bottom-right', type: candidateType }
    }
  }

  return null
}

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

    const analysisCache = new Map()

    // Initialize mask array
    this.sotMask = Array.from({ length: mapHeight })
    for (let y = 0; y < mapHeight; y++) {
      this.sotMask[y] = Array.from({ length: mapWidth }, () => null)
    }

    // Compute SOT for each terrain tile that can either receive an outer corner overlay
    // or host an inverse inner-terrain corner when water surrounds an island.
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const tile = mapGrid[y][x]
        if (tile.type !== 'land' && tile.type !== 'street' && tile.type !== 'water') continue

        const sotInfo = this.computeSOTForTile(mapGrid, x, y, mapWidth, mapHeight, tile.type, analysisCache)
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
  computeSOTForTile(mapGrid, x, y, mapWidth, mapHeight, tileType = 'land', analysisCache = null) {
    const top = y > 0 ? mapGrid[y - 1][x] : null
    const left = x > 0 ? mapGrid[y][x - 1] : null
    const bottom = y < mapHeight - 1 ? mapGrid[y + 1][x] : null
    const right = x < mapWidth - 1 ? mapGrid[y][x + 1] : null
    const isEnclosedIsland = (tileType === 'land' || tileType === 'street') &&
      isEnclosedSotIsland(mapGrid, x, y, tileType, analysisCache)

    const inverseSotInfo = getInverseSotInfo(mapGrid, x, y, tileType, top, right, bottom, left, analysisCache)
    if (inverseSotInfo) {
      return inverseSotInfo
    }

    // Check water corners (for both land and street tiles)
    if (!isEnclosedIsland && top && left && top.type === 'water' && left.type === 'water') {
      return canApplySotCorner(mapGrid, x, y, tileType, 'top-left', top, right, bottom, left, analysisCache)
        ? { orientation: 'top-left', type: 'water' }
        : null
    }
    if (!isEnclosedIsland && top && right && top.type === 'water' && right.type === 'water') {
      return canApplySotCorner(mapGrid, x, y, tileType, 'top-right', top, right, bottom, left, analysisCache)
        ? { orientation: 'top-right', type: 'water' }
        : null
    }
    if (!isEnclosedIsland && bottom && left && bottom.type === 'water' && left.type === 'water') {
      return canApplySotCorner(mapGrid, x, y, tileType, 'bottom-left', top, right, bottom, left, analysisCache)
        ? { orientation: 'bottom-left', type: 'water' }
        : null
    }
    if (!isEnclosedIsland && bottom && right && bottom.type === 'water' && right.type === 'water') {
      return canApplySotCorner(mapGrid, x, y, tileType, 'bottom-right', top, right, bottom, left, analysisCache)
        ? { orientation: 'bottom-right', type: 'water' }
        : null
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
    const analysisCache = new Map()

    // Update the tile and its immediate neighbors (SOT depends on adjacent tiles)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = tileX + dx
        const y = tileY + dy

        if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) continue

        const tile = mapGrid[y][x]
        if (tile.type === 'land' || tile.type === 'street' || tile.type === 'water') {
          this.sotMask[y][x] = this.computeSOTForTile(mapGrid, x, y, mapWidth, mapHeight, tile.type, analysisCache)
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
        lastIntegratedSignature: null,
        lastWaterFrameIndex: null,
        lastProceduralWaterEnabled: null,
        lastWaterEffectTone: null,
        lastWaterEffectSaturation: null,
        lastWaterEffectZoom: null,
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
        parts.push(
          tile.type,
          tile.airstripStreet ? 1 : 0,
          tile.ore ? 1 : 0,
          tile.seedCrystal ? 1 : 0,
          tile.noBuild || 0,
          getTileDecalSignature(tile)
        )
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

    const hasWaterAnimation = containsWater && (USE_PROCEDURAL_WATER_RENDERING || this.textureManager.waterFrames.length > 0)
    const waterFrameIndex = hasWaterAnimation ? this.textureManager.waterFrameIndex : null

    const needsRedraw =
      chunk.signature !== signature ||
      chunk.lastUseTexture !== useTexture ||
      chunk.lastIntegratedSignature !== this.textureManager.integratedRenderSignature ||
      chunk.lastProceduralWaterEnabled !== USE_PROCEDURAL_WATER_RENDERING ||
      chunk.lastWaterEffectTone !== WATER_EFFECT_TONE ||
      chunk.lastWaterEffectSaturation !== WATER_EFFECT_SATURATION ||
      chunk.lastWaterEffectZoom !== WATER_EFFECT_ZOOM ||
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
    chunk.lastIntegratedSignature = this.textureManager.integratedRenderSignature
    chunk.lastProceduralWaterEnabled = USE_PROCEDURAL_WATER_RENDERING
    chunk.lastWaterEffectTone = WATER_EFFECT_TONE
    chunk.lastWaterEffectSaturation = WATER_EFFECT_SATURATION
    chunk.lastWaterEffectZoom = WATER_EFFECT_ZOOM
    chunk.lastSotMaskVersion = this.sotMaskVersion
    chunk.containsWaterAnimation = hasWaterAnimation
    chunk.lastWaterFrameIndex = hasWaterAnimation ? waterFrameIndex : null
  }

  renderTiles(ctx, mapGrid, scrollOffset, startTileX, startTileY, endTileX, endTileY, _gameState, options = {}) {
    const { skipWaterBase = false, skipWaterSot = false } = options
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

    if (!this.canUseOffscreen || skipWaterBase || skipWaterSot) {
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
        currentWaterFrame,
        { skipWaterBase, skipWaterSot }
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
            currentWaterFrame,
            { skipWaterBase, skipWaterSot }
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

  drawBaseLayer(ctx, mapGrid, startTileX, startTileY, endTileX, endTileY, offsetX, offsetY, useTexture, currentWaterFrame, options = {}) {
    const { skipWaterBase = false, skipWaterSot = false } = options
    if (!mapGrid.length || !mapGrid[0]?.length) return

    // Ensure SOT mask is computed
    if (!this.sotMask) {
      this.computeSOTMask(mapGrid)
    }

    const sotApplied = new Set()
    const scrollOffset = { x: offsetX, y: offsetY }
    const previousGroupingMap = this.groupingMapGrid
    this.groupingMapGrid = mapGrid

    for (let y = startTileY; y < endTileY; y++) {
      for (let x = startTileX; x < endTileX; x++) {
        const tile = mapGrid[y][x]
        const visualTileType = tile?.airstripStreet ? 'land' : tile.type
        const screenX = Math.floor(x * TILE_SIZE - offsetX)
        const screenY = Math.floor(y * TILE_SIZE - offsetY)

        if (!(skipWaterBase && visualTileType === 'water')) {
          this.drawTileBase(ctx, x, y, visualTileType, screenX, screenY, useTexture, currentWaterFrame)
        }

        // Use precomputed SOT mask instead of computing neighbors each frame.
        // Water tiles can also host inverse SOT so enclosed islands smooth inward.
        if (this.sotMask[y]?.[x]) {
          const sotInfo = this.sotMask[y][x]
          if (visualTileType === 'street' && sotInfo.type !== 'water') {
            continue
          }
          if (skipWaterSot && sotInfo.type === 'water') {
            if (skipWaterBase && visualTileType !== 'water') {
              this.clearTriangleArea(ctx, screenX, screenY, TILE_SIZE + 1, sotInfo.orientation)
            }
            continue
          }
          this.drawSOT(ctx, x, y, sotInfo.orientation, scrollOffset, useTexture, sotApplied, sotInfo.type, currentWaterFrame)
        }

        this.drawTileDecalOverlay(ctx, tile, x, y, screenX, screenY)

        if (tile.seedCrystal) {
          this.drawSeedOverlay(ctx, x, y, screenX, screenY, useTexture, tile.seedCrystalDensity || tile.oreDensity || 1)
        } else if (tile.ore) {
          this.drawOreOverlay(ctx, x, y, screenX, screenY, useTexture, tile.oreDensity || 1)
        }
      }
    }
    this.groupingMapGrid = previousGroupingMap
  }

  drawIntegratedTileImage(ctx, integratedTile, screenX, screenY) {
    if (!integratedTile?.image || !integratedTile?.rect) return false
    const { image, rect } = integratedTile
    ctx.drawImage(
      image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      screenX,
      screenY,
      TILE_SIZE + 1,
      TILE_SIZE + 1
    )
    return true
  }

  clearTriangleArea(ctx, screenX, screenY, size, orientation) {
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
      default:
        ctx.restore()
        return
    }
    ctx.closePath()
    ctx.clip()
    ctx.clearRect(screenX, screenY, size, size)
    ctx.restore()
  }

  drawFallbackTileBase(ctx, tileX, tileY, type, screenX, screenY, useTexture, currentWaterFrame) {
    if (type === 'water') {
      if (USE_PROCEDURAL_WATER_RENDERING) {
        this.drawProceduralWater(ctx, screenX, screenY, TILE_SIZE + 1, tileX, tileY)
      } else {
        this.drawClassicWater(ctx, screenX, screenY, TILE_SIZE + 1, currentWaterFrame)
      }
      return
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

  drawTileBase(ctx, tileX, tileY, type, screenX, screenY, useTexture, currentWaterFrame) {
    const mapGrid = Array.isArray(this.groupingMapGrid) ? this.groupingMapGrid : undefined
    if (type === 'street') {
      if (this.textureManager.integratedSpriteSheetMode) {
        const biomeUnderlayTile = mapGrid
          ? this.textureManager.getIntegratedTileForMapTile('land', tileX, tileY, { mapGrid })
          : this.textureManager.getIntegratedTileForMapTile('land', tileX, tileY)
        if (!this.drawIntegratedTileImage(ctx, biomeUnderlayTile, screenX, screenY)) {
          this.drawFallbackTileBase(ctx, tileX, tileY, 'land', screenX, screenY, useTexture, currentWaterFrame)
        }
      } else {
        this.drawFallbackTileBase(ctx, tileX, tileY, 'land', screenX, screenY, useTexture, currentWaterFrame)
      }

      const integratedStreetTile = mapGrid
        ? this.textureManager.getIntegratedTileForMapTile('street', tileX, tileY, { mapGrid })
        : this.textureManager.getIntegratedTileForMapTile('street', tileX, tileY)
      if (integratedStreetTile?.image && integratedStreetTile?.rect) {
        this.drawIntegratedTileImage(ctx, integratedStreetTile, screenX, screenY)
        return
      }

      this.drawFallbackTileBase(ctx, tileX, tileY, 'street', screenX, screenY, useTexture, currentWaterFrame)
      return
    }

    if (this.textureManager.integratedSpriteSheetMode) {
      const integratedTile = mapGrid
        ? this.textureManager.getIntegratedTileForMapTile(type, tileX, tileY, { mapGrid })
        : this.textureManager.getIntegratedTileForMapTile(type, tileX, tileY)
      if (integratedTile?.image && integratedTile?.rect) {
        if (type === 'rock' && this.textureManager.integratedSpriteSheetMode) {
          const landTile = mapGrid
            ? this.textureManager.getIntegratedTileForMapTile('land', tileX, tileY, { mapGrid })
            : this.textureManager.getIntegratedTileForMapTile('land', tileX, tileY)
          if (!this.drawIntegratedTileImage(ctx, landTile, screenX, screenY)) {
            this.drawFallbackTileBase(ctx, tileX, tileY, 'land', screenX, screenY, useTexture, currentWaterFrame)
          }
        }
        this.drawIntegratedTileImage(ctx, integratedTile, screenX, screenY)
        return
      }
    }

    this.drawFallbackTileBase(ctx, tileX, tileY, type, screenX, screenY, useTexture, currentWaterFrame)
  }

  drawProceduralWater(ctx, screenX, screenY, size, tileX, tileY) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    const t = now * 0.0018
    const originX = tileX * TILE_SIZE
    const originY = tileY * TILE_SIZE
    const zoom = Math.max(WATER_EFFECT_ZOOM, 0.001)
    const toneBlend = (WATER_EFFECT_TONE + 1) / 2
    const saturation = Math.max(0, WATER_EFFECT_SATURATION)
    const deepColor = applySaturation(mixColor([10, 46, 82], [24, 70, 76], toneBlend), saturation)
    const brightColor = applySaturation(mixColor([20, 99, 148], [33, 133, 110], toneBlend), saturation)
    const shimmerColor = applySaturation(mixColor([10, 20, 26], [12, 28, 18], toneBlend), saturation)
    const bandColor = applySaturation(mixColor([95, 176, 216], [94, 213, 180], toneBlend), saturation)
    const columnColor = applySaturation(mixColor([142, 221, 242], [151, 236, 202], toneBlend), saturation)

    ctx.fillStyle = toRgba(deepColor)
    ctx.fillRect(screenX, screenY, size, size)

    const bandCount = 5
    const bandHeight = size / (bandCount + 1)
    for (let i = 0; i < bandCount; i++) {
      const phase = t + originX * (0.026 / zoom) + originY * (0.029 / zoom) + i * 1.17
      const offset = Math.sin(phase) * 2
      const y = screenY + (i + 1) * bandHeight + offset
      const alpha = 0.22 + 0.08 * Math.sin(phase * 1.4)
      ctx.fillStyle = toRgba(bandColor, Math.max(0.12, Math.min(0.36, alpha)).toFixed(3))
      ctx.fillRect(screenX, Math.floor(y), size, 1)
    }

    const xBandCount = 3
    const colWidth = size / (xBandCount + 1)
    for (let i = 0; i < xBandCount; i++) {
      const phase = t * 0.72 + originX * (0.031 / zoom) - originY * (0.026 / zoom) + i * 1.9
      const offset = Math.cos(phase) * 1.5
      const x = screenX + (i + 1) * colWidth + offset
      const alpha = 0.1 + 0.08 * Math.cos(phase * 1.7)
      ctx.fillStyle = toRgba(columnColor, Math.max(0.05, Math.min(0.24, alpha)).toFixed(3))
      ctx.fillRect(Math.floor(x), screenY, 1, size)
    }

    const shimmer = 0.5 + 0.5 * Math.sin((originX - originY) * (0.03 / zoom) + t * 1.65)
    ctx.fillStyle = toRgba(brightColor, 0.16 + shimmer * 0.08)
    ctx.fillRect(screenX, screenY, size, size)
    ctx.fillStyle = toRgba(shimmerColor, 0.08 + shimmer * 0.05)
    ctx.fillRect(screenX, screenY, size, size)
  }

  drawClassicWater(ctx, screenX, screenY, size, currentWaterFrame) {
    if (currentWaterFrame) {
      ctx.drawImage(currentWaterFrame, screenX, screenY, size, size)
      return
    }

    ctx.fillStyle = TILE_COLORS.water
    ctx.fillRect(screenX, screenY, size, size)
  }

  drawOreOverlay(ctx, tileX, tileY, screenX, screenY, useTexture, density = 1) {
    const normalizedDensity = Math.max(1, Math.min(5, Number.isFinite(density) ? Math.floor(density) : 1))
    const integratedTile = this.textureManager.selectCrystalTileByTags(
      ['ore', 'density_' + normalizedDensity],
      tileX,
      tileY
    )
    if (integratedTile?.rect && integratedTile?.image) {
      this.drawIntegratedTileImage(ctx, integratedTile, screenX, screenY)
      return
    }

    const cache = this.textureManager.tileTextureCache.ore
    if (useTexture && cache && cache.length) {
      const idx = Math.min(cache.length - 1, Math.max(0, normalizedDensity - 1))
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

  drawSeedOverlay(ctx, tileX, tileY, screenX, screenY, useTexture, density = 1) {
    const normalizedDensity = Math.max(1, Math.min(5, Number.isFinite(density) ? Math.floor(density) : 1))
    const integratedTile = this.textureManager.selectCrystalTileByTags(
      ['red', 'density_' + normalizedDensity],
      tileX,
      tileY
    ) || this.textureManager.selectCrystalTileByTags(
      ['ore', 'red', 'density_' + normalizedDensity],
      tileX,
      tileY
    ) || this.textureManager.selectCrystalTileByTags(
      ['ore', 'density_' + normalizedDensity],
      tileX,
      tileY
    )
    if (integratedTile?.rect && integratedTile?.image) {
      this.drawIntegratedTileImage(ctx, integratedTile, screenX, screenY)
      return
    }

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

  drawTileDecalOverlay(ctx, tile, tileX, tileY, screenX, screenY) {
    if (!tile?.decal || typeof tile.decal !== 'object') return
    const tag = tile.decal.tag
    if (!tag) return

    const variantSeed = Number.isFinite(tile.decal.variantSeed)
      ? tile.decal.variantSeed
      : ((tileX * 73856093) ^ (tileY * 19349663)) >>> 0

    const groupWidth = Math.max(1, Math.floor(tile.decal.groupWidth || 1))
    const groupHeight = Math.max(1, Math.floor(tile.decal.groupHeight || 1))
    const groupOriginX = Number.isFinite(tile.decal.groupOriginX) ? Math.floor(tile.decal.groupOriginX) : tileX
    const groupOriginY = Number.isFinite(tile.decal.groupOriginY) ? Math.floor(tile.decal.groupOriginY) : tileY
    const groupOffsetX = tileX - groupOriginX
    const groupOffsetY = tileY - groupOriginY

    if (groupWidth > 1 || groupHeight > 1) {
      const grouped = this.textureManager.selectGroupedTileVariant(tag, {
        width: groupWidth,
        height: groupHeight,
        offsetX: groupOffsetX,
        offsetY: groupOffsetY,
        seed: variantSeed,
        includeDefaultDecals: true
      })
      if (grouped?.rect && grouped?.image) {
        const { rect, image } = grouped
        ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, screenX, screenY, TILE_SIZE + 1, TILE_SIZE + 1)
        return
      }
    }

    const candidates = this.textureManager.getDecalTileCandidatesByTags([tag])

    if (Array.isArray(candidates) && candidates.length > 0) {
      const selected = candidates[variantSeed % candidates.length]
      if (selected?.rect && selected?.image) {
        const { rect, image } = selected
        ctx.drawImage(
          image,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          screenX,
          screenY,
          TILE_SIZE + 1,
          TILE_SIZE + 1
        )
        return
      }
    }

    ctx.save()
    ctx.globalAlpha = tag === 'debris' ? 0.4 : (tag === 'crater' ? 0.33 : 0.25)
    ctx.fillStyle = tag === 'debris' ? '#5a5244' : (tag === 'crater' ? '#2f2b28' : '#3f3a36')
    ctx.fillRect(screenX, screenY, TILE_SIZE + 1, TILE_SIZE + 1)
    ctx.restore()
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
    const isWaterSot = type === 'water'
    const screenX = tileX * TILE_SIZE - scrollOffset.x - (isWaterSot ? 0 : 1)
    const screenY = tileY * TILE_SIZE - scrollOffset.y - (isWaterSot ? 0 : 1)
    const size = TILE_SIZE + (isWaterSot ? 1 : 3)

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

    if (type === 'water') {
      const integratedWaterTile = this.textureManager.integratedSpriteSheetMode
        ? this.textureManager.getIntegratedTileForMapTile('water', tileX, tileY)
        : null
      if (!this.drawIntegratedTileImage(ctx, integratedWaterTile, screenX, screenY)) {
        if (USE_PROCEDURAL_WATER_RENDERING) {
          this.drawProceduralWater(ctx, screenX, screenY, size, tileX, tileY)
        } else {
          this.drawClassicWater(ctx, screenX, screenY, size, currentWaterFrame)
        }
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
  renderSOTOverlays(ctx, mapGrid, scrollOffset, startTileX, startTileY, endTileX, endTileY, options = {}) {
    const { skipWaterSot = false, gpuRenderedResources = false } = options
    // Ensure SOT mask is computed
    if (!this.sotMask) {
      this.computeSOTMask(mapGrid)
    }

    const useTexture = USE_TEXTURES && this.textureManager.allTexturesLoaded
    const currentWaterFrame = this.textureManager.waterFrames.length
      ? this.textureManager.getCurrentWaterFrame()
      : null

    const sotApplied = new Set()
    const previousGroupingMap = this.groupingMapGrid
    this.groupingMapGrid = mapGrid

    // When GPU renders the base layer, repaint street tiles on CPU using the new street-sheet
    // pipeline so this works even while Custom sprite sheets is disabled.
    for (let y = startTileY; y < endTileY; y++) {
      for (let x = startTileX; x < endTileX; x++) {
        const tile = mapGrid[y][x]
        const visualTileType = tile?.airstripStreet ? 'land' : tile.type
        if (visualTileType !== 'street') continue
        const screenX = Math.floor(x * TILE_SIZE - scrollOffset.x)
        const screenY = Math.floor(y * TILE_SIZE - scrollOffset.y)
        this.drawTileBase(ctx, x, y, 'street', screenX, screenY, useTexture, currentWaterFrame)
      }
    }

    // First pass: render all SOT overlays.
    // Never draw street-type SOT. Allow water SOT on street-hosted tiles so coastline smoothing
    // still works against the street underlay terrain.
    for (let y = startTileY; y < endTileY; y++) {
      for (let x = startTileX; x < endTileX; x++) {
        const tile = mapGrid[y][x]
        const visualTileType = tile?.airstripStreet ? 'land' : tile.type
        if (this.sotMask[y]?.[x]) {
          const sotInfo = this.sotMask[y][x]
          if (sotInfo.type === 'street') {
            continue
          }
          if (visualTileType === 'street' && sotInfo.type !== 'water') {
            continue
          }
          if (skipWaterSot && sotInfo.type === 'water') {
            continue
          }
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

        this.drawTileDecalOverlay(ctx, tile, x, y, screenX, screenY)

        if (tile.seedCrystal) {
          if (gpuRenderedResources && !this.shouldRenderCrystalOverlayOnCpu(tile, x, y)) {
            continue
          }
          this.drawSeedOverlay(ctx, x, y, screenX, screenY, useTexture, tile.seedCrystalDensity || tile.oreDensity || 1)
        } else if (tile.ore) {
          if (gpuRenderedResources && !this.shouldRenderCrystalOverlayOnCpu(tile, x, y)) {
            continue
          }
          this.drawOreOverlay(ctx, x, y, screenX, screenY, useTexture, tile.oreDensity || 1)
        }
      }
    }
    this.groupingMapGrid = previousGroupingMap
  }

  shouldRenderCrystalOverlayOnCpu(tile, tileX, tileY) {
    if (!tile || (!tile.ore && !tile.seedCrystal)) return false
    const density = Math.max(
      1,
      Math.min(
        5,
        Number.isFinite(tile.seedCrystalDensity)
          ? Math.floor(tile.seedCrystalDensity)
          : (Number.isFinite(tile.oreDensity) ? Math.floor(tile.oreDensity) : 1)
      )
    )

    const integratedTile = tile.seedCrystal
      ? (
        this.textureManager.selectCrystalTileByTags(['red', 'density_' + density], tileX, tileY)
          || this.textureManager.selectCrystalTileByTags(['ore', 'red', 'density_' + density], tileX, tileY)
          || this.textureManager.selectCrystalTileByTags(['ore', 'density_' + density], tileX, tileY)
      )
      : this.textureManager.selectCrystalTileByTags(['ore', 'density_' + density], tileX, tileY)

    if (!integratedTile?.rect || !integratedTile?.image) {
      return false
    }

    return integratedTile.image !== this.textureManager.spriteImage
  }

  render(ctx, mapGrid, scrollOffset, gameCanvas, gameState, occupancyMap = null, options = {}) {
    const { skipBaseLayer = false, skipWaterSot = false, skipWaterBase = false } = options || {}
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
      this.renderTiles(ctx, mapGrid, scrollOffset, startTileX, startTileY, endTileX, endTileY, gameState, { skipWaterBase, skipWaterSot })
    } else {
      // When GPU renders base tiles, we still need to render SOT overlays with 2D canvas
      this.renderSOTOverlays(ctx, mapGrid, scrollOffset, startTileX, startTileY, endTileX, endTileY, {
        skipWaterSot,
        gpuRenderedResources: Boolean(options?.gpuRenderedResources)
      })
    }
    this.applyVisibilityOverlay(ctx, mapGrid, startTileX, startTileY, endTileX, endTileY, scrollOffset, gameState)
    this.renderGrid(ctx, startTileX, startTileY, endTileX, endTileY, scrollOffset, gameState)
    this.renderOccupancyMap(ctx, occupancyMap, startTileX, startTileY, endTileX, endTileY, scrollOffset, gameState)
  }
}
