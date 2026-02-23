const configRegistry = new Map()
const activeOverrides = new Map()

export const CONFIG_OVERRIDE_FILENAME = 'config-overrides.json'

const CONFIG_OVERRIDE_STORAGE_KEY = 'rts-config-overrides'
const EXTERNAL_OVERRIDE_PATH = `/${CONFIG_OVERRIDE_FILENAME}`

let overridesLoaded = false
let overridesLoadPromise = null

function _registerConfigVariable(name) {
  const defaultValue = eval(name)
  configRegistry.set(name, {
    name,
    get value() {
      return eval(name)
    },
    type: typeof defaultValue,
    defaultValue
  })
}

function getConfigEntry(name) {
  const entry = configRegistry.get(name)
  if (!entry) {
    throw new Error(`Unknown config value: ${name}`)
  }
  return entry
}

function assertNumericEntry(entry) {
  if (entry.type !== 'number') {
    throw new Error(`Config value ${entry.name} is not numeric and cannot be updated`)
  }
}

function serializeForEval(value) {
  if (typeof value === 'number') {
    if (Object.is(value, -0)) {
      return '-0'
    }
    return String(value)
  }
  return JSON.stringify(value)
}

function assignConfigValue(name, value) {
  const serialized = serializeForEval(value)
  eval(`${name} = ${serialized}`)
}

function setNumericConfigValue(entry, numericValue, { persistLocal = false } = {}) {
  assertNumericEntry(entry)

  if (!Number.isFinite(numericValue)) {
    throw new Error(`Value for ${entry.name} must be a finite number`)
  }

  assignConfigValue(entry.name, numericValue)

  const updatedValue = entry.value
  if (Object.is(updatedValue, entry.defaultValue)) {
    activeOverrides.delete(entry.name)
  } else {
    activeOverrides.set(entry.name, updatedValue)
  }

  if (persistLocal) {
    saveOverridesToLocalStorage()
  }

  return updatedValue
}

export function listConfigVariables() {
  return Array.from(configRegistry.values()).map((entry) => ({
    name: entry.name,
    type: entry.type,
    value: entry.value,
    defaultValue: entry.defaultValue,
    editable: entry.type === 'number',
    overridden: entry.type === 'number' && activeOverrides.has(entry.name)
  }))
}

export function getConfigValue(name) {
  return getConfigEntry(name).value
}

export function updateConfigValue(name, rawValue) {
  const entry = getConfigEntry(name)
  const numericValue = Number(rawValue)
  return setNumericConfigValue(entry, numericValue, { persistLocal: true })
}

export function isConfigValueOverridden(name) {
  const entry = getConfigEntry(name)
  return entry.type === 'number' && activeOverrides.has(entry.name)
}

export function getConfigOverrides() {
  const overrides = {}
  activeOverrides.forEach((value, key) => {
    const entry = configRegistry.get(key)
    if (!entry || entry.type !== 'number') {
      activeOverrides.delete(key)
      return
    }

    const currentValue = entry.value
    if (Object.is(currentValue, entry.defaultValue)) {
      activeOverrides.delete(key)
      return
    }

    overrides[key] = currentValue

    if (!Object.is(currentValue, value)) {
      activeOverrides.set(key, currentValue)
    }
  })
  return overrides
}

export async function ensureConfigOverridesLoaded() {
  if (overridesLoaded) {
    return
  }

  if (!overridesLoadPromise) {
    overridesLoadPromise = (async() => {
      await loadOverridesFromFile()
      loadOverridesFromLocalStorage()
      overridesLoaded = true
    })()
  }

  return overridesLoadPromise
}

function applyOverridesFromObject(overrides, { persistLocal = false } = {}) {
  if (!overrides || typeof overrides !== 'object') {
    return
  }

  Object.entries(overrides).forEach(([name, value]) => {
    if (!configRegistry.has(name)) {
      window.logger.warn(`Ignoring unknown config override: ${name}`)
      return
    }

    const entry = configRegistry.get(name)
    if (entry.type !== 'number') {
      window.logger.warn(`Ignoring override for non-numeric config value: ${name}`)
      return
    }

    const numericValue = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numericValue)) {
      window.logger.warn(`Ignoring non-finite override for ${name}`)
      return
    }

    setNumericConfigValue(entry, numericValue, { persistLocal })
  })
}

function saveOverridesToLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }

  try {
    if (activeOverrides.size === 0) {
      window.localStorage.removeItem(CONFIG_OVERRIDE_STORAGE_KEY)
      return
    }

    window.localStorage.setItem(
      CONFIG_OVERRIDE_STORAGE_KEY,
      JSON.stringify(getConfigOverrides())
    )
  } catch (err) {
    window.logger.warn('Failed to persist config overrides to localStorage:', err)
  }
}

function loadOverridesFromLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }

  let raw
  try {
    raw = window.localStorage.getItem(CONFIG_OVERRIDE_STORAGE_KEY)
  } catch (err) {
    window.logger.warn('Failed to read config overrides from localStorage:', err)
    return
  }

  if (!raw) {
    return
  }

  try {
    const parsed = JSON.parse(raw)
    applyOverridesFromObject(parsed)
  } catch (err) {
    window.logger.warn('Failed to parse config overrides from localStorage:', err)
  }
}

async function loadOverridesFromFile() {
  if (typeof fetch !== 'function') {
    return
  }

  try {
    const response = await fetch(EXTERNAL_OVERRIDE_PATH, { cache: 'no-store' })
    if (!response.ok) {
      return
    }

    const data = await response.json()
    applyOverridesFromObject(data)
  } catch (err) {
    window.logger.warn('Failed to load config overrides file:', err)
  }
}

// Experience system multiplier (adjusts how quickly units gain XP)
export let XP_MULTIPLIER = 3

export function setXpMultiplier(value) {
  XP_MULTIPLIER = value
}

// config.js
export const TILE_SIZE = 32
export const MIN_MAP_TILES = 25
export const DEFAULT_MAP_TILES_X = 100
export const DEFAULT_MAP_TILES_Y = 100
export let MAP_TILES_X = DEFAULT_MAP_TILES_X
export let MAP_TILES_Y = DEFAULT_MAP_TILES_Y

export function setMapDimensions(widthTiles, heightTiles) {
  const normalizedWidth = Number.isFinite(widthTiles) ? Math.floor(widthTiles) : DEFAULT_MAP_TILES_X
  const normalizedHeight = Number.isFinite(heightTiles) ? Math.floor(heightTiles) : DEFAULT_MAP_TILES_Y

  MAP_TILES_X = Math.max(MIN_MAP_TILES, normalizedWidth)
  MAP_TILES_Y = Math.max(MIN_MAP_TILES, normalizedHeight)

  return { width: MAP_TILES_X, height: MAP_TILES_Y }
}

export function getMapDimensions() {
  return { width: MAP_TILES_X, height: MAP_TILES_Y }
}

