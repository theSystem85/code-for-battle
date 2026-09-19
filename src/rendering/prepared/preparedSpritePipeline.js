import { PreparedSpriteRegistry } from './preparedSpriteRegistry.js'

export const PREPARED_SPRITE_MANIFEST_URL = '/images/prepared/sprite-manifest.json'
export const AIRCRAFT_RESIZE_AUDIT_TAGS = Object.freeze({
  TAKEOFF: 'authorized-aircraft-takeoff-resize',
  LANDING: 'authorized-aircraft-landing-resize'
})

const DEFAULT_BYTE_BUDGET = 256 * 1024 * 1024
const DENSITY_PRECISION = 1000
const AUTHORIZED_AIRCRAFT_RESIZE_TAGS = new Set(Object.values(AIRCRAFT_RESIZE_AUDIT_TAGS))
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

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason || createAbortError()
}

function createAbortError() {
  const error = new Error('Sprite preparation aborted')
  error.name = 'AbortError'
  return error
}

function loadImage(url, imageFactory, signal) {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal)
    const image = imageFactory()
    const cleanup = () => signal?.removeEventListener('abort', abort)
    const abort = () => {
      cleanup()
      image.src = ''
      reject(signal.reason || createAbortError())
    }
    image.onload = async() => {
      try {
        if (typeof image.decode === 'function') await image.decode()
        cleanup()
        resolve(image)
      } catch (error) {
        cleanup()
        reject(error)
      }
    }
    image.onerror = () => {
      cleanup()
      reject(new Error(`Failed to decode prepared sprite source: ${url}`))
    }
    signal?.addEventListener('abort', abort, { once: true })
    image.src = url
  })
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
  signal
} = {}) {
  assertDensity(density)
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required')
  throwIfAborted(signal)
  const response = await fetchImpl(manifestUrl, { signal })
  if (!response.ok) throw new Error(`Failed to load prepared sprite manifest: ${response.status}`)
  const manifest = await response.json()
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
  const getSource = url => {
    let promise = sourcePromises.get(url)
    if (!promise) {
      promise = loadImage(url, imageFactory, signal)
      sourcePromises.set(url, promise)
    }
    return promise
  }

  try {
    for (const entry of manifest.entries) {
      throwIfAborted(signal)
      const selection = chooseVariant(entry, density)
      const targetWidth = Math.max(1, Math.round(entry.logicalWidth * density))
      const targetHeight = Math.max(1, Math.round(entry.logicalHeight * density))
      const sourceUrl = selection.exact || selection.variant.sourceRect
        ? selection.variant.path
        : entry.source
      const source = await getSource(sourceUrl)
      let image = source
      if (
        selection.variant.sourceRect ||
        !selection.exact ||
        (source.naturalWidth || source.width) !== targetWidth ||
        (source.naturalHeight || source.height) !== targetHeight
      ) {
        image = await createSizedBitmap(
          source,
          selection.variant.sourceRect,
          targetWidth,
          targetHeight,
          createBitmap,
          canvasFactory
        )
        if (typeof image.close === 'function') {
          stagedDisposables.push(image)
        }
      }
      const sprite = createSpriteHandle(entry, image, density, manifest)
      registry.register(
        getPreparedSpriteCacheKey(manifest.assetVersion, density, entry.id),
        sprite,
        { decodedBytes: targetWidth * targetHeight * 4, dispose: disposePreparedImage }
      )
    }
    throwIfAborted(signal)
    return { registry, manifest, density, decodedBytes: registry.decodedBytes }
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
    if (!sprite) throw new Error(`Prepared sprite missing during publication: ${entry.id}`)
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
  activeRegistry = prepared.registry
  activeManifest = prepared.manifest
  activeDensity = prepared.density
  activeLookup = lookup
  activeBuildingLayers = buildingLayers
  if (previous && previous !== activeRegistry) previous.dispose()
  return activeRegistry
}

export function disposePreparedSpriteRegistry() {
  activeRegistry?.dispose()
  activeRegistry = null
  activeManifest = null
  activeDensity = 0
  activeLookup = null
  activeBuildingLayers = null
}

export function getPreparedSprite(id) {
  if (!activeRegistry || !activeManifest || !activeLookup) return null
  const sprite = activeLookup.get(id)
  if (!sprite) throw new Error(`Prepared sprite missing after readiness: ${id}`)
  return sprite
}

export function getPreparedBuildingLayer(buildingType, layer = 'base') {
  if (!activeBuildingLayers) return null
  const sprite = activeBuildingLayers.get(buildingType)?.[layer]
  if (!sprite) throw new Error(`Prepared building layer missing after readiness: ${buildingType}:${layer}`)
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
