import { TILE_SIZE } from '../config.js'
import { findPath } from '../units.js'
import { getEffectiveFireRange } from '../game/unitCombat/combatHelpers.js'

const DEFAULT_GUARD_DISTANCE = 1.5 * TILE_SIZE
const PATH_INTERVAL = 2000

export function updateGuardBehavior(unit, mapGrid, occupancyMap, now) {
  if (Array.isArray(unit.guardTargets)) {
    unit.guardTargets = unit.guardTargets.filter(target => target && target.health > 0)
    if (unit.guardTargets.length === 0) {
      unit.guardTargets = null
      unit.guardTarget = null
    } else {
      const unitCenterX = unit.x + TILE_SIZE / 2
      const unitCenterY = unit.y + TILE_SIZE / 2
      let closestTarget = unit.guardTargets[0]
      let closestDistance = Infinity
      unit.guardTargets.forEach(target => {
        const targetCenterX = target.x + TILE_SIZE / 2
        const targetCenterY = target.y + TILE_SIZE / 2
        const distance = Math.hypot(targetCenterX - unitCenterX, targetCenterY - unitCenterY)
        if (distance < closestDistance) {
          closestDistance = distance
          closestTarget = target
        }
      })
      unit.guardTarget = closestTarget
    }
  }

  if (unit.guardTarget && unit.guardTarget.health > 0) {
    unit.guardMode = true
    const unitCenterX = unit.x + TILE_SIZE / 2
    const unitCenterY = unit.y + TILE_SIZE / 2
    const targetCenterX = unit.guardTarget.x + TILE_SIZE / 2
    const targetCenterY = unit.guardTarget.y + TILE_SIZE / 2
    const distance = Math.hypot(targetCenterX - unitCenterX, targetCenterY - unitCenterY)
    const desiredTile = { x: unit.guardTarget.tileX, y: unit.guardTarget.tileY }
    const fireRange = getEffectiveFireRange(unit)
    const rerouteThreshold = Number.isFinite(fireRange) && fireRange > 0
      ? fireRange / 2
      : DEFAULT_GUARD_DISTANCE

    if (distance > rerouteThreshold) {
      if (!unit.lastGuardPathCalcTime || now - unit.lastGuardPathCalcTime > PATH_INTERVAL) {
        const path = findPath({ x: unit.tileX, y: unit.tileY }, desiredTile, mapGrid, occupancyMap)
        if (path && path.length > 1) {
          unit.path = path.slice(1)
          unit.moveTarget = desiredTile
        }
        unit.lastGuardPathCalcTime = now
      }
    }
  } else {
    unit.guardTargets = null
    unit.guardTarget = null
    unit.guardMode = false
  }
}
