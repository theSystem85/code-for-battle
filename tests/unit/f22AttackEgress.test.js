import { describe, expect, it } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import { gameState } from '../../src/gameState.js'
import { updateF22FlightState } from '../../src/game/movementF22.js'
import { getEffectiveFireRange } from '../../src/game/unitCombat/combatHelpers.js'
import {
  F22_DEFAULT_WEAPON_RANGE,
  F22_FLIGHT_YAW_SCALE,
  F22_MIN_ATTACK_DISTANCE,
  getF22ReattackEgressDistance,
  getF22TurnRadius,
  getF22WeaponRange,
  planF22CombatAttack
} from '../../src/game/f22AttackGeometry.js'

function rotateToward(current, target, yaw) {
  let diff = target - current
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  if (Math.abs(diff) <= yaw) return target
  return current + Math.sign(diff) * yaw
}

function makeJet(x, y, direction) {
  return {
    type: 'f22Raptor',
    x,
    y,
    direction,
    airCruiseSpeed: 6.075,
    speed: 6.075,
    rotationSpeed: 0.1,
    target: { id: 'tank-1', health: 100, tileX: 0, tileY: 0, x: 0, y: 0 },
    f22AssignedDestination: { followTargetId: 'tank-1', mode: 'combat' }
  }
}

