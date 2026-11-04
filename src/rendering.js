// rendering.js - Refactored to use modular components
import { Renderer } from './rendering/renderer.js'
import { TILE_SIZE } from './config.js'
import { getCanvasLogicalSize } from './rendering/renderingUtils.js'
import { STATIC_TERRAIN_PAGE_LIMIT, staticTerrainPageBytes } from './rendering/prepared/staticTerrainPages.js'
import { RENDER_REVISION_DOMAINS } from './rendering/prepared/renderRevisionStore.js'
import {
  bindRenderingDensityPreparation,
  prepareRuntimeMap,
  prepareRuntimeSprites
} from './rendering/prepared/renderingPipeline.js'

export { RENDER_REVISION_DOMAINS }

// Create a single renderer instance
const gameRenderer = new Renderer()
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
  return gameRenderer.renderGame(gameCtx, gameCanvas, mapGrid, factories, units, bullets, buildings, scrollOffset, selectionActive, selectionStart, selectionEnd, gameState, gpuContext, gpuCanvas, webgpuCanvas)
}

export function renderMinimap(minimapCtx, minimapCanvas, mapGrid, scrollOffset, gameCanvas, units, buildings, gameState) {
  return gameRenderer.renderMinimap(minimapCtx, minimapCanvas, mapGrid, scrollOffset, gameCanvas, units, buildings, gameState)
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
      const gpuWorldRaster = nativeBytes > STATIC_TERRAIN_PAGE_LIMIT && await gameRenderer.prepareTerrainGpuBackend()
      const pages = await mapRenderer.prepareStaticTerrain(mapGrid, { budget, density: gpuWorldRaster ? 1 : density, signal,
        bitmapOptions: gpuWorldRaster ? { premultiplyAlpha: 'none' } : undefined })
      if (pages && gpuWorldRaster) {
        try { await gameRenderer.prepareTerrainGpuPages(pages, budget) } catch (error) { pages.close(); throw error }
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
