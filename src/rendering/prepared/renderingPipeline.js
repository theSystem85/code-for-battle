import { APP_VERSION } from '../../version.js'
import { gameState } from '../../gameState.js'
import { prepareFactoryExitSprites } from '../factoryExitRenderer.js'
import { TILE_SIZE } from '../../config.js'
import { bootMark } from '../../ui/bootTiming.js'
import { reportBootSprites } from '../../ui/bootProgress.js'
import { RenderByteBudget, RENDER_BYTE_OWNERS } from './renderByteBudget.js'
import { TerrainPreparationPipeline } from './terrainPreparation.js'
import {
  PREPARED_SPRITE_MANIFEST_URL,
  getPreparedSpriteState,
  prepareSpriteRegistry,
  publishPreparedSpriteRegistry,
  restoreActiveRegistryGenerations
} from './preparedSpritePipeline.js'
import { disposeSpriteResourceLifecycle } from './spriteResourceLifecycle.js'
import { getMapMutationRevisionStore } from './mapMutationNotifier.js'
import { startTankRotationCache } from '../tankImageRenderer.js'
import { resetTankRotationCache } from '../tankRotationCache.js'

const PIPELINE_BYTE_LIMIT = 512 * 1024 * 1024

let terrainPipeline = null
let spriteAssetGeneration = 0
let mapGeneration = 0
let densityListenerBound = false
let lastPreparedDensity = 0
let lastPreparedMapKey = ''
let inflightSprites = null

function createPipelineBudget() {
  return new RenderByteBudget(Object.fromEntries(RENDER_BYTE_OWNERS.map(owner => [owner, PIPELINE_BYTE_LIMIT])))
}

export function getTerrainPreparationPipeline() {
  if (!terrainPipeline) {
    terrainPipeline = new TerrainPreparationPipeline({ byteBudget: createPipelineBudget() })
  }
  return terrainPipeline
}

export function bindRenderingDensityPreparation() {
  if (densityListenerBound || typeof document === 'undefined') return
  densityListenerBound = true
  const watchResolution = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    query.addEventListener('change', () => {
      document.dispatchEvent(new CustomEvent('canvas-density-changed', {
        detail: { rawPixelRatio: window.devicePixelRatio }
      }))
      watchResolution()
    }, { once: true })
  }
  watchResolution()
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    // A page entering the back/forward cache keeps its lifecycle; a real unload
    // releases every sprite resource through the shared store.
    window.addEventListener('pagehide', event => {
      if (!event?.persisted) disposePreparedRenderingLifecycle()
    })
  }
  document.addEventListener('canvas-density-changed', event => {
    const density = resolveSpriteDensityFromEvent(event.detail)
    if (!Number.isFinite(density) || density <= 0) return
    prepareRuntimeSprites({ density }).then(prepared => {
      if (prepared?.registry) {
        document.dispatchEvent(new CustomEvent('prepared-sprites-published', {
          detail: { registry: prepared.registry, density: prepared.density }
        }))
      }
    }).catch(error => {
      if (typeof window !== 'undefined') window.logger?.warn?.('Prepared sprite density swap failed', error)
    })
  })
}

/**
 * Units and buildings are drawn on the overlay canvas at its own (native) DPR, so prepared
 * sprites follow overlayPixelRatio. The event never carried a `density` field; reading it
 * meant DPR changes (zoom, moving the window to another display) never swapped variants.
 */
export function resolveSpriteDensityFromEvent(detail) {
  const candidates = [detail?.overlayPixelRatio, detail?.rawPixelRatio, detail?.pixelRatio, detail?.density]
  for (const candidate of candidates) {
    const value = Number(candidate)
    if (Number.isFinite(value) && value > 0) return value
  }
  return NaN
}

