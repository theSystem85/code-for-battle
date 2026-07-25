import { TILE_SIZE, TANK_FIRE_RANGE } from '../config.js'

export const ENABLE_DODGING = false
export const LAST_POSITION_CHECK_TIME_DELAY = 3000
export const DODGE_TIME_DELAY = 3000
export const USE_SAFE_ATTACK_DISTANCE = false
export const HARVESTER_REMOTE_DISTANCE = 8 * TILE_SIZE
export const PLAYER_DEFENSE_RADIUS = 10 * TILE_SIZE
export const PLAYER_DEFENSE_BUILDINGS = new Set([
  'turretGunV1',
  'turretGunV2',
  'turretGunV3',
  'rocketTurret',
  'teslaCoil',
  'artilleryTurret'
])
export const AIR_DEFENSE_TYPES = new Set(['rocketTank'])
export const AIR_DEFENSE_BUILDINGS = new Set(['rocketTurret'])
export const HARVESTER_HUNTER_PATH_REFRESH = 2000
export const ROCKET_TURRET_RANGE = 16 * TILE_SIZE
export const AIR_DEFENSE_RADIUS = TANK_FIRE_RANGE * TILE_SIZE * 1.2
export const F22_ANTI_AIR_BUFFER = TILE_SIZE * 0.75
export const F22_APPROACH_NODE_LIMIT = 5000
