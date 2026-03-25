// attackCoordination.js - AI attack coordination and multi-directional attack strategies
import { TILE_SIZE, TANK_FIRE_RANGE, HOWITZER_FIRE_RANGE } from '../config.js'
import { createFormationOffsets, getCachedPath } from '../game/pathfinding.js'
import { getSimulationTime } from '../game/time.js'
import { gameRandom } from '../utils/gameRandom.js'
import { isUnitInPlayerBase } from './retreatLogic.js'
import { getEnemyPlayers, isEnemyTo } from './enemyUtils.js'

// Configuration constants for AI behavior
const AI_CONFIG = {
  GROUP_ATTACK_MIN_SIZE: 3,           // Minimum units needed for group attack
  DEFENSE_BUILDING_RANGE: 12,         // Range to seek protection from defense buildings
  GROUP_FORMATION_RANGE: 8            // Range in tiles for units to be considered in same group
}

// Pre-computed DPS values for enemy unit types
const UNIT_DPS = {
  tank_v1: 20 / (4000 / 1000),
  tank_v2: 24 / (4000 / 1000),
  'tank-v2': 24 / (4000 / 1000),
  'tank-v3': 30 / (4000 / 1000),
  rocketTank: 120 / (12000 / 1000),
  howitzer: 80 / (4000 / 1000)
}

// Multi-directional attack configuration
const ATTACK_DIRECTIONS = {
  NORTH: { x: 0, y: -1, name: 'north' },
  NORTHEAST: { x: 1, y: -1, name: 'northeast' },
  EAST: { x: 1, y: 0, name: 'east' },
  SOUTHEAST: { x: 1, y: 1, name: 'southeast' },
  SOUTH: { x: 0, y: 1, name: 'south' },
  SOUTHWEST: { x: -1, y: 1, name: 'southwest' },
  WEST: { x: -1, y: 0, name: 'west' },
  NORTHWEST: { x: -1, y: -1, name: 'northwest' }
}

// Track last attack directions to avoid repetition
const lastAttackDirections = new Map() // Map of target building ID to direction
let attackDirectionRotation = 0 // Global rotation counter

function computeDangerAtTarget(aiPlayerId, target, gameState) {
  const dzm = gameState.dangerZoneMaps && gameState.dangerZoneMaps[aiPlayerId]
  if (!dzm) return 0
  const tx = target.tileX !== undefined ? target.tileX : Math.floor(target.x)
  const ty = target.tileY !== undefined ? target.tileY : Math.floor(target.y)
  if (ty >= 0 && ty < dzm.length && tx >= 0 && tx < dzm[0].length) {
    return dzm[ty][tx]
  }
  return 0
}

function computeRequiredGroupSize(aiPlayerId, target, gameState) {
  const danger = computeDangerAtTarget(aiPlayerId, target, gameState)
  if (danger <= 0) return AI_CONFIG.GROUP_ATTACK_MIN_SIZE
  const avgDps = UNIT_DPS.tank_v1
  return Math.max(
    AI_CONFIG.GROUP_ATTACK_MIN_SIZE,
    Math.ceil(danger / avgDps)
  )
}

/**
 * Evaluates the strength of player defenses near a target
 * Returns a score representing defensive strength
 */
function evaluatePlayerDefenses(target, gameState, aiPlayerId) {
  if (!gameState.buildings) return 0

  const enemyOwners = new Set(getEnemyPlayers(aiPlayerId, gameState))
  if (enemyOwners.size === 0) return 0

  let defenseScore = 0
  const targetX = target.tileX !== undefined ? target.tileX : target.x
  const targetY = target.tileY !== undefined ? target.tileY : target.y

  // Check for defensive buildings near target
  gameState.buildings
    .filter(b => enemyOwners.has(b.owner))
    .forEach(building => {
      const distance = Math.hypot(
        (building.x + building.width / 2) - targetX,
        (building.y + building.height / 2) - targetY
      )

      // Add defense score based on building type and proximity
      if (distance <= AI_CONFIG.DEFENSE_BUILDING_RANGE) {
        switch (building.type) {
          case 'turretGunV1':
            defenseScore += 1
            break
          case 'turretGunV2':
            defenseScore += 2
            break
          case 'turretGunV3':
            defenseScore += 3
            break
          case 'rocketTurret':
            defenseScore += 4
            break
          case 'teslaCoil':
            defenseScore += 5
            break
          case 'artilleryTurret':
            defenseScore += 6
            break
        }
      }
    })

  return defenseScore
}

