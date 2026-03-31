/**
 * Retreat Behavior System
 *
 * Handles tactical retreat behavior for combat units:
 * - Tanks move backwards while maintaining turret aim on target
 * - Minimal rotation - prefer reverse movement over turning
 * - Continue firing while retreating (when in range)
 * - Stop firing when out of range without chasing
 * - Shift+Click initiates retreat mode
 */

import { TILE_SIZE, TANK_FIRE_RANGE } from '../config.js'
import { gameState } from '../gameState.js'
import { angleDiff } from '../logic.js'
// import { findPath } from '../units.js' // Unused but kept for future use
import { playSound } from '../sound.js'
import { showNotification } from '../ui/notifications.js'

/**
 * Check if a unit is in retreat mode
 */
export function isRetreating(unit) {
  return unit.isRetreating === true
}

function clearRetreatVisualizationState(unit) {
  unit.retreatIssuedByPlayer = false
}

/**
 * Initiate retreat behavior for selected units to target position
 * Called when shift+click is used
 */
export function initiateRetreat(selectedUnits, targetX, targetY, mapGrid) {
  const retreatingUnits = selectedUnits.filter(unit =>
    unit.owner === gameState.humanPlayer &&
    (unit.type === 'tank' || unit.type === 'tank_v1' || unit.type === 'tank-v2' ||
    unit.type === 'tank-v3' || unit.type === 'rocketTank' || unit.type === 'howitzer')
  )

  if (retreatingUnits.length === 0) return

  const retreatTileX = Math.floor(targetX / TILE_SIZE)
  const retreatTileY = Math.floor(targetY / TILE_SIZE)

  // Validate retreat position
  if (retreatTileX < 0 || retreatTileX >= mapGrid[0].length ||
      retreatTileY < 0 || retreatTileY >= mapGrid.length ||
      mapGrid[retreatTileY][retreatTileX].type === 'water' ||
      mapGrid[retreatTileY][retreatTileX].type === 'rock' ||
      mapGrid[retreatTileY][retreatTileX].seedCrystal ||
      mapGrid[retreatTileY][retreatTileX].building) {
    return // Invalid retreat position
  }

  retreatingUnits.forEach((unit, index) => {
    // Store current target for continued engagement during retreat
    const currentTarget = unit.target

    // Set retreat mode
    unit.isRetreating = true
    unit.retreatIssuedByPlayer = true
    unit.retreatTarget = { x: retreatTileX, y: retreatTileY }
    unit.retreatStartTime = performance.now()

    // Cancel any existing attack/movement behavior that might conflict
    unit.attackQueue = [] // Clear attack queue
    unit.isAttacking = false
    unit.lastAttackTime = 0
    unit.alertMode = false // Disable alert mode during retreat

    // Apply formation offset for multiple units
    let formationOffsetX = 0
    let formationOffsetY = 0

    if (retreatingUnits.length > 1) {
      const cols = Math.ceil(Math.sqrt(retreatingUnits.length))
      const col = index % cols
      const row = Math.floor(index / cols)
      formationOffsetX = (col - Math.floor(cols / 2)) * 2
      formationOffsetY = (row - Math.floor(cols / 2)) * 2
    }

    const finalRetreatX = Math.max(0, Math.min(mapGrid[0].length - 1, retreatTileX + formationOffsetX))
    const finalRetreatY = Math.max(0, Math.min(mapGrid.length - 1, retreatTileY + formationOffsetY))

    unit.retreatTarget = { x: finalRetreatX, y: finalRetreatY }

    // Calculate retreat movement strategy
    calculateRetreatMovement(unit, mapGrid)    // Keep current target for continued firing during retreat
    if (currentTarget && currentTarget.health > 0) {
      unit.target = currentTarget
      unit.retreatOriginalTarget = currentTarget
    }
  })

  playSound('confirmed', 0.7)
  showNotification(`${retreatingUnits.length} unit(s) retreating`, 1500)
}

/**
 * Calculate retreat direction and movement strategy
 */
