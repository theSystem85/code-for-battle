import { describe, it, expect, vi } from 'vitest'
import '../setup.js'

vi.mock('../../src/logic.js', () => ({
  hasClearShot: vi.fn(() => true),
  angleDiff: vi.fn((a, b) => a - b),
  findPositionWithClearShot: vi.fn()
}))

vi.mock('../../src/game/unifiedMovement.js', () => ({
  stopUnitMovement: vi.fn()
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: { humanPlayer: 'player1', partyStates: [] }
}))

vi.mock('../../src/game/shadowOfWar.js', () => ({
  isPositionVisibleToPlayer: vi.fn(() => true)
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn(() => 0)
}))

import { computeProjectileInterceptPoint, getTargetVelocity } from '../../src/game/unitCombat/combatHelpers.js'

describe('combatHelpers predictive rocket aiming', () => {
  it('derives target velocity from movement.velocity when available', () => {
    const velocity = getTargetVelocity({ movement: { velocity: { x: 2, y: -1 } } }, 0, 0)
    expect(velocity).toEqual({ x: 2, y: -1 })
  })

  it('computes a forward intercept for a steadily moving tank', () => {
    const intercept = computeProjectileInterceptPoint({
      shooterX: 336,
      shooterY: 336,
      spawnX: 340,
      spawnY: 336,
      targetX: 656,
      targetY: 336,
      targetVelocityX: 2,
      targetVelocityY: 0,
      projectileSpeed: 5
    })

    expect(intercept.x).toBeGreaterThan(760)
    expect(intercept.y).toBeCloseTo(336, 6)
    expect(intercept.travelTime).toBeGreaterThan(50)
  })
})
