// trackMarks.js
// Purely visual ground track marks for tracked (tank-like) units.
//
// Marks live in one fixed-capacity FIFO ring buffer backed by typed arrays, so
// emitting a mark never allocates. Emission is distance based (not per frame),
// collinear movement is merged into one longer segment, and pivots in place
// produce short "scuff" arc records. Nothing here touches shared RNG, gameState
// or savegames: marks are client-local decoration and are wiped whenever the
// map is replaced (restart, new map, load, multiplayer map sync). The shared
// mapGrid array is refilled in place on those paths, so array identity alone
// cannot detect them; the map lifecycle listener below does.

import { TILE_SIZE } from '../config.js'
import { getStoredItem, setStoredItem } from '../storage/indexedDbStorage.js'
import { addMapReplacedListener } from '../rendering/prepared/mapMutationNotifier.js'

// Hard cap of stored segments. At 37 bytes per slot this is ~0.6 MB of typed
// arrays; baked chunk canvases are bounded separately by the renderer.
export const TRACK_MARK_CAPACITY = 16384
// When the ring is full the oldest marks are evicted in one batch so that only
// a handful of chunks need rebaking instead of one per emitted segment.
export const TRACK_MARK_EVICT_BATCH = 256
export const TRACK_CHUNK_TILES = 8
export const TRACK_CHUNK_PX = TRACK_CHUNK_TILES * TILE_SIZE

export const TRACK_EMIT_STEP_PX = 6
export const TRACK_MAX_SEGMENT_PX = 28
export const TRACK_MERGE_ANGLE_EPS = 0.035
export const TRACK_PIVOT_MIN_ANGLE = 0.2
export const TRACK_FADE_OUT_MS = 8000
// Dirt carried onto a street after leaving off-road ground (ramp marks).
export const TRACK_RAMP_CARRY_PX = TILE_SIZE * 2.5
export const DEFAULT_TRACK_FADE_DELAY_S = 60

export const TRACK_SURFACE = Object.freeze({
  none: 0,
  grass: 1,
  soil: 2,
  sand: 3,
  snow: 4,
  street: 5 // dirt carried onto the road at ramps
})
export const TRACK_KIND = Object.freeze({ segment: 0, pivot: 1 })

// Types with tracks rather than wheels. Trucks, ambulances and the jeep-like
// support vehicles are wheeled and excluded.
export const TRACKED_UNIT_TYPES = new Set([
  'tank', 'tank_v1', 'tank-v2', 'tank-v3', 'lightTank', 'tank_v2', 'tank_v3',
  'rocketTank', 'howitzer', 'recoveryTank', 'harvester', 'mineLayer', 'mineSweeper'
])

// Half the distance between the two tread centre lines, and tread width (px).
const TRACK_GEOMETRY = {
  harvester: [TILE_SIZE * 0.32, TILE_SIZE * 0.16],
  howitzer: [TILE_SIZE * 0.3, TILE_SIZE * 0.14]
}
const DEFAULT_GEOMETRY = [TILE_SIZE * 0.27, TILE_SIZE * 0.13]

export function getTrackGeometry(type) {
  return TRACK_GEOMETRY[type] || DEFAULT_GEOMETRY
}

export function isTrackedUnitType(type) {
  return TRACKED_UNIT_TYPES.has(type)
}

export function getTileTrackSurface(tile) {
  if (!tile) return TRACK_SURFACE.none
  if (tile.type === 'street') return TRACK_SURFACE.street
  if (tile.type !== 'land') return TRACK_SURFACE.none
  switch (tile.biome) {
    case 'sand': return TRACK_SURFACE.sand
    case 'snow': return TRACK_SURFACE.snow
    case 'soil': return TRACK_SURFACE.soil
    default: return TRACK_SURFACE.grass
  }
}

// ---------------------------------------------------------------------------
// Settings (persisted like the other graphics settings)
const KEY_ENABLED = 'rts_track_marks_enabled'
const KEY_FADE = 'rts_track_marks_fade'
const KEY_FADE_DELAY = 'rts_track_marks_fade_delay'

export const trackMarkSettings = {
  enabled: true,
  fade: false,
  fadeDelayS: DEFAULT_TRACK_FADE_DELAY_S
}

