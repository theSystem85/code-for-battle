// apacheImageRenderer.js - rendering for Apache helicopter unit
import { TILE_SIZE } from '../config.js'
import { angleDiff } from '../logic.js'
import {
  drawPreparedSpriteCentered,
  drawPreparedSpriteTopLeft,
  getPreparedSprite
} from './prepared/preparedSpritePipeline.js'

let bodyImage = null
let rotorImage = null
let bodyLoaded = false
let rotorLoaded = false
let loading = false

const BODY_TARGET_WIDTH = TILE_SIZE * 0.7 * 1.5 // 50% larger
const ROTOR_TARGET_WIDTH = TILE_SIZE * 1.5 // 50% larger
const ROTOR_ANCHOR = { x: 31, y: 30 }
const SPRITE_CACHE = new Map()
const ROTATION_BUCKET_SIZE = 7.5
const ROTATION_BUCKET_COUNT = 48
const TILT_STATES = Object.freeze(['neutral', 'forward', 'backward', 'left', 'right'])
const PREPARED_BODY_IDS = Object.freeze(Array.from({ length: ROTATION_BUCKET_COUNT }, (_, index) => {
  const bucket = index * ROTATION_BUCKET_SIZE
  return Object.freeze(Object.fromEntries(
    TILT_STATES.map(tilt => [tilt, `aircraft:apache:body:${bucket}:${tilt}`])
  ))
}))
const PREPARED_ROTOR_ID = 'aircraft:apache:rotor'

function ensureImagesLoaded(callback) {
  if (bodyLoaded && rotorLoaded) {
    if (callback) callback(true)
    return
  }

  if (loading) {
    return
  }

  loading = true
  bodyImage = new Image()
  rotorImage = new Image()

  let loadedCount = 0

  function handleLoaded(success) {
    if (success) {
      loadedCount += 1
    }
    if (loadedCount >= 2) {
      bodyLoaded = Boolean(bodyImage?.complete)
      rotorLoaded = Boolean(rotorImage?.complete)
      loading = false
      if (callback) callback(bodyLoaded && rotorLoaded)
    }
  }

  bodyImage.onload = () => handleLoaded(true)
  bodyImage.onerror = () => {
    console.error('Failed to load Apache body image')
    loading = false
    if (callback) callback(false)
  }
  rotorImage.onload = () => handleLoaded(true)
  rotorImage.onerror = () => {
    console.error('Failed to load Apache rotor image')
    loading = false
    if (callback) callback(false)
  }

  bodyImage.src = 'images/map/units/apache_body_map.webp'
  rotorImage.src = 'images/map/units/apache_rotor_map.webp'
}

export function preloadApacheImages(callback) {
  ensureImagesLoaded(callback)
}

export function isApacheImageLoaded() {
  return bodyLoaded && rotorLoaded && bodyImage?.complete && rotorImage?.complete
}

function getRotationBucket(angle) {
  const normalized = (angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  const degrees = normalized * 180 / Math.PI
  return (Math.round(degrees / ROTATION_BUCKET_SIZE) % ROTATION_BUCKET_COUNT) * ROTATION_BUCKET_SIZE
}

function getTiltState(unit) {
  const movement = unit.movement || {}
  const speed = movement.currentSpeed || 0
  if (speed <= 0.01) return 'neutral'

  const velocityAngle = Math.atan2(movement.velocity?.y || 0, movement.velocity?.x || 0)
  const diff = angleDiff(velocityAngle, unit.direction)
  const normalizedSpeed = Math.min(1, speed / (unit.speed || 1))

  const forwardComponent = Math.cos(diff) * normalizedSpeed
  const lateralComponent = Math.sin(diff) * normalizedSpeed

  if (forwardComponent > 0.35) return 'forward'
  if (forwardComponent < -0.35) return 'backward'
  if (lateralComponent > 0.35) return 'right'
  if (lateralComponent < -0.35) return 'left'
  return 'neutral'
}

function getBodySprite(rotationBucket, tiltState) {
  const key = `${rotationBucket}:${tiltState}`
  if (SPRITE_CACHE.has(key)) {
    return SPRITE_CACHE.get(key)
  }

  const sourceWidth = bodyImage?.naturalWidth || bodyImage?.width || TILE_SIZE
  const sourceHeight = bodyImage?.naturalHeight || bodyImage?.height || TILE_SIZE
  const scale = BODY_TARGET_WIDTH / Math.max(sourceWidth, 1)
  const targetWidth = sourceWidth * scale
  const targetHeight = sourceHeight * scale

  const canvas = document.createElement('canvas')
  const maxDimension = TILE_SIZE
  canvas.width = Math.ceil(maxDimension)
  canvas.height = Math.ceil(maxDimension)
  const ctx = canvas.getContext('2d')

  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotationBucket * Math.PI) / 180 + Math.PI / 2)

  let tiltX = 1
  let tiltY = 1
  let tiltOffsetY = 0
  switch (tiltState) {
    case 'forward':
      tiltY = 0.9
      tiltOffsetY = TILE_SIZE * 0.08
      break
    case 'backward':
      tiltY = 0.9
      tiltOffsetY = -TILE_SIZE * 0.08
      break
    case 'left':
      tiltX = 0.9
      break
    case 'right':
      tiltX = 0.9
      break
    default:
      break
  }

  ctx.scale(tiltX, tiltY)
  ctx.drawImage(
    bodyImage,
    -targetWidth / 2,
    -targetHeight / 2 + tiltOffsetY,
    targetWidth,
    targetHeight
  )

  SPRITE_CACHE.set(key, canvas)
  return canvas
}

