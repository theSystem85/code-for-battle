import { loadPreparedImage } from './prepared/imagePreparation.js'
// turretImageRenderer.js
// Renders turret buildings using separate foundation, housing and barrel image assets

import turretImageConfig from '../turretImageConfig.json' with { type: 'json' }
import { TURRET_RECOIL_DISTANCE } from '../config.js'
import { getRecoilOffset, renderTurretMuzzleFlash } from './turretFiringEffects.js'
import { gameState } from '../gameState.js'
import { getSimulationTime } from '../game/time.js'
import {
  drawPreparedSpriteCentered,
  drawPreparedSpriteTopLeft,
  getPreparedBuildingLayer
} from './prepared/preparedSpritePipeline.js'

// Cache for loaded turret images
const turretImageCache = {}
let turretImagesPreloaded = false

/**
 * Get turret image configuration for a specific turret type
 * @param {string} turretType - The type of turret (e.g., 'turretGunV1')
 * @returns {Object} Configuration object with base, top, and muzzle flash offsets
 */
export function getTurretImageConfig(turretType) {
  return turretImageConfig[turretType] || null
}

/**
 * Preload all turret images
 * @param {Function} callback - Called when all images are loaded or on error
 */
export function preloadTurretImages(callback, onProgress) {
  const reportProgress = (fraction) => {
    if (typeof onProgress === 'function') onProgress(fraction)
  }

  if (turretImagesPreloaded) {
    reportProgress(1)
    if (callback) callback()
    return
  }

  const turretTypes = Object.keys(turretImageConfig)
  let loadedCount = 0
  let errorCount = 0
  const totalImages = turretTypes.length * 3 // base, housing and barrel for each turret

  function onImageComplete() {
    loadedCount++
    reportProgress(totalImages === 0 ? 1 : loadedCount / totalImages)
    if (loadedCount >= totalImages) {
      turretImagesPreloaded = true
      window.logger(`Turret images loaded: ${loadedCount}/${totalImages}`)
      if (callback) callback(errorCount === 0)
    }
  }

  function onImageError(imagePath) {
    errorCount++
    console.error(`Failed to load turret image: ${imagePath}`)
    onImageComplete()
  }

  // Load images for each turret type
  turretTypes.forEach(turretType => {
    const config = turretImageConfig[turretType]

    // Initialize cache for this turret type
    turretImageCache[turretType] = {}

    if (getPreparedBuildingLayer(turretType, 'base') && getPreparedBuildingLayer(turretType, 'top') && getPreparedBuildingLayer(turretType, 'barrel')) {
      onImageComplete()
      onImageComplete()
      onImageComplete()
      return
    }
    for (const layer of ['base', 'top', 'barrel']) {
      const path = `images/map/buildings/${config[layer]}`
      loadPreparedImage(path).then(image => {
        turretImageCache[turretType][layer] = image
        onImageComplete()
      }, () => onImageError(path))
    }
  })

  // Handle case where no turret types are configured
  if (totalImages === 0) {
    turretImagesPreloaded = true
    reportProgress(1)
    if (callback) callback(true)
  }
}

/**
 * Check if turret images are available for a specific building type
 * @param {string} buildingType - The building type to check
 * @returns {boolean} True if turret images are available and loaded
 */
export function turretImagesAvailable(buildingType) {
  if (getPreparedBuildingLayer(buildingType, 'base') &&
      getPreparedBuildingLayer(buildingType, 'top') &&
      getPreparedBuildingLayer(buildingType, 'barrel')) return true
  const images = turretImageCache[buildingType]
  return Boolean(turretImagesPreloaded && images?.base?.complete && images?.top?.complete && images?.barrel?.complete)
}

/**
 * Render a turret building using separate foundation, housing and barrel image assets
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} building - Building object
 * @param {number} screenX - Screen X position
 * @param {number} screenY - Screen Y position
 * @param {number} width - Building width in pixels
 * @param {number} height - Building height in pixels
 * @returns {boolean} True if rendered with images, false to use fallback
 */
