import { TILE_SIZE } from '../../config.js'
import { playPositionalSound } from '../../sound.js'
import { gameRandom } from '../../utils/gameRandom.js'
import { getAircraftAltitudeLift } from '../aircraftTargeting.js'

// Rocket turret: 6 * 18 damage / (6000 + 5 * 500) ms.
// Double damage per missile at one quarter the sustained missile rate.
export const DESTROYER_AIR_DEFENCE = Object.freeze({
  range: 16 * TILE_SIZE,
  damage: 36,
  cooldown: 8500 * 4 / 6,
  speed: 5
})

// Runtime-only cooldown: existing saves need no new persisted state.
const lastLaunch = new WeakMap()

export function isAirDefenceTarget(target) {
  return Boolean(target && target.health > 0 &&
    (target.type === 'apache' || target.type === 'f22Raptor' || target.type === 'f35') &&
    target.flightState !== 'grounded' && !target.factoryExit &&
    !target.embarkedOnId && !target.carrierOperation)
}

export function updateDestroyerAirDefence(unit, airborneTargets, bullets, now) {
  const previous = lastLaunch.get(unit)
  if (unit.canFire === false || (unit.crew && typeof unit.crew === 'object' && !unit.crew.loader) ||
      (typeof unit.ammunition === 'number' && unit.ammunition <= 0) ||
      (previous !== undefined && now - previous < DESTROYER_AIR_DEFENCE.cooldown)) return

  let target = null
  let nearestSquared = DESTROYER_AIR_DEFENCE.range ** 2
  for (const candidate of airborneTargets) {
    if (candidate.owner === unit.owner || !isAirDefenceTarget(candidate)) continue
    const distanceSquared = (candidate.x - unit.x) ** 2 + (candidate.y - unit.y) ** 2
    if (distanceSquared <= nearestSquared) {
      nearestSquared = distanceSquared
      target = candidate
    }
  }
  if (!target) return

  const x = unit.x + TILE_SIZE / 2
  const y = unit.y + TILE_SIZE / 2
  bullets.push({
    id: Date.now() + gameRandom(),
    x, y,
    speed: DESTROYER_AIR_DEFENCE.speed,
    baseDamage: DESTROYER_AIR_DEFENCE.damage,
    active: true,
    shooter: unit,
    homing: true,
    target,
    targetPosition: {
      x: target.x + TILE_SIZE / 2,
      y: target.y + TILE_SIZE / 2 - getAircraftAltitudeLift(target)
    },
    projectileType: 'rocket',
    // Reuse turret rocket tracking, collision bypass and impact effects.
    originType: 'rocketTurret',
    skipCollisionChecks: true,
    maxFlightTime: 5000,
    creationTime: now,
    startTime: now
  })
  if (typeof unit.ammunition === 'number') unit.ammunition--
  lastLaunch.set(unit, now)
  playPositionalSound('shoot_rocket', x, y, 0.5)
}
