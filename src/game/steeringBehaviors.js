// Steering Behaviors Module - Boids-style flocking with collision avoidance
// Implements separation, alignment, cohesion, and formation behaviors

import { TILE_SIZE } from '../config.js'
import { getSpatialQuadtree } from './spatialQuadtree.js'
import { getFlowFieldManager } from './flowField.js'
import { hasFixedOccupancy } from './occupancyTags.js'

// Steering configuration - exported for config.js integration
export const STEERING_CONFIG = {
  // Query radius for finding nearby units
  NEIGHBOR_RADIUS: TILE_SIZE * 3,

  // Separation: Keep units apart
  SEPARATION_RADIUS: TILE_SIZE * 0.75,
  SEPARATION_WEIGHT: 1.5,
  SEPARATION_MAX_FORCE: 2.0,

  // Alignment: Match velocity of nearby same-owner units
  ALIGNMENT_RADIUS: TILE_SIZE * 2,
  ALIGNMENT_WEIGHT: 0.3,

  // Cohesion: Move towards center of nearby same-owner moving units
  COHESION_RADIUS: TILE_SIZE * 2.5,
  COHESION_WEIGHT: 0.2,

  // Obstacle avoidance lookahead
  OBSTACLE_LOOKAHEAD_DIST: TILE_SIZE * 1.5,
  OBSTACLE_AVOIDANCE_WEIGHT: 2.0,

  // Flow field influence in chokepoints
  FLOW_FIELD_WEIGHT: 1.0,

  // Formation cohesion (when treating formation as cohesion target)
  FORMATION_COHESION_WEIGHT: 0.5,

  // Maximum combined steering force
  MAX_STEERING_FORCE: 3.0,

  // Minimum speed to apply steering (prevents jittering when stopped)
  MIN_SPEED_FOR_STEERING: 0.05
}

/**
 * Check if two units are enemies
 */
function areEnemies(unitA, unitB) {
  if (!unitA || !unitB || !unitA.owner || !unitB.owner) return false

  const normalizeOwner = (owner) => owner === 'player' ? 'player1' : owner
  return normalizeOwner(unitA.owner) !== normalizeOwner(unitB.owner)
}

/**
 * Check if a unit is a ground unit (not airborne)
 */
function isGroundUnit(unit) {
  if (!unit) return false
  if (unit.isAirUnit && unit.flightState !== 'grounded') return false
  return true
}

/**
 * Calculate separation force - steer away from nearby units
 * Applies to all nearby units regardless of owner
 */
export function calculateSeparation(unit, nearbyUnits) {
  if (!unit || !nearbyUnits || nearbyUnits.length === 0) {
    return { x: 0, y: 0 }
  }

  const unitCx = unit.x + TILE_SIZE / 2
  const unitCy = unit.y + TILE_SIZE / 2

  let separationX = 0
  let separationY = 0
  let count = 0

  for (const other of nearbyUnits) {
    if (!other || other.id === unit.id || other.health <= 0) continue

    const otherCx = other.x + TILE_SIZE / 2
    const otherCy = other.y + TILE_SIZE / 2

    const dx = unitCx - otherCx
    const dy = unitCy - otherCy
    const distance = Math.hypot(dx, dy)

    if (distance > 0 && distance < STEERING_CONFIG.SEPARATION_RADIUS) {
      // Weight inversely by distance (closer = stronger repulsion)
      const strength = (STEERING_CONFIG.SEPARATION_RADIUS - distance) / STEERING_CONFIG.SEPARATION_RADIUS
      const normalizedDx = dx / distance
      const normalizedDy = dy / distance

      separationX += normalizedDx * strength
      separationY += normalizedDy * strength
      count++
    }
  }

  if (count > 0) {
    separationX /= count
    separationY /= count

    // Normalize and apply weight
    const magnitude = Math.hypot(separationX, separationY)
    if (magnitude > 0) {
      separationX = (separationX / magnitude) * STEERING_CONFIG.SEPARATION_WEIGHT
      separationY = (separationY / magnitude) * STEERING_CONFIG.SEPARATION_WEIGHT

      // Clamp to max force
      const forceMag = Math.hypot(separationX, separationY)
      if (forceMag > STEERING_CONFIG.SEPARATION_MAX_FORCE) {
        separationX = (separationX / forceMag) * STEERING_CONFIG.SEPARATION_MAX_FORCE
        separationY = (separationY / forceMag) * STEERING_CONFIG.SEPARATION_MAX_FORCE
      }
    }
  }

  return { x: separationX, y: separationY }
}

