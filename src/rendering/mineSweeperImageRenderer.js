// mineSweeperImageRenderer.js - render mine sweeper tanks using a single image asset
import { TILE_SIZE } from '../config.js'
import { drawPreparedSpriteCentered, getPreparedSprite } from './prepared/preparedSpritePipeline.js'

let mineSweeperImg = null
let mineSweeperLoaded = false
let mineSweeperLoading = false

export function preloadMineSweeperImage(callback) {
  if (mineSweeperLoaded) {
    if (callback) callback(true)
    return
  }
  if (mineSweeperLoading) return

  mineSweeperLoading = true
  mineSweeperImg = new Image()
  mineSweeperImg.onload = () => {
    mineSweeperLoaded = true
    mineSweeperLoading = false
    if (callback) callback(true)
  }
  mineSweeperImg.onerror = () => {
    console.error('Failed to load mine sweeper image')
    mineSweeperLoaded = false
    mineSweeperLoading = false
    if (callback) callback(false)
  }
  mineSweeperImg.src = 'images/map/units/minesweeper_map.webp'
}

export function isMineSweeperImageLoaded() {
  return mineSweeperLoaded && mineSweeperImg && mineSweeperImg.complete
}

export function renderMineSweeperWithImage(ctx, unit, centerX, centerY) {
  const prepared = getPreparedSprite('unit:mineSweeper:base')
  if (!prepared && !isMineSweeperImageLoaded()) return false

  ctx.save()
  ctx.translate(centerX, centerY)

  // Image faces upward by default. Rotate so unit.direction=0 faces right.
  const rotation = unit.direction - Math.PI / 2
  ctx.rotate(rotation)

  if (prepared) {
    drawPreparedSpriteCentered(ctx, prepared, 0, 0)
  } else {
    const scale = TILE_SIZE / Math.max(mineSweeperImg.width, mineSweeperImg.height)
    const width = mineSweeperImg.width * scale
    const height = mineSweeperImg.height * scale
    ctx.drawImage(mineSweeperImg, -width / 2, -height / 2, width, height)
  }

  ctx.restore()
  return true
}

export function getMineSweeperBaseImage() {
  return isMineSweeperImageLoaded() ? mineSweeperImg : null
}
