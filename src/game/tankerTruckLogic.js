import { GAS_REFILL_TIME, TANKER_SUPPLY_CAPACITY, SERVICE_DISCOVERY_RANGE, SERVICE_SERVING_RANGE, TILE_SIZE } from '../config.js'
import { logPerformance } from '../performanceUtils.js'
import { findPath } from '../units.js'
import { stopUnitMovement } from './unifiedMovement.js'
import { getUnitCommandsHandler } from '../inputHandler.js'
import {
  computeTankerKamikazeApproach,
  clearTankerKamikazeState,
  updateKamikazeTargetPoint
} from './tankerTruckUtils.js'
function normalizeServiceOwner(owner) {
  return owner === 'player' ? 'player1' : owner
}

function isAirborneServiceTarget(unit) {
  if (!unit) return false
  const isAirUnit = Boolean(unit.isAirUnit) || unit.type === 'apache' || unit.type === 'f35' || unit.type === 'f22Raptor'
  return isAirUnit && unit.flightState !== 'grounded'
}

function isEligibleFriendlyGroundServiceTarget(source, unit) {
  if (!source || !unit) return false
  return normalizeServiceOwner(source.owner) === normalizeServiceOwner(unit.owner) && !isAirborneServiceTarget(unit)
}

const AUTO_REFUEL_SCAN_INTERVAL = 10000

