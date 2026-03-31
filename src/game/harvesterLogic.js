// harvesterLogic.js - Handles all harvester-specific logic
import { TILE_SIZE, HARVESTER_CAPPACITY, HARVESTER_UNLOAD_TIME, HARVESTER_PRODUCTIVITY_CHECK_INTERVAL } from '../config.js'
import { findPath } from '../units.js'
import { playSound } from '../sound.js'
import { productionQueue } from '../productionQueue.js'
import { logPerformance } from '../performanceUtils.js'
import {
  findClosestOre,
  findAdjacentTile,
  isAdjacentToBuilding,
  showUnloadingFeedback
} from '../logic.js'
import { gameRandom } from '../utils/gameRandom.js'

// Track tiles currently being harvested
const harvestedTiles = new Set()
// Track which ore tiles are targeted by which harvesters
const targetedOreTiles = {}
// Track refinery queues
const refineryQueues = {}
const HARVESTER_REMOTE_OVERRIDE_GRACE_MS = 2000
const HARVESTER_ORE_RETRY_MIN_DELAY_MS = 100
const HARVESTER_ORE_RETRY_MAX_DELAY_MS = 300
const HARVESTER_ORE_WAIT_MIN_DELAY_MS = 500
const HARVESTER_ORE_WAIT_MAX_DELAY_MS = 1500
const HARVESTER_ORE_FALLBACK_MIN_DELAY_MS = 1000
const HARVESTER_ORE_FALLBACK_MAX_DELAY_MS = 2000
const HARVESTER_ALTERNATIVE_ORE_RETRY_MIN_DELAY_MS = 3000
const HARVESTER_ALTERNATIVE_ORE_RETRY_MAX_DELAY_MS = 5000
const HARVESTER_ORE_REPATH_INTERVAL_MS = 2000
const HARVESTER_ORE_ARRIVAL_TOLERANCE = 1.1
const HARVESTER_MANUAL_HOLD_ARRIVAL_TOLERANCE = 0.25
const HARVESTER_MANUAL_REPATH_INTERVAL_MS = 1000
const HARVESTER_LONG_TERM_STAGNATION_MS = 60000
const HARVESTER_LONG_TERM_RECOVERY_COOLDOWN_MS = 5000
const HARVESTER_GOAL_PROGRESS_EPSILON_TILES = 0.2

function getSimulationTimeOrFallback(gameState) {
  return Number.isFinite(gameState?.simulationTime) ? gameState.simulationTime : performance.now()
}

function getTileDistance(unit, target) {
  if (!unit || !target) return Infinity

  return Math.hypot(
    (unit.x / TILE_SIZE) - target.x,
    (unit.y / TILE_SIZE) - target.y
  )
}

function isManualHoldActive(unit) {
  return Boolean(unit?.manualHoldPosition)
}

function isOreTileTarget(target, mapGrid) {
  return Boolean(
    target &&
    mapGrid?.[target.y]?.[target.x]?.ore &&
    !mapGrid[target.y][target.x].seedCrystal
  )
}

function getRefineryId(refinery) {
  if (!refinery) return null
  if (typeof refinery === 'string') return refinery
  if (refinery.id) return refinery.id

  if (
    Number.isFinite(refinery.x) &&
    Number.isFinite(refinery.y)
  ) {
    return `refinery_${refinery.x}_${refinery.y}`
  }

  return null
}

function getRefineryTileCenter(refinery) {
  if (!refinery) return null

  return {
    x: refinery.x + (refinery.width / 2),
    y: refinery.y + (refinery.height / 2)
  }
}

function getOreDistanceToRefinery(tile, refinery) {
  if (!tile || !refinery) return Infinity

  const center = getRefineryTileCenter(refinery)
  return Math.hypot(tile.x - center.x, tile.y - center.y)
}

function getOperationalRefineriesForOwner(owner, gameState) {
  return gameState?.buildings?.filter(building =>
    building.type === 'oreRefinery' &&
    building.owner === owner &&
    building.health > 0
  ) || []
}

function resolveAssignedRefinery(unit, refineries) {
  if (!unit?.assignedRefinery || !Array.isArray(refineries) || refineries.length === 0) {
    return null
  }

  const assignedId = getRefineryId(unit.assignedRefinery)
  return refineries.find(refinery => (
    refinery === unit.assignedRefinery ||
    getRefineryId(refinery) === assignedId
  )) || null
}

function resolveTargetRefinery(unit, refineries) {
  if (!unit?.targetRefinery || !Array.isArray(refineries) || refineries.length === 0) {
    return null
  }

  const targetId = getRefineryId(unit.targetRefinery)
  return refineries.find(refinery => getRefineryId(refinery) === targetId) || null
}

function getHarvesterPreferredRefinery(unit, gameState) {
  const refineries = getOperationalRefineriesForOwner(unit?.owner, gameState)
  if (refineries.length === 0) {
    return null
  }

  return resolveAssignedRefinery(unit, refineries) ||
    resolveTargetRefinery(unit, refineries) ||
    null
}

function getRetryDelay(minDelay, maxDelay) {
  if (maxDelay <= minDelay) {
    return minDelay
  }

  return minDelay + Math.floor(gameRandom() * ((maxDelay - minDelay) + 1))
}

function scheduleHarvesterAction(unit, action, now, minDelay, maxDelay) {
  if (!unit || !Number.isFinite(now)) return

  unit.pendingHarvesterAction = action
  unit.pendingHarvesterActionAt = now + getRetryDelay(minDelay, maxDelay)
}

function clearScheduledHarvesterAction(unit, action = null) {
  if (!unit) return
  if (action && unit.pendingHarvesterAction !== action) return

  unit.pendingHarvesterAction = null
  unit.pendingHarvesterActionAt = null
}

function runScheduledHarvesterAction(unit, mapGrid, occupancyMap, gameState, now) {
  if (!unit?.pendingHarvesterAction || !Number.isFinite(unit.pendingHarvesterActionAt)) {
    return
  }

  if (now < unit.pendingHarvesterActionAt) {
    return
  }

  const action = unit.pendingHarvesterAction
  clearScheduledHarvesterAction(unit)

  if (unit.health <= 0) {
    return
  }

  if (action === 'findNewOre') {
    if (unit.oreCarried === 0 && !unit.oreField) {
      findNewOreTarget(unit, mapGrid, occupancyMap, now, gameState)
    }
    return
  }

  if (action === 'retryManualOreTarget' && unit.oreCarried === 0 && unit.manualOreTarget) {
    handleManualOreTarget(unit, mapGrid, occupancyMap, now, gameState)
  }
}

function isRemoteControlOverrideActive(unit, now = performance.now()) {
  if (!unit) return false
  if (unit.remoteControlActive) return true
  const lastRemoteControlTime = typeof unit.lastRemoteControlTime === 'number' ? unit.lastRemoteControlTime : 0
  return lastRemoteControlTime > 0 && now - lastRemoteControlTime < HARVESTER_REMOTE_OVERRIDE_GRACE_MS
}

function hasPlayerHarvesterPriority(unit, now = performance.now()) {
  return Boolean(unit?.manualOreTarget) || isManualHoldActive(unit) || isRemoteControlOverrideActive(unit, now)
}

function stopMovement(unit) {
  unit.path = []
  unit.moveTarget = null
  if (unit.movement) {
    unit.movement.velocity = { x: 0, y: 0 }
    unit.movement.targetVelocity = { x: 0, y: 0 }
    unit.movement.isMoving = false
    unit.movement.currentSpeed = 0
  }
}

function clearHarvesterUnloadingState(unit, gameState = null) {
  if (!unit) return

  if (unit.targetRefinery) {
    removeFromRefineryQueue(unit.targetRefinery, unit.id)
  }

  const activeRefineryId = unit.unloadRefinery || unit.targetRefinery
  if (activeRefineryId && gameState?.refineryStatus?.[activeRefineryId] === unit.id) {
    delete gameState.refineryStatus[activeRefineryId]
  }

  unit.unloadingAtRefinery = false
  unit.unloadStartTime = null
  unit.unloadRefinery = null
  unit.targetRefinery = null
  unit.queuePosition = 0
  unit.forcedUnload = false
  unit.forcedUnloadRefinery = null
  unit.findOreAfterUnload = null
}

function releaseHarvestReservation(unit) {
  if (!unit) return
  const tileKey = unit.activeHarvestTileKey || (
    unit.oreField ? `${unit.oreField.x},${unit.oreField.y}` : null
  )
  if (tileKey) {
    harvestedTiles.delete(tileKey)
  }
  unit.activeHarvestTileKey = null
}