/**
 * Counts allied combat units within formation range
 */
function countNearbyAllies(unit, units) {
  return units.filter(u =>
    u.owner === unit.owner &&
    u !== unit &&
    u.health > 0 &&
    (u.type === 'tank' || u.type === 'tank_v1' || u.type === 'tank-v2' || u.type === 'tank-v3' || u.type === 'rocketTank' || u.type === 'howitzer') &&
    Math.hypot(u.x - unit.x, u.y - unit.y) < AI_CONFIG.GROUP_FORMATION_RANGE * TILE_SIZE
  ).length
}

/**
 * Checks if an AI player should start attacking (has hospital built)
 */
export function shouldAIStartAttacking(aiPlayerId, gameState) {
  if (!gameState.buildings) return false

  const aiBuildings = gameState.buildings.filter(b => b.owner === aiPlayerId)
  const hasHospital = aiBuildings.some(b => b.type === 'hospital' && b.health > 0)
  const hasVehicleFactory = aiBuildings.some(b => b.type === 'vehicleFactory' && b.health > 0)
  const hasRefinery = aiBuildings.some(b => b.type === 'oreRefinery' && b.health > 0)

  // AI should only start major attacks after having core infrastructure
  return hasHospital && hasVehicleFactory && hasRefinery
}

/**
 * Determines if a group attack should be conducted based on group size and enemy defenses
 */
export function shouldConductGroupAttack(unit, units, gameState, target) {
  if (!target) return false

  const enemyOwners = new Set(getEnemyPlayers(unit.owner, gameState))
  if (enemyOwners.size === 0) return false

  const now = getSimulationTime(gameState)

  // Prevent AI from attacking before having core infrastructure
  if (!shouldAIStartAttacking(unit.owner, gameState)) return false

  // Allow individual combat if unit is already in player base area
  const isInPlayerBase = isUnitInPlayerBase(unit, gameState)
  if (isInPlayerBase) {
    return true
  }

  // If we've already maneuvered into firing range of the target, don't hold fire
  // waiting for extra allies. This prevents units from parking next to the
  // player's base and never actually shooting.
  if (isEnemyTo(target, unit.owner)) {
    const unitCenterX = unit.x + TILE_SIZE / 2
    const unitCenterY = unit.y + TILE_SIZE / 2

    const targetCenterX = target.tileX !== undefined
      ? target.x + TILE_SIZE / 2
      : (target.x + target.width / 2) * TILE_SIZE
    const targetCenterY = target.tileY !== undefined
      ? target.y + TILE_SIZE / 2
      : (target.y + target.height / 2) * TILE_SIZE

    const distanceToTarget = Math.hypot(targetCenterX - unitCenterX, targetCenterY - unitCenterY)

    // Tanks and rocket tanks have slightly different ranges, but using the
    // standard tank fire range as a baseline is sufficient. Adding a small
    // buffer keeps the check tolerant to targeting jitter.
    let effectiveRange = TANK_FIRE_RANGE * TILE_SIZE
    if (unit.type === 'rocketTank') {
      effectiveRange *= 1.3
    } else if (unit.type === 'howitzer') {
      effectiveRange = HOWITZER_FIRE_RANGE * TILE_SIZE
    }
    if (distanceToTarget <= effectiveRange * 1.1) {
      return true
    }
  }

  // Allow individual combat if unit is under attack
  if (unit.isBeingAttacked || unit.lastDamageTime && now - unit.lastDamageTime < 5000) {
    return true
  }

  // Always allow attacking player harvesters (high priority economic targets)
  if (target.type === 'harvester' && isEnemyTo(target, unit.owner)) {
    return true
  }

  // Allow attacking damaged player units
  if (target.health && target.maxHealth && target.health <= target.maxHealth * 0.5) {
    return true
  }

  const nearbyAllies = countNearbyAllies(unit, units)
  const totalGroupSize = nearbyAllies + 1 // Include the unit itself

  const requiredGroupSize = computeRequiredGroupSize(unit.owner, target, gameState)

  if (totalGroupSize < requiredGroupSize) {
    // Allow solo harvester attacks or very weak targets
    if (target.type === 'harvester' || (target.health && target.health <= (target.maxHealth || 0) * 0.3)) {
      return true
    }
    return false
  }

  return true
}

