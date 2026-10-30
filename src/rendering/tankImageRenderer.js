// rendering/tankImageRenderer.js
// Image-based tank rendering system using 3 separate image assets
import { TILE_SIZE, RECOIL_DISTANCE, RECOIL_DURATION, MUZZLE_FLASH_DURATION, MUZZLE_FLASH_SIZE } from '../config.js'
import tankImageConfigData from '../tankImageConfig.json' with { type: 'json' }
import { gameState } from '../gameState.js'
import { getSimulationTime } from '../game/time.js'
import { drawPreparedSpriteCentered, getPreparedSprite, getPreparedSpriteState } from './prepared/preparedSpritePipeline.js'
import {
  getTankRotationFrame,
  scheduleTankRotationCache,
  snapToDevicePixel
} from './tankRotationCache.js'

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
  },
  lightTank: {
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
const PREPARED_TANK_IDS = Object.freeze({
  tankV1: Object.freeze({
    wagon: 'unit:tankV1:wagon',
    turret: 'unit:tankV1:turret',
    barrel: 'unit:tankV1:barrel'
  }),
  tankV2: Object.freeze({
    wagon: 'unit:tankV2:wagon',
    turret: 'unit:tankV2:turret',
    barrel: 'unit:tankV2:barrel'
  }),
  tankV3: Object.freeze({
    wagon: 'unit:tankV3:wagon',
    turret: 'unit:tankV3:turret',
    barrel: 'unit:tankV3:barrel'
  }),
  lightTank: Object.freeze({
    wagon: 'unit:lightTank:wagon',
    turret: 'unit:lightTank:turret',
    barrel: 'unit:lightTank:barrel'
  })
})

const TANK_VARIANTS = Object.freeze(['tankV1', 'tankV2', 'tankV3', 'lightTank'])
const LIGHT_TANK_MUZZLE_FLASH_DURATION = 225
const LIGHT_TANK_MUZZLE_FLASH_SIZE_MULTIPLIER = 1.35

function getPreparedTankAssets(variant) {
  const ids = PREPARED_TANK_IDS[variant]
  if (!ids) return null
  const wagon = getPreparedSprite(ids.wagon)
  const turret = getPreparedSprite(ids.turret)
  const barrel = getPreparedSprite(ids.barrel)
  if (!wagon?.image || !turret?.image || !barrel?.image) return null
  return { wagon: wagon.image, turret: turret.image, barrel: barrel.image }
}

/**
 * Pre-render the rotation cache for all tank parts from the currently published prepared
 * sprites (device density). Runs in idle slices; live rotation is used until it is ready.
 */
export function startTankRotationCache() {
  const state = getPreparedSpriteState()
  if (!state.ready || !state.density) return Promise.resolve(null)
  return scheduleTankRotationCache({
    density: state.density,
    getSprite: (variant, part) => getPreparedSprite(PREPARED_TANK_IDS[variant][part])
  })
}

/**
 * Preload all tank image assets for all variants
 * @param {Function} callback - Called when all images are loaded
 */
export function preloadTankImages(callback) {
  // Prepared density variants (@1x/@2x/@3x) already contain every tank part at the
  // device resolution, so the full-size source images are only fetched as a fallback.
  if (getPreparedSpriteState().ready && TANK_VARIANTS.every(variant => getPreparedTankAssets(variant))) {
    if (callback) callback(true)
    return
  }
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
  const variants = ['tankV1', 'tankV2', 'tankV3', 'lightTank']

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
  if (getPreparedTankAssets(variant)) return true
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
    case 'lightTank':
      return 'lightTank'
    default:
      return 'tankV1' // Default fallback
  }
}

export function getTankVariantForType(tankType) {
  return getTankVariant(tankType)
}