function clearOreField(unit) {
  if (unit.harvesting) {
    releaseHarvestReservation(unit)
  }
  if (unit.oreField) {
    const tileKey = `${unit.oreField.x},${unit.oreField.y}`
    if (targetedOreTiles[tileKey] === unit.id) {
      delete targetedOreTiles[tileKey]
    }
    unit.oreField = null
  }
}

export function interruptHarvesterAutomation(unit, gameState = null) {
  if (!unit || unit.type !== 'harvester') return

  clearScheduledHarvesterAction(unit)
  releaseHarvestReservation(unit)
  unit.harvesting = false
  unit.harvestTimer = null
  clearOreField(unit)
  clearHarvesterUnloadingState(unit, gameState)
}

function startHarvesting(unit, tileKey, now, gameState) {
  unit.harvesting = true
  unit.activeHarvestTileKey = tileKey
  unit.harvestTimer = now
  clearScheduledHarvesterAction(unit)
  stopMovement(unit)
  harvestedTiles.add(tileKey)
  if (unit.owner === gameState.humanPlayer) {
    playSound('harvest')
  }
}

/**
 * Updates all harvester logic including mining, unloading, and pathfinding
 */
export const updateHarvesterLogic = logPerformance(function updateHarvesterLogic(units, mapGrid, occupancyMap, gameState, factories, now) {
  // now parameter is passed from the main game loop

  // Initialize refinery status if not exists
  if (!gameState.refineryStatus) {
    gameState.refineryStatus = {}
  }
  if (!gameState.refineryRevenue) {
    gameState.refineryRevenue = {}
  }

  // Clean up invalid queue entries and reassign harvesters from destroyed refineries
  cleanupQueues(units)

  // Clean up stale ore tile reservations
  cleanupStaleOreReservations(units)

  // Only check for destroyed refineries periodically or when buildings change
  if (!gameState.lastRefineryCheck || now - gameState.lastRefineryCheck > 1000) {
    cleanupDestroyedRefineries(units, gameState)
    gameState.lastRefineryCheck = now
  }

  units.forEach(unit => {
    if (unit.type !== 'harvester') return

    // Skip automation if unit is heading to hospital for crew restaffing
    if (unit.returningToHospital) return

    // Skip all harvester automation for units with missing crew
    // Crewless harvesters are handled by the AI crew healing system
    if (unit.crew && typeof unit.crew === 'object') {
      if (!unit.crew.driver) {
        // No driver - harvester cannot move. Stop everything and wait for ambulance.
        stopMovement(unit)
        if (unit.harvesting) {
          releaseHarvestReservation(unit)
          unit.harvesting = false
        }
        clearScheduledHarvesterAction(unit)
        return
      }
      if (!unit.crew.loader) {
        // No loader - harvester cannot harvest ore.
        // If carrying ore, still allow unloading logic to run.
        // Otherwise stop harvesting and let crew healing handle it.
        if (unit.harvesting) {
          releaseHarvestReservation(unit)
          unit.harvesting = false
        }
        // Allow unloading if carrying ore (doesn't need loader)
        if (unit.oreCarried > 0 && !unit.unloadingAtRefinery) {
          handleHarvesterUnloading(unit, factories, mapGrid, gameState, now, occupancyMap, units)
        }
        if (unit.unloadingAtRefinery && unit.unloadStartTime) {
          completeUnloading(unit, factories, mapGrid, gameState, now, occupancyMap)
        }
        return
      }
    }

    runScheduledHarvesterAction(unit, mapGrid, occupancyMap, gameState, now)

    const unitTileX = Math.floor(unit.x / TILE_SIZE)
    const unitTileY = Math.floor(unit.y / TILE_SIZE)
    const isRetreatingFromThreat = Boolean(unit.isRetreating)

    // Retreat behavior is controlled by AI strategy logic (retreatLogic.js).
    // While retreating, suspend economy loops so harvester ore/unload policies
    // don't immediately overwrite retreat pathing and cause route thrashing.
    if (isRetreatingFromThreat) {
      clearScheduledHarvesterAction(unit, 'findNewOre')
      releaseHarvestReservation(unit)
      clearOreField(unit)
      unit.harvesting = false
      unit.unloadingAtRefinery = false
      unit.unloadStartTime = null
      return
    }

    // Periodic productivity check - ensure harvester is doing something useful every 0.5 seconds
    if (!unit.lastProductivityCheck || now - unit.lastProductivityCheck > HARVESTER_PRODUCTIVITY_CHECK_INTERVAL) {
      unit.lastProductivityCheck = now
      checkHarvesterProductivity(unit, mapGrid, occupancyMap, gameState, factories, now)
    }

    // Mining ore logic with more tolerant detection
    // Skip auto-harvesting if harvester is heading to or being repaired at workshop, or is in repair queue
    const isInRepairQueue = unit.targetWorkshop && unit.targetWorkshop.repairQueue &&
                           unit.targetWorkshop.repairQueue.includes(unit)

    if (isManualHoldActive(unit) &&
        !unit.harvesting && !unit.unloadingAtRefinery &&
        !unit.targetWorkshop && !unit.repairingAtWorkshop && !isInRepairQueue) {
      handleManualHoldPosition(unit, mapGrid, occupancyMap, now)
      return
    }

    if (unit.manualOreTarget &&
        unit.oreCarried < HARVESTER_CAPPACITY &&
        !unit.harvesting && !unit.unloadingAtRefinery &&
        (
          !unit.path || unit.path.length === 0 ||
          !unit.moveTarget ||
          getTileDistance(unit, unit.manualOreTarget) <= HARVESTER_ORE_ARRIVAL_TOLERANCE
        ) &&
        !unit.targetWorkshop && !unit.repairingAtWorkshop && !isInRepairQueue) {
      handleManualOreTarget(unit, mapGrid, occupancyMap, now, gameState)
    }

    if (!hasPlayerHarvesterPriority(unit, now) &&
        unit.oreCarried < HARVESTER_CAPPACITY && !unit.harvesting && !unit.unloadingAtRefinery &&
        !unit.targetWorkshop && !unit.repairingAtWorkshop && !isInRepairQueue) {
      // Check if harvester is near an ore tile (more tolerant detection)
      const nearbyOreTile = findNearbyOreTile(unit, mapGrid, unitTileX, unitTileY)
      if (nearbyOreTile) {
        const tileKey = `${nearbyOreTile.x},${nearbyOreTile.y}`
        if (!harvestedTiles.has(tileKey)) {
          if (!unit.oreField) {
            unit.oreField = { x: nearbyOreTile.x, y: nearbyOreTile.y }
            // Register this tile as targeted by this unit
            targetedOreTiles[tileKey] = unit.id
          }
          if (unit.oreField.x === nearbyOreTile.x && unit.oreField.y === nearbyOreTile.y) {
            startHarvesting(unit, tileKey, now, gameState)
          }
        } else {
          // Tile is being harvested by another unit, find a new ore tile
          clearOreField(unit)
          // Immediately try to find new ore to prevent getting stuck
          findNewOreTarget(unit, mapGrid, occupancyMap, now)
        }
      }
    }

    // Complete harvesting
    if (unit.harvesting) {
      // Guard against missing oreField to avoid null errors
      if (!unit.oreField) {
        releaseHarvestReservation(unit)
        unit.harvesting = false
        return // skip to next unit
      }
      if (now - unit.harvestTimer > 10000) {
        unit.oreCarried++
        if (typeof unit.gas === 'number') {
          unit.gas = Math.max(0, unit.gas - (unit.harvestGasConsumption || 0))
        }
        unit.harvesting = false
        const tileKey = `${unit.oreField.x},${unit.oreField.y}`
        harvestedTiles.delete(tileKey) // Free up the tile
        unit.activeHarvestTileKey = null

        // Clear manual ore target when harvesting is complete
        if (unit.manualOreTarget &&
            unit.manualOreTarget.x === unit.oreField.x &&
            unit.manualOreTarget.y === unit.oreField.y) {
          unit.manualOreTarget = null
        }

        // Only deplete the tile after multiple harvests (simulate limited ore)
        if (!mapGrid[unit.oreField.y][unit.oreField.x].harvests) {
          mapGrid[unit.oreField.y][unit.oreField.x].harvests = 0
        }
        mapGrid[unit.oreField.y][unit.oreField.x].harvests++

        // Deplete ore tile after 1 harvest (matches HARVESTER_CAPPACITY = 1)
        if (mapGrid[unit.oreField.y][unit.oreField.x].harvests >= 1) {
          // Remove ore overlay instead of changing tile type
          mapGrid[unit.oreField.y][unit.oreField.x].ore = false
          // Clear any cached texture variations for this tile to force re-render
          mapGrid[unit.oreField.y][unit.oreField.x].textureVariation = null
          // Remove targeting once the tile is depleted
          clearOreField(unit)

          // Force all harvesters targeting this depleted tile to find new ore
          Object.keys(targetedOreTiles).forEach(key => {
            if (key === tileKey) {
              delete targetedOreTiles[key]
            }
          })
        }
      }
    }

    // Handle unloading when at capacity
    // Skip auto-unloading if harvester is heading to or being repaired at workshop, or is in repair queue
    if (!isRemoteControlOverrideActive(unit, now) &&
        unit.oreCarried >= HARVESTER_CAPPACITY && !unit.unloadingAtRefinery && !unit.harvesting &&
        !unit.targetWorkshop && !unit.repairingAtWorkshop && !isInRepairQueue) {
      handleHarvesterUnloading(unit, factories, mapGrid, gameState, now, occupancyMap, units)
    }

    // Handle unloading process at refinery
    if (unit.unloadingAtRefinery && unit.unloadStartTime) {
      completeUnloading(unit, factories, mapGrid, gameState, now, occupancyMap)
    }

    // Find new ore when idle and not carrying ore
    // Skip auto-ore finding if harvester is heading to or being repaired at workshop, or is in repair queue
    if (!isRemoteControlOverrideActive(unit, now) &&
        unit.oreCarried === 0 && !unit.harvesting && !unit.unloadingAtRefinery &&
        (!unit.path || unit.path.length === 0) && !unit.oreField &&
        !unit.targetWorkshop && !unit.repairingAtWorkshop && !isInRepairQueue) {
      // Check if there's a manual ore target first
      if (unit.manualOreTarget) {
        handleManualOreTarget(unit, mapGrid, occupancyMap, now)
      } else {
        findNewOreTarget(unit, mapGrid, occupancyMap, now)
      }
    }

    // Handle harvesters that have an ore field but no path and aren't harvesting
    // This can happen when they get stuck or lose their path
    if (!hasPlayerHarvesterPriority(unit, now) &&
        unit.oreCarried === 0 && !unit.harvesting && !unit.unloadingAtRefinery &&
        unit.oreField && (!unit.path || unit.path.length === 0)) {
      const tileKey = `${unit.oreField.x},${unit.oreField.y}`
      const _currentTileX = Math.floor(unit.x / TILE_SIZE)
      const _currentTileY = Math.floor(unit.y / TILE_SIZE)

      // Check if we're near the ore field (more tolerant detection)
      const distanceToOreField = Math.hypot(
        (unit.x / TILE_SIZE) - unit.oreField.x,
        (unit.y / TILE_SIZE) - unit.oreField.y
      )

      if (distanceToOreField <= HARVESTER_ORE_ARRIVAL_TOLERANCE) { // Accept a wider proximity to prevent micro-turn loops at ore tiles
        unit.path = []
        unit.moveTarget = null
        unit.lastHarvesterOrePathCalcTime = now
        // We're close enough to the ore field, check if we can harvest
        if (mapGrid[unit.oreField.y][unit.oreField.x].ore &&
            !mapGrid[unit.oreField.y][unit.oreField.x].seedCrystal &&
            !harvestedTiles.has(tileKey)) {
          startHarvesting(unit, tileKey, now, gameState)
        } else {
          // Ore field is no longer valid, find new one
          clearOreField(unit)
          findNewOreTarget(unit, mapGrid, occupancyMap, now)
        }
      } else {
        const canRepathToOre =
          !unit.lastHarvesterOrePathCalcTime ||
          (now - unit.lastHarvesterOrePathCalcTime) >= HARVESTER_ORE_REPATH_INTERVAL_MS
        if (!canRepathToOre) {
          return
        }

        // Try to path to the ore field again
        const path = findPath(
          { x: unit.tileX, y: unit.tileY, owner: unit.owner },
          unit.oreField,
          mapGrid,
          occupancyMap,
          undefined,
          { unitOwner: unit.owner }
        )
        if (path.length > 1) {
          unit.lastHarvesterOrePathCalcTime = now
          unit.path = path.slice(1)
          unit.moveTarget = unit.oreField // Set move target so the harvester actually moves
        } else {
          // Can't path to ore field, abandon it and find new one
          clearOreField(unit)
          findNewOreTarget(unit, mapGrid, occupancyMap, now, gameState)
        }
      }
    }

    // Handle scheduled ore search after unloading
    if (unit.findOreAfterUnload && now >= unit.findOreAfterUnload) {
      unit.findOreAfterUnload = null
      if (unit.health > 0 && unit.oreCarried === 0) {
        findNewOreTarget(unit, mapGrid, occupancyMap, now, gameState)
      }
    }
  })

  // Store targeted tiles in gameState for access by other modules
  gameState.targetedOreTiles = targetedOreTiles
})