export function getMapWidth() {
  return MAP_TILES_X * TILE_SIZE
}

export function getMapHeight() {
  return MAP_TILES_Y * TILE_SIZE
}
// Approximate real world length of one tile in meters (for speed calculations)
export const TILE_LENGTH_METERS = 1000

// Cursor range display: 10 meters per tile for attack range visualization
export const CURSOR_METERS_PER_TILE = 10
export const SAFE_RANGE_ENABLED = false
export let CREW_KILL_CHANCE = 0.25 // 25% chance to kill a crew member on hit

export function setCrewKillChance(value) {
  CREW_KILL_CHANCE = value
}

// Toggle to allow selecting enemy units to view their HUD only
export let ENABLE_ENEMY_SELECTION = true

export function setEnemySelectionEnabled(value) {
  ENABLE_ENEMY_SELECTION = value
}

// Toggle to allow issuing commands to enemy units when selected
export let ENABLE_ENEMY_CONTROL = false

export function setEnemyControlEnabled(value) {
  ENABLE_ENEMY_CONTROL = value
}

// Sound configuration
export const MASTER_VOLUME = 0.25  // Default to 50% volume

// Targeting spread for tanks and turrets (in pixels, about 3/4 of a tile for more noticeable inaccuracy)
export let TARGETING_SPREAD = TILE_SIZE * 0.75

export function setTargetingSpread(value) {
  TARGETING_SPREAD = value
}

// HARVESTER_CAPPACITY is now 1 (so a harvester unloads as soon as it harvests one unit)
export let HARVESTER_CAPPACITY = 1

export function setHarvesterCapacity(value) {
  HARVESTER_CAPPACITY = value
}

// Harvester unload time (in milliseconds)
export let HARVESTER_UNLOAD_TIME = 5000  // 5 seconds (2x faster than before)

export function setHarvesterUnloadTime(value) {
  HARVESTER_UNLOAD_TIME = value
}

// Capacity of tanker truck supply tank
export let TANKER_SUPPLY_CAPACITY = 40000

export function setTankerSupplyCapacity(value) {
  TANKER_SUPPLY_CAPACITY = value
}

// Fallback colors for tiles when images aren't available
export const TILE_COLORS = {
  land: '#A0522D',
  water: '#1E90FF',
  rock: '#808080',
  street: '#D3D3D3',
  ore: '#FFD700',
  seedCrystal: '#FF5555',
  building: 'transparent' // Buildings should be transparent so background shows through
}

// Image paths for tile types
export const TILE_IMAGES = {
  land: {
    // Use programmatic discovery for grass tiles
    useGrassTileDiscovery: true
  },
  water: {
    animated: true
  },
  rock: {
    paths: ['images/map/rock_on_grass01', 'images/map/rock01', 'images/map/rock02', 'images/map/rock03', 'images/map/rock04', 'images/map/rock05']
  },
  street: {
    paths: ['images/map/street01']
  },
  ore: {
    paths: ['images/map/ore01', 'images/map/ore02', 'images/map/ore03', 'images/map/ore04']
  },
  seedCrystal: {
    paths: ['images/map/ore1_red']
  }
}

// Sprite sheet and mapping for map tiles
export const TILE_SPRITE_SHEET = 'images/map/map_sprites.webp'
export const TILE_SPRITE_MAP = 'images/map/map_sprites.json'

// Enable/disable texture usage (for performance testing/fallback)
export const USE_TEXTURES = true

// Enable/disable tank image-based rendering (T key to toggle during gameplay)
export const USE_TANK_IMAGES = true

// Grass tile ratio configuration (higher numbers = rarer)
// 1 out of X tiles will be decorative/impassable
export const GRASS_DECORATIVE_RATIO = 33  // 1 in x tiles will be decorative
export const GRASS_IMPASSABLE_RATIO = 50  // 1 in x tiles will be impassable

export const INERTIA_DECAY = 0.983  // Increased from 0.95 to make inertia 3x longer
export let INERTIA_STOP_THRESHOLD = 1  // Velocity magnitude below this stops inertia entirely

export function setInertiaStopThreshold(value) {
  INERTIA_STOP_THRESHOLD = value
}
// Wreck impact physics tuning (bullet/explosion impacts)
export const WRECK_IMPACT_FORCE_MULTIPLIER = 0.02 // Scales how far wrecks are tossed per point of damage
export const WRECK_INERTIA_DECAY = 0.92 // Controls how quickly tossed wrecks slow down

// Collision bounce tuning (unit vs unit)
export const COLLISION_BOUNCE_REMOTE_BOOST = 1.5 // Extra impulse when player is actively remote-controlling
export const COLLISION_BOUNCE_SPEED_FACTOR = 0.8 // Contribution of speed to impulse
export const COLLISION_BOUNCE_OVERLAP_FACTOR = 0.2 // Contribution of overlap to impulse
export const COLLISION_BOUNCE_MIN = 0.3 // Clamp min impulse
export const COLLISION_BOUNCE_MAX = 2.2 // Clamp max impulse
export const COLLISION_RECOIL_FACTOR_FAST = 0.35 // Portion of impulse applied as recoil to the faster unit
export const COLLISION_RECOIL_MAX_FAST = 0.8 // Max recoil magnitude for faster unit
export const COLLISION_RECOIL_PUSH_OTHER_FACTOR = 0.25 // Portion of impulse nudging the faster unit when the slower bounces (for separation)
export const COLLISION_RECOIL_PUSH_OTHER_MAX = 0.6 // Max of that nudge
export const COLLISION_SEPARATION_SCALE = 0.6 // How much to separate positions based on overlap
export const COLLISION_SEPARATION_MAX = 4 // Max separation distance
export const COLLISION_SEPARATION_MIN = 0.5 // Min separation distance
export const COLLISION_NORMAL_DAMPING_MULT = 1.1 // How strongly to damp velocity along collision normal
export const COLLISION_NORMAL_DAMPING_MAX = 1.2 // Max damping amount

// Collision damage and avoidance for airborne units
export const AIR_COLLISION_AVOID_RADIUS = 60 // Radius (in pixels) for airborne traffic avoidance sampling
export const AIR_COLLISION_AVOID_FORCE = 0.35 // Strength of avoidance steering for airborne units
export const AIR_COLLISION_AVOID_MAX_NEIGHBORS = 6 // Maximum nearby airborne neighbors considered for avoidance
export const AIR_COLLISION_TIME_HORIZON = 0.9 // Seconds ahead to project when steering airborne traffic apart

// Collision bounce tuning (unit vs static obstacles)
export let STATIC_COLLISION_BOUNCE_MULT = 0.75 // Velocity contribution when bouncing off static obstacles

export function setStaticCollisionBounceMult(value) {
  STATIC_COLLISION_BOUNCE_MULT = value
}

export let STATIC_COLLISION_BOUNCE_OVERLAP = 0.1 // Overlap contribution when bouncing off static obstacles

