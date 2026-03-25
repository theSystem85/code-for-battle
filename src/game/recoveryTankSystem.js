import { TILE_SIZE, SERVICE_DISCOVERY_RANGE, SERVICE_SERVING_RANGE } from '../config.js'
import { playSound } from '../sound.js'
import { getUnitCost } from '../utils.js'
import { logPerformance } from '../performanceUtils.js'
import { findPath } from '../units.js'
import { getUnitCommandsHandler } from '../inputHandler.js'
import { getSimulationTime } from './time.js'
import {
  getWreckById,
  removeWreckById,
  updateWreckPositionFromTank,
  releaseWreckAssignment
} from './unitWreckManager.js'
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

const TOW_DISTANCE_THRESHOLD = TILE_SIZE * 1.8 // Doubled hook-up range for easier towing

function distanceBetweenPoints(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by)
}

// Resolve the intended workshop for a recovery task robustly
function resolveWorkshopForTask(gameState, task) {
  const buildings = gameState.buildings || []

  // Prefer explicit id match when available
  if (task?.workshopId !== undefined && task?.workshopId !== null) {
    const byId = buildings.find(b => b.id === task.workshopId && b.type === 'vehicleWorkshop')
    if (byId) return byId
  }

  // Fallback: owner + coordinates (tile-based) if recorded
  const owner = task?.workshopOwner
  const wx = task?.workshopX
  const wy = task?.workshopY
  if (owner && (wx !== undefined) && (wy !== undefined)) {
    const byCoords = buildings.find(b => b.type === 'vehicleWorkshop' && b.owner === owner && b.x === wx && b.y === wy)
    if (byCoords) return byCoords
  }

  // Last resort: nearest workshop by owner to the entry tile (if present)
  const candidates = buildings.filter(b => b.type === 'vehicleWorkshop' && (!owner || b.owner === owner))
  if (candidates.length === 0) return null

  if (task?.workshopEntry) {
    const ex = task.workshopEntry.x
    const ey = task.workshopEntry.y
    let best = candidates[0]
    let bestDist = Infinity
    for (const b of candidates) {
      const cx = b.x + (b.width ? b.width / 2 : 1.5)
      const cy = b.y + (b.height ? b.height / 2 : 1.5)
      const d = Math.hypot(cx - ex, cy - ey)
      if (d < bestDist) {
        bestDist = d
        best = b
      }
    }
    return best
  }

  // If no entry, just return first candidate for that owner
  return candidates[0] || null
}

function handleTowTask(tank, task, wreck, units, gameState) {
  const mapGrid = gameState.mapGrid
  const occupancyMap = gameState.occupancyMap

  if (task.state === 'movingToWreck') {
    const tankCenterX = tank.x + TILE_SIZE / 2
    const tankCenterY = tank.y + TILE_SIZE / 2
    const wreckCenterX = wreck.x + TILE_SIZE / 2
    const wreckCenterY = wreck.y + TILE_SIZE / 2
    const dist = distanceBetweenPoints(tankCenterX, tankCenterY, wreckCenterX, wreckCenterY)

    if (dist <= TOW_DISTANCE_THRESHOLD) {
      if (wreck.towedBy && wreck.towedBy !== tank.id) {
        // Another tank has already mounted this wreck
        tank.recoveryTask = null
        tank.path = []
        tank.moveTarget = null
        tank.towedWreck = null
        tank.recoveryProgress = 0
        return
      }
      if (wreck.assignedTankId && wreck.assignedTankId !== tank.id) {
        // Respect existing assignment if another tank mounted in the same frame
        tank.recoveryTask = null
        tank.path = []
        tank.moveTarget = null
        tank.towedWreck = null
        tank.recoveryProgress = 0
        return
      }
      tank.path = []
      tank.moveTarget = null
      tank.towedWreck = wreck
      wreck.towedBy = tank.id
      wreck.assignedTankId = tank.id
      task.state = 'towingToWorkshop'

      const path = findPath(
        { x: tank.tileX, y: tank.tileY },
        task.workshopEntry,
        mapGrid,
        occupancyMap
      )

      if (path && path.length > 0) {
        tank.path = path.slice(1)
        tank.moveTarget = { x: task.workshopEntry.x, y: task.workshopEntry.y }
      } else {
        releaseWreckAssignment(wreck)
        tank.recoveryTask = null
        tank.towedWreck = null
        playSound('repairCancelled', 0.6)
      }
    }
  } else if (task.state === 'towingToWorkshop') {
    if (!tank.towedWreck) {
      tank.towedWreck = wreck
    }
    updateWreckPositionFromTank(wreck, tank, occupancyMap)

    const workshop = resolveWorkshopForTask(gameState, task)
    if (!workshop || workshop.health <= 0) {
      releaseWreckAssignment(wreck)
      tank.recoveryTask = null
      tank.towedWreck = null
      playSound('repairCancelled', 0.6)
      return
    }

    const entryCenterX = (task.workshopEntry.x + 0.5) * TILE_SIZE
    const entryCenterY = (task.workshopEntry.y + 0.5) * TILE_SIZE
    const tankCenterX = tank.x + TILE_SIZE / 2
    const tankCenterY = tank.y + TILE_SIZE / 2
    const dist = distanceBetweenPoints(tankCenterX, tankCenterY, entryCenterX, entryCenterY)

    if (dist <= TOW_DISTANCE_THRESHOLD) {
      task.state = 'restoring'
      finalizeRestoration(tank, wreck, units, gameState)
    }
  }
}

