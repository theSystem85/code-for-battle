import { TILE_SIZE } from '../config.js'
import { getCityVisuals } from '../game/cityBuildings.js'
import { drawPreparedSpriteTopLeft } from './prepared/preparedSpritePipeline.js'

// Configuration only: upper artwork is authored as passable/overhang cells;
// the rectangular impassable subset is the actual ground footprint.
export function cityFootprintGroup(group) {
  if (!group.tagSet.has('city') || !Object.values(group.tilesByOffset).some(tile => tile.tags?.includes('overhang'))) return group
  const ground = Object.entries(group.tilesByOffset).filter(([, tile]) => tile.tags?.includes('impassable'))
  if (!ground.length) throw new Error('A tall city building needs an impassable ground footprint')
  const points = ground.map(([key]) => key.split(',').map(Number))
  const left = Math.min(...points.map(point => point[0])), top = Math.min(...points.map(point => point[1]))
  const width = Math.max(...points.map(point => point[0])) - left + 1
  const height = Math.max(...points.map(point => point[1])) - top + 1
  if (ground.length !== width * height) throw new Error('City ground footprints must be complete rectangles')
  const tilesByOffset = {}
  for (const [key, tile] of Object.entries(group.tilesByOffset)) {
    const [x, y] = key.split(',').map(Number)
    const inside = x >= left && x < left + width && y >= top && y < top + height
    if (inside) {
      if (!tile.tags.includes('impassable') || tile.tags.includes('passable')) throw new Error('City ground cells must be impassable only')
      tilesByOffset[`${x - left},${y - top}`] = { ...tile, cityOverlayOnly: true }
    } else if (!tile.tags.includes('passable') || !tile.tags.includes('overhang') || tile.tags.includes('impassable')) {
      throw new Error('City upper cells must be passable overhangs')
    }
  }
  return { ...group, width, height, area: width * height,
    tagSet: new Set([...group.tagSet].filter(tag => tag !== 'passable' && tag !== 'overhang')),
    tilesByOffset, visualTilesByOffset: group.tilesByOffset,
    cityVisual: { tiles: group.tilesByOffset, columns: group.width, rows: group.height,
      offsetX: -left * TILE_SIZE, offsetY: -top * TILE_SIZE, tileOffsetX: -left, tileOffsetY: -top,
      width: group.width * TILE_SIZE, height: group.height * TILE_SIZE, sprite: null } }
}

export function prepareCityVisual(visual, density, canvasFactory = () => document.createElement('canvas')) {
  const canvas = canvasFactory()
  canvas.width = Math.round(visual.width * density)
  canvas.height = Math.round(visual.height * density)
  const ctx = canvas.getContext?.('2d')
  // Metadata-only callers (including headless layout tools) need no raster.
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  for (const [key, tile] of Object.entries(visual.tiles)) {
    const [x, y] = key.split(',').map(Number)
    ctx.drawImage(tile.image, tile.rect.x, tile.rect.y, tile.rect.width, tile.rect.height,
      x * TILE_SIZE * density, y * TILE_SIZE * density, TILE_SIZE * density, TILE_SIZE * density)
  }
  return { image: canvas, density, logicalWidth: visual.width, logicalHeight: visual.height,
    backingWidth: canvas.width, backingHeight: canvas.height }
}

// Called once per frame after ground unit images and before HUD/selection.
// Records and final-density sprites are prepared outside the frame loop.
export function renderCityOverhangs(ctx, mapGrid, scrollOffset, viewWidth, viewHeight, state) {
  const visibility = state?.shadowOfWarEnabled && state.visibilityMap
  for (const entry of getCityVisuals(mapGrid)) {
    const { building, visual } = entry
    if (building.health <= 0 || !visual.sprite) continue
    const x = building.x * TILE_SIZE + visual.offsetX - scrollOffset.x
    const y = building.y * TILE_SIZE + visual.offsetY - scrollOffset.y
    if (x + visual.width <= 0 || y + visual.height <= 0 || x >= viewWidth || y >= viewHeight) continue
    if (visibility?.length) {
      let visible = false
      for (let dy = 0; dy < building.height && !visible; dy++) for (let dx = 0; dx < building.width; dx++) {
        if (visibility[building.y + dy]?.[building.x + dx]?.visible) { visible = true; break }
      }
      if (!visible) continue
    }
    drawPreparedSpriteTopLeft(ctx, visual.sprite, x, y)
  }
}
