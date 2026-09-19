import {
  TILE_SIZE,
  WATER_EFFECT_SATURATION,
  WATER_EFFECT_TONE,
  WATER_EFFECT_ZOOM
} from '../../config.js'
import { PROFILER_SPAN_IDS } from '../../performance/profilerIds.js'
import { renderProfiler } from '../../performance/renderProfiler.js'
import { RENDER_COUNTER_IDS, renderDiagnostics } from '../../performance/renderDiagnostics.js'

const ORIENTATION_NONE = 0
const ORIENTATION_TOP_LEFT = 1
const ORIENTATION_TOP_RIGHT = 2
const ORIENTATION_BOTTOM_LEFT = 3
const ORIENTATION_BOTTOM_RIGHT = 4
const RUN_FIELDS = 3
const SOT_FIELDS = 3

function defaultNow() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function saturatedChannel(red, green, blue, channel, saturation) {
  const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722
  return clampChannel(luma + (channel - luma) * saturation)
}

function mixChannel(first, second, amount) {
  return first + (second - first) * amount
}

function rgbStyle(first, second, toneBlend, saturation) {
  const red = mixChannel(first[0], second[0], toneBlend)
  const green = mixChannel(first[1], second[1], toneBlend)
  const blue = mixChannel(first[2], second[2], toneBlend)
  return `rgb(${saturatedChannel(red, green, blue, red, saturation)}, ${saturatedChannel(red, green, blue, green, saturation)}, ${saturatedChannel(red, green, blue, blue, saturation)})`
}

function orientationCode(orientation) {
  switch (orientation) {
    case 'top-left': return ORIENTATION_TOP_LEFT
    case 'top-right': return ORIENTATION_TOP_RIGHT
    case 'bottom-left': return ORIENTATION_BOTTOM_LEFT
    case 'bottom-right': return ORIENTATION_BOTTOM_RIGHT
    default: return ORIENTATION_NONE
  }
}

function growInt32(buffer, required) {
  if (buffer.length >= required) return buffer
  let capacity = Math.max(24, buffer.length || 0)
  while (capacity < required) capacity *= 2
  return new Int32Array(capacity)
}

function isStreetWaterTransitionTile(mapGrid, x, y) {
  const tile = mapGrid[y]?.[x]
  if (tile?.type !== 'street' || tile.airstripStreet) return false
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && mapGrid[y + dy]?.[x + dx]?.type === 'water') return true
    }
  }
  return false
}

/**
 * Retained Canvas2D procedural-water pass. I20 owns wiring this into MapRenderer.
 * Topology and visible runs are invalidated by topology revision/view tile bounds;
 * animation time is deliberately absent from those keys.
 */
export class CpuWaterPass {
  constructor({
    now = defaultNow,
    tileSize = TILE_SIZE,
    profiler = renderProfiler,
    diagnostics = renderDiagnostics
  } = {}) {
    this.now = now
    this.tileSize = tileSize
    this.profiler = profiler
    this.diagnostics = diagnostics
    this.mapGrid = null
    this.sotMask = null
    this.topologyRevision = null
    this.visibleRevision = null
    this.visibleStartX = -1
    this.visibleStartY = -1
    this.visibleEndX = -1
    this.visibleEndY = -1
    this.visibleDrawBase = false
    this.visibleDrawSot = false
    this.runs = new Int32Array(24)
    this.runLength = 0
    this.sot = new Int32Array(24)
    this.sotLength = 0
    this.palette = {
      tone: NaN,
      saturation: NaN,
      zoom: NaN,
      deep: '',
      bright: '',
      shimmer: '',
      band: '',
      column: ''
    }
    this.coefficients = new Float64Array(4)
    this.stats = {
      topologyBuilds: 0,
      visibleRunBuilds: 0,
      paletteBuilds: 0,
      sampledTime: 0,
      drawCalls: 0
    }
  }

  setTopology(mapGrid, sotMask, topologyRevision = 0) {
    if (
      this.mapGrid === mapGrid &&
      this.sotMask === sotMask &&
      this.topologyRevision === topologyRevision
    ) return false
    this.mapGrid = mapGrid
    this.sotMask = sotMask
    this.topologyRevision = topologyRevision
    this.visibleRevision = null
    this.stats.topologyBuilds++
    return true
  }