export function getTankImageAssets(tankType = 'tank_v1') {
  const prepared = getPreparedTankAssets(getTankVariant(tankType))
  if (prepared) return prepared
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
  const variant = getTankVariant(unit.type)
  const preparedIds = PREPARED_TANK_IDS[variant]
  // Prepared sprites always provide the logical size/mount metadata; override images
  // (wreck rendering) only replace the pixels.
  const preparedWagon = getPreparedSprite(preparedIds.wagon)
  const preparedTurret = getPreparedSprite(preparedIds.turret)
  const preparedBarrel = getPreparedSprite(preparedIds.barrel)
  if (!overrideImages && !preparedWagon && !areTankImagesLoaded(unit.type)) {
    return false // Images not ready, caller should fall back to original rendering
  }

  const now = getSimulationTime(gameState)
  const variantConfig = tankImageConfig[variant]

  const wagonImg = overrideImages?.wagon || preparedWagon?.image || (tankImageCache[variant] && tankImageCache[variant].wagon)
  const turretImg = overrideImages?.turret || preparedTurret?.image || (tankImageCache[variant] && tankImageCache[variant].turret)
  const barrelImg = overrideImages?.barrel || preparedBarrel?.image || (tankImageCache[variant] && tankImageCache[variant].barrel)

  if (!wagonImg || !turretImg || !barrelImg) {
    return false
  }

  // Snap the tank center to whole device pixels so sprite edges are not resampled at
  // sub-pixel offsets (the main cause of soft tanks on retina screens).
  const density = getTankSnapDensity(preparedWagon)
  const snappedCenterX = snapToDevicePixel(centerX, density)
  const snappedCenterY = snapToDevicePixel(centerY, density)

  // The wagon image faces down by default, but unit.direction = 0 means facing right,
  // so subtract π/2 to align the image with the unit direction.
  const wagonRotation = unit.direction - Math.PI / 2

  // Keep original size relationships - scale wagon to fit tile, others maintain relative size
  const wagonSourceWidth = preparedWagon?.sourceWidth || wagonImg.width
  const wagonSourceHeight = preparedWagon?.sourceHeight || wagonImg.height
  const wagonScale = preparedWagon
    ? preparedWagon.logicalWidth / wagonSourceWidth
    : TILE_SIZE / Math.max(wagonSourceWidth, wagonSourceHeight)
  const wagonWidth = preparedWagon?.logicalWidth || wagonSourceWidth * wagonScale
  const wagonHeight = preparedWagon?.logicalHeight || wagonSourceHeight * wagonScale
  const turretOnly = unit.type === 'harvester' || unit.type === 'rocketTank'

  // Recoil offset for the barrel
  let recoilOffset = 0
  if (!options.disableRecoil && unit.recoilStartTime && now - unit.recoilStartTime <= RECOIL_DURATION) {
    const progress = (now - unit.recoilStartTime) / RECOIL_DURATION
    const easedProgress = 1 - Math.pow(1 - progress, 3)
    recoilOffset = RECOIL_DISTANCE * (1 - easedProgress)
  }

  const turretRotation = unit.turretDirection !== undefined
    ? unit.turretDirection - Math.PI / 2
    : wagonRotation

  // Turret mount point (image coordinates -> wagon-local logical coordinates -> rotated)
  const turretMountX = (variantConfig.turretMountPoint.x - wagonSourceWidth / 2) * wagonScale
  const turretMountY = (variantConfig.turretMountPoint.y - wagonSourceHeight / 2) * wagonScale
  const wagonCos = Math.cos(wagonRotation)
  const wagonSin = Math.sin(wagonRotation)
  const rotatedMountX = turretMountX * wagonCos - turretMountY * wagonSin
  const rotatedMountY = turretMountX * wagonSin + turretMountY * wagonCos

  const turretScale = wagonScale
  const turretSourceWidth = preparedTurret?.sourceWidth || turretImg.width
  const turretSourceHeight = preparedTurret?.sourceHeight || turretImg.height
  const turretWidth = preparedTurret?.logicalWidth || turretSourceWidth * turretScale
  const turretHeight = preparedTurret?.logicalHeight || turretSourceHeight * turretScale

  // Barrel mount point on the turret (relative to turret center). The barrel is drawn
  // after the turret, but its mount point lies at the front edge of the turret, so the
  // turret covers the barrel breech (V1, V2 and V3 share this layout).
  const barrelMountX = (variantConfig.barrelMountPoint.x - turretSourceWidth / 2) * turretScale
  const barrelMountY = (variantConfig.barrelMountPoint.y - turretSourceHeight / 2) * turretScale
  const recoilOffsetRadians = (variantConfig.recoilRotationOffset.degrees * Math.PI) / 180
  const recoilLocalX = -recoilOffset * Math.cos(recoilOffsetRadians)
  const recoilLocalY = -recoilOffset * Math.sin(recoilOffsetRadians)

  const barrelScale = wagonScale
  const barrelSourceWidth = preparedBarrel?.sourceWidth || barrelImg.width
  const barrelSourceHeight = preparedBarrel?.sourceHeight || barrelImg.height
  const barrelWidth = preparedBarrel?.logicalWidth || barrelSourceWidth * barrelScale
  const barrelHeight = preparedBarrel?.logicalHeight || barrelSourceHeight * barrelScale

  const barrelLocalX = barrelMountX + recoilLocalX
  const barrelLocalY = barrelMountY + recoilLocalY

  // Fast path: pre-rendered rotation frames drawn with an identity rotation at snapped positions.
  const cachedWagon = overrideImages ? null : getTankRotationFrame(variant, 'wagon', wagonRotation, preparedWagon)
  const cachedTurret = cachedWagon && !turretOnly ? getTankRotationFrame(variant, 'turret', turretRotation, preparedTurret) : null
  const cachedBarrel = cachedTurret ? getTankRotationFrame(variant, 'barrel', turretRotation, preparedBarrel) : null

  if (cachedWagon && (turretOnly || (cachedTurret && cachedBarrel))) {
    drawRotationFrame(ctx, cachedWagon, snappedCenterX, snappedCenterY)
    if (turretOnly) return true
    const turretX = snappedCenterX + rotatedMountX
    const turretY = snappedCenterY + rotatedMountY
    drawRotationFrame(ctx, cachedTurret, turretX, turretY)
    const turretCos = Math.cos(turretRotation)
    const turretSin = Math.sin(turretRotation)
    drawRotationFrame(
      ctx,
      cachedBarrel,
      turretX + barrelLocalX * turretCos - barrelLocalY * turretSin,
      turretY + barrelLocalX * turretSin + barrelLocalY * turretCos
    )
    if (hasActiveMuzzleFlash(unit, now, options)) {
      ctx.save()
      ctx.translate(turretX, turretY)
      ctx.rotate(turretRotation)
      drawMuzzleFlash(ctx, unit, now, variantConfig, barrelLocalX, barrelLocalY, barrelSourceWidth, barrelSourceHeight, barrelScale)
      ctx.restore()
    }
    return true
  }

  // Fallback: live rotation (rotation cache not ready yet, or wreck override images).
  ctx.save()
  ctx.translate(snappedCenterX, snappedCenterY)

  ctx.save()
  ctx.rotate(wagonRotation)
  if (preparedWagon && !overrideImages) {
    drawPreparedSpriteCentered(ctx, preparedWagon, 0, 0)
  } else {
    ctx.drawImage(wagonImg, -wagonWidth / 2, -wagonHeight / 2, wagonWidth, wagonHeight)
  }
  ctx.restore()

  if (turretOnly) {
    ctx.restore()
    return true
  }

  ctx.save()
  ctx.translate(rotatedMountX, rotatedMountY)
  ctx.rotate(turretRotation)

  if (preparedTurret && !overrideImages) {
    drawPreparedSpriteCentered(ctx, preparedTurret, 0, 0)
  } else {
    ctx.drawImage(turretImg, -turretWidth / 2, -turretHeight / 2, turretWidth, turretHeight)
  }

  if (preparedBarrel && !overrideImages) {
    drawPreparedSpriteCentered(ctx, preparedBarrel, barrelLocalX, barrelLocalY)
  } else {
    ctx.drawImage(barrelImg, barrelLocalX - barrelWidth / 2, barrelLocalY - barrelHeight / 2, barrelWidth, barrelHeight)
  }

  if (hasActiveMuzzleFlash(unit, now, options)) {
    drawMuzzleFlash(ctx, unit, now, variantConfig, barrelLocalX, barrelLocalY, barrelSourceWidth, barrelSourceHeight, barrelScale)
  }

  ctx.restore() // Restore turret transformation
  ctx.restore() // Restore main transformation

  return true // Successfully rendered with images
}

