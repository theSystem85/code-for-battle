// retreatLogic.js - AI retreat and defensive positioning
import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { getCachedPath } from '../game/pathfinding.js'
import { getSimulationTime } from '../game/time.js'
import { getEnemyPlayers, isEnemyTo } from './enemyUtils.js'

// Configuration constants for AI behavior
const AI_CONFIG = {
  LOW_HEALTH_RETREAT_THRESHOLD: 0.33, // 33% health threshold for retreat
  HARVESTER_DEFENSE_RANGE: 6,         // Range in tiles to defend harvesters
  BASE_RETREAT_RANGE: 10             // Range in tiles to consider as "base area"
}

/**
 * Checks if a unit should retreat based on low health
 */
export function shouldRetreatLowHealth(unit) {
  if (!unit.health || !unit.maxHealth) return false

  const healthPercent = unit.health / unit.maxHealth
  return healthPercent <= AI_CONFIG.LOW_HEALTH_RETREAT_THRESHOLD
}

/**
 * Finds the nearest enemy base/defensive position for retreating units
 */
function findNearestEnemyBase(unit, gameState) {
  if (!gameState.buildings) return null

  const enemyBuildings = gameState.buildings.filter(b => b.owner === unit.owner)
  let nearestBase = null
  let nearestDistance = Infinity

  enemyBuildings.forEach(building => {
    const distance = Math.hypot(
      (building.x + building.width / 2) * TILE_SIZE - (unit.x + TILE_SIZE / 2),
      (building.y + building.height / 2) * TILE_SIZE - (unit.y + TILE_SIZE / 2)
    )

    // Prioritize defensive buildings
    const isDefensive =
      building.type.includes('turret') ||
      building.type === 'teslaCoil' ||
      building.type === 'artilleryTurret'
    const adjustedDistance = isDefensive ? distance * 0.8 : distance

    if (adjustedDistance < nearestDistance) {
      nearestDistance = adjustedDistance
      nearestBase = building
    }
  })

  return nearestBase
}

/**
 * Handles unit retreat to base when health is low
 */
export function handleRetreatToBase(unit, gameState, mapGrid) {
  const nearestBase = findNearestEnemyBase(unit, gameState)

  if (!nearestBase) return false

  // Calculate retreat position near the base
  const baseX = Math.floor(nearestBase.x + nearestBase.width / 2)
  const baseY = Math.floor(nearestBase.y + nearestBase.height / 2)

  // Find a safe position near the base
  const retreatTarget = findSafePositionNearBase(baseX, baseY, mapGrid, unit)

  if (retreatTarget) {
    const path = getCachedPath(
      { x: unit.tileX, y: unit.tileY, owner: unit.owner },
      retreatTarget,
      mapGrid,
      null,
      { unitOwner: unit.owner }
    )

    if (path.length > 1) {
      unit.path = path.slice(1)
      unit.isRetreating = true
      unit.retreatIssuedByPlayer = false
      unit.retreatTarget = retreatTarget
      unit.needsWorkshopRepair = true
      return true
    }
  }

  return false
}

/**
 * Finds a safe position near a base for retreat
 */