  updatePalette({ tone, saturation, zoom }) {
    const safeTone = Number.isFinite(tone) ? tone : WATER_EFFECT_TONE
    const safeSaturation = Math.max(0, Number.isFinite(saturation) ? saturation : WATER_EFFECT_SATURATION)
    const safeZoom = Math.max(0.001, Number.isFinite(zoom) ? zoom : WATER_EFFECT_ZOOM)
    if (
      this.palette.tone === safeTone &&
      this.palette.saturation === safeSaturation &&
      this.palette.zoom === safeZoom
    ) return false

    const toneBlend = (safeTone + 1) / 2
    this.palette.tone = safeTone
    this.palette.saturation = safeSaturation
    this.palette.zoom = safeZoom
    this.palette.deep = rgbStyle([10, 46, 82], [24, 70, 76], toneBlend, safeSaturation)
    this.palette.bright = rgbStyle([20, 99, 148], [33, 133, 110], toneBlend, safeSaturation)
    this.palette.shimmer = rgbStyle([10, 20, 26], [12, 28, 18], toneBlend, safeSaturation)
    this.palette.band = rgbStyle([95, 176, 216], [94, 213, 180], toneBlend, safeSaturation)
    this.palette.column = rgbStyle([142, 221, 242], [151, 236, 202], toneBlend, safeSaturation)
    this.coefficients[0] = 0.026 / safeZoom
    this.coefficients[1] = 0.029 / safeZoom
    this.coefficients[2] = 0.031 / safeZoom
    this.coefficients[3] = 0.03 / safeZoom
    this.stats.paletteBuilds++
    return true
  }