function calculateRetreatMovement(unit, _mapGrid) {
  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2
  const retreatWorldX = unit.retreatTarget.x * TILE_SIZE + TILE_SIZE / 2
  const retreatWorldY = unit.retreatTarget.y * TILE_SIZE + TILE_SIZE / 2

  // Calculate direction to retreat target
  const dx = retreatWorldX - unitCenterX
  const dy = retreatWorldY - unitCenterY
  const retreatDirection = Math.atan2(dy, dx)

  // Calculate current tank orientation
  const currentDirection = unit.direction || 0
  const forwardDirection = currentDirection
  const backwardDirection = currentDirection + Math.PI

  // Calculate angle differences for forward and backward movement
  const forwardAngleDiff = Math.abs(angleDiff(forwardDirection, retreatDirection))
  const backwardAngleDiff = Math.abs(angleDiff(backwardDirection, retreatDirection))

  // Choose movement strategy based on which requires less rotation
  if (backwardAngleDiff < forwardAngleDiff) {
    // Moving backwards is more efficient - need to orient so back faces retreat direction
    unit.retreatMovementDirection = 'backward'
    unit.isMovingBackwards = true
    // Set target direction so that the BACK of the tank faces the retreat point
    unit.targetDirection = retreatDirection + Math.PI // Face opposite to retreat direction
    unit.canAccelerate = false // Don't move until oriented correctly
  } else {
    // Moving forwards is more efficient - need to orient so front faces retreat direction
    unit.retreatMovementDirection = 'forward'
    unit.isMovingBackwards = false
    // Set target direction so that the FRONT of the tank faces the retreat point
    unit.targetDirection = retreatDirection
    unit.canAccelerate = false // Don't move until oriented correctly
  }

  // Normalize target direction
  while (unit.targetDirection > Math.PI) unit.targetDirection -= 2 * Math.PI
  while (unit.targetDirection < -Math.PI) unit.targetDirection += 2 * Math.PI

  // Set up path to retreat target for existing movement system (once rotation complete)
  unit.path = [{
    x: unit.retreatTarget.x,
    y: unit.retreatTarget.y
  }]

  unit.moveTarget = {
    x: retreatWorldX,
    y: retreatWorldY
  }
}

/**
 * Update retreat behavior for a unit
 * Called from the main game loop
 */
export function updateRetreatBehavior(unit, now, mapGrid, units = []) {
  if (!isRetreating(unit)) return false

  // AI-initiated retreats (enemy harvesters fleeing, low-health tanks) are path-based
  // and managed by retreatLogic.js / enemyStrategies.js. The backward-movement
  // behaviour system here is only for player shift+click tactical retreats.
  if (!unit.retreatIssuedByPlayer) return false

  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2

  // Check if reached retreat destination
  const retreatWorldX = unit.retreatTarget.x * TILE_SIZE + TILE_SIZE / 2
  const retreatWorldY = unit.retreatTarget.y * TILE_SIZE + TILE_SIZE / 2
  const distanceToRetreat = Math.hypot(unitCenterX - retreatWorldX, unitCenterY - retreatWorldY)

  if (distanceToRetreat < TILE_SIZE * 0.8) {
    // Reached retreat position - stop retreating and clear all retreat state
    unit.isRetreating = false
    clearRetreatVisualizationState(unit)
    unit.retreatTarget = null
    unit.retreatMovementDirection = null
    unit.path = []
    unit.moveTarget = null
    unit.isMovingBackwards = false
    unit.canAccelerate = true
    unit.canFire = true // Reset firing capability when retreat ends
    unit.retreatStuckDetection = null // Clear stuck detection

    // Clear movement system state
    if (unit.movement) {
      unit.movement.isMoving = false
      unit.movement.targetVelocity = { x: 0, y: 0 }
    }

    // Keep target for defensive firing but don't chase
    if (unit.retreatOriginalTarget && unit.retreatOriginalTarget.health > 0) {
      const targetDistance = getDistanceToTarget(unit, unit.retreatOriginalTarget)
      if (targetDistance <= TANK_FIRE_RANGE * TILE_SIZE) {
        unit.target = unit.retreatOriginalTarget
      } else {
        // Target out of range - stop targeting
        unit.target = null
        unit.retreatOriginalTarget = null
      }
    }

    return true
  }

  // Check if retreat path is blocked by obstacles or units
  if (checkRetreatPathBlocked(unit, mapGrid, units)) {
    // Path is blocked - stop retreat here and clear retreat state
    unit.isRetreating = false
    clearRetreatVisualizationState(unit)
    unit.retreatTarget = null
    unit.retreatMovementDirection = null
    unit.path = []
    unit.moveTarget = null
    unit.isMovingBackwards = false
    unit.canAccelerate = true
    unit.canFire = true // Reset firing capability when retreat ends
    unit.retreatStuckDetection = null // Clear stuck detection

    // Clear movement system state
    if (unit.movement) {
      unit.movement.isMoving = false
      unit.movement.targetVelocity = { x: 0, y: 0 }
    }

    // Keep original target for defensive firing
    if (unit.retreatOriginalTarget && unit.retreatOriginalTarget.health > 0) {
      const targetDistance = getDistanceToTarget(unit, unit.retreatOriginalTarget)
      if (targetDistance <= TANK_FIRE_RANGE * TILE_SIZE) {
        unit.target = unit.retreatOriginalTarget
      } else {
        unit.target = null
        unit.retreatOriginalTarget = null
      }
    }

    return true
  }

  // Continue retreat movement
  updateRetreatMovement(unit, now)

  // Handle firing during retreat
  updateRetreatCombat(unit, now)

  return true
}

