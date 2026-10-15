// trackMarksRenderer.js
// Bakes ground track marks into per-chunk offscreen canvases and blits the
// visible chunks each frame. New marks are appended to an existing bake; only
// chunks that lost marks (eviction/expiry) or whose fade step changed are
// rebaked, a bounded number per frame, in one pass over the ring buffer.

import {
  trackMarkStore,
  trackMarkSettings,
  getTrackMarkAlpha,
  TRACK_CHUNK_PX,
  TRACK_KIND,
  TRACK_SURFACE
} from '../game/trackMarks.js'
import { getCanvasLogicalSize } from './renderingUtils.js'
import { getSimulationTime } from '../game/time.js'

// Overflow so short segments near a chunk edge are not clipped.
const CHUNK_PAD_PX = 24
const MAX_BAKE_DPR = 2
const MAX_REBAKES_PER_FRAME = 2
const FADE_REBAKE_INTERVAL_MS = 1000
// Bound for all baked chunk canvases together (bytes). Least recently drawn
// chunks are released first; they are rebaked from the ring when seen again.
export const TRACK_CANVAS_BYTE_BUDGET = 48 * 1024 * 1024

// [r, g, b, alpha] per surface; low opacity so the photographic ground shows.
const SURFACE_STYLE = []
SURFACE_STYLE[TRACK_SURFACE.grass] = [30, 38, 14, 0.3]
SURFACE_STYLE[TRACK_SURFACE.soil] = [48, 32, 18, 0.26]
SURFACE_STYLE[TRACK_SURFACE.sand] = [104, 78, 44, 0.28]
SURFACE_STYLE[TRACK_SURFACE.snow] = [96, 104, 118, 0.42]
SURFACE_STYLE[TRACK_SURFACE.street] = [128, 104, 70, 0.45]
// Light rim drawn beside sand/snow treads to sell the indentation.
const RIM_STYLE = []
RIM_STYLE[TRACK_SURFACE.sand] = 'rgba(255, 238, 200, 0.12)'
RIM_STYLE[TRACK_SURFACE.snow] = 'rgba(255, 255, 255, 0.22)'

const CLEAT_DASH = [1, 2.4]
const NO_DASH = []

function quantizeAlpha(alpha) {
  return Math.round(alpha * 16) / 16
}

export class TrackMarksRenderer {
  constructor(store = trackMarkStore) {
    this.store = store
    this.canvases = []
    this.lastUsed = []
    this.bakedAt = []
    this.hasFading = []
    this.bakeScale = 1
    this.canvasBytes = 0
    this.rebakeQueue = new Int32Array(MAX_REBAKES_PER_FRAME)
    store.listener = this
  }

  // --- store listener -----------------------------------------------------
  onAdded(store, slot, chunk) {
    const canvas = this.canvases[chunk]
    if (canvas && !store.chunkDirty[chunk]) {
      const ctx = canvas.getContext('2d')
      this.drawMark(ctx, slot, chunk, getSimulationTime())
    }
  }

  onRemoved() {}

  onCleared() { this.releaseAll() }

  // --- memory -------------------------------------------------------------
  releaseChunk(chunk) {
    const canvas = this.canvases[chunk]
    if (!canvas) return
    this.canvasBytes -= canvas.width * canvas.height * 4
    canvas.width = 0
    canvas.height = 0
    this.canvases[chunk] = null
  }

  releaseAll() {
    for (let i = 0; i < this.canvases.length; i++) this.releaseChunk(i)
    this.canvases.length = 0
  }

  enforceBudget(visibleStamp) {
    while (this.canvasBytes > TRACK_CANVAS_BYTE_BUDGET) {
      let oldest = -1
      let oldestTime = Infinity
      for (let i = 0; i < this.canvases.length; i++) {
        if (this.canvases[i] && this.lastUsed[i] < oldestTime && this.lastUsed[i] !== visibleStamp) {
          oldest = i
          oldestTime = this.lastUsed[i]
        }
      }
      if (oldest < 0) return
      this.releaseChunk(oldest)
    }
  }