  prepareVisible(startX, startY, endX, endY, drawBase, drawSot) {
    if (
      this.visibleRevision === this.topologyRevision &&
      this.visibleStartX === startX &&
      this.visibleStartY === startY &&
      this.visibleEndX === endX &&
      this.visibleEndY === endY &&
      this.visibleDrawBase === drawBase &&
      this.visibleDrawSot === drawSot
    ) return false
    this.visibleRevision = this.topologyRevision
    this.visibleStartX = startX
    this.visibleStartY = startY
    this.visibleEndX = endX
    this.visibleEndY = endY
    this.visibleDrawBase = drawBase
    this.visibleDrawSot = drawSot
    this.runLength = 0
    this.sotLength = 0
    const mapGrid = this.mapGrid
    if (!mapGrid?.length) return true

    if (drawBase) {
      for (let y = startY; y < endY; y++) {
        let runStart = -1
        for (let x = startX; x <= endX; x++) {
          const tile = x < endX ? mapGrid[y]?.[x] : null
          const isWater = Boolean(
            tile &&
            ((tile.type === 'water' && !tile.airstripStreet) || isStreetWaterTransitionTile(mapGrid, x, y))
          )
          if (isWater && runStart < 0) runStart = x
          if (!isWater && runStart >= 0) {
            this.runs = growInt32(this.runs, this.runLength + RUN_FIELDS)
            this.runs[this.runLength++] = y
            this.runs[this.runLength++] = runStart
            this.runs[this.runLength++] = x
            runStart = -1
          }
        }
      }
    }

    if (drawSot) {
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const sotInfo = this.sotMask?.[y]?.[x]
          if (sotInfo?.type !== 'water' || mapGrid[y]?.[x]?.type === 'street') continue
          const code = orientationCode(sotInfo.orientation)
          if (code === ORIENTATION_NONE) continue
          this.sot = growInt32(this.sot, this.sotLength + SOT_FIELDS)
          this.sot[this.sotLength++] = x
          this.sot[this.sotLength++] = y
          this.sot[this.sotLength++] = code
        }
      }
    }
    this.stats.visibleRunBuilds++
    return true
  }

  render(ctx, {
    mapGrid = this.mapGrid,
    sotMask = this.sotMask,
    topologyRevision = this.topologyRevision ?? 0,
    scrollOffset,
    startX,
    startY,
    endX,
    endY,
    drawBase = true,
    drawSot = true,
    time,
    tone = WATER_EFFECT_TONE,
    saturation = WATER_EFFECT_SATURATION,
    zoom = WATER_EFFECT_ZOOM
  }) {
    if (!ctx || !mapGrid?.length || (!drawBase && !drawSot)) return false
    const passToken = this.profiler.startSpan(PROFILER_SPAN_IDS.CPU_WATER_PASS)
    this.setTopology(mapGrid, sotMask, topologyRevision)
    this.updatePalette({ tone, saturation, zoom })
    this.prepareVisible(startX, startY, endX, endY, drawBase, drawSot)
    const sampledTime = Number.isFinite(time) ? time : this.now()
    this.stats.sampledTime = sampledTime
    const animationPhase = sampledTime * 0.0018
    const offsetX = scrollOffset?.x || 0
    const offsetY = scrollOffset?.y || 0
    let drawCalls = 0

    const profileTiles = this.profiler.isEnabled()
    for (let runIndex = 0; runIndex < this.runLength; runIndex += RUN_FIELDS) {
      const y = this.runs[runIndex]
      for (let x = this.runs[runIndex + 1]; x < this.runs[runIndex + 2]; x++) {
        const tileToken = profileTiles ? this.profiler.startSpan(PROFILER_SPAN_IDS.CPU_WATER_TILE) : -1
        drawCalls += this.drawTile(
          ctx,
          Math.floor(x * this.tileSize - offsetX),
          Math.floor(y * this.tileSize - offsetY),
          this.tileSize + 1,
          x,
          y,
          animationPhase
        )
        if (profileTiles) this.profiler.endSpan(tileToken)
      }
    }

    for (let index = 0; index < this.sotLength; index += SOT_FIELDS) {
      const tileX = this.sot[index]
      const tileY = this.sot[index + 1]
      const tileToken = profileTiles ? this.profiler.startSpan(PROFILER_SPAN_IDS.CPU_WATER_TILE) : -1
      drawCalls += this.drawSotTile(
        ctx,
        Math.floor(tileX * this.tileSize - offsetX),
        Math.floor(tileY * this.tileSize - offsetY),
        this.tileSize + 1,
        tileX,
        tileY,
        this.sot[index + 2],
        animationPhase
      )
      if (profileTiles) this.profiler.endSpan(tileToken)
    }

    this.stats.drawCalls += drawCalls
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.DRAW_CALLS, drawCalls)
    this.profiler.endSpan(passToken)
    return true
  }

  drawTile(ctx, screenX, screenY, size, tileX, tileY, animationPhase) {
    const originX = tileX * this.tileSize
    const originY = tileY * this.tileSize
    const baseAlpha = Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1
    ctx.save()
    ctx.fillStyle = this.palette.deep
    ctx.fillRect(screenX, screenY, size, size)

    const bandHeight = size / 6
    ctx.fillStyle = this.palette.band
    for (let index = 0; index < 5; index++) {
      const phase = animationPhase + originX * this.coefficients[0] + originY * this.coefficients[1] + index * 1.17
      ctx.globalAlpha = baseAlpha * Math.max(0.12, Math.min(0.36, 0.22 + 0.08 * Math.sin(phase * 1.4)))
      ctx.fillRect(screenX, Math.floor(screenY + (index + 1) * bandHeight + Math.sin(phase) * 2), size, 1)
    }

    const columnWidth = size / 4
    ctx.fillStyle = this.palette.column
    for (let index = 0; index < 3; index++) {
      const phase = animationPhase * 0.72 + originX * this.coefficients[2] - originY * this.coefficients[0] + index * 1.9
      ctx.globalAlpha = baseAlpha * Math.max(0.05, Math.min(0.24, 0.1 + 0.08 * Math.cos(phase * 1.7)))
      ctx.fillRect(Math.floor(screenX + (index + 1) * columnWidth + Math.cos(phase) * 1.5), screenY, 1, size)
    }

    const shimmer = 0.5 + 0.5 * Math.sin((originX - originY) * this.coefficients[3] + animationPhase * 1.65)
    ctx.fillStyle = this.palette.bright
    ctx.globalAlpha = baseAlpha * (0.16 + shimmer * 0.08)
    ctx.fillRect(screenX, screenY, size, size)
    ctx.fillStyle = this.palette.shimmer
    ctx.globalAlpha = baseAlpha * (0.08 + shimmer * 0.05)
    ctx.fillRect(screenX, screenY, size, size)
    ctx.restore()
    return 11
  }

  drawSotTile(ctx, screenX, screenY, size, tileX, tileY, orientation, animationPhase) {
    const offsetX = orientation === ORIENTATION_TOP_RIGHT || orientation === ORIENTATION_BOTTOM_RIGHT ? -1 : 0
    const offsetY = orientation === ORIENTATION_BOTTOM_LEFT || orientation === ORIENTATION_BOTTOM_RIGHT ? -1 : 0
    const drawX = screenX + offsetX
    const drawY = screenY + offsetY
    ctx.save()
    ctx.beginPath()
    if (orientation === ORIENTATION_TOP_LEFT) {
      ctx.moveTo(drawX, drawY)
      ctx.lineTo(drawX + size, drawY)
      ctx.lineTo(drawX, drawY + size)
    } else if (orientation === ORIENTATION_TOP_RIGHT) {
      ctx.moveTo(drawX + size, drawY)
      ctx.lineTo(drawX, drawY)
      ctx.lineTo(drawX + size, drawY + size)
    } else if (orientation === ORIENTATION_BOTTOM_LEFT) {
      ctx.moveTo(drawX, drawY + size)
      ctx.lineTo(drawX, drawY)
      ctx.lineTo(drawX + size, drawY + size)
    } else {
      ctx.moveTo(drawX + size, drawY + size)
      ctx.lineTo(drawX, drawY + size)
      ctx.lineTo(drawX + size, drawY)
    }
    ctx.closePath()
    ctx.clip()
    const drawCalls = this.drawTile(ctx, drawX, drawY, size, tileX, tileY, animationPhase)
    ctx.restore()
    return drawCalls
  }

  getStatus() {
    return {
      topologyRevision: this.topologyRevision,
      runBuffer: this.runs,
      sotBuffer: this.sot,
      runCount: this.runLength / RUN_FIELDS,
      sotCount: this.sotLength / SOT_FIELDS,
      palette: this.palette,
      coefficients: this.coefficients,
      stats: { ...this.stats }
    }
  }
}

export function createCpuWaterPass(options) {
  return new CpuWaterPass(options)
}
