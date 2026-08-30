import { AI_DECISION_INTERVAL, TILE_SIZE } from '../config.js'
import { getCachedPath } from '../game/pathfinding.js'
import { canUnitTargetEntity, getEffectiveFireRange } from '../game/unitCombat/combatHelpers.js'
import {
  getNavalPathOptions,
  getShipyardServiceWaterTiles,
  isNavalUnitInShipyardServiceArea
} from '../utils/navalUtils.js'
import { isEnemyTo } from './enemyUtils.js'

function getNavalTargetCenter(target) {
  if (target?.tileX !== undefined) {
    return {
      worldX: target.x + TILE_SIZE / 2,
      worldY: target.y + TILE_SIZE / 2,
      tileX: target.tileX,
      tileY: target.tileY
    }
  }

  return {
    worldX: (target.x + (target.width || 1) / 2) * TILE_SIZE,
    worldY: (target.y + (target.height || 1) / 2) * TILE_SIZE,
    tileX: Math.floor(target.x + (target.width || 1) / 2),
    tileY: Math.floor(target.y + (target.height || 1) / 2)
  }
}

function findBestNavalPath(unit, candidateTiles, mapGrid, occupancyMap) {
  const start = { x: unit.tileX, y: unit.tileY, owner: unit.owner }
  const options = { ...getNavalPathOptions(unit), strictDestination: true }
  const ordered = candidateTiles
    .map(tile => ({ ...tile, score: Math.hypot(tile.x - unit.tileX, tile.y - unit.tileY) }))
    .sort((a, b) => a.score - b.score)

  // Naval candidates can each require a full 200x200-map search. Try the nearest
  // few per decision and retry later instead of blocking one simulation tick.
  for (const candidate of ordered.slice(0, 2)) {
    const path = getCachedPath(start, candidate, mapGrid, occupancyMap, options)
    if (path.length > 0) {
      return { destination: { x: candidate.x, y: candidate.y }, path }
    }
  }

  return null
}

function isPathAttemptDue(lastAttemptTime, now) {
  return !Number.isFinite(lastAttemptTime) || now - lastAttemptTime >= AI_DECISION_INTERVAL
}

function findNavalAttackPath(unit, target, mapGrid, occupancyMap) {
  const targetCenter = getNavalTargetCenter(target)
  const fireRangeTiles = Math.max(1, Math.floor(getEffectiveFireRange(unit) / TILE_SIZE))
  const candidates = []

  for (let y = Math.max(0, targetCenter.tileY - fireRangeTiles); y <= Math.min(mapGrid.length - 1, targetCenter.tileY + fireRangeTiles); y++) {
    for (let x = Math.max(0, targetCenter.tileX - fireRangeTiles); x <= Math.min(mapGrid[0].length - 1, targetCenter.tileX + fireRangeTiles); x++) {
      if (mapGrid[y]?.[x]?.type !== 'water' || mapGrid[y][x].building || mapGrid[y][x].seedCrystal) continue
      if (Math.hypot(x - targetCenter.tileX, y - targetCenter.tileY) > fireRangeTiles - 0.5) continue
      candidates.push({ x, y })
    }
  }

  return findBestNavalPath(unit, candidates, mapGrid, occupancyMap)
}

