import { TILE_SIZE } from '../config.js'
import { drawPreparedSpriteCentered, getPreparedSprite } from './prepared/preparedSpritePipeline.js'

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
const MOUNTS = [[-9, -1], [-4, 3], [4, 3], [9, -1]]

export function renderC5Airdrop(ctx, unit, x, y) {
  const drop = unit.c5Drop
  const progress = 1 - Math.max(0, Math.min(1, (unit.altitude || 0) / drop.altitude))
  const heading = unit.direction || 0
  const angle = heading + progress * Math.PI / 2
  const headingCos = Math.cos(heading)
  const headingSin = Math.sin(heading)
  const canopy = getPreparedSprite('effect:c5:parachute')
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const windX = (drop.windX || 0) * 3
  const windY = (drop.windY || 0) * 3
  ctx.save()
  ctx.strokeStyle = '#d7d2b7'
  ctx.fillStyle = '#eee8c9'
  ctx.lineWidth = 1

  for (const [cornerX, cornerY] of CORNERS) {
    const localX = cornerX * TILE_SIZE * 0.25
    const localY = cornerY * TILE_SIZE * 0.2
    const anchorX = x + localX * headingCos - localY * headingSin
    const anchorY = y + localX * headingSin + localY * headingCos
    const canopyX = x + (cornerX * cos - cornerY * sin) * TILE_SIZE * 0.53 + windX
    const canopyY = y - TILE_SIZE * 0.95 + (cornerX * sin + cornerY * cos) * TILE_SIZE * 0.25 + windY
    ctx.beginPath()
    for (const [mountX, mountY] of MOUNTS) {
      ctx.moveTo(canopyX + mountX, canopyY + mountY)
      ctx.lineTo(anchorX, anchorY)
    }
    ctx.stroke()
    if (drawPreparedSpriteCentered(ctx, canopy, canopyX, canopyY)) continue
    ctx.beginPath()
    ctx.ellipse(canopyX, canopyY - 1, 9, 6, 0, Math.PI, Math.PI * 2)
    ctx.quadraticCurveTo(canopyX + 4, canopyY + 5, canopyX, canopyY + 2)
    ctx.quadraticCurveTo(canopyX - 4, canopyY + 5, canopyX - 9, canopyY - 1)
    ctx.fill()
  }
  ctx.restore()
}
