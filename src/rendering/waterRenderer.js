import { TILE_SIZE } from '../config.js'

export const SHORELINE_EDGE_TOP = 1
export const SHORELINE_EDGE_RIGHT = 2
export const SHORELINE_EDGE_BOTTOM = 4
export const SHORELINE_EDGE_LEFT = 8
export const SHORELINE_CORNER_TOP_LEFT = 16
export const SHORELINE_CORNER_TOP_RIGHT = 32
export const SHORELINE_CORNER_BOTTOM_RIGHT = 64
export const SHORELINE_CORNER_BOTTOM_LEFT = 128

const DEFAULT_WATER_CONFIG = {
  enabled: true,
  waterTextureScale: 512,
  layerASpeed: { x: 6, y: -4 },
  layerBSpeed: { x: -10, y: 8 },
  noiseScaleA: 384,
  noiseScaleB: 224,
  noiseSpeedA: { x: 12, y: 10 },
  noiseSpeedB: { x: -16, y: 12 },
  distortionStrength: 0.08,
  highlightStrength: 0.2,
  foamStrength: 0.58,
  foamWidthPx: 8,
  waterTintMultiplier: { r: 0.86, g: 0.96, b: 1.1 },
  depthDarknessMultiplier: 0.92,
  shorelineDebugOverlay: false,
  showFoam: true
}

function wrapPatternTransform(ctx, pattern, scale, translateX, translateY) {
  const MatrixCtor = typeof window !== 'undefined' ? window.DOMMatrix : null
  if (!pattern || typeof pattern.setTransform !== 'function' || !MatrixCtor) {
    return
  }
  const matrix = new MatrixCtor()
  matrix.a = scale
  matrix.d = scale
  matrix.e = translateX * scale
  matrix.f = translateY * scale
  pattern.setTransform(matrix)
}

export class WaterRenderer {
  constructor(textureManager) {
    this.textureManager = textureManager
    this.images = {
      base: null,
      noise: null,
      normal: null,
      foam: null
    }
    this.imageLoadStarted = false
    this.lastRenderStats = null
  }

  startLoadingAssets() {
    if (this.imageLoadStarted) return
    this.imageLoadStarted = true
    this.textureManager.getOrLoadImage('images/map/water/water_base_seamless_512', ['webp', 'png'], img => {
      this.images.base = img
    })
    this.textureManager.getOrLoadImage('images/map/water/water_noise_seamless_512', ['webp', 'png'], img => {
      this.images.noise = img
    })
    this.textureManager.getOrLoadImage('images/map/water/water_normal_seamless_512', ['png', 'webp'], img => {
      this.images.normal = img
    })
    this.textureManager.getOrLoadImage('images/map/water/shore_foam_texture_seamless_512', ['png', 'webp'], img => {
      this.images.foam = img
    })
  }

  getConfig(runtimeConfig = {}) {
    return {
      ...DEFAULT_WATER_CONFIG,
      ...(runtimeConfig || {}),
      layerASpeed: { ...DEFAULT_WATER_CONFIG.layerASpeed, ...(runtimeConfig?.layerASpeed || {}) },
      layerBSpeed: { ...DEFAULT_WATER_CONFIG.layerBSpeed, ...(runtimeConfig?.layerBSpeed || {}) },
      noiseSpeedA: { ...DEFAULT_WATER_CONFIG.noiseSpeedA, ...(runtimeConfig?.noiseSpeedA || {}) },
      noiseSpeedB: { ...DEFAULT_WATER_CONFIG.noiseSpeedB, ...(runtimeConfig?.noiseSpeedB || {}) },
      waterTintMultiplier: { ...DEFAULT_WATER_CONFIG.waterTintMultiplier, ...(runtimeConfig?.waterTintMultiplier || {}) }
    }
  }

