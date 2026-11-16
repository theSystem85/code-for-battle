import { TILE_SIZE } from '../config.js'
import { getCanvasLogicalSize } from './renderingUtils.js'

// Per render frame: two small paths per visible burning tile, one hose per
// visible engine. No gradients, sprite resizing, map scans or range-area fills.
export function renderFires(ctx, state, grid, units, scroll) {
  const size = getCanvasLogicalSize(ctx.canvas)
  const now = state.simulationTime || 0
  ctx.save()
  for (const fire of state.fires || []) {
    if (state.shadowOfWarEnabled && !state.visibilityMap?.[fire.y]?.[fire.x]?.visible) continue
    const x = (fire.x + 0.5) * TILE_SIZE - scroll.x
    const y = (fire.y + 0.8) * TILE_SIZE - scroll.y
    if (x < -TILE_SIZE || y < -TILE_SIZE || x > size.width + TILE_SIZE || y > size.height + TILE_SIZE) continue
    const flicker = Math.sin(now / 90 + fire.x * 3 + fire.y) * 3
    ctx.fillStyle = '#ee5423'
    ctx.beginPath()
    ctx.moveTo(x - 10, y)
    ctx.quadraticCurveTo(x - 15, y - 12, x - 5, y - 22 - flicker)
    ctx.lineTo(x, y - 13)
    ctx.lineTo(x + 5, y - 29 + flicker)
    ctx.quadraticCurveTo(x + 19, y - 5, x + 8, y)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffd56b'
    ctx.beginPath()
    ctx.moveTo(x - 5, y)
    ctx.quadraticCurveTo(x - 7, y - 8, x + 2, y - 16 + flicker)
    ctx.quadraticCurveTo(x + 10, y - 3, x + 4, y)
    ctx.fill()
  }
  ctx.strokeStyle = '#9ddfff'
  ctx.lineWidth = 2
  for (const unit of units) {
    if (unit.type !== 'fireEngine' || !unit.extinguishing) continue
    const x = unit.x + TILE_SIZE / 2 - scroll.x
    const y = unit.y + TILE_SIZE / 2 - scroll.y
    if (x < -TILE_SIZE || y < -TILE_SIZE || x > size.width + TILE_SIZE || y > size.height + TILE_SIZE) continue
    if (state.shadowOfWarEnabled && !state.visibilityMap?.[unit.tileY]?.[unit.tileX]?.visible) continue
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x, y - 18, (unit.extinguishing.x + 0.5) * TILE_SIZE - scroll.x, (unit.extinguishing.y + 0.5) * TILE_SIZE - scroll.y)
    ctx.stroke()
  }
  ctx.restore()
}