/**
 * Update movement during retreat - Ensure rotation before movement
 */
function updateRetreatMovement(unit, now) {
  if (!unit.retreatTarget) return

  const _unitCenterX = unit.x + TILE_SIZE / 2
  const _unitCenterY = unit.y + TILE_SIZE / 2
  const retreatWorldX = unit.retreatTarget.x * TILE_SIZE + TILE_SIZE / 2
  const retreatWorldY = unit.retreatTarget.y * TILE_SIZE + TILE_SIZE / 2

  const currentDirection = unit.direction || 0
  const targetDirection = unit.targetDirection

  // Check if rotation is complete for both forward and backward movement
  if (!unit.canAccelerate && targetDirection !== undefined) {
    const rotationDiff = Math.abs(angleDiff(currentDirection, targetDirection))
    const ROTATION_TOLERANCE = 0.15 // ~8.6 degrees tolerance

    if (rotationDiff < ROTATION_TOLERANCE) {
      unit.canAccelerate = true
    }
  }

  // Ensure we have valid path and moveTarget for existing movement system
  if (!unit.path || unit.path.length === 0) {
    unit.path = [{
      x: unit.retreatTarget.x,
      y: unit.retreatTarget.y
    }]
  }

  if (!unit.moveTarget) {
    unit.moveTarget = {
      x: retreatWorldX,
      y: retreatWorldY
    }
  }

  // Initialize retreat stuck detection if not present
  if (!unit.retreatStuckDetection) {
    unit.retreatStuckDetection = {
      lastPosition: { x: unit.x, y: unit.y },
      stuckTime: 0,
      lastCheck: now
    }
  }

  // Check if unit is stuck during retreat (hasn't moved significantly in 2 seconds)
  const stuckDetection = unit.retreatStuckDetection
  if (now - stuckDetection.lastCheck > 1000) { // Check every second
    const distanceMoved = Math.hypot(unit.x - stuckDetection.lastPosition.x, unit.y - stuckDetection.lastPosition.y)

    if (distanceMoved < TILE_SIZE / 4 && unit.canAccelerate) {
      stuckDetection.stuckTime += now - stuckDetection.lastCheck

      // If stuck for more than 2 seconds, stop retreat
      if (stuckDetection.stuckTime > 2000) {
        // Clear retreat state - unit is stuck
        unit.isRetreating = false
        clearRetreatVisualizationState(unit)
        unit.retreatTarget = null
        unit.retreatMovementDirection = null
        unit.path = []
        unit.moveTarget = null
        unit.isMovingBackwards = false
        unit.canAccelerate = true
        unit.canFire = true // Reset firing capability when retreat ends
        unit.retreatStuckDetection = null

        // Clear movement system state
        if (unit.movement) {
          unit.movement.isMoving = false
          unit.movement.targetVelocity = { x: 0, y: 0 }
        }

        return
      }
    } else {
      // Unit is moving, reset stuck time
      stuckDetection.stuckTime = 0
    }

    stuckDetection.lastPosition.x = unit.x
    stuckDetection.lastPosition.y = unit.y
    stuckDetection.lastCheck = now
  }
}

/**
 * Handle combat during retreat
 */
function updateRetreatCombat(unit, _now) {
  // Continue firing at target while retreating (if in range)
  if (unit.target && unit.target.health > 0) {
    const targetDistance = getDistanceToTarget(unit, unit.target)

    if (targetDistance > TANK_FIRE_RANGE * TILE_SIZE) {
      // Target out of range - stop firing but continue retreat
      // Do NOT clear target immediately to avoid re-acquiring
      unit.canFire = false
    } else {
      // Target in range - maintain firing capability
      unit.canFire = true
    }
  }
}