/**
 * Finds the player's main base center for attack coordination
 */
function findPlayerBaseCenter(gameState, aiPlayerId) {
  if (!gameState.buildings) return null

  const enemyOwners = new Set(getEnemyPlayers(aiPlayerId, gameState))
  const enemyBuildings = gameState.buildings.filter(b => enemyOwners.has(b.owner) && b.health > 0)
  if (enemyBuildings.length === 0) return null

  // Find construction yard or command center as primary target
  let primaryTarget = enemyBuildings.find(b =>
    b.type === 'constructionYard' || b.type === 'commandCenter'
  )

  // If no primary target, use any important building
  if (!primaryTarget) {
    primaryTarget = enemyBuildings.find(b =>
      b.type === 'vehicleFactory' || b.type === 'oreRefinery' || b.type === 'powerPlant'
    )
  }

  // Fallback to first building
  if (!primaryTarget) {
    primaryTarget = enemyBuildings[0]
  }

  return {
    x: Math.floor(primaryTarget.x + primaryTarget.width / 2),
    y: Math.floor(primaryTarget.y + primaryTarget.height / 2),
    building: primaryTarget
  }
}

/**
 * Assigns attack direction to a group of units to avoid clustering
 */
export function assignAttackDirection(unit, units, gameState) {
  const playerBase = findPlayerBaseCenter(gameState, unit.owner)
  if (!playerBase) return null

  // Get nearby combat units for direction assignment
  const nearbyUnits = units.filter(u =>
    u.owner === unit.owner &&
    u !== unit &&
    u.health > 0 &&
    (u.type === 'tank' || u.type === 'tank_v1' || u.type === 'tank-v2' || u.type === 'tank-v3' || u.type === 'rocketTank' || u.type === 'howitzer') &&
    Math.hypot(u.x - unit.x, u.y - unit.y) < AI_CONFIG.GROUP_FORMATION_RANGE * TILE_SIZE * 2
  )

  const totalGroup = [unit, ...nearbyUnits]
  const groupSize = totalGroup.length

  // If single unit, use rotating direction
  if (groupSize === 1) {
    const directions = Object.values(ATTACK_DIRECTIONS)
    const direction = directions[attackDirectionRotation % directions.length]
    attackDirectionRotation++
    return direction
  }

  // For groups, distribute around the target
  const buildingId = playerBase.building.id || `${playerBase.building.x}-${playerBase.building.y}`

  // Get current direction assignment for this target
  const currentDirection = lastAttackDirections.get(buildingId) || 0

  // Assign different directions to each unit in the group
  const unitIndex = totalGroup.indexOf(unit)
  const directionIndex = (currentDirection + unitIndex) % Object.values(ATTACK_DIRECTIONS).length
  const direction = Object.values(ATTACK_DIRECTIONS)[directionIndex]

  // Update direction rotation for this target
  lastAttackDirections.set(buildingId, (currentDirection + 1) % Object.values(ATTACK_DIRECTIONS).length)

  return direction
}

/**
 * Calculates approach position for multi-directional attack
 */
