import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/storage/indexedDbStorage.js', () => ({
  getStoredItem: vi.fn(() => null),
  setStoredItem: vi.fn()
}))

import {
  trackMarkStore,
  updateTrackMarks,
  resetTrackMarksForTests
} from '../../src/game/trackMarks.js'
import {
  beginMapMutationTransaction,
  commitMapMutationTransaction,
  resetMapMutationRevisionStore
} from '../../src/rendering/prepared/mapMutationNotifier.js'
import { clearTransientMapTraces } from '../../src/game/mapTraceReset.js'
import { setTileDecal } from '../../src/game/tileDecals.js'
import { TILE_SIZE } from '../../src/config.js'

function makeGrassGrid(w, h) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => ({ type: 'land', biome: 'grass' })))
}

function driveTank(mapGrid) {
  const tank = { type: 'tank_v1', x: TILE_SIZE, y: TILE_SIZE, direction: 0, health: 100 }
  let now = 0
  updateTrackMarks([tank], mapGrid, now)
  for (let i = 0; i < 40; i++) {
    tank.x += 4
    now += 16
    updateTrackMarks([tank], mapGrid, now)
  }
  return tank
}

// Mirrors how restart, new map and savegame load refill the shared mapGrid
// array in place (same identity) inside a replace transaction.
function replaceMapInPlace(mapGrid, w, h) {
  const transaction = beginMapMutationTransaction({ width: w, height: h }, { replace: true })
  try {
    mapGrid.length = 0
    makeGrassGrid(w, h).forEach((row, y) => { mapGrid[y] = row })
  } finally {
    commitMapMutationTransaction(transaction)
  }
}

describe('map traces on restart', () => {
  beforeEach(() => {
    resetMapMutationRevisionStore()
    resetTrackMarksForTests()
  })

  it('[U02720] clears track marks when the same mapGrid array is refilled for a new match', () => {
    const mapGrid = makeGrassGrid(16, 16)
    driveTank(mapGrid)
    expect(trackMarkStore.count).toBeGreaterThan(0)

    replaceMapInPlace(mapGrid, 16, 16)
    expect(trackMarkStore.count).toBe(0)
    expect(Array.from(trackMarkStore.chunkCounts).every(count => count === 0)).toBe(true)

    // Emission keeps working on the new map and does not bridge to old poses.
    const tank = driveTank(mapGrid)
    expect(trackMarkStore.count).toBeGreaterThan(0)
    for (let i = 0; i < trackMarkStore.count; i++) {
      const slot = trackMarkStore.slotAt(i)
      expect(trackMarkStore.x1[slot]).toBeLessThanOrEqual(tank.x + TILE_SIZE)
    }
  })

  it('[U02721] does not clear track marks for ordinary non-replacing map mutations', () => {
    const mapGrid = makeGrassGrid(16, 16)
    driveTank(mapGrid)
    const before = trackMarkStore.count
    setTileDecal(mapGrid, { mapSeed: 1 }, 2, 2, 'crater')
    expect(trackMarkStore.count).toBe(before)
  })

  it('[U02722] empties transient effect and mine lists, including the host explosion alias', () => {
    const hostExplosions = [{ x: 1, y: 1, startTime: 0, duration: 500 }]
    const state = {
      explosions: [{ x: 2, y: 2 }],
      smokeParticles: [{ x: 1 }],
      smokeParticlePool: [{ x: 2 }],
      dustParticles: [{ x: 3 }],
      mines: [{ tileX: 1, tileY: 1 }],
      waterMines: [{ tileX: 2, tileY: 2 }]
    }
    const explosionsRef = state.explosions
    clearTransientMapTraces(state, { explosionLists: [hostExplosions] })
    expect(hostExplosions).toHaveLength(0)
    expect(state.explosions).toBe(explosionsRef)
    expect(state.explosions).toHaveLength(0)
    expect(state.smokeParticles).toEqual([])
    expect(state.smokeParticlePool).toEqual([])
    expect(state.dustParticles).toEqual([])
    expect(state.mines).toEqual([])
    expect(state.waterMines).toEqual([])
  })
})