export const updateTankerTruckLogic = logPerformance(function(units, gameState, delta) {
  const tankers = units.filter(u => u.type === 'tankerTruck' && u.health > 0)
  if (tankers.length === 0) return

  // IMMEDIATE RESPONSE: Check for units that just ran out of gas completely
  handleEmergencyFuelRequests(tankers, units, gameState)

  const unitCommands = getUnitCommandsHandler ? getUnitCommandsHandler() : null

  tankers.forEach(tanker => {
    if (tanker.kamikazeMode) {
      handleKamikazeBehavior(tanker, units, gameState)
      return
    }

    const queueState = tanker.utilityQueue
    const queueActive = queueState && queueState.mode === 'refuel' && (
      (Array.isArray(queueState.targets) && queueState.targets.length > 0) || queueState.currentTargetId
    )
    if (queueState?.lockedByUser && !queueActive && !queueState.currentTargetId && (!queueState.targets || queueState.targets.length === 0)) {
      queueState.lockedByUser = false
      queueState.source = null
    }
    const now = performance?.now ? performance.now() : Date.now()
    const wasServing = Boolean(tanker._alertWasServing)

    // Tankers need a loader to operate the refueling equipment
    if (tanker.crew && typeof tanker.crew === 'object' && !tanker.crew.loader) {
      tanker.refuelTarget = null
      tanker.emergencyTarget = null
      tanker.refuelTimer = 0
      if (unitCommands) {
        unitCommands.clearUtilityQueueState(tanker)
      }
      return
    }
    // Ensure tanker has proper gas properties initialized
    if (tanker.supplyGas === undefined || tanker.maxSupplyGas === undefined) {
      tanker.maxSupplyGas = TANKER_SUPPLY_CAPACITY
      tanker.supplyGas = TANKER_SUPPLY_CAPACITY
    }

    // Add periodic debugging for tankers
    if (!tanker.lastDebugTime || performance.now() - tanker.lastDebugTime > 5000) {
      const nearbyUnits = units.filter(u =>
        u.id !== tanker.id &&
        u.owner === tanker.owner &&
        typeof u.maxGas === 'number' &&
        Math.abs(u.tileX - tanker.tileX) <= 2 &&
        Math.abs(u.tileY - tanker.tileY) <= 2
      )
      if (nearbyUnits.length > 0) {
        nearbyUnits.forEach(u => {
          const _distance = Math.abs(u.tileX - tanker.tileX) + Math.abs(u.tileY - tanker.tileY)
          const _gasPercent = Math.round((u.gas / u.maxGas) * 100)
          const _needsFuel = u.gas < (u.maxGas * 0.95) ? ' NEEDS FUEL' : ' (full)'
        })
      }
      tanker.lastDebugTime = performance.now()
    }

    // Handle emergency refueling missions first
    if (queueActive) {
      tanker.emergencyTarget = null
      tanker.emergencyMode = false
      tanker.emergencyStartTime = null
    } else if (tanker.emergencyTarget) {
      const emergencyUnit = units.find(u => u.id === tanker.emergencyTarget.id)

      // Clear emergency mission if target is gone, healthy, or has sufficient fuel
      if (!emergencyUnit || emergencyUnit.health <= 0 ||
          (emergencyUnit.gas > emergencyUnit.maxGas * 0.1 && !emergencyUnit.needsEmergencyFuel)) {
        tanker.emergencyTarget = null
        tanker.emergencyMode = false
        tanker.emergencyStartTime = null
      } else {
        // Check if we're close enough to start refueling (any surrounding tile)
        const distance = Math.hypot(emergencyUnit.tileX - tanker.tileX, emergencyUnit.tileY - tanker.tileY)
        if (distance <= SERVICE_SERVING_RANGE && !(emergencyUnit.movement && emergencyUnit.movement.isMoving)) {
          // Start emergency refueling
          tanker.refuelTarget = emergencyUnit
          tanker.refuelTimer = 0
          stopUnitMovement(tanker)
          tanker.moveTarget = null
          tanker.emergencyTarget = null // Clear emergency flag once refueling starts
        }
        // Skip normal logic while on emergency mission
        return
      }
    }

    if (!tanker.alertMode) {
      tanker.alertActiveService = false
      tanker.alertAssignmentId = null
      tanker.nextUtilityScanTime = null
    }

    const canAutoScan = tanker.alertMode && !tanker.refuelTarget && !queueActive && !tanker.emergencyTarget && !tanker.emergencyMode && !queueState?.lockedByUser
    if (canAutoScan && unitCommands) {
      const nextScan = tanker.nextUtilityScanTime || 0
      if (now >= nextScan) {
        const candidates = units
          .filter(u =>
            u.id !== tanker.id &&
            isEligibleFriendlyGroundServiceTarget(tanker, u) &&
            typeof u.maxGas === 'number' &&
            u.gas < (u.maxGas * 0.5) &&
            u.health > 0 &&
            !(u.movement && u.movement.isMoving)
          )
          .map(u => ({
            unit: u,
            distance: Math.hypot(u.tileX - tanker.tileX, u.tileY - tanker.tileY),
            fuelRatio: u.gas / u.maxGas
          }))
          .filter(entry => entry.distance <= SERVICE_DISCOVERY_RANGE)
          .sort((a, b) => {
            if (a.fuelRatio !== b.fuelRatio) {
              return a.fuelRatio - b.fuelRatio
            }
            return a.distance - b.distance
          })

        const targets = candidates.map(entry => entry.unit)

        if (targets.length > 0) {
          const result = unitCommands.setUtilityQueue(tanker, targets, 'refuel', gameState.mapGrid, {
            suppressNotifications: true,
            source: 'auto'
          })
          if (result.addedTargets.length > 0 || result.started) {
            tanker.alertActiveService = true
            tanker.alertAssignmentId = targets[0].id
          }
        }
        tanker.nextUtilityScanTime = now + AUTO_REFUEL_SCAN_INTERVAL
      }
    }

    if (!tanker.refuelTarget && !queueActive && !tanker.alertMode && !queueState?.lockedByUser) {
      // This logic is now mainly for player-controlled tankers that get close without a specific target
      // AI tankers should have refuelTarget set by the AI strategy system
      const target = units
        .filter(u =>
          u.id !== tanker.id &&
          isEligibleFriendlyGroundServiceTarget(tanker, u) &&
          typeof u.maxGas === 'number' &&
          u.gas < (u.maxGas * 0.5) && // Only refuel if unit has less than 50% gas
          u.health > 0 && // Ensure target is alive
          Math.hypot(u.tileX - tanker.tileX, u.tileY - tanker.tileY) <= SERVICE_SERVING_RANGE &&
          !(u.movement && u.movement.isMoving)
        )
        .reduce((best, current) => {
          const currentRatio = current.gas / current.maxGas
          const bestRatio = best ? best.gas / best.maxGas : Infinity
          if (currentRatio < bestRatio) return current
          if (currentRatio > bestRatio) return best
          const bestDistance = best
            ? Math.hypot(best.tileX - tanker.tileX, best.tileY - tanker.tileY)
            : Infinity
          const currentDistance = Math.hypot(current.tileX - tanker.tileX, current.tileY - tanker.tileY)
          return currentDistance < bestDistance ? current : best
        }, null)
      if (target && (tanker.supplyGas > 0 || tanker.supplyGas === undefined)) {
        // Initialize supply gas if not set
        if (tanker.supplyGas === undefined) {
          tanker.maxSupplyGas = TANKER_SUPPLY_CAPACITY
          tanker.supplyGas = TANKER_SUPPLY_CAPACITY
        }

        if (tanker.supplyGas > 0) {
          tanker.refuelTarget = target
          tanker.refuelTimer = 0
          stopUnitMovement(tanker)
          tanker.moveTarget = null
        }
      }
    }

    if (tanker.refuelTarget) {
      const target = units.find(u => u.id === tanker.refuelTarget.id)

      // Debug: Log refuelTarget details
      if (!tanker.lastRefuelDebug || performance.now() - tanker.lastRefuelDebug > 2000) {
        tanker.lastRefuelDebug = performance.now()
      }

      const distanceToTarget = target ? Math.hypot(target.tileX - tanker.tileX, target.tileY - tanker.tileY) : Infinity
      if (!target ||
          target.health <= 0 ||
          !isEligibleFriendlyGroundServiceTarget(tanker, target) ||
          distanceToTarget > SERVICE_SERVING_RANGE ||
          (target.movement && target.movement.isMoving)) {
        const _distance = target ? Math.abs(target.tileX - tanker.tileX) + Math.abs(target.tileY - tanker.tileY) : 'N/A'

        tanker.refuelTarget = null
        tanker.refuelTimer = 0
      } else if (tanker.supplyGas > 0 && target.gas < (target.maxGas * 0.95)) {
        // Log when tanker starts refueling (within serving range)
        // Note: Empty block kept for potential future debugging
        if (!tanker.refuelTimer || tanker.refuelTimer === 0) {
          // Placeholder for start-refuel logging
        }
        // Emergency units get faster refueling rate
        const isEmergencyRefuel = target.gas <= 0
        const baseRate = target.maxGas / GAS_REFILL_TIME
        const fillRate = isEmergencyRefuel ? baseRate * 2 : baseRate // 2x speed for emergency

        const gasNeeded = target.maxGas - target.gas
        const give = Math.min(fillRate * delta, gasNeeded, tanker.supplyGas)
        tanker.refuelTimer = (tanker.refuelTimer || 0) + delta
        target.gas += give
        tanker.supplyGas -= give

        // Log refueling progress occasionally
        if (Math.floor(tanker.refuelTimer / 1000) !== Math.floor((tanker.refuelTimer - delta) / 1000)) {
          // Placeholder for progress logging
        }

        // For emergency refueling, only fill to 20% to quickly get unit moving
        // For normal refueling, fill to 98% to avoid floating point precision issues
        const emergencyThreshold = isEmergencyRefuel ? target.maxGas * 0.2 : target.maxGas * 0.98

        if (target.gas >= emergencyThreshold || tanker.supplyGas <= 0 || tanker.refuelTimer >= GAS_REFILL_TIME) {
          if (target.gas > target.maxGas) target.gas = target.maxGas


          // Clear emergency flags when unit is refueled
          if (target.gas > 0) {
            target.needsEmergencyFuel = false
            target.emergencyFuelRequestTime = null
            target.outOfGasPlayed = false // Reset for future out-of-gas events
          }

          tanker.refuelTarget = null
          tanker.refuelTimer = 0
          tanker.emergencyMode = false // Clear emergency mode after successful refuel
        }
      } else {

        tanker.refuelTarget = null
        tanker.refuelTimer = 0
      }
    }

    if (queueState && queueState.mode === 'refuel') {
      if (!tanker.refuelTarget) {
        if (queueState.currentTargetId || queueState.currentTargetType) {
          queueState.currentTargetId = null
          queueState.currentTargetType = null
        }
        if (unitCommands) {
          unitCommands.advanceUtilityQueue(tanker, gameState.mapGrid, true)
        }
      } else if (queueState.currentTargetId !== tanker.refuelTarget.id || queueState.currentTargetType !== 'unit') {
        queueState.currentTargetId = tanker.refuelTarget.id
        queueState.currentTargetType = 'unit'
      }
    }

    const isCurrentlyServing = Boolean(tanker.refuelTarget)
    if (wasServing && !isCurrentlyServing) {
      tanker.alertActiveService = false
      tanker.alertAssignmentId = null
      tanker.nextUtilityScanTime = now + AUTO_REFUEL_SCAN_INTERVAL
    }
    if (isCurrentlyServing) {
      tanker.alertActiveService = true
    }
    tanker._alertWasServing = isCurrentlyServing
  })
})

