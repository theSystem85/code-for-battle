// rocketTankImageRenderer.js - render rocket tanks using a single image asset
import { TILE_SIZE, MUZZLE_FLASH_DURATION, MUZZLE_FLASH_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { getSimulationTime } from '../game/time.js'

let rocketTankImg = null
let rocketTankLoaded = false
let rocketTankLoading = false

// Spawn point relative to the asset (pixels from top-left)
const SPAWN_POINT = { x: 42, y: 10 }

export function preloadRocketTankImage(callback) {
  if (rocketTankLoaded) {
    if (callback) callback(true)
    return
  }
  if (rocketTankLoading) return

  rocketTankLoading = true
  rocketTankImg = new Image()
  rocketTankImg.onload = () => {
    rocketTankLoaded = true
    rocketTankLoading = false
    if (callback) callback(true)
  }
  rocketTankImg.onerror = () => {
    console.error('Failed to load rocket tank image')
    rocketTankLoaded = false
    rocketTankLoading = false
    if (callback) callback(false)
  }
  rocketTankImg.src = 'images/map/units/rocket_tank.webp'
}

export function isRocketTankImageLoaded() {
  return rocketTankLoaded && rocketTankImg && rocketTankImg.complete
}

export function renderRocketTankWithImage(ctx, unit, centerX, centerY) {
  if (!isRocketTankImageLoaded()) return false

  const now = getSimulationTime(gameState)

  ctx.save()
  ctx.translate(centerX, centerY)

  // Image faces downwards by default. Rotate so unit.direction=0 faces right.
  const rotation = unit.direction - Math.PI / 2
  ctx.rotate(rotation)

  const scale = TILE_SIZE / Math.max(rocketTankImg.width, rocketTankImg.height)
  const width = rocketTankImg.width * scale
  const height = rocketTankImg.height * scale

  ctx.drawImage(rocketTankImg, -width / 2, -height / 2, width, height)

  // Render muzzle flash when firing
  if (unit.muzzleFlashStartTime && now - unit.muzzleFlashStartTime <= MUZZLE_FLASH_DURATION) {
    const flashProgress = (now - unit.muzzleFlashStartTime) / MUZZLE_FLASH_DURATION
    const flashAlpha = 1 - flashProgress
    const flashSize = MUZZLE_FLASH_SIZE * (1 - flashProgress * 0.5)

    ctx.save()
    ctx.globalAlpha = flashAlpha

    const localX = (SPAWN_POINT.x - rocketTankImg.width / 2) * scale
    const localY = (SPAWN_POINT.y - rocketTankImg.height / 2) * scale
    const rotatedX = localX
    const rotatedY = localY

    const gradient = ctx.createRadialGradient(rotatedX, rotatedY, 0, rotatedX, rotatedY, flashSize)
    gradient.addColorStop(0, '#FFF')
    gradient.addColorStop(0.3, '#FF0')
    gradient.addColorStop(1, 'rgba(255, 165, 0, 0)')

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(rotatedX, rotatedY, flashSize, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  ctx.restore()
  return true
}

export function getRocketTankBaseImage() {
  return isRocketTankImageLoaded() ? rocketTankImg : null
}

export function getRocketSpawnPoint(unit, centerX, centerY) {
  if (!isRocketTankImageLoaded()) {
    const muzzleOffset = TILE_SIZE * 0.4
    return {
      x: centerX + Math.cos(unit.direction) * muzzleOffset,
      y: centerY + Math.sin(unit.direction) * muzzleOffset
    }
  }

  const rotation = unit.direction - Math.PI / 2
  const scale = TILE_SIZE / Math.max(rocketTankImg.width, rocketTankImg.height)
  const localX = (SPAWN_POINT.x - rocketTankImg.width / 2) * scale
  const localY = (SPAWN_POINT.y - rocketTankImg.height / 2) * scale
  const rotatedX = localX * Math.cos(rotation) - localY * Math.sin(rotation)
  const rotatedY = localX * Math.sin(rotation) + localY * Math.cos(rotation)
  return {
    x: centerX + rotatedX,
    y: centerY + rotatedY
  }
}
