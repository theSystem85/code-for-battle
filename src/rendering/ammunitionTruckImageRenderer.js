// ammunitionTruckImageRenderer.js - render ammunition trucks using a single image asset
import { TILE_SIZE } from '../config.js'
import { drawPreparedSpriteCentered, getPreparedSprite } from './prepared/preparedSpritePipeline.js'

let ammunitionImg = null
let ammunitionLoaded = false
let ammunitionLoading = false

export function preloadAmmunitionTruckImage(callback) {
  if (ammunitionLoaded) { if (callback) callback(true); return }
  if (ammunitionLoading) return
  ammunitionLoading = true
  ammunitionImg = new Image()
  ammunitionImg.onload = () => { ammunitionLoaded = true; ammunitionLoading = false; if (callback) callback(true) }
  ammunitionImg.onerror = () => { console.error('Failed to load ammunition truck image'); ammunitionLoaded = false; ammunitionLoading = false; if (callback) callback(false) }
  ammunitionImg.src = 'images/map/units/ammunition_truck_map.webp'
}

export function isAmmunitionTruckImageLoaded() {
  return ammunitionLoaded && ammunitionImg && ammunitionImg.complete
}

export function renderAmmunitionTruckWithImage(ctx, unit, centerX, centerY) {
  const prepared = getPreparedSprite('unit:ammunitionTruck:base')
  if (!prepared && !isAmmunitionTruckImageLoaded()) return false
  ctx.save()
  ctx.translate(centerX, centerY)
  const rotation = unit.direction - Math.PI / 2
  ctx.rotate(rotation)
  if (prepared) {
    drawPreparedSpriteCentered(ctx, prepared, 0, 0)
  } else {
    const scale = TILE_SIZE / Math.max(ammunitionImg.width, ammunitionImg.height)
    const width = ammunitionImg.width * scale
    const height = ammunitionImg.height * scale
    ctx.drawImage(ammunitionImg, -width / 2, -height / 2, width, height)
  }
  ctx.restore()
  return true
}

export function getAmmunitionTruckBaseImage() {
  return isAmmunitionTruckImageLoaded() ? ammunitionImg : null
}
