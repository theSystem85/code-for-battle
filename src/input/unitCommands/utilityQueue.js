import { TILE_SIZE } from '../../config.js'
import { gameState } from '../../gameState.js'
import { playSound } from '../../sound.js'
import { showNotification } from '../../ui/notifications.js'
import { findPathForOwner } from '../../units.js'
import { units } from '../../main.js'
import { getWreckById, findNearestWorkshop, releaseWreckAssignment, getRecycleDurationForWreck } from '../../game/unitWreckManager.js'
import { computeTankerKamikazeApproach, updateKamikazeTargetPoint } from '../../game/tankerTruckUtils.js'
import { computeUtilityApproachPath, getUnitTilePosition, UTILITY_QUEUE_MODES } from './utilityHelpers.js'

export function clearAttackGroupState(unitsToClear) {
  unitsToClear.forEach(unit => {
    if (unit.attackQueue) {
      unit.attackQueue = null
    }
  })
  gameState.attackGroupTargets = []
}

export function cancelRecoveryTask(unit) {
  if (!unit || unit.type !== 'recoveryTank' || !unit.recoveryTask) {
    return
  }

  const wreck = getWreckById(gameState, unit.recoveryTask.wreckId)
  if (wreck) {
    if (wreck.assignedTankId === unit.id) {
      releaseWreckAssignment(wreck)
    }
    if (wreck.towedBy === unit.id) {
      wreck.towedBy = null
    }
  }

  unit.recoveryTask = null
  unit.towedWreck = null
  unit.recoveryProgress = 0
}

export function ensureUtilityQueueState(unit, mode = null) {
  if (!unit) return null
  if (!unit.utilityQueue) {
    unit.utilityQueue = {
      mode: null,
      targets: [],
      currentTargetId: null,
      currentTargetType: null,
      currentTargetAction: null,
      source: null,
      lockedByUser: false
    }
  }
  if (mode && unit.utilityQueue.mode !== mode) {
    unit.utilityQueue.mode = mode
    unit.utilityQueue.targets = []
    unit.utilityQueue.currentTargetId = null
    unit.utilityQueue.currentTargetType = null
    unit.utilityQueue.currentTargetAction = null
    unit.utilityQueue.source = null
    unit.utilityQueue.lockedByUser = false
  }
  return unit.utilityQueue
}

export function clearUtilityQueueState(unit) {
  if (!unit || !unit.utilityQueue) return
  unit.utilityQueue.mode = null
  unit.utilityQueue.targets = []
  unit.utilityQueue.currentTargetId = null
  unit.utilityQueue.currentTargetType = null
  unit.utilityQueue.currentTargetAction = null
  unit.utilityQueue.source = null
  unit.utilityQueue.lockedByUser = false
}

export function cancelCurrentUtilityTask(unit) {
  if (!unit) return
  if (unit.utilityQueue) {
    unit.utilityQueue.currentTargetId = null
    unit.utilityQueue.currentTargetType = null
    unit.utilityQueue.currentTargetAction = null
  }

  if (unit.type === 'ambulance') {
    unit.healingTarget = null
    unit.healingTimer = 0
  } else if (unit.type === 'tankerTruck') {
    unit.refuelTarget = null
    unit.refuelTimer = 0
    unit.emergencyTarget = null
    unit.emergencyMode = false
  } else if (unit.type === 'recoveryTank') {
    unit.repairTarget = null
    unit.repairTargetUnit = null
    unit.repairData = null
    unit.repairStarted = false
  }
}

export function canAmbulanceProvideCrew(ambulance) {
  if (!ambulance || ambulance.type !== 'ambulance') {
    return false
  }
  if (ambulance.health <= 0) {
    return false
  }
  if (ambulance.crew && typeof ambulance.crew === 'object' && !ambulance.crew.loader) {
    return false
  }
  return ambulance.medics > 0
}

export function canTankerProvideFuel(tanker) {
  if (!tanker || tanker.type !== 'tankerTruck') {
    return false
  }
  if (tanker.health <= 0) {
    return false
  }
  if (tanker.crew && typeof tanker.crew === 'object' && !tanker.crew.loader) {
    return false
  }
  return true
}

export function canRecoveryTankRepair(tank) {
  if (!tank || tank.type !== 'recoveryTank') {
    return false
  }
  if (tank.health <= 0) {
    return false
  }
  if (tank.crew && typeof tank.crew === 'object' && !tank.crew.loader) {
    return false
  }
  return true
}

