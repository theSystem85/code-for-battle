import { createIdleAssetQueue } from '../../utils/idleAssetQueue.js'
import { loadPreparedImage } from './imagePreparation.js'
import { fetchAssetJson, withTimeout } from '../../utils/assetLoading.js'
import { PreparedSpriteRegistry } from './preparedSpriteRegistry.js'
import { bootMark } from '../../ui/bootTiming.js'
import { reportBootSprites, yieldBootPaint } from '../../ui/bootProgress.js'
import { createSpriteStreamingScheduler } from '../../utils/spriteStreamingScheduler.js'
import { SpriteResourceStore } from './spriteResourceStore.js'

export const PREPARED_SPRITE_MANIFEST_URL = '/images/prepared/sprite-manifest.json'
export const AIRCRAFT_RESIZE_AUDIT_TAGS = Object.freeze({
  TAKEOFF: 'authorized-aircraft-takeoff-resize',
  LANDING: 'authorized-aircraft-landing-resize'
})

const DEFAULT_BYTE_BUDGET = 256 * 1024 * 1024
const DENSITY_PRECISION = 1000
const AUTHORIZED_AIRCRAFT_RESIZE_TAGS = new Set(Object.values(AIRCRAFT_RESIZE_AUDIT_TAGS))
let backgroundPriorities = null
let activePrepared = null
let activeRegistry = null
let activeManifest = null
let activeDensity = 0
let activeLookup = null
let activeBuildingLayers = null
let aircraftResizeAuditSink = null

function assertDensity(density) {
  if (!Number.isFinite(density) || density <= 0) throw new RangeError('Invalid prepared sprite density')
}

function densityToken(density) {
  return String(Math.round(density * DENSITY_PRECISION) / DENSITY_PRECISION)
}

export function getPreparedSpriteCacheKey(assetVersion, density, id) {
  if (!assetVersion || typeof assetVersion !== 'string') throw new TypeError('assetVersion is required')
  assertDensity(density)
  if (!id || typeof id !== 'string') throw new TypeError('sprite id is required')
  return `${assetVersion}@${densityToken(density)}:${id}`
}

/** A cache identity must not confuse requested output density with the tier
 * currently satisfying it. Lower tiers are sampled into the same logical
 * geometry while a settled view waits for its final representation. */
export function getProgressiveSpriteCacheKey(assetVersion, finalDensity, currentTier, id) {
  if (!Number.isInteger(currentTier) || currentTier < 0) throw new RangeError('Invalid current sprite tier')
  return `${getPreparedSpriteCacheKey(assetVersion, finalDensity, id)}@tier:${currentTier}`
}

const STREAMING_BUDGETS = Object.freeze({
  reserved: 32 * 1024 * 1024,
  staging: 64 * 1024 * 1024,
  transfer: 64 * 1024 * 1024,
  resident: 192 * 1024 * 1024,
  'gpu-estimate': 192 * 1024 * 1024
})

/**
 * Integration adapter for generated sheets and worker-prepared custom sheets.
 * `stage` publishes metadata synchronously, then queues only visual resources.
 * Consequently selection, placement, and simulation never depend on arrival
 * order. Publications are generation checked by SpriteResourceStore.
 */
