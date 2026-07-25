import { TILE_SIZE, TANK_FIRE_RANGE } from '../config.js'
import { getCachedPath } from '../game/pathfinding.js'
import { isEnemyTo } from './enemyUtils.js'
import { canUnitHitTarget } from './enemyUnitBehaviorShared.js'
import {
  HARVESTER_HUNTER_PATH_REFRESH,
  PLAYER_DEFENSE_RADIUS
} from './enemyUnitBehaviorConstants.js'
import {
  findNearestAIBuildingTile,
  findNearestPlayerDefense,
  findPlayerBaseCenter,
  findRemotePlayerHarvesters,
  isNearPlayerDefense
} from './enemyAirBehavior.js'

export function checkBaseDefenseNeeded(unit, units, gameState, aiPlayerId) {
  const aiBuildings = gameState.buildings.filter(b => b.owner === aiPlayerId && b.health > 0)
  if (aiBuildings.length === 0) return false

  // Check if any player units are near our base
  const playerUnitsNearBase = units.filter(u => {
    if (!isEnemyTo(u, aiPlayerId) || u.health <= 0) return false
    if (!canUnitHitTarget(unit, u)) return false

    return aiBuildings.some(building => {
      const buildingCenterX = (building.x + building.width / 2) * TILE_SIZE
      const buildingCenterY = (building.y + building.height / 2) * TILE_SIZE
      const distance = Math.hypot(
        (u.x + TILE_SIZE / 2) - buildingCenterX,
        (u.y + TILE_SIZE / 2) - buildingCenterY
      )
      return distance < 12 * TILE_SIZE // Within 12 tiles of our base
    })
  })

  // Check if we're already sending enough defenders
  const currentDefenders = units.filter(u =>
    u.owner === aiPlayerId &&
    u.health > 0 &&
    u.defendingBase &&
    (u.type === 'tank' || u.type === 'tank_v1' || u.type === 'tank-v2' || u.type === 'tank-v3' || u.type === 'rocketTank' || u.type === 'howitzer')
  )

  // Need defense if player units near base and we don't have enough defenders
  const needsDefense = playerUnitsNearBase.length > 0 && currentDefenders.length < Math.min(playerUnitsNearBase.length * 2, 6)

  // Only nearby units should defend (within reasonable distance)
  if (needsDefense) {
    const distanceToBase = Math.min(...aiBuildings.map(building => {
      const buildingCenterX = (building.x + building.width / 2) * TILE_SIZE
      const buildingCenterY = (building.y + building.height / 2) * TILE_SIZE
      return Math.hypot(
        (unit.x + TILE_SIZE / 2) - buildingCenterX,
        (unit.y + TILE_SIZE / 2) - buildingCenterY
      )
    }))

    return distanceToBase < 20 * TILE_SIZE // Only units within 20 tiles should defend
  }

  return false
}

/**
 * Finds the best target for base defense
 */
export function findBaseDefenseTarget(unit, units, gameState, aiPlayerId) {
  const aiBuildings = gameState.buildings.filter(b => b.owner === aiPlayerId && b.health > 0)
  if (aiBuildings.length === 0) return null

  // Find player units threatening our base
  const threats = units.filter(u => {
    if (!isEnemyTo(u, aiPlayerId) || u.health <= 0) return false
    if (!canUnitHitTarget(unit, u)) return false

    return aiBuildings.some(building => {
      const buildingCenterX = (building.x + building.width / 2) * TILE_SIZE
      const buildingCenterY = (building.y + building.height / 2) * TILE_SIZE
      const distance = Math.hypot(
        (u.x + TILE_SIZE / 2) - buildingCenterX,
        (u.y + TILE_SIZE / 2) - buildingCenterY
      )
      return distance < 12 * TILE_SIZE
    })
  })

  if (threats.length === 0) return null

  // Find closest threat to our unit
  let closestThreat = null
  let closestDistance = Infinity

  threats.forEach(threat => {
    const distance = Math.hypot(
      (threat.x + TILE_SIZE / 2) - (unit.x + TILE_SIZE / 2),
      (threat.y + TILE_SIZE / 2) - (unit.y + TILE_SIZE / 2)
    )

    if (distance < closestDistance) {
      closestDistance = distance
      closestThreat = threat
    }
  })

  return closestThreat
}

