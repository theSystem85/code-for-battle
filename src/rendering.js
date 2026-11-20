// rendering.js - Refactored to use modular components
import { Renderer } from './rendering/renderer.js'
import { TILE_SIZE } from './config.js'
import { getCanvasLogicalSize, getCanvasPixelRatio } from './rendering/renderingUtils.js'
import { staticTerrainPageBytes } from './rendering/prepared/staticTerrainPages.js'
import { RENDER_REVISION_DOMAINS } from './rendering/prepared/renderRevisionStore.js'
import { addMapReplacedListener } from './rendering/prepared/mapMutationNotifier.js'
import { getLoadingScreenState, updateLoadingScreen, waitForLoadingPaint } from './ui/loadingScreen.js'
import {
  bindRenderingDensityPreparation,
  prepareRuntimeMap,
  prepareRuntimeSprites
} from './rendering/prepared/renderingPipeline.js'

export { RENDER_REVISION_DOMAINS }

// Create a single renderer instance
const gameRenderer = new Renderer()
const MAX_SATELLITE_EDGE = 1024
let satelliteMapGeneration = 0
let renderRecoveryPending = false
addMapReplacedListener(() => {
  satelliteMapGeneration++
  gameRenderer.minimapRenderer.satelliteImage = null
})
if (typeof document !== 'undefined') {
  document.addEventListener('canvas-density-changed', () => {
    const grid = gameRenderer.mapRenderer.terrainRevisions.mapGrid
    if (grid?.length) void publishPreparedRuntimeMap(grid)
  })
  document.addEventListener('water-graphics-preparation', () => {
    const mapGrid = gameRenderer.mapRenderer.cpuWaterPass.mapGrid
    if (mapGrid?.length) gameRenderer.prepareWaterResources(mapGrid)
  })
}
// Export main rendering functions for compatibility with existing code
export function renderGame(gameCtx, gameCanvas, mapGrid, factories, units, bullets, buildings, scrollOffset, selectionActive, selectionStart, selectionEnd, gameState, gpuContext = null, gpuCanvas = null, webgpuCanvas = null) {
  // One check per frame, independent of entity count and DPR. Lost contexts
  // cannot present; wait for restoration without stopping simulation/input.
  if (gameCtx?.isContextLost?.()) return
  try {
    const result = gameRenderer.renderGame(gameCtx, gameCanvas, mapGrid, factories, units, bullets, buildings, scrollOffset, selectionActive, selectionStart, selectionEnd, gameState, gpuContext, gpuCanvas, webgpuCanvas)
    renderRecoveryPending = false
    return result
  } catch (error) {
    // drawImage can reject a source whose backing store was lost during loading.
    // Reset also removes any unbalanced save/clip left by the interrupted draw.
    // Programming errors must still surface instead of being silently retried.
    if (error?.name !== 'InvalidStateError' || !gameCtx || !gameCanvas) throw error
    const ratio = getCanvasPixelRatio(gameCanvas)
    const backingWidth = gameCanvas.width
    gameCanvas.width = backingWidth
    gameCtx.setTransform(ratio, 0, 0, ratio, 0, 0)
    gameCtx.imageSmoothingEnabled = true
    gameCtx.imageSmoothingQuality = 'high'
    if (!renderRecoveryPending) globalThis.window?.logger?.warn?.('Rendering interrupted by an unavailable image; retrying next frame', error)
    renderRecoveryPending = true
    return
  }
}

export function renderMinimap(minimapCtx, minimapCanvas, mapGrid, scrollOffset, gameCanvas, units, buildings, gameState) {
  return gameRenderer.renderMinimap(minimapCtx, minimapCanvas, mapGrid, scrollOffset, gameCanvas, units, buildings, gameState)
}

export function setSatelliteMinimapEnabled(enabled) {
  gameRenderer.minimapRenderer.satelliteEnabled = enabled
}

export async function prepareSatelliteMinimap(mapGrid) {
  const minimap = document.getElementById('minimap')
  const renderer = gameRenderer.minimapRenderer
  if (!minimap || !mapGrid[0]?.length || renderer.satelliteImage?.grid === mapGrid) return

  const generation = satelliteMapGeneration
  const loading = getLoadingScreenState()
  if (loading.visible) {
    updateLoadingScreen({
      phase: 'satellite',
      detail: 'Rendering satellite minimap',
      progress: loading.progress == null ? null : 0.99
    }, loading.session)
    await waitForLoadingPaint()
  }
  if (generation !== satelliteMapGeneration || renderer.satelliteImage?.grid === mapGrid) return

  // Rasterize at minimap scale. A full-size world canvas would grow with map
  // area and consume far more memory than the cached image can display.
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.min(minimap.width, MAX_SATELLITE_EDGE))
  canvas.height = Math.max(1, Math.min(minimap.height, MAX_SATELLITE_EDGE))
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  try {
    gameRenderer.mapRenderer.renderSatelliteTerrain(ctx, mapGrid)
    renderer.satelliteImage = { grid: mapGrid, canvas }
  } catch (error) {
    globalThis.window?.logger?.warn?.('Failed to render satellite minimap', error)
  }
}