export function canAmmunitionTruckOperate(ammoTruck) {
  if (!ammoTruck || ammoTruck.type !== 'ammunitionTruck') {
    return false
  }
  if (ammoTruck.health <= 0) {
    return false
  }
  if (ammoTruck.crew && typeof ammoTruck.crew === 'object' && !ammoTruck.crew.loader) {
    return false
  }
  return true
}

export function canAmmunitionTruckProvideAmmo(ammoTruck) {
  if (!canAmmunitionTruckOperate(ammoTruck)) {
    return false
  }
  return ammoTruck.ammoCargo > 0
}

export function findUnitById(id) {
  if (!id) return null
  return units.find(u => u.id === id) || null
}

export function isUtilityTargetValid(mode, serviceUnit, target) {
  if (!serviceUnit || !target) {
    return false
  }

  const isWreckTarget = target.isWreckTarget === true

  if (isWreckTarget) {
    if (mode !== UTILITY_QUEUE_MODES.REPAIR) {
      return false
    }
    const wreck = getWreckById(gameState, target.id)
    if (!wreck) {
      return false
    }
    if (wreck.isBeingRestored || wreck.towedBy || wreck.isBeingRecycled) {
      return false
    }
    if (wreck.assignedTankId && wreck.assignedTankId !== serviceUnit.id) {
      return false
    }
    return true
  }

  const actualTarget = target.type ? target : findUnitById(target.id)
  if (!actualTarget || actualTarget.health <= 0) {
    return false
  }
  if (actualTarget.id === serviceUnit.id) {
    return false
  }
  if (actualTarget.owner !== serviceUnit.owner) {
    return false
  }

  if (mode === UTILITY_QUEUE_MODES.HEAL) {
    return !!(actualTarget.crew && Object.values(actualTarget.crew).some(alive => !alive))
  }
  if (mode === UTILITY_QUEUE_MODES.REFUEL) {
    return typeof actualTarget.maxGas === 'number' && actualTarget.gas < actualTarget.maxGas
  }
  if (mode === UTILITY_QUEUE_MODES.AMMO) {
    const isApache = actualTarget.type === 'apache' || actualTarget.type === 'f35'
    const isBuilding = actualTarget.isBuilding || typeof actualTarget.tileX !== 'number'

    if (actualTarget.type === 'ammunitionFactory') {
      return serviceUnit.ammoCargo < serviceUnit.maxAmmoCargo
    }

    if (isBuilding) {
      return typeof actualTarget.maxAmmo === 'number' && actualTarget.ammo < actualTarget.maxAmmo
    }

    if (isApache) {
      return typeof actualTarget.maxRocketAmmo === 'number' && actualTarget.rocketAmmo < actualTarget.maxRocketAmmo
    }

    return typeof actualTarget.maxAmmunition === 'number' && actualTarget.ammunition < actualTarget.maxAmmunition
  }
  if (mode === UTILITY_QUEUE_MODES.REPAIR) {
    if (actualTarget.restorationProtectedFromRecovery) {
      return false
    }
    return actualTarget.health < actualTarget.maxHealth
  }
  return false
}

export function assignAmbulanceToTarget(ambulance, targetUnit, mapGrid, { suppressNotifications = false } = {}) {
  if (!canAmbulanceProvideCrew(ambulance)) {
    if (!suppressNotifications) {
      showNotification('No ambulances with crew selected!', 2000)
    }
    return false
  }
  if (!targetUnit || !targetUnit.crew || typeof targetUnit.crew !== 'object') {
    if (!suppressNotifications) {
      showNotification('Target unit cannot be healed!', 2000)
    }
    return false
  }
  const missingCrew = Object.entries(targetUnit.crew).some(([_, alive]) => !alive)
  if (!missingCrew) {
    if (!suppressNotifications) {
      showNotification('Target unit is already fully crewed!', 2000)
    }
    return false
  }
  const plan = computeUtilityApproachPath(ambulance, targetUnit, UTILITY_QUEUE_MODES.HEAL, mapGrid)
  if (!plan) {
    if (!suppressNotifications) {
      showNotification('Cannot path to target for healing!', 2000)
    }
    return false
  }

  ambulance.path = plan.path.slice(1)
  ambulance.moveTarget = { ...plan.moveTarget }
  ambulance.healingTarget = targetUnit
  ambulance.healingTimer = 0
  return true
}