// Handle ambulance AI behavior
export function updateAmbulanceAI(unit, units, gameState, mapGrid, now, aiPlayerId) {
  // Skip if ambulance is on critical healing mission (should have priority)
  if (unit.criticalHealing) return

  // Skip if already refilling or healing
  if (unit.refillingTarget || unit.healingTarget) return

  // Check if ambulance needs refilling
  if (unit.crew < 4) {
    const hospitals = gameState.buildings?.filter(b =>
      b.type === 'hospital' &&
      b.owner === aiPlayerId &&
      b.health > 0
    )

    if (hospitals.length > 0 && !unit.refillingTarget) {
      // Send to hospital for refilling
      unit.refillingTarget = hospitals[0]
      const hospitalCenterX = hospitals[0].x + Math.floor(hospitals[0].width / 2)
      const refillY = hospitals[0].y + hospitals[0].height + 1

      const startNode = { x: unit.tileX, y: unit.tileY, owner: unit.owner }
      const targetTile = { x: hospitalCenterX, y: refillY }
      const path = getCachedPath(startNode, targetTile, mapGrid, gameState.occupancyMap, { unitOwner: unit.owner })
      if (path && path.length > 0) {
        unit.path = path
        unit.moveTarget = { x: hospitalCenterX * TILE_SIZE, y: refillY * TILE_SIZE }
      }
    }
    return
  }

  // Look for nearby units that need healing
  const unitsNeedingHealing = units.filter(u =>
    u.owner === aiPlayerId &&
    u !== unit &&
    u.crew &&
    typeof u.crew === 'object' &&
    Object.values(u.crew).some(alive => !alive) &&
    Math.hypot(u.x - unit.x, u.y - unit.y) < 15 * TILE_SIZE
  )

  if (unitsNeedingHealing.length > 0) {
    // Prioritize units that cannot move (excluding ambulance which doesn't use the crew system)
    const immobileUnits = unitsNeedingHealing.filter(u =>
      u.crew && u.type !== 'ambulance' && (!u.crew.driver || !u.crew.commander)
    )
    const targetUnit = immobileUnits.length > 0 ? immobileUnits[0] : unitsNeedingHealing[0]

    unit.healingTarget = targetUnit
    unit.healingTimer = 0
    unit.target = null
    unit.moveTarget = null
    unit.path = []
  }
}