function renderShadow(ctx, unit, centerX, centerY) {
  const shadow = unit.shadow || { offset: 0, scale: 1 }
  const baseRadius = TILE_SIZE * 0.35
  const offsetY = shadow.offset || 0
  const scale = shadow.scale || 1

  ctx.save()
  ctx.translate(centerX, centerY + offsetY)
  ctx.scale(scale, Math.max(0.5, scale * 0.7))
  const gradient = ctx.createRadialGradient(0, 0, baseRadius * 0.3, 0, 0, baseRadius)
  gradient.addColorStop(0, 'rgba(0,0,0,0.25)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.ellipse(0, 0, baseRadius, baseRadius * 0.6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function getPreparedBodySprite(rotationBucket, tiltState) {
  return getPreparedSprite(PREPARED_BODY_IDS[rotationBucket / ROTATION_BUCKET_SIZE][tiltState])
}

function renderBody(ctx, unit, centerX, centerY, preparedBody) {
  if (!preparedBody && !isApacheImageLoaded()) return false
  const sprite = preparedBody || getBodySprite(getRotationBucket(unit.direction || 0), getTiltState(unit))
  const altitudeLift = (unit.altitude || 0) * 0.4
  if (preparedBody) {
    drawPreparedSpriteCentered(ctx, preparedBody, centerX, centerY - altitudeLift)
  } else {
    const drawX = centerX - sprite.width / 2
    const drawY = centerY - sprite.height / 2 - altitudeLift
    ctx.drawImage(sprite, drawX, drawY)
  }
  return true
}

function renderRotor(ctx, unit, centerX, centerY, preparedRotor) {
  if (!preparedRotor && !isApacheImageLoaded()) return
  const altitudeLift = (unit.altitude || 0) * 0.4
  const sourceWidth = preparedRotor?.sourceWidth || rotorImage?.naturalWidth || rotorImage?.width || TILE_SIZE
  const sourceHeight = preparedRotor?.sourceHeight || rotorImage?.naturalHeight || rotorImage?.height || TILE_SIZE
  const scale = preparedRotor
    ? preparedRotor.logicalWidth / sourceWidth
    : ROTOR_TARGET_WIDTH / Math.max(sourceWidth, 1)
  const targetWidth = preparedRotor?.logicalWidth || sourceWidth * scale
  const targetHeight = preparedRotor?.logicalHeight || sourceHeight * scale
  const anchorX = preparedRotor?.anchors.rotor.x || ROTOR_ANCHOR.x * scale
  const anchorY = preparedRotor?.anchors.rotor.y || ROTOR_ANCHOR.y * scale

  ctx.save()
  ctx.translate(centerX, centerY - altitudeLift)
  ctx.rotate((unit.direction || 0) + Math.PI / 2)
  ctx.rotate(unit.rotor?.angle || 0)
  if (preparedRotor) {
    drawPreparedSpriteTopLeft(ctx, preparedRotor, -anchorX, -anchorY)
  } else {
    ctx.drawImage(rotorImage, -anchorX, -anchorY, targetWidth, targetHeight)
  }
  ctx.restore()
}

export function renderApacheWithImage(ctx, unit, centerX, centerY) {
  const rotationBucket = getRotationBucket(unit.direction || 0)
  const tiltState = getTiltState(unit)
  const preparedBody = getPreparedBodySprite(rotationBucket, tiltState)
  const preparedRotor = getPreparedSprite(PREPARED_ROTOR_ID)
  if (!preparedBody && !isApacheImageLoaded()) {
    preloadApacheImages()
    return false
  }

  renderShadow(ctx, unit, centerX, centerY)
  const rendered = renderBody(ctx, unit, centerX, centerY, preparedBody)
  renderRotor(ctx, unit, centerX, centerY, preparedRotor)
  return rendered
}

export function getApacheRocketSpawnPoints(unit, centerX, centerY) {
  const preparedBody = getPreparedBodySprite(
    getRotationBucket(unit.direction || 0),
    getTiltState(unit)
  )
  if (!preparedBody && !isApacheImageLoaded()) {
    const offsetForward = TILE_SIZE * 0.4
    const offsetSide = TILE_SIZE * 0.25
    const cos = Math.cos(unit.direction || 0)
    const sin = Math.sin(unit.direction || 0)
    return {
      left: {
        x: centerX + cos * offsetForward - sin * offsetSide,
        y: centerY + sin * offsetForward + cos * offsetSide
      },
      right: {
        x: centerX + cos * offsetForward + sin * offsetSide,
        y: centerY + sin * offsetForward - cos * offsetSide
      }
    }
  }

  const bodyWidth = preparedBody?.sourceWidth || bodyImage?.naturalWidth || bodyImage?.width || TILE_SIZE
  const bodyHeight = preparedBody?.sourceHeight || bodyImage?.naturalHeight || bodyImage?.height || TILE_SIZE
  const scale = BODY_TARGET_WIDTH / Math.max(bodyWidth, 1)
  const hardpoints = {
    left: { x: 21, y: 25 },
    right: { x: 42, y: 25 }
  }

  const results = {}
  const rotation = (unit.direction || 0) + Math.PI / 2
  Object.entries(hardpoints).forEach(([key, point]) => {
    const localX = (point.x - bodyWidth / 2) * scale
    const localY = (point.y - bodyHeight / 2) * scale
    const rotatedX = localX * Math.cos(rotation) - localY * Math.sin(rotation)
    const rotatedY = localX * Math.sin(rotation) + localY * Math.cos(rotation)
    const altitudeLift = (unit.altitude || 0) * 0.4
    results[key] = {
      x: centerX + rotatedX,
      y: centerY + rotatedY - altitudeLift
    }
  })

  return results
}

