import { TILE_SIZE } from '../../config.js'
import { findPath } from '../../units.js'
import { gameState } from '../../gameState.js'
import { updateUnitSpeedModifier } from '../../utils.js'
import { isPositionVisibleToPlayer } from '../shadowOfWar.js'
import { canUnitTargetEntity, getEffectiveFireRange } from './combatHelpers.js'

/**
 * Handle Tesla Coil status effects
 */
export function handleTeslaEffects(unit, now) {
  if (unit.teslaDisabledUntil && now < unit.teslaDisabledUntil) {
    unit.canFire = false
    unit.baseSpeedModifier = 0.2 // 80% slow from Tesla
    updateUnitSpeedModifier(unit) // Combine with health modifier
  } else if (unit.teslaDisabledUntil && now >= unit.teslaDisabledUntil) {
    unit.canFire = true
    unit.baseSpeedModifier = 1.0 // Remove Tesla slow effect
    updateUnitSpeedModifier(unit) // Recalculate with health modifier
    unit.teslaDisabledUntil = null
    unit.teslaSlowUntil = null
    unit.teslaSlowed = false
  }
}

/**
 * Process attack queue for units with multiple targets
 */
export function processAttackQueue(unit, units, mapGrid) {
  // Don't process attack queue during retreat
  if (unit.isRetreating) {
    return
  }

  // Only process if unit has an attack queue
  if (!unit.attackQueue || unit.attackQueue.length === 0) {
    return
  }

  // Remove any dead targets from the queue first
  unit.attackQueue = unit.attackQueue.filter(target => target && target.health > 0)

  // If queue is now empty, clear everything
  if (unit.attackQueue.length === 0) {
    unit.attackQueue = null
    unit.target = null
    return
  }

  // Helper function to initiate pathfinding to new target
  function setNewTargetWithPath(newTarget) {
    if (!canUnitTargetEntity(unit, newTarget)) {
      return
    }

    const oldTarget = unit.target
    unit.target = newTarget

    // Only recalculate path if target actually changed and not already moving to it
    if (oldTarget !== newTarget) {
      // Clear existing movement data when switching to new target
      unit.path = []
      unit.moveTarget = null

      // Immediately calculate new path with occupancy map for attack movement
      if (mapGrid) {
        const occupancyMap = gameState.occupancyMap

        // Calculate target position
        let targetTileX, targetTileY
        if (newTarget.tileX !== undefined) {
          targetTileX = Math.floor(newTarget.x / TILE_SIZE)
          targetTileY = Math.floor(newTarget.y / TILE_SIZE)
        } else {
          targetTileX = newTarget.x
          targetTileY = newTarget.y
        }

        // Calculate path to new target
        const path = findPath(
          { x: unit.tileX, y: unit.tileY },
          { x: targetTileX, y: targetTileY },
          mapGrid,
          occupancyMap
        )

        if (path.length > 1) {
          unit.path = path.slice(1)
        }
      }
    }
  }

  // If current target is dead/invalid or we don't have a target, set the first target from queue
  if (!unit.target || unit.target.health <= 0) {
    setNewTargetWithPath(unit.attackQueue[0])
  }

  // If current target is destroyed and it was in our queue, remove it and advance
  if (unit.target && unit.target.health <= 0) {
    // Remove the destroyed target from queue (it might be the first one)
    unit.attackQueue = unit.attackQueue.filter(target => target.id !== unit.target.id)

    // Set next target if available
    if (unit.attackQueue.length > 0) {
      setNewTargetWithPath(unit.attackQueue[0])
    } else {
      unit.attackQueue = null
      unit.target = null
      // Clear movement data when no more targets
      unit.path = []
      unit.moveTarget = null
    }
  }
}

export function updateGuardTargeting(unit, units) {
  if (!unit.guardTarget || unit.isRetreating) return

  if (unit.target && !canUnitTargetEntity(unit, unit.target)) {
    unit.target = null
  }

  const range = getEffectiveFireRange(unit)
  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2
  const mapGrid = gameState.mapGrid

  if (unit.target && unit.target.health > 0) {
    const targetCenterX = unit.target.tileX !== undefined ? unit.target.x + TILE_SIZE / 2 : unit.target.x * TILE_SIZE + (unit.target.width * TILE_SIZE) / 2
    const targetCenterY = unit.target.tileY !== undefined ? unit.target.y + TILE_SIZE / 2 : unit.target.y * TILE_SIZE + (unit.target.height * TILE_SIZE) / 2
    const dist = Math.hypot(targetCenterX - unitCenterX, targetCenterY - unitCenterY)
    if (dist > range) {
      unit.target = null
    } else {
      return
    }
  }

  let closest = null
  let closestDist = Infinity
  units.forEach(p => {
    if (p.owner !== unit.owner && p.health > 0) {
      if (!canUnitTargetEntity(unit, p)) {
        return
      }

      const cx = p.x + TILE_SIZE / 2
      const cy = p.y + TILE_SIZE / 2
      const d = Math.hypot(cx - unitCenterX, cy - unitCenterY)
      if (d <= range && d < closestDist) {
        if (unit.type === 'howitzer' && !isPositionVisibleToPlayer(gameState, mapGrid, cx, cy)) {
          return
        }
        closestDist = d
        closest = p
      }
    }
  })

  if (gameState.buildings) {
    gameState.buildings.forEach(b => {
      if (b.owner !== unit.owner && b.health > 0) {
        const bx = b.x * TILE_SIZE + (b.width * TILE_SIZE) / 2
        const by = b.y * TILE_SIZE + (b.height * TILE_SIZE) / 2
        const d = Math.hypot(bx - unitCenterX, by - unitCenterY)
        if (d <= range && d < closestDist) {
          if (unit.type === 'howitzer' && !isPositionVisibleToPlayer(gameState, mapGrid, bx, by)) {
            return
          }
          closestDist = d
          closest = b
        }
      }
    })
  }

  if (closest) {
    unit.target = closest
  }
}