/**
 * Handles immediate emergency fuel requests for units that just ran out of gas
 * This ensures tanker trucks respond immediately to completely out-of-gas units
 */
function handleEmergencyFuelRequests(tankers, units, gameState) {
  // Group units and tankers by owner
  const playerGroups = {}

  units.forEach(unit => {
    if (!playerGroups[unit.owner]) {
      playerGroups[unit.owner] = { units: [], tankers: [] }
    }
    if (unit.type === 'tankerTruck' && unit.health > 0) {
      playerGroups[unit.owner].tankers.push(unit)
    } else if (typeof unit.maxGas === 'number' && unit.health > 0 && !isAirborneServiceTarget(unit)) {
      playerGroups[unit.owner].units.push(unit)
    }
  })

  // Process each player's emergency fuel requests
  Object.entries(playerGroups).forEach(([_, group]) => {
    const { units: playerUnits, tankers: playerTankers } = group

    // Find units that have triggered an emergency fuel request and are stopped
    const criticalUnits = playerUnits.filter(u =>
      (u.needsEmergencyFuel && u.emergencyFuelRequestTime && (!u.movement || !u.movement.isMoving))
    )

    if (criticalUnits.length === 0 || playerTankers.length === 0) return

    // For each critical unit, find the best available tanker
    criticalUnits.forEach(criticalUnit => {
      // Skip if unit already has a tanker assigned or on the way
      const alreadyAssigned = playerTankers.some(tanker =>
        (tanker.emergencyTarget && tanker.emergencyTarget.id === criticalUnit.id) ||
        (tanker.refuelTarget && tanker.refuelTarget.id === criticalUnit.id)
      )
      if (alreadyAssigned) return

      // Find the closest available tanker with fuel supply
      let bestTanker = null
      let bestDistance = Infinity

      playerTankers.forEach(tanker => {
        // Skip tankers without fuel supply
        if (!tanker.supplyGas || tanker.supplyGas <= 0) return

        // Skip tankers that need refilling themselves
        if (typeof tanker.maxGas === 'number' && tanker.gas / tanker.maxGas < 0.1) return

        const distance = Math.hypot(
          tanker.tileX - criticalUnit.tileX,
          tanker.tileY - criticalUnit.tileY
        )

        // Prefer tankers that are not currently on high-priority missions
        const isAvailable = !tanker.emergencyTarget &&
                           (!tanker.refuelTarget || tanker.refuelTarget.gas > 0)

        const adjustedDistance = isAvailable ? distance : distance * 1.5

        if (adjustedDistance < bestDistance) {
          bestDistance = adjustedDistance
          bestTanker = tanker
        }
      })

      if (bestTanker) {
        // Interrupt current non-emergency tasks
        if (bestTanker.refuelTarget && bestTanker.refuelTarget.gas > 0) {
          bestTanker.refuelTarget = null
          bestTanker.refuelTimer = 0
        }

        // Clear non-emergency paths and targets
        if (!bestTanker.emergencyTarget) {
          bestTanker.guardTarget = null
        }

        // Assign emergency mission
        bestTanker.emergencyTarget = criticalUnit
        assignTankerToEmergencyUnit(bestTanker, criticalUnit, gameState)
        criticalUnit.emergencyFuelRequestTime = null
      }
    })
  })
}