function finalizeRestoration(tank, wreck, units, gameState) {
  if (!wreck) return

  // Find the workshop this wreck is being delivered to
  const workshop = resolveWorkshopForTask(gameState, tank.recoveryTask)

  if (!workshop) {
    // Workshop no longer exists, release wreck
    removeWreckById(gameState, wreck.id)
    releaseWreckAssignment(wreck)
    tank.recoveryTask = null
    tank.towedWreck = null
    tank.recoveryProgress = 0
    playSound('repairCancelled', 0.6)
    return
  }

  // Store tank's original position before starting recovery task
  if (!tank.recoveryTask.originalPosition) {
    tank.recoveryTask.originalPosition = { x: tank.tileX, y: tank.tileY }
  }

  // Position wreck near workshop perimeter
  const dropTileX = tank.tileX
  const dropTileY = tank.tileY
  wreck.x = dropTileX * TILE_SIZE
  wreck.y = dropTileY * TILE_SIZE
  wreck.tileX = dropTileX
  wreck.tileY = dropTileY

  // Add wreck to workshop restoration queue
  if (!workshop.restorationQueue) {
    workshop.restorationQueue = []
  }
  workshop.restorationQueue.push({
    wreckId: wreck.id,
    unitType: wreck.unitType,
    buildDuration: wreck.buildDuration,
    addedAt: performance.now()
  })

  // Release wreck from tank
  wreck.towedBy = null
  wreck.assignedTankId = null
  tank.towedWreck = null

  // Store original position if not already stored
  const originalPos = tank.recoveryTask.originalPosition || { x: tank.tileX, y: tank.tileY }

  // Clear recovery task
  tank.recoveryTask = null
  tank.recoveryProgress = 0

  // Return tank to original position
  const path = findPath(
    { x: tank.tileX, y: tank.tileY },
    originalPos,
    gameState.mapGrid,
    gameState.occupancyMap
  )

  if (path && path.length > 1) {
    tank.path = path.slice(1)
    tank.moveTarget = { x: originalPos.x, y: originalPos.y }
  }

  playSound('deposit', 0.7)
}

function handleRecycleTask(tank, task, wreck, gameState, delta) {
  if (task.state === 'movingToWreck') {
    const tankCenterX = tank.x + TILE_SIZE / 2
    const tankCenterY = tank.y + TILE_SIZE / 2
    const wreckCenterX = wreck.x + TILE_SIZE / 2
    const wreckCenterY = wreck.y + TILE_SIZE / 2
    const dist = distanceBetweenPoints(tankCenterX, tankCenterY, wreckCenterX, wreckCenterY)

    if (dist <= TOW_DISTANCE_THRESHOLD) {
      if (wreck.assignedTankId && wreck.assignedTankId !== tank.id) {
        tank.recoveryTask = null
        tank.path = []
        tank.moveTarget = null
        tank.recoveryProgress = 0
        return
      }
      tank.path = []
      tank.moveTarget = null
      task.state = 'recycling'
      task.elapsed = 0
      wreck.isBeingRecycled = true
      wreck.recycleStartedAt = getSimulationTime(gameState)
      wreck.assignedTankId = tank.id
      tank.recoveryProgress = 0
    }
  } else if (task.state === 'recycling') {
    task.elapsed = (task.elapsed || 0) + delta
    const progress = Math.min(task.elapsed / (task.recycleDuration || 1), 1)
    tank.recoveryProgress = progress
    if (progress >= 1) {
      const removed = removeWreckById(gameState, wreck.id)
      const valueSource = removed?.cost || getUnitCost(wreck.unitType)
      const refund = Math.floor((valueSource || 0) * 0.33)
      gameState.money += refund
      if (typeof gameState.totalMoneyEarned === 'number') {
        gameState.totalMoneyEarned += refund
      }
      releaseWreckAssignment(wreck)
      tank.recoveryTask = null
      tank.recoveryProgress = 0
      playSound('deposit', 0.7)
    }
  }
}

