import { startMineDeployment, isMinePlantTileBlocked } from './mineLayerBehavior.js'
import { safeSweeperDetonation, getMineAtTile } from './mineSystem.js'
import { activateSweepingMode } from './mineSweeperBehavior.js'
import { TILE_SIZE } from '../config.js'
import { playSound } from '../sound.js'
import { gameState } from '../gameState.js'
import { getSimulationTime } from './time.js'

export function processCommandQueues(units, mapGrid, unitCommands, buildings = []) {
  units.forEach(unit => {
    if ((!unit.commandQueue || unit.commandQueue.length === 0) && !unit.currentCommand) return

    if (!unit.currentCommand) {
      const action = unit.commandQueue.shift()
      unit.currentCommand = action
      executeAction(unit, action, mapGrid, unitCommands)
    } else {
      const complete = isActionComplete(unit, unit.currentCommand, units, buildings, mapGrid, unitCommands)
      if (complete) {
        handleCommandCompletion(unit, unit.currentCommand)
        unit.currentCommand = null
      }
    }
  })
}

function executeAction(unit, action, mapGrid, unitCommands) {
  if (!action) return

  if (action.type !== 'sweepArea') {
    clearSweepingOverride(unit)
  }

  switch (action.type) {
    case 'move':
      unitCommands.handleMovementCommand([unit], action.x, action.y, mapGrid, true)
      break
    case 'attack':
      unitCommands.handleAttackCommand([unit], action.target, mapGrid, false, true)
      break
    case 'agf':
      unit.attackQueue = []
      action.targets.forEach(t => unit.attackQueue.push(t))
      if (unit.attackQueue.length > 0) {
        unitCommands.handleAttackCommand([unit], unit.attackQueue[0], mapGrid, false, true)
      }
      break
    case 'workshopRepair':
      unitCommands.handleWorkshopRepairHotkey([unit], mapGrid, false, true)
      break
    case 'deployMine':
      if (!unit.deployingMine) {
        const worldX = action.x * TILE_SIZE + TILE_SIZE / 2
        const worldY = action.y * TILE_SIZE + TILE_SIZE / 2
        unitCommands.handleMovementCommand([unit], worldX, worldY, mapGrid, true)
      }
      break
    case 'sweepArea':
      if (action.path && action.path.length > 0) {
        if (!unit.sweeping) {
          activateSweepingMode(unit)
        }
        issueNextSweepMovement(unit, action)
      }
      break
  }
}

function issueNextSweepMovement(unit, action) {
  if (!action.path || action.path.length === 0) return
  const nextTile = action.path[0]
  unit.sweepingOverrideMovement = true
  unit.target = null
  unit.attackQueue = []
  unit.moveTarget = { x: nextTile.x, y: nextTile.y }
  unit.path = [{ x: nextTile.x, y: nextTile.y }]
  unit.originalPath = null
  unit.originalTarget = null
}

function isActionComplete(unit, action, units = [], buildings = [], _mapGrid, _unitCommands) {
  switch (action.type) {
    case 'move':
      return (!unit.path || unit.path.length === 0) && !unit.moveTarget
    case 'attack':
    case 'agf':
      return (!unit.target || unit.target.health <= 0) && (!unit.attackQueue || unit.attackQueue.length === 0)
    case 'workshopRepair':
      return !unit.targetWorkshop && !unit.repairingAtWorkshop && !unit.returningFromWorkshop && (!unit.moveTarget && (!unit.path || unit.path.length === 0))
    case 'deployMine': {
      if (unit.deploymentCompleted) {
        unit.deploymentCompleted = false
        return true
      }

      // Occupied, mined, or impassable tiles are not plant spots. Drop the order
      // immediately so the layer moves on instead of waiting or deploying there.
      if (isMinePlantTileBlocked(action.x, action.y, unit, {
        mapGrid: _mapGrid,
        buildings,
        units
      })) {
        cancelMinePlantAttempt(unit)
        return true
      }

      const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
      const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
      const distanceToTarget = Math.hypot(unitTileX - action.x, unitTileY - action.y)
      const atLocation = distanceToTarget < 0.6
      const movementComplete = (!unit.path || unit.path.length === 0) && !unit.moveTarget

      if ((atLocation || movementComplete) && !unit.deployingMine) {
        startMineDeployment(unit, action.x, action.y, getSimulationTime(gameState))
        return false
      }

      return false
    }
    case 'sweepArea':
    {
      if (!action.path || action.path.length === 0) {
        clearSweepingOverride(unit)
        return true
      }

      const currentTile = action.path[0]
      const sweeperTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
      const sweeperTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
      const distanceToTarget = Math.hypot(sweeperTileX - currentTile.x, sweeperTileY - currentTile.y)
      const atTile = distanceToTarget < 0.35 || (sweeperTileX === currentTile.x && sweeperTileY === currentTile.y)

      if (!atTile) {
        return false
      }

      const mine = getMineAtTile(currentTile.x, currentTile.y)
      if (mine) {
        safeSweeperDetonation(mine, units, buildings)
      }

      action.path.shift()

      if (action.path.length > 0) {
        issueNextSweepMovement(unit, action)
        return false
      }

      clearSweepingOverride(unit)
      unit.moveTarget = null
      unit.path = []
      return true
    }
  }

  return true
}

function handleCommandCompletion(unit, action) {
  if (!action) return

  if (action.type === 'sweepArea') {
    if ((!action.path || action.path.length === 0) && !action._sweepSoundPlayed) {
      playSound('AllMinesOnTheFieldAreDisarmed', 1.0, 0, true)
      action._sweepSoundPlayed = true
    }
    clearSweepingOverride(unit)
  }

  if (action.type === 'deployMine' && action.areaFieldId) {
    notifyMineFieldDeployed(unit, action.areaFieldId)
  }
}

function clearSweepingOverride(unit) {
  if (!unit) return
  unit.sweepingOverrideMovement = false
}

function cancelMinePlantAttempt(unit) {
  if (!unit) return
  unit.deployingMine = false
  unit.deployStartTime = null
  unit.path = []
  unit.moveTarget = null
}

function notifyMineFieldDeployed(unit, fieldId) {
  if (!unit || !fieldId || !unit.pendingMineFieldDeployments) return
  const entry = unit.pendingMineFieldDeployments[fieldId]
  if (!entry) return

  entry.remaining = Math.max(0, (entry.remaining || 1) - 1)
  if (entry.remaining === 0 && !entry.notified) {
    playSound('The_mine_field_has_been_deployed_and_armed', 1.0, 0, true)
    entry.notified = true
  }
  if (entry.remaining === 0) {
    delete unit.pendingMineFieldDeployments[fieldId]
  }
}
