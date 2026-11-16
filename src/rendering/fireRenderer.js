import { getFireSeverity } from '../game/fireSeverity.js'
import { getFireSprites } from './fireSprites.js'
import { TILE_SIZE, FIRE_DETAIL, FIRE_EXTINGUISH_SECONDS, WIND_DIRECTION } from '../config.js'
import { getCanvasLogicalSize } from './renderingUtils.js'

// Per render frame: bounded atlas samples (high) or two paths (low) per
// visible burning tile, plus one hose per visible engine. No map scans.
export function renderFires(ctx, state, grid, units, scroll) {
  const size = getCanvasLogicalSize(ctx.canvas)
  const now = state.simulationTime || 0
  const sheet = FIRE_DETAIL === 'high' ? getFireSprites() : null
  ctx.save()
  for (const fire of state.fires || []) {
    if (state.shadowOfWarEnabled && !state.visibilityMap?.[fire.y]?.[fire.x]?.visible) continue
    const x = (fire.x + 0.5) * TILE_SIZE - scroll.x
    const y = (fire.y + 0.8) * TILE_SIZE - scroll.y
    if (x < -TILE_SIZE * 6 || y < -TILE_SIZE * 6 || x > size.width + TILE_SIZE * 6 || y > size.height + TILE_SIZE * 6) continue
    const severity = getFireSeverity(fire)
    const strength = Math.max(0.2, 1 - fire.suppression / (FIRE_EXTINGUISH_SECONDS * severity))
    if (sheet) {
      drawHighFire(ctx, sheet, x, y, fire.x, fire.y, severity, strength, now)
      // Overlap alpha fields at shared edges, including north/south neighbours.
      // O(1) grid lookups, no component flood fills or per-frame allocations.
      const right = grid[fire.y]?.[fire.x + 1]?.fire
      const below = grid[fire.y + 1]?.[fire.x]?.fire
      if (right && (!state.shadowOfWarEnabled || state.visibilityMap?.[fire.y]?.[fire.x + 1]?.visible)) {
        drawHighFire(ctx, sheet, x + TILE_SIZE / 2, y, fire.x, fire.y, Math.min(severity, getFireSeverity(right)), strength * 0.7, now)
      }
      if (below && (!state.shadowOfWarEnabled || state.visibilityMap?.[fire.y + 1]?.[fire.x]?.visible)) {
        drawHighFire(ctx, sheet, x, y + TILE_SIZE / 2, fire.x, fire.y, Math.min(severity, getFireSeverity(below)), strength * 0.7, now)
      }
      continue
    }
    ctx.save()
    ctx.translate(x, y)
    ctx.transform(1, 0, -Math.max(-1, Math.min(1, WIND_DIRECTION.x)) * 0.2, 1, 0, 0)
    ctx.scale(1 + (severity - 1) * 0.1, 1 + (severity - 1) * 0.18)
    ctx.translate(-x, -y)
    ctx.globalAlpha = 0.72 * strength
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
    ctx.restore()
  }
  ctx.globalAlpha = 1
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

// Up to six atlas quads + nine sparks per visible tile including connectors.
// At 1,000 visible tiles: <=6,000 quads; raster area scales with DPR squared.
// No particle objects, gradients, readbacks, filters, or gameplay resizing caches.
function drawHighFire(ctx, sheet, x, y, tx, ty, severity, strength, now) {
  const frame = (Math.floor(now / 70) + tx * 3 + ty * 7) & 15
  const width = TILE_SIZE * (1.15 + severity * 0.12)
  const height = TILE_SIZE * (0.8 + severity * 0.32)
  const windX = Math.max(-1, Math.min(1, WIND_DIRECTION.x))
  const windY = Math.max(-1, Math.min(1, WIND_DIRECTION.y))
  ctx.save()
  ctx.translate(x, y)
  ctx.transform(1, 0, -windX * 0.42, 1 - windY * 0.16, 0, 0)
  ctx.globalAlpha = strength
  ctx.drawImage(sheet, (frame % 8) * 64, Math.floor(frame / 8) * 128, 64, 128, -width / 2, -height, width, height)
  ctx.globalAlpha = strength * (0.35 + severity * 0.13)
  ctx.drawImage(sheet, (frame % 8) * 64, (2 + Math.floor(frame / 8)) * 128, 64, 128, -width * 0.65, -height * 2, width * 1.3, height * 1.7)
  ctx.fillStyle = '#ffdc89'
  for (let i = 0; i < Math.min(3, severity); i++) {
    const age = ((now / 1100 + tx * 0.37 + ty * 0.61 + i / 3) % 1)
    ctx.globalAlpha = (1 - age) * strength * 0.85
    ctx.fillRect(Math.sin(tx + i * 4 + age * 7) * width * 0.22 + windX * age * height, -age * height * 1.8, 1.3, 2)
  }
  ctx.restore()
}
