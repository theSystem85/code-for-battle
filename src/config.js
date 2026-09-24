import { getStoredItem, initializeGameStorage, removeStoredItem, setStoredItem } from './storage/indexedDbStorage.js'

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
    saveOverridesToIndexedDb()
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
      await initializeGameStorage()
      await loadOverridesFromFile()
      loadOverridesFromIndexedDb()
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

function saveOverridesToIndexedDb() {
  try {
    if (activeOverrides.size === 0) {
      removeStoredItem(CONFIG_OVERRIDE_STORAGE_KEY)
      return
    }

    setStoredItem(
      CONFIG_OVERRIDE_STORAGE_KEY,
      JSON.stringify(getConfigOverrides())
    )
  } catch (err) {
    window.logger.warn('Failed to persist config overrides to IndexedDB:', err)
  }
}

function loadOverridesFromIndexedDb() {
  let raw
  try {
    raw = getStoredItem(CONFIG_OVERRIDE_STORAGE_KEY)
  } catch (err) {
    window.logger.warn('Failed to read config overrides from IndexedDB:', err)
    return
  }

  if (!raw) {
    return
  }

  try {
    const parsed = JSON.parse(raw)
    applyOverridesFromObject(parsed)
  } catch (err) {
    window.logger.warn('Failed to parse config overrides from IndexedDB:', err)
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
export const DEFAULT_MAP_TILES_X = 200
export const DEFAULT_MAP_TILES_Y = 200
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

// Harvester XP uses full-unload equivalents so each star takes 10 full unloads.
export const HARVESTER_XP_FULL_UNLOADS_PER_STAR = 10

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

const GRAPHICS_SETTINGS_STORAGE_KEY = 'rts_graphics_settings'

function clampNumber(value, min, max, fallback) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  return Math.min(max, Math.max(min, numericValue))
}

function saveGraphicsSettingsToIndexedDb() {
  try {
    setStoredItem(
      GRAPHICS_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        useProceduralWaterRendering: USE_PROCEDURAL_WATER_RENDERING,
        waterEffectTone: WATER_EFFECT_TONE,
        waterEffectSaturation: WATER_EFFECT_SATURATION,
        mobileCanvasPixelRatioCap: MOBILE_CANVAS_PIXEL_RATIO_CAP,
        rendererBackend: RENDERER_BACKEND
      })
    )
  } catch (error) {
    window.logger?.warn('Failed to persist graphics settings to IndexedDB:', error)
  }
}

function requestGraphicsSettingsRender() {
  if (typeof window === 'undefined') {
    return
  }

  window.gameInstance?.gameLoop?.requestRender?.()
}

export function loadGraphicsSettingsFromIndexedDb() {
  try {
    const stored = getStoredItem(GRAPHICS_SETTINGS_STORAGE_KEY)
    if (!stored) {
      return
    }

    const parsed = JSON.parse(stored)
    if (typeof parsed?.useProceduralWaterRendering === 'boolean') {
      USE_PROCEDURAL_WATER_RENDERING = parsed.useProceduralWaterRendering
    }

    WATER_EFFECT_TONE = clampNumber(parsed?.waterEffectTone, -1, 1, WATER_EFFECT_TONE)
    WATER_EFFECT_SATURATION = clampNumber(parsed?.waterEffectSaturation, 0, 2, WATER_EFFECT_SATURATION)
    MOBILE_CANVAS_PIXEL_RATIO_CAP = clampNumber(parsed?.mobileCanvasPixelRatioCap, 1, 3, MOBILE_CANVAS_PIXEL_RATIO_CAP)
    RENDERER_BACKEND = parsed?.rendererBackend === 'webgl' ? 'webgl' : 'webgpu'
  } catch (error) {
    window.logger?.warn('Failed to load graphics settings from IndexedDB:', error)
  }
}

export let USE_PROCEDURAL_WATER_RENDERING = true

export function setUseProceduralWaterRendering(value) {
  USE_PROCEDURAL_WATER_RENDERING = Boolean(value)
  saveGraphicsSettingsToIndexedDb()
  requestGraphicsSettingsRender()
  return USE_PROCEDURAL_WATER_RENDERING
}

export let MOBILE_CANVAS_PIXEL_RATIO_CAP = 1

export function setMobileCanvasPixelRatioCap(value) {
  MOBILE_CANVAS_PIXEL_RATIO_CAP = clampNumber(value, 1, 3, MOBILE_CANVAS_PIXEL_RATIO_CAP)
  saveGraphicsSettingsToIndexedDb()
  if (typeof window !== 'undefined') {
    window.gameInstance?.canvasManager?.resetAdaptivePixelRatioCap?.()
  }
  requestGraphicsSettingsRender()
  return MOBILE_CANVAS_PIXEL_RATIO_CAP
}

export let RENDERER_BACKEND = 'webgpu'

export function setRendererBackend(value) {
  RENDERER_BACKEND = value === 'webgpu' ? 'webgpu' : 'webgl'
  saveGraphicsSettingsToIndexedDb()
  requestGraphicsSettingsRender()
  return RENDERER_BACKEND
}

// Water tone controls the palette blend from cooler blue toward greener teal.
export let WATER_EFFECT_TONE = 0.35

export function setWaterEffectTone(value) {
  WATER_EFFECT_TONE = clampNumber(value, -1, 1, WATER_EFFECT_TONE)
  saveGraphicsSettingsToIndexedDb()
  requestGraphicsSettingsRender()
  return WATER_EFFECT_TONE
}

// Water saturation multiplier for procedural rendering.
export let WATER_EFFECT_SATURATION = 0.4

export function setWaterEffectSaturation(value) {
  WATER_EFFECT_SATURATION = clampNumber(value, 0, 2, WATER_EFFECT_SATURATION)
  saveGraphicsSettingsToIndexedDb()
  requestGraphicsSettingsRender()
  return WATER_EFFECT_SATURATION
}

// Procedural water world zoom. Higher values zoom the animated pattern farther out.
export let WATER_EFFECT_ZOOM = 0.2

export function setWaterEffectZoom(value) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return WATER_EFFECT_ZOOM
  }

  WATER_EFFECT_ZOOM = numericValue
  requestGraphicsSettingsRender()
  return WATER_EFFECT_ZOOM
}

loadGraphicsSettingsFromIndexedDb()

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
  DESKTOP_EDGE_AUTOSCROLL_ENABLED = value
}