export function createProgressiveSpriteStreamer({
  loadTier,
  workerPool = null,
  onPublish = null,
  hasForegroundSlack = () => true,
  schedule,
  budgets = STREAMING_BUDGETS
} = {}) {
  if (typeof loadTier !== 'function') throw new TypeError('A progressive sprite tier loader is required')
  const store = new SpriteResourceStore({ budgets })
  let manifests = new Map()
  let generations = Object.freeze({ asset: 0, map: 0, density: 0 })
  let finalDensity = 1
  let revision = 0
  let demandRevision = 0

  const queue = createIdleAssetQueue(async requestId => {
    const separator = requestId.lastIndexOf('@')
    const spriteId = requestId.slice(0, separator)
    const tier = Number(requestId.slice(separator + 1))
    const manifest = manifests.get(spriteId)
    if (!manifest) return null
    const source = manifest.sources.find(candidate => candidate.tier === tier)
    if (!source) return null
    const jobGenerations = generations
    const value = manifest.workerPayload && workerPool
      ? await workerPool.prepare({ ...manifest.workerPayload, source }, {
        estimatedBytes: source.decodedBytes,
        jobGenerations
      })
      : await loadTier(manifest, source, jobGenerations)
    const resourceId = `${requestId}:${manifest.signature}:${revision + 1}`
    const acquired = store.registerResource({
      resourceId,
      value,
      allocations: [{ byteClass: 'resident', bytes: source.decodedBytes }],
      generation: jobGenerations.asset,
      tier
    })
    acquired.release()
    const previous = store.lookup(spriteId)
    // Never regress art which has already reached a sharper tier.
    if (previous?.tier >= tier) {
      store.disposeResource(resourceId, 'lower-tier-discarded')
      return previous
    }
    const publication = Object.freeze({
      resourceId,
      revision: ++revision,
      tier,
      finalDensity,
      currentDensity: source.backingDensity,
      generations: jobGenerations,
      logicalWidth: manifest.logicalWidth,
      logicalHeight: manifest.logicalHeight,
      sourceRect: Object.freeze({ x: source.x, y: source.y, width: source.width, height: source.height }),
      cacheKey: getProgressiveSpriteCacheKey(manifest.signature, finalDensity, tier, spriteId)
    })
    if (!store.publish(spriteId, publication)) {
      store.disposeResource(resourceId, 'stale-publication')
      return null
    }
    onPublish?.(Object.freeze({ spriteId, ...publication }))
    return store.lookup(spriteId)
  }, {
    concurrency: 2,
    maxReservedBytes: budgets.staging,
    hasForegroundSlack,
    schedule
  })
  const scheduler = createSpriteStreamingScheduler(queue)

  function stage(nextManifests, options = {}) {
    const nextGenerations = Object.freeze({ ...options.generations })
    store.setCurrentGenerations(nextGenerations)
    workerPool?.cancelGeneration(nextGenerations, 'sprite-stream-generation-swap')
    generations = nextGenerations
    finalDensity = options.finalDensity
    // All immutable metadata is visible before the first decode can settle.
    manifests = new Map(nextManifests.map(manifest => [manifest.spriteId, Object.freeze({ ...manifest })]))
    const coarse = []
    for (const manifest of manifests.values()) {
      const source = manifest.sources[0]
      if (source) coarse.push({ id: `${manifest.spriteId}@${source.tier}`, bytes: source.decodedBytes })
    }
    scheduler.update({
      revision: ++demandRevision,
      capturedAt: 0,
      moving: true,
      generations,
      visibleCoarse: coarse
    })
    return Object.freeze([...manifests.values()])
  }

  function updateDemand({ visibleSpriteIds = [], lookaheadSpriteIds = [], moving = false, capturedAt = performance.now() } = {}) {
    const requests = (ids, final) => ids.flatMap(spriteId => {
      const manifest = manifests.get(spriteId)
      if (!manifest) return []
      const source = final ? manifest.sources.at(-1) : manifest.sources[0]
      return source ? [{ id: `${spriteId}@${source.tier}`, bytes: source.decodedBytes }] : []
    })
    return scheduler.update({
      revision: ++demandRevision,
      capturedAt,
      moving,
      generations,
      visibleCoarse: requests(visibleSpriteIds, false),
      lookahead: requests(lookaheadSpriteIds, false),
      visibleRefinement: requests(visibleSpriteIds, true)
    })
  }

  return Object.freeze({
    stage,
    updateDemand,
    lookup: spriteId => store.lookup(spriteId),
    get metadata() { return Object.freeze([...manifests.values()]) },
    get state() { return Object.freeze({ generations, finalDensity, scheduler: scheduler.getState(), resources: store.snapshot() }) },
    dispose() { workerPool?.dispose(); store.dispose() }
  })
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason || createAbortError()
}

function createAbortError() {
  const error = new Error('Sprite preparation aborted')
  error.name = 'AbortError'
  return error
}

function loadImage(url, imageFactory, signal) {
  return loadPreparedImage(url, { imageFactory, signal })
}

function chooseVariant(entry, density) {
  const exact = entry.variants.find(variant => Math.abs(variant.density - density) < 0.0001)
  if (exact) return { variant: exact, exact: true }
  const sorted = entry.variants.slice().sort((left, right) => left.density - right.density)
  return {
    variant: sorted.find(variant => variant.density >= density) || sorted[sorted.length - 1],
    exact: false
  }
}

function createCanvasBitmap(image, sourceRect, width, height, canvasFactory) {
  if (!canvasFactory) throw new Error('No createImageBitmap or preparation canvas is available')
  const canvas = canvasFactory(width, height)
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  if (sourceRect) {
    context.drawImage(
      image,
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      0,
      0,
      width,
      height
    )
  } else {
    context.drawImage(image, 0, 0, width, height)
  }
  return canvas
}