function handleKamikazeBehavior(tanker, units, gameState) {
  const mapGrid = gameState.mapGrid
  if (!mapGrid || mapGrid.length === 0) {
    return
  }

  tanker.refuelTarget = null
  tanker.refuelTimer = 0
  tanker.emergencyTarget = null
  tanker.emergencyMode = false
  tanker.alertActiveService = false

  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
  const occupancyMap = gameState.occupancyMap

  if (tanker.kamikazeTargetType === 'unit' && tanker.kamikazeTargetId) {
    const targetUnit = units.find(u => u.id === tanker.kamikazeTargetId && u.health > 0)
    if (!targetUnit) {
      clearTankerKamikazeState(tanker)
      return
    }

    tanker.kamikazeTargetBuilding = null

    updateKamikazeTargetPoint(tanker, targetUnit)

    const tankerCenterX = tanker.x + TILE_SIZE / 2
    const tankerCenterY = tanker.y + TILE_SIZE / 2
    const targetPoint = tanker.kamikazeTargetPoint
    const distance = targetPoint ? Math.hypot(targetPoint.x - tankerCenterX, targetPoint.y - tankerCenterY) : Infinity

    const repathInterval = tanker.kamikazeLastPathTime ? 350 : 0
    const shouldRepath = !tanker.path || tanker.path.length === 0 || (now - (tanker.kamikazeLastPathTime || 0) > repathInterval)

    if (shouldRepath || distance > TILE_SIZE) {
      const plan = computeTankerKamikazeApproach(tanker, targetUnit, mapGrid, occupancyMap)
      if (plan) {
        tanker.path = plan.path.slice(1)
        tanker.moveTarget = { ...plan.moveTarget }
        tanker.kamikazeLastPathTime = now
      }
    }

  } else if (tanker.kamikazeTargetType === 'building') {
    let targetBuilding = null

    if (tanker.kamikazeTargetBuilding && tanker.kamikazeTargetBuilding.health > 0) {
      targetBuilding = tanker.kamikazeTargetBuilding
    } else if (tanker.kamikazeTargetId) {
      targetBuilding = (gameState.buildings || []).find(b => b.id === tanker.kamikazeTargetId && b.health > 0) || null
      if (targetBuilding) {
        tanker.kamikazeTargetBuilding = targetBuilding
      }
    }

    if (tanker.kamikazeTargetBuilding && (!targetBuilding || targetBuilding.health <= 0)) {
      tanker.kamikazeTargetBuilding = null
      targetBuilding = null
    }

    if (tanker.kamikazeTargetId && !targetBuilding) {
      clearTankerKamikazeState(tanker)
      return
    }

    if (!targetBuilding && !tanker.kamikazeTargetId) {
      clearTankerKamikazeState(tanker)
      return
    }

    if (targetBuilding) {
      updateKamikazeTargetPoint(tanker, targetBuilding)
    }

    if (!tanker.kamikazeTargetPoint) {
      clearTankerKamikazeState(tanker)
      return
    }

    const tankerCenterX = tanker.x + TILE_SIZE / 2
    const tankerCenterY = tanker.y + TILE_SIZE / 2
    const distance = Math.hypot(tanker.kamikazeTargetPoint.x - tankerCenterX, tanker.kamikazeTargetPoint.y - tankerCenterY)

    const repathInterval = tanker.kamikazeLastPathTime ? 600 : 0
    const shouldRepath = !tanker.path || tanker.path.length === 0 || (now - (tanker.kamikazeLastPathTime || 0) > repathInterval)

    if (shouldRepath || distance > TILE_SIZE) {
      const targetTile = {
        tileX: Math.floor(tanker.kamikazeTargetPoint.x / TILE_SIZE),
        tileY: Math.floor(tanker.kamikazeTargetPoint.y / TILE_SIZE)
      }
      const plan = computeTankerKamikazeApproach(tanker, targetTile, mapGrid, occupancyMap)
      if (plan) {
        tanker.path = plan.path.slice(1)
        tanker.moveTarget = { ...plan.moveTarget }
        tanker.kamikazeLastPathTime = now
      }
    }
  } else {
    clearTankerKamikazeState(tanker)
  }
}

