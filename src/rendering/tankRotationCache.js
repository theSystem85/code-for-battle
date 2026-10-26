import { SPRITE_WORKER_OPERATIONS } from './spriteStreamingProtocol.js'

export const TANK_ROTATION_STEPS = 64
export const TANK_ROTATION_SUPERSAMPLE = 2
export const TANK_ROTATION_VARIANTS = Object.freeze(['tankV1', 'tankV2', 'tankV3', 'lightTank'])
export const TANK_ROTATION_PARTS = Object.freeze(['wagon', 'turret', 'barrel'])
export const TANK_ROTATION_BYTE_LIMIT = 32 * 1024 * 1024
const TWO_PI = Math.PI * 2
let activeCache = null
let activeBuild = null
let buildToken = 0
function now() { return typeof performance === 'undefined' ? Date.now() : performance.now() }

export function snapToDevicePixel(value, density) {
  const d = Number.isFinite(density) && density > 0 ? density : 1
  return Math.round(value * d) / d
}
export function getRotationStepIndex(angle, steps = TANK_ROTATION_STEPS) {
  if (!Number.isFinite(angle)) return 0
  let normalized = angle % TWO_PI
  if (normalized < 0) normalized += TWO_PI
  return Math.round(normalized / TWO_PI * steps) % steps
}
export function getRotationStepAngle(index, steps = TANK_ROTATION_STEPS) {
  return index / steps * TWO_PI
}
export function getRotatedCellSize(backingWidth, backingHeight) {
  const diagonal = Math.ceil(Math.hypot(backingWidth, backingHeight)) + 2
  return diagonal % 2 === 0 ? diagonal : diagonal + 1
}
function closeResource(resource) {
  if (!resource) return
  if (typeof resource.close === 'function') resource.close()
  else if ('width' in resource && 'height' in resource) {
    resource.width = 0
    resource.height = 0
  }
}
function closeEntries(entries) {
  for (const entry of entries.values()) for (const frame of entry.frames || []) closeResource(frame)
  entries.clear()
}
function defaultYield() { return Promise.resolve() }

/** Calculate retained and peak temporary RGBA estimates before staging sources. */
export function estimateTankRotationBytes(spriteSets, steps = TANK_ROTATION_STEPS, supersample = TANK_ROTATION_SUPERSAMPLE) {
  let residentBytes = 0
  let stagingBytes = 0
  for (const set of spriteSets) {
    for (const { backingWidth, backingHeight } of set.sprites) {
      const size = getRotatedCellSize(backingWidth, backingHeight)
      residentBytes += size * size * 4 * steps
      stagingBytes = Math.max(stagingBytes, size * size * 4 * (1 + supersample ** 2))
    }
  }
  return Object.freeze({ residentBytes, stagingBytes, totalBytes: residentBytes + stagingBytes })
}
function reserveRotationBytes(estimate, byteLimit) {
  if (estimate.totalBytes > byteLimit) return null
  return Object.freeze({ ...estimate, release() {} })
}
function createRotationWorker() {
  if (typeof globalThis.Worker === 'undefined' || typeof globalThis.createImageBitmap !== 'function') return null
  return new globalThis.Worker(new URL('./tankRotationWorker.js', import.meta.url), { type: 'module' })
}
async function prepareWithWorker({ request, sources, workerFactory = createRotationWorker, controller }) {
  const worker = workerFactory()
  if (!worker) throw new Error('Tank rotation worker is unavailable')
  const stagedSources = []
  try {
    for (const source of sources) {
      stagedSources.push(await globalThis.createImageBitmap(source.image))
      if (request.generation !== buildToken) throw new Error('Tank rotation build cancelled')
    }
    return await new Promise((resolve, reject) => {
      controller.cancel = () => {
        worker.terminate()
        reject(new Error('Tank rotation build cancelled'))
      }
      worker.onmessage = event => event.data?.error ? reject(new Error(event.data.error)) : resolve(event.data)
      worker.onerror = event => reject(event.error || new Error(event.message || 'Tank rotation worker failed'))
      worker.postMessage({ ...request, sources: stagedSources }, stagedSources)
    })
  } finally {
    worker.terminate()
    for (const source of stagedSources) closeResource(source)
  }
}

/** Render helper retained for visual-equivalence tests; runtime preparation uses the worker. */
export function renderRotatedSprite(sprite, angle, canvasFactory, supersample = TANK_ROTATION_SUPERSAMPLE) {
  const size = getRotatedCellSize(sprite.backingWidth, sprite.backingHeight)
  const target = canvasFactory(size, size)
  const targetCtx = target?.getContext?.('2d')
  if (!targetCtx) return null
  targetCtx.imageSmoothingEnabled = true
  targetCtx.imageSmoothingQuality = 'high'
  const ss = Math.max(1, Math.floor(supersample))
  if (ss === 1) {
    targetCtx.translate(size / 2, size / 2)
    targetCtx.rotate(angle)
    targetCtx.drawImage(sprite.image, -sprite.backingWidth / 2, -sprite.backingHeight / 2)
  } else {
    const large = canvasFactory(size * ss, size * ss)
    const largeCtx = large?.getContext?.('2d')
    if (!largeCtx) return null
    largeCtx.imageSmoothingEnabled = true
    largeCtx.imageSmoothingQuality = 'high'
    largeCtx.translate(size * ss / 2, size * ss / 2)
    largeCtx.rotate(angle)
    largeCtx.drawImage(sprite.image, -sprite.backingWidth * ss / 2, -sprite.backingHeight * ss / 2, sprite.backingWidth * ss, sprite.backingHeight * ss)
    targetCtx.drawImage(large, 0, 0, size * ss, size * ss, 0, 0, size, size)
    closeResource(large)
  }
  return { canvas: target, size, bytes: size * size * 4 }
}
async function prepareInline({ request, sources, canvasFactory }) {
  const entries = []
  for (const set of request.spriteSets) {
    const parts = []
    for (const descriptor of set.sprites) {
      const frames = []
      for (let index = 0; index < request.steps; index++) {
        const rendered = renderRotatedSprite(sources[descriptor.sourceIndex], getRotationStepAngle(index, request.steps), canvasFactory, request.supersample)
        if (!rendered) throw new Error('Tank rotation canvas is unavailable')
        frames.push(rendered.canvas)
      }
      parts.push({ part: descriptor.part, cellSize: getRotatedCellSize(descriptor.backingWidth, descriptor.backingHeight), frames })
    }
    entries.push({ variant: set.variant, parts })
  }
  return { entries }
}