  render(ctx, mapGrid, shorelineMask, scrollOffset, visibleRect, timeMs, runtimeConfig = {}) {
    if (!ctx || !mapGrid?.length || !visibleRect) return
    this.startLoadingAssets()

    const config = this.getConfig(runtimeConfig)
    if (!config.enabled) return

    const seconds = (timeMs || 0) / 1000
    const tileSize = TILE_SIZE + 1
    const scale = tileSize / Math.max(8, config.waterTextureScale)

    const basePattern = this.images.base ? ctx.createPattern(this.images.base, 'repeat') : null
    const noisePattern = this.images.noise ? ctx.createPattern(this.images.noise, 'repeat') : null
    const normalPattern = this.images.normal ? ctx.createPattern(this.images.normal, 'repeat') : null
    const foamPattern = this.images.foam ? ctx.createPattern(this.images.foam, 'repeat') : null

    const fillWaterTiles = (fillStyle, alpha = 1, composite = 'source-over') => {
      ctx.save()
      ctx.globalCompositeOperation = composite
      ctx.globalAlpha = alpha
      ctx.fillStyle = fillStyle
      for (let y = visibleRect.startY; y < visibleRect.endY; y++) {
        const row = mapGrid[y]
        const shorelineRow = shorelineMask?.[y]
        for (let x = visibleRect.startX; x < visibleRect.endX; x++) {
          const tile = row?.[x]
          if (!tile || !tile.isWater) continue
          const screenX = Math.floor(x * TILE_SIZE - scrollOffset.x)
          const screenY = Math.floor(y * TILE_SIZE - scrollOffset.y)
          ctx.fillRect(screenX, screenY, tileSize, tileSize)
          if (config.showFoam && foamPattern && shorelineRow?.[x]) {
            this.drawFoamForTile(ctx, foamPattern, shorelineRow[x], screenX, screenY, config)
          }
        }
      }
      ctx.restore()
    }

    if (basePattern) {
      const txA = -scrollOffset.x + config.layerASpeed.x * seconds
      const tyA = -scrollOffset.y + config.layerASpeed.y * seconds
      wrapPatternTransform(ctx, basePattern, scale, txA, tyA)
      fillWaterTiles(basePattern, 1)

      const txB = -scrollOffset.x + config.layerBSpeed.x * seconds
      const tyB = -scrollOffset.y + config.layerBSpeed.y * seconds
      const patternB = ctx.createPattern(this.images.base, 'repeat')
      wrapPatternTransform(ctx, patternB, scale * 1.08, txB, tyB)
      fillWaterTiles(patternB, 0.33)
    } else {
      fillWaterTiles('#2b74b7', 1)
    }

    if (noisePattern && config.distortionStrength > 0) {
      const noiseScaleA = tileSize / Math.max(16, config.noiseScaleA)
      wrapPatternTransform(
        ctx,
        noisePattern,
        noiseScaleA,
        -scrollOffset.x + config.noiseSpeedA.x * seconds,
        -scrollOffset.y + config.noiseSpeedA.y * seconds
      )
      fillWaterTiles(noisePattern, config.distortionStrength, 'soft-light')

      const noisePatternB = ctx.createPattern(this.images.noise, 'repeat')
      const noiseScaleB = tileSize / Math.max(16, config.noiseScaleB)
      wrapPatternTransform(
        ctx,
        noisePatternB,
        noiseScaleB,
        -scrollOffset.x + config.noiseSpeedB.x * seconds,
        -scrollOffset.y + config.noiseSpeedB.y * seconds
      )
      fillWaterTiles(noisePatternB, config.distortionStrength * 0.85, 'overlay')
    }

    if (normalPattern && config.highlightStrength > 0) {
      wrapPatternTransform(ctx, normalPattern, scale * 0.95, -scrollOffset.x + seconds * 18, -scrollOffset.y - seconds * 7)
      fillWaterTiles(normalPattern, config.highlightStrength, 'screen')
    }

    const tint = config.waterTintMultiplier || DEFAULT_WATER_CONFIG.waterTintMultiplier
    const tintColor = `rgba(${Math.round(255 * (1 - tint.r))}, ${Math.round(255 * (1 - tint.g))}, ${Math.round(255 * (1 - tint.b))}, 0.28)`
    fillWaterTiles(tintColor, 1, 'multiply')

    if (config.depthDarknessMultiplier < 1) {
      fillWaterTiles(`rgba(0, 16, 42, ${Math.max(0, 1 - config.depthDarknessMultiplier)})`, 1)
    }

    if (config.shorelineDebugOverlay) {
      this.drawShorelineDebug(ctx, mapGrid, shorelineMask, scrollOffset, visibleRect)
    }

    let waterTileCount = 0
    let shoreTileCount = 0
    for (let y = visibleRect.startY; y < visibleRect.endY; y++) {
      const row = mapGrid[y]
      for (let x = visibleRect.startX; x < visibleRect.endX; x++) {
        if (row?.[x]?.isWater) {
          waterTileCount++
          if (shorelineMask?.[y]?.[x]) shoreTileCount++
        }
      }
    }
    this.lastRenderStats = {
      waterTileCount,
      shoreTileCount,
      config
    }
  }

  drawFoamForTile(ctx, foamPattern, mask, x, y, config) {
    const width = Math.max(2, Math.min(14, config.foamWidthPx || 8))
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, config.foamStrength || 0))
    ctx.fillStyle = foamPattern
    if (mask & SHORELINE_EDGE_TOP) ctx.fillRect(x, y, TILE_SIZE + 1, width)
    if (mask & SHORELINE_EDGE_RIGHT) ctx.fillRect(x + TILE_SIZE + 1 - width, y, width, TILE_SIZE + 1)
    if (mask & SHORELINE_EDGE_BOTTOM) ctx.fillRect(x, y + TILE_SIZE + 1 - width, TILE_SIZE + 1, width)
    if (mask & SHORELINE_EDGE_LEFT) ctx.fillRect(x, y, width, TILE_SIZE + 1)

    const cornerSize = width * 1.4
    if (mask & SHORELINE_CORNER_TOP_LEFT) ctx.fillRect(x, y, cornerSize, cornerSize)
    if (mask & SHORELINE_CORNER_TOP_RIGHT) ctx.fillRect(x + TILE_SIZE + 1 - cornerSize, y, cornerSize, cornerSize)
    if (mask & SHORELINE_CORNER_BOTTOM_RIGHT) ctx.fillRect(x + TILE_SIZE + 1 - cornerSize, y + TILE_SIZE + 1 - cornerSize, cornerSize, cornerSize)
    if (mask & SHORELINE_CORNER_BOTTOM_LEFT) ctx.fillRect(x, y + TILE_SIZE + 1 - cornerSize, cornerSize, cornerSize)
    ctx.restore()
  }

  drawShorelineDebug(ctx, mapGrid, shorelineMask, scrollOffset, visibleRect) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'
    ctx.lineWidth = 1
    for (let y = visibleRect.startY; y < visibleRect.endY; y++) {
      for (let x = visibleRect.startX; x < visibleRect.endX; x++) {
        if (!mapGrid[y]?.[x]?.isWater || !shorelineMask?.[y]?.[x]) continue
        const screenX = Math.floor(x * TILE_SIZE - scrollOffset.x)
        const screenY = Math.floor(y * TILE_SIZE - scrollOffset.y)
        ctx.strokeRect(screenX + 1, screenY + 1, TILE_SIZE - 1, TILE_SIZE - 1)
      }
    }
    ctx.restore()
  }
}