/**
 * Cancel retreat mode for a unit
 */
export function cancelRetreat(unit) {
  if (!isRetreating(unit)) return

  unit.isRetreating = false
  clearRetreatVisualizationState(unit)
  unit.retreatTarget = null
  unit.retreatMovementDirection = null
  unit.retreatOriginalTarget = null
  unit.isMovingBackwards = false
  unit.canFire = true
  unit.canAccelerate = true
  unit.retreatStuckDetection = null // Clear stuck detection

  // Clear movement-related properties
  unit.path = []
  unit.moveTarget = null

  // Clear any retreat-related movement flags
  if (unit.movement) {
    unit.movement.isMoving = false
    unit.movement.targetVelocity = { x: 0, y: 0 }
  }
}

/**
 * Cancel retreat for all selected units
 */
export function cancelRetreatForUnits(units) {
  units.forEach(unit => {
    if (isRetreating(unit)) {
      cancelRetreat(unit)
    }
  })
}

/**
 * Check if unit should automatically exit retreat mode
 */
export function shouldExitRetreat(unit, now) {
  if (!isRetreating(unit)) return false

  // Exit retreat if target is destroyed
  if (unit.retreatOriginalTarget && unit.retreatOriginalTarget.health <= 0) {
    return true
  }

  // Exit retreat if it's been too long (prevent infinite retreat)
  const retreatDuration = now - (unit.retreatStartTime || now)
  if (retreatDuration > 30000) { // 30 seconds max retreat
    return true
  }

  return false
}

/**
 * Get distance to target (units or buildings)
 */
function getDistanceToTarget(unit, target) {
  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2

  let targetCenterX, targetCenterY

  if (target.tileX !== undefined) {
    // Target is a unit
    targetCenterX = target.x + TILE_SIZE / 2
    targetCenterY = target.y + TILE_SIZE / 2
  } else {
    // Target is a building
    targetCenterX = target.x * TILE_SIZE + (target.width * TILE_SIZE) / 2
    targetCenterY = target.y * TILE_SIZE + (target.height * TILE_SIZE) / 2
  }

  return Math.hypot(targetCenterX - unitCenterX, targetCenterY - unitCenterY)
}

/**
 * Check if the direct path to retreat point is blocked by obstacles or units
 */
function checkRetreatPathBlocked(unit, mapGrid, units) {
  if (!unit.retreatTarget) return false

  const unitTileX = Math.floor(unit.x / TILE_SIZE)
  const unitTileY = Math.floor(unit.y / TILE_SIZE)
  const retreatTileX = unit.retreatTarget.x
  const retreatTileY = unit.retreatTarget.y

  // Use Bresenham-like algorithm to check tiles along the direct line
  const dx = Math.abs(retreatTileX - unitTileX)
  const dy = Math.abs(retreatTileY - unitTileY)
  const sx = unitTileX < retreatTileX ? 1 : -1
  const sy = unitTileY < retreatTileY ? 1 : -1
  let err = dx - dy

  let currentX = unitTileX
  let currentY = unitTileY

  // Check each tile along the path (skip the starting position)
  while (!(currentX === retreatTileX && currentY === retreatTileY)) {
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      currentX += sx
    }
    if (e2 < dx) {
      err += dx
      currentY += sy
    }

    // Skip checking the current unit's position
    if (currentX === unitTileX && currentY === unitTileY) continue

    // Check bounds
    if (currentX < 0 || currentX >= mapGrid[0].length ||
        currentY < 0 || currentY >= mapGrid.length) {
      return true // Out of bounds = blocked
    }

    // Check terrain obstacles
    const tile = mapGrid[currentY][currentX]
    if (tile.type === 'water' || tile.type === 'rock' || tile.seedCrystal || tile.building) {
      return true // Terrain blocked
    }

    // Check for other units occupying this tile
    const isOccupied = units.some(otherUnit => {
      if (otherUnit.id === unit.id || otherUnit.health <= 0) return false
      const otherTileX = Math.floor(otherUnit.x / TILE_SIZE)
      const otherTileY = Math.floor(otherUnit.y / TILE_SIZE)
      return otherTileX === currentX && otherTileY === currentY
    })

    if (isOccupied) {
      return true // Unit blocked
    }
  }

  return false // Path is clear
}