export async function buildTankRotationCache({ density, getSprite, steps = TANK_ROTATION_STEPS,
  variants = TANK_ROTATION_VARIANTS, parts = TANK_ROTATION_PARTS, supersample = TANK_ROTATION_SUPERSAMPLE,
  byteLimit = TANK_ROTATION_BYTE_LIMIT, reserveBytes = reserveRotationBytes, workerFactory,
  prepareRotations, canvasFactory, yieldFn = defaultYield } = {}) {
  if (typeof getSprite !== 'function') throw new TypeError('getSprite is required')
  const started = now()
  const token = ++buildToken
  await yieldFn()
  if (token !== buildToken) return null
  const sources = []
  const spriteSets = []
  for (const variant of variants) {
    const available = parts.map(part => ({ part, sprite: getSprite(variant, part) }))
    if (available.some(({ sprite }) => !sprite?.image)) continue
    spriteSets.push({ variant, sprites: available.map(({ part, sprite }) => {
      const sourceIndex = sources.length
      sources.push(sprite)
      return { part, sourceIndex, backingWidth: sprite.backingWidth, backingHeight: sprite.backingHeight }
    }) })
  }
  if (spriteSets.length === 0) return null
  const estimate = estimateTankRotationBytes(spriteSets, steps, supersample)
  const reservation = await reserveBytes(estimate, byteLimit)
  if (!reservation) return null
  const request = { operation: SPRITE_WORKER_OPERATIONS.PREPARE_ROTATIONS, generation: token, steps, supersample, spriteSets }
  const controller = { token, cancel: null }
  activeBuild = controller
  const prepare = prepareRotations || (canvasFactory
    ? options => prepareInline({ ...options, canvasFactory })
    : options => prepareWithWorker({ ...options, workerFactory, controller }))
  let stagedEntries = new Map()
  let unclaimedFrames = new Set()
  let published = false
  try {
    const result = await prepare({ request, sources })
    unclaimedFrames = new Set((result?.entries || []).flatMap(entry =>
      (entry.parts || []).flatMap(part => part.frames || [])))
    for (const variantResult of result?.entries || []) {
      const expected = spriteSets.find(set => set.variant === variantResult.variant)
      if (!expected || variantResult.parts?.length !== expected.sprites.length) throw new Error('Incomplete tank rotation part set')
      for (const partResult of variantResult.parts) {
        if (partResult.frames?.length !== steps) throw new Error('Incomplete tank rotation frames')
        const descriptor = expected.sprites.find(sprite => sprite.part === partResult.part)
        if (!descriptor) throw new Error('Unexpected tank rotation part')
        stagedEntries.set(`${expected.variant}:${partResult.part}`, {
          frames: partResult.frames, cellSize: partResult.cellSize,
          logicalSize: partResult.cellSize / density, sprite: sources[descriptor.sourceIndex]
        })
        for (const frame of partResult.frames) unclaimedFrames.delete(frame)
      }
    }
    if (token !== buildToken || stagedEntries.size !== spriteSets.length * parts.length) return null
    const cache = Object.freeze({ density, steps, entries: stagedEntries, bytes: estimate.residentBytes,
      buildMs: now() - started, reservation })
    stagedEntries = new Map()
    disposeTankRotationCache()
    activeCache = cache
    published = true
    return cache
  } finally {
    closeEntries(stagedEntries)
    for (const frame of unclaimedFrames) closeResource(frame)
    if (!published) reservation.release?.()
    if (activeBuild === controller) activeBuild = null
  }
}
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
  return { image: entry.frames[getRotationStepIndex(angle, activeCache.steps)], logicalSize: entry.logicalSize, density: activeCache.density }
}
export function getTankRotationCacheStats() {
  return { ready: Boolean(activeCache), density: activeCache?.density || null, steps: activeCache?.steps || 0,
    entries: activeCache?.entries.size || 0, bytes: activeCache?.bytes || 0, buildMs: activeCache?.buildMs || 0 }
}
export function disposeTankRotationCache() {
  if (!activeCache) return
  closeEntries(activeCache.entries)
  activeCache.reservation?.release?.()
  activeCache = null
}
export function resetTankRotationCache() {
  buildToken++
  activeBuild?.cancel?.()
  disposeTankRotationCache()
}
