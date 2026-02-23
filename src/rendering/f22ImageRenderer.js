// f22ImageRenderer.js - rendering for F22 Raptor stealth fighter unit
import { TILE_SIZE } from '../config.js'

let f22Image = null
let imageLoaded = false
let loading = false

const F22_TARGET_WIDTH = TILE_SIZE * 1.4
const SPRITE_CACHE = new Map()

function ensureImageLoaded(callback) {
  if (imageLoaded && f22Image?.complete) {
    if (callback) callback(true)
    return
  }

  if (loading) return

  loading = true
  f22Image = new Image()

  f22Image.onload = () => {
    imageLoaded = Boolean(f22Image?.complete)
    loading = false
    if (callback) callback(imageLoaded)
  }
  f22Image.onerror = () => {
    console.error('Failed to load F22 Raptor image')
    loading = false
    if (callback) callback(false)
  }

  f22Image.src = 'images/map/units/f22_raptor_map.webp'
}

export function preloadF22Image(callback) {
  ensureImageLoaded(callback)
}

export function isF22ImageLoaded() {
  return imageLoaded && f22Image?.complete
}

function getRotationBucket(angle) {
  const normalized = (angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  const degrees = normalized * 180 / Math.PI
  const bucketSize = 7.5
  return Math.round(degrees / bucketSize) * bucketSize
}

function getF22Sprite(rotationBucket) {
  const key = `f22:${rotationBucket}`
  if (SPRITE_CACHE.has(key)) return SPRITE_CACHE.get(key)

  const sourceWidth = f22Image?.naturalWidth || f22Image?.width || TILE_SIZE
  const sourceHeight = f22Image?.naturalHeight || f22Image?.height || TILE_SIZE
  const scale = F22_TARGET_WIDTH / Math.max(sourceWidth, 1)
  const targetWidth = sourceWidth * scale
  const targetHeight = sourceHeight * scale

  const canvas = document.createElement('canvas')
  const maxDimension = TILE_SIZE * 1.5
  canvas.width = Math.ceil(maxDimension)
  canvas.height = Math.ceil(maxDimension)
  const ctx = canvas.getContext('2d')

  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotationBucket * Math.PI) / 180 + Math.PI / 2)
  ctx.drawImage(f22Image, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight)

  SPRITE_CACHE.set(key, canvas)
  return canvas
}

export function renderF22WithImage(ctx, unit, screenX, screenY) {
  if (!isF22ImageLoaded()) {
    ensureImageLoaded()
    // Fallback: draw a simple shape
    ctx.save()
    ctx.fillStyle = '#4A4A6A'
    ctx.translate(screenX, screenY)
    ctx.rotate(unit.direction || 0)
    ctx.beginPath()
    ctx.moveTo(0, -TILE_SIZE * 0.4)
    ctx.lineTo(TILE_SIZE * 0.15, TILE_SIZE * 0.3)
    ctx.lineTo(-TILE_SIZE * 0.15, TILE_SIZE * 0.3)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    return
  }

  const direction = unit.direction || 0
  const rotationBucket = getRotationBucket(direction)
  const sprite = getF22Sprite(rotationBucket)

  if (!sprite) return

  const halfW = sprite.width / 2
  const halfH = sprite.height / 2

  ctx.save()
  // Draw shadow when airborne
  if (unit.altitude > 0) {
    const shadowOffset = unit.altitude * 0.3
    const shadowScale = Math.max(0.6, 1 - unit.altitude / (unit.maxAltitude * 2))
    ctx.save()
    ctx.globalAlpha = 0.25 * shadowScale
    ctx.filter = 'blur(2px)'
    ctx.drawImage(sprite, screenX - halfW + shadowOffset, screenY - halfH + shadowOffset, sprite.width * shadowScale, sprite.height * shadowScale)
    ctx.restore()
  }

  ctx.drawImage(sprite, screenX - halfW, screenY - halfH)
  ctx.restore()
}

export function clearF22SpriteCache() {
  SPRITE_CACHE.clear()
}
