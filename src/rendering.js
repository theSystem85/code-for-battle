// rendering.js - Refactored to use modular components
import { Renderer } from './rendering/renderer.js'

// Create a single renderer instance
const gameRenderer = new Renderer()
// Export main rendering functions for compatibility with existing code
export function renderGame(gameCtx, gameCanvas, mapGrid, factories, units, bullets, buildings, scrollOffset, selectionActive, selectionStart, selectionEnd, gameState, gpuContext = null, gpuCanvas = null, webgpuCanvas = null) {
  return gameRenderer.renderGame(gameCtx, gameCanvas, mapGrid, factories, units, bullets, buildings, scrollOffset, selectionActive, selectionStart, selectionEnd, gameState, gpuContext, gpuCanvas, webgpuCanvas)
}

export function renderMinimap(minimapCtx, minimapCanvas, mapGrid, scrollOffset, gameCanvas, units, buildings, gameState) {
  return gameRenderer.renderMinimap(minimapCtx, minimapCanvas, mapGrid, scrollOffset, gameCanvas, units, buildings, gameState)
}

// Export the preload function so it can be called from main.js
export function preloadTileTextures(callback) {
  gameRenderer.preloadTextures(callback)
}

// Export the textureManager for accessing texture-related functions
export function getTextureManager() {
  return gameRenderer.textureManager
}

// Export the mapRenderer for SOT mask updates when tiles change
export function getMapRenderer() {
  return gameRenderer.mapRenderer
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
 * Force recomputation of the entire SOT mask.
 * Call this when loading a new map or after bulk tile changes.
 * @param {Array} mapGrid - The map grid
 */
export function recomputeSOTMask(mapGrid) {
  if (gameRenderer.mapRenderer) {
    gameRenderer.mapRenderer.computeSOTMask(mapGrid)
  }
}