export function calculateApproachPosition(unit, target, direction, gameState, mapGrid) {
  if (!target || !direction) return null

  const targetX = target.tileX !== undefined ? target.tileX : Math.floor(target.x)
  const targetY = target.tileY !== undefined ? target.tileY : Math.floor(target.y)

  // Calculate approach distance based on unit type and target defenses
  const defenseStrength = evaluatePlayerDefenses(target, gameState)
  let approachDistance = Math.max(8, Math.min(15, 10 + defenseStrength))

  // Adjust for unit fire range
  if (unit.type === 'rocketTank' || unit.type === 'tank-v3') {
    approachDistance = Math.max(approachDistance, TANK_FIRE_RANGE / TILE_SIZE + 2)
  } else if (unit.type === 'howitzer') {
    approachDistance = Math.max(approachDistance, HOWITZER_FIRE_RANGE + 2)
  }

  // Calculate approach position in the assigned direction
  let approachX = targetX + (direction.x * approachDistance)
  let approachY = targetY + (direction.y * approachDistance)

  // Ensure approach position is within map bounds
  if (mapGrid && mapGrid.length > 0) {
    approachX = Math.max(0, Math.min(mapGrid[0].length - 1, approachX))
    approachY = Math.max(0, Math.min(mapGrid.length - 1, approachY))

    // Find nearest valid tile if the exact position is blocked
    for (let radius = 0; radius <= 5; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue

          const checkX = approachX + dx
          const checkY = approachY + dy

          if (checkX >= 0 && checkY >= 0 &&
              checkX < mapGrid[0].length && checkY < mapGrid.length) {
            const tile = mapGrid[checkY][checkX]
            if (tile.type !== 'water' && tile.type !== 'rock' && !tile.building) {
              return { x: checkX, y: checkY, direction: direction.name }
            }
          }
        }
      }
    }
  }

  return { x: approachX, y: approachY, direction: direction.name }
}

/**
 * Coordinates multi-directional attack for combat units
 */
