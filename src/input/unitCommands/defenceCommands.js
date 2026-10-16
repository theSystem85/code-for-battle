import { gameState } from '../../gameState.js'
import { getSimulationTime } from '../../game/time.js'
import { noteDefenceDirectOrder } from '../../policies/defenceCommandApi.js'

export function queueDefenseBuildingTarget(building, target) {
  if (!building || !target) {
    return false
  }

  if (!Array.isArray(building.forcedAttackQueue)) {
    building.forcedAttackQueue = []
  }

  const isSameTarget = candidate => candidate && target && candidate.id === target.id
  const currentTarget = building.forcedAttackTarget
  const targetAlreadyQueued = building.forcedAttackQueue.some(isSameTarget)

  if (!currentTarget || currentTarget.health <= 0) {
    building.forcedAttackTarget = target
  } else if (!isSameTarget(currentTarget) && !targetAlreadyQueued) {
    // New target becomes active immediately; previous active target is queued next.
    building.forcedAttackQueue.unshift(currentTarget)
    building.forcedAttackTarget = target
  }

  building.forcedAttack = true
  building.holdFire = false
  noteDefenceDirectOrder(building, 'attack', getSimulationTime(gameState))
  return true
}