export const updateRecoveryTankLogic = logPerformance(function(units, gameState, delta) {
  const tanks = units.filter(u => u.type === 'recoveryTank')
  if (tanks.length === 0) return

  const unitCommands = getUnitCommandsHandler ? getUnitCommandsHandler() : null

  tanks.forEach(tank => {
    const queueState = tank.utilityQueue
    const now = performance?.now ? performance.now() : Date.now()
    const wasServing = Boolean(tank._alertWasServing)

    if (tank.recoveryTask) {
      const wreck = getWreckById(gameState, tank.recoveryTask.wreckId)
      if (!wreck) {
        tank.recoveryTask = null
        tank.towedWreck = null
        tank.recoveryProgress = 0
      } else if (tank.recoveryTask.mode === 'tow') {
        handleTowTask(tank, tank.recoveryTask, wreck, units, gameState)
      } else if (tank.recoveryTask.mode === 'recycle') {
        handleRecycleTask(tank, tank.recoveryTask, wreck, gameState, delta)
      }
    }

    // Update towed unit position or wreck if applicable
    if (tank.towedUnit) {
      const t = tank.towedUnit
      t.x = tank.x
      t.y = tank.y - TILE_SIZE / 2
      t.tileX = Math.floor(t.x / TILE_SIZE)
      t.tileY = Math.floor(t.y / TILE_SIZE)

      // Update speed when towing
      const unitProps = tank.loadedSpeed || 0.33
      tank.speed = unitProps
    } else if (tank.towedWreck) {
      updateWreckPositionFromTank(tank.towedWreck, tank, gameState.occupancyMap)
      tank.speed = tank.loadedSpeed || 0.33
    } else {
      // Update speed when not towing
      const unitProps = tank.currentSpeed || 0.525
      tank.speed = unitProps
    }

    if (tank.recoveryTask) {
      tank.repairTarget = null
      tank.repairData = null
      tank.repairStarted = false
      return
    }

    const hasLoader = !(tank.crew && typeof tank.crew === 'object' && !tank.crew.loader)
    if (!hasLoader) {
      tank.repairTarget = null
      tank.repairData = null
      tank.repairStarted = false
      tank.repairTargetUnit = null
      if (unitCommands) {
        unitCommands.clearUtilityQueueState(tank)
      }
      return
    }

    if (!tank.alertMode) {
      tank.alertActiveService = false
      tank.alertAssignmentId = null
      tank.alertAssignmentType = null
      tank.nextUtilityScanTime = null
    }

    const isBusy = Boolean(tank.recoveryTask || tank.repairTarget)
    const queueActive = Boolean(
      queueState &&
      ((Array.isArray(queueState.targets) && queueState.targets.length > 0) || queueState.currentTargetId)
    )
    const canAutoScan = tank.alertMode && !isBusy && !queueActive

    if (canAutoScan && unitCommands) {
      const nextScan = tank.nextUtilityScanTime || 0
      if (now >= nextScan) {
        const damagedCandidates = units
          .filter(u =>
            u.id !== tank.id &&
            isEligibleFriendlyGroundServiceTarget(tank, u) &&
            u.health > 0 &&
            u.health < u.maxHealth &&
            !(u.movement && u.movement.isMoving)
          )
          .map(u => ({
            id: u.id,
            type: 'unit',
            reference: u,
            distance: Math.hypot(u.tileX - tank.tileX, u.tileY - tank.tileY)
          }))
          .filter(entry => entry.distance <= SERVICE_DISCOVERY_RANGE)

        const wrecks = Array.isArray(gameState.unitWrecks) ? gameState.unitWrecks : []
        const wreckCandidates = wrecks
          .filter(w =>
            w.owner === tank.owner &&
            (!w.assignedTankId || w.assignedTankId === tank.id) &&
            !w.isBeingRecycled &&
            !w.towedBy
          )
          .map(w => ({
            id: w.id,
            type: 'wreck',
            reference: w,
            distance: Math.hypot(w.tileX - tank.tileX, w.tileY - tank.tileY)
          }))
          .filter(entry => entry.distance <= SERVICE_DISCOVERY_RANGE)

        const candidates = [...damagedCandidates, ...wreckCandidates]
          .sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'unit' ? -1 : 1
            }
            return a.distance - b.distance
          })

        const targetEntry = candidates[0]

        if (targetEntry) {
          let assigned = false
          if (targetEntry.type === 'unit') {
            assigned = unitCommands.assignRecoveryTankToTarget(tank, targetEntry.reference, gameState.mapGrid, {
              suppressNotifications: true
            })
          } else if (targetEntry.type === 'wreck') {
            assigned = unitCommands.assignRecoveryTankToWreck(tank, targetEntry.reference, gameState.mapGrid, {
              suppressNotifications: true
            })
          }

          if (assigned) {
            tank.alertActiveService = true
            tank.alertAssignmentId = targetEntry.id
            tank.alertAssignmentType = targetEntry.type
          } else {
            tank.nextUtilityScanTime = now + 2000
          }
        } else {
          tank.nextUtilityScanTime = now + 2000
        }
      }
    }

    // Auto-repair logic - find nearby damaged units
    if (!tank.repairTarget && !tank.alertMode) {
      let target = null
      if (tank.repairTargetUnit &&
          tank.repairTargetUnit.health > 0 &&
          tank.repairTargetUnit.health < tank.repairTargetUnit.maxHealth &&
          Math.hypot(tank.repairTargetUnit.tileX - tank.tileX, tank.repairTargetUnit.tileY - tank.tileY) <= SERVICE_SERVING_RANGE &&
          !(tank.repairTargetUnit.movement && tank.repairTargetUnit.movement.isMoving)) {
        target = tank.repairTargetUnit
      } else {
        if (tank.repairTargetUnit && tank.repairTargetUnit.health >= tank.repairTargetUnit.maxHealth) {
          tank.repairTargetUnit = null
        }
        target = units.find(u =>
          isEligibleFriendlyGroundServiceTarget(tank, u) &&
          u !== tank &&
          u.health < u.maxHealth &&
          Math.hypot(u.tileX - tank.tileX, u.tileY - tank.tileY) <= SERVICE_SERVING_RANGE &&
          !(u.movement && u.movement.isMoving)
        )
      }
      if (target) {
        tank.repairTarget = target
        tank.repairStarted = true
        tank.repairTargetUnit = target
        // Calculate repair parameters once
        const cost = getUnitCost(target.type) || 1000
        const buildDuration = Math.max(1000, 3000 * (cost / 500)) // Minimum 1 second
        tank.repairData = {
          totalCost: cost * 0.25,
          healthPerMs: (target.maxHealth - target.health) / buildDuration,
          costPerMs: (cost * 0.25) / buildDuration,
          soundCooldown: 0,
          repairFinishedSoundPlayed: false,
          repairStartSoundPlayed: false
        }
        // window.logger(`Recovery tank starting repair of ${target.type}: health=${target.health}/${target.maxHealth}, cost=${cost}, duration=${buildDuration}ms`)
      }
    }

    // Process repair if we have a target
    if (tank.repairTarget) {
      const target = tank.repairTarget

      // Check if target is still valid
      const targetDistance = Math.hypot(target.tileX - tank.tileX, target.tileY - tank.tileY)
      if (target.health <= 0 ||
          targetDistance > SERVICE_SERVING_RANGE ||
          (target.movement && target.movement.isMoving)) {
        // window.logger(`Recovery tank repair cancelled: target invalid`)
        tank.repairTarget = null
        tank.repairData = null
        tank.repairStarted = false
        return
      }

      // Initialize repair data if missing
      if (!tank.repairData) {
        const cost = getUnitCost(target.type) || 1000
        // Much faster repair: 200-800ms duration for visible progress
        const buildDuration = Math.max(200, 800 * (cost / 500))
        tank.repairData = {
          totalCost: cost * 0.25,
          // Increase health per ms for much faster repair - 10x faster
          healthPerMs: ((target.maxHealth - target.health) / buildDuration) * 10,
          costPerMs: (cost * 0.25) / buildDuration,
          soundCooldown: 0,
          repairFinishedSoundPlayed: false,
          repairStartSoundPlayed: false
        }
      }

      const repairData = tank.repairData

      // Only proceed if we have valid repair rates
      if (repairData.healthPerMs > 0) {
        let heal = repairData.healthPerMs * delta
        const spend = repairData.costPerMs * delta

        // Ensure minimum 1HP per tick for visible progress
        if (heal < 0.125) {
          heal = 0.125
        }

        if (gameState.money >= spend) {
          gameState.money -= spend
          target.health = Math.min(target.health + heal, target.maxHealth)

          // window.logger(`Repairing ${target.type}: ${oldHealth.toFixed(1)} -> ${target.health.toFixed(1)} (+${heal.toFixed(1)} HP) cost: ${spend.toFixed(2)}`)

          // Handle repair sounds with cooldown to prevent looping
          if (!repairData.repairStartSoundPlayed) {
            playSound('repairStarted', 0.7, 1, true)
            repairData.repairStartSoundPlayed = true
            repairData.soundCooldown = 2000 // 2 second cooldown
          }

          if (repairData.soundCooldown <= 0) {
            if (target.health >= target.maxHealth) {
              if (!repairData.repairFinishedSoundPlayed) {
                playSound('repairFinished', 0.7, 1, true)
                repairData.repairFinishedSoundPlayed = true
                // window.logger(`Recovery tank completed repair of ${target.type}`)
              }
              tank.repairTarget = null
              tank.repairData = null
              tank.repairStarted = false
            } else {
              // Play repair sound every 10 seconds during repair
              playSound('repairStarted', 1, 1, true)
              repairData.soundCooldown = 10000 // 10 second cooldown
            }
          } else {
            repairData.soundCooldown -= delta
          }
        } else {
          // window.logger(`Recovery tank repair paused: insufficient funds (need ${spend.toFixed(2)}, have ${gameState.money.toFixed(2)})`)
        }
      }
    }

    if (queueState && queueState.mode === 'repair') {
      const trackingWreck = queueState.currentTargetType === 'wreck' || (
        !queueState.currentTargetType && queueState.currentTargetId &&
        tank.recoveryTask && tank.recoveryTask.wreckId === queueState.currentTargetId
      )

      if (trackingWreck) {
        if (tank.recoveryTask && tank.recoveryTask.wreckId) {
          if (queueState.currentTargetId !== tank.recoveryTask.wreckId) {
            queueState.currentTargetId = tank.recoveryTask.wreckId
          }
          queueState.currentTargetType = 'wreck'
        } else {
          queueState.currentTargetId = null
          queueState.currentTargetType = null
          if (unitCommands) {
            unitCommands.advanceUtilityQueue(tank, gameState.mapGrid, true)
          }
        }
        return
      }

      const activeTargetId = tank.repairTarget
        ? tank.repairTarget.id
        : (tank.repairTargetUnit && tank.repairTargetUnit.health < tank.repairTargetUnit.maxHealth
          ? tank.repairTargetUnit.id
          : null)

      if (!activeTargetId) {
        tank.repairTargetUnit = null
        if (queueState.currentTargetId) {
          queueState.currentTargetId = null
          queueState.currentTargetType = null
        }
        if (unitCommands) {
          unitCommands.advanceUtilityQueue(tank, gameState.mapGrid, true)
        }
      } else if (queueState.currentTargetId !== activeTargetId || queueState.currentTargetType !== 'unit') {
        queueState.currentTargetId = activeTargetId
        queueState.currentTargetType = 'unit'
      }
    }

    const isCurrentlyServing = Boolean(tank.recoveryTask || tank.repairTarget)
    if (wasServing && !isCurrentlyServing) {
      tank.alertActiveService = false
      tank.alertAssignmentId = null
      tank.alertAssignmentType = null
      tank.nextUtilityScanTime = now + 2000
    }
    if (isCurrentlyServing) {
      tank.alertActiveService = true
    }
    tank._alertWasServing = isCurrentlyServing
  })
})