export function handleMultiDirectionalAttack(unit, units, gameState, mapGrid, now) {
  // Only apply to combat units that aren't already retreating
  if (unit.isRetreating || !unit.allowedToAttack) return false

  const combatTypes = ['tank', 'tank_v1', 'tank-v2', 'tank-v3', 'rocketTank', 'howitzer']
  if (!combatTypes.includes(unit.type)) return false

  // Skip if unit already has a specific approach position
  if (unit.approachPosition && unit.approachDirection) {
    // Check if we're close to approach position
    const distToApproach = Math.hypot(
      unit.tileX - unit.approachPosition.x,
      unit.tileY - unit.approachPosition.y
    )

    if (distToApproach <= 2) {
      // Reached approach position, clear it to allow normal combat
      unit.approachPosition = null
      unit.approachDirection = null
      return false
    }

    // Continue moving to approach position
    // Always respect the occupancy map for attack movement
    // Throttle attack pathfinding to 5 seconds to prevent wiggling (matches AI_DECISION_INTERVAL)
    const pathRecalcNeeded = !unit.lastAttackPathCalcTime || (now - unit.lastAttackPathCalcTime > 5000) // Changed from ATTACK_PATH_CALC_INTERVAL to 5000

    if (pathRecalcNeeded) {
      const occupancyMap = gameState.occupancyMap
      const path = getCachedPath(
        { x: unit.tileX, y: unit.tileY, owner: unit.owner },
        unit.approachPosition,
        mapGrid,
        occupancyMap,
        { unitOwner: unit.owner }
      )

      if (path.length > 1) {
        unit.path = path.slice(1)
        unit.lastAttackPathCalcTime = now
        return true
      }
    }

    // Return true to indicate we're still working on the approach (prevents normal targeting)
    return true
  }

  // Find target for attack
  const target = findPlayerBaseCenter(gameState, unit.owner)
  if (!target) return false

  // Skip if already very close to target (engage directly)
  const distanceToTarget = Math.hypot(
    unit.tileX - target.x,
    unit.tileY - target.y
  )

  if (distanceToTarget <= 8) return false // Close enough for direct engagement

  const globalPoint = gameState.globalAttackPoint
  if (globalPoint) {
    unit.approachPosition = globalPoint
    unit.approachDirection = 'global'
    unit.lastDirectionAssignment = now
    const occupancyMap = gameState.occupancyMap
    const path = getCachedPath(
      { x: unit.tileX, y: unit.tileY, owner: unit.owner },
      globalPoint,
      mapGrid,
      occupancyMap,
      { unitOwner: unit.owner }
    )
    if (path.length > 1) {
      unit.path = path.slice(1)
      return true
    }
  }

  // Only assign new attack directions every 5 seconds to prevent wiggling
  const lastDirectionAssignment = unit.lastDirectionAssignment || 0
  if (now - lastDirectionAssignment < 5000) {
    return false // Skip direction assignment if too recent
  }

  // Assign attack direction and approach position
  const direction = assignAttackDirection(unit, units, gameState)
  const approachPos = calculateApproachPosition(unit, target, direction, gameState, mapGrid)

  if (approachPos) {
    unit.approachPosition = approachPos
    unit.approachDirection = direction.name
    unit.lastDirectionAssignment = now // Track when we last assigned a direction

    // Apply simple formation to nearby allies
    const group = units.filter(u =>
      u.owner === unit.owner &&
      (u.type === 'tank' || u.type === 'tank_v1' || u.type === 'tank-v2' || u.type === 'tank-v3' || u.type === 'rocketTank' || u.type === 'howitzer') &&
      Math.hypot(u.x - unit.x, u.y - unit.y) <= AI_CONFIG.GROUP_FORMATION_RANGE * TILE_SIZE
    )
    if (group.length > 1) {
      createFormationOffsets(group, unit.id)
    }

    // Set path to approach position
    // Always respect the occupancy map for attack movement
    const occupancyMap = gameState.occupancyMap
    const path = getCachedPath(
      { x: unit.tileX, y: unit.tileY, owner: unit.owner },
      approachPos,
      mapGrid,
      occupancyMap,
      { unitOwner: unit.owner }
    )

    if (path.length > 1) {
      unit.path = path.slice(1)
      return true
    }
  }

  return false
}

/**
 * Resets attack direction memory to ensure varied attack patterns
 * Call this periodically or when major changes occur
 */
export function resetAttackDirections() {
  lastAttackDirections.clear()
  attackDirectionRotation = Math.floor(gameRandom() * Object.values(ATTACK_DIRECTIONS).length)
}

/**
 * Gets attack statistics for debugging/monitoring
 */
export function getAttackDirectionStats() {
  return {
    activeDirections: lastAttackDirections.size,
    currentRotation: attackDirectionRotation,
    directions: Array.from(lastAttackDirections.entries())
  }
}

// Determine a tile around the player's buildings with the lowest danger level
export function computeLeastDangerAttackPoint(gameState, aiPlayerId = null) {
  const targetingPartyId = aiPlayerId || gameState.humanPlayer || 'player1'
  const enemyOwners = new Set(getEnemyPlayers(targetingPartyId, gameState))
  const dzm = gameState.dangerZoneMaps && gameState.dangerZoneMaps[targetingPartyId]
  if (!dzm) return null

  const buildings = (gameState.buildings || []).filter(
    b => enemyOwners.has(b.owner) && b.health > 0
  )
  if (buildings.length === 0) return null

  let best = null
  buildings.forEach(b => {
    for (let y = b.y - 1; y <= b.y + b.height; y++) {
      if (y < 0 || y >= dzm.length) continue
      for (let x = b.x - 1; x <= b.x + b.width; x++) {
        if (x < 0 || x >= dzm[0].length) continue
        const dps = dzm[y][x]
        if (!best || dps < best.dps) {
          best = { dps, x, y }
        }
      }
    }
  })

  return best ? { x: best.x, y: best.y } : null
}