/**
 * Calculate alignment force - match velocity of nearby friendly units
 * Only applies to units with the same owner
 */
export function calculateAlignment(unit, nearbyUnits) {
  if (!unit || !nearbyUnits || nearbyUnits.length === 0) {
    return { x: 0, y: 0 }
  }

  const unitCx = unit.x + TILE_SIZE / 2
  const unitCy = unit.y + TILE_SIZE / 2

  let avgVelX = 0
  let avgVelY = 0
  let count = 0

  for (const other of nearbyUnits) {
    if (!other || other.id === unit.id || other.health <= 0) continue
    if (areEnemies(unit, other)) continue // Only align with friendlies

    const otherCx = other.x + TILE_SIZE / 2
    const otherCy = other.y + TILE_SIZE / 2
    const distance = Math.hypot(unitCx - otherCx, unitCy - otherCy)

    if (distance < STEERING_CONFIG.ALIGNMENT_RADIUS) {
      // Get other unit's velocity
      const velX = other.movement?.velocity?.x || 0
      const velY = other.movement?.velocity?.y || 0

      // Only consider moving units
      if (Math.hypot(velX, velY) > STEERING_CONFIG.MIN_SPEED_FOR_STEERING) {
        avgVelX += velX
        avgVelY += velY
        count++
      }
    }
  }

  if (count > 0) {
    avgVelX /= count
    avgVelY /= count

    // Calculate steering towards average velocity
    const currentVelX = unit.movement?.velocity?.x || 0
    const currentVelY = unit.movement?.velocity?.y || 0

    let steerX = avgVelX - currentVelX
    let steerY = avgVelY - currentVelY

    // Normalize and apply weight
    const magnitude = Math.hypot(steerX, steerY)
    if (magnitude > 0) {
      steerX = (steerX / magnitude) * STEERING_CONFIG.ALIGNMENT_WEIGHT
      steerY = (steerY / magnitude) * STEERING_CONFIG.ALIGNMENT_WEIGHT
    }

    return { x: steerX, y: steerY }
  }

  return { x: 0, y: 0 }
}

/**
 * Calculate cohesion force - steer towards center of nearby friendly moving units
 * Only applies to units with the same owner that are moving
 */
export function calculateCohesion(unit, nearbyUnits) {
  if (!unit || !nearbyUnits || nearbyUnits.length === 0) {
    return { x: 0, y: 0 }
  }

  const unitCx = unit.x + TILE_SIZE / 2
  const unitCy = unit.y + TILE_SIZE / 2

  let centerX = 0
  let centerY = 0
  let count = 0

  for (const other of nearbyUnits) {
    if (!other || other.id === unit.id || other.health <= 0) continue
    if (areEnemies(unit, other)) continue // Only cohere with friendlies

    const otherCx = other.x + TILE_SIZE / 2
    const otherCy = other.y + TILE_SIZE / 2
    const distance = Math.hypot(unitCx - otherCx, unitCy - otherCy)

    if (distance < STEERING_CONFIG.COHESION_RADIUS) {
      // Only consider moving units for cohesion
      const velX = other.movement?.velocity?.x || 0
      const velY = other.movement?.velocity?.y || 0

      if (Math.hypot(velX, velY) > STEERING_CONFIG.MIN_SPEED_FOR_STEERING) {
        centerX += otherCx
        centerY += otherCy
        count++
      }
    }
  }

  if (count > 0) {
    centerX /= count
    centerY /= count

    // Steer towards the center
    let steerX = centerX - unitCx
    let steerY = centerY - unitCy

    // Normalize and apply weight
    const magnitude = Math.hypot(steerX, steerY)
    if (magnitude > 0) {
      steerX = (steerX / magnitude) * STEERING_CONFIG.COHESION_WEIGHT
      steerY = (steerY / magnitude) * STEERING_CONFIG.COHESION_WEIGHT
    }

    return { x: steerX, y: steerY }
  }

  return { x: 0, y: 0 }
}