function findNavalAttackTarget(unit, units, gameState, aiPlayerId) {
  if (unit.lastAttacker?.health > 0 && isEnemyTo(unit.lastAttacker, aiPlayerId)) {
    if (canUnitTargetEntity(unit, unit.lastAttacker)) return unit.lastAttacker
  }
  if (unit.type === 'destroyer') {
    const attackingAircraft = units
      .filter(candidate => candidate?.health > 0 && candidate.isAirUnit && isEnemyTo(candidate, aiPlayerId) &&
        (candidate.target === unit || candidate.guardTarget === unit || candidate.lastAttacker === unit))
      .sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y))
    if (attackingAircraft.length > 0) return attackingAircraft[0]
  }
  const enemyShips = units
    .filter(candidate => candidate !== unit && candidate.isNaval && candidate.health > 0 && isEnemyTo(candidate, aiPlayerId) && (candidate.type !== 'submarine' || candidate.depthState === 'surfaced'))
    .sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y))
  const priority = ['constructionYard', 'shipyard', 'vehicleFactory', 'oreRefinery', 'powerPlant']
  const enemyBuildings = [...(gameState.buildings || []), ...(gameState.factories || [])]
    .filter((building, index, entries) =>
      building.health > 0 &&
      isEnemyTo(building, aiPlayerId) &&
      canUnitTargetEntity(unit, building) &&
      entries.findIndex(candidate => candidate === building || (candidate.id && candidate.id === building.id)) === index
    )
  enemyBuildings.sort((a, b) => {
    const priorityA = priority.indexOf(a.type)
    const priorityB = priority.indexOf(b.type)
    const rankA = priorityA === -1 ? priority.length : priorityA
    const rankB = priorityB === -1 ? priority.length : priorityB
    if (rankA !== rankB) return rankA - rankB
    const centerA = getNavalTargetCenter(a)
    const centerB = getNavalTargetCenter(b)
    return Math.hypot(centerA.worldX - unit.x, centerA.worldY - unit.y) -
      Math.hypot(centerB.worldX - unit.x, centerB.worldY - unit.y)
  })
  if (enemyShips.length > 0) return enemyShips[0]
  if (unit.type === 'submarine') return enemyBuildings[0] || null

  const enemyLandUnits = units
    .filter(candidate =>
      candidate !== unit &&
      !candidate.isNaval &&
      !candidate.isAirUnit &&
      candidate.type !== 'apache' &&
      candidate.type !== 'f22Raptor' &&
      candidate.type !== 'f35' &&
      candidate.health > 0 &&
      isEnemyTo(candidate, aiPlayerId) &&
      canUnitTargetEntity(unit, candidate))
    .sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y))
  return enemyLandUnits[0] || enemyBuildings[0] || null
}

function getNavalServiceNeeds(unit) {
  const healthRatio = unit.health / Math.max(1, unit.maxHealth || unit.health)
  const fuelRatio = typeof unit.maxGas === 'number' ? (unit.gas || 0) / Math.max(1, unit.maxGas) : 1
  const ammoRatio = typeof unit.maxAmmunition === 'number'
    ? (unit.ammunition || 0) / Math.max(1, unit.maxAmmunition)
    : 1
  const missingCrew = Boolean(unit.crew && Object.values(unit.crew).some(alive => alive === false))
  return {
    health: healthRatio < 0.65,
    criticalHealth: healthRatio < 0.25,
    fuel: fuelRatio < 0.18,
    ammunition: ammoRatio < 0.2,
    crew: missingCrew,
    any: healthRatio < 0.65 || fuelRatio < 0.18 || ammoRatio < 0.2 || missingCrew
  }
}

function supplierCanMeetNeeds(supplier, needs) {
  if (!supplier || supplier.health <= 0) return false
  return (!needs.health || (supplier.supplyRepairTools || 0) > 0) &&
    (!needs.fuel || (supplier.supplyFuel || 0) > 0) &&
    (!needs.ammunition || (supplier.supplyAmmo || 0) > 0) &&
    (!needs.crew || (supplier.supplyCrew || 0) > 0)
}

function hasRecoveredForCombat(unit) {
  const healthReady = unit.health >= Math.max(1, unit.maxHealth || unit.health) * 0.9
  const fuelReady = typeof unit.maxGas !== 'number' || unit.gas >= unit.maxGas * 0.75
  const ammoReady = typeof unit.maxAmmunition !== 'number' || unit.ammunition >= unit.maxAmmunition * 0.75
  const crewReady = !unit.crew || !Object.values(unit.crew).some(alive => alive === false)
  return healthReady && fuelReady && ammoReady && crewReady
}