/**
 * Handles harvester unloading logic at refineries
 */
function handleHarvesterUnloading(unit, factories, mapGrid, gameState, now, occupancyMap, units) {
  // Clear targeting when full of ore and returning to base
  clearOreField(unit)

  // Find available refinery
  const refineries = gameState.buildings?.filter(b =>
    b.type === 'oreRefinery' &&
    b.owner === unit.owner &&
    b.health > 0
  ) || []

  if (refineries.length === 0) {
    // No refineries available - wait until one is built
    stopMovement(unit)
    return
  }

  // **STABLE REFINERY ASSIGNMENT** - Only reassign if harvester has no target or target is invalid
  let targetRefinery = null
  let targetUnloadTile = null

  // Priority 1: Check if harvester has a manual assignment from force unload command
  if (unit.assignedRefinery) {
    const assignedRefinery = refineries.find(r =>
      r === unit.assignedRefinery ||
      (r.id || `refinery_${r.x}_${r.y}`) === (unit.assignedRefinery.id || `refinery_${unit.assignedRefinery.x}_${unit.assignedRefinery.y}`)
    )
    if (assignedRefinery) {
      targetRefinery = assignedRefinery
      targetUnloadTile = findAdjacentTile(targetRefinery, mapGrid)
    } else {
      // Assigned refinery no longer exists, clear the assignment
      unit.assignedRefinery = null
    }
  }

  // Priority 2: Check if current target refinery is still valid (only if no manual assignment)
  if (!targetRefinery && unit.targetRefinery) {
    const currentRefinery = refineries.find(r => (r.id || `refinery_${r.x}_${r.y}`) === unit.targetRefinery)
    if (currentRefinery) {
      // Keep using current refinery - NO REASSIGNMENT
      targetRefinery = currentRefinery
      targetUnloadTile = findAdjacentTile(targetRefinery, mapGrid)
    }
  }

  // Only assign new refinery if no valid current assignment
  if (!targetRefinery) {
    // **DISTANCE-BASED REFINERY ASSIGNMENT** - Consider both distance and current load
    const refineryOptions = refineries.map(refinery => {
      const refineryId = refinery.id || `refinery_${refinery.x}_${refinery.y}`
      const unloadTile = findAdjacentTile(refinery, mapGrid)

      if (!unloadTile) return null

      // Calculate distance from harvester to refinery
      const distance = Math.hypot(
        unit.tileX - (refinery.x + refinery.width / 2),
        unit.tileY - (refinery.y + refinery.height / 2)
      )

      const queueLength = getRefineryQueue(refineryId).length
      const isInUse = gameState.refineryStatus[refineryId] ? 1 : 0
      const totalWait = queueLength + isInUse

      // Combine distance and wait time for scoring (prefer closer refineries with less wait)
      const score = distance * 2 + totalWait * 5 // Weight wait time more heavily

      return {
        refinery,
        refineryId,
        unloadTile,
        distance,
        totalWait,
        score
      }
    }).filter(Boolean).sort((a, b) => a.score - b.score) // Sort by best score (lowest)

    // Choose the refinery with the best score (closest with least wait)
    if (refineryOptions.length > 0) {
      const chosen = refineryOptions[0]
      targetRefinery = chosen.refinery
      targetUnloadTile = chosen.unloadTile

      // Set new assignment
      unit.assignedRefinery = chosen.refineryId
    }
  }

  if (targetRefinery && targetUnloadTile) {
    // Try to get a better unloading position (prefer tiles directly below refinery)
    const preferredUnloadTile = findPreferredUnloadTile(targetRefinery, mapGrid)
    if (preferredUnloadTile) {
      targetUnloadTile = preferredUnloadTile
    }

    const refineryId = targetRefinery.id || `refinery_${targetRefinery.x}_${targetRefinery.y}`

    // **STABLE QUEUE MANAGEMENT** - Only modify queue if switching refineries
    if (unit.targetRefinery !== refineryId) {
      // Remove from old queue if switching refineries
      if (unit.targetRefinery) {
        removeFromRefineryQueue(unit.targetRefinery, unit.id)
      }

      // Add to new queue
      addToRefineryQueue(refineryId, unit.id)
      unit.targetRefinery = refineryId
    }

    // Reorder queue so the closest harvesters are served first
    rescheduleRefineryQueue(refineryId, targetRefinery, units)

    // Get current queue position (this should be stable now)
    const queuePosition = getQueuePosition(refineryId, unit.id)
    unit.queuePosition = queuePosition // Store for rendering

    // Check if harvester is near the refinery (more tolerant detection)
    const isNearRefinery = isAdjacentToBuilding(unit, targetRefinery) || isAtRefineryUnloadingPosition(unit, targetRefinery)

    if (isNearRefinery) {
      // **DISTANCE-BASED PRIORITY SYSTEM** - Check if this harvester is the closest
      const nextInQueue = getNextInQueue(refineryId)
      const _isNextInQueue = nextInQueue === unit.id
      const refineryInUse = gameState.refineryStatus[refineryId]

      // Get all harvesters waiting for this refinery and sort by distance
      const waitingHarvesters = units.filter(u =>
        u.type === 'harvester' &&
        u.targetRefinery === refineryId &&
        u.health > 0 &&
        (isAdjacentToBuilding(u, targetRefinery) || isAtRefineryUnloadingPosition(u, targetRefinery))
      ).sort((a, b) => {
        // Calculate distance to refinery center with preference for proper unloading positions
        const refineryCenter = {
          x: (targetRefinery.x + targetRefinery.width / 2) * TILE_SIZE,
          y: (targetRefinery.y + targetRefinery.height / 2) * TILE_SIZE
        }

        // Give priority to harvesters in proper unloading positions
        const aInUnloadPosition = isAtRefineryUnloadingPosition(a, targetRefinery)
        const bInUnloadPosition = isAtRefineryUnloadingPosition(b, targetRefinery)

        if (aInUnloadPosition && !bInUnloadPosition) return -1
        if (!aInUnloadPosition && bInUnloadPosition) return 1

        // If both or neither are in unloading positions, sort by distance
        const distA = Math.hypot(a.x - refineryCenter.x, a.y - refineryCenter.y)
        const distB = Math.hypot(b.x - refineryCenter.x, b.y - refineryCenter.y)
        return distA - distB
      })

      // This harvester can unload if it's the closest and refinery is free
      const isClosest = waitingHarvesters.length > 0 && waitingHarvesters[0].id === unit.id

      if (isClosest && (!refineryInUse || refineryInUse === unit.id)) {
        // Mark this refinery as in use by this harvester
        gameState.refineryStatus[refineryId] = unit.id

        // Start unloading process (takes 10 seconds)
        unit.unloadingAtRefinery = true
        unit.unloadStartTime = now
        unit.unloadRefinery = refineryId
        // Stop all movement while unloading
        stopMovement(unit)

        // Remove from queue since now unloading
        removeFromRefineryQueue(refineryId, unit.id)
        unit.queuePosition = 0

        // Show visual feedback
        showUnloadingFeedback(unit, targetRefinery)
      } else {
        // **STAY PUT** - Don't move when wanting to unload but not closest
        stopMovement(unit)
        // Update queue position based on distance ranking
        const position = waitingHarvesters.findIndex(h => h.id === unit.id) + 1
        unit.queuePosition = position > 0 ? position : 1
      }
    } else {
      // **DIRECT MOVEMENT WITH UNLOAD PRIORITY** - Go straight to refinery, but stick around once there
      if (!unit.path || unit.path.length === 0) {
        const path = findPath(
          { x: unit.tileX, y: unit.tileY, owner: unit.owner },
          targetUnloadTile,
          mapGrid,
          occupancyMap,
          undefined,
          { unitOwner: unit.owner }
        )
        if (path.length > 1) {
          unit.path = path.slice(1)
          unit.moveTarget = targetUnloadTile // Set move target so the harvester actually moves
        }
      }

      // **PREVENT MOVING AWAY WHEN WANTING TO UNLOAD**
      // If harvester is full of ore and close to refinery, don't accept new movement commands
      if (unit.oreCarried >= HARVESTER_CAPPACITY) {
        const distanceToRefinery = Math.hypot(
          unit.tileX - (targetRefinery.x + targetRefinery.width / 2),
          unit.tileY - (targetRefinery.y + targetRefinery.height / 2)
        )

        // If close to refinery (within 3 tiles), stay focused on unloading
        if (distanceToRefinery <= 3) {
          // Clear any other movement orders that might take harvester away
          unit.orderQueue = []
        }
      }
    }
  }
}