async function createSizedBitmap(image, sourceRect, width, height, createBitmap, canvasFactory) {
  if (createBitmap) {
    const options = { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' }
    if (sourceRect) {
      return createBitmap(
        image,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
        options
      )
    }
    return createBitmap(image, options)
  }
  return createCanvasBitmap(image, sourceRect, width, height, canvasFactory)
}

function defaultCanvasFactory(width, height) {
  if (typeof globalThis.OffscreenCanvas !== 'undefined') return new globalThis.OffscreenCanvas(width, height)
  if (typeof document === 'undefined') return null
  return document.createElement('canvas')
}

function attachAuditMetadata(image, sprite) {
  const metadata = Object.freeze({
    prepared: true,
    id: sprite.id,
    assetVersion: sprite.assetVersion,
    density: sprite.density,
    backingWidth: sprite.backingWidth,
    backingHeight: sprite.backingHeight,
    logicalWidth: sprite.logicalWidth,
    logicalHeight: sprite.logicalHeight
  })
  try {
    Object.defineProperty(image, '__preparedSpriteAudit', {
      configurable: true,
      value: metadata
    })
  } catch {
    // Some host image objects are non-extensible. The sprite handle still exposes the metadata.
  }
  return metadata
}

function disposePreparedImage(sprite) {
  const image = sprite.image
  if (typeof image.close === 'function') {
    image.close()
  } else if (typeof image.getContext === 'function') {
    image.width = 0
    image.height = 0
  } else if ('src' in image) {
    image.onload = null
    image.onerror = null
    image.src = ''
  }
}

function createSpriteHandle(entry, image, density, manifest) {
  const backingWidth = Math.max(1, Math.round(entry.logicalWidth * density))
  const backingHeight = Math.max(1, Math.round(entry.logicalHeight * density))
  const sprite = {
    id: entry.id,
    assetVersion: manifest.assetVersion,
    density,
    image,
    backingWidth,
    backingHeight,
    logicalWidth: entry.logicalWidth,
    logicalHeight: entry.logicalHeight,
    sourceWidth: entry.sourceWidth,
    sourceHeight: entry.sourceHeight,
    source: entry.source,
    hasAlpha: entry.hasAlpha,
    alphaMode: entry.alphaMode,
    anchors: entry.anchors,
    states: entry.states,
    audit: null
  }
  sprite.audit = attachAuditMetadata(image, sprite)
  return Object.freeze(sprite)
}

/**
 * Decode and size every manifest entry before returning an unpublished registry.
 * Custom densities are materialized here and never constructed from a render loop.
 */
export async function prepareSpriteRegistry({
  density = (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
  assetGeneration = 0,
  byteBudget = DEFAULT_BYTE_BUDGET,
  manifestUrl = PREPARED_SPRITE_MANIFEST_URL,
  fetchImpl = globalThis.fetch,
  imageFactory = () => new Image(),
  createBitmap = globalThis.createImageBitmap?.bind(globalThis),
  canvasFactory = defaultCanvasFactory,
  signal,
  onProgress,
  deferUnits = false,
  initialUnitTypes = []
} = {}) {
  assertDensity(density)
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required')
  throwIfAborted(signal)
  const manifest = await fetchAssetJson(manifestUrl, { fetchImpl, signal })
  if (manifest.schemaVersion !== 1 || !manifest.assetVersion || !Array.isArray(manifest.entries)) {
    throw new Error('Unsupported prepared sprite manifest')
  }

  const requiredBytes = manifest.entries.reduce((sum, entry) =>
    sum +
    Math.max(1, Math.round(entry.logicalWidth * density)) *
    Math.max(1, Math.round(entry.logicalHeight * density)) * 4, 0)
  if (requiredBytes > byteBudget) {
    throw new Error(`Prepared sprite byte budget exceeded: ${requiredBytes} > ${byteBudget}`)
  }

  const registry = new PreparedSpriteRegistry({ assetGeneration, density, byteBudget })
  const sourcePromises = new Map()
  const stagedDisposables = []
  const entryCount = manifest.entries.length
  let preparedEntries = 0
  let lastPaintYield = typeof performance !== 'undefined' ? performance.now() : 0
  bootMark('sprites:start', { entries: entryCount, density })
  onProgress?.(0, entryCount)
  reportBootSprites(0, entryCount)
  const getSource = url => {
    let promise = sourcePromises.get(url)
    if (!promise) {
      promise = loadImage(url, imageFactory, signal)
      sourcePromises.set(url, promise)
    }
    return promise
  }

  try {
    const prepareEntry = async(entry) => {
      throwIfAborted(signal)
      const selection = chooseVariant(entry, density)
      const targetWidth = Math.max(1, Math.round(entry.logicalWidth * density))
      const targetHeight = Math.max(1, Math.round(entry.logicalHeight * density))
      // Always fetch a prepared density variant (the nearest one at or above the device
      // density); full-size source images are never downloaded when variants exist.
      const path = selection.variant?.path || entry.source
      const sourceUrl = selection.variant?.path
        ? `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(manifest.assetVersion)}`
        : path
      let source
      try {
        source = await getSource(sourceUrl)
      } catch (error) {
        if (signal?.aborted) throw error
        console.warn(`Prepared sprite unavailable: ${entry.id}`, error)
        return
      }
      let image = source
      if (
        selection.variant?.sourceRect ||
        !selection.exact ||
        (source.naturalWidth || source.width) !== targetWidth ||
        (source.naturalHeight || source.height) !== targetHeight
      ) {
        image = await withTimeout(createSizedBitmap(
          source,
          selection.variant?.sourceRect,
          targetWidth,
          targetHeight,
          createBitmap,
          canvasFactory
        ))
        if (typeof image.close === 'function') {
          stagedDisposables.push(image)
        }
      }
      if (registry.disposed) {
        if (image !== source) image.close?.()
        return
      }
      const sprite = createSpriteHandle(entry, image, density, manifest)
      preparedEntries += 1
      if (preparedEntries === 1 || preparedEntries === entryCount || preparedEntries % 50 === 0) {
        bootMark('sprites:entry', { index: preparedEntries, entries: entryCount })
      }
      onProgress?.(preparedEntries, entryCount)
      if (!deferUnits || activeRegistry !== registry) reportBootSprites(preparedEntries, entryCount)
      const paintDue = preparedEntries === 1 ||
        (typeof performance !== 'undefined' && performance.now() - lastPaintYield >= 80)
      if (paintDue) {
        lastPaintYield = typeof performance !== 'undefined' ? performance.now() : lastPaintYield
        await yieldBootPaint()
      }
      registry.register(
        getPreparedSpriteCacheKey(manifest.assetVersion, density, entry.id),
        sprite,
        { decodedBytes: targetWidth * targetHeight * 4, dispose: disposePreparedImage }
      )
    }
    const entriesById = new Map(manifest.entries.map(entry => [entry.id, entry]))
    const safePrepareEntry = async entry => {
      try {
        await prepareEntry(entry)
      } catch (error) {
        if (signal?.aborted) throw error
        console.warn(`Prepared sprite failed; using fallback: ${entry.id}`, error)
      }
    }
    const deferred = []
    const critical = []
    for (const entry of manifest.entries) {
      if (deferUnits && entry.category !== 'building' && !initialUnitTypes.includes(entry.id.split(':')[1])) {
        deferred.push(entry)
      } else {
        critical.push(entry)
      }
    }
    let nextEntry = 0
    const prepareCritical = async() => {
      while (nextEntry < critical.length) {
        const entry = critical[nextEntry++]
        await safePrepareEntry(entry)
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, critical.length) }, prepareCritical))
    const queue = createIdleAssetQueue(async id => {
      if (registry.disposed) return null
      const entry = entriesById.get(id)
      if (!entry) return null
      try {
        await safePrepareEntry(entry)
        if (activeRegistry === registry) {
          const sprite = registry.get(getPreparedSpriteCacheKey(manifest.assetVersion, density, id))
          if (sprite) activeLookup.set(id, sprite)
        }
      } catch (error) {
        console.warn(`Deferred sprite unavailable: ${id}`, error)
      }
    })
    throwIfAborted(signal)
    bootMark('sprites:end', { entries: entryCount })
    return {
      registry, manifest, density, decodedBytes: registry.decodedBytes,
      request: id => entriesById.has(id) ? queue.request(id, true) : null,
      preloadRemaining: (priorityTypes = []) => {
        deferred.sort((a, b) => Number(priorityTypes.includes(b.id.split(':')[1])) - Number(priorityTypes.includes(a.id.split(':')[1])))
        return Promise.all(deferred.map(entry => queue.request(entry.id)))
      }
    }
  } catch (error) {
    registry.dispose()
    for (const image of stagedDisposables) {
      if (typeof image.close === 'function') {
        try { image.close() } catch { /* already closed by registry disposal */ }
      }
    }
    throw error
  }
}

