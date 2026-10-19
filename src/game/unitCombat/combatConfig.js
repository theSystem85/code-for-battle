import { TANK_V3_BURST } from '../../config.js'

export const COMBAT_CONFIG = {
  CHASE_MULTIPLIER: {
    STANDARD: 1.5,
    ROCKET: 1.8
  },
  FIRE_RATES: {
    STANDARD: 4000,  // Doubled from 2000ms to 4000ms
    LIGHT_TANK: 1500, // About 33% slower than the original one shot per second
    ROCKET: 12000    // Doubled from 6000ms to 12000ms
  },
  APACHE: {
    VOLLEY_DELAY: 180,
    FIRE_RATE: 8400 // 30% faster than standard rocket cadence (12000ms)
  },
  DAMAGE: {
    STANDARD: 25,
    TANK_V3: 30,
    LIGHT_TANK: 6,
    ROCKET: 20,
    APACHE: 10,
    F22: 37.5,
    F35_BOMB: 70
  },
  RANGE_MULTIPLIER: {
    ROCKET: 1.5
  },
  ROCKET_BURST: {
    COUNT: 4,
    DELAY: 300
  },
  // M2 Bradley-style 25 mm autocannon: fast, direct-fire kinetic rounds with a tiny impact
  // flash and no splash damage. SPEED is in px per frame like TANK_BULLET_SPEED (8).
  LIGHT_TANK_PROJECTILE: {
    CREW_KILL_CHANCE: 0.01, // One roll per hit, at most one casualty
    SPEED: 16,
    IMPACT_VISUAL_RADIUS_TILES: 0.35,
    SPREAD_RADIANS: 0.005
  },
  TANK_V3_BURST: {
    COUNT: TANK_V3_BURST.COUNT,
    DELAY: TANK_V3_BURST.DELAY
  }
}

/** Base reload time for single-shot tank guns (the light tank autocannon cycles faster). */
export function getBaseFireRateForTankType(unitType) {
  return unitType === 'lightTank' ? COMBAT_CONFIG.FIRE_RATES.LIGHT_TANK : COMBAT_CONFIG.FIRE_RATES.STANDARD
}

/** Light tank (M2) rounds hit only what they touch: no area/splash damage. */
export function isNoSplashShooterType(unitType) {
  return unitType === 'lightTank'
}
