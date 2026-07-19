import { TILE_SIZE } from '../config.js'
import { findPath } from '../units.js'
import { getEffectiveFireRange } from '../game/unitCombat/combatHelpers.js'

const DEFAULT_GUARD_DISTANCE = 1.5 * TILE_SIZE
const PATH_INTERVAL = 2000
const SUPPLY_SHIP_PATH_INTERVAL = 250
const SUPPLY_SHIP_RANGE_MARGIN_TILES = 0.35

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
    const supplyFollowDistance = unit.type === 'supplyShip'
      ? Math.max(TILE_SIZE, ((unit.supplyRadiusTiles || 2) - SUPPLY_SHIP_RANGE_MARGIN_TILES) * TILE_SIZE)
      : null
    const fireRange = getEffectiveFireRange(unit)
    const rerouteThreshold = supplyFollowDistance ?? (
      Number.isFinite(fireRange) && fireRange > 0
        ? fireRange / 2
        : DEFAULT_GUARD_DISTANCE
    )
    const pathInterval = unit.type === 'supplyShip' ? SUPPLY_SHIP_PATH_INTERVAL : PATH_INTERVAL

    if (distance > rerouteThreshold) {
      if (!unit.lastGuardPathCalcTime || now - unit.lastGuardPathCalcTime > pathInterval) {
        const path = findPath(
          { x: unit.tileX, y: unit.tileY, owner: unit.owner },
          desiredTile,
          mapGrid,
          occupancyMap,
          undefined,
          {
            movementType: unit.movementType,
            unitOwner: unit.owner,
            strictDestination: false
          }
        )
        if (path && path.length > 1) {
          unit.path = path.slice(1)
          unit.moveTarget = desiredTile
        }
        unit.lastGuardPathCalcTime = now
      }
    } else if (unit.type === 'supplyShip') {
      // Do not let a stale guard path carry the supplier past the protected ship.
      unit.path = []
      unit.moveTarget = null
    }
  } else {
    unit.guardTargets = null
    unit.guardTarget = null
    unit.guardMode = false
  }
}
