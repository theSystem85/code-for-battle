// howitzerImageRenderer.js - render howitzers with articulated barrel animation
import {
  TILE_SIZE,
  RECOIL_DISTANCE,
  RECOIL_DURATION,
  MUZZLE_FLASH_DURATION,
  MUZZLE_FLASH_SIZE
} from '../config.js'
import { gameState } from '../gameState.js'
import { getSimulationTime } from '../game/time.js'

let howitzerBaseImg = null
let howitzerBarrelImg = null
let howitzerLoaded = false
let howitzerLoading = false
const pendingCallbacks = []

const HOWITZER_BARREL_MOUNT = { x: 30, y: 30 }
let BARREL_MOUNT_POINT = { x: 2, y: 0 }
let barrelMuzzlePoint = { x: 2, y: 64 }
const HOWITZER_RECOIL_MULTIPLIER = 1.4

function resolveCallbacks(success) {
  while (pendingCallbacks.length) {
    const cb = pendingCallbacks.shift()
    try {
      cb(success)
    } catch (err) {
      console.error('Howitzer preload callback failed', err)
    }
  }
}

export function preloadHowitzerImage(callback) {
  if (callback) {
    pendingCallbacks.push(callback)
  }

  if (howitzerLoaded) {
    resolveCallbacks(true)
    return
  }

  if (howitzerLoading) {
    return
  }

  howitzerLoading = true
  let loadedAssets = 0

  const handleAssetLoaded = () => {
    loadedAssets++
    if (loadedAssets >= 2) {
      howitzerLoaded = true
      howitzerLoading = false
      resolveCallbacks(true)
    }
  }

  const handleAssetError = resource => {
    console.error(`Failed to load howitzer ${resource} asset`)
    howitzerLoaded = false
    howitzerLoading = false
    resolveCallbacks(false)
  }

  howitzerBaseImg = new Image()
  howitzerBaseImg.onload = handleAssetLoaded
  howitzerBaseImg.onerror = () => handleAssetError('base')
  howitzerBaseImg.src = 'images/map/units/howitzer_map.webp'

  howitzerBarrelImg = new Image()
  howitzerBarrelImg.onload = () => {
    BARREL_MOUNT_POINT = {
      x: 2,
      y: 0
    }
    barrelMuzzlePoint = {
      x: BARREL_MOUNT_POINT.x,
      y: howitzerBarrelImg.height
    }
    handleAssetLoaded()
  }
  howitzerBarrelImg.onerror = () => handleAssetError('barrel')
  howitzerBarrelImg.src = 'images/map/units/tankV1_barrel.webp'
}

export function isHowitzerImageLoaded() {
  return (
    howitzerLoaded &&
    howitzerBaseImg && howitzerBaseImg.complete &&
    howitzerBarrelImg && howitzerBarrelImg.complete
  )
}

export function renderHowitzerWithImage(ctx, unit, centerX, centerY) {
  if (!isHowitzerImageLoaded()) return false

  const now = getSimulationTime(gameState)
  ctx.save()
  ctx.translate(centerX, centerY)

  const baseRotation = (unit.direction || 0) + Math.PI / 2
  ctx.rotate(baseRotation)

  const baseScale = TILE_SIZE / Math.max(howitzerBaseImg.width, howitzerBaseImg.height)
  const baseWidth = howitzerBaseImg.width * baseScale
  const baseHeight = howitzerBaseImg.height * baseScale
  ctx.drawImage(howitzerBaseImg, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight)

  const mountLocalX = (HOWITZER_BARREL_MOUNT.x - howitzerBaseImg.width / 2) * baseScale
  const mountLocalY = (HOWITZER_BARREL_MOUNT.y - howitzerBaseImg.height / 2) * baseScale

  ctx.save()
  ctx.translate(mountLocalX, mountLocalY)

  const barrelElevation = unit.barrelElevation || 0
  ctx.rotate(-barrelElevation + Math.PI)

  let recoilOffset = 0
  if (unit.recoilStartTime && now - unit.recoilStartTime <= RECOIL_DURATION) {
    const progress = (now - unit.recoilStartTime) / RECOIL_DURATION
    const eased = 1 - Math.pow(1 - progress, 3)
    recoilOffset = RECOIL_DISTANCE * HOWITZER_RECOIL_MULTIPLIER * (1 - eased)
  }

  const barrelScale = baseScale
  const barrelWidth = howitzerBarrelImg.width * barrelScale
  const barrelHeight = howitzerBarrelImg.height * barrelScale
  const drawX = -BARREL_MOUNT_POINT.x * barrelScale
  const drawY = -BARREL_MOUNT_POINT.y * barrelScale - recoilOffset

  ctx.drawImage(howitzerBarrelImg, drawX, drawY, barrelWidth, barrelHeight)

  const muzzleLocalX = (barrelMuzzlePoint.x - BARREL_MOUNT_POINT.x) * barrelScale
  const muzzleLocalY = (barrelMuzzlePoint.y - BARREL_MOUNT_POINT.y) * barrelScale - recoilOffset

  if (unit.muzzleFlashStartTime && now - unit.muzzleFlashStartTime <= MUZZLE_FLASH_DURATION) {
    const flashProgress = (now - unit.muzzleFlashStartTime) / MUZZLE_FLASH_DURATION
    const flashAlpha = 1 - flashProgress
    const flashLength = MUZZLE_FLASH_SIZE * 1.4 * (1 + 0.2 * (1 - flashProgress))
    const flashWidth = MUZZLE_FLASH_SIZE * 0.7 * (1 + 0.25 * (1 - flashProgress))

    ctx.save()
    ctx.translate(muzzleLocalX, muzzleLocalY)
    ctx.globalAlpha = flashAlpha

    const coreGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, flashLength * 1.05)
    coreGradient.addColorStop(0, 'rgba(255, 200, 0, 0)')
    coreGradient.addColorStop(0.5, '#FFFFFF')
    coreGradient.addColorStop(1, 'rgba(255, 200, 0, 0)')
    ctx.fillStyle = coreGradient
    ctx.fillRect(-flashLength * 1.05 / 2, -flashWidth * 0.35, flashLength * 1.05, flashWidth * 0.7)

    for (const side of [-1, 1]) {
      ctx.save()
      ctx.scale(side, 1)
      const wingGradient = ctx.createLinearGradient(0, 0, flashLength * 0.55, 0)
      wingGradient.addColorStop(0, '#FFF7C0')
      wingGradient.addColorStop(0.45, '#FFB347')
      wingGradient.addColorStop(1, 'rgba(255, 64, 0, 0)')
      ctx.fillStyle = wingGradient
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(flashLength * 0.55, flashWidth * 0.3)
      ctx.lineTo(0, flashWidth * 0.6)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    ctx.restore()
  }

  ctx.restore()
  ctx.restore()
  return true
}

export function getHowitzerBaseImage() {
  return isHowitzerImageLoaded() ? howitzerBaseImg : null
}
