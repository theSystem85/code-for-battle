import { TILE_SIZE } from '../config.js'

const SOUTH_FACING_SOURCE_ANGLE = Math.PI / 2
const SOUTH_FACING_GUN_SOURCE_POINT = Object.freeze({ x: 55, y: 260 })
let destroyerImage = null
const loadCallbacks = []
let destroyerLoaded = false
let destroyerLoading = false

function finishLoad(success) {
  destroyerLoaded = success
  destroyerLoading = false
  loadCallbacks.splice(0).forEach(callback => callback(success))
}

export function preloadDestroyerImage(callback) {
  if (destroyerLoaded) {
    callback?.(true)
    return
  }
  if (callback) loadCallbacks.push(callback)
  if (destroyerLoading) return

  destroyerLoading = true
  destroyerImage = new Image()
  destroyerImage.onload = () => finishLoad(true)
  destroyerImage.onerror = () => finishLoad(false)
  destroyerImage.src = 'images/map/units/destroyer_map.webp'
}

export function isDestroyerImageLoaded() {
  return destroyerLoaded && destroyerImage?.complete
}

export function getDestroyerBaseImage() {
  return isDestroyerImageLoaded() ? destroyerImage : null
}

export function getDestroyerGunSpawnPoint(unit, centerX, centerY) {
  const image = destroyerImage
  const sourceWidth = image?.naturalWidth || image?.width || 109
  const sourceHeight = image?.naturalHeight || image?.height || 342
  const scale = (TILE_SIZE * 3.9) / Math.max(sourceWidth, sourceHeight)
  const localX = (SOUTH_FACING_GUN_SOURCE_POINT.x - sourceWidth / 2) * scale
  const localY = (SOUTH_FACING_GUN_SOURCE_POINT.y - sourceHeight / 2) * scale
  const rotation = (unit.direction || unit.rotation || 0) - SOUTH_FACING_SOURCE_ANGLE

  return {
    x: centerX + localX * Math.cos(rotation) - localY * Math.sin(rotation),
    y: centerY + localX * Math.sin(rotation) + localY * Math.cos(rotation)
  }
}

export function renderDestroyerWithImage(ctx, unit, centerX, centerY) {
  if (!isDestroyerImageLoaded()) {
    if (!destroyerLoading) preloadDestroyerImage()
    return false
  }

  const direction = unit.direction || unit.rotation || 0
  const image = destroyerImage
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const scale = (TILE_SIZE * 3.9) / Math.max(sourceWidth, sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale

  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.rotate(direction - SOUTH_FACING_SOURCE_ANGLE)
  ctx.drawImage(image, -width / 2, -height / 2, width, height)
  ctx.restore()

  return true
}