describe('F22 re-attack egress distance', () => {
  it('uses the same weapon range as combat, including the level cap', () => {
    const base = { type: 'f22Raptor' }
    const leveled = { type: 'f22Raptor', level: 3, rangeMultiplier: 2 }
    expect(getF22WeaponRange(base)).toBe(getEffectiveFireRange(base))
    expect(getF22WeaponRange(leveled)).toBe(getEffectiveFireRange(leveled))
    expect(getF22WeaponRange(leveled)).toBe(20 * TILE_SIZE)
  })

  it('requires a departure beyond weapon range by at least two turn radii', () => {
    const jet = makeJet(0, 0, 0)
    const turnRadius = getF22TurnRadius(jet)
    const egressDistance = getF22ReattackEgressDistance(F22_DEFAULT_WEAPON_RANGE, turnRadius)

    expect(turnRadius).toBeCloseTo(6.075 / Math.max(0.02, 0.1 * F22_FLIGHT_YAW_SCALE), 5)
    expect(egressDistance).toBeGreaterThan(F22_DEFAULT_WEAPON_RANGE)
    expect(egressDistance).toBeGreaterThanOrEqual(F22_DEFAULT_WEAPON_RANGE + turnRadius * 2)
    // The previous combat orbit was capped at 14 tiles, inside the 16-tile weapon range.
    expect(egressDistance).toBeGreaterThan(14 * TILE_SIZE)
  })

  it('aims the outbound waypoint past weapon range when the jet is still inside the engagement circle', () => {
    const target = { x: 4000, y: 4000 }
    const jet = makeJet(target.x, target.y - 10 * TILE_SIZE, 0)
    const plan = planF22CombatAttack(jet, target, null, F22_DEFAULT_WEAPON_RANGE)
    const waypointDistance = Math.hypot(plan.x - target.x, plan.y - target.y)

    expect(plan.phase).toBe('egress')
    expect(waypointDistance).toBeGreaterThanOrEqual(plan.egressDistance)
    expect(waypointDistance).toBeGreaterThan(F22_DEFAULT_WEAPON_RANGE)
  })

  it('keeps a border egress on the map and outside weapon range', () => {
    const bounds = { minX: 80, minY: 80, maxX: 3200, maxY: 3200 }
    const target = { x: 200, y: 1600 }
    const jet = makeJet(120, target.y - TILE_SIZE / 2, Math.PI)
    const plan = planF22CombatAttack(jet, target, bounds, F22_DEFAULT_WEAPON_RANGE)

    expect(plan.x).toBeGreaterThanOrEqual(bounds.minX)
    expect(plan.x).toBeLessThanOrEqual(bounds.maxX)
    expect(plan.y).toBeGreaterThanOrEqual(bounds.minY)
    expect(plan.y).toBeLessThanOrEqual(bounds.maxY)
    expect(Math.hypot(plan.x - target.x, plan.y - target.y)).toBeGreaterThan(F22_DEFAULT_WEAPON_RANGE)
  })

  it('leaves the firing window after a pass and re-enters it on the next run', () => {
    const target = { x: 5000, y: 5000 }
    const weaponRange = F22_DEFAULT_WEAPON_RANGE
    const jet = makeJet(target.x - 40 * TILE_SIZE, target.y - TILE_SIZE / 2, 0)
    const egressDistance = getF22ReattackEgressDistance(weaponRange, getF22TurnRadius(jet))

    let windowEntries = 0
    let inWindow = false
    let leftWindow = false
    let maxDistanceAfterExit = 0
    let separatedPasses = 0
    let minDistance = Infinity
    let egressRun = 0
    let longestEgressRun = 0

    for (let tick = 0; tick < 6000; tick++) {
      const plan = planF22CombatAttack(jet, target, null, weaponRange)
      const centerX = jet.x + TILE_SIZE / 2
      const centerY = jet.y + TILE_SIZE / 2
      const distance = Math.hypot(centerX - target.x, centerY - target.y)
      minDistance = Math.min(minDistance, distance)

      const insideWindow = distance <= weaponRange && distance >= F22_MIN_ATTACK_DISTANCE
      if (insideWindow && !inWindow) {
        windowEntries += 1
        if (leftWindow && maxDistanceAfterExit >= egressDistance * 0.98) {
          separatedPasses += 1
        }
        leftWindow = false
        maxDistanceAfterExit = 0
      } else if (!insideWindow && inWindow) {
        leftWindow = true
        maxDistanceAfterExit = distance
      }
      if (leftWindow) {
        maxDistanceAfterExit = Math.max(maxDistanceAfterExit, distance)
      }
      inWindow = insideWindow

      if (plan.phase === 'egress') {
        egressRun += 1
        longestEgressRun = Math.max(longestEgressRun, egressRun)
      } else {
        egressRun = 0
      }

      const desired = Math.atan2(plan.y - centerY, plan.x - centerX)
      const yaw = Math.max(0.02, jet.rotationSpeed * F22_FLIGHT_YAW_SCALE)
      jet.direction = rotateToward(jet.direction || 0, desired, yaw)
      const speed = jet.airCruiseSpeed * plan.speedMultiplier
      jet.x += Math.cos(jet.direction) * speed
      jet.y += Math.sin(jet.direction) * speed
    }

    expect(windowEntries).toBeGreaterThanOrEqual(2)
    expect(separatedPasses).toBeGreaterThanOrEqual(1)
    expect(minDistance).toBeGreaterThan(4 * TILE_SIZE)
    expect(longestEgressRun).toBeGreaterThan(20)
  })

  it('keeps the combat assignment while the attack run is active', () => {
    const previous = {
      mapGrid: gameState.mapGrid,
      units: gameState.units,
      buildings: gameState.buildings
    }
    const target = {
      id: 'tank-1',
      type: 'tank_v1',
      health: 100,
      x: 40 * TILE_SIZE,
      y: 40 * TILE_SIZE,
      tileX: 40,
      tileY: 40
    }
    gameState.mapGrid = Array.from({ length: 80 }, () => (
      Array.from({ length: 80 }, () => ({ type: 'grass' }))
    ))
    gameState.units = [target]
    gameState.buildings = []

    const jet = makeJet(25 * TILE_SIZE, 40 * TILE_SIZE, 0)
    jet.flightState = 'airborne'
    jet.f22State = 'airborne'
    jet.altitude = TILE_SIZE
    jet.maxAltitude = TILE_SIZE * 2
    jet.health = 80
    jet.rocketAmmo = 4
    jet.maxRocketAmmo = 8
    jet.lastF22FlightSoundAt = 1000
    jet.owner = 'player1'
    jet.runwayPoints = {
      runwayStart: { worldX: 0, worldY: 0 },
      runwayLiftOff: { worldX: 64, worldY: 0 },
      runwayExit: { worldX: 128, worldY: 0 }
    }
    jet.target = target
    jet.f22AssignedDestination = {
      x: target.x + TILE_SIZE / 2,
      y: target.y + TILE_SIZE / 2,
      stopRadius: TILE_SIZE * 0.25,
      mode: 'combat',
      followTargetId: target.id,
      destinationTile: null
    }
    const movement = { targetVelocity: { x: 0, y: 0 }, rotation: 0, isMoving: false }

    try {
      updateF22FlightState(jet, movement, 1000)
      updateF22FlightState(jet, movement, 1200)

      expect(jet.f22AssignedDestination.mode).toBe('combat')
      expect(jet.f22AssignedDestination.followTargetId).toBe(target.id)
      expect(jet.f22AttackPhase).toBe('egress')
      expect(jet.flightPlan.mode).toBe('orbit')
      const targetCenterX = target.x + TILE_SIZE / 2
      const targetCenterY = target.y + TILE_SIZE / 2
      expect(Math.hypot(jet.flightPlan.x - targetCenterX, jet.flightPlan.y - targetCenterY))
        .toBeGreaterThan(F22_DEFAULT_WEAPON_RANGE)
    } finally {
      gameState.mapGrid = previous.mapGrid
      gameState.units = previous.units
      gameState.buildings = previous.buildings
    }
  })
})
