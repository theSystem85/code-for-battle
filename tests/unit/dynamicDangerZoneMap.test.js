import { describe, expect, it } from 'vitest'
import '../setup.js'
import {
  createDynamicDangerState,
  cycleDangerOverlay,
  dynamicDangerAt,
  refreshDynamicDangerMaps,
  updateDynamicDangerMap,
  DYNAMIC_DANGER_CELL
} from '../../src/game/dynamicDangerZoneMap.js'
import { STRATEGY_EVAL_INTERVAL_MS } from '../../src/ai/groundAssaultStrategy.js'

function tank(id, owner, tileX, tileY, extra = {}) {
  return {
    id,
    owner,
    type: 'tank_v1',
    health: 100,
    maxHealth: 100,
    tileX,
    tileY,
    ...extra
  }
}

function grid(width, height) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => ({ type: 'grass' })))
}

describe('dynamic danger map', () => {
  it('[U07113] stamps healthy mobile firepower and ignores a missing gunner', () => {
    const state = createDynamicDangerState(32, 32)
    const healthy = tank('healthy', 'player1', 8, 8)
    const crippled = tank('crippled', 'player1', 20, 8, {
      crew: { driver: true, commander: true, gunner: false, loader: true }
    })
    updateDynamicDangerMap(state, [healthy, crippled], 'player2')
    expect(dynamicDangerAt(state, 8, 8)).toBeGreaterThan(0)
    expect(dynamicDangerAt(state, 20, 8)).toBe(0)
    expect(dynamicDangerAt(state, 31, 31)).toBe(0)
  })

  it('[U07114] restamps only units that changed and skips a refresh inside the budget', () => {
    const mapGrid = grid(32, 24)
    const state = {
      playerCount: 2,
      humanPlayer: 'player1',
      buildings: []
    }
    const moving = tank('mover', 'player1', 4, 4)
    const first = refreshDynamicDangerMaps(state, [moving], mapGrid, 1000, 5)
    expect(first.ran).toBe(true)
    expect(state.dynamicDangerMaps.player2.restamps).toBe(1)
    const unchanged = updateDynamicDangerMap(state.dynamicDangerMaps.player2, [moving], 'player2')
    expect(unchanged.restamps).toBe(0)
    moving.tileX = 4 + DYNAMIC_DANGER_CELL
    const moved = updateDynamicDangerMap(state.dynamicDangerMaps.player2, [moving], 'player2')
    expect(moved.restamps).toBe(1)
    expect(dynamicDangerAt(state.dynamicDangerMaps.player2, moving.tileX, moving.tileY)).toBeGreaterThan(0)

    const skipped = refreshDynamicDangerMaps(state, [moving], mapGrid, 1000 + STRATEGY_EVAL_INTERVAL_MS - 1, 5)
    expect(skipped.ran).toBe(false)
    const noHeadroom = refreshDynamicDangerMaps(state, [moving], mapGrid, 1000 + STRATEGY_EVAL_INTERVAL_MS * 2, 0)
    expect(noHeadroom.ran).toBe(false)
    expect(state.dynamicDangerRevision).toBe(1)
  })

  it('[U07115] cycles the overlay from off through static and dynamic parties and back to off', () => {
    const parties = ['player1', 'player2']
    const first = cycleDangerOverlay(parties, -1, 'off')
    expect(first).toMatchObject({ index: 0, layer: 'static', partyId: 'player1' })
    const second = cycleDangerOverlay(parties, first.index, first.layer)
    expect(second).toMatchObject({ index: 1, layer: 'static', partyId: 'player2' })
    const dynamic = cycleDangerOverlay(parties, second.index, second.layer)
    expect(dynamic).toMatchObject({ index: 0, layer: 'dynamic', partyId: 'player1' })
    const lastParty = cycleDangerOverlay(parties, dynamic.index, dynamic.layer)
    expect(lastParty).toMatchObject({ index: 1, layer: 'dynamic', partyId: 'player2' })
    const off = cycleDangerOverlay(parties, lastParty.index, lastParty.layer)
    expect(off).toMatchObject({ index: -1, layer: 'off', partyId: null })
  })
})
