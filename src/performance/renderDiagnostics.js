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