export function setStaticCollisionBounceOverlap(value) {
  STATIC_COLLISION_BOUNCE_OVERLAP = value
}

export let STATIC_COLLISION_BOUNCE_MIN = 0.1 // Minimum bounce impulse against static obstacles

export function setStaticCollisionBounceMin(value) {
  STATIC_COLLISION_BOUNCE_MIN = value
}

export let STATIC_COLLISION_BOUNCE_MAX = 2 // Maximum bounce impulse against static obstacles

export function setStaticCollisionBounceMax(value) {
  STATIC_COLLISION_BOUNCE_MAX = value
}

// Collision bounce tuning (unit vs wreck)
export const WRECK_COLLISION_REMOTE_BOOST = 1.1 // Stronger boost when remote-controlling
export const WRECK_COLLISION_SPEED_FACTOR = 0.75
export const WRECK_COLLISION_OVERLAP_FACTOR = 0.1
export const WRECK_COLLISION_MIN = 0.4
export const WRECK_COLLISION_MAX = 2.5
export const WRECK_COLLISION_RECOIL_FACTOR_UNIT = 0.25 // Recoil applied to unit when wreck is slower
export const WRECK_COLLISION_RECOIL_MAX_UNIT = 0.6
// Scroll speed when using arrow keys (pixels per frame)
export let KEYBOARD_SCROLL_SPEED = 8

export function setKeyboardScrollSpeed(value) {
  KEYBOARD_SCROLL_SPEED = value
}

// Desktop edge auto-scroll speed (pixels per millisecond)
export let DESKTOP_EDGE_AUTOSCROLL_SPEED = 0.3

export function setDesktopEdgeAutoscrollSpeed(value) {
  DESKTOP_EDGE_AUTOSCROLL_SPEED = value
}

// Desktop edge auto-scroll enabled toggle
export let DESKTOP_EDGE_AUTOSCROLL_ENABLED = false

export function setDesktopEdgeAutoscrollEnabled(value) {
  DESKTOP_EDGE_AUTOSCROLL_ENABLED = Boolean(value)
}

// Long-press duration to show production tooltips (in milliseconds)
export let LONG_PRESS_MS = 250

export function setLongPressMs(value) {
  LONG_PRESS_MS = value
}

// Increase tank range by 50% (for example, from 6 to 9 tiles)
export let TANK_FIRE_RANGE = 9

// Apache helicopters should maintain a slightly closer standoff distance than
// their original configuration. Apply a shared reduction factor so both
// autonomous and remote-controlled logic can stay in sync when calculating
// their maximum engagement range.
export const APACHE_RANGE_REDUCTION = 2 / 3

export function setTankFireRange(value) {
  const previous = TANK_FIRE_RANGE
  TANK_FIRE_RANGE = value
  if (SERVICE_DISCOVERY_RANGE === previous) {
    SERVICE_DISCOVERY_RANGE = value
  }
}

// Service vehicle detection range when in alert mode (defaults to tank fire range)
export let SERVICE_DISCOVERY_RANGE = TANK_FIRE_RANGE

export function setServiceDiscoveryRange(value) {
  SERVICE_DISCOVERY_RANGE = value
}

// Effective service range for utility vehicles (defaults to close support distance)
export let SERVICE_SERVING_RANGE = Math.SQRT2

export function setServiceServingRange(value) {
  SERVICE_SERVING_RANGE = value
}

// Maximum allowed empty tile gap between connected buildings (Chebyshev distance)
export const MAX_BUILDING_GAP_TILES = 3
// Backwards-compatible export for systems that still consume the old name
export const BUILDING_PROXIMITY_RANGE = MAX_BUILDING_GAP_TILES

// Shadow of War configuration
export const SHADOW_OF_WAR_CONFIG = {
  tilePadding: 0.5,
  rocketRangeMultiplier: 1.5,
  defaultNonCombatRange: 2,
  harvesterRange: 5,
  initialBaseDiscoveryRadius: 10,
  baseVisibilityBorder: 4
}

// Tank constants
export let DEFAULT_ROTATION_SPEED = 0.05 // Radians per frame

export function setDefaultRotationSpeed(value) {
  DEFAULT_ROTATION_SPEED = value
}

export let FAST_ROTATION_SPEED = 0.1 // Radians per frame

export function setFastRotationSpeed(value) {
  FAST_ROTATION_SPEED = value
}

export let TANK_BULLET_SPEED = 8 // Radians per frame

export function setTankBulletSpeed(value) {
  TANK_BULLET_SPEED = value
}

// Hit zone damage multipliers for tanks
export const HIT_ZONE_DAMAGE_MULTIPLIERS = {
  FRONT: 1.0,   // Normal damage from front
  SIDE: 1.25,    // 30% more damage from sides
  REAR: 1.5     // 100% more damage from behind (critical hit)
}

// Critical damage sound cooldown (30 seconds)
export const CRITICAL_DAMAGE_SOUND_COOLDOWN = 30000

// Separate rotation rates for tank components
export let TANK_WAGON_ROT = 0.05 // Radians per frame for tank body/wagon movement

export function setTankWagonRot(value) {
  TANK_WAGON_ROT = value
}

// Reduced turret rotation speed to make artillery tracking more deliberate
// 70% slower than before (was 0.08)
export let TANK_TURRET_ROT = 0.024 // Radians per frame for turret aiming

export function setTankTurretRot(value) {
  TANK_TURRET_ROT = value
}

// Aiming precision threshold (in radians) - turret must be within this angle to fire
export let TURRET_AIMING_THRESHOLD = 0.1 // About 5.7 degrees

export function setTurretAimingThreshold(value) {
  TURRET_AIMING_THRESHOLD = value
}

// Recoil and muzzle flash animation constants
export const RECOIL_DISTANCE = 8 // pixels to move back during recoil
export const RECOIL_DURATION = 300 // milliseconds
export const MUZZLE_FLASH_DURATION = 150 // milliseconds
export const MUZZLE_FLASH_SIZE = 12 // radius of muzzle flash
export const TURRET_RECOIL_DISTANCE = 6 // pixels for building turrets
export const SMOKE_PARTICLE_LIFETIME = 4500 // milliseconds (increased for longer-lasting building smoke)
export const SMOKE_EMIT_INTERVAL = 320 // milliseconds between puffs for unit fumes (throttled for performance)
export const SMOKE_PARTICLE_SIZE = 8 // radius of smoke particles (reduced from 12)
export const UNIT_SMOKE_SOFT_CAP_RATIO = 0.6 // stop emitting unit fumes once 60% of the smoke budget is reached
export let MAX_SMOKE_PARTICLES = 300 // Upper limit to keep smoke rendering performant (reduced from 600 for GPU optimization)

export function setMaxSmokeParticles(value) {
  MAX_SMOKE_PARTICLES = value
}

