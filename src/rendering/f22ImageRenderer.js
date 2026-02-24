// f22ImageRenderer.js - rendering for F22 Raptor stealth fighter unit
import { TILE_SIZE } from '../config.js'

let bodyImage = null
let bodyLoaded = false
let loading = false

const BODY_TARGET_WIDTH = TILE_SIZE * 1.4

const SPRITE_CACHE = new Map()

function ensureImagesLoaded(callback) {
  if (bodyLoaded) {
    if (callback) callback(true)
    return
  }

  if (loading) {
    return
  }

  loading = true
  bodyImage = new Image()

  bodyImage.onload = () => {
    bodyLoaded = Boolean(bodyImage?.complete)
    loading = false
    if (callback) callback(bodyLoaded)
  }
  bodyImage.onerror = () => {
    console.error('Failed to load F22 Raptor body image')
    loading = false
    if (callback) callback(false)
  }

  bodyImage.src = 'images/map/units/f22_raptor_map.webp'
}

export function preloadF22Images(callback) {
  ensureImagesLoaded(callback)
}

export function isF22ImageLoaded() {
  return bodyLoaded && bodyImage?.complete
}

function getRotationBucket(angle) {
  const normalized = (angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  const degrees = normalized * 180 / Math.PI
  const bucketSize = 7.5
  return Math.round(degrees / bucketSize) * bucketSize
}

function getBodySprite(rotationBucket) {
  const key = `${rotationBucket}`
  if (SPRITE_CACHE.has(key)) {
    return SPRITE_CACHE.get(key)
  }

  if (!bodyImage || !bodyLoaded) return null

  const naturalAspect = bodyImage.naturalWidth > 0 ? bodyImage.naturalHeight / bodyImage.naturalWidth : 1
  const targetWidth = BODY_TARGET_WIDTH
  const targetHeight = targetWidth * naturalAspect

  const offscreen = document.createElement('canvas')
  offscreen.width = targetWidth * 1.5
  offscreen.height = targetHeight * 1.5

  const ctx = offscreen.getContext('2d')
  ctx.translate(offscreen.width / 2, offscreen.height / 2)

  const angleRad = (rotationBucket * Math.PI) / 180
  ctx.rotate(angleRad)

  ctx.drawImage(bodyImage, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight)

  SPRITE_CACHE.set(key, offscreen)
  return offscreen
}

export function renderF22WithImage(ctx, unit, centerX, centerY) {
  if (!isF22ImageLoaded()) {
    ensureImagesLoaded()
    return false
  }

  const altitudeLift = (unit.altitude || 0) * 0.4
  const drawCenterY = centerY - altitudeLift

  // Draw shadow when airborne
  if (unit.shadow && unit.shadow.offset > 0) {
    const shadowOffsetX = unit.shadow.offset * 0.3
    const shadowOffsetY = unit.shadow.offset * 0.5
    const shadowAlpha = Math.max(0, 0.35 - (unit.shadow.offset / (TILE_SIZE * 3)) * 0.2)

    ctx.save()
    ctx.globalAlpha = shadowAlpha
    ctx.translate(centerX + shadowOffsetX, centerY + shadowOffsetY)
    ctx.rotate(unit.direction)
    const shadowW = BODY_TARGET_WIDTH * 0.85
    const naturalAspect = bodyImage.naturalWidth > 0 ? bodyImage.naturalHeight / bodyImage.naturalWidth : 1
    const shadowH = shadowW * naturalAspect
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.beginPath()
    ctx.ellipse(0, 0, shadowW * 0.5, shadowH * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  const rotationBucket = getRotationBucket(unit.direction)
  const sprite = getBodySprite(rotationBucket)

  if (!sprite) return false

  ctx.save()
  ctx.drawImage(sprite, centerX - sprite.width / 2, drawCenterY - sprite.height / 2)
  ctx.restore()

  return true
}