/**
 * Calculate formation cohesion - treat formation offset as cohesion target
 * This is Option C from the plan: blend formation with flocking
 */
export function calculateFormationCohesion(unit) {
  if (!unit || !unit.formationOffset || !unit.formationCenter) {
    return { x: 0, y: 0 }
  }

  const unitCx = unit.x + TILE_SIZE / 2
  const unitCy = unit.y + TILE_SIZE / 2

  // Calculate target position based on formation
  const targetX = unit.formationCenter.x + unit.formationOffset.x
  const targetY = unit.formationCenter.y + unit.formationOffset.y

  let steerX = targetX - unitCx
  let steerY = targetY - unitCy

  // Normalize and apply weight
  const magnitude = Math.hypot(steerX, steerY)
  if (magnitude > TILE_SIZE * 0.5) { // Only apply if significant distance
    steerX = (steerX / magnitude) * STEERING_CONFIG.FORMATION_COHESION_WEIGHT
    steerY = (steerY / magnitude) * STEERING_CONFIG.FORMATION_COHESION_WEIGHT
  } else {
    steerX = 0
    steerY = 0
  }

  return { x: steerX, y: steerY }
}

/**
 * Calculate obstacle avoidance using lookahead probes
 */
export function calculateObstacleAvoidance(unit, mapGrid, occupancyMap) {
  if (!unit || !mapGrid) {
    return { x: 0, y: 0 }
  }

  const unitCx = unit.x + TILE_SIZE / 2
  const unitCy = unit.y + TILE_SIZE / 2

  // Get movement direction
  const velX = unit.movement?.velocity?.x || 0
  const velY = unit.movement?.velocity?.y || 0
  const speed = Math.hypot(velX, velY)

  if (speed < STEERING_CONFIG.MIN_SPEED_FOR_STEERING) {
    return { x: 0, y: 0 }
  }

  const dirX = velX / speed
  const dirY = velY / speed

  let avoidX = 0
  let avoidY = 0

  // Check multiple lookahead distances
  const distances = [0.5, 1.0, 1.5].map(d => d * TILE_SIZE)

  for (const dist of distances) {
    const probeX = unitCx + dirX * dist
    const probeY = unitCy + dirY * dist
    const tileX = Math.floor(probeX / TILE_SIZE)
    const tileY = Math.floor(probeY / TILE_SIZE)

    let blocked = false

    // Check map bounds
    if (tileY < 0 || tileY >= mapGrid.length || tileX < 0 || tileX >= mapGrid[0].length) {
      blocked = true
    } else {
      const tile = mapGrid[tileY][tileX]
      if (typeof tile === 'number') {
        blocked = tile === 1
      } else if (tile) {
        blocked = tile.type === 'water' || tile.type === 'rock' ||
                  tile.building || tile.seedCrystal
      }
    }

    // Check occupancy
    if (!blocked && hasFixedOccupancy(occupancyMap?.[tileY]?.[tileX])) {
      // Check if it's just our own tile
      const currentTileX = Math.floor(unitCx / TILE_SIZE)
      const currentTileY = Math.floor(unitCy / TILE_SIZE)
      if (tileX !== currentTileX || tileY !== currentTileY) {
        blocked = true
      }
    }

    if (blocked) {
      // Calculate avoidance force perpendicular to movement
      // Choose the side with more space
      const leftProbeX = unitCx + (-dirY) * TILE_SIZE
      const leftProbeY = unitCy + dirX * TILE_SIZE
      const rightProbeX = unitCx + dirY * TILE_SIZE
      const rightProbeY = unitCy + (-dirX) * TILE_SIZE

      const leftTileX = Math.floor(leftProbeX / TILE_SIZE)
      const leftTileY = Math.floor(leftProbeY / TILE_SIZE)
      const rightTileX = Math.floor(rightProbeX / TILE_SIZE)
      const rightTileY = Math.floor(rightProbeY / TILE_SIZE)

      let leftClear = true
      let rightClear = true

      if (leftTileY >= 0 && leftTileY < mapGrid.length && leftTileX >= 0 && leftTileX < mapGrid[0].length) {
        const leftTile = mapGrid[leftTileY][leftTileX]
        if (typeof leftTile === 'number') {
          leftClear = leftTile === 0
        } else if (leftTile) {
          leftClear = leftTile.type !== 'water' && leftTile.type !== 'rock' &&
                      !leftTile.building && !leftTile.seedCrystal
        }
      } else {
        leftClear = false
      }

      if (rightTileY >= 0 && rightTileY < mapGrid.length && rightTileX >= 0 && rightTileX < mapGrid[0].length) {
        const rightTile = mapGrid[rightTileY][rightTileX]
        if (typeof rightTile === 'number') {
          rightClear = rightTile === 0
        } else if (rightTile) {
          rightClear = rightTile.type !== 'water' && rightTile.type !== 'rock' &&
                       !rightTile.building && !rightTile.seedCrystal
        }
      } else {
        rightClear = false
      }

      // Weight by distance (closer obstacles = stronger avoidance)
      const weight = (STEERING_CONFIG.OBSTACLE_LOOKAHEAD_DIST - dist / TILE_SIZE) / STEERING_CONFIG.OBSTACLE_LOOKAHEAD_DIST
      const force = weight * STEERING_CONFIG.OBSTACLE_AVOIDANCE_WEIGHT

      if (leftClear && !rightClear) {
        avoidX += (-dirY) * force
        avoidY += dirX * force
      } else if (rightClear && !leftClear) {
        avoidX += dirY * force
        avoidY += (-dirX) * force
      } else if (leftClear && rightClear) {
        // Both clear, choose randomly but consistently
        const side = ((unit.id || '').charCodeAt(0) || 0) % 2 === 0 ? 1 : -1
        avoidX += (-dirY) * side * force
        avoidY += dirX * side * force
      } else {
        // Both blocked, try to reverse
        avoidX += (-dirX) * force
        avoidY += (-dirY) * force
      }
    }
  }

  return { x: avoidX, y: avoidY }
}