// Duration of the building sell animation (in milliseconds)
export const BUILDING_SELL_DURATION = 3000

// Wind effects for smoke particles
export const WIND_DIRECTION = { x: 0.3, y: -0.1 } // Slight eastward and upward wind
export const WIND_STRENGTH = 0.008 // How much wind affects particle movement

export let ORE_SPREAD_INTERVAL = 30000  // 30 seconds (3x faster than before)

export function setOreSpreadInterval(value) {
  ORE_SPREAD_INTERVAL = value
}

export let ORE_SPREAD_PROBABILITY = 0.06

export function setOreSpreadProbability(value) {
  ORE_SPREAD_PROBABILITY = value
}

// Toggle ore spreading to improve performance when disabled
export let ORE_SPREAD_ENABLED = true

export function setOreSpreadEnabled(value) {
  ORE_SPREAD_ENABLED = value
}

// New: Path recalculation interval (in milliseconds)
export let PATH_CALC_INTERVAL = 2000

export function setPathCalcInterval(value) {
  PATH_CALC_INTERVAL = value
}

// Path cache TTL - set longer than calc interval to maximize cache hits
export let PATH_CACHE_TTL = 4000

export function setPathCacheTtl(value) {
  PATH_CACHE_TTL = value
}

// Maximum concurrent path calculations per pathfinding update cycle
// Limits CPU spike by spreading pathfinding work across multiple frames
export let MAX_PATHS_PER_CYCLE = 5

export function setMaxPathsPerCycle(value) {
  MAX_PATHS_PER_CYCLE = value
}

// AI update frame skip - run AI every N frames instead of every frame
// Value of 3 means AI runs on frames 0, 3, 6, 9... (~20 FPS AI at 60 FPS game)
export let AI_UPDATE_FRAME_SKIP = 3

export function setAiUpdateFrameSkip(value) {
  AI_UPDATE_FRAME_SKIP = value
}

// Attack/chase pathfinding interval - throttled to prevent excessive recalculation (in milliseconds)
export let ATTACK_PATH_CALC_INTERVAL = 3000

export function setAttackPathCalcInterval(value) {
  ATTACK_PATH_CALC_INTERVAL = value
}

// Moving target path check interval - how often to check if path needs recalculation for moving targets (ms)
// Only recalculate if distance to target is increasing (unit going wrong direction)
export let MOVING_TARGET_CHECK_INTERVAL = 5000

export function setMovingTargetCheckInterval(value) {
  MOVING_TARGET_CHECK_INTERVAL = value
}

// Target movement threshold - minimum distance target must move to trigger path recalculation (in tiles)
export const TARGET_MOVEMENT_THRESHOLD = 2

// General AI decision interval for heavy logic like target selection (in milliseconds)
export let AI_DECISION_INTERVAL = 5000  // Reduced from 200ms to 5s to prevent wiggling

export function setAiDecisionInterval(value) {
  AI_DECISION_INTERVAL = value
}

// View frustum culling margin - extra buffer around viewport to prevent pop-in (in pixels)
// Set to TILE_SIZE * 2 to account for large units and buildings
export const VIEW_FRUSTUM_MARGIN = TILE_SIZE * 2

// Recovery tank ratio: 1 recovery tank per X combat units
export let RECOVERY_TANK_RATIO = 5

export function setRecoveryTankRatio(value) {
  RECOVERY_TANK_RATIO = value
}

// Smoke emission for buildings
export const BUILDING_SMOKE_EMIT_INTERVAL = 800 // ms between puffs (reduced for more visible smoke)

// Distance threshold for using occupancy map in pathfinding (in tiles)
export let PATHFINDING_THRESHOLD = 10

export function setPathfindingThreshold(value) {
  PATHFINDING_THRESHOLD = value
}

// How close a unit needs to be (in tiles) to consider a move target reached
export let MOVE_TARGET_REACHED_THRESHOLD = 1.5

export function setMoveTargetReachedThreshold(value) {
  MOVE_TARGET_REACHED_THRESHOLD = value
}

// Unit stuck detection and productivity check intervals (in milliseconds)
export let STUCK_CHECK_INTERVAL = 500  // Check every 0.5 seconds for stuck units

export function setStuckCheckInterval(value) {
  STUCK_CHECK_INTERVAL = value
}

export const HARVESTER_PRODUCTIVITY_CHECK_INTERVAL = 500  // Check harvester productivity every 0.5 seconds
export let STUCK_THRESHOLD = 500  // Consider units stuck after 0.5 seconds

export function setStuckThreshold(value) {
  STUCK_THRESHOLD = value
}

export let STUCK_HANDLING_COOLDOWN = 1250  // Cooldown between stuck handling attempts

export function setStuckHandlingCooldown(value) {
  STUCK_HANDLING_COOLDOWN = value
}

export let DODGE_ATTEMPT_COOLDOWN = 500  // Cooldown between dodge attempts

export function setDodgeAttemptCooldown(value) {
  DODGE_ATTEMPT_COOLDOWN = value
}

// Street movement and pathfinding modifiers
export let STREET_SPEED_MULTIPLIER = 1.5  // Units move 50% faster on streets

export function setStreetSpeedMultiplier(value) {
  STREET_SPEED_MULTIPLIER = value
}

export const STREET_PATH_COST = 1 / STREET_SPEED_MULTIPLIER  // Prefer streets in pathfinding

// Unit costs
export let HOWITZER_COST = 2500

export function setHowitzerCost(value) {
  HOWITZER_COST = value
  UNIT_COSTS.howitzer = value
}

export const UNIT_COSTS = {
  tank: 1000,
  tank_v1: 1000, // Alias for tank (used by AI)
  rocketTank: 2000,
  harvester: 1500,
  'tank-v2': 2000,
  'tank-v3': 3000,
  ambulance: 500,
  tankerTruck: 300,
  ammunitionTruck: 800,
  recoveryTank: 3000,
  apache: 3000,
  f22: 5000,
  howitzer: HOWITZER_COST,
  mineLayer: 1000,
  mineSweeper: 1000
}

