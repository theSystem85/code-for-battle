import { TILE_SIZE, UNIT_SHADOWS_ENABLED } from '../config.js'
import { AIRCRAFT_RESIZE_AUDIT_TAGS, drawPreparedSpriteCentered, getPreparedSprite } from './prepared/preparedSpritePipeline.js'

export function renderC5GalaxyWithImage(ctx, unit, centerX, centerY) {
  const altitude = unit.altitude || 0
  const ratio = Math.max(0, Math.min(1, altitude / (unit.maxAltitude || TILE_SIZE * 4.5)))
  const rising = unit.flightState === 'climb'
  const descending = unit.flightState === 'approach'
  const transitioning = (rising || descending) && ratio > 0 && ratio < 1
  const sprite = getPreparedSprite(`aircraft:c5Galaxy:${ratio > 0 ? 'flight' : 'ground'}`)
  if (!sprite) return false
  const scale = transitioning ? 0.75 + ratio * 0.25 : 1
  const auditTag = transitioning ? (rising ? AIRCRAFT_RESIZE_AUDIT_TAGS.TAKEOFF : AIRCRAFT_RESIZE_AUDIT_TAGS.LANDING) : null

  ctx.save()
  if (UNIT_SHADOWS_ENABLED) {
    const shadowScale = unit.shadow?.scale || (1 + ratio * 0.35)
    const offset = unit.shadow?.offset ?? altitude * 0.25
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.beginPath()
    ctx.ellipse(centerX, centerY + offset, TILE_SIZE * shadowScale, TILE_SIZE * 0.48 * shadowScale, unit.direction || 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.translate(centerX, centerY - altitude * 0.4)
  ctx.rotate((unit.direction || 0) + Math.PI / 2)
  drawPreparedSpriteCentered(ctx, sprite, 0, 0, scale, auditTag)
  ctx.restore()
  return true
}