export function publishPreparedSpriteRegistry(prepared) {
  if (!prepared?.registry || prepared.registry.disposed) throw new TypeError('A live prepared registry is required')
  if (!prepared.manifest?.assetVersion) throw new TypeError('Prepared sprite manifest is required')
  const previous = activeRegistry
  const lookup = new Map()
  const buildingLayers = new Map()
  for (const entry of prepared.manifest.entries) {
    const sprite = prepared.registry.get(
      getPreparedSpriteCacheKey(prepared.manifest.assetVersion, prepared.density, entry.id)
    )
    if (!sprite) continue
    lookup.set(entry.id, sprite)
    if (entry.id.startsWith('building:')) {
      const separator = entry.id.lastIndexOf(':')
      const type = entry.id.slice('building:'.length, separator)
      const layer = entry.id.slice(separator + 1)
      let layers = buildingLayers.get(type)
      if (!layers) {
        layers = Object.create(null)
        buildingLayers.set(type, layers)
      }
      layers[layer] = sprite
    }
  }
  activePrepared = prepared
  activeRegistry = prepared.registry
  activeManifest = prepared.manifest
  activeDensity = prepared.density
  activeLookup = lookup
  activeBuildingLayers = buildingLayers
  if (backgroundPriorities !== null) prepared.preloadRemaining?.(backgroundPriorities)
  if (previous && previous !== activeRegistry) previous.dispose()
  return activeRegistry
}