/**
 * Completes the unloading process at a refinery
 */
function completeUnloading(unit, factories, mapGrid, gameState, now, _occupancyMap) {
  const powerSupply = unit.owner === gameState.humanPlayer ? gameState.playerPowerSupply : gameState.enemyPowerSupply
  const unloadTime = powerSupply < 0 ? HARVESTER_UNLOAD_TIME * 2 : HARVESTER_UNLOAD_TIME
  if (now - unit.unloadStartTime >= unloadTime) {
    // Calculate money based on ore carried
    const moneyEarned = Math.max(0, unit.oreCarried * 1000)

    // Unloading complete
    if (unit.owner === gameState.humanPlayer) {
      gameState.money += moneyEarned
      // Track total money earned for statistics
      if (typeof gameState.totalMoneyEarned === 'number') {
        gameState.totalMoneyEarned += moneyEarned
      }
      if (unit.unloadRefinery) {
        gameState.refineryRevenue[unit.unloadRefinery] =
          (gameState.refineryRevenue[unit.unloadRefinery] || 0) + moneyEarned
      }
      if (typeof unit.totalMoneyEarned !== 'number') {
        unit.totalMoneyEarned = 0
      }
      unit.totalMoneyEarned += moneyEarned
      if (typeof unit.lastHarvestCycleComplete === 'number') {
        unit.harvestCycleSeconds = (now - unit.lastHarvestCycleComplete) / 1000
      }
      unit.lastHarvestCycleComplete = now
      if (typeof productionQueue !== 'undefined' && productionQueue?.tryResumeProduction) {
        productionQueue.tryResumeProduction()
      }
    } else if (unit.owner !== gameState.humanPlayer) {
      // Find the AI player's factory to credit money to
      const aiFactory = factories.find(f => f.owner === unit.owner || f.id === unit.owner)
      if (aiFactory) {
        aiFactory.budget += moneyEarned
      }
    }

    // Clear refinery usage
    if (unit.unloadRefinery) {
      delete gameState.refineryStatus[unit.unloadRefinery]

      // Process next harvester in queue
      const nextInQueue = getNextInQueue(unit.unloadRefinery)
      if (nextInQueue) {
        // The next harvester will be processed in the next update cycle
      }
    }

    // Reset harvester state
    unit.oreCarried = 0
    unit.unloadingAtRefinery = false
    unit.unloadStartTime = null
    unit.unloadRefinery = null
    unit.oreField = null // Clear any ore field reference
    unit.queuePosition = 0 // Clear queue position
    unit.targetRefinery = null // Clear target refinery
    unit.forcedUnload = false // Clear forced unload flag
    unit.forcedUnloadRefinery = null // Clear forced unload refinery
    unit.findOreAfterUnload = now + 500 // Schedule ore search after 500ms
    clearScheduledHarvesterAction(unit)
    if (unit.owner === gameState.humanPlayer) {
      playSound('deposit')
    }

    // Enemy harvesters repair after unloading if damaged
    if (unit.owner !== gameState.humanPlayer && unit.health < unit.maxHealth) {
      sendUnitToWorkshop(unit, gameState, mapGrid)
    }
  }
}

/**
 * Finds a new ore target for the harvester
 */
function findNewOreTarget(unit, mapGrid, occupancyMap, now = performance.now(), _gameState = null) {
  // Clear any queue position when going to find ore
  if (unit.targetRefinery) {
    removeFromRefineryQueue(unit.targetRefinery, unit.id)
    unit.queuePosition = 0
    unit.targetRefinery = null
  }

  // Clear any existing ore field reservation
  clearOreField(unit)

  const orePos = findClosestOre(unit, mapGrid, targetedOreTiles, unit.assignedRefinery)
  if (orePos) {
    const tileKey = `${orePos.x},${orePos.y}`

    // Double-check the tile isn't already taken (race condition protection)
    if (targetedOreTiles[tileKey] && targetedOreTiles[tileKey] !== unit.id) {
      scheduleHarvesterAction(unit, 'findNewOre', now, HARVESTER_ORE_RETRY_MIN_DELAY_MS, HARVESTER_ORE_RETRY_MAX_DELAY_MS)
      return
    }

    // Reserve the tile
    targetedOreTiles[tileKey] = unit.id
    unit.oreField = orePos

    const path = findPath(
      { x: unit.tileX, y: unit.tileY, owner: unit.owner },
      orePos,
      mapGrid,
      occupancyMap,
      undefined,
      { unitOwner: unit.owner }
    )
    if (path.length > 1) {
      clearScheduledHarvesterAction(unit, 'findNewOre')
      unit.path = path.slice(1)
      unit.moveTarget = orePos // Set move target so the harvester actually moves
    }
  } else {
    scheduleHarvesterAction(unit, 'findNewOre', now, HARVESTER_ORE_FALLBACK_MIN_DELAY_MS, HARVESTER_ORE_FALLBACK_MAX_DELAY_MS)
  }
}

