import { TILE_SIZE } from '../config.js'

const DIRECTION_STEP = Math.PI / 4
const DIRECTION_NAMES = [
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
  'north',
  'northeast'
]

const destroyerImages = new Array(DIRECTION_NAMES.length).fill(null)
const loadCallbacks = []
let destroyerLoaded = false
let destroyerLoading = false

function normalizeAngle(angle) {
  const fullTurn = Math.PI * 2
  return ((angle % fullTurn) + fullTurn) % fullTurn
}

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
  let remaining = DIRECTION_NAMES.length
  let failed = false

  DIRECTION_NAMES.forEach((name, index) => {
    const image = new Image()
    destroyerImages[index] = image
    image.onload = () => {
      remaining--
      if (remaining === 0) finishLoad(!failed)
    }
    image.onerror = () => {
      failed = true
      remaining--
      if (remaining === 0) finishLoad(false)
    }
    image.src = `images/map/units/destroyer/destroyer_${name}.webp`
  })
}

export function isDestroyerImageLoaded() {
  return destroyerLoaded && destroyerImages.every(image => image?.complete)
}

export function renderDestroyerWithImage(ctx, unit, centerX, centerY) {
  if (!isDestroyerImageLoaded()) {
    if (!destroyerLoading) preloadDestroyerImage()
    return false
  }

  const direction = normalizeAngle(unit.direction || unit.rotation || 0)
  const directionIndex = Math.round(direction / DIRECTION_STEP) % DIRECTION_NAMES.length
  const baseDirection = directionIndex * DIRECTION_STEP
  let intermediateRotation = direction - baseDirection
  if (intermediateRotation > Math.PI) intermediateRotation -= Math.PI * 2
  if (intermediateRotation < -Math.PI) intermediateRotation += Math.PI * 2

  const image = destroyerImages[directionIndex]
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const scale = (TILE_SIZE * 2.6) / Math.max(sourceWidth, sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale

  ctx.save()
  ctx.translate(centerX, centerY)
  // The closest generated 45-degree view supplies perspective and lighting;
  // only the small angle between authored headings is rotated mathematically.
  ctx.rotate(intermediateRotation)
  ctx.drawImage(image, -width / 2, -height / 2, width, height)
  ctx.restore()

  return true
}