export function assignTankerToTarget(tanker, targetUnit, mapGrid, { suppressNotifications = false } = {}) {
  if (!canTankerProvideFuel(tanker)) {
    if (!suppressNotifications) {
      showNotification('No tanker trucks with crew selected!', 2000)
    }
    return false
  }
  if (!targetUnit || typeof targetUnit.maxGas !== 'number' || targetUnit.gas >= targetUnit.maxGas) {
    if (!suppressNotifications) {
      showNotification('Target unit does not need fuel!', 2000)
    }
    return false
  }

  const plan = computeUtilityApproachPath(tanker, targetUnit, UTILITY_QUEUE_MODES.REFUEL, mapGrid)
  if (!plan) {
    if (!suppressNotifications) {
      showNotification('Cannot path to target for refuel!', 2000)
    }
    return false
  }

  tanker.path = plan.path.slice(1)
  tanker.moveTarget = { ...plan.moveTarget }
  tanker.refuelTarget = targetUnit
  tanker.refuelTimer = 0
  tanker.emergencyTarget = null
  return true
}

export function assignAmmunitionTruckToTarget(ammoTruck, target, mapGrid, { suppressNotifications = false, mode = 'resupply' } = {}) {
  const isReloadMode = mode === 'reload'

  if (isReloadMode) {
    if (!canAmmunitionTruckOperate(ammoTruck)) {
      return false
    }
  } else if (!canAmmunitionTruckProvideAmmo(ammoTruck)) {
    if (!suppressNotifications) {
      showNotification('No ammunition trucks with ammo selected!', 2000)
    }
    return false
  }

  if (!target) {
    return false
  }

  if (!isReloadMode) {
    ensureUtilityQueueState(ammoTruck, UTILITY_QUEUE_MODES.AMMO)
  }

  const isUnit = typeof target.tileX === 'number'

  if (!isReloadMode) {
    const needsAmmo = isUnit ?
      ((target.type === 'apache' || target.type === 'f35') ?
        (typeof target.maxRocketAmmo === 'number' && target.rocketAmmo < target.maxRocketAmmo) :
        (typeof target.maxAmmunition === 'number' && target.ammunition < target.maxAmmunition)) :
      (typeof target.maxAmmo === 'number' && target.ammo < target.maxAmmo)

    if (!needsAmmo) {
      if (!suppressNotifications) {
        showNotification('Target does not need ammo!', 2000)
      }
      return false
    }
  }

  const targetTileX = isUnit ? Math.floor((target.x + TILE_SIZE / 2) / TILE_SIZE) : target.x
  const targetTileY = isUnit ? Math.floor((target.y + TILE_SIZE / 2) / TILE_SIZE) : target.y

  let candidateTiles = []

  if (isUnit) {
    const directions = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
    ]
    candidateTiles = directions.map(dir => ({
      x: targetTileX + dir.x,
      y: targetTileY + dir.y
    }))
  } else {
    const buildingWidth = target.width || 1
    const buildingHeight = target.height || 1

    for (let bx = targetTileX - 1; bx <= targetTileX + buildingWidth; bx++) {
      for (let by = targetTileY - 1; by <= targetTileY + buildingHeight; by++) {
        const insideX = bx >= targetTileX && bx < targetTileX + buildingWidth
        const insideY = by >= targetTileY && by < targetTileY + buildingHeight
        if (insideX && insideY) {
          continue
        }
        candidateTiles.push({ x: bx, y: by })
      }
    }

    candidateTiles.sort((a, b) => {
      const distA = Math.hypot(a.x - ammoTruck.tileX, a.y - ammoTruck.tileY)
      const distB = Math.hypot(b.x - ammoTruck.tileX, b.y - ammoTruck.tileY)
      return distA - distB
    })
  }

  for (const tile of candidateTiles) {
    const destX = tile.x
    const destY = tile.y
    if (destX >= 0 && destY >= 0 && destX < mapGrid[0].length && destY < mapGrid.length) {
      const path = findPathForOwner(
        { x: ammoTruck.tileX, y: ammoTruck.tileY },
        { x: destX, y: destY },
        mapGrid,
        gameState.occupancyMap,
        ammoTruck.owner
      )
      if (path && path.length > 0) {
        ammoTruck.path = path.slice(1)
        ammoTruck.moveTarget = { x: destX, y: destY }
        if (isReloadMode) {
          ammoTruck.ammoReloadTargetId = target.id
          ammoTruck.ammoResupplyTarget = null
          ammoTruck.ammoResupplyTimer = 0
        } else {
          ammoTruck.ammoResupplyTarget = target
          ammoTruck.ammoResupplyTimer = 0
          if (ammoTruck.ammoReloadTargetId) {
            ammoTruck.ammoReloadTargetId = null
          }
          if (ammoTruck.utilityQueue && ammoTruck.utilityQueue.mode === UTILITY_QUEUE_MODES.AMMO) {
            ammoTruck.utilityQueue.currentTargetId = target.id
            ammoTruck.utilityQueue.currentTargetType = isUnit ? 'unit' : 'building'
          }
        }
        return true
      }
    }
  }

  if (!suppressNotifications) {
    showNotification('Cannot path to target for ammo resupply!', 2000)
  }
  return false
}