/**
 * Gets the current harvested tiles (for external access)
 */
export function getHarvestedTiles() {
  return harvestedTiles
}

export function restoreHarvesterRuntimeState(serializedState = {}, gameStateRef = null) {
  harvestedTiles.clear()
  Object.keys(targetedOreTiles).forEach(tileKey => {
    delete targetedOreTiles[tileKey]
  })
  Object.keys(refineryQueues).forEach(refineryId => {
    delete refineryQueues[refineryId]
  })

  const restoredHarvestedTiles = Array.isArray(serializedState.harvestedTiles)
    ? serializedState.harvestedTiles
    : []
  restoredHarvestedTiles.forEach(tileKey => {
    if (typeof tileKey === 'string' && tileKey.length > 0) {
      harvestedTiles.add(tileKey)
    }
  })

  const restoredTargetedOreTiles = serializedState.targetedOreTiles && typeof serializedState.targetedOreTiles === 'object'
    ? serializedState.targetedOreTiles
    : {}
  Object.entries(restoredTargetedOreTiles).forEach(([tileKey, harvesterId]) => {
    if (typeof tileKey === 'string' && tileKey.length > 0 && typeof harvesterId === 'string' && harvesterId.length > 0) {
      targetedOreTiles[tileKey] = harvesterId
    }
  })

  const restoredRefineryQueues = serializedState.refineryQueues && typeof serializedState.refineryQueues === 'object'
    ? serializedState.refineryQueues
    : {}
  Object.entries(restoredRefineryQueues).forEach(([refineryId, queue]) => {
    if (typeof refineryId !== 'string' || refineryId.length === 0 || !Array.isArray(queue)) {
      return
    }

    const normalizedQueue = queue.filter(harvesterId => typeof harvesterId === 'string' && harvesterId.length > 0)
    if (normalizedQueue.length > 0) {
      refineryQueues[refineryId] = normalizedQueue
    }
  })

  if (gameStateRef && typeof gameStateRef === 'object') {
    gameStateRef.targetedOreTiles = targetedOreTiles
  }
}

export function resetHarvesterRuntimeState(gameStateRef = null) {
  restoreHarvesterRuntimeState({}, gameStateRef)
}

/**
 * Clear ore field assignment for a stuck harvester (called from movement system)
 */
export function clearStuckHarvesterOreField(unit) {
  if (unit.type === 'harvester' && unit.oreField) {
    const tileKey = `${unit.oreField.x},${unit.oreField.y}`
    if (targetedOreTiles[tileKey] === unit.id) {
      delete targetedOreTiles[tileKey]
    }
    unit.oreField = null
  }
}

/**
 * Gets the current targeted ore tiles (for external access)
 */
export function getTargetedOreTiles() {
  return targetedOreTiles
}

/**
 * Gets or creates a queue for a refinery
 */
function getRefineryQueue(refineryId) {
  if (!refineryQueues[refineryId]) {
    refineryQueues[refineryId] = []
  }
  return refineryQueues[refineryId]
}

/**
 * Adds a harvester to a refinery queue
 */
function addToRefineryQueue(refineryId, harvesterId) {
  const queue = getRefineryQueue(refineryId)
  if (!queue.includes(harvesterId)) {
    queue.push(harvesterId)
  }
}

/**
 * Removes a harvester from a refinery queue
 */
function removeFromRefineryQueue(refineryId, harvesterId) {
  const queue = getRefineryQueue(refineryId)
  const index = queue.indexOf(harvesterId)
  if (index > -1) {
    queue.splice(index, 1)
  }
}

/**
 * Gets the waiting position of a harvester in a refinery queue (1-based)
 */
function getQueuePosition(refineryId, harvesterId) {
  const queue = getRefineryQueue(refineryId)
  const index = queue.indexOf(harvesterId)
  return index === -1 ? 0 : index + 1
}

/**
 * Gets the next harvester in queue for a refinery
 */
function getNextInQueue(refineryId) {
  const queue = getRefineryQueue(refineryId)
  return queue.length > 0 ? queue[0] : null
}

/**
 * Forces a harvester to unload with highest priority at a specific refinery
 * This reschedules the refinery queue to put this harvester first
 */
export function forceHarvesterUnloadPriority(harvester, targetRefinery, units) {
  const refineryId = targetRefinery.id || `refinery_${targetRefinery.x}_${targetRefinery.y}`

  // Remove harvester from any current queue
  if (harvester.targetRefinery && harvester.targetRefinery !== refineryId) {
    removeFromRefineryQueue(harvester.targetRefinery, harvester.id)
  }

  // Set the harvester's target refinery
  harvester.targetRefinery = refineryId
  harvester.assignedRefinery = refineryId

  // Get current queue
  const queue = getRefineryQueue(refineryId)

  // Remove harvester from current position in queue if already there
  removeFromRefineryQueue(refineryId, harvester.id)

  // Add harvester at the front of the queue (highest priority)
  queue.unshift(harvester.id)

  // Mark this as a forced unload for priority handling
  harvester.forcedUnload = true
  harvester.forcedUnloadRefinery = refineryId

  // Reschedule the entire queue to ensure proper ordering
  rescheduleRefineryQueue(refineryId, targetRefinery, units)

  // Move the forced harvester back to front after rescheduling
  removeFromRefineryQueue(refineryId, harvester.id)
  queue.unshift(harvester.id)
}

/**
 * Reorders the refinery queue so the closest harvesters are first
 */
function rescheduleRefineryQueue(refineryId, refinery, units) {
  const centerX = (refinery.x + refinery.width / 2) * TILE_SIZE
  const centerY = (refinery.y + refinery.height / 2) * TILE_SIZE

  const sorted = units
    .filter(u => u.type === 'harvester' && u.targetRefinery === refineryId && u.health > 0 && !u.unloadingAtRefinery)
    .sort((a, b) => {
      // Forced unload harvesters get highest priority
      if (a.forcedUnload && !b.forcedUnload) return -1
      if (!a.forcedUnload && b.forcedUnload) return 1

      const aUnload = isAtRefineryUnloadingPosition(a, refinery)
      const bUnload = isAtRefineryUnloadingPosition(b, refinery)
      if (aUnload && !bUnload) return -1
      if (!aUnload && bUnload) return 1
      const distA = Math.hypot(a.x - centerX, a.y - centerY)
      const distB = Math.hypot(b.x - centerX, b.y - centerY)
      return distA - distB
    })

  refineryQueues[refineryId] = sorted.map(h => h.id)
}

/**
 * Cleans up stale ore tile reservations
 */
function cleanupStaleOreReservations(units) {
  const validHarvesterIds = new Set(units.filter(u => u.type === 'harvester' && u.health > 0).map(u => u.id))

  // Remove reservations for dead or non-existent harvesters
  for (const [tileKey, harvesterId] of Object.entries(targetedOreTiles)) {
    if (!validHarvesterIds.has(harvesterId)) {
      delete targetedOreTiles[tileKey]
      continue
    }

    // Check if the harvester still has this as their ore field
    const harvester = units.find(u => u.id === harvesterId)
    if (harvester && harvester.oreField) {
      const harvesterTileKey = `${harvester.oreField.x},${harvester.oreField.y}`
      if (harvesterTileKey !== tileKey) {
        // Harvester is targeting a different tile, clean up this reservation
        delete targetedOreTiles[tileKey]
      }
    } else if (harvester && !harvester.oreField) {
      // Harvester has no ore field but still has a reservation, clean it up
      delete targetedOreTiles[tileKey]
    }
  }
}

/**
 * Cleans up empty queues and invalid harvester references
 */
function cleanupQueues(units) {
  const validHarvesterIds = new Set(units.filter(u => u.type === 'harvester').map(u => u.id))

  for (const refineryId in refineryQueues) {
    refineryQueues[refineryId] = refineryQueues[refineryId].filter(id => validHarvesterIds.has(id))
    if (refineryQueues[refineryId].length === 0) {
      delete refineryQueues[refineryId]
    }
  }
}

