import { TILE_SIZE } from '../../config.js'
import { RenderByteBudget, RENDER_BYTE_OWNERS } from './renderByteBudget.js'
import { TerrainPreparationPipeline } from './terrainPreparation.js'
import {
  getPreparedSpriteState,
  prepareSpriteRegistry,
  publishPreparedSpriteRegistry
} from './preparedSpritePipeline.js'
import { getMapMutationRevisionStore } from './mapMutationNotifier.js'

const PIPELINE_BYTE_LIMIT = 512 * 1024 * 1024

let terrainPipeline = null
let spriteAssetGeneration = 0
let mapGeneration = 0
let densityListenerBound = false
let lastPreparedDensity = 0
let lastPreparedMapKey = ''

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
  document.addEventListener('canvas-density-changed', event => {
    const density = Number(event.detail?.density)
    if (!Number.isFinite(density) || density <= 0) return
    prepareRuntimeSprites({ density }).catch(error => {
      if (typeof window !== 'undefined') window.logger?.warn?.('Prepared sprite density swap failed', error)
    })
  })
}

export async function prepareRuntimeSprites({
  density = (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
  signal
} = {}) {
  bindRenderingDensityPreparation()
  const state = getPreparedSpriteState()
  if (state.ready && Math.abs((state.density || 0) - density) < 0.0001) return state
  const prepared = await prepareSpriteRegistry({
    density,
    assetGeneration: ++spriteAssetGeneration,
    signal
  })
  publishPreparedSpriteRegistry(prepared)
  lastPreparedDensity = density
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
  return prepared
}

export function attachRendererToMutationStore(mapRenderer, mapGrid) {
  const store = getMapMutationRevisionStore()
  if (store && mapRenderer?.terrainRevisions) {
    mapRenderer.terrainRevisions.attachStore(store, mapGrid)
  }
  return store
}

export function resetRenderingPipelineForTests() {
  terrainPipeline?.dispose()
  terrainPipeline = null
  spriteAssetGeneration = 0
  mapGeneration = 0
  lastPreparedDensity = 0
  lastPreparedMapKey = ''
  densityListenerBound = false
}