function updateAISupplyShip(unit, units, gameState, mapGrid, now, aiPlayerId, shipyards) {
  unit.target = null
  unit.navalAttackTarget = null
  unit.allowedToAttack = false
  const friendlyShips = units.filter(candidate =>
    candidate !== unit && candidate.isNaval && candidate.type !== 'supplyShip' &&
    candidate.owner === aiPlayerId && candidate.health > 0 && getNavalServiceNeeds(candidate).any
  )
  const cargoNeedsRefill = (unit.maxSupplyFuel !== undefined && unit.supplyFuel < unit.maxSupplyFuel * 0.1) ||
    (unit.maxSupplyAmmo !== undefined && unit.supplyAmmo < unit.maxSupplyAmmo * 0.1) ||
    (unit.maxSupplyRepairTools !== undefined && unit.supplyRepairTools < unit.maxSupplyRepairTools * 0.1) ||
    (unit.maxSupplyCrew !== undefined && unit.supplyCrew < unit.maxSupplyCrew * 0.1)
  const needsOwnRepair = unit.health < Math.max(1, unit.maxHealth || unit.health) * 0.7

  if (cargoNeedsRefill || needsOwnRepair) unit.returningToShipyard = true
  if (unit.returningToShipyard) {
    const inServiceArea = shipyards.some(shipyard => isNavalUnitInShipyardServiceArea(unit, shipyard, mapGrid))
    if (inServiceArea) {
      unit.path = []
      unit.moveTarget = null
      const cargoReady = (unit.maxSupplyFuel === undefined || unit.supplyFuel >= unit.maxSupplyFuel * 0.8) &&
        (unit.maxSupplyAmmo === undefined || unit.supplyAmmo >= unit.maxSupplyAmmo * 0.8) &&
        (unit.maxSupplyRepairTools === undefined || unit.supplyRepairTools >= unit.maxSupplyRepairTools * 0.8) &&
        (unit.maxSupplyCrew === undefined || unit.supplyCrew >= unit.maxSupplyCrew * 0.8)
      if (cargoReady && unit.health >= Math.max(1, unit.maxHealth || unit.health) * 0.9) unit.returningToShipyard = false
      return
    }
    if (isPathAttemptDue(unit.lastShipyardPathTime, now) && shipyards.length > 0) {
      unit.lastShipyardPathTime = now
      const route = findBestNavalPath(unit, shipyards.flatMap(shipyard => getShipyardServiceWaterTiles(shipyard, mapGrid)), mapGrid, gameState.occupancyMap)
      if (route) {
        unit.path = route.path.slice(1)
        unit.moveTarget = route.destination
      }
    }
    return
  }

  const serviceTarget = friendlyShips
    .filter(candidate => supplierCanMeetNeeds(unit, getNavalServiceNeeds(candidate)))
    .sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y))[0]
  if (!serviceTarget) {
    unit.path = []
    unit.moveTarget = null
    return
  }
  const tileDistance = Math.max(Math.abs(unit.tileX - serviceTarget.tileX), Math.abs(unit.tileY - serviceTarget.tileY))
  if (tileDistance <= (unit.supplyRadiusTiles || 2)) {
    unit.path = []
    unit.moveTarget = null
    return
  }
  if (isPathAttemptDue(unit.lastSupplyDeployPathTime, now)) {
    unit.lastSupplyDeployPathTime = now
    const candidates = []
    for (let y = serviceTarget.tileY - 2; y <= serviceTarget.tileY + 2; y++) {
      for (let x = serviceTarget.tileX - 2; x <= serviceTarget.tileX + 2; x++) {
        if (mapGrid?.[y]?.[x]?.type === 'water') candidates.push({ x, y })
      }
    }
    const route = findBestNavalPath(unit, candidates, mapGrid, gameState.occupancyMap)
    if (route) {
      unit.path = route.path.slice(1)
      unit.moveTarget = route.destination
    }
  }
}

