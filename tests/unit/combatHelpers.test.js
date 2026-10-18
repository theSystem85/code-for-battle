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

import { applyTargetingSpread, computeLeadAimPoint, computeProjectileInterceptPoint, getTargetVelocity, isTurretAimedAtTarget } from '../../src/game/unitCombat/combatHelpers.js'

describe('combatHelpers predictive rocket aiming', () => {
  it('[U00891] derives target velocity from movement.velocity when available', () => {
    const velocity = getTargetVelocity({ movement: { velocity: { x: 2, y: -1 } } }, 0, 0)
    expect(velocity).toEqual({ x: 2, y: -1 })
  })

  it('[U00892] computes a forward intercept for a steadily moving tank', () => {
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

describe('rocket tank hull aiming', () => {
  it('[U00893] accepts hull alignment with an airborne sprite even when the unused turret points at the ground position', () => {
    const target = { type: 'apache', tileX: 27, tileY: 24, x: 27 * 32, y: 24 * 32, altitude: 144, flightState: 'airborne' }
    const launcher = { type: 'rocketTank', x: 22 * 32, y: 24 * 32, direction: Math.atan2(-144 * 0.4, 5 * 32), turretDirection: 0 }
    expect(isTurretAimedAtTarget(launcher, target)).toBe(true)
    launcher.direction = 0
    expect(isTurretAimedAtTarget(launcher, target)).toBe(false)
  })

  it('[U00894] uses tile coordinates for building targets and requires the hull to face them', () => {
    const target = { x: 10, y: 14, width: 2, height: 2 }
    const launcher = { type: 'rocketTank', x: 10 * 32, y: 10 * 32, direction: Math.atan2(4.5, 0.5), turretDirection: 0 }
    expect(isTurretAimedAtTarget(launcher, target)).toBe(true)
    launcher.direction = 0
    expect(isTurretAimedAtTarget(launcher, target)).toBe(false)
  })
})

describe('M2 (lightTank) lead aiming', () => {
  it('[U00895] aims ahead of a moving target so the fast round meets it', () => {
    const target = { movement: { velocity: { x: 0, y: 2 } } }
    const aim = computeLeadAimPoint({ shooterX: 0, shooterY: 0, target, targetCenterX: 160, targetCenterY: 0, projectileSpeed: 16 })
    expect(aim.y).toBeGreaterThan(0)
    // Projectile and target arrive at the same point at the same time.
    const projectileDistance = Math.hypot(aim.x, aim.y)
    expect(projectileDistance / 16).toBeCloseTo(aim.travelTime, 5)
    expect(aim.y).toBeCloseTo(2 * aim.travelTime, 5)
  })

  it('[U00896] aims straight at a stationary target', () => {
    const aim = computeLeadAimPoint({ shooterX: 0, shooterY: 0, target: {}, targetCenterX: 100, targetCenterY: 50, projectileSpeed: 16 })
    expect(aim.x).toBeCloseTo(100)
    expect(aim.y).toBeCloseTo(50)
  })

  it('[U00897] uses a tighter spread than standard tanks', () => {
    const lt = applyTargetingSpread(0, 0, 320, 0, 'bullet', 'lightTank')
    const std = applyTargetingSpread(0, 0, 320, 0, 'bullet', 'tank_v1')
    expect(Math.abs(lt.y)).toBeLessThan(Math.abs(std.y))
  })
})