/**
 * Assigns a tanker truck to immediately move to an emergency unit
 */
function assignTankerToEmergencyUnit(tanker, emergencyUnit, gameState) {
  // Set the refuel target BEFORE pathfinding, just like player tanker commands
  tanker.refuelTarget = emergencyUnit
  tanker.refuelTimer = 0

  // Calculate path to emergency unit - find adjacent position like player commands
  const mapGrid = gameState.mapGrid
  if (!mapGrid) return

  const targetTileX = emergencyUnit.tileX
  const targetTileY = emergencyUnit.tileY
  const directions = [
    // Prefer actual adjacent tiles first, fall back to the unit tile
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
    { x: 0, y: 0 }
  ]

  for (const dir of directions) {
    const destX = targetTileX + dir.x
    const destY = targetTileY + dir.y
    if (destX >= 0 && destY >= 0 && destX < mapGrid[0].length && destY < mapGrid.length) {
      const path = findPath(
        { x: tanker.tileX, y: tanker.tileY, owner: tanker.owner },
        { x: destX, y: destY },
        mapGrid,
        gameState.occupancyMap,
        undefined,
        { unitOwner: tanker.owner }
      )
      if (path && path.length > 0) {
        tanker.path = path.slice(1)
        const finalTile = path[path.length - 1]
        tanker.moveTarget = { x: finalTile.x, y: finalTile.y }
        break
      }
    }
  }

  // Mark this as high priority
  tanker.emergencyMode = true
  tanker.emergencyStartTime = performance.now()
}
