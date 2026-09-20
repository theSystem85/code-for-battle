// recoveryTankImageRenderer.js - render recovery tanks using a single image
import { TILE_SIZE } from '../config.js'
import { drawPreparedSpriteCentered, getPreparedSprite } from './prepared/preparedSpritePipeline.js'

let image = null
let loaded = false
let loading = false

export function preloadRecoveryTankImage(callback) {
  if (loaded) { if (callback) callback(true); return }
  if (loading) return
  loading = true
  image = new Image()
  image.onload = () => { loaded = true; loading = false; if (callback) callback(true) }
  image.onerror = () => { loaded = false; loading = false; if (callback) callback(false) }
  image.src = 'images/map/units/recovery_tank.webp'
}

export function isRecoveryTankImageLoaded() {
  return loaded && image && image.complete
}

export function renderRecoveryTankWithImage(ctx, unit, centerX, centerY) {
  const prepared = getPreparedSprite('unit:recoveryTank:base')
  if (!prepared && !isRecoveryTankImageLoaded()) return false
  ctx.save()
  ctx.translate(centerX, centerY)
  const rotation = unit.direction - Math.PI / 2
  ctx.rotate(rotation)
  if (prepared) {
    drawPreparedSpriteCentered(ctx, prepared, 0, 0)
  } else {
    const scale = TILE_SIZE / Math.max(image.width, image.height)
    const width = image.width * scale
    const height = image.height * scale
    ctx.drawImage(image, -width / 2, -height / 2, width, height)
  }
  ctx.restore()
  return true
}

export function getRecoveryTankBaseImage() {
  return isRecoveryTankImageLoaded() ? image : null
}

