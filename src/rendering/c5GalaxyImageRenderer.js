import { TILE_SIZE, UNIT_SHADOWS_ENABLED } from '../config.js'
import { AIRCRAFT_RESIZE_AUDIT_TAGS, drawPreparedSpriteCentered, getPreparedSprite } from './prepared/preparedSpritePipeline.js'

const SHADOW_IDS = Array.from({ length: 5 }, (_, band) => `effect:c5:shadow:${band}`)

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
  const rotation = (unit.direction || 0) + Math.PI / 2
  if (UNIT_SHADOWS_ENABLED) {
    const band = ratio > 0 ? Math.min(4, Math.ceil(ratio * 4)) : 0
    const mask = getPreparedSprite(SHADOW_IDS[band])
    if (mask) {
      ctx.save()
      ctx.globalAlpha *= 0.24
      ctx.translate(centerX, centerY + altitude * 0.25)
      ctx.rotate(rotation)
      drawPreparedSpriteCentered(ctx, mask, 0, 0, transitioning ? scale : 1, auditTag)
      ctx.restore()
    }
  }
  ctx.translate(centerX, centerY - altitude * 0.4)
  ctx.rotate(rotation)
  drawPreparedSpriteCentered(ctx, sprite, 0, 0, scale, auditTag)
  ctx.restore()
  return true
}
