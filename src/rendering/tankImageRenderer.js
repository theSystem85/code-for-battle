// rendering/tankImageRenderer.js
// Image-based tank rendering system using 3 separate image assets
import { TILE_SIZE, RECOIL_DISTANCE, RECOIL_DURATION, MUZZLE_FLASH_DURATION, MUZZLE_FLASH_SIZE } from '../config.js'
import tankImageConfigData from '../tankImageConfig.json' with { type: 'json' }
import { gameState } from '../gameState.js'
import { getSimulationTime } from '../game/time.js'

// Tank image asset cache - organized by tank variant
const tankImageCache = {
  tankV1: {
    wagon: null,
    turret: null,
    barrel: null
  },
  tankV2: {
    wagon: null,
    turret: null,
    barrel: null
  },
  tankV3: {
    wagon: null,
    turret: null,
    barrel: null
  }
}

// Track loading state
let tankImagesLoaded = false
let tankImagesLoading = false

// Load tank image configuration
const tankImageConfig = tankImageConfigData.tankImageConfig

/**
 * Preload all tank image assets for all variants
 * @param {Function} callback - Called when all images are loaded
 */
export function preloadTankImages(callback) {
  if (tankImagesLoaded) {
    if (callback) callback(true)
    return
  }

  if (tankImagesLoading) {
    // Already loading, add callback to queue if needed
    return
  }

  tankImagesLoading = true
  let loadedCount = 0
  const totalImages = 9 // 3 variants × 3 images each

  const checkAllLoaded = () => {
    loadedCount++
    if (loadedCount === totalImages) {
      tankImagesLoaded = true
      tankImagesLoading = false
      if (callback) callback(true)
    }
  }

  const handleLoadError = (imageName) => {
    console.error(`Failed to load tank image: ${imageName}`)
    tankImagesLoading = false
    if (callback) callback(false)
  }

  // Load images for all tank variants
  const variants = ['tankV1', 'tankV2', 'tankV3']

  variants.forEach(variant => {
    // Load tank wagon
    const wagonImg = new Image()
    wagonImg.onload = checkAllLoaded
    wagonImg.onerror = () => handleLoadError(`${variant}_wagon.webp`)
    wagonImg.src = `images/map/units/${variant}_wagon.webp`
    tankImageCache[variant].wagon = wagonImg

    // Load turret (without barrel)
    const turretImg = new Image()
    turretImg.onload = checkAllLoaded
    turretImg.onerror = () => handleLoadError(`${variant}_turret.webp`)
    turretImg.src = `images/map/units/${variant}_turret.webp`
    tankImageCache[variant].turret = turretImg

    // Load gun barrel
    const barrelImg = new Image()
    barrelImg.onload = checkAllLoaded
    barrelImg.onerror = () => handleLoadError(`${variant}_barrel.webp`)
    barrelImg.src = `images/map/units/${variant}_barrel.webp`
    tankImageCache[variant].barrel = barrelImg
  })
}

/**
 * Check if tank images are available for rendering for a specific tank type
 * @param {string} tankType - Tank type (tank_v1, tank-v2, tank-v3)
 * @returns {boolean} True if all tank images are loaded for this type
 */
export function areTankImagesLoaded(tankType = 'tank_v1') {
  const variant = getTankVariant(tankType)
  return tankImagesLoaded &&
         tankImageCache[variant] &&
         tankImageCache[variant].wagon &&
         tankImageCache[variant].turret &&
         tankImageCache[variant].barrel
}

/**
 * Convert tank type to variant name
 * @param {string} tankType - Tank type (tank_v1, tank-v2, tank-v3, tank_v2, tank_v3)
 * @returns {string} Variant name (tankV1, tankV2, tankV3)
 */
function getTankVariant(tankType) {
  switch (tankType) {
    case 'tank_v1':
      return 'tankV1'
    case 'tank-v2':
    case 'tank_v2':
      return 'tankV2'
    case 'tank-v3':
    case 'tank_v3':
      return 'tankV3'
    default:
      return 'tankV1' // Default fallback
  }
}