// Export the preload function so it can be called from main.js
export function preloadTileTextures(callback, onProgress) {
  gameRenderer.preloadTextures(callback, onProgress)
}

// Export the textureManager for accessing texture-related functions
export function getTextureManager() {
  return gameRenderer.textureManager
}

// Export the mapRenderer for SOT mask updates when tiles change
export function getMapRenderer() {
  return gameRenderer.mapRenderer
}

export function getGameRenderer() {
  return gameRenderer
}

/**
 * Notify the map renderer that a tile has changed and SOT mask needs update.
 * Call this when tile.type changes (e.g., land <-> street <-> water transitions).
 * @param {Array} mapGrid - The map grid
 * @param {number} tileX - X coordinate of the changed tile
 * @param {number} tileY - Y coordinate of the changed tile
 */
export function notifyTileMutation(mapGrid, tileX, tileY) {
  if (gameRenderer.mapRenderer) {
    gameRenderer.mapRenderer.updateSOTMaskForTile(mapGrid, tileX, tileY)
  }
}

/**
 * Notify terrain rendering about a mutation using the C00 revision-domain contract.
 * Mutation producers pass both footprints when a visual moves or changes dimensions.
 */
export function notifyTerrainMutation(mapGrid, domain, oldBounds, newBounds = oldBounds) {
  gameRenderer.mapRenderer?.notifyTerrainMutation(mapGrid, domain, oldBounds, newBounds)
}

/**
 * Force recomputation of the entire SOT mask.
 * Call this when loading a new map or after bulk tile changes.
 * @param {Array} mapGrid - The map grid
 */
export function recomputeSOTMask(mapGrid) {
  if (gameRenderer.mapRenderer) {
    gameRenderer.mapRenderer.computeSOTMask(mapGrid)
  }
}

export function publishPreparedRuntimeMap(mapGrid) {
  const mapRenderer = gameRenderer.mapRenderer
  mapRenderer?.attachMutationStore?.(mapGrid)
  bindRenderingDensityPreparation()
  if (!mapGrid?.length) return Promise.resolve(null)
  if (gameRenderer.textureManager.integratedSpriteSheetMode) gameRenderer.textureManager.prepareDecorationLayout(mapGrid)
  if (mapRenderer && !mapRenderer.sotMask) mapRenderer.computeSOTMask(mapGrid)
  const canvas = typeof document !== 'undefined' ? document.getElementById('gameCanvas') : null
  const density = canvas ? getCanvasLogicalSize(canvas).pixelRatio || 1 : 1
  return Promise.all([
    gameRenderer.textureManager.preloadAllTextures(),
    mapRenderer.organicTerrain.readiness
  ]).then(() => prepareRuntimeMap({
    grid: mapGrid, sotMask: mapRenderer?.sotMask, density,
    runtimePageFactory: async({ budget, signal }) => {
      await mapRenderer.organicTerrain.prepareRasterCaches(TILE_SIZE, undefined, budget)
      signal?.throwIfAborted()
      const nativeBytes = staticTerrainPageBytes(mapGrid[0].length, mapGrid.length, { density })
      const gpuWorldRaster = nativeBytes > mapRenderer.staticTerrainPageLimit && await gameRenderer.prepareTerrainGpuBackend()
      const pages = await mapRenderer.prepareStaticTerrain(mapGrid, { budget, density: gpuWorldRaster ? 1 : density, signal,
        bitmapOptions: gpuWorldRaster ? { premultiplyAlpha: 'none' } : undefined })
      if (pages && gpuWorldRaster) {
        try {
          await gameRenderer.prepareTerrainGpuPages(pages, budget)
        } catch (error) {
          pages.gpuRasterPass?.close()
          pages.gpuRasterPass = null
          window.logger?.warn?.('Terrain GPU upload failed; using CPU pages', error)
        }
      }
      return pages
    }
  })).then(async prepared => {
    mapRenderer.publishStaticTerrain(prepared?.resources?.runtimeStaticPages || null)
    gameRenderer.prepareWaterResources(mapGrid)
    await gameRenderer.prepareTerrainGpuStandby(prepared?.resources?.runtimeStaticPages)
    return prepared
  }).catch(error => {
    if (typeof window !== 'undefined') window.logger?.warn?.('Prepared map generation failed', error)
    return null
  })
}

export { prepareRuntimeSprites }
