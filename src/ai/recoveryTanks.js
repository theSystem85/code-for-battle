// recoveryTanks.js - AI recovery tank management
import { TILE_SIZE } from '../config.js'
import { getUnitCommandsHandler } from '../inputHandler.js'
import { getActiveAIPlayers } from './enemyUtils.js'

const RECOVERY_COMMAND_COOLDOWN = 2000

function getTargetTilePosition(target) {
  if (!target) return null
  if (Number.isFinite(target.tileX) && Number.isFinite(target.tileY)) {
    return { x: target.tileX, y: target.tileY }
  }
  if (typeof target.x === 'number' && typeof target.y === 'number') {
    return {
      x: Math.floor((target.x + TILE_SIZE / 2) / TILE_SIZE),
      y: Math.floor((target.y + TILE_SIZE / 2) / TILE_SIZE)
    }
  }
  return null
}

function tileDistance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by)
}

function getSortedRecoveryTankOptions(candidateTanks, usedTankIds, targetTile) {
  if (!targetTile) return []

  return candidateTanks
    .filter(tank => !usedTankIds.has(tank.id))
    .map(tank => {
      const tankTile = getTargetTilePosition(tank)
      if (!tankTile) return null
      return {
        tank,
        distance: tileDistance(tankTile.x, tankTile.y, targetTile.x, targetTile.y)
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance)
}

function isRecoveryTankAvailable(tank) {
  if (!tank || tank.health <= 0) return false

  // Allow tanks that are still in factory to be assigned tasks (they'll execute when released)
  // Skip tanks that are already busy with other tasks
  if (tank.recoveryTask || tank.towedWreck) return false
  if (tank.repairTarget || tank.repairTargetUnit) return false
  if (tank.returningToHospital || tank.repairingAtWorkshop || tank.returningToWorkshop) return false
  if (tank.crew && typeof tank.crew === 'object' && !tank.crew.loader) return false

  const queue = tank.utilityQueue
  if (queue && queue.mode === 'repair') {
    if (queue.currentTargetId) return false
    if (Array.isArray(queue.targets) && queue.targets.length > 0) return false
  }

  return true
}

function hasRecentRecoveryCommand(tank, now) {
  if (!tank || !tank.lastRecoveryCommandTime) return false
  // Skip cooldown for freshly spawned tanks
  if (tank.freshlySpawned) {
    tank.freshlySpawned = false // Clear flag after first check
    return false
  }
  return now - tank.lastRecoveryCommandTime < RECOVERY_COMMAND_COOLDOWN
}

function isUnitAlreadyAssignedToRecovery(recoveryTanks, targetUnit) {
  if (!targetUnit || !targetUnit.id) return false

  return recoveryTanks.some(tank => {
    if (!tank || tank.health <= 0) return false
    if (tank.repairTarget && tank.repairTarget.id === targetUnit.id) return true
    if (tank.repairTargetUnit && tank.repairTargetUnit.id === targetUnit.id) return true

    const queue = tank.utilityQueue
    if (!queue || queue.mode !== 'repair') return false

    if (queue.currentTargetId === targetUnit.id && (queue.currentTargetType || 'unit') === 'unit') {
      return true
    }

    if (!Array.isArray(queue.targets)) return false
    return queue.targets.some(entry => {
      if (!entry) return false
      if (typeof entry === 'object') {
        const entryId = entry.id
        const entryType = entry.type || 'unit'
        return entryId === targetUnit.id && entryType === 'unit'
      }
      return entry === targetUnit.id
    })
  })
}

function attemptAssignRecoveryTankToWreck(tank, wreck, mapGrid, unitCommands, now) {
  if (!tank || !wreck || !unitCommands) {
    window.logger.warn('Recovery tank wreck assignment failed: missing tank, wreck, or commands', {
      hasTank: !!tank,
      hasWreck: !!wreck,
      hasCommands: !!unitCommands
    })
    return false
  }

  const descriptor = { id: wreck.id, isWreckTarget: true, queueAction: 'tow' }
  const result = unitCommands.setUtilityQueue(tank, [descriptor], 'repair', mapGrid, {
    suppressNotifications: true
  })

  tank.lastRecoveryCommandTime = now

  // Check multiple success conditions
  if (tank.recoveryTask && tank.recoveryTask.wreckId === wreck.id) {
    return true
  }

  if (result?.started) {
    return true
  }

  const queue = tank.utilityQueue
  const queueSuccess = !!(queue && queue.mode === 'repair' && queue.currentTargetId === wreck.id && (queue.currentTargetType || 'unit') === 'wreck')

  if (!queueSuccess) {
    window.logger.warn(`✗ Recovery tank ${tank.id} assignment to wreck ${wreck.id} failed`, {
      hasQueue: !!queue,
      queueMode: queue?.mode,
      currentTargetId: queue?.currentTargetId,
      resultStarted: result?.started
    })
  }

  return queueSuccess
}

function attemptAssignRecoveryTankToUnit(tank, targetUnit, mapGrid, unitCommands, now) {
  if (!tank || !targetUnit || !unitCommands) return false

  const result = unitCommands.setUtilityQueue(tank, [targetUnit], 'repair', mapGrid, {
    suppressNotifications: true
  })

  tank.lastRecoveryCommandTime = now

  if (tank.repairTargetUnit && tank.repairTargetUnit.id === targetUnit.id) {
    return true
  }

  if (result?.started) {
    return true
  }

  const queue = tank.utilityQueue
  if (!queue || queue.mode !== 'repair') return false

  if (queue.currentTargetId === targetUnit.id && (queue.currentTargetType || 'unit') === 'unit') {
    return true
  }

  if (!Array.isArray(queue.targets)) return false
  return queue.targets.some(entry => {
    if (!entry) return false
    if (typeof entry === 'object') {
      const entryId = entry.id
      const entryType = entry.type || 'unit'
      return entryId === targetUnit.id && entryType === 'unit'
    }
    return entry === targetUnit.id
  })
}

export function manageAIRecoveryTanks(units, gameState, mapGrid, now) {
  const unitCommands = getUnitCommandsHandler ? getUnitCommandsHandler() : null
  if (!unitCommands) {
    window.logger.warn('manageAIRecoveryTanks: No unit commands handler available')
    return
  }

  const timeNow = typeof now === 'number'
    ? now
    : (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

  const aiPlayers = getActiveAIPlayers(gameState)

  aiPlayers.forEach(aiPlayerId => {
    const aiUnits = units.filter(u => u.owner === aiPlayerId && u.health > 0)
    if (aiUnits.length === 0) return

    const recoveryTanks = aiUnits.filter(u => u.type === 'recoveryTank')
    if (recoveryTanks.length === 0) return

    const candidateTanks = recoveryTanks.filter(tank =>
      isRecoveryTankAvailable(tank) && !hasRecentRecoveryCommand(tank, timeNow)
    )

    if (candidateTanks.length === 0) return

    const usedTankIds = new Set()

    if (Array.isArray(gameState.unitWrecks) && gameState.unitWrecks.length > 0) {
      const availableWrecks = gameState.unitWrecks.filter(wreck =>
        !wreck.assignedTankId &&
        !wreck.towedBy &&
        !wreck.isBeingRecycled
      )

      // For each available recovery tank, find the closest wreck and assign it
      // This ensures proximity-based assignment
      candidateTanks.forEach(tank => {
        if (usedTankIds.has(tank.id)) return
        if (availableWrecks.length === 0) return

        const tankTile = getTargetTilePosition(tank)
        if (!tankTile) return

        // Find closest wreck to this tank
        let closestWreck = null
        let closestDistance = Infinity

        availableWrecks.forEach(wreck => {
          const wreckTile = getTargetTilePosition(wreck)
          if (!wreckTile) return

          const distance = tileDistance(tankTile.x, tankTile.y, wreckTile.x, wreckTile.y)
          if (distance < closestDistance) {
            closestDistance = distance
            closestWreck = wreck
          }
        })

        if (closestWreck) {
          const success = attemptAssignRecoveryTankToWreck(tank, closestWreck, mapGrid, unitCommands, timeNow)
          if (success) {
            usedTankIds.add(tank.id)
            // Remove assigned wreck from available list
            const wreckIndex = availableWrecks.indexOf(closestWreck)
            if (wreckIndex > -1) {
              availableWrecks.splice(wreckIndex, 1)
            }
          }
        }
      })
    }

    if (usedTankIds.size === candidateTanks.length) return

    const damagedUnits = aiUnits.filter(u => {
      if (!u || u.type === 'recoveryTank' || u.health <= 0) return false
      if (typeof u.maxHealth !== 'number' || u.maxHealth <= 0) return false
      if (u.health / u.maxHealth >= 0.5) return false
      if (u.restorationProtectedFromRecovery) return false
      return true
    })

    damagedUnits.sort((a, b) => (a.health / a.maxHealth) - (b.health / b.maxHealth))

    damagedUnits.forEach(targetUnit => {
      if (usedTankIds.size === candidateTanks.length) return
      if (isUnitAlreadyAssignedToRecovery(recoveryTanks, targetUnit)) return

      const targetTile = getTargetTilePosition(targetUnit)
      if (!targetTile) return

      const sortedTanks = getSortedRecoveryTankOptions(candidateTanks, usedTankIds, targetTile)

      for (const entry of sortedTanks) {
        const success = attemptAssignRecoveryTankToUnit(entry.tank, targetUnit, mapGrid, unitCommands, timeNow)
        if (success) {
          usedTankIds.add(entry.tank.id)
          break
        }
      }
    })
  })
}