export function disposePreparedSpriteRegistry() {
  backgroundPriorities = null
  activePrepared = null
  activeRegistry?.dispose()
  activeRegistry = null
  activeManifest = null
  activeDensity = 0
  activeLookup = null
  activeBuildingLayers = null
}


export function preloadRemainingPreparedSprites(priorityTypes = []) {
  backgroundPriorities = priorityTypes
  return activePrepared?.preloadRemaining?.(priorityTypes)
}

export function getPreparedSprite(id) {
  if (!activeRegistry || !activeManifest || !activeLookup) return null
  const sprite = activeLookup.get(id)
  if (!sprite) {
    activePrepared?.request?.(id)
    return null
  }
  return sprite
}

export function getPreparedBuildingLayer(buildingType, layer = 'base') {
  if (!activeBuildingLayers) return null
  const sprite = activeBuildingLayers.get(buildingType)?.[layer]
  if (!sprite) return null
  return sprite
}

export function getPreparedSpriteState() {
  return Object.freeze({
    ready: Boolean(activeRegistry && activeManifest),
    assetVersion: activeManifest?.assetVersion || null,
    density: activeDensity || null,
    decodedBytes: activeRegistry?.decodedBytes || 0
  })
}

export function setAircraftResizeAuditSink(sink) {
  if (sink !== null && typeof sink !== 'function') throw new TypeError('Audit sink must be a function or null')
  aircraftResizeAuditSink = sink
}

export function classifyPreparedSpriteTransform(transform, sprite) {
  const horizontal = Math.hypot(transform?.a || 0, transform?.b || 0)
  const vertical = Math.hypot(transform?.c || 0, transform?.d || 0)
  return {
    native: Boolean(sprite?.audit?.prepared) &&
      Math.abs(horizontal - 1) < 0.001 &&
      Math.abs(vertical - 1) < 0.001,
    horizontalScale: horizontal,
    verticalScale: vertical
  }
}

function recordAircraftResize(sprite, scale, auditTag) {
  if (!aircraftResizeAuditSink || scale === 1) return
  if (!AUTHORIZED_AIRCRAFT_RESIZE_TAGS.has(auditTag)) {
    throw new Error(`Unauthorized prepared aircraft resize: ${auditTag || 'untagged'}`)
  }
  aircraftResizeAuditSink({ id: sprite.id, scale, tag: auditTag })
}

export function drawPreparedSpriteCentered(ctx, sprite, centerX, centerY, scale = 1, auditTag = null) {
  if (!sprite) return false
  recordAircraftResize(sprite, scale, auditTag)
  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.scale(
    sprite.logicalWidth * scale / sprite.backingWidth,
    sprite.logicalHeight * scale / sprite.backingHeight
  )
  ctx.drawImage(sprite.image, -sprite.backingWidth / 2, -sprite.backingHeight / 2)
  ctx.restore()
  return true
}

export function drawPreparedSpriteTopLeft(ctx, sprite, x, y) {
  if (!sprite) return false
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(
    sprite.logicalWidth / sprite.backingWidth,
    sprite.logicalHeight / sprite.backingHeight
  )
  ctx.drawImage(sprite.image, 0, 0)
  ctx.restore()
  return true
}
