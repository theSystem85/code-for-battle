import { TILE_SIZE, TANK_FIRE_RANGE } from '../../config.js'
import { playSound } from '../../sound.js'
import { findPathForOwner } from '../../units.js'
import { gameState } from '../../gameState.js'
import { cancelRetreatForUnits } from '../../behaviours/retreat.js'
import { broadcastUnitAttack } from '../../network/gameCommandSync.js'
import { clearTankerKamikazeState } from '../../game/tankerTruckUtils.js'
import { issueTankerKamikazeCommand, clearAttackGroupState } from './utilityQueue.js'

export function handleAttackCommand(handler, selectedUnits, target, mapGrid, isForceAttack = false, skipQueueClear = false) {
  if (!handler.isAttackGroupOperation) {
    clearAttackGroupState(selectedUnits)
  }

  cancelRetreatForUnits(selectedUnits)
  selectedUnits.forEach(u => { u.guardTarget = null; u.guardMode = false })

  if (!skipQueueClear) {
    selectedUnits.forEach(unit => {
      handler.cancelRecoveryTask(unit)
      unit.commandQueue = []
      unit.currentCommand = null
      if (unit.type === 'tankerTruck') {
        clearTankerKamikazeState(unit)
      }
    })
  }

  const explosionSafetyBuffer = TILE_SIZE * 0.5
  const safeAttackDistance = Math.max(
    TANK_FIRE_RANGE * TILE_SIZE,
    TILE_SIZE * 2 + explosionSafetyBuffer
  ) - TILE_SIZE

  const tankerUnits = selectedUnits.filter(unit => unit.type === 'tankerTruck')
  const combatUnits = selectedUnits.filter(unit => unit.type !== 'tankerTruck')

  const formationPositions = calculateSemicircleFormation(combatUnits, target, safeAttackDistance)

  combatUnits.forEach((unit, index) => {
    unit.canFire = true

    if (unit.type === 'apache' || unit.type === 'f22Raptor') {
      const targetCenter = target.tileX !== undefined
        ? { x: target.x + TILE_SIZE / 2, y: target.y + TILE_SIZE / 2 }
        : {
          x: (target.x + (target.width || 1) / 2) * TILE_SIZE,
          y: (target.y + (target.height || 1) / 2) * TILE_SIZE
        }
      const destTile = {
        x: Math.floor(targetCenter.x / TILE_SIZE),
        y: Math.floor(targetCenter.y / TILE_SIZE)
      }

      if (handler.assignApacheFlight) {
        handler.assignApacheFlight(unit, destTile, targetCenter, {
          mode: 'combat',
          stopRadius: TILE_SIZE * 0.25,
          followTargetId: target.id || null
        })
      }
      unit.target = target
      unit.forcedAttack = isForceAttack
      return
    }

    const position = formationPositions[index]

    const unitCenter = { x: unit.x + TILE_SIZE / 2, y: unit.y + TILE_SIZE / 2 }
    const targetCenter = getTargetPoint(target, unitCenter)
    const finalDx = targetCenter.x - position.x
    const finalDy = targetCenter.y - position.y
    const finalDist = Math.hypot(finalDx, finalDy)

    let destX = position.x
    let destY = position.y

    if (finalDist < safeAttackDistance) {
      const scale = safeAttackDistance / finalDist
      destX = targetCenter.x - finalDx * scale
      destY = targetCenter.y - finalDy * scale
    }

    const desiredTile = {
      x: Math.floor(destX / TILE_SIZE),
      y: Math.floor(destY / TILE_SIZE)
    }

    const occupancyMap = gameState.occupancyMap
    const path = findPathForOwner({ x: unit.tileX, y: unit.tileY }, desiredTile, mapGrid, occupancyMap, unit.owner)

    if (path && path.length > 0 && (unit.tileX !== desiredTile.x || unit.tileY !== desiredTile.y)) {
      unit.path = path.slice(1)
      unit.target = target
      unit.moveTarget = desiredTile
      unit.forcedAttack = isForceAttack
    } else {
      unit.path = []
      unit.target = target
      unit.moveTarget = null
      unit.forcedAttack = isForceAttack
    }
  })

  tankerUnits.forEach(tanker => {
    if (isEnemyTargetForUnit(target, tanker)) {
      issueTankerKamikazeCommand(tanker, target, mapGrid)
    } else {
      clearTankerKamikazeState(tanker)
      tanker.target = null
    }
  })

  playSound('attacking', 1.0)
  broadcastUnitAttack(selectedUnits, target)
}

export function calculateSemicircleFormation(units, target, safeAttackDistance) {
  const positions = []
  const unitCount = units.length
  const targetCenter = getTargetPoint(target, { x: 0, y: 0 })

  if (unitCount === 1) {
    const angle = 0
    const x = targetCenter.x - Math.cos(angle) * safeAttackDistance
    const y = targetCenter.y - Math.sin(angle) * safeAttackDistance
    positions.push({ x, y })
  } else {
    const arcSpan = Math.PI
    const angleStep = arcSpan / Math.max(1, unitCount - 1)
    const startAngle = -arcSpan / 2

    for (let i = 0; i < unitCount; i++) {
      const angle = startAngle + (i * angleStep)
      const x = targetCenter.x - Math.cos(angle) * safeAttackDistance
      const y = targetCenter.y - Math.sin(angle) * safeAttackDistance
      positions.push({ x, y })
    }
  }

  return positions
}

export function getTargetPoint(target, unitCenter) {
  if (target.tileX !== undefined) {
    return { x: target.x + TILE_SIZE / 2, y: target.y + TILE_SIZE / 2 }
  }
  const rect = {
    x: target.x * TILE_SIZE,
    y: target.y * TILE_SIZE,
    width: target.width * TILE_SIZE,
    height: target.height * TILE_SIZE
  }
  return {
    x: Math.max(rect.x, Math.min(unitCenter.x, rect.x + rect.width)),
    y: Math.max(rect.y, Math.min(unitCenter.y, rect.y + rect.height))
  }
}

export function isEnemyTargetForUnit(target, unit) {
  if (!target || !unit || !unit.owner) {
    return false
  }

  const targetOwner = typeof target.owner === 'string' ? target.owner : null
  if (!targetOwner) {
    return false
  }

  const normalizeOwner = owner => {
    if (owner === 'player') return 'player1'
    return owner
  }

  return normalizeOwner(targetOwner) !== normalizeOwner(unit.owner)
}