function findSafePositionNearBase(baseX, baseY, mapGrid, _unit) {
  const directions = [
    { x: 0, y: -2 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: -2, y: 0 },
    { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
  ]

  for (const dir of directions) {
    const x = baseX + dir.x
    const y = baseY + dir.y

    if (x >= 0 && y >= 0 && x < mapGrid[0].length && y < mapGrid.length) {
      const tile = mapGrid[y][x]
      if (tile.type !== 'water' && tile.type !== 'rock' && !tile.building) {
        return { x, y }
      }
    }
  }

  return { x: baseX, y: baseY }
}

/**
 * Checks if a harvester is under attack and should seek protection
 */
export function shouldHarvesterSeekProtection(harvester, units) {
  if (harvester.type !== 'harvester') return false

  const now = getSimulationTime(gameState)

  // Check for nearby enemy units threatening the harvester
  const nearbyThreats = units.filter(u =>
    isEnemyTo(u, harvester.owner) &&
    u.health > 0 &&
    Math.hypot(u.x - harvester.x, u.y - harvester.y) < AI_CONFIG.HARVESTER_DEFENSE_RANGE * TILE_SIZE
  )

  // Also check if harvester has been recently damaged
  const recentlyDamaged = harvester.lastDamageTime && (now - harvester.lastDamageTime < 10000)

  return nearbyThreats.length > 0 || recentlyDamaged
}

/**
 * Handles harvester retreat to base when under attack
 */
export function handleHarvesterRetreat(harvester, gameState, mapGrid) {
  const nearestBase = findNearestEnemyBase(harvester, gameState)

  if (!nearestBase) return false

  // Find position near defensive buildings
  const retreatTarget = findDefensivePosition(nearestBase, gameState, mapGrid)

  if (retreatTarget) {
    const path = getCachedPath(
      { x: harvester.tileX, y: harvester.tileY, owner: harvester.owner },
      retreatTarget,
      mapGrid,
      null,
      { unitOwner: harvester.owner }
    )

    if (path.length > 1) {
      harvester.path = path.slice(1)
      harvester.isRetreating = true
      harvester.retreatIssuedByPlayer = false
      harvester.retreatTarget = retreatTarget
      // Clear any ore-related state
      harvester.oreField = null
      harvester.harvesting = false
      return true
    }
  }

  return false
}

/**
 * Finds a defensive position near base buildings
 */
function findDefensivePosition(baseBuilding, gameState, mapGrid) {
  if (!gameState.buildings) return null

  // Look for defensive buildings near the base
  const defensiveBuildings = gameState.buildings.filter(b =>
    b.owner === baseBuilding.owner &&
    (b.type.includes('turret') || b.type === 'teslaCoil' || b.type === 'artilleryTurret') &&
    Math.hypot(
      (b.x + b.width / 2) - (baseBuilding.x + baseBuilding.width / 2),
      (b.y + b.height / 2) - (baseBuilding.y + baseBuilding.height / 2)
    ) < AI_CONFIG.BASE_RETREAT_RANGE
  )

  if (defensiveBuildings.length > 0) {
    // Find position between base and defensive buildings
    const defBuilding = defensiveBuildings[0]
    const midX = Math.floor((baseBuilding.x + defBuilding.x) / 2)
    const midY = Math.floor((baseBuilding.y + defBuilding.y) / 2)

    return findSafePositionNearBase(midX, midY, mapGrid)
  }

  // Fallback to base position
  return {
    x: Math.floor(baseBuilding.x + baseBuilding.width / 2),
    y: Math.floor(baseBuilding.y + baseBuilding.height / 2)
  }
}

/**
 * Sends a damaged unit to the nearest vehicle workshop for repair
 */
export function sendUnitToWorkshop(unit, gameState, mapGrid) {
  const workshops = gameState.buildings.filter(b =>
    b.type === 'vehicleWorkshop' && b.owner === unit.owner && b.health > 0
  )

  if (workshops.length === 0) return false

  // Find nearest workshop
  let nearest = null
  let nearestDist = Infinity
  workshops.forEach(ws => {
    const dist = Math.hypot(unit.tileX - ws.x, unit.tileY - ws.y)
    if (dist < nearestDist) {
      nearest = ws
      nearestDist = dist
    }
  })

  if (!nearest) return false

  if (!nearest.repairQueue) nearest.repairQueue = []
  if (!nearest.repairQueue.includes(unit)) {
    nearest.repairQueue.push(unit)
    unit.targetWorkshop = nearest
  }
  unit.returningToWorkshop = true

  const waitingY = nearest.y + nearest.height + 1
  const waitingX = nearest.x + (nearest.repairQueue.indexOf(unit) % nearest.width)
  const targetTile = { x: waitingX, y: waitingY }
  const path = getCachedPath(
    { x: unit.tileX, y: unit.tileY, owner: unit.owner },
    targetTile,
    mapGrid,
    gameState.occupancyMap,
    { unitOwner: unit.owner }
  )
  if (path && path.length > 0) {
    unit.path = path.slice(1)
    unit.moveTarget = targetTile
  } else {
    unit.x = targetTile.x * TILE_SIZE
    unit.y = targetTile.y * TILE_SIZE
    unit.tileX = targetTile.x
    unit.tileY = targetTile.y
    unit.moveTarget = null
  }
  unit.target = null
  return true
}

/**
 * Checks if a unit should stop retreating (reached safe zone or health recovered)
 */
export function shouldStopRetreating(unit, gameState) {
  if (!unit.isRetreating) return false

  const now = getSimulationTime(gameState)

  // Stop retreating if health is above threshold and near base
  const healthPercent = unit.health / unit.maxHealth
  const notUnderFire = !unit.isBeingAttacked && (!unit.lastDamageTime || now - unit.lastDamageTime > 2000)
  if (healthPercent > 0.3 && notUnderFire) { // 30% health to stop retreating and no recent attacks
    // Check if unit is near enemy base
    const nearestBase = findNearestEnemyBase(unit, gameState)
    if (nearestBase) {
      const distanceToBase = Math.hypot(
        (nearestBase.x + nearestBase.width / 2) * TILE_SIZE - (unit.x + TILE_SIZE / 2),
        (nearestBase.y + nearestBase.height / 2) * TILE_SIZE - (unit.y + TILE_SIZE / 2)
      )

      if (distanceToBase < AI_CONFIG.BASE_RETREAT_RANGE * TILE_SIZE) {
        return true
      }
    }
  }

  return false
}

/**
 * Checks if a unit is currently in or near the player's base area
 */
export function isUnitInPlayerBase(unit, gameState) {
  if (!gameState.buildings) return false

  const enemyPlayers = new Set(getEnemyPlayers(unit.owner, gameState))
  if (enemyPlayers.size === 0) return false

  const unitX = unit.x + TILE_SIZE / 2
  const unitY = unit.y + TILE_SIZE / 2

  // Check if unit is near any player buildings
  return gameState.buildings
    .filter(b => enemyPlayers.has(b.owner))
    .some(building => {
      const buildingCenterX = (building.x + building.width / 2) * TILE_SIZE
      const buildingCenterY = (building.y + building.height / 2) * TILE_SIZE
      const distance = Math.hypot(buildingCenterX - unitX, buildingCenterY - unitY)

      // Consider "in base" if within 8 tiles of any player building
      return distance <= 8 * TILE_SIZE
    })
}
