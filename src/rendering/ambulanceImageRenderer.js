// ambulanceImageRenderer.js - render ambulances using a single image asset
import { TILE_SIZE } from '../config.js'
import { drawPreparedSpriteCentered, getPreparedSprite } from './prepared/preparedSpritePipeline.js'

let ambulanceImg = null
let ambulanceLoaded = false
let ambulanceLoading = false

export function preloadAmbulanceImage(callback) {
  if (ambulanceLoaded) {
    if (callback) callback(true)
    return
  }
  if (ambulanceLoading) return

  ambulanceLoading = true
  ambulanceImg = new Image()
  ambulanceImg.onload = () => {
    ambulanceLoaded = true
    ambulanceLoading = false
    if (callback) callback(true)
  }
  ambulanceImg.onerror = () => {
    console.error('Failed to load ambulance image')
    ambulanceLoaded = false
    ambulanceLoading = false
    if (callback) callback(false)
  }
  ambulanceImg.src = 'images/map/units/ambulance.webp'
}

export function isAmbulanceImageLoaded() {
  return ambulanceLoaded && ambulanceImg && ambulanceImg.complete
}

export function renderAmbulanceWithImage(ctx, unit, centerX, centerY) {
  const prepared = getPreparedSprite('unit:ambulance:base')
  if (!prepared && !isAmbulanceImageLoaded()) return false

  ctx.save()
  ctx.translate(centerX, centerY)

  // Image faces downwards by default. Rotate so unit.direction=0 faces right.
  const rotation = unit.direction - Math.PI / 2
  ctx.rotate(rotation)

  if (prepared) {
    drawPreparedSpriteCentered(ctx, prepared, 0, 0)
  } else {
    const scale = TILE_SIZE / Math.max(ambulanceImg.width, ambulanceImg.height)
    const width = ambulanceImg.width * scale
    const height = ambulanceImg.height * scale
    ctx.drawImage(ambulanceImg, -width / 2, -height / 2, width, height)
  }

  ctx.restore()
  return true
}

export function getAmbulanceBaseImage() {
  return isAmbulanceImageLoaded() ? ambulanceImg : null
}