export function assignRecoveryTankToTarget(tank, targetUnit, mapGrid, { suppressNotifications = false } = {}) {
  if (!canRecoveryTankRepair(tank)) {
    if (!suppressNotifications) {
      showNotification('Recovery tank cannot repair right now!', 2000)
    }
    return false
  }
  if (targetUnit?.restorationProtectedFromRecovery) {
    if (!suppressNotifications) {
      showNotification('Target unit is leaving the workshop!', 2000)
    }
    return false
  }
  if (!targetUnit || targetUnit.health >= targetUnit.maxHealth) {
    if (!suppressNotifications) {
      showNotification('Target unit does not need repairs!', 2000)
    }
    return false
  }
  const plan = computeUtilityApproachPath(tank, targetUnit, UTILITY_QUEUE_MODES.REPAIR, mapGrid)
  if (!plan) {
    if (!suppressNotifications) {
      showNotification('Cannot reach unit for repair!', 2000)
    }
    return false
  }

  tank.path = plan.path.slice(1)
  tank.moveTarget = { ...plan.moveTarget }
  tank.target = null
  tank.repairTarget = null
  tank.repairData = null
  tank.repairStarted = false
  tank.repairTargetUnit = targetUnit
  return true
}

export function assignRecoveryTankToWreck(tank, wreck, mapGrid, { mode = 'tow', suppressNotifications = false } = {}) {
  if (!tank || tank.type !== 'recoveryTank' || tank.health <= 0) {
    return false
  }
  if (!wreck) {
    if (!suppressNotifications) {
      showNotification('Recovery tank cannot find that wreck.', 2000)
    }
    return false
  }
  const trackedWreck = getWreckById(gameState, wreck.id)
  if (!trackedWreck) {
    if (!suppressNotifications) {
      showNotification('Recovery tanks can only target wrecks.', 2000)
    }
    return false
  }

  const targetWreck = trackedWreck

  if (targetWreck.isBeingRestored || targetWreck.isBeingRecycled || targetWreck.towedBy) {
    if (!suppressNotifications) {
      showNotification('This wreck is already being processed.', 2000)
    }
    return false
  }

  if (tank.towedWreck && tank.towedWreck.id !== targetWreck.id) {
    releaseWreckAssignment(tank.towedWreck)
    tank.towedWreck.towedBy = null
    tank.towedWreck = null
  }

  if (tank.recoveryTask && tank.recoveryTask.wreckId !== targetWreck.id) {
    cancelRecoveryTask(tank)
  }

  if (targetWreck.assignedTankId && targetWreck.assignedTankId !== tank.id) {
    const assignedTankAlive = units.some(
      candidate => candidate.id === targetWreck.assignedTankId && candidate.type === 'recoveryTank' && candidate.health > 0
    )
    if (assignedTankAlive) {
      if (!suppressNotifications) {
        showNotification('Another recovery tank is already assigned to this wreck.', 2000)
      }
      return false
    }
    releaseWreckAssignment(targetWreck)
  }

  if (!canRecoveryTankRepair(tank)) {
    if (!suppressNotifications) {
      showNotification('Recovery tank cannot recover right now!', 2000)
    }
    return false
  }

  if (!mapGrid || mapGrid.length === 0 || !Array.isArray(mapGrid[0])) {
    return false
  }

  const wreckDescriptor = { ...targetWreck, isWreckTarget: true }
  const plan = computeUtilityApproachPath(tank, wreckDescriptor, UTILITY_QUEUE_MODES.REPAIR, mapGrid)

  if (!plan) {
    if (!suppressNotifications) {
      showNotification('Cannot reach wreck location.', 2000)
    }
    return false
  }

  const task = { wreckId: targetWreck.id }

  if (mode === 'tow') {
    const nearestWorkshop = findNearestWorkshop(gameState, tank.owner, { x: tank.tileX, y: tank.tileY })
    if (!nearestWorkshop) {
      if (!suppressNotifications) {
        showNotification('No workshop available for recovery!', 2000)
      }
      return false
    }
    task.mode = 'tow'
    task.state = 'movingToWreck'
    task.workshopId = nearestWorkshop.workshop.id
    task.workshopOwner = nearestWorkshop.workshop.owner
    task.workshopX = nearestWorkshop.workshop.x
    task.workshopY = nearestWorkshop.workshop.y
    task.workshopEntry = nearestWorkshop.entryTile
    task.originalPosition = { x: tank.tileX, y: tank.tileY }
  } else if (mode === 'recycle') {
    const recycleDuration = getRecycleDurationForWreck(targetWreck)
    task.mode = 'recycle'
    task.state = 'movingToWreck'
    task.recycleDuration = recycleDuration
  } else {
    return false
  }

  cancelRecoveryTask(tank)
  tank.guardMode = false
  tank.guardTarget = null
  tank.path = plan.path.slice(1)
  tank.moveTarget = { x: plan.moveTarget.x, y: plan.moveTarget.y }
  tank.recoveryTask = task
  if (!suppressNotifications) {
    playSound('movement', 0.5)
  }

  return true
}