// Unit properties
export const UNIT_PROPERTIES = {
  // Base properties
  base: {
    health: 100,
    maxHealth: 100,
    speed: 0.25,  // 50% slower: 0.5 * 0.5 = 0.25
    rotationSpeed: TANK_WAGON_ROT,
    turretRotationSpeed: TANK_TURRET_ROT
  },
  // Harvester properties
  harvester: {
    health: 150,
    maxHealth: 150,
    speed: 0.4,  // 50% slower: 0.8 * 0.5 = 0.4
    rotationSpeed: 0.2,
    armor: 3
  },
  // Tank properties
  tank_v1: {
    health: 100,
    maxHealth: 100,
    speed: 0.33,  // 50% slower: 0.66 * 0.5 = 0.33
    rotationSpeed: TANK_WAGON_ROT,
    turretRotationSpeed: TANK_TURRET_ROT
  },
  // Tank V2 properties
  'tank-v2': {
    health: 150,
    maxHealth: 150,
    speed: 0.3,  // 50% slower: 0.6 * 0.5 = 0.3
    rotationSpeed: TANK_WAGON_ROT,
    turretRotationSpeed: TANK_TURRET_ROT,
    alertMode: true
  },
  // Tank V3 properties
  'tank-v3': {
    health: 200,
    maxHealth: 200,
    speed: 0.25,  // 50% slower: 0.5 * 0.5 = 0.25
    rotationSpeed: TANK_WAGON_ROT,
    turretRotationSpeed: TANK_TURRET_ROT * 1.5, // 50% faster turret rotation for better tracking
    alertMode: true
  },
  // Rocket tank properties
  rocketTank: {
    health: 100,
    maxHealth: 100,
    speed: 0.35,  // 50% slower: 0.7 * 0.5 = 0.35
    rotationSpeed: TANK_WAGON_ROT,
    turretRotationSpeed: TANK_TURRET_ROT
  },
  recoveryTank: {
    health: 150,
    maxHealth: 150,
    speed: 0.525, // 50% faster than rocket tank when unloaded
    loadedSpeed: 0.33, // Same as tank speed when towing
    rotationSpeed: TANK_WAGON_ROT,
    turretRotationSpeed: TANK_TURRET_ROT,
    armor: 3
  },
  ambulance: {
    health: 25,
    maxHealth: 25,
    speed: 0.175, // 65% slower than previous base (0.5 -> 0.175) for reduced mobility
    streetSpeedMultiplier: 4.0,
    rotationSpeed: TANK_WAGON_ROT,
    turretRotationSpeed: 0,
    maxMedics: 10,
    medics: 10 // Initial crew capacity
  },
  tankerTruck: {
    health: 20,
    maxHealth: 20,
    speed: 0.66,
    rotationSpeed: TANK_WAGON_ROT,
    turretRotationSpeed: 0
  },
  ammunitionTruck: {
    health: 30,
    maxHealth: 30,
    speed: 0.66, // 2x tank speed (tank_v1 is 0.33)
    rotationSpeed: TANK_WAGON_ROT,
    turretRotationSpeed: 0
  },
  apache: {
    health: 40,
    maxHealth: 40,
    speed: 5.0625, // 25% slower than previous value (6.75 -> 5.0625)
    rotationSpeed: 0.18,
    turretRotationSpeed: 0,
    accelerationMultiplier: 1.25
  },
  f22: {
    health: 60,
    maxHealth: 60,
    speed: 9.0,
    rotationSpeed: 0.22,
    turretRotationSpeed: 0,
    accelerationMultiplier: 1.5
  },
  howitzer: {
    health: 160,
    maxHealth: 160,
    speed: 0.22,
    rotationSpeed: 0.04,
    turretRotationSpeed: 0.04,
    accelerationMultiplier: 0.75,
    armor: 2
  },
  mineLayer: {
    health: 30,
    maxHealth: 30,
    speed: 0.528, // 80% of tanker truck speed (0.66 * 0.8)
    deploySpeed: 0.264, // 40% of tanker truck speed (0.66 * 0.4)
    rotationSpeed: 0.04,
    turretRotationSpeed: 0,
    mineCapacity: 20
  },
  mineSweeper: {
    health: 200,
    maxHealth: 200,
    speed: 0.231, // 70% of tank_v1 speed (0.33 * 0.7)
    sweepingSpeed: 0.099, // 30% of tank_v1 speed (0.33 * 0.3)
    rotationSpeed: TANK_WAGON_ROT,
    turretRotationSpeed: 0,
    armor: 6 // 2x tank armor (tank_v1 has no explicit armor, so using base of 3 * 2)
  }
}

export let HOWITZER_SPEED = UNIT_PROPERTIES.howitzer.speed

export function setHowitzerSpeed(value) {
  HOWITZER_SPEED = value
  UNIT_PROPERTIES.howitzer.speed = value
}

export let HOWITZER_ROTATION_SPEED = UNIT_PROPERTIES.howitzer.rotationSpeed

export function setHowitzerRotationSpeed(value) {
  HOWITZER_ROTATION_SPEED = value
  UNIT_PROPERTIES.howitzer.rotationSpeed = value
  UNIT_PROPERTIES.howitzer.turretRotationSpeed = value
}

export let HOWITZER_ACCELERATION_MULTIPLIER = UNIT_PROPERTIES.howitzer.accelerationMultiplier

export function setHowitzerAccelerationMultiplier(value) {
  HOWITZER_ACCELERATION_MULTIPLIER = value
  UNIT_PROPERTIES.howitzer.accelerationMultiplier = value
}

export let HOWITZER_FIRE_RANGE = 30

export function setHowitzerFireRange(value) {
  HOWITZER_FIRE_RANGE = value
}

export let HOWITZER_MIN_RANGE = 6

export function setHowitzerMinRange(value) {
  HOWITZER_MIN_RANGE = value
}

export let HOWITZER_FIREPOWER = 60

export function setHowitzerFirepower(value) {
  HOWITZER_FIREPOWER = value
}

export let HOWITZER_FIRE_COOLDOWN = 6000

export function setHowitzerFireCooldown(value) {
  HOWITZER_FIRE_COOLDOWN = value
}

export let HOWITZER_PROJECTILE_SPEED = 0.85

export function setHowitzerProjectileSpeed(value) {
  HOWITZER_PROJECTILE_SPEED = value
}

export const HOWITZER_EXPLOSION_RADIUS_TILES = 3

export let HOWITZER_VISION_RANGE = 18

export function setHowitzerVisionRange(value) {
  HOWITZER_VISION_RANGE = value
}

export let HOWITZER_BUILDING_DAMAGE_MULTIPLIER = 2

export function setHowitzerBuildingDamageMultiplier(value) {
  HOWITZER_BUILDING_DAMAGE_MULTIPLIER = value
}

// Tank V3 burst fire configuration
export const TANK_V3_BURST = {
  COUNT: 2,     // Number of bullets per burst
  DELAY: 300    // Delay between bullets in milliseconds
}

// Pathfinding constants
export const PATHFINDING_LIMIT = 1000

// Movement directions for pathfinding and position search
export const DIRECTIONS = [
  { x: 0, y: -1 },  // north
  { x: 1, y: 0 },   // east
  { x: 0, y: 1 },   // south
  { x: -1, y: 0 },  // west
  { x: 1, y: -1 },  // northeast
  { x: 1, y: 1 },   // southeast
  { x: -1, y: 1 },  // southwest
  { x: -1, y: -1 }  // northwest
]

// Maximum search distance for spawn positions
export const MAX_SPAWN_SEARCH_DISTANCE = 10

export const BULLET_DAMAGES = {
  tank_v1: 20,
  tank_v2: 24,
  tank_v3: 30,
  rocketTank: 120
}

