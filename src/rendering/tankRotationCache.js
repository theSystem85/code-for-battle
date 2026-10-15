// rendering/tankRotationCache.js
// Pre-rendered rotation cache for the layered tank sprites (wagon, turret, barrel).
//
// Rotated sprites are never stored in the repository. After the prepared sprite registry
// is published, this module renders ROTATION_STEPS rotated copies of every tank part at the
// registry density into offscreen canvases (2x supersampled, high-quality smoothing) during
// idle time. The tank renderer then draws the nearest cached angle with an identity rotation
// at a device-pixel-snapped position, which keeps the sprite edges crisp. Until the cache is
// ready (or if it is disabled), the renderer falls back to live rotation.

export const TANK_ROTATION_STEPS = 64
export const TANK_ROTATION_SUPERSAMPLE = 2
export const TANK_ROTATION_VARIANTS = Object.freeze(['tankV1', 'tankV2', 'tankV3'])
export const TANK_ROTATION_PARTS = Object.freeze(['wagon', 'turret', 'barrel'])
const TWO_PI = Math.PI * 2
const FRAME_SLICE_MS = 8

let activeCache = null
let buildToken = 0

/** Snap a logical coordinate to the nearest device pixel for the given density. */
export function snapToDevicePixel(value, density) {
  const d = Number.isFinite(density) && density > 0 ? density : 1
  return Math.round(value * d) / d
}

/** Map an angle in radians to the nearest cache step index. */
export function getRotationStepIndex(angle, steps = TANK_ROTATION_STEPS) {
  if (!Number.isFinite(angle)) return 0
  let normalized = angle % TWO_PI
  if (normalized < 0) normalized += TWO_PI
  return Math.round(normalized / TWO_PI * steps) % steps
}

export function getRotationStepAngle(index, steps = TANK_ROTATION_STEPS) {
  return index / steps * TWO_PI
}

/**
 * Even square backing size (device pixels) that holds the sprite at any rotation.
 * Even sizes keep the center on a device-pixel boundary so snapped draws stay aligned.
 */
export function getRotatedCellSize(backingWidth, backingHeight) {
  const diagonal = Math.ceil(Math.hypot(backingWidth, backingHeight)) + 2
  return diagonal % 2 === 0 ? diagonal : diagonal + 1
}