export function startUtilityTaskForMode(handler, unit, targetUnit, mode, mapGrid, suppressNotifications = false) {
  if (mode === UTILITY_QUEUE_MODES.HEAL) {
    return handler.assignAmbulanceToTarget(unit, targetUnit, mapGrid, { suppressNotifications })
  }
  if (mode === UTILITY_QUEUE_MODES.REFUEL) {
    return handler.assignTankerToTarget(unit, targetUnit, mapGrid, { suppressNotifications })
  }
  if (mode === UTILITY_QUEUE_MODES.REPAIR) {
    return handler.assignRecoveryTankToTarget(unit, targetUnit, mapGrid, { suppressNotifications })
  }
  if (mode === UTILITY_QUEUE_MODES.AMMO) {
    return handler.assignAmmunitionTruckToTarget(unit, targetUnit, mapGrid, { suppressNotifications })
  }
  return false
}

export function startNextUtilityTask(handler, unit, mapGrid, suppressNotifications = false) {
  const queue = unit?.utilityQueue
  if (!queue || queue.currentTargetId) {
    return false
  }

  while (queue.targets.length > 0) {
    const entry = queue.targets.shift()
    if (!entry) continue
    const entryInfo = typeof entry === 'object' ? entry : { id: entry, type: 'unit' }
    const entryType = entryInfo.type || 'unit'
    const entryAction = entryInfo.action || entryInfo.queueAction || entryInfo.mode || null
    if (!entryInfo.id) {
      continue
    }

    if (entryType === 'wreck') {
      const descriptor = { id: entryInfo.id, isWreckTarget: true }
      if (!handler.isUtilityTargetValid(queue.mode, unit, descriptor)) {
        continue
      }
      const wreck = getWreckById(gameState, entryInfo.id)
      if (!wreck) {
        continue
      }
      const modeOverride = entryAction === 'recycle' ? 'recycle' : 'tow'
      const started = handler.assignRecoveryTankToWreck(unit, wreck, mapGrid, {
        suppressNotifications: true,
        mode: modeOverride
      })
      if (started) {
        queue.currentTargetId = entryInfo.id
        queue.currentTargetType = 'wreck'
        queue.currentTargetAction = modeOverride
        return true
      }
    } else {
      const target = handler.findUnitById(entryInfo.id)
      if (!target || !handler.isUtilityTargetValid(queue.mode, unit, target)) {
        continue
      }
      const started = handler.startUtilityTaskForMode(unit, target, queue.mode, mapGrid, suppressNotifications)
      if (started) {
        queue.currentTargetId = target.id
        queue.currentTargetType = 'unit'
        queue.currentTargetAction = null
        return true
      }
    }
  }

  if (!queue.targets.length) {
    queue.mode = null
    queue.currentTargetType = null
    queue.currentTargetAction = null
    queue.source = null
    queue.lockedByUser = false
  }
  return false
}