function getTankSnapDensity(preparedSprite) {
  if (preparedSprite?.density) return preparedSprite.density
  const overlay = typeof window !== 'undefined' ? window.gameState?.overlayCanvasPixelRatio : 0
  if (Number.isFinite(overlay) && overlay > 0) return overlay
  return (typeof window !== 'undefined' && window.devicePixelRatio) || 1
}

function drawRotationFrame(ctx, frame, x, y) {
  const half = frame.logicalSize / 2
  ctx.drawImage(
    frame.image,
    snapToDevicePixel(x, frame.density) - half,
    snapToDevicePixel(y, frame.density) - half,
    frame.logicalSize,
    frame.logicalSize
  )
}

function hasActiveMuzzleFlash(unit, now, options) {
  const duration = getMuzzleFlashDuration(unit)
  return !options.disableMuzzleFlash &&
    Number.isFinite(unit.muzzleFlashStartTime) &&
    now >= unit.muzzleFlashStartTime &&
    now - unit.muzzleFlashStartTime <= duration
}

// Draws the muzzle flash in turret-local coordinates (caller sets up the turret transform).
function drawMuzzleFlash(ctx, unit, now, variantConfig, barrelLocalX, barrelLocalY, barrelSourceWidth, barrelSourceHeight, barrelScale) {
  const flashDuration = getMuzzleFlashDuration(unit)
  const flashProgress = (now - unit.muzzleFlashStartTime) / flashDuration
  const flashAlpha = 1 - flashProgress
  const sizeMultiplier = unit.type === 'lightTank' ? LIGHT_TANK_MUZZLE_FLASH_SIZE_MULTIPLIER : 1
  const flashSize = MUZZLE_FLASH_SIZE * sizeMultiplier * (1 - flashProgress * 0.5)

  ctx.save()
  ctx.globalAlpha = flashAlpha
  const flashX = barrelLocalX + (variantConfig.muzzleFlashOffset.x - barrelSourceWidth / 2) * barrelScale
  const flashY = barrelLocalY + (variantConfig.muzzleFlashOffset.y - barrelSourceHeight / 2) * barrelScale
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

function getMuzzleFlashDuration(unit) {
  return unit.type === 'lightTank' ? LIGHT_TANK_MUZZLE_FLASH_DURATION : MUZZLE_FLASH_DURATION
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