/**
 * Calculate flow field steering for chokepoint navigation
 */
export function calculateFlowFieldSteering(unit, mapGrid, occupancyMap) {
  if (!unit || !unit.moveTarget) {
    return { x: 0, y: 0 }
  }

  const flowFieldManager = getFlowFieldManager()
  if (!flowFieldManager) {
    return { x: 0, y: 0 }
  }

  const destX = unit.moveTarget.x
  const destY = unit.moveTarget.y

  const flowDir = flowFieldManager.getFlowDirectionForUnit(unit, destX, destY, mapGrid, occupancyMap)

  if (!flowDir) {
    return { x: 0, y: 0 }
  }

  return {
    x: flowDir.dirX * STEERING_CONFIG.FLOW_FIELD_WEIGHT,
    y: flowDir.dirY * STEERING_CONFIG.FLOW_FIELD_WEIGHT
  }
}

/**
 * Calculate combined steering forces for a unit
 * Uses spatial quadtree for efficient neighbor queries
 */
export function calculateSteeringForces(unit, mapGrid, occupancyMap) {
  if (!unit || !isGroundUnit(unit)) {
    return { x: 0, y: 0 }
  }

  // Check if unit is moving
  const velX = unit.movement?.velocity?.x || 0
  const velY = unit.movement?.velocity?.y || 0
  const isMoving = Math.hypot(velX, velY) > STEERING_CONFIG.MIN_SPEED_FOR_STEERING

  if (!isMoving && !unit.path?.length && !unit.moveTarget) {
    return { x: 0, y: 0 }
  }

  // Query nearby units using spatial quadtree
  const quadtree = getSpatialQuadtree()
  let nearbyUnits = []

  if (quadtree) {
    nearbyUnits = quadtree.queryNearbyForUnit(unit, STEERING_CONFIG.NEIGHBOR_RADIUS)
  }

  // Calculate individual steering forces
  const separation = calculateSeparation(unit, nearbyUnits)
  const alignment = isMoving ? calculateAlignment(unit, nearbyUnits) : { x: 0, y: 0 }
  const cohesion = isMoving ? calculateCohesion(unit, nearbyUnits) : { x: 0, y: 0 }
  const formation = calculateFormationCohesion(unit)
  const obstacleAvoidance = calculateObstacleAvoidance(unit, mapGrid, occupancyMap)
  const flowField = calculateFlowFieldSteering(unit, mapGrid, occupancyMap)

  // Combine forces
  let totalX = separation.x + alignment.x + cohesion.x + formation.x + obstacleAvoidance.x + flowField.x
  let totalY = separation.y + alignment.y + cohesion.y + formation.y + obstacleAvoidance.y + flowField.y

  // Clamp to maximum steering force
  const magnitude = Math.hypot(totalX, totalY)
  if (magnitude > STEERING_CONFIG.MAX_STEERING_FORCE) {
    totalX = (totalX / magnitude) * STEERING_CONFIG.MAX_STEERING_FORCE
    totalY = (totalY / magnitude) * STEERING_CONFIG.MAX_STEERING_FORCE
  }

  return { x: totalX, y: totalY }
}

