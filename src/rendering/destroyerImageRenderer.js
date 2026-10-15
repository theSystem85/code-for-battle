import { drawPreparedSpriteCentered, getPreparedSprite } from './prepared/preparedSpritePipeline.js'

const SOUTH_FACING_SOURCE_ANGLE = Math.PI / 2
const SOUTH_FACING_GUN_SOURCE_POINT = Object.freeze({ x: 29.4, y: 272.8 })
// destroyer_map.webp is authored at the DPR 3 backing size; draw it at 1/3 when unprepared.
const DESTROYER_SOURCE_DENSITY = 3
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
  if (getPreparedSprite('naval:destroyer:hull')) return true
  return destroyerLoaded && destroyerImage?.complete
}

export function getDestroyerBaseImage() {
  return isDestroyerImageLoaded() ? destroyerImage : null
}

export function getDestroyerGunSpawnPoint(unit, centerX, centerY) {
  const prepared = getPreparedSprite('naval:destroyer:hull')
  const image = destroyerImage
  const sourceWidth = prepared?.sourceWidth || image?.naturalWidth || image?.width || 59
  const sourceHeight = prepared?.sourceHeight || image?.naturalHeight || image?.height || 337
  const scale = prepared
    ? prepared.logicalWidth / sourceWidth
    : 1 / DESTROYER_SOURCE_DENSITY
  const localX = prepared
    ? prepared.anchors.gun.x - prepared.logicalWidth / 2
    : (SOUTH_FACING_GUN_SOURCE_POINT.x - sourceWidth / 2) * scale
  const localY = prepared
    ? prepared.anchors.gun.y - prepared.logicalHeight / 2
    : (SOUTH_FACING_GUN_SOURCE_POINT.y - sourceHeight / 2) * scale
  const rotation = (unit.direction || unit.rotation || 0) - SOUTH_FACING_SOURCE_ANGLE

  return {
    x: centerX + localX * Math.cos(rotation) - localY * Math.sin(rotation),
    y: centerY + localX * Math.sin(rotation) + localY * Math.cos(rotation)
  }
}

export function renderDestroyerWithImage(ctx, unit, centerX, centerY) {
  const prepared = getPreparedSprite('naval:destroyer:hull')
  if (!prepared && !isDestroyerImageLoaded()) {
    if (!destroyerLoading) preloadDestroyerImage()
    return false
  }

  const direction = unit.direction || unit.rotation || 0

  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.rotate(direction - SOUTH_FACING_SOURCE_ANGLE)
  if (prepared) {
    drawPreparedSpriteCentered(ctx, prepared, 0, 0)
  } else {
    const image = destroyerImage
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    const scale = 1 / DESTROYER_SOURCE_DENSITY
    const width = sourceWidth * scale
    const height = sourceHeight * scale
    ctx.drawImage(image, -width / 2, -height / 2, width, height)
  }
  ctx.restore()

  return true
}