export function updateNavalAIUnit(unit, units, gameState, mapGrid, now, aiPlayerId) {
  unit.allowedToAttack = true
  const shipyards = (gameState.buildings || []).filter(building =>
    building.type === 'shipyard' && building.owner === aiPlayerId && building.health > 0
  )

  if (unit.type === 'supplyShip') {
    updateAISupplyShip(unit, units, gameState, mapGrid, now, aiPlayerId, shipyards)
    return
  }

  const serviceNeeds = getNavalServiceNeeds(unit)
  const suppliers = units.filter(candidate =>
    candidate.type === 'supplyShip' && candidate.owner === aiPlayerId &&
    supplierCanMeetNeeds(candidate, serviceNeeds)
  )

  if (serviceNeeds.any && !unit.navalServiceMode) {
    unit.navalServiceMode = !serviceNeeds.criticalHealth && suppliers.length > 0 ? 'supply' : 'shipyard'
    unit.navalServiceSupplierId = unit.navalServiceMode === 'supply'
      ? suppliers.sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y))[0].id
      : null
    unit.returningToShipyard = unit.navalServiceMode === 'shipyard'
    unit.shipyardResumeTarget = unit.navalAttackTarget || unit.target || null
    unit.target = null
    unit.navalAttackTarget = null
    unit.path = []
  }

  if (unit.navalServiceMode) {
    unit.target = null
    unit.allowedToAttack = false
    if (hasRecoveredForCombat(unit)) {
      unit.navalServiceMode = null
      unit.navalServiceSupplierId = null
      unit.returningToShipyard = false
      unit.navalAttackTarget = unit.shipyardResumeTarget?.health > 0 ? unit.shipyardResumeTarget : null
      unit.shipyardResumeTarget = null
      unit.allowedToAttack = true
      unit.path = []
      unit.moveTarget = null
      return
    }

    if (unit.navalServiceMode === 'supply') {
      const supplier = units.find(candidate => candidate.id === unit.navalServiceSupplierId && supplierCanMeetNeeds(candidate, getNavalServiceNeeds(unit)))
      if (!supplier) {
        unit.navalServiceMode = 'shipyard'
        unit.returningToShipyard = true
        unit.path = []
      } else {
        const distance = Math.max(Math.abs(unit.tileX - supplier.tileX), Math.abs(unit.tileY - supplier.tileY))
        if (distance <= (supplier.supplyRadiusTiles || 2)) {
          unit.path = []
          unit.moveTarget = null
          return
        }
        if (isPathAttemptDue(unit.lastSupplyPathTime, now)) {
          unit.lastSupplyPathTime = now
          const candidates = []
          for (let y = supplier.tileY - 2; y <= supplier.tileY + 2; y++) {
            for (let x = supplier.tileX - 2; x <= supplier.tileX + 2; x++) {
              if (mapGrid?.[y]?.[x]?.type === 'water') candidates.push({ x, y })
            }
          }
          const route = findBestNavalPath(unit, candidates, mapGrid, gameState.occupancyMap)
          if (route) {
            unit.path = route.path.slice(1)
            unit.moveTarget = route.destination
          }
        }
        return
      }
    }

    const serviceShipyard = shipyards.find(shipyard => isNavalUnitInShipyardServiceArea(unit, shipyard, mapGrid))
    if (serviceShipyard) {
      unit.path = []
      unit.moveTarget = null
      return
    }

    const shouldRepath = isPathAttemptDue(unit.lastShipyardPathTime, now)
    if (shouldRepath && shipyards.length > 0) {
      unit.lastShipyardPathTime = now
      const destinations = shipyards.flatMap(shipyard => getShipyardServiceWaterTiles(shipyard, mapGrid))
      const route = findBestNavalPath(unit, destinations, mapGrid, gameState.occupancyMap)
      if (route) {
        unit.path = route.path.slice(1)
        unit.moveTarget = route.destination
      }
    }
    return
  }

  const currentTarget = unit.navalAttackTarget
  if (!currentTarget || currentTarget.health <= 0 || !isEnemyTo(currentTarget, aiPlayerId)) {
    unit.navalAttackTarget = findNavalAttackTarget(unit, units, gameState, aiPlayerId)
  }

  const target = unit.navalAttackTarget
  if (!target) return

  const targetCenter = getNavalTargetCenter(target)
  const distance = Math.hypot(
    targetCenter.worldX - (unit.x + TILE_SIZE / 2),
    targetCenter.worldY - (unit.y + TILE_SIZE / 2)
  )
  if (distance <= getEffectiveFireRange(unit)) {
    unit.target = target
    unit.path = []
    unit.moveTarget = null
    return
  }

  unit.target = null
  const shouldRepath = isPathAttemptDue(unit.lastNavalAttackPathTime, now)
  if (shouldRepath) {
    unit.lastNavalAttackPathTime = now
    const route = findNavalAttackPath(unit, target, mapGrid, gameState.occupancyMap)
    if (route) {
      unit.path = route.path.slice(1)
      unit.moveTarget = route.destination
    }
  }
}