export function setUtilityQueue(handler, unit, targets, mode, mapGrid, { append = false, suppressNotifications = false, priority = false, source = 'user' } = {}) {
  if (!unit) {
    return { addedTargets: [], started: false }
  }
  const queue = handler.ensureUtilityQueueState(unit, mode)
  if (!append) {
    if (mode === UTILITY_QUEUE_MODES.REPAIR) {
      handler.cancelRecoveryTask(unit)
    }
    handler.cancelCurrentUtilityTask(unit)
    queue.targets = []
    queue.currentTargetId = null
    queue.currentTargetType = null
    queue.currentTargetAction = null
    queue.mode = mode
    queue.source = source
    queue.lockedByUser = source === 'user'
  } else {
    if (source && !queue.source) {
      queue.source = source
    }
    if (source === 'user') {
      queue.lockedByUser = true
    }
  }

  const existing = new Set()
  queue.targets.forEach(entry => {
    if (!entry) return
    if (typeof entry === 'object') {
      existing.add(`${entry.type || 'unit'}:${entry.id}`)
    } else {
      existing.add(`unit:${entry}`)
    }
  })
  if (queue.currentTargetId) {
    existing.add(`${queue.currentTargetType || 'unit'}:${queue.currentTargetId}`)
  }

  const addedTargets = []
  targets.forEach(target => {
    if (!target) return
    if (!handler.isUtilityTargetValid(mode, unit, target)) return
    const targetType = target.isWreckTarget ? 'wreck' : 'unit'
    const key = `${targetType}:${target.id}`
    if (existing.has(key)) return
    const entry = { id: target.id, type: targetType }
    if (target.queueAction) {
      entry.action = target.queueAction
    }
    if (priority) {
      queue.targets.unshift(entry)
    } else {
      queue.targets.push(entry)
    }
    existing.add(key)
    addedTargets.push(target)
  })

  let started = false
  if (!queue.currentTargetId) {
    started = startNextUtilityTask(handler, unit, mapGrid, suppressNotifications)
  }

  if (!queue.currentTargetId && queue.targets.length === 0 && !append) {
    queue.mode = null
    queue.source = null
    queue.lockedByUser = false
  }

  return { addedTargets, started }
}

export function advanceUtilityQueue(handler, unit, mapGrid, suppressNotifications = true) {
  if (!unit || !unit.utilityQueue) {
    return false
  }
  unit.utilityQueue.currentTargetId = null
  unit.utilityQueue.currentTargetType = null
  unit.utilityQueue.currentTargetAction = null
  const started = startNextUtilityTask(handler, unit, mapGrid, suppressNotifications)
  if (!started && unit.utilityQueue.targets.length === 0) {
    unit.utilityQueue.mode = null
    unit.utilityQueue.currentTargetType = null
    unit.utilityQueue.source = null
    unit.utilityQueue.lockedByUser = false
  }
  return started
}

export function findBestUtilityAssignment(serviceUnits, target, mode, mapGrid, simulatedPositions) {
  let best = null
  for (const unit of serviceUnits) {
    if (!isUtilityTargetValid(mode, unit, target)) {
      continue
    }
    const simulatedStart = simulatedPositions.get(unit.id) || getUnitTilePosition(unit)
    if (!simulatedStart) {
      continue
    }
    const plan = computeUtilityApproachPath(unit, target, mode, mapGrid, simulatedStart)
    if (!plan) {
      continue
    }
    if (!best || plan.cost < best.plan.cost) {
      best = { unit, plan }
    }
  }
  return best
}

export function planUtilityAssignments(serviceUnits, targets, mode, mapGrid) {
  const assignmentsMap = new Map()
  const simulatedPositions = new Map()
  const skippedTargets = []

  targets.forEach(target => {
    const best = findBestUtilityAssignment(serviceUnits, target, mode, mapGrid, simulatedPositions)
    if (!best) {
      skippedTargets.push(target)
      return
    }

    const { unit, plan } = best
    if (!assignmentsMap.has(unit.id)) {
      assignmentsMap.set(unit.id, { unit, targets: [] })
    }
    assignmentsMap.get(unit.id).targets.push(target)
    simulatedPositions.set(unit.id, { x: plan.destinationTile.x, y: plan.destinationTile.y })
  })

  return {
    assignments: Array.from(assignmentsMap.values()),
    skippedTargets
  }
}

