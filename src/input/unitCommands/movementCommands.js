import { TILE_SIZE } from '../../config.js'
import { playPositionalSound } from '../../sound.js'
import { showNotification } from '../../ui/notifications.js'
import { gameState } from '../../gameState.js'
import { findPathForOwner } from '../../units.js'
import { cancelRetreatForUnits } from '../../behaviours/retreat.js'
import { clearTankerKamikazeState } from '../../game/tankerTruckUtils.js'
import { broadcastUnitMove } from '../../network/gameCommandSync.js'
import { resetUnitVelocityForNewPath } from '../../game/unifiedMovement.js'
import { clearAttackGroupState, cancelRecoveryTask } from './utilityQueue.js'
import { hasBlockingBuilding } from '../../utils/buildingPassability.js'

export function handleMovementCommand(handler, selectedUnits, targetX, targetY, mapGrid, skipQueueClear = false) {
  const commandableUnits = selectedUnits.filter(unit => {
    if (unit.crew && typeof unit.crew === 'object' && !unit.crew.commander) {
      return false
    }
    return true
  })

  if (commandableUnits.length === 0 && selectedUnits.some(unit =>
    unit.crew && typeof unit.crew === 'object' && !unit.crew.commander)) {
    showNotification('Cannot command units without commanders!', 2000)
    return
  }

  const unitsToCommand = commandableUnits.length > 0 ? commandableUnits : selectedUnits

  clearAttackGroupState(unitsToCommand)
  cancelRetreatForUnits(unitsToCommand)

  if (!skipQueueClear) {
    unitsToCommand.forEach(unit => {
      cancelRecoveryTask(unit)
      unit.commandQueue = []
      unit.currentCommand = null
    })
  }

  const count = unitsToCommand.length

  let anyMoved = false
  let outOfGasCount = 0
  let unreachableHumanCount = 0
  const mapHeight = mapGrid.length
  const mapWidth = mapGrid[0]?.length || 0
  unitsToCommand.forEach((unit, index) => {
    unit.guardTarget = null
    unit.guardMode = false
    if (unit.type === 'tankerTruck') {
      clearTankerKamikazeState(unit)
    }
    unit.restorationMoveOverride = false
    unit.restorationMoveTarget = null
    let formationOffset = { x: 0, y: 0 }

    const colsCount = Math.ceil(Math.sqrt(count))
    const col = index % colsCount
    const row = Math.floor(index / colsCount)

    if (unit.formationActive && unit.formationOffset) {
      formationOffset = {
        x: unit.formationOffset.x,
        y: unit.formationOffset.y
      }
    } else {
      const formationSpacing = TILE_SIZE * 1.2
      formationOffset = {
        x: col * formationSpacing - ((colsCount - 1) * formationSpacing) / 2,
        y: row * formationSpacing - ((colsCount - 1) * formationSpacing) / 2
      }
    }

    const destX = Math.floor(targetX) + formationOffset.x
    const destY = Math.floor(targetY) + formationOffset.y
    const originalDestTile = { x: Math.floor(destX / TILE_SIZE), y: Math.floor(destY / TILE_SIZE) }

    const alreadyTargeted = unitsToCommand.slice(0, index).some(u =>
      u.moveTarget && u.moveTarget.x === originalDestTile.x && u.moveTarget.y === originalDestTile.y
    )

    let destTile = originalDestTile
    if (alreadyTargeted) {
      const directions = [
        { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
        { dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }
      ]

      for (const dir of directions) {
        const newTile = {
          x: originalDestTile.x + dir.dx,
          y: originalDestTile.y + dir.dy
        }

        if (newTile.x >= 0 && newTile.y >= 0 &&
            newTile.x < mapGrid[0].length && newTile.y < mapGrid.length &&
            mapGrid[newTile.y][newTile.x].type !== 'water' &&
            mapGrid[newTile.y][newTile.x].type !== 'rock' &&
            !hasBlockingBuilding(mapGrid[newTile.y][newTile.x]) &&
            !selectedUnits.slice(0, index).some(u =>
              u.moveTarget && u.moveTarget.x === newTile.x && u.moveTarget.y === newTile.y
            )) {
          destTile = newTile
          break
        }
      }
    }

    const gasDepleted = typeof unit.maxGas === 'number' && unit.gas <= 0

    if (unit.type === 'apache' || unit.type === 'f22Raptor') {
      if (gasDepleted) {
        outOfGasCount++
        return
      }

      const clampedTile = {
        x: Math.max(0, Math.min(destTile.x, mapWidth > 0 ? mapWidth - 1 : destTile.x)),
        y: Math.max(0, Math.min(destTile.y, mapHeight > 0 ? mapHeight - 1 : destTile.y))
      }
      const center = {
        x: clampedTile.x * TILE_SIZE + TILE_SIZE / 2,
        y: clampedTile.y * TILE_SIZE + TILE_SIZE / 2
      }

      if (handler.assignApacheFlight && handler.assignApacheFlight(unit, clampedTile, center, { mode: 'manual' })) {
        unit.target = null
        unit.originalTarget = null
        unit.forcedAttack = false
        anyMoved = true
      }
      return
    }

    const path =
      gasDepleted
        ? null
        : findPathForOwner(
          { x: unit.tileX, y: unit.tileY },
          destTile,
          mapGrid,
          gameState.occupancyMap,
          unit.owner,
          { strictDestination: true }
        )

    if (path && path.length > 0) {
      resetUnitVelocityForNewPath(unit)

      unit.path = path.length > 1 ? path.slice(1) : path
      unit.target = null
      unit.burstState = null
      unit.remoteRocketTarget = null
      unit.remoteReticleVisible = false
      unit.moveTarget = destTile
      unit.originalTarget = null

      if (unit.type === 'tank' || unit.type === 'tank_v1' || unit.type === 'tank-v2' || unit.type === 'tank-v3' || unit.type === 'rocketTank') {
        unit.turretShouldFollowMovement = true
      }
      unit.originalPath = null
      unit.isDodging = false
      unit.dodgeEndTime = null
      unit.forcedAttack = false
      anyMoved = true
    } else if (gasDepleted) {
      outOfGasCount++
    } else {
      if (unit.owner === gameState.humanPlayer) {
        unreachableHumanCount++
      }

      resetUnitVelocityForNewPath(unit)
      unit.path = []
      unit.moveTarget = null
    }

  })
  if (outOfGasCount > 0) {
    const avgX = selectedUnits.reduce((sum, u) => sum + u.x, 0) / selectedUnits.length
    const avgY = selectedUnits.reduce((sum, u) => sum + u.y, 0) / selectedUnits.length
    playPositionalSound('outOfGas', avgX, avgY, 0.5)
  } else if (anyMoved) {
    const avgX = selectedUnits.reduce((sum, u) => sum + u.x, 0) / selectedUnits.length
    const avgY = selectedUnits.reduce((sum, u) => sum + u.y, 0) / selectedUnits.length
    playPositionalSound('movement', avgX, avgY, 0.5)
  }

  if (unreachableHumanCount > 0) {
    showNotification(
      unreachableHumanCount === 1
        ? 'Cannot reach that location. Move command aborted.'
        : `${unreachableHumanCount} units cannot reach that location. Move commands aborted.`,
      2200
    )
  }

  if (unitsToCommand.length > 0) {
    window.logger('[UnitCommands] Broadcasting move command for', unitsToCommand.length, 'units to', targetX, targetY)
    window.logger('[UnitCommands] Unit owners:', unitsToCommand.map(u => ({ id: u.id, owner: u.owner })))
    window.logger('[UnitCommands] gameState.humanPlayer:', gameState.humanPlayer)
    broadcastUnitMove(unitsToCommand, targetX, targetY)
  }
}
