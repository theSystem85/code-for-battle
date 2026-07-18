import { TILE_SIZE } from '../config.js'

const SOUTH_FACING_SOURCE_ANGLE = Math.PI / 2
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
  destroyerImage.src = 'images/map/units/destroyer/destroyer_south.webp'
}

export function isDestroyerImageLoaded() {
  return destroyerLoaded && destroyerImage?.complete
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
  const scale = (TILE_SIZE * 2.6) / Math.max(sourceWidth, sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale

  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.rotate(direction - SOUTH_FACING_SOURCE_ANGLE)
  ctx.drawImage(image, -width / 2, -height / 2, width, height)
  ctx.restore()

  return true
}