export function loadTrackMarkSettings() {
  try {
    const enabled = getStoredItem(KEY_ENABLED)
    if (enabled !== null) trackMarkSettings.enabled = enabled !== 'false'
    const fade = getStoredItem(KEY_FADE)
    if (fade !== null) trackMarkSettings.fade = fade === 'true'
    const delay = Number(getStoredItem(KEY_FADE_DELAY))
    if (Number.isFinite(delay) && delay >= 5) trackMarkSettings.fadeDelayS = Math.min(600, delay)
  } catch (error) {
    window.logger?.warn?.('Failed to load track mark settings:', error)
  }
  return trackMarkSettings
}

function persist(key, value) {
  try { setStoredItem(key, String(value)) } catch (error) { window.logger?.warn?.('Failed to save track mark setting:', error) }
}

export function setTrackMarksEnabled(enabled) {
  trackMarkSettings.enabled = Boolean(enabled)
  persist(KEY_ENABLED, trackMarkSettings.enabled)
  if (!trackMarkSettings.enabled) trackMarkStore.clear()
}

export function setTrackMarksFade(enabled) {
  trackMarkSettings.fade = Boolean(enabled)
  persist(KEY_FADE, trackMarkSettings.fade)
  trackMarkStore.markAllDirty()
}

export function setTrackMarksFadeDelay(seconds) {
  const value = Math.max(5, Math.min(600, Number(seconds) || DEFAULT_TRACK_FADE_DELAY_S))
  trackMarkSettings.fadeDelayS = value
  persist(KEY_FADE_DELAY, value)
  trackMarkStore.markAllDirty()
}

export function getTrackFadeTotalMs(settings = trackMarkSettings) {
  return settings.fadeDelayS * 1000 + TRACK_FADE_OUT_MS
}

/** Alpha multiplier (0..1) of a mark of the given age. */
export function getTrackMarkAlpha(ageMs, settings = trackMarkSettings) {
  if (!settings.fade) return 1
  const delayMs = settings.fadeDelayS * 1000
  if (ageMs <= delayMs) return 1
  return Math.max(0, 1 - (ageMs - delayMs) / TRACK_FADE_OUT_MS)
}

// ---------------------------------------------------------------------------
// Ring buffer store

export class TrackMarkStore {
  constructor(capacity = TRACK_MARK_CAPACITY) {
    this.capacity = capacity
    this.x0 = new Float32Array(capacity)
    this.y0 = new Float32Array(capacity)
    this.x1 = new Float32Array(capacity)
    this.y1 = new Float32Array(capacity)
    this.a0 = new Float32Array(capacity)
    this.a1 = new Float32Array(capacity)
    this.birth = new Float64Array(capacity)
    this.halfGauge = new Float32Array(capacity)
    this.width = new Float32Array(capacity)
    this.strength = new Float32Array(capacity)
    this.surface = new Uint8Array(capacity)
    this.kind = new Uint8Array(capacity)
    this.chunk = new Int32Array(capacity)
    this.head = 0 // next write slot
    this.count = 0
    this.chunksX = 0
    this.chunksY = 0
    this.chunkCounts = new Int32Array(0)
    this.chunkDirty = new Uint8Array(0)
    this.chunkAppend = [] // per chunk: slots emitted since last bake (renderer appends them)
    this.version = 0
    this.listener = null
  }

  static bytesPerSlot() {
    return 4 * 9 + 8 + 4 + 1 + 1 // floats + birth + chunk + surface + kind
  }

  arrayBytes() {
    return this.capacity * TrackMarkStore.bytesPerSlot() + this.chunkCounts.byteLength + this.chunkDirty.byteLength
  }

  configureMap(widthTiles, heightTiles) {
    const cx = Math.max(1, Math.ceil(widthTiles / TRACK_CHUNK_TILES))
    const cy = Math.max(1, Math.ceil(heightTiles / TRACK_CHUNK_TILES))
    this.clear()
    if (cx === this.chunksX && cy === this.chunksY) return
    this.chunksX = cx
    this.chunksY = cy
    this.chunkCounts = new Int32Array(cx * cy)
    this.chunkDirty = new Uint8Array(cx * cy)
  }