// Attack Group Feature (AGF) constants
export const ATTACK_TARGET_INDICATOR_SIZE = 8 // Size of the red triangle indicator above targeted units
export const ATTACK_TARGET_BOUNCE_SPEED = 0.003 // Speed of bouncing animation for target indicators

// Movement target indicator constants
export const MOVE_TARGET_INDICATOR_SIZE = 8 // Size of the green triangle indicator for movement targets
export const MOVE_TARGET_BOUNCE_SPEED = 0.003 // Speed of bouncing animation for movement target indicators

export const UTILITY_SERVICE_INDICATOR_SIZE = 8
export const UTILITY_SERVICE_INDICATOR_BOUNCE_SPEED = 0.003

// Unit type colors (same for all players/enemies of same type)
export const UNIT_TYPE_COLORS = {
  tank: '#0000FF',        // Blue
  tank_v1: '#0000FF',     // Blue
  'tank-v2': '#FFFFFF',   // White
  'tank-v3': '#32CD32',   // Lime green
  harvester: '#9400D3',   // Purple
  rocketTank: '#800000',
  ambulance: '#00FFFF',   // Dark red
  tankerTruck: '#FFA500',
  recoveryTank: '#FFD700', // Gold
  howitzer: '#D2691E',    // Chocolate
  apache: '#556B2F',       // Dark olive green
  f22: '#4A4A6A',          // Stealth grey-blue
  mineLayer: '#A0522D',    // Sienna (brownish)
  mineSweeper: '#4682B4'   // Steel blue
}

// Party/owner colors for indicators (4 distinct colors for multiplayer)
export const PARTY_COLORS = {
  player1: '#00FF00',     // Green (Human player by default)
  player2: '#FF0000',     // Red
  player3: '#0080FF',     // Blue
  player4: '#FFFF00',     // Yellow
  // Legacy aliases for backwards compatibility
  player: '#00FF00',      // Green
  enemy: '#FF0000'        // Red
}

export const MULTIPLAYER_PARTY_IDS = ['player1', 'player2', 'player3', 'player4']
export const MAX_MULTIPLAYER_PARTIES = MULTIPLAYER_PARTY_IDS.length
export const INVITE_TOKEN_TTL_MS = 10 * 60 * 1000 // 10 minute invite validity

// Player position constants for 4-corner setup
export const PLAYER_POSITIONS = {
  player1: { x: 0.1, y: 0.9 },   // Bottom-left (current player position)
  player2: { x: 0.9, y: 0.1 },   // Top-right (current enemy position)
  player3: { x: 0.1, y: 0.1 },   // Top-left
  player4: { x: 0.9, y: 0.9 }    // Bottom-right
}

// Default number of players
export const DEFAULT_PLAYER_COUNT = 2

// Gas system configuration
export let GAS_REFILL_TIME = 7000 // ms to fully refill at station

export function setGasRefillTime(value) {
  GAS_REFILL_TIME = value
}

export let GAS_REFILL_COST = 50

export function setGasRefillCost(value) {
  GAS_REFILL_COST = value
}

export let HELIPAD_FUEL_CAPACITY = 15600

export function setHelipadFuelCapacity(value) {
  HELIPAD_FUEL_CAPACITY = value
}

export let HELIPAD_RELOAD_TIME = 8000 // ms to fully reload helipad reserve

export function setHelipadReloadTime(value) {
  HELIPAD_RELOAD_TIME = value
}

// Ammunition system configuration
export let AMMO_RESUPPLY_TIME = 7000 // ms to fully resupply ammunition at factory or by truck

export function setAmmoResupplyTime(value) {
  AMMO_RESUPPLY_TIME = value
}

export let AMMO_FACTORY_RANGE = 2 // tiles for ammunition factory resupply range

export function setAmmoFactoryRange(value) {
  AMMO_FACTORY_RANGE = value
}

export let AMMO_TRUCK_RANGE = 1.5 // tiles for ammunition supply truck resupply range (50% increase)

export function setAmmoTruckRange(value) {
  AMMO_TRUCK_RANGE = value
}

export let AMMO_TRUCK_CARGO = 500 // rounds capacity for ammunition supply truck

export function setAmmoTruckCargo(value) {
  AMMO_TRUCK_CARGO = value
}

export let HELIPAD_AMMO_RESERVE = 250 // rounds capacity for helipad ammunition storage (50% of truck cargo)

export function setHelipadAmmoReserve(value) {
  HELIPAD_AMMO_RESERVE = value
}

export let AMMO_FACTORY_PARTICLE_COUNT = 40 // average number of particles on factory explosion

export function setAmmoFactoryParticleCount(value) {
  AMMO_FACTORY_PARTICLE_COUNT = value
}

// Mine system constants
export let MINE_CAPACITY = 20 // Mine Layer payload capacity
export let MINE_HEALTH = 10 // Health points of deployed mine
export let MINE_DAMAGE_CENTER = 90 // Maximum damage at the mine tile
export let MINE_EXPLOSION_RADIUS = 2 // Tile radius over which damage falls off
export let MINE_DEPLOY_STOP_TIME = 4000 // ms Mine Layer must stop to deploy
export let MINE_ARM_DELAY = 4000 // ms delay after truck vacates before mine arms
export let MINE_TRIGGER_RADIUS = TILE_SIZE * 0.45 // Unit center must fall within this circle to trip a mine

export function setMineCapacity(value) {
  MINE_CAPACITY = value
}

export function setMineHealth(value) {
  MINE_HEALTH = value
}

export function setMineDamageCenter(value) {
  MINE_DAMAGE_CENTER = value
}

export function setMineDeployStopTime(value) {
  MINE_DEPLOY_STOP_TIME = value
}

export function setMineArmDelay(value) {
  MINE_ARM_DELAY = value
}

export function setMineExplosionRadius(value) {
  MINE_EXPLOSION_RADIUS = value
}

export function setMineTriggerRadius(value) {
  MINE_TRIGGER_RADIUS = value
}

export let AMMO_PARTICLE_DAMAGE = 40 // average damage per ammunition particle

export function setAmmoParticleDamage(value) {
  AMMO_PARTICLE_DAMAGE = value
}

// Unit ammunition capacities
export const UNIT_AMMO_CAPACITY = {
  tank_v1: 42,
  'tank-v2': 42,
  'tank-v3': 50,
  rocketTank: 24,
  howitzer: 30,
  apache: 38,
  f22: 6
}

const REMOTE_CONTROL_ALLOWED_ACTIONS = [
  'forward',
  'backward',
  'turnLeft',
  'turnRight',
  'turretLeft',
  'turretRight',
  'fire',
  'ascend',
  'descend',
  'strafeLeft',
  'strafeRight'
]

const TURRET_TANK_TYPES = new Set([
  'tank',
  'tank_v1',
  'tank_v2',
  'tank_v3',
  'tank-v2',
  'tank-v3',
  'rocketTank'
])

