import { TILE_SIZE, TANK_FIRE_RANGE, HOWITZER_FIRE_RANGE, ROCKET_TANK_RANGE_MULTIPLIER, APACHE_RANGE_REDUCTION, BATTLESHIP_FIRE_RANGE } from '../../config.js'

export function getEffectiveFireRange(unit) {
  if (unit.type === 'howitzer') {
    let baseRange = HOWITZER_FIRE_RANGE * TILE_SIZE
    if (unit.rangeMultiplier) {
      baseRange *= unit.rangeMultiplier
    }
    return baseRange
  }

  let baseRange = TANK_FIRE_RANGE * TILE_SIZE

  if (unit.type === 'rocketTank') {
    baseRange *= ROCKET_TANK_RANGE_MULTIPLIER
  } else if (unit.type === 'apache') {
    baseRange *= APACHE_RANGE_REDUCTION
  } else if (unit.type === 'f22Raptor') {
    baseRange = 16 * TILE_SIZE
  } else if (unit.type === 'f35') {
    baseRange = 14 * TILE_SIZE
  } else if (unit.type === 'destroyer') {
    baseRange = 18 * TILE_SIZE
  } else if (unit.type === 'battleship') {
    baseRange = BATTLESHIP_FIRE_RANGE
  } else if (unit.type === 'submarine') {
    baseRange = 12 * TILE_SIZE
  }

  if (unit.level >= 1) {
    baseRange *= (unit.rangeMultiplier || 1.2)
  }

  if (unit.type === 'f22Raptor') {
    baseRange = Math.min(baseRange, 20 * TILE_SIZE)
  }

  return baseRange
}