/**
 * Apply steering forces to a unit's movement
 * Call this in the movement update loop
 */
export function applySteeringForces(unit, steeringForce, deltaTime = 1) {
  if (!unit || !unit.movement || !steeringForce) return

  // Scale by delta time for frame-rate independence
  const scaledX = steeringForce.x * deltaTime
  const scaledY = steeringForce.y * deltaTime

  // Add to target velocity
  if (unit.movement.targetVelocity) {
    unit.movement.targetVelocity.x += scaledX
    unit.movement.targetVelocity.y += scaledY
  }
}

/**
 * Update formation center for a group of units
 * Call this when a group move command is issued
 */
export function updateFormationCenter(units, targetX, targetY) {
  if (!units || units.length === 0) return

  // Calculate center of formation at destination
  const formationCenter = {
    x: targetX * TILE_SIZE + TILE_SIZE / 2,
    y: targetY * TILE_SIZE + TILE_SIZE / 2
  }

  // Calculate formation offsets (square formation)
  const unitsPerRow = Math.ceil(Math.sqrt(units.length))
  const spacing = TILE_SIZE * 1.5

  units.forEach((unit, index) => {
    if (!unit) return

    const row = Math.floor(index / unitsPerRow)
    const col = index % unitsPerRow

    unit.formationCenter = formationCenter
    unit.formationOffset = {
      x: (col - (unitsPerRow - 1) / 2) * spacing,
      y: row * spacing
    }
  })
}

/**
 * Clear formation data from units
 */
export function clearFormation(units) {
  if (!units) return

  for (const unit of units) {
    if (unit) {
      unit.formationCenter = null
      unit.formationOffset = null
    }
  }
}
