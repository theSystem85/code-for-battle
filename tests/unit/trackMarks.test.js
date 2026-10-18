import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/storage/indexedDbStorage.js', () => ({
  getStoredItem: vi.fn(() => null),
  setStoredItem: vi.fn()
}))

import {
  TrackMarkStore,
  TRACK_SURFACE,
  TRACK_KIND,
  TRACK_MARK_EVICT_BATCH,
  TRACK_FADE_OUT_MS,
  TRACK_CHUNK_PX,
  emitTrackMarksForUnit,
  getTileTrackSurface,
  isTrackedUnitType,
  getTrackMarkAlpha,
  trackMarkSettings,
  trackMarkStore,
  updateTrackMarks,
  setTrackMarksEnabled,
  resetTrackMarksForTests
} from '../../src/game/trackMarks.js'
import { TILE_SIZE } from '../../src/config.js'

function makeGrid(w, h, fill) {
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => fill(x, y)))
}

function addSegment(store, x, birth) {
  return store.add(TRACK_KIND.segment, x, 10, x + 4, 10, 0, 0, TRACK_SURFACE.grass, birth, 8, 4)
}

describe('TrackMarkStore ring buffer', () => {
  it('[U04476] evicts the oldest batch when full and keeps chunk counts consistent', () => {
    const store = new TrackMarkStore(1024)
    store.configureMap(64, 8)
    for (let i = 0; i < 1024; i++) addSegment(store, (i % 2000) + 0.5, i)
    expect(store.count).toBe(1024)
    addSegment(store, 5, 5000)
    expect(store.count).toBe(1024 - TRACK_MARK_EVICT_BATCH + 1)
    // Oldest remaining birth is exactly the first non-evicted one
    expect(store.birth[store.slotAt(0)]).toBe(TRACK_MARK_EVICT_BATCH)
    const total = store.chunkCounts.reduce((a, b) => a + b, 0)
    expect(total).toBe(store.count)
    expect(store.chunkDirty[0]).toBe(1)
  })

  it('[U04477] rejects marks off the map or without a trackable surface', () => {
    const store = new TrackMarkStore(16)
    store.configureMap(8, 8)
    expect(store.add(TRACK_KIND.segment, -50, -50, -40, -40, 0, 0, TRACK_SURFACE.grass, 0, 8, 4)).toBe(-1)
    expect(store.add(TRACK_KIND.segment, 5, 5, 9, 5, 0, 0, TRACK_SURFACE.none, 0, 8, 4)).toBe(-1)
    expect(store.count).toBe(0)
  })
})

describe('fading and memory release', () => {
  beforeEach(() => {
    trackMarkSettings.fade = true
    trackMarkSettings.fadeDelayS = 10
  })

  it('[U04478] computes alpha from the delay and removes fully faded marks', () => {
    expect(getTrackMarkAlpha(5000)).toBe(1)
    expect(getTrackMarkAlpha(10000 + TRACK_FADE_OUT_MS / 2)).toBeCloseTo(0.5)
    const store = new TrackMarkStore(64)
    store.configureMap(64, 8)
    addSegment(store, 10, 0)
    addSegment(store, TRACK_CHUNK_PX + 10, 1000)
    const listener = { onRemoved: vi.fn() }
    store.listener = listener
    expect(store.expire(10000 + TRACK_FADE_OUT_MS - 1)).toBe(0)
    expect(store.expire(10000 + TRACK_FADE_OUT_MS)).toBe(1)
    expect(store.count).toBe(1)
    expect(store.chunkCounts[0]).toBe(0) // empty chunk => renderer frees its canvas
    expect(store.chunkCounts[1]).toBe(1)
    expect(listener.onRemoved).toHaveBeenCalled()
    store.expire(20000 + TRACK_FADE_OUT_MS)
    expect(store.count).toBe(0)
  })

  it('[U04479] never expires when fading is off', () => {
    trackMarkSettings.fade = false
    const store = new TrackMarkStore(8)
    store.configureMap(8, 8)
    addSegment(store, 10, 0)
    expect(store.expire(1e9)).toBe(0)
    expect(store.count).toBe(1)
    expect(getTrackMarkAlpha(1e9)).toBe(1)
  })
})

describe('surface detection', () => {
  it('[U04480] maps tiles to surfaces and identifies tracked units', () => {
    expect(getTileTrackSurface({ type: 'land', biome: 'sand' })).toBe(TRACK_SURFACE.sand)
    expect(getTileTrackSurface({ type: 'land', biome: 'snow' })).toBe(TRACK_SURFACE.snow)
    expect(getTileTrackSurface({ type: 'land' })).toBe(TRACK_SURFACE.grass)
    expect(getTileTrackSurface({ type: 'street' })).toBe(TRACK_SURFACE.street)
    expect(getTileTrackSurface({ type: 'water' })).toBe(TRACK_SURFACE.none)
    expect(getTileTrackSurface({ type: 'rock' })).toBe(TRACK_SURFACE.none)
    expect(isTrackedUnitType('tank-v3')).toBe(true)
    expect(isTrackedUnitType('howitzer')).toBe(true)
    expect(isTrackedUnitType('tankerTruck')).toBe(false)
    expect(isTrackedUnitType('ambulance')).toBe(false)
  })
})