const DEFAULT_TANK_JOYSTICK_MAPPING = {
  left: {
    up: ['forward'],
    down: ['backward'],
    left: ['turretLeft'],
    right: ['turretRight'],
    tap: []
  },
  right: {
    up: [],
    down: [],
    left: ['turnLeft'],
    right: ['turnRight'],
    tap: ['fire']
  }
}

const DEFAULT_VEHICLE_JOYSTICK_MAPPING = {
  left: {
    up: ['forward'],
    down: ['backward'],
    left: [],
    right: [],
    tap: []
  },
  right: {
    up: [],
    down: [],
    left: ['turnLeft'],
    right: ['turnRight'],
    tap: []
  }
}

const DEFAULT_APACHE_JOYSTICK_MAPPING = {
  left: {
    up: ['ascend'],
    down: ['descend'],
    left: ['strafeLeft'],
    right: ['strafeRight'],
    tap: ['fire']
  },
  right: {
    up: [],
    down: [],
    left: [],
    right: [],
    tap: ['fire']
  }
}

function cloneJoystickMapping(mapping) {
  return JSON.parse(JSON.stringify(mapping))
}

function normalizeActionList(value) {
  if (value === null || value === undefined) {
    return []
  }

  let actions
  if (Array.isArray(value)) {
    actions = value
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed.toLowerCase() === 'none') {
      return []
    }
    actions = trimmed.split(',').map(item => item.trim()).filter(Boolean)
  } else {
    throw new Error('Joystick mapping values must be strings or arrays of actions')
  }

  const uniqueActions = []
  for (const action of actions) {
    const normalized = String(action).trim()
    if (!normalized) {
      continue
    }
    if (!REMOTE_CONTROL_ALLOWED_ACTIONS.includes(normalized)) {
      throw new Error(`Unsupported joystick action: ${normalized}`)
    }
    if (!uniqueActions.includes(normalized)) {
      uniqueActions.push(normalized)
    }
  }
  return uniqueActions
}

function normalizeJoystickMapping(mapping, fallback) {
  if (!mapping || typeof mapping !== 'object') {
    throw new Error('Joystick mapping must be an object')
  }

  const normalized = { left: {}, right: {} }
  const sides = ['left', 'right']
  const directions = ['up', 'down', 'left', 'right', 'tap']

  for (const side of sides) {
    const inputSide = mapping[side] && typeof mapping[side] === 'object' ? mapping[side] : {}
    const fallbackSide = fallback[side] || {}
    normalized[side] = {}

    for (const direction of directions) {
      const rawValue =
        inputSide[direction] !== undefined ? inputSide[direction] : fallbackSide[direction]
      normalized[side][direction] = normalizeActionList(rawValue)
    }
  }

  return normalized
}

function parseJoystickMappingInput(value, fallback) {
  let mapping = value
  if (typeof mapping === 'string') {
    const trimmed = mapping.trim()
    mapping = trimmed ? JSON.parse(trimmed) : {}
  }

  return normalizeJoystickMapping(mapping, fallback)
}

export let MOBILE_TANK_JOYSTICK_MAPPING = cloneJoystickMapping(DEFAULT_TANK_JOYSTICK_MAPPING)
export let MOBILE_VEHICLE_JOYSTICK_MAPPING = cloneJoystickMapping(DEFAULT_VEHICLE_JOYSTICK_MAPPING)
export let MOBILE_APACHE_JOYSTICK_MAPPING = cloneJoystickMapping(DEFAULT_APACHE_JOYSTICK_MAPPING)

export function setMobileTankJoystickMapping(value) {
  MOBILE_TANK_JOYSTICK_MAPPING = parseJoystickMappingInput(value, DEFAULT_TANK_JOYSTICK_MAPPING)
}

export function setMobileVehicleJoystickMapping(value) {
  MOBILE_VEHICLE_JOYSTICK_MAPPING = parseJoystickMappingInput(value, DEFAULT_VEHICLE_JOYSTICK_MAPPING)
}

export function setMobileApacheJoystickMapping(value) {
  MOBILE_APACHE_JOYSTICK_MAPPING = parseJoystickMappingInput(value, DEFAULT_APACHE_JOYSTICK_MAPPING)
}

export function getMobileTankJoystickMapping() {
  return MOBILE_TANK_JOYSTICK_MAPPING
}

export function getMobileVehicleJoystickMapping() {
  return MOBILE_VEHICLE_JOYSTICK_MAPPING
}

export function getMobileJoystickMapping(profile) {
  if (profile === 'tank') {
    return MOBILE_TANK_JOYSTICK_MAPPING
  }
  if (profile === 'apache') {
    return MOBILE_APACHE_JOYSTICK_MAPPING
  }
  return MOBILE_VEHICLE_JOYSTICK_MAPPING
}

export function getMobileApacheJoystickMapping() {
  return MOBILE_APACHE_JOYSTICK_MAPPING
}

export function isTurretTankUnitType(unitType) {
  return TURRET_TANK_TYPES.has(unitType)
}

export const UNIT_GAS_PROPERTIES = {
  tank_v1: { tankSize: 1900, consumption: 450 },
  'tank-v2': { tankSize: 1900, consumption: 450 },
  'tank-v3': { tankSize: 1900, consumption: 450 },
  rocketTank: { tankSize: 1900, consumption: 450 },
  // Recovery tanks consume the same fuel as standard tanks
  recoveryTank: { tankSize: 1900, consumption: 450 },
  howitzer: { tankSize: 1900, consumption: 450 },
  harvester: { tankSize: 2650, consumption: 30, harvestConsumption: 100 },
  ambulance: { tankSize: 75, consumption: 25 },
  tankerTruck: { tankSize: 700, consumption: 150 },
  apache: { tankSize: 5200, consumption: 120 },
  f22: { tankSize: 4000, consumption: 100 },
  mineLayer: { tankSize: 700, consumption: 150 },
  mineSweeper: { tankSize: 1900, consumption: 450 }
}