  chunkIndexFor(x, y) {
    if (!this.chunksX) return -1
    const cx = Math.floor(x / TRACK_CHUNK_PX)
    const cy = Math.floor(y / TRACK_CHUNK_PX)
    if (cx < 0 || cy < 0 || cx >= this.chunksX || cy >= this.chunksY) return -1
    return cy * this.chunksX + cx
  }

  tailIndex() {
    return (this.head - this.count + this.capacity) % this.capacity
  }

  /** Slot index of the i-th oldest mark (0 = oldest). */
  slotAt(i) {
    return (this.head - this.count + i + this.capacity) % this.capacity
  }

  removeOldest(n) {
    const remove = Math.min(n, this.count)
    for (let i = 0; i < remove; i++) {
      const slot = this.tailIndex()
      const chunk = this.chunk[slot]
      if (chunk >= 0) {
        this.chunkCounts[chunk]--
        this.chunkDirty[chunk] = 1
      }
      this.chunk[slot] = -1
      this.count--
    }
    if (remove > 0) {
      this.version++
      this.listener?.onRemoved?.(this)
    }
    return remove
  }

  add(kind, x0, y0, x1, y1, a0, a1, surface, birth, halfGauge, width, strength = 1) {
    const chunk = this.chunkIndexFor((x0 + x1) * 0.5, (y0 + y1) * 0.5)
    if (chunk < 0 || surface === TRACK_SURFACE.none) return -1
    if (this.count >= this.capacity) this.removeOldest(Math.min(TRACK_MARK_EVICT_BATCH, this.capacity))
    const slot = this.head
    this.x0[slot] = x0
    this.y0[slot] = y0
    this.x1[slot] = x1
    this.y1[slot] = y1
    this.a0[slot] = a0
    this.a1[slot] = a1
    this.birth[slot] = birth
    this.halfGauge[slot] = halfGauge
    this.width[slot] = width
    this.strength[slot] = strength
    this.surface[slot] = surface
    this.kind[slot] = kind
    this.chunk[slot] = chunk
    this.head = (this.head + 1) % this.capacity
    this.count++
    this.chunkCounts[chunk]++
    this.version++
    this.listener?.onAdded?.(this, slot, chunk)
    return slot
  }

  /** Remove marks that are fully faded. Ring order == birth order. */
  expire(now, settings = trackMarkSettings) {
    if (!settings.fade || this.count === 0) return 0
    const lifetime = getTrackFadeTotalMs(settings)
    let n = 0
    while (n < this.count && now - this.birth[this.slotAt(n)] >= lifetime) n++
    return n > 0 ? this.removeOldest(n) : 0
  }

  markAllDirty() {
    this.chunkDirty.fill(1)
    this.version++
    this.listener?.onRemoved?.(this)
  }

  clear() {
    this.head = 0
    this.count = 0
    this.chunk.fill(-1)
    this.chunkCounts.fill(0)
    this.chunkDirty.fill(0)
    this.version++
    this.listener?.onCleared?.(this)
  }
}

export const trackMarkStore = new TrackMarkStore()

// ---------------------------------------------------------------------------
// Emission

let unitTrackState = new WeakMap()
let boundMapGrid = null

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function surfaceAt(mapGrid, x, y) {
  const tx = Math.floor(x / TILE_SIZE)
  const ty = Math.floor(y / TILE_SIZE)
  return getTileTrackSurface(mapGrid[ty]?.[tx])
}

function isGrounded(unit) {
  return !unit.isAirUnit && !unit.isNaval && unit.flightState !== 'airborne' && unit.health > 0
}

/**
 * Feed one unit's current pose into the emitter. Exported for tests.
 * Returns the number of records emitted.
 */
