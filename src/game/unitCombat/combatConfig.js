import { TANK_V3_BURST } from '../../config.js'

export const COMBAT_CONFIG = {
  CHASE_MULTIPLIER: {
    STANDARD: 1.5,
    ROCKET: 1.8
  },
  FIRE_RATES: {
    STANDARD: 4000,  // Doubled from 2000ms to 4000ms
    ROCKET: 12000    // Doubled from 6000ms to 12000ms
  },
  APACHE: {
    VOLLEY_DELAY: 180,
    FIRE_RATE: 8400 // 30% faster than standard rocket cadence (12000ms)
  },
  DAMAGE: {
    STANDARD: 25,
    TANK_V3: 30,
    ROCKET: 20,
    APACHE: 10,
    F35_BOMB: 70
  },
  RANGE_MULTIPLIER: {
    ROCKET: 1.5
  },
  ROCKET_BURST: {
    COUNT: 4,
    DELAY: 300
  },
  TANK_V3_BURST: {
    COUNT: TANK_V3_BURST.COUNT,
    DELAY: TANK_V3_BURST.DELAY
  }
}
