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

const BASE_DEFENDER_TYPES = new Set(['tank', 'tank_v1', 'tank-v2', 'tank-v3', 'lightTank', 'rocketTank', 'howitzer'])

function createDefenseSnapshot() {
  return { units: null, state: null, owner: null, centerX: [], centerY: [], threats: [], defenders: 0, currentUnit: null, currentWasDefender: false }
}

const defensePass = createDefenseSnapshot()
const standaloneDefense = createDefenseSnapshot()

function isBaseDefender(unit, owner) {
  return unit.owner === owner && unit.health > 0 && unit.defendingBase && BASE_DEFENDER_TYPES.has(unit.type)
}

function prepareDefenseSnapshot(snapshot, units, state, owner) {
  snapshot.units = units
  snapshot.state = state
  snapshot.owner = owner
  snapshot.centerX.length = 0
  snapshot.centerY.length = 0
  snapshot.threats.length = 0
  snapshot.defenders = 0
  for (const building of state.buildings) {
    if (building.owner !== owner || building.health <= 0) continue
    snapshot.centerX.push((building.x + building.width / 2) * TILE_SIZE)
    snapshot.centerY.push((building.y + building.height / 2) * TILE_SIZE)
  }
  const radiusSquared = (12 * TILE_SIZE) ** 2
  for (const candidate of units) {
    if (isBaseDefender(candidate, owner)) snapshot.defenders++
    if (!isEnemyTo(candidate, owner) || candidate.health <= 0) continue
    for (let index = 0; index < snapshot.centerX.length; index++) {
      const dx = candidate.x + TILE_SIZE / 2 - snapshot.centerX[index]
      const dy = candidate.y + TILE_SIZE / 2 - snapshot.centerY[index]
      if (dx * dx + dy * dy < radiusSquared) {
        snapshot.threats.push(candidate)
        break
      }
    }
  }
  return snapshot
}

// Scoped to the synchronous unit-decision pass, never cached across ticks.
export function beginBaseDefensePass(units, state, owner) {
  prepareDefenseSnapshot(defensePass, units, state, owner)
}

export function beginBaseDefenseUnit(unit) {
  defensePass.currentUnit = unit
  defensePass.currentWasDefender = Boolean(isBaseDefender(unit, defensePass.owner))
}

export function finishBaseDefenseUnit(unit) {
  defensePass.defenders += Number(Boolean(isBaseDefender(unit, defensePass.owner))) - Number(defensePass.currentWasDefender)
  defensePass.currentUnit = null
}

export function endBaseDefensePass() {
  defensePass.units = null
  defensePass.state = null
  defensePass.owner = null
  defensePass.currentUnit = null
  defensePass.threats.length = 0
}

function getDefenseSnapshot(units, state, owner) {
  if (defensePass.units === units && defensePass.state === state && defensePass.owner === owner) return defensePass
  // Callers outside updateAIPlayer still get fresh state on each request.
  return prepareDefenseSnapshot(standaloneDefense, units, state, owner)
}

export function checkBaseDefenseNeeded(unit, units, gameState, aiPlayerId) {
  const snapshot = getDefenseSnapshot(units, gameState, aiPlayerId)
  let threatCount = 0
  for (const threat of snapshot.threats) {
    if (canUnitHitTarget(unit, threat)) threatCount++
  }
  if (threatCount === 0) return false
  let defenders = snapshot.defenders
  if (snapshot.currentUnit === unit) {
    defenders += Number(Boolean(isBaseDefender(unit, aiPlayerId))) - Number(snapshot.currentWasDefender)
  }
  if (defenders >= Math.min(threatCount * 2, 6)) return false
  const radiusSquared = (20 * TILE_SIZE) ** 2
  for (let index = 0; index < snapshot.centerX.length; index++) {
    const dx = unit.x + TILE_SIZE / 2 - snapshot.centerX[index]
    const dy = unit.y + TILE_SIZE / 2 - snapshot.centerY[index]
    if (dx * dx + dy * dy < radiusSquared) return true
  }
  return false
}

/**
 * Finds the best target for base defense
 */
export function findBaseDefenseTarget(unit, units, gameState, aiPlayerId) {
  const snapshot = getDefenseSnapshot(units, gameState, aiPlayerId)
  let closestThreat = null
  let closestDistance = Infinity
  for (const threat of snapshot.threats) {
    if (!canUnitHitTarget(unit, threat)) continue
    const dx = threat.x - unit.x
    const dy = threat.y - unit.y
    const distance = dx * dx + dy * dy
    if (distance < closestDistance) {
      closestDistance = distance
      closestThreat = threat
    }
  }

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
      !unit.lastPathCalcTime ||
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