export function emitTrackMarksForUnit(unit, mapGrid, now, store = trackMarkStore) {
  const cx = unit.x + TILE_SIZE / 2
  const cy = unit.y + TILE_SIZE / 2
  const heading = Number.isFinite(unit.direction) ? unit.direction : 0
  let state = unitTrackState.get(unit)
  if (!state) {
    state = { sx: cx, sy: cy, sa: heading, lx: cx, ly: cy, la: heading, pa: heading, surface: surfaceAt(mapGrid, cx, cy), carry: 0 }
    unitTrackState.set(unit, state)
    return 0
  }
  const [halfGauge, width] = getTrackGeometry(unit.type)
  const stepX = cx - state.lx
  const stepY = cy - state.ly
  const stepDist = Math.hypot(stepX, stepY)
  let emitted = 0

  // Teleports (respawn, load, network snap): restart without drawing a line.
  if (stepDist > TILE_SIZE * 2) {
    state.sx = state.lx = cx
    state.sy = state.ly = cy
    state.sa = state.la = state.pa = heading
    state.surface = surfaceAt(mapGrid, cx, cy)
    state.carry = 0
    return 0
  }

  // Pivot / turn in place: scuffed arcs around the centre.
  const pendingDist = Math.hypot(cx - state.sx, cy - state.sy)
  if (pendingDist < 1.5) {
    const turned = normalizeAngle(heading - state.pa)
    if (Math.abs(turned) >= TRACK_PIVOT_MIN_ANGLE) {
      const surface = surfaceAt(mapGrid, cx, cy)
      if (surface !== TRACK_SURFACE.street && surface !== TRACK_SURFACE.none) {
        if (store.add(TRACK_KIND.pivot, cx, cy, cx, cy, state.pa, state.pa + turned, surface, now, halfGauge, width) >= 0) emitted++
      }
      state.pa = heading
      state.sa = heading
    }
    state.lx = cx
    state.ly = cy
    state.la = heading
    return emitted
  }
  state.pa = heading

  if (stepDist < 0.01) return 0
  state.lx = cx
  state.ly = cy
  state.la = heading
  if (pendingDist < TRACK_EMIT_STEP_PX) return 0

  const angleDelta = Math.abs(normalizeAngle(heading - state.sa))
  const midSurface = surfaceAt(mapGrid, (cx + state.sx) * 0.5, (cy + state.sy) * 0.5)
  const surfaceChanged = midSurface !== state.surface
  const chunkChanged = store.chunkIndexFor(cx, cy) !== store.chunkIndexFor(state.sx, state.sy)
  if (angleDelta < TRACK_MERGE_ANGLE_EPS && pendingDist < TRACK_MAX_SEGMENT_PX && !surfaceChanged && !chunkChanged) {
    return 0 // keep extending the collinear pending segment
  }

  let surface = midSurface
  let strength = 1
  if (surface === TRACK_SURFACE.street) {
    // Ramp logic: dirt carried from off-road ground decays over a few tiles.
    if (state.carry > 0) {
      strength = Math.min(1, state.carry / TRACK_RAMP_CARRY_PX)
      state.carry = Math.max(0, state.carry - pendingDist)
    } else {
      surface = TRACK_SURFACE.none
    }
  } else if (surface !== TRACK_SURFACE.none) {
    state.carry = TRACK_RAMP_CARRY_PX
  } else {
    state.carry = 0
  }
  if (surface !== TRACK_SURFACE.none && strength > 0.02) {
    if (store.add(TRACK_KIND.segment, state.sx, state.sy, cx, cy, state.sa, heading, surface, now, halfGauge, width, strength) >= 0) emitted++
  }
  state.sx = cx
  state.sy = cy
  state.sa = heading
  state.surface = surfaceAt(mapGrid, cx, cy)
  return emitted
}

/** Called once per (unpaused) update tick with simulation time. */
export function updateTrackMarks(units, mapGrid, now) {
  if (!trackMarkSettings.enabled || !Array.isArray(mapGrid) || mapGrid.length === 0) return
  if (mapGrid !== boundMapGrid) {
    boundMapGrid = mapGrid
    trackMarkStore.configureMap(mapGrid[0]?.length || 0, mapGrid.length)
  }
  trackMarkStore.expire(now)
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]
    if (!unit || !TRACKED_UNIT_TYPES.has(unit.type) || !isGrounded(unit)) continue
    emitTrackMarksForUnit(unit, mapGrid, now)
  }
}

/**
 * Drop every stored mark and per-unit emitter state. Called on each whole-map
 * replacement so traces from a previous match never survive a restart.
 */
export function clearTrackMarks() {
  boundMapGrid = null
  unitTrackState = new WeakMap()
  trackMarkStore.clear()
}

addMapReplacedListener(clearTrackMarks)

export function resetTrackMarksForTests() {
  clearTrackMarks()
}
