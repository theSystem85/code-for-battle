import { AI_DECISION_INTERVAL, TILE_SIZE } from '../config.js'
import { getEffectiveFireRange } from '../game/unitCombat/combatHelpers.js'
import { isEnemyTo } from './enemyUtils.js'
import { getEnemyOwnersSet } from './enemyUnitBehaviorShared.js'
import {
  PLAYER_DEFENSE_BUILDINGS,
  PLAYER_DEFENSE_RADIUS
} from './enemyUnitBehaviorConstants.js'
import {
  findApacheStrikeTarget,
  getAntiAirThreatSources,
  getF22SafeApproachWaypoint,
  getUnitCenter,
  isAirDefenseNearby
} from './enemyAirTargeting.js'

export function findPlayerBaseCenter(gameState, aiPlayerId) {
  if (!gameState?.buildings) {
    return null
  }

  const enemyOwners = getEnemyOwnersSet(aiPlayerId, gameState)
  const playerBuildings = gameState.buildings.filter(
    b => enemyOwners.has(b.owner) && b.health > 0
  )

  if (playerBuildings.length === 0) return null

  const baseBuilding =
    playerBuildings.find(b => b.type === 'constructionYard') || playerBuildings[0]

  return {
    x: (baseBuilding.x + (baseBuilding.width || 1) / 2) * TILE_SIZE,
    y: (baseBuilding.y + (baseBuilding.height || 1) / 2) * TILE_SIZE
  }
}

function getPlayerDefensiveBuildings(gameState, aiPlayerId) {
  if (!gameState?.buildings) {
    return []
  }

  const enemyOwners = getEnemyOwnersSet(aiPlayerId, gameState)
  return gameState.buildings.filter(
    b => enemyOwners.has(b.owner) && PLAYER_DEFENSE_BUILDINGS.has(b.type)
  )
}

export function isNearPlayerDefense(x, y, gameState, aiPlayerId) {
  const defenses = getPlayerDefensiveBuildings(gameState, aiPlayerId)
  if (defenses.length === 0) return false

  return defenses.some(defense => {
    const centerX = (defense.x + (defense.width || 1) / 2) * TILE_SIZE
    const centerY = (defense.y + (defense.height || 1) / 2) * TILE_SIZE
    return Math.hypot(x - centerX, y - centerY) < PLAYER_DEFENSE_RADIUS
  })
}

export function findNearestPlayerDefense(x, y, gameState, aiPlayerId) {
  const defenses = getPlayerDefensiveBuildings(gameState, aiPlayerId)
  if (defenses.length === 0) return null

  let nearest = null
  let nearestDist = Infinity

  defenses.forEach(defense => {
    const centerX = (defense.x + (defense.width || 1) / 2) * TILE_SIZE
    const centerY = (defense.y + (defense.height || 1) / 2) * TILE_SIZE
    const dist = Math.hypot(x - centerX, y - centerY)

    if (dist < nearestDist) {
      nearestDist = dist
      nearest = { defense, centerX, centerY, distance: dist }
    }
  })

  return nearest
}

export function findRemotePlayerHarvesters(units, gameState, baseCenter, aiPlayerId) {
  const enemyOwners = getEnemyOwnersSet(aiPlayerId, gameState)
  if (enemyOwners.size === 0) return []

  return units.filter(unit => {
    if (!enemyOwners.has(unit.owner)) return false
    if (unit.type !== 'harvester' || unit.health <= 0) return false
    return isHarvesterRemote(unit, baseCenter, gameState, aiPlayerId)
  })
}

function isHarvesterRemote(harvester, baseCenter, gameState, aiPlayerId) {
  const centerX = harvester.x + TILE_SIZE / 2
  const centerY = harvester.y + TILE_SIZE / 2

  // Main requirement: harvester must NOT be near player defenses
  if (isNearPlayerDefense(centerX, centerY, gameState, aiPlayerId)) {
    return false
  }

  // Secondary requirement: harvester must be actively working (harvesting or carrying ore)
  if (!harvester.harvesting && harvester.oreCarried <= 0) {
    return false
  }

  // If not near defenses and actively working, it's a valid target
  // Distance from base is less important than whether it's protected by defenses
  return true
}

export function findNearestAIBuildingTile(unit, gameState, aiPlayerId) {
  if (!gameState?.buildings) return null

  const aiBuildings = gameState.buildings.filter(
    b => b.owner === aiPlayerId && b.health > 0
  )
  if (aiBuildings.length === 0) return null

  let closestTile = null
  let closestDistance = Infinity

  aiBuildings.forEach(building => {
    const centerTile = {
      x: Math.floor(building.x + (building.width || 1) / 2),
      y: Math.floor(building.y + (building.height || 1) / 2)
    }

    const distance = Math.hypot(
      (centerTile.x + 0.5) * TILE_SIZE - (unit.x + TILE_SIZE / 2),
      (centerTile.y + 0.5) * TILE_SIZE - (unit.y + TILE_SIZE / 2)
    )

    if (distance < closestDistance) {
      closestDistance = distance
      closestTile = centerTile
    }
  })

  return closestTile
}

