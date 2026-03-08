import { TILE_SIZE } from '../config.js'

let f35Image = null
let f35Loaded = false
let f35Loading = false

const F35_TARGET_WIDTH = TILE_SIZE * 1.32

function ensureImageLoaded(callback) {
  if (f35Loaded) {
    if (callback) callback(true)
    return
  }
  if (f35Loading) return
  f35Loading = true
  f35Image = new Image()
  f35Image.onload = () => {
    f35Loaded = true
    f35Loading = false
    if (callback) callback(true)
  }
  f35Image.onerror = () => {
    console.error('Failed to load F35 image')
    f35Loading = false
    if (callback) callback(false)
  }
  f35Image.src = 'images/map/units/f35_map.webp'
}

export function preloadF35Images(callback) {
  ensureImageLoaded(callback)
}

export function isF35ImageLoaded() {
  return f35Loaded && f35Image?.complete
}

export function getF35BaseImage() {
  if (!f35Image && !f35Loading) {
    preloadF35Images()
  }
  return isF35ImageLoaded() ? f35Image : null
}

function renderShadow(ctx, unit, centerX, centerY) {
  const shadow = unit.shadow || { offset: 0, scale: 1 }
  const baseRadius = TILE_SIZE * 0.33
  const offsetY = shadow.offset || 0
  const scale = shadow.scale || 1

  ctx.save()
  ctx.translate(centerX, centerY + offsetY)
  ctx.scale(scale, Math.max(0.5, scale * 0.68))
  const gradient = ctx.createRadialGradient(0, 0, baseRadius * 0.3, 0, 0, baseRadius)
  gradient.addColorStop(0, 'rgba(0,0,0,0.22)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.ellipse(0, 0, baseRadius, baseRadius * 0.58, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawEngineGlow(ctx, unit, centerX, centerY, altitudeLift, sourceWidth, sourceHeight, scale) {
  const movingFast = unit.movement?.currentSpeed > 0.55 || unit.manualFlightState === 'takeoff'
  if (!movingFast) return

  const nozzles = [
    { x: sourceWidth * 0.44, y: sourceHeight * 0.77 },
    { x: sourceWidth * 0.56, y: sourceHeight * 0.77 }
  ]
  const jitter = (Math.sin((performance.now() % 1000) * 0.03) + 1) * 0.5
  const burstLength = 7 + jitter * 5

  ctx.save()
  ctx.translate(centerX, centerY - altitudeLift)
  ctx.rotate((unit.direction || 0) + Math.PI / 2)
  nozzles.forEach(nozzle => {
    const localX = (nozzle.x - sourceWidth / 2) * scale
    const localY = (nozzle.y - sourceHeight / 2) * scale
    const gradient = ctx.createLinearGradient(localX, localY, localX, localY + burstLength)
    gradient.addColorStop(0, 'rgba(255,255,220,0.85)')
    gradient.addColorStop(0.45, 'rgba(255,190,92,0.72)')
    gradient.addColorStop(1, 'rgba(255,98,24,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(localX - 1, localY + 1, 2, burstLength)
  })
  ctx.restore()
}

export function renderF35WithImage(ctx, unit, centerX, centerY) {
  if (!isF35ImageLoaded()) {
    preloadF35Images()
    return false
  }

  const altitudeLift = (unit.altitude || 0) * 0.4
  const isAirborne = unit.flightState && unit.flightState !== 'grounded' && (unit.altitude || 0) > 1
  if (isAirborne) {
    renderShadow(ctx, unit, centerX, centerY)
  }

  const sourceWidth = f35Image.naturalWidth || f35Image.width || TILE_SIZE
  const sourceHeight = f35Image.naturalHeight || f35Image.height || TILE_SIZE
  const scale = F35_TARGET_WIDTH / Math.max(sourceWidth, 1)
  const targetWidth = sourceWidth * scale
  const targetHeight = sourceHeight * scale

  drawEngineGlow(ctx, unit, centerX, centerY, altitudeLift, sourceWidth, sourceHeight, scale)

  ctx.save()
  ctx.translate(centerX, centerY - altitudeLift)
  ctx.rotate((unit.direction || 0) + Math.PI / 2)
  ctx.drawImage(f35Image, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight)
  ctx.restore()

  return true
}

export function getF35BombSpawnPoint(unit, centerX, centerY) {
  const altitudeLift = (unit.altitude || 0) * 0.4

  if (!isF35ImageLoaded()) {
    const offsetForward = TILE_SIZE * 0.1
    return {
      x: centerX + Math.cos((unit.direction || 0) + Math.PI / 2) * offsetForward,
      y: centerY + Math.sin((unit.direction || 0) + Math.PI / 2) * offsetForward - altitudeLift
    }
  }

  const sourceWidth = f35Image?.naturalWidth || f35Image?.width || TILE_SIZE
  const sourceHeight = f35Image?.naturalHeight || f35Image?.height || TILE_SIZE
  const scale = F35_TARGET_WIDTH / Math.max(sourceWidth, 1)
  const hardpoint = { x: sourceWidth / 2, y: sourceHeight * 0.55 }
  const localX = (hardpoint.x - sourceWidth / 2) * scale
  const localY = (hardpoint.y - sourceHeight / 2) * scale
  const rotation = (unit.direction || 0) + Math.PI / 2

  const rotatedX = localX * Math.cos(rotation) - localY * Math.sin(rotation)
  const rotatedY = localX * Math.sin(rotation) + localY * Math.cos(rotation)

  return {
    x: centerX + rotatedX,
    y: centerY + rotatedY - altitudeLift
  }
}