describe('emission', () => {
  beforeEach(() => {
    trackMarkSettings.fade = false
    trackMarkSettings.enabled = true
  })

  function drive(unit, grid, store, dx, steps, startTime = 0) {
    let t = startTime
    for (let i = 0; i < steps; i++) {
      unit.x += dx
      t += 16
      emitTrackMarksForUnit(unit, grid, t, store)
    }
    return t
  }

  it('[U04481] merges collinear movement into few segments and follows turns', () => {
    const grid = makeGrid(40, 4, () => ({ type: 'land', biome: 'grass' }))
    const store = new TrackMarkStore(256)
    store.configureMap(40, 4)
    const unit = { type: 'tank_v1', x: 0, y: 32, direction: 0, health: 100 }
    emitTrackMarksForUnit(unit, grid, 0, store)
    drive(unit, grid, store, 1, 200) // 200 px straight, emitted per frame would be 200
    expect(store.count).toBeGreaterThan(4)
    expect(store.count).toBeLessThan(200 / 6)
    const before = store.count
    // Curve: heading changes every step => one segment per emit step
    for (let i = 0; i < 30; i++) {
      unit.direction += 0.05
      unit.x += Math.cos(unit.direction) * 2
      unit.y += Math.sin(unit.direction) * 2
      emitTrackMarksForUnit(unit, grid, 4000 + i * 16, store)
    }
    expect(store.count - before).toBeGreaterThanOrEqual(6)
  })

  it('[U04482] emits scuff arcs when pivoting in place', () => {
    const grid = makeGrid(8, 8, () => ({ type: 'land', biome: 'snow' }))
    const store = new TrackMarkStore(64)
    store.configureMap(8, 8)
    const unit = { type: 'tank-v2', x: 64, y: 64, direction: 0, health: 100 }
    emitTrackMarksForUnit(unit, grid, 0, store)
    for (let i = 1; i <= 10; i++) {
      unit.direction = i * 0.1
      emitTrackMarksForUnit(unit, grid, i * 16, store)
    }
    expect(store.count).toBeGreaterThanOrEqual(4)
    expect(store.kind[store.slotAt(0)]).toBe(TRACK_KIND.pivot)
    expect(store.surface[store.slotAt(0)]).toBe(TRACK_SURFACE.snow)
  })

  it('[U04483] draws only a short decaying ramp mark on streets', () => {
    // x < 10 tiles: sand, then street
    const grid = makeGrid(40, 4, x => (x < 10 ? { type: 'land', biome: 'sand' } : { type: 'street' }))
    const store = new TrackMarkStore(512)
    store.configureMap(40, 4)
    const unit = { type: 'rocketTank', x: 5 * TILE_SIZE, y: 32, direction: 0, health: 100 }
    emitTrackMarksForUnit(unit, grid, 0, store)
    drive(unit, grid, store, 1, TILE_SIZE * 25)
    let streetMarks = 0
    let maxStreetX = 0
    let lastStrength = 2
    for (let i = 0; i < store.count; i++) {
      const slot = store.slotAt(i)
      if (store.surface[slot] !== TRACK_SURFACE.street) continue
      streetMarks++
      maxStreetX = Math.max(maxStreetX, store.x1[slot])
      expect(store.strength[slot]).toBeLessThanOrEqual(lastStrength)
      lastStrength = store.strength[slot]
    }
    expect(streetMarks).toBeGreaterThan(0)
    // carry-over ends within ~3 tiles of the ramp (street starts at tile 10)
    expect(maxStreetX).toBeLessThan(TILE_SIZE * 14)
  })

  it('[U04484] skips wheeled units and clears everything when disabled', () => {
    resetTrackMarksForTests()
    const grid = makeGrid(16, 4, () => ({ type: 'land', biome: 'grass' }))
    const tank = { type: 'tank_v1', x: 0, y: 32, direction: 0, health: 100 }
    const truck = { type: 'tankerTruck', x: 0, y: 64, direction: 0, health: 100 }
    for (let i = 0; i < 100; i++) {
      tank.x += 2
      truck.x += 2
      updateTrackMarks([tank, truck], grid, i * 16)
    }
    const count = trackMarkStore.count
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < trackMarkStore.count; i++) {
      expect(trackMarkStore.y0[trackMarkStore.slotAt(i)]).toBeLessThan(64)
    }
    setTrackMarksEnabled(false)
    expect(trackMarkStore.count).toBe(0)
    expect(trackMarkStore.chunkCounts.every(c => c === 0)).toBe(true)
    setTrackMarksEnabled(true)
  })
})