/**
 * Gets the current refinery queues (for external access)
 */
export function getRefineryQueues() {
  return refineryQueues
}

/**
 * Cleans up harvesters assigned to destroyed or sold refineries
 */
function cleanupDestroyedRefineries(units, gameState) {
  if (!gameState.buildings) return

  const existingRefineries = new Set(
    gameState.buildings
      .filter(b => b.type === 'oreRefinery' && b.health > 0)
      .map(b => b.id || `refinery_${b.x}_${b.y}`)
  )

  // Check all harvesters for invalid refinery assignments
  units.forEach(unit => {
    if (unit.type === 'harvester' && unit.assignedRefinery) {
      if (!existingRefineries.has(unit.assignedRefinery)) {
        // Clear assignment and queue position for destroyed refinery
        unit.assignedRefinery = null
        unit.targetRefinery = null
        unit.queuePosition = 0
        unit.unloadingAtRefinery = false
        unit.unloadStartTime = null
        unit.unloadRefinery = null
      }
    }

    // Clear refinery status for destroyed refineries
    if (unit.targetRefinery && !existingRefineries.has(unit.targetRefinery)) {
      unit.targetRefinery = null
      unit.queuePosition = 0
    }
  })

  // Clean up refinery status for destroyed refineries
  for (const refineryId in gameState.refineryStatus) {
    if (!existingRefineries.has(refineryId)) {
      delete gameState.refineryStatus[refineryId]
    }
  }

  // Clean up queues for destroyed refineries
  for (const refineryId in refineryQueues) {
    if (!existingRefineries.has(refineryId)) {
      delete refineryQueues[refineryId]
    }
  }
}

/**
 * Gets distribution statistics for harvesters across refineries
 */
export function getHarvesterDistribution(gameState) {
  const distribution = {}

  if (!gameState.buildings) return distribution

  const refineries = gameState.buildings.filter(b =>
    b.type === 'oreRefinery' &&
    b.health > 0
  )

  refineries.forEach(refinery => {
    const refineryId = refinery.id || `refinery_${refinery.x}_${refinery.y}`
    const queueLength = getRefineryQueue(refineryId).length
    const isInUse = gameState.refineryStatus?.[refineryId] ? 1 : 0

    distribution[refineryId] = {
      refinery,
      queueLength,
      isInUse,
      totalLoad: queueLength + isInUse
    }
  })

  return distribution
}

/**
 * Assigns a harvester to the least loaded refinery
 */
export function assignHarvesterToOptimalRefinery(harvester, gameState) {
  // Handle case where gameState is undefined or invalid
  if (!gameState || !gameState.buildings) {
    return null
  }

  const distribution = getHarvesterDistribution(gameState)

  if (Object.keys(distribution).length === 0) return null

  // Find refinery with minimum load
  let minLoad = Infinity
  let optimalRefineryId = null

  for (const [refineryId, data] of Object.entries(distribution)) {
    if (data.totalLoad < minLoad) {
      minLoad = data.totalLoad
      optimalRefineryId = refineryId
    }
  }

  if (optimalRefineryId) {
    harvester.assignedRefinery = optimalRefineryId
  }

  return optimalRefineryId
}

