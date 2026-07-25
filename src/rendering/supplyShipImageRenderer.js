import { TILE_SIZE } from '../config.js'

const SOUTH_FACING_SOURCE_ANGLE = Math.PI / 2
let supplyShipImage = null
const loadCallbacks = []
let supplyShipLoaded = false
let supplyShipLoading = false

function finishLoad(success) {
  supplyShipLoaded = success
  supplyShipLoading = false
  loadCallbacks.splice(0).forEach(callback => callback(success))
}

export function preloadSupplyShipImage(callback) {
  if (supplyShipLoaded) {
    callback?.(true)
    return
  }
  if (callback) loadCallbacks.push(callback)
  if (supplyShipLoading) return

  supplyShipLoading = true
  supplyShipImage = new Image()
  supplyShipImage.onload = () => finishLoad(true)
  supplyShipImage.onerror = () => finishLoad(false)
  supplyShipImage.src = 'images/map/units/supply_ship_map.webp'
}

export function isSupplyShipImageLoaded() {
  return supplyShipLoaded && supplyShipImage?.complete
}

export function getSupplyShipBaseImage() {
  return isSupplyShipImageLoaded() ? supplyShipImage : null
}

export function renderSupplyShipWithImage(ctx, unit, centerX, centerY) {
  if (!isSupplyShipImageLoaded()) {
    if (!supplyShipLoading) preloadSupplyShipImage()
    return false
  }

  const direction = unit.direction || unit.rotation || 0
  const image = supplyShipImage
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const scale = (TILE_SIZE * 3.3) / Math.max(sourceWidth, sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale

  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.rotate(direction - SOUTH_FACING_SOURCE_ANGLE)
  ctx.drawImage(image, -width / 2, -height / 2, width, height)
  ctx.restore()

  return true
}