export function queueUtilityTargets(handler, serviceUnits, targets, mode, mapGrid) {
  if (!serviceUnits || serviceUnits.length === 0 || !targets || targets.length === 0) {
    return false
  }

  let capabilityCheck
  if (mode === UTILITY_QUEUE_MODES.HEAL) {
    capabilityCheck = unit => handler.canAmbulanceProvideCrew(unit)
  } else if (mode === UTILITY_QUEUE_MODES.REFUEL) {
    capabilityCheck = unit => handler.canTankerProvideFuel(unit)
  } else if (mode === UTILITY_QUEUE_MODES.REPAIR) {
    capabilityCheck = unit => handler.canRecoveryTankRepair(unit)
  } else if (mode === UTILITY_QUEUE_MODES.AMMO) {
    capabilityCheck = unit => handler.canAmmunitionTruckProvideAmmo(unit)
  } else {
    return false
  }

  const capableUnits = serviceUnits.filter(capabilityCheck)
  if (capableUnits.length === 0) {
    return false
  }

  const filteredTargets = targets.filter(target =>
    capableUnits.some(unit => handler.isUtilityTargetValid(mode, unit, target))
  )
  if (filteredTargets.length === 0) {
    return false
  }

  const { assignments } = planUtilityAssignments(capableUnits, filteredTargets, mode, mapGrid)
  if (!assignments || assignments.length === 0) {
    return false
  }

  let anyQueued = false
  assignments.forEach(entry => {
    if (!entry || !entry.unit || !entry.targets || entry.targets.length === 0) {
      return
    }
    const result = setUtilityQueue(handler, entry.unit, entry.targets, mode, mapGrid, { suppressNotifications: true })
    if (result.addedTargets.length > 0 || result.started) {
      anyQueued = true
    }
  })

  if (anyQueued) {
    playSound('movement', 0.5)
  }
  return anyQueued
}

export function getUtilityQueuePosition(unit, target, overrideType = null) {
  if (!unit || !unit.utilityQueue || !target) {
    return null
  }
  const queue = unit.utilityQueue
  const targetId = target.id
  if (!targetId) {
    return null
  }
  const targetType = overrideType || (target.isWreckTarget ? 'wreck' : 'unit')
  const currentType = queue.currentTargetType || 'unit'
  if (queue.currentTargetId === targetId && currentType === targetType) {
    return 1
  }
  if (!Array.isArray(queue.targets)) {
    return null
  }
  const index = queue.targets.findIndex(entry => {
    if (!entry) return false
    if (typeof entry === 'object') {
      const entryType = entry.type || 'unit'
      return entry.id === targetId && entryType === targetType
    }
    return entry === targetId && targetType === 'unit'
  })
  if (index === -1) {
    return null
  }
  return (queue.currentTargetId ? 2 : 1) + index
}

export function issueTankerKamikazeCommand(tanker, target, mapGrid) {
  if (!tanker || tanker.type !== 'tankerTruck' || !target || !mapGrid) {
    return
  }

  tanker.kamikazeMode = true
  tanker.kamikazeTargetId = target.id || null
  tanker.kamikazeTargetType = target.tileX !== undefined ? 'unit' : 'building'
  tanker.kamikazeTargetBuilding = tanker.kamikazeTargetType === 'building' ? target : null
  tanker.forcedAttack = true
  tanker.target = null
  tanker.refuelTarget = null
  tanker.refuelTimer = 0
  tanker.emergencyTarget = null
  tanker.emergencyMode = false

  updateKamikazeTargetPoint(tanker, target)

  const plan = computeTankerKamikazeApproach(tanker, target, mapGrid, gameState.occupancyMap)
  if (plan) {
    tanker.path = plan.path.slice(1)
    tanker.moveTarget = { ...plan.moveTarget }
  } else if (tanker.kamikazeTargetPoint) {
    tanker.path = []
    tanker.moveTarget = {
      x: Math.floor(tanker.kamikazeTargetPoint.x / TILE_SIZE),
      y: Math.floor(tanker.kamikazeTargetPoint.y / TILE_SIZE)
    }
  } else {
    tanker.path = []
    tanker.moveTarget = null
  }

  tanker.kamikazeLastPathTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
}