function sendUnitToWorkshop(unit, gameState, mapGrid) {
  const workshops = gameState.buildings.filter(b =>
    b.type === 'vehicleWorkshop' && b.owner === unit.owner && b.health > 0
  )
  if (workshops.length === 0) return false

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
  const path = findPath(
    { x: unit.tileX, y: unit.tileY, owner: unit.owner },
    targetTile,
    mapGrid,
    gameState.occupancyMap,
    undefined,
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
 * Check if harvester is at a valid unloading position for the refinery
 * Allows unloading from any directly adjacent tile to the refinery
 */
function isAtRefineryUnloadingPosition(harvester, refinery) {
  const harvesterTileX = Math.floor(harvester.x / TILE_SIZE)
  const harvesterTileY = Math.floor(harvester.y / TILE_SIZE)

  // Check if harvester is adjacent to any tile of the refinery
  // This includes all sides: top, bottom, left, right and corners
  for (let y = refinery.y - 1; y <= refinery.y + refinery.height; y++) {
    for (let x = refinery.x - 1; x <= refinery.x + refinery.width; x++) {
      // Skip tiles that are inside the refinery
      if (x >= refinery.x && x < refinery.x + refinery.width &&
          y >= refinery.y && y < refinery.y + refinery.height) {
        continue
      }

      // Check if harvester is at this adjacent position
      if (harvesterTileX === x && harvesterTileY === y) {
        return true
      }
    }
  }

  return false
}

/**
 * Find the preferred unloading tile (any adjacent tile, preferring directly below refinery)
 */
function findValidUnloadTiles(refinery, mapGrid) {
  const tiles = []
  const bottomY = refinery.y + refinery.height

  // First priority: Check tiles directly below the refinery (preferred unloading spots)
  for (let x = refinery.x; x < refinery.x + refinery.width; x++) {
    if (bottomY < mapGrid.length &&
        x < mapGrid[0].length &&
        !mapGrid[bottomY][x].building &&
        mapGrid[bottomY][x].type !== 'water' &&
        mapGrid[bottomY][x].type !== 'rock') {
      tiles.push({ x, y: bottomY })
    }
  }

  // Second priority: Check all other adjacent tiles
  for (let y = refinery.y - 1; y <= refinery.y + refinery.height; y++) {
    for (let x = refinery.x - 1; x <= refinery.x + refinery.width; x++) {
      // Skip tiles that are inside the refinery
      if (x >= refinery.x && x < refinery.x + refinery.width &&
          y >= refinery.y && y < refinery.y + refinery.height) {
        continue
      }

      // Skip tiles we already checked (directly below)
      if (y === bottomY && x >= refinery.x && x < refinery.x + refinery.width) {
        continue
      }

      // Check if this adjacent tile is valid
      if (x >= 0 && x < mapGrid[0].length &&
          y >= 0 && y < mapGrid.length &&
          !mapGrid[y][x].building &&
          mapGrid[y][x].type !== 'water' &&
          mapGrid[y][x].type !== 'rock') {
        tiles.push({ x, y })
      }
    }
  }

  if (tiles.length > 0) {
    return tiles
  }

  const fallbackTile = findAdjacentTile(refinery, mapGrid)
  return fallbackTile ? [fallbackTile] : []
}

function findPreferredUnloadTile(refinery, mapGrid) {
  return findValidUnloadTiles(refinery, mapGrid)[0] || null
}

function handleManualHoldPosition(unit, mapGrid, occupancyMap, now = performance.now()) {
  const target = unit.manualHoldPosition
  if (!target || !mapGrid?.[target.y]?.[target.x]) {
    unit.manualHoldPosition = null
    return
  }

  const distanceToHoldPosition = getTileDistance(unit, target)
  if (distanceToHoldPosition <= HARVESTER_MANUAL_HOLD_ARRIVAL_TOLERANCE) {
    stopMovement(unit)
    return
  }

  const canRepath =
    !unit.lastHarvesterManualPathCalcTime ||
    (now - unit.lastHarvesterManualPathCalcTime) >= HARVESTER_MANUAL_REPATH_INTERVAL_MS

  if ((!unit.path || unit.path.length === 0) && canRepath) {
    const path = findPath(
      { x: unit.tileX, y: unit.tileY, owner: unit.owner },
      target,
      mapGrid,
      occupancyMap,
      undefined,
      { unitOwner: unit.owner }
    )

    unit.lastHarvesterManualPathCalcTime = now
    if (path.length > 1) {
      unit.path = path.slice(1)
      unit.moveTarget = target
    } else {
      stopMovement(unit)
    }
  }
}

/**
 * Handle manually targeted ore tiles for harvesters
 */
function handleManualOreTarget(unit, mapGrid, occupancyMap, now = performance.now(), gameState = null) {
  const target = unit.manualOreTarget

  // Validate the manual target
  if (!target ||
      target.x < 0 || target.y < 0 ||
      target.x >= mapGrid[0].length || target.y >= mapGrid.length ||
      !mapGrid[target.y][target.x].ore) {
    // Invalid manual target, clear it and find automatic target
    unit.manualOreTarget = null
    findNewOreTarget(unit, mapGrid, occupancyMap, now)
    return
  }

  const tileKey = `${target.x},${target.y}`

  // Check if another harvester is already harvesting this tile
  if (harvestedTiles.has(tileKey)) {
    stopMovement(unit)
    scheduleHarvesterAction(unit, 'retryManualOreTarget', now, HARVESTER_ORE_WAIT_MIN_DELAY_MS, HARVESTER_ORE_WAIT_MAX_DELAY_MS)
    return
  }

  const distanceToTarget = getTileDistance(unit, target)

  // Clear any existing ore field reservation
  clearOreField(unit)

  // Reserve the manual target
  targetedOreTiles[tileKey] = unit.id
  unit.oreField = target

  if (distanceToTarget <= HARVESTER_ORE_ARRIVAL_TOLERANCE) {
    clearScheduledHarvesterAction(unit, 'retryManualOreTarget')
    startHarvesting(unit, tileKey, now, gameState)
    return
  }

  // Calculate path to manual target
  const path = findPath(
    { x: unit.tileX, y: unit.tileY, owner: unit.owner },
    target,
    mapGrid,
    occupancyMap,
    undefined,
    { unitOwner: unit.owner }
  )
  if (path.length > 1) {
    clearScheduledHarvesterAction(unit, 'retryManualOreTarget')
    unit.lastHarvesterOrePathCalcTime = now
    unit.path = path.slice(1)
    unit.moveTarget = target // Set move target so the harvester actually moves
  } else if (path.length === 1) {
    // Already at the target
    clearScheduledHarvesterAction(unit, 'retryManualOreTarget')
    unit.lastHarvesterOrePathCalcTime = now
    startHarvesting(unit, tileKey, now, gameState)
  } else {
    stopMovement(unit)
    scheduleHarvesterAction(unit, 'retryManualOreTarget', now, HARVESTER_ORE_WAIT_MIN_DELAY_MS, HARVESTER_ORE_WAIT_MAX_DELAY_MS)
  }
}

/**
 * Handle stuck harvester by finding alternative targets
 */
export function handleStuckHarvester(unit, mapGrid, occupancyMap, gameState, factories) {

  // Don't interfere if harvester is manually commanded to a specific location
  if (unit.manualOreTarget || isManualHoldActive(unit)) {
    return
  }

  // Don't interfere if harvester is performing valid actions
  if (unit.harvesting || unit.unloadingAtRefinery) {
    return
  }

  // Check if harvester is standing on ore and should be harvesting
  const unitTileX = Math.floor(unit.x / TILE_SIZE)
  const unitTileY = Math.floor(unit.y / TILE_SIZE)
  const currentTile = mapGrid[unitTileY] && mapGrid[unitTileY][unitTileX]

  if (currentTile && currentTile.ore && unit.oreCarried < HARVESTER_CAPPACITY) {
    const tileKey = `${unitTileX},${unitTileY}`
    if (!harvestedTiles.has(tileKey)) {
      // Harvester should start harvesting this tile
      unit.oreField = { x: unitTileX, y: unitTileY }
      targetedOreTiles[tileKey] = unit.id
      startHarvesting(unit, tileKey, getSimulationTimeOrFallback(gameState), gameState)
      return
    }
  }

  // Clear current targets and path
  clearOreField(unit)

  // Clear refinery queue if unloading
  if (unit.targetRefinery) {
    removeFromRefineryQueue(unit.targetRefinery, unit.id)
    unit.queuePosition = 0
    unit.targetRefinery = null
  }

  stopMovement(unit)

  // Determine what the harvester should do based on its state
  if (unit.oreCarried >= HARVESTER_CAPPACITY) {
    // Harvester is full, need to find alternative unload location
    handleStuckHarvesterUnloading(unit, mapGrid, gameState, factories, occupancyMap)
  } else {
    // Harvester needs ore, find alternative ore tile
    findAlternativeOreTarget(unit, mapGrid, occupancyMap, gameState)
  }
}

function tryRouteHarvesterToRefinery(unit, refinery, mapGrid, occupancyMap) {
  if (!refinery) return false

  const refineryId = getRefineryId(refinery)
  const unloadTiles = findValidUnloadTiles(refinery, mapGrid)

  for (const unloadTile of unloadTiles) {
    const distanceToUnloadTile = getTileDistance(unit, unloadTile)
    if (distanceToUnloadTile <= HARVESTER_MANUAL_HOLD_ARRIVAL_TOLERANCE) {
      unit.assignedRefinery = unit.assignedRefinery || refineryId
      unit.targetRefinery = refineryId
      addToRefineryQueue(refineryId, unit.id)
      stopMovement(unit)
      return true
    }

    const path = findPath(
      { x: unit.tileX, y: unit.tileY, owner: unit.owner },
      unloadTile,
      mapGrid,
      occupancyMap,
      undefined,
      { unitOwner: unit.owner }
    )

    if (path.length > 1) {
      unit.assignedRefinery = unit.assignedRefinery || refineryId
      unit.targetRefinery = refineryId
      addToRefineryQueue(refineryId, unit.id)
      unit.path = path.slice(1)
      unit.moveTarget = unloadTile
      return true
    }
  }

  return false
}

/**
 * Find alternative unload location for stuck harvester
 */
function handleStuckHarvesterUnloading(unit, mapGrid, gameState, factories, occupancyMap) {
  void factories

  const refineries = getOperationalRefineriesForOwner(unit.owner, gameState)
  if (refineries.length > 0) {
    const preferredRefinery = resolveAssignedRefinery(unit, refineries) ||
      resolveTargetRefinery(unit, refineries)
    const preferredRefineryId = getRefineryId(preferredRefinery)

    const refineryOptions = [
      preferredRefinery,
      ...refineries
        .filter(refinery => getRefineryId(refinery) !== preferredRefineryId)
        .sort((a, b) => {
          const distanceA = Math.hypot(
            unit.tileX - (a.x + a.width / 2),
            unit.tileY - (a.y + a.height / 2)
          )
          const distanceB = Math.hypot(
            unit.tileX - (b.x + b.width / 2),
            unit.tileY - (b.y + b.height / 2)
          )
          return distanceA - distanceB
        })
    ].filter(Boolean)

    for (const refinery of refineryOptions) {
      if (preferredRefinery && getRefineryId(refinery) !== preferredRefineryId && unit.assignedRefinery) {
        continue
      }

      if (tryRouteHarvesterToRefinery(unit, refinery, mapGrid, occupancyMap)) {
        return
      }
    }
  }

  // No alternative refinery found - wait until a refinery is available again
  stopMovement(unit)
}

/**
 * Find alternative ore target for stuck harvester
 */
function findAlternativeOreTarget(unit, mapGrid, occupancyMap, gameState, now = getSimulationTimeOrFallback(gameState), options = {}) {
  const preserveManualTarget = Boolean(options.preserveManualTarget)
  const referenceTarget = options.referenceTarget || unit.manualOreTarget || unit.oreField
  const preferredRefinery = getHarvesterPreferredRefinery(unit, gameState)
  const targetRefineryDistance = referenceTarget && preferredRefinery
    ? getOreDistanceToRefinery(referenceTarget, preferredRefinery)
    : null
  const unitTileX = Math.floor(unit.x / TILE_SIZE)
  const unitTileY = Math.floor(unit.y / TILE_SIZE)
  const referenceTileKey = referenceTarget ? `${referenceTarget.x},${referenceTarget.y}` : null
  const candidateTiles = []

  for (let y = 0; y < mapGrid.length; y++) {
    for (let x = 0; x < mapGrid[0].length; x++) {
      if (!mapGrid[y][x].ore || mapGrid[y][x].seedCrystal) {
        continue
      }

      const tileKey = `${x},${y}`
      if (tileKey === referenceTileKey) {
        continue
      }

      if (targetedOreTiles[tileKey] && targetedOreTiles[tileKey] !== unit.id) {
        continue
      }

      if (harvestedTiles.has(tileKey)) {
        continue
      }

      const unitDistance = Math.hypot(x - unitTileX, y - unitTileY)
      const refineryDistance = preferredRefinery ? getOreDistanceToRefinery({ x, y }, preferredRefinery) : unitDistance
      const refineryDelta = Number.isFinite(targetRefineryDistance)
        ? Math.abs(refineryDistance - targetRefineryDistance)
        : 0
      const score = Number.isFinite(targetRefineryDistance)
        ? (refineryDelta * 3) + (unitDistance * 0.35)
        : unitDistance

      candidateTiles.push({
        x,
        y,
        tileKey,
        score,
        refineryDelta,
        unitDistance
      })
    }
  }

  candidateTiles.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    if (a.refineryDelta !== b.refineryDelta) return a.refineryDelta - b.refineryDelta
    return a.unitDistance - b.unitDistance
  })

  const shortlistSize = Math.min(8, candidateTiles.length)
  const shortlist = candidateTiles.slice(0, shortlistSize).map(candidate => ({
    ...candidate,
    randomOrder: gameRandom()
  })).sort((a, b) => a.randomOrder - b.randomOrder)
  const orderedCandidates = [...shortlist, ...candidateTiles.slice(shortlistSize)]

  for (const orePos of orderedCandidates) {
    const path = findPath(
      { x: unitTileX, y: unitTileY, owner: unit.owner },
      orePos,
      mapGrid,
      occupancyMap,
      undefined,
      { unitOwner: unit.owner }
    )

    if (path.length > 1 || getTileDistance(unit, orePos) <= HARVESTER_ORE_ARRIVAL_TOLERANCE) {
      targetedOreTiles[orePos.tileKey] = unit.id
      unit.oreField = { x: orePos.x, y: orePos.y }
      if (preserveManualTarget) {
        unit.manualOreTarget = { x: orePos.x, y: orePos.y }
      }
      clearScheduledHarvesterAction(unit, 'findNewOre')

      if (path.length > 1) {
        unit.lastHarvesterOrePathCalcTime = now
        unit.path = path.slice(1)
        unit.moveTarget = { x: orePos.x, y: orePos.y }
      } else {
        startHarvesting(unit, orePos.tileKey, now, gameState)
      }
      return true
    }
  }

  scheduleHarvesterAction(
    unit,
    'findNewOre',
    now,
    HARVESTER_ALTERNATIVE_ORE_RETRY_MIN_DELAY_MS,
    HARVESTER_ALTERNATIVE_ORE_RETRY_MAX_DELAY_MS
  )

  return false
}