export function updateHarvesterHunterTank(unit, units, gameState, mapGrid, now, aiPlayerId) {
  unit.defendingBase = false

  const playerBaseCenter = findPlayerBaseCenter(gameState, aiPlayerId)
  const remoteHarvesters = findRemotePlayerHarvesters(units, gameState, playerBaseCenter, aiPlayerId)

  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2
  // SELF-DEFENSE: If being attacked by enemy tanks, prioritize fighting back
  // Check for nearby enemy tanks that might be attacking us
  const nearbyEnemyTanks = units.filter(u => {
    if (u.owner === unit.owner || u.type === 'harvester' || u.health <= 0) return false
    if (!canUnitHitTarget(unit, u)) return false

    const dist = Math.hypot(
      (u.x + TILE_SIZE / 2) - unitCenterX,
      (u.y + TILE_SIZE / 2) - unitCenterY
    )

    // Consider tanks within fire range as threats
    return dist <= TANK_FIRE_RANGE * TILE_SIZE * 1.5
  })

  // If there are enemy tanks nearby, fight them instead of pursuing harvesters
  if (nearbyEnemyTanks.length > 0) {
    // Target the closest enemy tank
    nearbyEnemyTanks.sort((a, b) => {
      const aDist = Math.hypot((a.x + TILE_SIZE / 2) - unitCenterX, (a.y + TILE_SIZE / 2) - unitCenterY)
      const bDist = Math.hypot((b.x + TILE_SIZE / 2) - unitCenterX, (b.y + TILE_SIZE / 2) - unitCenterY)
      return aDist - bDist
    })

    const threatTank = nearbyEnemyTanks[0]
    unit.target = threatTank
    unit.allowedToAttack = true

    // Stop moving and engage in combat
    unit.path = []
    unit.moveTarget = null
    unit.lastDecisionTime = now
    return
  }

  const nearDefense = isNearPlayerDefense(unitCenterX, unitCenterY, gameState)

  if (!nearDefense) {
    unit.retreatingFromDefense = false
    unit.harvesterHunterRetreatTarget = null
    if (!unit.lastSafeTile || unit.lastSafeTile.x !== unit.tileX || unit.lastSafeTile.y !== unit.tileY) {
      unit.lastSafeTile = { x: unit.tileX, y: unit.tileY }
    }
  }

  if (nearDefense) {
    // Calculate retreat position: move away from nearest defense to just outside its range
    const nearestDefense = findNearestPlayerDefense(unitCenterX, unitCenterY, gameState)
    let retreatTile = null

    if (nearestDefense) {
      // Calculate direction away from the defense
      const dx = unitCenterX - nearestDefense.centerX
      const dy = unitCenterY - nearestDefense.centerY
      const distance = Math.hypot(dx, dy)

      if (distance > 0) {
        // Normalize direction and move to safe distance (defense radius + 3 tiles buffer)
        const safeDistance = (PLAYER_DEFENSE_RADIUS + 3 * TILE_SIZE) / TILE_SIZE
        const retreatX = Math.floor(nearestDefense.centerX / TILE_SIZE + (dx / distance) * safeDistance)
        const retreatY = Math.floor(nearestDefense.centerY / TILE_SIZE + (dy / distance) * safeDistance)

        // Clamp to map bounds
        retreatTile = {
          x: Math.max(0, Math.min(mapGrid[0].length - 1, retreatX)),
          y: Math.max(0, Math.min(mapGrid.length - 1, retreatY))
        }
      }
    }

    // Fallback to last safe tile if calculation failed
    if (!retreatTile) {
      retreatTile = unit.lastSafeTile || findNearestAIBuildingTile(unit, gameState, aiPlayerId)
    }

    if (retreatTile) {
      if (
        !unit.harvesterHunterRetreatTarget ||
        unit.harvesterHunterRetreatTarget.x !== retreatTile.x ||
        unit.harvesterHunterRetreatTarget.y !== retreatTile.y ||
        !unit.path ||
        unit.path.length === 0 ||
        (unit.lastPathCalcTime && now - unit.lastPathCalcTime > HARVESTER_HUNTER_PATH_REFRESH)
      ) {
        const path = getCachedPath(
          { x: unit.tileX, y: unit.tileY, owner: unit.owner },
          retreatTile,
          mapGrid,
          gameState.occupancyMap,
          { unitOwner: unit.owner }
        )
        unit.path = path.length > 1 ? path.slice(1) : []
        unit.lastPathCalcTime = now
      }
      unit.harvesterHunterRetreatTarget = retreatTile
      unit.moveTarget = {
        x: (retreatTile.x + 0.5) * TILE_SIZE,
        y: (retreatTile.y + 0.5) * TILE_SIZE
      }
    } else {
      unit.path = []
      unit.moveTarget = null
    }

    unit.target = null
    unit.retreatingFromDefense = true
    unit.harvesterHunterPathTarget = null
    unit.lastDecisionTime = now
    return
  }

  if (unit.retreatingFromDefense && unit.harvesterHunterRetreatTarget) {
    const retreatTarget = unit.harvesterHunterRetreatTarget
    const distanceToRetreatTarget = Math.hypot(
      (retreatTarget.x + 0.5) * TILE_SIZE - unitCenterX,
      (retreatTarget.y + 0.5) * TILE_SIZE - unitCenterY
    )

    // Reached retreat position (within 1.5 tiles)
    if (distanceToRetreatTarget < 1.5 * TILE_SIZE) {
      unit.retreatingFromDefense = false
      unit.harvesterHunterRetreatTarget = null
      unit.path = [] // Stop moving
      unit.moveTarget = null

      // Update last safe tile to current position
      unit.lastSafeTile = { x: unit.tileX, y: unit.tileY }
    }

    // While retreating, still check for harvesters in range and attack them
    if (remoteHarvesters.length > 0) {
      // Find closest harvester within attack range
      const harvesterInRange = remoteHarvesters.find(h => {
        const dist = Math.hypot(
          (h.x + TILE_SIZE / 2) - unitCenterX,
          (h.y + TILE_SIZE / 2) - unitCenterY
        )
        return dist <= TANK_FIRE_RANGE * TILE_SIZE
      })

      if (harvesterInRange) {
        // Stop retreating and engage the harvester
        unit.target = harvesterInRange
        unit.allowedToAttack = true
        unit.retreatingFromDefense = false
        unit.harvesterHunterRetreatTarget = null
        unit.path = []
        unit.moveTarget = null
        unit.lastDecisionTime = now
        return
      }
    }

    // Continue retreating
    return
  }

  if (remoteHarvesters.length > 0) {
    // Sort by distance to find closest harvester
    remoteHarvesters.sort((a, b) => {
      const aDist = Math.hypot(
        (a.x + TILE_SIZE / 2) - unitCenterX,
        (a.y + TILE_SIZE / 2) - unitCenterY
      )
      const bDist = Math.hypot(
        (b.x + TILE_SIZE / 2) - unitCenterX,
        (b.y + TILE_SIZE / 2) - unitCenterY
      )
      return aDist - bDist
    })

    const targetHarvester = remoteHarvesters[0]
    const _distanceToHarvester = Math.hypot(
      (targetHarvester.x + TILE_SIZE / 2) - unitCenterX,
      (targetHarvester.y + TILE_SIZE / 2) - unitCenterY
    )

    // Set as target for shooting
    if (!unit.target || unit.target.id !== targetHarvester.id) {
      unit.target = targetHarvester
      unit.lastTargetChangeTime = now
    }

    // Enable attacking so the combat system allows firing
    unit.allowedToAttack = true

    // Always pursue remote harvesters - move to intercept them
    const desiredTile = { x: targetHarvester.tileX, y: targetHarvester.tileY }
    if (
      !unit.harvesterHunterPathTarget ||
      unit.harvesterHunterPathTarget.x !== desiredTile.x ||
      unit.harvesterHunterPathTarget.y !== desiredTile.y ||
      !unit.path ||
      unit.path.length === 0 ||
      (unit.lastPathCalcTime && now - unit.lastPathCalcTime > HARVESTER_HUNTER_PATH_REFRESH)
    ) {
      const path = getCachedPath(
        { x: unit.tileX, y: unit.tileY, owner: unit.owner },
        desiredTile,
        mapGrid,
        gameState.occupancyMap,
        { unitOwner: unit.owner }
      )
      unit.path = path.length > 1 ? path.slice(1) : []
      unit.lastPathCalcTime = now
      unit.harvesterHunterPathTarget = desiredTile
    }

    unit.moveTarget = {
      x: targetHarvester.x + TILE_SIZE / 2,
      y: targetHarvester.y + TILE_SIZE / 2
    }

    unit.harvesterHunterRetreatTarget = null
    unit.lastDecisionTime = now
    return
  }

  // No remote harvesters found and not retreating - hold position at last safe tile
  unit.target = null
  unit.harvesterHunterPathTarget = null

  // If we don't have a last safe tile yet, or we're too far from it, move there
  if (!unit.lastSafeTile) {
    unit.lastSafeTile = { x: unit.tileX, y: unit.tileY }
  }

  const distanceToSafeTile = Math.hypot(
    (unit.lastSafeTile.x + 0.5) * TILE_SIZE - unitCenterX,
    (unit.lastSafeTile.y + 0.5) * TILE_SIZE - unitCenterY
  )

  // Only move back to safe tile if we're more than 5 tiles away from it
  if (distanceToSafeTile > 5 * TILE_SIZE) {
    if (
      !unit.harvesterHunterRetreatTarget ||
      unit.harvesterHunterRetreatTarget.x !== unit.lastSafeTile.x ||
      unit.harvesterHunterRetreatTarget.y !== unit.lastSafeTile.y ||
      !unit.path ||
      unit.path.length === 0 ||
      (unit.lastPathCalcTime && now - unit.lastPathCalcTime > HARVESTER_HUNTER_PATH_REFRESH)
    ) {
      const path = getCachedPath(
        { x: unit.tileX, y: unit.tileY, owner: unit.owner },
        unit.lastSafeTile,
        mapGrid,
        gameState.occupancyMap,
        { unitOwner: unit.owner }
      )
      unit.path = path.length > 1 ? path.slice(1) : []
      unit.lastPathCalcTime = now
      unit.harvesterHunterRetreatTarget = unit.lastSafeTile
    }
    unit.moveTarget = {
      x: (unit.lastSafeTile.x + 0.5) * TILE_SIZE,
      y: (unit.lastSafeTile.y + 0.5) * TILE_SIZE
    }
  } else {
    // Close enough to safe position - hold position and wait
    unit.path = []
    unit.moveTarget = null
    unit.harvesterHunterRetreatTarget = null
  }

  unit.lastDecisionTime = now
}