export async function prepareRuntimeSprites({
  density = (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
  signal,
  onProgress
} = {}) {
  density = Math.min(3, Math.max(1, Math.ceil(density)))
  bindRenderingDensityPreparation()
  const state = getPreparedSpriteState()
  if (state.ready && Math.abs((state.density || 0) - density) < 0.0001) {
    onProgress?.(1, 1)
    reportBootSprites(1, 1)
    return state
  }
  // The initial canvas density event and the boot preparation can ask for the same density
  // at the same time; share one preparation instead of fetching every variant twice.
  if (inflightSprites && Math.abs(inflightSprites.density - density) < 0.0001) {
    return inflightSprites.promise
  }
  const promise = prepareAndPublishSprites({ density, signal, onProgress })
  inflightSprites = { density, promise }
  try {
    return await promise
  } finally {
    if (inflightSprites?.promise === promise) inflightSprites = null
  }
}

async function prepareAndPublishSprites({ density, signal, onProgress }) {
  const generation = ++spriteAssetGeneration
  const prepared = await prepareSpriteRegistry({
    density,
    assetGeneration: generation,
    manifestUrl: `${PREPARED_SPRITE_MANIFEST_URL}?v=${APP_VERSION}`,
    signal,
    onProgress,
    deferUnits: true,
    initialUnitTypes: (gameState.units || []).map(unit => unit.type)
  })
  if (generation !== spriteAssetGeneration) {
    prepared.registry.dispose()
    restoreActiveRegistryGenerations()
    return getPreparedSpriteState()
  }
  prepareFactoryExitSprites(prepared.registry, prepared.manifest.assetVersion)
  lastPreparedDensity = density
  // Rotated tank frames are built from the freshly published density variant in idle time.
  resetTankRotationCache()
  const preloadRemaining = prepared.preloadRemaining
  let rotationScheduled = false
  prepared.preloadRemaining = priorityTypes => preloadRemaining(priorityTypes).then(() => {
    if (!rotationScheduled && !prepared.registry.disposed) {
      rotationScheduled = true
      startTankRotationCache()
    }
  })
  publishPreparedSpriteRegistry(prepared)
  return prepared
}

export async function prepareRuntimeMap({
  grid,
  sotMask = null,
  density = lastPreparedDensity || (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
  signal
} = {}) {
  if (!Array.isArray(grid) || !grid.length) return null
  const key = `${grid.length}x${grid[0]?.length || 0}:${density}:${mapGeneration + 1}`
  if (key === lastPreparedMapKey && getTerrainPreparationPipeline().current?.state === 'ready') {
    return getTerrainPreparationPipeline().current
  }
  bootMark('terrain-prepare:start', { rows: grid.length, cols: grid[0]?.length || 0 })
  const prepared = await getTerrainPreparationPipeline().prepare({
    grid,
    sotMask,
    generation: ++mapGeneration,
    assetGeneration: spriteAssetGeneration,
    density,
    tileSize: TILE_SIZE,
    signal
  })
  lastPreparedMapKey = key
  bootMark('terrain-prepare:end', { rows: grid.length, cols: grid[0]?.length || 0 })
  return prepared
}

export function attachRendererToMutationStore(mapRenderer, mapGrid) {
  const store = getMapMutationRevisionStore()
  if (store && mapRenderer?.terrainRevisions) {
    mapRenderer.terrainRevisions.attachStore(store, mapGrid)
  }
  return store
}

/** Ends the prepared-rendering lifecycle: every participant releases its
 * publications and resources, then the shared sprite resource store closes.
 * The next preparation starts a fresh lifecycle store. */
export function disposePreparedRenderingLifecycle() {
  spriteAssetGeneration++
  inflightSprites = null
  lastPreparedDensity = 0
  disposeSpriteResourceLifecycle()
}

export function resetRenderingPipelineForTests() {
  terrainPipeline?.dispose()
  terrainPipeline = null
  spriteAssetGeneration = 0
  mapGeneration = 0
  lastPreparedDensity = 0
  lastPreparedMapKey = ''
  densityListenerBound = false
  inflightSprites = null
  disposeSpriteResourceLifecycle()
  resetTankRotationCache()
}