export function getTankVariantForType(tankType) {
  return getTankVariant(tankType)
}

export function getTankImageAssets(tankType = 'tank_v1') {
  if (!areTankImagesLoaded(tankType)) {
    return null
  }
  const variant = getTankVariant(tankType)
  const assets = tankImageCache[variant]
  if (!assets || !assets.wagon || !assets.turret || !assets.barrel) {
    return null
  }
  return assets
}

/**
 * Render a tank using 3 separate image assets
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} unit - Tank unit object
 * @param {number} centerX - Center X position in screen coordinates
 * @param {number} centerY - Center Y position in screen coordinates
 */
export function renderTankWithImages(ctx, unit, centerX, centerY, options = {}) {
  const overrideImages = options.images || null
  if (!overrideImages && !areTankImagesLoaded(unit.type)) {
    return false // Images not ready, caller should fall back to original rendering
  }

  const now = getSimulationTime(gameState)
  const variant = getTankVariant(unit.type)
  const variantConfig = tankImageConfig[variant]

  const wagonImg = overrideImages?.wagon || (tankImageCache[variant] && tankImageCache[variant].wagon)
  const turretImg = overrideImages?.turret || (tankImageCache[variant] && tankImageCache[variant].turret)
  const barrelImg = overrideImages?.barrel || (tankImageCache[variant] && tankImageCache[variant].barrel)

  if (!wagonImg || !turretImg || !barrelImg) {
    return false
  }

  // Save context state
  ctx.save()

  // Move to tank center
  ctx.translate(centerX, centerY)

  // 1. Render tank wagon (chassis)
  ctx.save()

  // The wagon image faces down by default, but unit.direction = 0 means facing right
  // So we need to subtract π/2 to align the image with the unit direction
  // unit.direction = 0 (right) → rotate by -π/2 to make down-facing image face right
  // unit.direction = π/2 (down) → rotate by 0 to keep down-facing image facing down
  // unit.direction = π (left) → rotate by π/2 to make down-facing image face left
  // unit.direction = 3π/2 (up) → rotate by π to make down-facing image face up
  const wagonRotation = unit.direction - Math.PI / 2
  ctx.rotate(wagonRotation)

  // Don't change aspect ratio - use original image dimensions scaled proportionally
  // Keep original size relationships - scale wagon to fit tile, others maintain relative size
  const wagonScale = TILE_SIZE / Math.max(wagonImg.width, wagonImg.height)
  const wagonWidth = wagonImg.width * wagonScale
  const wagonHeight = wagonImg.height * wagonScale

  ctx.drawImage(
    wagonImg,
    -wagonWidth / 2,
    -wagonHeight / 2,
    wagonWidth,
    wagonHeight
  )
  ctx.restore()

  // Skip turret/barrel for harvesters and rocket tanks
  if (unit.type === 'harvester' || unit.type === 'rocketTank') {
    ctx.restore()
    return true
  }

  // 2. Calculate recoil offset for turret/barrel
  let recoilOffset = 0
  if (!options.disableRecoil && unit.recoilStartTime && now - unit.recoilStartTime <= RECOIL_DURATION) {
    const progress = (now - unit.recoilStartTime) / RECOIL_DURATION
    const easedProgress = 1 - Math.pow(1 - progress, 3)
    recoilOffset = RECOIL_DISTANCE * (1 - easedProgress)
  }

  // 3. Determine turret rotation
  let turretRotation
  if (unit.turretDirection !== undefined) {
    // Use the tank's turret direction (whether targeting or following movement)
    turretRotation = unit.turretDirection - Math.PI / 2
  } else {
    // Fallback - turret follows wagon direction (should rarely happen)
    turretRotation = wagonRotation
  }

  // 4. Calculate turret position using configurable mount point
  // Convert mount point from image coordinates to world coordinates
  // The mount point is where the CENTER of the turret should be positioned
  const turretMountX = (variantConfig.turretMountPoint.x - wagonImg.width / 2) * wagonScale
  const turretMountY = (variantConfig.turretMountPoint.y - wagonImg.height / 2) * wagonScale

  // Rotate mount point by wagon rotation
  const rotatedMountX = turretMountX * Math.cos(wagonRotation) - turretMountY * Math.sin(wagonRotation)
  const rotatedMountY = turretMountX * Math.sin(wagonRotation) + turretMountY * Math.cos(wagonRotation)

  // 5. Render turret (without barrel)
  ctx.save()
  ctx.translate(rotatedMountX, rotatedMountY)
  ctx.rotate(turretRotation)

  // Don't change aspect ratio for turret - maintain original size relationship to wagon
  const turretScale = wagonScale // Use same scale as wagon to maintain original size relationships
  const turretWidth = turretImg.width * turretScale
  const turretHeight = turretImg.height * turretScale

  // Center the turret on the mount point (no recoil - recoil is applied to barrel only)
  ctx.drawImage(
    turretImg,
    -turretWidth / 2,
    -turretHeight / 2,
    turretWidth,
    turretHeight
  )

  // Position barrel using configurable mount point on turret
  // The mount point is relative to the turret image's top-left, but we need it relative to center
  const barrelMountX = (variantConfig.barrelMountPoint.x - turretImg.width / 2) * turretScale
  const barrelMountY = (variantConfig.barrelMountPoint.y - turretImg.height / 2) * turretScale

  // Apply recoil offset to barrel only - recoil goes backward along turret's X-axis
  // Add configurable rotation offset for debugging/tweaking
  const recoilOffsetRadians = (variantConfig.recoilRotationOffset.degrees * Math.PI) / 180
  const recoilLocalX = -recoilOffset * Math.cos(recoilOffsetRadians)
  const recoilLocalY = -recoilOffset * Math.sin(recoilOffsetRadians)

  // Don't change aspect ratio for barrel - barrel can extend beyond tile (this is OK)
  const barrelScale = wagonScale // Use same scale as wagon to maintain original size relationships
  const barrelWidth = barrelImg.width * barrelScale
  const barrelHeight = barrelImg.height * barrelScale

  // Center the barrel on its mount point with recoil offset in local coordinates
  ctx.drawImage(
    barrelImg,
    barrelMountX - barrelWidth / 2 + recoilLocalX,
    barrelMountY - barrelHeight / 2 + recoilLocalY,
    barrelWidth,
    barrelHeight
  )

  // 7. Render muzzle flash if active
  if (!options.disableMuzzleFlash && unit.muzzleFlashStartTime && now - unit.muzzleFlashStartTime <= MUZZLE_FLASH_DURATION) {
    const flashProgress = (now - unit.muzzleFlashStartTime) / MUZZLE_FLASH_DURATION
    const flashAlpha = 1 - flashProgress
    const flashSize = MUZZLE_FLASH_SIZE * (1 - flashProgress * 0.5)

    ctx.save()
    ctx.globalAlpha = flashAlpha

    // Position muzzle flash using configurable offset relative to barrel
    // The flash should also be affected by recoil (same local coordinate system)
    const flashX = barrelMountX + (variantConfig.muzzleFlashOffset.x - barrelImg.width / 2) * barrelScale + recoilLocalX
    const flashY = barrelMountY + (variantConfig.muzzleFlashOffset.y - barrelImg.height / 2) * barrelScale + recoilLocalY

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

  ctx.restore() // Restore turret transformation
  ctx.restore() // Restore main transformation

  return true // Successfully rendered with images
}

/**
 * Get tank image configuration for external access
 * @returns {Object} Tank image configuration object
 */
export function getTankImageConfig() {
  return tankImageConfig
}

/**
 * Get cache statistics for debugging
 * @returns {Object} Cache statistics
 */
export function getTankImageCacheStats() {
  return {
    loaded: tankImagesLoaded,
    loading: tankImagesLoading,
    images: {
      tankV1: {
        wagon: tankImageCache.tankV1.wagon !== null,
        turret: tankImageCache.tankV1.turret !== null,
        barrel: tankImageCache.tankV1.barrel !== null
      },
      tankV2: {
        wagon: tankImageCache.tankV2.wagon !== null,
        turret: tankImageCache.tankV2.turret !== null,
        barrel: tankImageCache.tankV2.barrel !== null
      },
      tankV3: {
        wagon: tankImageCache.tankV3.wagon !== null,
        turret: tankImageCache.tankV3.turret !== null,
        barrel: tankImageCache.tankV3.barrel !== null
      }
    }
  }
}

/**
 * Clear the tank image cache (for testing/memory management)
 */
export function clearTankImageCache() {
  tankImageCache.tankV1.wagon = null
  tankImageCache.tankV1.turret = null
  tankImageCache.tankV1.barrel = null
  tankImageCache.tankV2.wagon = null
  tankImageCache.tankV2.turret = null
  tankImageCache.tankV2.barrel = null
  tankImageCache.tankV3.wagon = null
  tankImageCache.tankV3.turret = null
  tankImageCache.tankV3.barrel = null
  tankImagesLoaded = false
  tankImagesLoading = false
}

/**
 * Console debugging functions for recoil offset adjustment
 * Use these in browser console to find the correct recoil direction
 */

/**
 * Set recoil rotation offset in degrees for a specific tank variant
 * @param {string} variant - Tank variant (tankV1, tankV2, tankV3)
 * @param {number} degrees - Offset in degrees (0-360)
 */
export function setRecoilOffset(variant, degrees) {
  if (tankImageConfig[variant]) {
    tankImageConfig[variant].recoilRotationOffset.degrees = degrees
    window.logger(`Recoil offset for ${variant} set to ${degrees} degrees`)
    window.logger('Fire your tank to see the recoil direction')
  } else {
    console.error(`Invalid tank variant: ${variant}. Use tankV1, tankV2, or tankV3`)
  }
}

/**
 * Get current recoil offset for a variant
 * @param {string} variant - Tank variant (tankV1, tankV2, tankV3)
 * @returns {number} Current offset in degrees
 */
export function getRecoilOffset(variant = 'tankV1') {
  if (tankImageConfig[variant]) {
    const offset = tankImageConfig[variant].recoilRotationOffset.degrees
    window.logger(`Current recoil offset for ${variant}: ${offset} degrees`)
    return offset
  } else {
    console.error(`Invalid tank variant: ${variant}. Use tankV1, tankV2, or tankV3`)
    return 0
  }
}

/**
 * Test different recoil offsets quickly for a variant
 * @param {string} variant - Tank variant (tankV1, tankV2, tankV3)
 * @param {number} startDegrees - Starting offset
 * @param {number} step - Step size in degrees
 */
export function testRecoilOffsets(variant = 'tankV1', startDegrees = 0, step = 45) {
  window.logger(`Testing recoil offsets for ${variant}:`)
  for (let i = 0; i < 8; i++) {
    const degrees = (startDegrees + i * step) % 360
    window.logger(`  ${i + 1}. setRecoilOffset('${variant}', ${degrees}) - ${degrees}°`)
  }
  window.logger('Copy and paste any command above to test that offset')
}

// Expose functions to window for easy console access
if (typeof window !== 'undefined') {
  window.tankRecoilDebug = {
    setOffset: setRecoilOffset,
    getOffset: getRecoilOffset,
    test: testRecoilOffsets
  }

  window.logger('🔫 Tank Recoil Debug Functions Available:')
  window.logger('  tankRecoilDebug.setOffset(variant, degrees) - Set recoil offset for variant')
  window.logger('  tankRecoilDebug.getOffset(variant) - Get current offset for variant')
  window.logger('  tankRecoilDebug.test(variant) - Show test values for variant')
  window.logger("Example: tankRecoilDebug.setOffset('tankV1', 180)")
}
