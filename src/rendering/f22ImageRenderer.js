// f22ImageRenderer.js - rendering for F22 Raptor stealth fighter unit
import { TILE_SIZE } from '../config.js'

let f22Image = null
let f22Loaded = false
let f22Loading = false

const F22_TARGET_WIDTH = TILE_SIZE * 1.4

function ensureImageLoaded(callback) {
  if (f22Loaded) {
    if (callback) callback(true)
    return
  }
  if (f22Loading) return
  f22Loading = true
  f22Image = new Image()
  f22Image.onload = () => {
    f22Loaded = true
    f22Loading = false
    if (callback) callback(true)
  }
  f22Image.onerror = () => {
    console.error('Failed to load F22 Raptor image')
    f22Loading = false
    if (callback) callback(false)
  }
  f22Image.src = 'images/map/units/f22_raptor_map.webp'
}

export function preloadF22Images(callback) {
  ensureImageLoaded(callback)
}

export function isF22ImageLoaded() {
  return f22Loaded && f22Image?.complete
}

export function getF22BaseImage() {
  if (!f22Image && !f22Loading) {
    preloadF22Images()
  }
  return isF22ImageLoaded() ? f22Image : null
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

export function renderF22WithImage(ctx, unit, centerX, centerY) {
  if (!isF22ImageLoaded()) {
    preloadF22Images()
    return false
  }

  const altitudeLift = (unit.altitude || 0) * 0.4

  const isAirborne = unit.flightState && unit.flightState !== 'grounded' && (unit.altitude || 0) > 1
  if (isAirborne) {
    renderShadow(ctx, unit, centerX, centerY)
  }

  const sourceWidth = f22Image.naturalWidth || f22Image.width || TILE_SIZE
  const sourceHeight = f22Image.naturalHeight || f22Image.height || TILE_SIZE
  const scale = F22_TARGET_WIDTH / Math.max(sourceWidth, 1)
  const targetWidth = sourceWidth * scale
  const targetHeight = sourceHeight * scale

  const drawJetBurst = () => {
    const movingFast = unit.movement?.currentSpeed > 0.7 || unit.f22State === 'takeoff_roll' || unit.f22State === 'liftoff'
    if (!movingFast) return

    const nozzles = [
      { x: 29, y: 54 },
      { x: 34, y: 54 }
    ]
    const jitter = (Math.sin((performance.now() % 1000) * 0.03) + 1) * 0.5
    const burstLength = 9 + jitter * 7

    ctx.save()
    ctx.translate(centerX, centerY - altitudeLift)
    ctx.rotate((unit.direction || 0) + Math.PI / 2)
    nozzles.forEach(nozzle => {
      const localX = (nozzle.x - sourceWidth / 2) * scale
      const localY = (nozzle.y - sourceHeight / 2) * scale
      const gradient = ctx.createLinearGradient(localX, localY, localX, localY + burstLength)
      gradient.addColorStop(0, 'rgba(255,255,220,0.9)')
      gradient.addColorStop(0.45, 'rgba(255,184,76,0.8)')
      gradient.addColorStop(1, 'rgba(255,90,18,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(localX - 1.2, localY + 1, 2.4, burstLength)
    })
    ctx.restore()
  }

  drawJetBurst()

  ctx.save()
  ctx.translate(centerX, centerY - altitudeLift)
  ctx.rotate((unit.direction || 0) + Math.PI / 2)
  ctx.drawImage(f22Image, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight)
  ctx.restore()

  return true
}
