import { TILE_SIZE } from '../config.js'
import { drawPreparedSpriteCentered, getPreparedSprite } from './prepared/preparedSpritePipeline.js'

export function renderC5GalaxyWithImage(ctx, unit, centerX, centerY) {
  const airborne = unit.flightState !== 'grounded' || unit.altitude > 0
  const sprite = getPreparedSprite(`aircraft:c5Galaxy:${airborne ? 'flight' : 'ground'}`)
  if (!sprite) return false
  const ratio = Math.max(0, Math.min(1, (unit.altitude || 0) / Math.max(1, unit.maxAltitude || 144)))
  const width = TILE_SIZE * 3.5 * (0.82 + ratio * 0.18)
  ctx.save()
  ctx.translate(centerX, centerY - (unit.altitude || 0) * 0.4)
  ctx.rotate((unit.direction || 0) + Math.PI / 2)
  drawPreparedSpriteCentered(ctx, sprite, 0, 0, { width, height: width })
  ctx.restore()
  return true
}