export function updateApacheAI(unit, units, gameState, mapGrid, now, aiPlayerId) {
  // Aircraft service themselves at helipads/airstrips. Do not let strategic
  // targeting replace an active return plan once their weapons are empty.
  if (unit.type === 'apache' && typeof unit.maxRocketAmmo === 'number' && (unit.rocketAmmo || 0) <= 0) {
    unit.allowedToAttack = false
    unit.path = []
    unit.moveTarget = null
    return
  }

  const allowDecision = !unit.lastDecisionTime || (now - unit.lastDecisionTime >= AI_DECISION_INTERVAL)
  const unitCenter = getUnitCenter(unit)
  const nearDefense = isAirDefenseNearby(unitCenter, units, gameState)
  const airTarget = findEnemyApacheInRange(unit, units, gameState)

  if (airTarget) {
    if (unit.target !== airTarget) {
      if (unit.target && unit.target.type !== 'apache') {
        unit.apacheResumeTarget = unit.target
      }
      unit.target = airTarget
      unit.allowedToAttack = true
      unit.lastTargetChangeTime = now
    }
    unit.path = []
    unit.moveTarget = null
    unit.lastDecisionTime = now
    return
  }

  if (unit.target && unit.target.type === 'apache' && unit.apacheResumeTarget) {
    unit.target = unit.apacheResumeTarget
    unit.apacheResumeTarget = null
  }

  if (nearDefense || unit.airDefenseRetreating) {
    const safeTile = findNearestAIBuildingTile(unit, gameState, aiPlayerId)
    unit.airDefenseRetreating = true
    unit.target = null

    if (safeTile) {
      unit.path = []
      unit.moveTarget = null
      const retreatTarget = {
        x: (safeTile.x + 0.5) * TILE_SIZE,
        y: (safeTile.y + 0.5) * TILE_SIZE
      }
      unit.flightPlan = {
        x: retreatTarget.x,
        y: retreatTarget.y,
        stopRadius: TILE_SIZE * 0.6,
        mode: 'retreat',
        followTargetId: null,
        destinationTile: { ...safeTile }
      }
      unit.lastDecisionTime = now

      const distanceToBase = Math.hypot(retreatTarget.x - unitCenter.x, retreatTarget.y - unitCenter.y)
      if (!nearDefense && distanceToBase < TILE_SIZE * 2) {
        unit.airDefenseRetreating = false
      }
    } else {
      unit.airDefenseRetreating = false
    }
    return
  }

  if (!allowDecision) {
    return
  }

  const target = findApacheStrikeTarget(units, gameState, unit)

  if (!target) {
    unit.target = null
    unit.moveTarget = null
    unit.path = []
    unit.lastDecisionTime = now
    return
  }

  unit.target = target
  unit.allowedToAttack = true

  if (unit.type === 'f22Raptor' && unit.health > 0 && unit.flightState === 'grounded') {
    unit.f22PendingTakeoff = true
  }

  unit.lastTargetChangeTime = now
  unit.lastDecisionTime = now

  const targetTile = target.tileX !== undefined
    ? { x: target.tileX, y: target.tileY }
    : { x: target.x, y: target.y }

  const f22ThreatSources = unit.type === 'f22Raptor'
    ? getAntiAirThreatSources(units, gameState, unit.owner)
    : []
  const safeApproachWaypoint = unit.type === 'f22Raptor'
    ? getF22SafeApproachWaypoint(unit, target, f22ThreatSources, mapGrid)
    : null

  unit.moveTarget = null
  unit.path = []
  unit.flightPlan = {
    x: safeApproachWaypoint?.x ?? (targetTile.x + 0.5) * TILE_SIZE,
    y: safeApproachWaypoint?.y ?? (targetTile.y + 0.5) * TILE_SIZE,
    stopRadius: safeApproachWaypoint?.stopRadius ?? TILE_SIZE * 0.6,
    mode: 'attack',
    followTargetId: target.id || null,
    destinationTile: { ...targetTile }
  }
}

function findEnemyApacheInRange(unit, units, _gameState) {
  if (!unit || !Array.isArray(units)) {
    return null
  }

  const effectiveRange = getEffectiveFireRange(unit)
  const unitCenter = getUnitCenter(unit)
  const enemyApaches = units.filter(candidate =>
    candidate &&
    candidate.type === 'apache' &&
    candidate.health > 0 &&
    isEnemyTo(candidate, unit.owner)
  )

  let bestTarget = null
  let bestDistance = Infinity
  enemyApaches.forEach(candidate => {
    const candidateCenter = getUnitCenter(candidate)
    const distance = Math.hypot(candidateCenter.x - unitCenter.x, candidateCenter.y - unitCenter.y)
    if (distance <= effectiveRange && distance < bestDistance) {
      bestTarget = candidate
      bestDistance = distance
    }
  })

  return bestTarget
}