const EXPORTED_CONFIG_VARIABLES = [
  'XP_MULTIPLIER',
  'TILE_SIZE',
  'MIN_MAP_TILES',
  'DEFAULT_MAP_TILES_X',
  'DEFAULT_MAP_TILES_Y',
  'MAP_TILES_X',
  'MAP_TILES_Y',
  'TILE_LENGTH_METERS',
  'CURSOR_METERS_PER_TILE',
  'SAFE_RANGE_ENABLED',
  'CREW_KILL_CHANCE',
  'ENABLE_ENEMY_SELECTION',
  'ENABLE_ENEMY_CONTROL',
  'MASTER_VOLUME',
  'TARGETING_SPREAD',
  'HARVESTER_CAPPACITY',
  'HARVESTER_UNLOAD_TIME',
  'TANKER_SUPPLY_CAPACITY',
  'TILE_COLORS',
  'TILE_IMAGES',
  'TILE_SPRITE_SHEET',
  'TILE_SPRITE_MAP',
  'USE_TEXTURES',
  'USE_TANK_IMAGES',
  'GRASS_DECORATIVE_RATIO',
  'GRASS_IMPASSABLE_RATIO',
  'INERTIA_DECAY',
  'INERTIA_STOP_THRESHOLD',
  'WRECK_IMPACT_FORCE_MULTIPLIER',
  'WRECK_INERTIA_DECAY',
  'COLLISION_BOUNCE_REMOTE_BOOST',
  'COLLISION_BOUNCE_SPEED_FACTOR',
  'COLLISION_BOUNCE_OVERLAP_FACTOR',
  'COLLISION_BOUNCE_MIN',
  'COLLISION_BOUNCE_MAX',
  'COLLISION_RECOIL_FACTOR_FAST',
  'COLLISION_RECOIL_MAX_FAST',
  'COLLISION_RECOIL_PUSH_OTHER_FACTOR',
  'COLLISION_RECOIL_PUSH_OTHER_MAX',
  'COLLISION_SEPARATION_SCALE',
  'COLLISION_SEPARATION_MAX',
  'COLLISION_SEPARATION_MIN',
  'COLLISION_NORMAL_DAMPING_MULT',
  'COLLISION_NORMAL_DAMPING_MAX',
  'AIR_COLLISION_AVOID_RADIUS',
  'AIR_COLLISION_AVOID_FORCE',
  'AIR_COLLISION_AVOID_MAX_NEIGHBORS',
  'AIR_COLLISION_TIME_HORIZON',
  'STATIC_COLLISION_BOUNCE_MULT',
  'STATIC_COLLISION_BOUNCE_OVERLAP',
  'STATIC_COLLISION_BOUNCE_MIN',
  'STATIC_COLLISION_BOUNCE_MAX',
  'WRECK_COLLISION_REMOTE_BOOST',
  'WRECK_COLLISION_SPEED_FACTOR',
  'WRECK_COLLISION_OVERLAP_FACTOR',
  'WRECK_COLLISION_MIN',
  'WRECK_COLLISION_MAX',
  'WRECK_COLLISION_RECOIL_FACTOR_UNIT',
  'WRECK_COLLISION_RECOIL_MAX_UNIT',
  'KEYBOARD_SCROLL_SPEED',
  'LONG_PRESS_MS',
  'TANK_FIRE_RANGE',
  'SERVICE_DISCOVERY_RANGE',
  'SERVICE_SERVING_RANGE',
  'MAX_BUILDING_GAP_TILES',
  'BUILDING_PROXIMITY_RANGE',
  'SHADOW_OF_WAR_CONFIG',
  'DEFAULT_ROTATION_SPEED',
  'FAST_ROTATION_SPEED',
  'TANK_BULLET_SPEED',
  'HIT_ZONE_DAMAGE_MULTIPLIERS',
  'CRITICAL_DAMAGE_SOUND_COOLDOWN',
  'TANK_WAGON_ROT',
  'TANK_TURRET_ROT',
  'TURRET_AIMING_THRESHOLD',
  'RECOIL_DISTANCE',
  'RECOIL_DURATION',
  'MUZZLE_FLASH_DURATION',
  'MUZZLE_FLASH_SIZE',
  'TURRET_RECOIL_DISTANCE',
  'SMOKE_PARTICLE_LIFETIME',
  'SMOKE_EMIT_INTERVAL',
  'SMOKE_PARTICLE_SIZE',
  'UNIT_SMOKE_SOFT_CAP_RATIO',
  'MAX_SMOKE_PARTICLES',
  'BUILDING_SELL_DURATION',
  'WIND_DIRECTION',
  'WIND_STRENGTH',
  'ORE_SPREAD_INTERVAL',
  'ORE_SPREAD_PROBABILITY',
  'ORE_SPREAD_ENABLED',
  'PATH_CALC_INTERVAL',
  'ATTACK_PATH_CALC_INTERVAL',
  'AI_DECISION_INTERVAL',
  'RECOVERY_TANK_RATIO',
  'BUILDING_SMOKE_EMIT_INTERVAL',
  'PATHFINDING_THRESHOLD',
  'MOVE_TARGET_REACHED_THRESHOLD',
  'STUCK_CHECK_INTERVAL',
  'HARVESTER_PRODUCTIVITY_CHECK_INTERVAL',
  'STUCK_THRESHOLD',
  'STUCK_HANDLING_COOLDOWN',
  'DODGE_ATTEMPT_COOLDOWN',
  'STREET_SPEED_MULTIPLIER',
  'STREET_PATH_COST',
  'UNIT_COSTS',
  'UNIT_PROPERTIES',
  'TANK_V3_BURST',
  'PATHFINDING_LIMIT',
  'DIRECTIONS',
  'MAX_SPAWN_SEARCH_DISTANCE',
  'BULLET_DAMAGES',
  'ATTACK_TARGET_INDICATOR_SIZE',
  'ATTACK_TARGET_BOUNCE_SPEED',
  'MOVE_TARGET_INDICATOR_SIZE',
  'MOVE_TARGET_BOUNCE_SPEED',
  'UNIT_TYPE_COLORS',
  'PARTY_COLORS',
  'PLAYER_POSITIONS',
  'DEFAULT_PLAYER_COUNT',
  'GAS_REFILL_TIME',
  'GAS_REFILL_COST',
  'HELIPAD_FUEL_CAPACITY',
  'HELIPAD_RELOAD_TIME',
  'UNIT_GAS_PROPERTIES',
  'AMMO_RESUPPLY_TIME',
  'AMMO_FACTORY_RANGE',
  'AMMO_TRUCK_RANGE',
  'AMMO_TRUCK_CARGO',
  'HELIPAD_AMMO_RESERVE',
  'AMMO_FACTORY_PARTICLE_COUNT',
  'AMMO_PARTICLE_DAMAGE',
  'UNIT_AMMO_CAPACITY'
  ,'HOWITZER_COST'
  ,'HOWITZER_SPEED'
  ,'HOWITZER_ROTATION_SPEED'
  ,'HOWITZER_ACCELERATION_MULTIPLIER'
  ,'HOWITZER_FIRE_RANGE'
  ,'HOWITZER_MIN_RANGE'
  ,'HOWITZER_FIREPOWER'
  ,'HOWITZER_FIRE_COOLDOWN'
  ,'HOWITZER_PROJECTILE_SPEED'
  ,'HOWITZER_EXPLOSION_RADIUS_TILES'
  ,'HOWITZER_VISION_RANGE'
]

// The old eval-based config system has been removed because it cannot work in production
// builds where variable names get minified. Use configRegistry.js instead, which uses
// direct function references that work correctly with minification.

export const CONFIG_VARIABLE_NAMES = [...EXPORTED_CONFIG_VARIABLES]