export function renderTurretWithImages(ctx, building, screenX, screenY, width, height) {
  const preparedBase = getPreparedBuildingLayer(building.type, 'base')
  const preparedTop = getPreparedBuildingLayer(building.type, 'top')
  const preparedBarrel = getPreparedBuildingLayer(building.type, 'barrel')
  // Check if images are available for this building type
  if (!turretImagesAvailable(building.type)) {
    return false // Use fallback rendering
  }

  const config = getTurretImageConfig(building.type)
  const images = turretImageCache[building.type]
  const centerX = screenX + width / 2
  const centerY = screenY + height / 2
  const now = getSimulationTime(gameState)

  ctx.save()

  // 1. Render the static base
  const baseImg = images?.base
  const baseSourceWidth = preparedBase?.sourceWidth || baseImg.width
  const baseSourceHeight = preparedBase?.sourceHeight || baseImg.height
  const baseScale = preparedBase
    ? preparedBase.logicalWidth / baseSourceWidth
    : Math.min(width / baseSourceWidth, height / baseSourceHeight)
  if (preparedBase) {
    drawPreparedSpriteCentered(ctx, preparedBase, centerX, centerY)
  } else {
    const baseWidth = baseSourceWidth * baseScale
    const baseHeight = baseSourceHeight * baseScale
    ctx.drawImage(baseImg, centerX - baseWidth / 2, centerY - baseHeight / 2, baseWidth, baseHeight)
  }

  // 2. Render the rotating top
  ctx.save()
  ctx.translate(centerX, centerY)

  // Rotate based on turret direction
  // Source sprites face south; the config maps that direction to game-space aim.
  const rotationOffset = config.rotationOffset !== undefined ? config.rotationOffset : Math.PI / 2
  const turretRotation = (building.turretDirection || 0) + rotationOffset
  ctx.rotate(turretRotation)

  const topImg = images?.top
  const topScale = baseScale // Use same scale as base to maintain proportions
  const topSourceWidth = preparedTop?.sourceWidth || topImg.width
  const topSourceHeight = preparedTop?.sourceHeight || topImg.height
  const topWidth = preparedTop?.logicalWidth || topSourceWidth * topScale
  const topHeight = preparedTop?.logicalHeight || topSourceHeight * topScale

  if (preparedTop) {
    drawPreparedSpriteCentered(ctx, preparedTop, 0, 0)
  } else {
    ctx.drawImage(topImg, -topWidth / 2, -topHeight / 2, topWidth, topHeight)
  }

  // Only the fired barrel recoils; base and armored housing remain fixed.
  // Bounded at three barrels, with no per-frame state allocation or entity scans.
  const barrelImage = images?.barrel
  const barrelWidth = preparedBarrel?.logicalWidth || barrelImage.width * baseScale
  const barrelHeight = preparedBarrel?.logicalHeight || barrelImage.height * baseScale
  const coordinateScale = topWidth / config.coordinateSize
  const coordinateCenter = config.coordinateSize / 2
  for (let index = 0; index < config.barrelMounts.length; index++) {
    const mount = config.barrelMounts[index]
    const isLastBarrel = index === (building.muzzleFlashIndex || 0)
    const recoilTime = building.barrelShotTimes?.[index] ?? (isLastBarrel ? building.recoilStartTime : null)
    const flashTime = building.barrelShotTimes?.[index] ?? (isLastBarrel ? building.muzzleFlashStartTime : null)
    const recoil = getRecoilOffset(recoilTime, now, TURRET_RECOIL_DISTANCE)
    const x = (mount.x - coordinateCenter) * coordinateScale
    const y = (mount.y - coordinateCenter) * coordinateScale - recoil
    if (preparedBarrel) {
      drawPreparedSpriteTopLeft(ctx, preparedBarrel, x - barrelWidth / 2, y)
    } else {
      ctx.drawImage(barrelImage, x - barrelWidth / 2, y, barrelWidth, barrelHeight)
    }
    renderTurretMuzzleFlash(ctx, x, y + barrelHeight, flashTime, now)
  }

  ctx.restore() // Restore turret rotation
  ctx.restore() // Restore main context

  return true // Successfully rendered with images
}

/**
 * Get cache stats for debugging
 * @returns {Object} Cache statistics
 */
export function getTurretImageCacheStats() {
  return {
    preloaded: turretImagesPreloaded,
    types: Object.keys(turretImageCache),
    totalImages: Object.keys(turretImageCache).reduce((count, type) => {
      const cache = turretImageCache[type]
      return count + (cache.base ? 1 : 0) + (cache.top ? 1 : 0) + (cache.barrel ? 1 : 0)
    }, 0)
  }
}

/**
 * Clear the turret image cache (for testing/memory management)
 */
export function clearTurretImageCache() {
  Object.keys(turretImageCache).forEach(type => {
    delete turretImageCache[type]
  })
  turretImagesPreloaded = false
}
