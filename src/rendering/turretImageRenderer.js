// turretImageRenderer.js
// Renders turret buildings using separate base and top image assets

import turretImageConfig from '../turretImageConfig.json' with { type: 'json' }
import { MUZZLE_FLASH_DURATION } from '../config.js'
import { gameState } from '../gameState.js'
import { getSimulationTime } from '../game/time.js'

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
export function preloadTurretImages(callback) {
  if (turretImagesPreloaded) {
    if (callback) callback()
    return
  }

  const turretTypes = Object.keys(turretImageConfig)
  let loadedCount = 0
  let errorCount = 0
  const totalImages = turretTypes.length * 2 // base and top for each turret

  function onImageComplete() {
    loadedCount++
    if (loadedCount + errorCount >= totalImages) {
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

    // Load base image
    const baseImg = new Image()
    baseImg.onload = onImageComplete
    baseImg.onerror = () => onImageError(`images/map/buildings/${config.base}`)
    baseImg.src = `images/map/buildings/${config.base}`
    turretImageCache[turretType].base = baseImg

    // Load top image
    const topImg = new Image()
    topImg.onload = onImageComplete
    topImg.onerror = () => onImageError(`images/map/buildings/${config.top}`)
    topImg.src = `images/map/buildings/${config.top}`
    turretImageCache[turretType].top = topImg
  })

  // Handle case where no turret types are configured
  if (totalImages === 0) {
    turretImagesPreloaded = true
    if (callback) callback(true)
  }
}

/**
 * Check if turret images are available for a specific building type
 * @param {string} buildingType - The building type to check
 * @returns {boolean} True if turret images are available and loaded
 */
export function turretImagesAvailable(buildingType) {
  return turretImagesPreloaded &&
         turretImageCache[buildingType] &&
         turretImageCache[buildingType].base &&
         turretImageCache[buildingType].top &&
         turretImageCache[buildingType].base.complete &&
         turretImageCache[buildingType].top.complete
}

/**
 * Render a turret building using separate base and top image assets
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} building - Building object
 * @param {number} screenX - Screen X position
 * @param {number} screenY - Screen Y position
 * @param {number} width - Building width in pixels
 * @param {number} height - Building height in pixels
 * @returns {boolean} True if rendered with images, false to use fallback
 */
export function renderTurretWithImages(ctx, building, screenX, screenY, width, height) {
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
  const baseImg = images.base
  const baseScale = Math.min(width / baseImg.width, height / baseImg.height)
  const baseWidth = baseImg.width * baseScale
  const baseHeight = baseImg.height * baseScale

  ctx.drawImage(
    baseImg,
    centerX - baseWidth / 2,
    centerY - baseHeight / 2,
    baseWidth,
    baseHeight
  )

  // 2. Render the rotating top
  ctx.save()
  ctx.translate(centerX, centerY)

  // Rotate based on turret direction
  // Building turret direction needs +π/2 adjustment for correct image orientation
  const rotationOffset = config.rotationOffset !== undefined ? config.rotationOffset : Math.PI / 2
  const turretRotation = (building.turretDirection || 0) + rotationOffset
  ctx.rotate(turretRotation)

  const topImg = images.top
  const topScale = baseScale // Use same scale as base to maintain proportions
  const topWidth = topImg.width * topScale
  const topHeight = topImg.height * topScale

  ctx.drawImage(
    topImg,
    -topWidth / 2,
    -topHeight / 2,
    topWidth,
    topHeight
  )

  // 3. Render muzzle flash if active
  if (building.muzzleFlashStartTime && now - building.muzzleFlashStartTime <= MUZZLE_FLASH_DURATION) {
    const flashProgress = (now - building.muzzleFlashStartTime) / MUZZLE_FLASH_DURATION
    const flashAlpha = 1 - flashProgress
    const flashSize = 20 * (1 - flashProgress * 0.5) // Start at 20px, shrink 50%

    ctx.save()
    ctx.globalAlpha = flashAlpha

    // Support single or multiple muzzle flash offsets
    const offsets = config.muzzleFlashOffsets || (config.muzzleFlashOffset ? [config.muzzleFlashOffset] : [])
    const index = building.muzzleFlashIndex || 0
    const offset = offsets[index] || offsets[0]

    // Position flash at the configured offset from top-left of turret top image
    // Convert from image coordinates to centered coordinates
    const flashX = (offset.x - topImg.width / 2) * topScale
    const flashY = (offset.y - topImg.height / 2) * topScale

    // Create radial gradient for muzzle flash
    const gradient = ctx.createRadialGradient(flashX, flashY, 0, flashX, flashY, flashSize)
    gradient.addColorStop(0, '#FFF')
    gradient.addColorStop(0.3, '#FF0')
    gradient.addColorStop(1, 'rgba(255, 165, 0, 0)')

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(flashX, flashY, flashSize, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
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
      return count + (cache.base ? 1 : 0) + (cache.top ? 1 : 0)
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
