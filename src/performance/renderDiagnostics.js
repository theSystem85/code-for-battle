export const RENDER_SPAN_IDS = Object.freeze({
  FRAME: 1,
  UPDATE: 2,
  RENDER: 3,
  TERRAIN: 4,
  WATER: 5,
  ENTITIES: 6,
  EFFECTS: 7,
  HUD: 8,
  MINIMAP: 9
})

export const RENDER_COUNTER_IDS = Object.freeze({
  DRAW_CALLS: 1,
  UPLOAD_BYTES: 2,
  RESIZE_EVENTS: 3,
  DECODED_SOURCE_BYTES: 4,
  PREPARED_RASTER_BYTES: 5,
  GPU_STAGING_BYTES: 6,
  RESIDENT_BYTES: 7,
  STAGING_BYTES: 8,
  EVICTIONS: 9,
  BACKLOG: 10
})

export const RENDER_BYTE_BUDGET_OWNERS = Object.freeze({
  TERRAIN: 'terrain-pages',
  SPRITES: 'prepared-sprites',
  WATER: 'water-topology',
  MINIMAP: 'minimap',
  EFFECTS: 'effects'
})

const COUNTER_ENTRIES = Object.freeze(Object.entries(RENDER_COUNTER_IDS))
const MAX_COUNTER_ID = Math.max(...Object.values(RENDER_COUNTER_IDS))

export function createRenderDiagnosticsSnapshot() {
  return {
    schemaVersion: 1,
    backend: 'unknown',
    devicePixelRatio: null,
    refreshRateHz: null,
    gpuTiming: { available: false, reason: 'not-measured', milliseconds: null },
    heap: { available: false, reason: 'not-measured', usedBytes: null },
    counters: Object.create(null),
    byteUsage: Object.fromEntries(Object.values(RENDER_BYTE_BUDGET_OWNERS).map(owner => [owner, 0]))
  }
}

export class RenderDiagnostics {
  constructor() {
    this.counterTotals = new Float64Array(MAX_COUNTER_ID + 1)
    this.backend = 'unknown'
    this.devicePixelRatio = null
    this.refreshRateHz = null
    this.gpuTiming = { available: false, reason: 'not-measured', milliseconds: null }
    this.byteUsage = Object.fromEntries(Object.values(RENDER_BYTE_BUDGET_OWNERS).map(owner => [owner, 0]))
  }

  addCounter(id, amount = 1) {
    if (!Number.isInteger(id) || id <= 0 || id > MAX_COUNTER_ID || !Number.isFinite(amount) || amount < 0) return false
    this.counterTotals[id] += amount
    return true
  }

  addCounters(counters = {}) {
    for (const [key, amount] of Object.entries(counters)) {
      const numericKey = Number(key)
      const id = Number.isInteger(numericKey) ? numericKey : RENDER_COUNTER_IDS[key]
      this.addCounter(id, amount)
    }
  }

  getCounterTotals() {
    return Object.fromEntries(COUNTER_ENTRIES.map(([name, id]) => [name, this.counterTotals[id]]))
  }

  getCounterDelta(baseline = {}) {
    return Object.fromEntries(COUNTER_ENTRIES.map(([name, id]) => [
      name,
      Math.max(0, this.counterTotals[id] - (Number(baseline[name]) || 0))
    ]))
  }

  setByteUsage(owner, bytes) {
    if (!Object.hasOwn(this.byteUsage, owner) || !Number.isFinite(bytes) || bytes < 0) return false
    this.byteUsage[owner] = bytes
    return true
  }

  setCapabilities({ backend, devicePixelRatio, refreshRateHz, gpuTiming } = {}) {
    if (typeof backend === 'string' && backend) this.backend = backend
    if (Number.isFinite(devicePixelRatio) && devicePixelRatio > 0) this.devicePixelRatio = devicePixelRatio
    if (Number.isFinite(refreshRateHz) && refreshRateHz > 0) this.refreshRateHz = refreshRateHz
    if (gpuTiming) {
      this.gpuTiming = gpuTiming.available === true && Number.isFinite(gpuTiming.milliseconds)
        ? { available: true, reason: null, milliseconds: gpuTiming.milliseconds }
        : { available: false, reason: gpuTiming.reason || 'unavailable', milliseconds: null }
    }
  }

  snapshot() {
    return {
      schemaVersion: 1,
      backend: this.backend,
      devicePixelRatio: this.devicePixelRatio,
      refreshRateHz: this.refreshRateHz,
      gpuTiming: { ...this.gpuTiming },
      heap: { available: false, reason: 'reported-by-performance-monitor', usedBytes: null },
      counters: this.getCounterTotals(),
      byteUsage: { ...this.byteUsage }
    }
  }

  resetForTests() {
    this.counterTotals.fill(0)
    this.backend = 'unknown'
    this.devicePixelRatio = null
    this.refreshRateHz = null
    this.gpuTiming = { available: false, reason: 'not-measured', milliseconds: null }
    for (const owner of Object.keys(this.byteUsage)) this.byteUsage[owner] = 0
  }
}

export const renderDiagnostics = new RenderDiagnostics()
