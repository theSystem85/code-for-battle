import { describe, expect, it, vi } from 'vitest'
import '../setup.js'
import { TILE_SIZE } from '../../src/config.js'

vi.mock('../../src/game/unitCombat/combatHelpers.js', () => ({
  getEffectiveFireRange: vi.fn(() => 0)
}))

import { getF22SafeApproachWaypoint } from '../../src/ai/enemyAirTargeting.js'

describe('F22 anti-air-safe approach performance', () => {
  it('bounds CPU work when a large map is split by an impassable threat barrier', () => {
    const mapGrid = Array.from({ length: 200 }, () => Array(200).fill('land'))
    const seeker = { x: 10 * TILE_SIZE, y: 100 * TILE_SIZE }
    const target = { id: 'blocked-target', tileX: 190, tileY: 100 }
    const threatSources = Array.from({ length: 51 }, (_, index) => ({
      x: 100 * TILE_SIZE,
      y: index * 4 * TILE_SIZE,
      range: 2 * TILE_SIZE
    }))

    const startedAt = performance.now()
    const waypoint = getF22SafeApproachWaypoint(seeker, target, threatSources, mapGrid)
    const durationMs = performance.now() - startedAt

    expect(waypoint).toBeNull()
    expect(durationMs).toBeLessThan(1000)
  })
})
