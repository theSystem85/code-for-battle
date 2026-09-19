// harvesterImageRenderer.js - Renders harvesters using a single image asset
import { TILE_SIZE } from '../config.js'
import { drawPreparedSpriteCentered, getPreparedSprite } from './prepared/preparedSpritePipeline.js'

let harvesterImg = null
let harvesterLoaded = false
let harvesterLoading = false

export function preloadHarvesterImage(callback) {
  if (harvesterLoaded) {
    if (callback) callback(true)
    return
  }

  if (harvesterLoading) {
    return
  }

  harvesterLoading = true
  harvesterImg = new Image()
  harvesterImg.onload = () => {
    harvesterLoaded = true
    harvesterLoading = false
    if (callback) callback(true)
  }
  harvesterImg.onerror = () => {
    console.error('Failed to load harvester image')
    harvesterLoaded = false
    harvesterLoading = false
    if (callback) callback(false)
  }
  harvesterImg.src = 'images/map/units/harvester.webp'
}

export function isHarvesterImageLoaded() {
  return harvesterLoaded && harvesterImg && harvesterImg.complete
}

export function renderHarvesterWithImage(ctx, unit, centerX, centerY) {
  const prepared = getPreparedSprite('unit:harvester:base')
  if (!prepared && !isHarvesterImageLoaded()) {
    return false
  }

  ctx.save()
  ctx.translate(centerX, centerY)

  // Image faces down by default; rotate so unit.direction=0 faces right
  const rotation = unit.direction - Math.PI / 2
  ctx.rotate(rotation)

  const scale = prepared ? prepared.logicalWidth / prepared.sourceWidth : TILE_SIZE / Math.max(harvesterImg.width, harvesterImg.height)
  const width = prepared?.logicalWidth || harvesterImg.width * scale
  const height = prepared?.logicalHeight || harvesterImg.height * scale

  if (prepared) {
    drawPreparedSpriteCentered(ctx, prepared, 0, 0)
  } else {
    ctx.drawImage(harvesterImg, -width / 2, -height / 2, width, height)
  }

  // Draw sparks when harvesting
  if (unit.harvesting) {
    renderHarvestingSparks(ctx, width, height, prepared?.sourceWidth, prepared?.sourceHeight)
  }

  ctx.restore()
  return true
}

export function getHarvesterBaseImage() {
  return isHarvesterImageLoaded() ? harvesterImg : null
}

function renderHarvestingSparks(ctx, width, height, preparedSourceWidth, preparedSourceHeight) {
  const now = performance.now()
  const sourceWidth = preparedSourceWidth || harvesterImg.width
  const sourceHeight = preparedSourceHeight || harvesterImg.height
  const startX = (14 - sourceWidth / 2) * (width / sourceWidth)
  const endX = (50 - sourceWidth / 2) * (width / sourceWidth)
  const y = (58 - sourceHeight / 2) * (height / sourceHeight)
  const sparkCount = 4
  ctx.fillStyle = '#FFD700'
  for (let i = 0; i < sparkCount; i++) {
    const t = ((now / 100) + i / sparkCount) % 1
    const x = startX + (endX - startX) * t
    ctx.fillRect(x - 1, y - 1, 2, 2)
  }
}