function defaultCanvasFactory(width, height) {
  if (typeof globalThis.OffscreenCanvas !== 'undefined') return new globalThis.OffscreenCanvas(width, height)
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function defaultYield() {
  return new Promise(resolve => {
    if (typeof globalThis.requestIdleCallback === 'function') {
      globalThis.requestIdleCallback(() => resolve(), { timeout: 200 })
    } else {
      setTimeout(resolve, 0)
    }
  })
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/** Render one rotated copy of a prepared sprite into an even-sized square canvas. */
export function renderRotatedSprite(sprite, angle, canvasFactory = defaultCanvasFactory, supersample = TANK_ROTATION_SUPERSAMPLE) {
  const size = getRotatedCellSize(sprite.backingWidth, sprite.backingHeight)
  const ss = Math.max(1, Math.floor(supersample))
  const target = canvasFactory(size, size)
  if (!target) return null
  target.width = size
  target.height = size
  const targetCtx = target.getContext('2d')
  if (!targetCtx) return null
  targetCtx.imageSmoothingEnabled = true
  targetCtx.imageSmoothingQuality = 'high'

  let source = sprite.image
  let sourceSize = size
  if (ss > 1) {
    const large = canvasFactory(size * ss, size * ss)
    const largeCtx = large?.getContext?.('2d')
    if (largeCtx) {
      large.width = size * ss
      large.height = size * ss
      largeCtx.imageSmoothingEnabled = true
      largeCtx.imageSmoothingQuality = 'high'
      largeCtx.translate(size * ss / 2, size * ss / 2)
      largeCtx.rotate(angle)
      largeCtx.drawImage(
        sprite.image,
        -sprite.backingWidth * ss / 2,
        -sprite.backingHeight * ss / 2,
        sprite.backingWidth * ss,
        sprite.backingHeight * ss
      )
      source = large
      sourceSize = size * ss
    }
  }

  if (source === sprite.image) {
    targetCtx.translate(size / 2, size / 2)
    targetCtx.rotate(angle)
    targetCtx.drawImage(sprite.image, -sprite.backingWidth / 2, -sprite.backingHeight / 2)
  } else {
    targetCtx.drawImage(source, 0, 0, sourceSize, sourceSize, 0, 0, size, size)
    source.width = 0
    source.height = 0
  }
  return { canvas: target, size, bytes: size * size * 4 }
}

/**
 * Build the rotation cache for all tank parts. Work is sliced into short chunks with idle
 * yields so game start and the first frames are not stalled.
 * @param {Object} options
 * @param {number} options.density - Device pixel density of the prepared sprites.
 * @param {(variant: string, part: string) => object|null} options.getSprite - Prepared sprite lookup.
 */
export async function buildTankRotationCache({
  density,
  getSprite,
  steps = TANK_ROTATION_STEPS,
  variants = TANK_ROTATION_VARIANTS,
  parts = TANK_ROTATION_PARTS,
  canvasFactory = defaultCanvasFactory,
  yieldFn = defaultYield,
  sliceMs = FRAME_SLICE_MS,
  supersample = TANK_ROTATION_SUPERSAMPLE
} = {}) {
  if (typeof getSprite !== 'function') throw new TypeError('getSprite is required')
  const token = ++buildToken
  const started = now()
  const entries = new Map()
  let bytes = 0
  // Start after an idle yield so publishing sprites never blocks the first frames.
  await yieldFn()
  if (token !== buildToken) return null
  let sliceStart = now()
  for (const variant of variants) {
    for (const part of parts) {
      const sprite = getSprite(variant, part)
      if (!sprite?.image) continue
      const frames = new Array(steps)
      let cellSize = 0
      for (let index = 0; index < steps; index++) {
        if (token !== buildToken) return null
        const rendered = renderRotatedSprite(sprite, getRotationStepAngle(index, steps), canvasFactory, supersample)
        if (!rendered) return null
        frames[index] = rendered.canvas
        cellSize = rendered.size
        bytes += rendered.bytes
        if (now() - sliceStart >= sliceMs) {
          await yieldFn()
          if (token !== buildToken) return null
          sliceStart = now()
        }
      }
      entries.set(`${variant}:${part}`, {
        frames,
        cellSize,
        logicalSize: cellSize / density,
        sprite
      })
    }
  }
  if (token !== buildToken) return null
  const cache = Object.freeze({
    density,
    steps,
    entries,
    bytes,
    buildMs: now() - started
  })
  disposeTankRotationCache()
  activeCache = cache
  return cache
}

/** Start a background build; failures leave the live-rotation fallback in place. */
export function scheduleTankRotationCache(options) {
  return buildTankRotationCache(options).catch(error => {
    if (typeof window !== 'undefined') window.logger?.warn?.('Tank rotation cache build failed', error)
    return null
  })
}

export function getTankRotationFrame(variant, part, angle, sprite = null) {
  if (!activeCache) return null
  const entry = activeCache.entries.get(`${variant}:${part}`)
  if (!entry || (sprite && entry.sprite !== sprite)) return null
  return {
    image: entry.frames[getRotationStepIndex(angle, activeCache.steps)],
    logicalSize: entry.logicalSize,
    density: activeCache.density
  }
}

export function getTankRotationCacheStats() {
  return {
    ready: Boolean(activeCache),
    density: activeCache?.density || null,
    steps: activeCache?.steps || 0,
    entries: activeCache?.entries.size || 0,
    bytes: activeCache?.bytes || 0,
    buildMs: activeCache?.buildMs || 0
  }
}

export function disposeTankRotationCache() {
  if (!activeCache) return
  for (const entry of activeCache.entries.values()) {
    for (const frame of entry.frames) {
      if (frame) {
        frame.width = 0
        frame.height = 0
      }
    }
  }
  activeCache = null
}

/** Invalidate any running build and drop the current cache (density swap, tests). */
export function resetTankRotationCache() {
  buildToken++
  disposeTankRotationCache()
}