  getStats() {
    let canvases = 0
    for (const c of this.canvases) if (c) canvases++
    return { marks: this.store.count, canvases, canvasBytes: this.canvasBytes, arrayBytes: this.store.arrayBytes() }
  }

  // --- drawing ------------------------------------------------------------
  chunkOrigin(chunk) {
    const cx = chunk % this.store.chunksX
    const cy = (chunk - cx) / this.store.chunksX
    return [cx * TRACK_CHUNK_PX - CHUNK_PAD_PX, cy * TRACK_CHUNK_PX - CHUNK_PAD_PX]
  }

  drawMark(ctx, slot, chunk, now) {
    const s = this.store
    const surface = s.surface[slot]
    const style = SURFACE_STYLE[surface]
    if (!style) return
    const alpha = quantizeAlpha(style[3] * s.strength[slot] * getTrackMarkAlpha(now - s.birth[slot]))
    if (alpha <= 0) return
    const [ox, oy] = this.chunkOrigin(chunk)
    const scale = this.bakeScale
    const g = s.halfGauge[slot]
    ctx.setTransform(scale, 0, 0, scale, -ox * scale, -oy * scale)
    ctx.lineCap = 'butt'
    ctx.lineWidth = s.width[slot]
    ctx.strokeStyle = `rgba(${style[0]}, ${style[1]}, ${style[2]}, ${alpha})`
    ctx.beginPath()
    if (s.kind[slot] === TRACK_KIND.pivot) {
      // Scuffed arcs: each tread sweeps around the hull centre.
      const a0 = s.a0[slot]
      const a1 = s.a1[slot]
      const start = Math.min(a0, a1) + Math.PI / 2
      const end = Math.max(a0, a1) + Math.PI / 2
      const x = s.x0[slot]
      const y = s.y0[slot]
      ctx.arc(x, y, g, start, end)
      ctx.moveTo(x + Math.cos(start + Math.PI) * g, y + Math.sin(start + Math.PI) * g)
      ctx.arc(x, y, g, start + Math.PI, end + Math.PI)
      ctx.stroke()
      return
    }
    // Tread lines follow the heading at both ends, so curves stay smooth.
    const nx0 = -Math.sin(s.a0[slot]) * g
    const ny0 = Math.cos(s.a0[slot]) * g
    const nx1 = -Math.sin(s.a1[slot]) * g
    const ny1 = Math.cos(s.a1[slot]) * g
    const x0 = s.x0[slot]
    const y0 = s.y0[slot]
    const x1 = s.x1[slot]
    const y1 = s.y1[slot]
    ctx.moveTo(x0 + nx0, y0 + ny0)
    ctx.lineTo(x1 + nx1, y1 + ny1)
    ctx.moveTo(x0 - nx0, y0 - ny0)
    ctx.lineTo(x1 - nx1, y1 - ny1)
    ctx.stroke()
    // Grouser cleat texture: thin darker dashes across each tread.
    ctx.lineWidth = Math.max(0.6, s.width[slot] * 0.18)
    ctx.setLineDash?.(CLEAT_DASH)
    ctx.strokeStyle = `rgba(${style[0] >> 1}, ${style[1] >> 1}, ${style[2] >> 1}, ${alpha * 0.8})`
    ctx.stroke()
    ctx.setLineDash?.(NO_DASH)
    const rim = RIM_STYLE[surface]
    if (rim) {
      const w = s.width[slot] * 0.5 + 0.6
      const rx0 = -Math.sin(s.a0[slot]) * (g + w)
      const ry0 = Math.cos(s.a0[slot]) * (g + w)
      const rx1 = -Math.sin(s.a1[slot]) * (g + w)
      const ry1 = Math.cos(s.a1[slot]) * (g + w)
      ctx.lineWidth = 0.8
      ctx.strokeStyle = rim
      ctx.globalAlpha = getTrackMarkAlpha(now - s.birth[slot]) * s.strength[slot]
      ctx.beginPath()
      ctx.moveTo(x0 + rx0, y0 + ry0)
      ctx.lineTo(x1 + rx1, y1 + ry1)
      ctx.moveTo(x0 - rx0, y0 - ry0)
      ctx.lineTo(x1 - rx1, y1 - ry1)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  ensureCanvas(chunk) {
    let canvas = this.canvases[chunk]
    const size = Math.ceil((TRACK_CHUNK_PX + CHUNK_PAD_PX * 2) * this.bakeScale)
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      this.canvases[chunk] = canvas
      this.canvasBytes += size * size * 4
    }
    return canvas
  }

  rebake(chunks, n, now) {
    const s = this.store
    const flags = s.chunkDirty
    for (let i = 0; i < n; i++) {
      const chunk = chunks[i]
      const canvas = this.ensureCanvas(chunk)
      const ctx = canvas.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      flags[chunk] = 2 // being rebaked
      this.hasFading[chunk] = false
      this.bakedAt[chunk] = now
    }
    const fadeStart = trackMarkSettings.fadeDelayS * 1000
    for (let i = 0; i < s.count; i++) {
      const slot = s.slotAt(i)
      const chunk = s.chunk[slot]
      if (chunk < 0 || flags[chunk] !== 2) continue
      this.drawMark(this.canvases[chunk].getContext('2d'), slot, chunk, now)
      if (trackMarkSettings.fade && now - s.birth[slot] > fadeStart - FADE_REBAKE_INTERVAL_MS) this.hasFading[chunk] = true
    }
    for (let i = 0; i < n; i++) flags[chunks[i]] = 0
  }

  render(ctx, scrollOffset, gameState) {
    const s = this.store
    if (!trackMarkSettings.enabled || !s.chunksX) return
    const now = getSimulationTime(gameState)
    const transform = ctx.getTransform?.()
    const dpr = Math.min(MAX_BAKE_DPR, Math.max(1, transform ? Math.abs(transform.a) : 1))
    if (dpr !== this.bakeScale) {
      this.bakeScale = dpr
      this.releaseAll()
    }
    // Release canvases of chunks that no longer hold any mark.
    for (let i = 0; i < this.canvases.length; i++) {
      if (this.canvases[i] && s.chunkCounts[i] === 0) this.releaseChunk(i)
    }
    if (s.count === 0) return
    const { width, height } = getCanvasLogicalSize(ctx.canvas)
    const minCx = Math.max(0, Math.floor((scrollOffset.x - CHUNK_PAD_PX) / TRACK_CHUNK_PX))
    const minCy = Math.max(0, Math.floor((scrollOffset.y - CHUNK_PAD_PX) / TRACK_CHUNK_PX))
    const maxCx = Math.min(s.chunksX - 1, Math.floor((scrollOffset.x + width + CHUNK_PAD_PX) / TRACK_CHUNK_PX))
    const maxCy = Math.min(s.chunksY - 1, Math.floor((scrollOffset.y + height + CHUNK_PAD_PX) / TRACK_CHUNK_PX))
    let queued = 0
    const stamp = now + 0.5 // unique per frame for LRU protection
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const chunk = cy * s.chunksX + cx
        if (s.chunkCounts[chunk] === 0) continue
        this.lastUsed[chunk] = stamp
        const stale = !this.canvases[chunk] || s.chunkDirty[chunk] ||
          (this.hasFading[chunk] && now - this.bakedAt[chunk] >= FADE_REBAKE_INTERVAL_MS)
        if (stale && queued < MAX_REBAKES_PER_FRAME) this.rebakeQueue[queued++] = chunk
      }
    }
    if (queued > 0) this.rebake(this.rebakeQueue, queued, now)
    this.enforceBudget(stamp)

    ctx.save()
    const size = TRACK_CHUNK_PX + CHUNK_PAD_PX * 2
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const chunk = cy * s.chunksX + cx
        const canvas = this.canvases[chunk]
        if (!canvas || s.chunkCounts[chunk] === 0) continue
        ctx.drawImage(canvas,
          cx * TRACK_CHUNK_PX - CHUNK_PAD_PX - scrollOffset.x,
          cy * TRACK_CHUNK_PX - CHUNK_PAD_PX - scrollOffset.y,
          size, size)
      }
    }
    ctx.restore()
  }
}