/**
 * Find nearby ore tile with more tolerant detection
 */
function findNearbyOreTile(unit, mapGrid, centerTileX, centerTileY) {
  // Check a 3x3 area around the harvester for ore tiles
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const checkX = centerTileX + dx
      const checkY = centerTileY + dy

      if (checkX >= 0 && checkY >= 0 &&
          checkX < mapGrid[0].length && checkY < mapGrid.length &&
          mapGrid[checkY][checkX].ore && !mapGrid[checkY][checkX].seedCrystal) {

        // Calculate distance from harvester center to tile center
        const tileCenter = {
          x: checkX + 0.5,
          y: checkY + 0.5
        }
        const harvesterCenter = {
          x: unit.x / TILE_SIZE + 0.5,
          y: unit.y / TILE_SIZE + 0.5
        }

        const distance = Math.hypot(
          tileCenter.x - harvesterCenter.x,
          tileCenter.y - harvesterCenter.y
        )

        // Allow harvester to be within 0.7 tiles of ore center
        if (distance <= 0.7) {
          return { x: checkX, y: checkY }
        }
      }
    }
  }
  return null
}

function getHarvesterProgressSnapshot(unit, mapGrid, gameState) {
  if (unit.harvesting) {
    return { type: 'harvesting', productive: true, goalKey: null }
  }

  if (unit.unloadingAtRefinery) {
    return { type: 'unloading', productive: true, goalKey: null }
  }

  if (isManualHoldActive(unit)) {
    return { type: 'manualHold', productive: true, goalKey: null }
  }

  const isInRepairQueue = unit.targetWorkshop && unit.targetWorkshop.repairQueue &&
    unit.targetWorkshop.repairQueue.includes(unit)
  if (unit.targetWorkshop || unit.repairingAtWorkshop || isInRepairQueue) {
    return { type: 'workshop', productive: true, goalKey: null }
  }

  if (unit.isRetreating) {
    return { type: 'retreat', productive: true, goalKey: null }
  }

  if (unit.oreCarried >= HARVESTER_CAPPACITY) {
    const refinery = getHarvesterPreferredRefinery(unit, gameState)
    const refineryId = getRefineryId(refinery)
    if (refinery && refineryId) {
      const unloadTile = findPreferredUnloadTile(refinery, mapGrid)
      return {
        type: 'toRefinery',
        productive: false,
        goalKey: `refinery:${refineryId}`,
        distance: unloadTile ? getTileDistance(unit, unloadTile) : Infinity,
        hasMovementIntent: Boolean(unit.path?.length || unit.moveTarget),
        isNearGoal: isAdjacentToBuilding(unit, refinery) || isAtRefineryUnloadingPosition(unit, refinery)
      }
    }
  }

  const oreTarget = unit.manualOreTarget || unit.oreField
  if (oreTarget && isOreTileTarget(oreTarget, mapGrid)) {
    return {
      type: unit.manualOreTarget ? 'manualOre' : 'toOre',
      productive: false,
      goalKey: `ore:${oreTarget.x},${oreTarget.y}`,
      distance: getTileDistance(unit, oreTarget),
      hasMovementIntent: Boolean(unit.path?.length || unit.moveTarget),
      isNearGoal: false
    }
  }

  return { type: 'idle', productive: false, goalKey: null }
}

function updateHarvesterGoalProgress(unit, snapshot, now) {
  if (!snapshot.goalKey || !Number.isFinite(snapshot.distance)) {
    unit.harvesterGoalKey = null
    unit.harvesterBestGoalDistance = null
    if (snapshot.productive) {
      unit.harvesterLastGoalProgressAt = now
    }
    return
  }

  const goalChanged = unit.harvesterGoalKey !== snapshot.goalKey
  if (goalChanged) {
    unit.harvesterGoalKey = snapshot.goalKey
    unit.harvesterBestGoalDistance = snapshot.distance
    unit.harvesterLastGoalProgressAt = now
    return
  }

  if (snapshot.isNearGoal) {
    unit.harvesterBestGoalDistance = snapshot.distance
    unit.harvesterLastGoalProgressAt = now
    return
  }

  const bestDistance = Number.isFinite(unit.harvesterBestGoalDistance)
    ? unit.harvesterBestGoalDistance
    : snapshot.distance

  if (snapshot.distance < bestDistance - HARVESTER_GOAL_PROGRESS_EPSILON_TILES) {
    unit.harvesterBestGoalDistance = snapshot.distance
    unit.harvesterLastGoalProgressAt = now
  }
}

function recoverUnproductiveHarvester(unit, mapGrid, occupancyMap, gameState, factories, now, snapshot) {
  unit.lastHarvesterLongTermRecoveryAt = now
  unit.harvesterLastGoalProgressAt = now
  unit.harvesterBestGoalDistance = null
  unit.harvesterGoalKey = null

  if (snapshot.type === 'manualOre' || snapshot.type === 'toOre') {
    const preserveManualTarget = Boolean(unit.manualOreTarget)
    const referenceTarget = unit.manualOreTarget || unit.oreField

    clearOreField(unit)
    stopMovement(unit)

    if (preserveManualTarget) {
      unit.manualOreTarget = null
    }

    findAlternativeOreTarget(unit, mapGrid, occupancyMap, gameState, now, {
      preserveManualTarget,
      referenceTarget
    })
    return
  }

  handleStuckHarvester(unit, mapGrid, occupancyMap, gameState, factories)
}

/**
 * Check if harvester is being productive (harvesting, moving, or unloading)
 */
function checkHarvesterProductivity(unit, mapGrid, occupancyMap, gameState, factories, now) {
  if (isRemoteControlOverrideActive(unit, now) || isManualHoldActive(unit)) {
    return
  }

  const snapshot = getHarvesterProgressSnapshot(unit, mapGrid, gameState)
  updateHarvesterGoalProgress(unit, snapshot, now)

  const lastProgressAt = Number.isFinite(unit.harvesterLastGoalProgressAt)
    ? unit.harvesterLastGoalProgressAt
    : now
  const recentlyRecovered = Boolean(
    unit.lastHarvesterLongTermRecoveryAt &&
    (now - unit.lastHarvesterLongTermRecoveryAt) < HARVESTER_LONG_TERM_RECOVERY_COOLDOWN_MS
  )
  const canLongTermRecover = snapshot.goalKey &&
    !snapshot.isNearGoal &&
    !recentlyRecovered &&
    (now - lastProgressAt) >= HARVESTER_LONG_TERM_STAGNATION_MS

  if (canLongTermRecover) {
    recoverUnproductiveHarvester(unit, mapGrid, occupancyMap, gameState, factories, now, snapshot)
    return
  }

  const isProductive = snapshot.productive ||
    snapshot.isNearGoal ||
    Boolean(snapshot.hasMovementIntent)

  if (!isProductive) {
    if (unit.oreCarried >= HARVESTER_CAPPACITY) {
      // Full harvester should be unloading
      stopMovement(unit)
      clearHarvesterUnloadingState(unit, gameState)
    } else {
      stopMovement(unit)

      if (unit.manualOreTarget) {
        handleManualOreTarget(unit, mapGrid, occupancyMap, now, gameState)
      } else {
        clearOreField(unit)
        findNewOreTarget(unit, mapGrid, occupancyMap, now, gameState)
      }
    }
  }
}
