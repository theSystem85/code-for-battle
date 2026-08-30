import { TILE_SIZE } from '../config.js'
import { getCachedPath } from '../game/pathfinding.js'
import { getEffectiveFireRange } from '../game/unitCombat/combatHelpers.js'
import { shouldConductGroupAttack } from './enemyStrategies.js'
import { getEnemyPlayers } from './enemyUtils.js'

const ATTACK_DESTINATION_PATH_ATTEMPT_LIMIT = 16

function isAirborneAirUnit(target) {
  if (!target) return false
  const isAirUnitType = target.type === 'apache' || target.type === 'f22Raptor' || target.type === 'f35'
  return isAirUnitType && target.flightState !== 'grounded'
}

export function canUnitHitTarget(shooter, target) {
  if (!shooter || !target) return false
  if (!isAirborneAirUnit(target)) return true
  return shooter.type === 'rocketTank' || shooter.type === 'apache' || shooter.type === 'f22Raptor'
}


export function getEnemyOwnersSet(aiPlayerId, state) {
  return new Set(getEnemyPlayers(aiPlayerId, state))
}

export function findReachableAttackDestination(unit, target, mapGrid, occupancyMap) {
  if (!unit || !target || !Array.isArray(mapGrid) || mapGrid.length === 0 || !Array.isArray(mapGrid[0])) {
    return null
  }

  const startNode = { x: unit.tileX, y: unit.tileY, owner: unit.owner }
  const directDestination = target.tileX !== undefined
    ? { x: target.tileX, y: target.tileY }
    : { x: target.x, y: target.y }

  const directPath = getCachedPath(
    startNode,
    directDestination,
    mapGrid,
    occupancyMap,
    { unitOwner: unit.owner }
  )

  if (directPath.length > 1 || target.tileX === undefined) {
    return {
      destination: directDestination,
      path: directPath
    }
  }

  const fireRangeTiles = Math.max(1, Math.floor(getEffectiveFireRange(unit) / TILE_SIZE))
  const mapHeight = mapGrid.length
  const mapWidth = mapGrid[0].length
  let bestCandidate = null
  const candidates = []

  for (let y = target.tileY - fireRangeTiles; y <= target.tileY + fireRangeTiles; y++) {
    for (let x = target.tileX - fireRangeTiles; x <= target.tileX + fireRangeTiles; x++) {
      if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) {
        continue
      }

      if (x === target.tileX && y === target.tileY) {
        continue
      }

      if (Math.hypot(x - target.tileX, y - target.tileY) > fireRangeTiles) {
        continue
      }

      const tile = mapGrid[y][x]
      if (!tile || tile.type === 'water' || tile.type === 'rock' || tile.seedCrystal || tile.building) {
        continue
      }

      candidates.push({
        x,
        y,
        heuristic: Math.hypot(x - unit.tileX, y - unit.tileY) + Math.hypot(x - target.tileX, y - target.tileY) * 0.25
      })
    }
  }

  candidates.sort((a, b) => a.heuristic - b.heuristic)

  for (const candidate of candidates.slice(0, ATTACK_DESTINATION_PATH_ATTEMPT_LIMIT)) {
    const candidatePath = getCachedPath(
      startNode,
      { x: candidate.x, y: candidate.y },
      mapGrid,
      occupancyMap,
      { unitOwner: unit.owner, strictDestination: true }
    )

    if (candidatePath.length <= 1) {
      continue
    }

    const candidateScore = candidatePath.length + Math.hypot(candidate.x - target.tileX, candidate.y - target.tileY) * 0.25
    if (!bestCandidate || candidateScore < bestCandidate.score) {
      bestCandidate = {
        destination: { x: candidate.x, y: candidate.y },
        path: candidatePath,
        score: candidateScore
      }
    }
  }

  if (!bestCandidate) {
    return {
      destination: directDestination,
      path: directPath
    }
  }

  return {
    destination: bestCandidate.destination,
    path: bestCandidate.path
  }
}

function usesGroupAttackPermission(unit) {
  return !unit?.harvesterHunter && (
    unit.type === 'tank' ||
    unit.type === 'tank_v1' ||
    unit.type === 'tank-v2' ||
    unit.type === 'tank-v3' ||
    unit.type === 'rocketTank' ||
    unit.type === 'howitzer'
  )
}

export function syncAttackPermissionForCurrentTarget(unit, units, gameState) {
  if (!usesGroupAttackPermission(unit) || !unit.target) {
    return
  }

  // Group-attack strategy updates are throttled to reduce movement churn, but
  // firing permission must still track the current target every tick.
  unit.allowedToAttack = shouldConductGroupAttack(unit, units, gameState, unit.target)
}
