// enemyStrategies.js - Enhanced enemy AI strategies (refactored)
// Main orchestrator that imports specialized modules and re-exports for backward compatibility

import { calculateRepairCost } from '../buildings.js'

// Import specialized AI modules
import {
  manageAIRecoveryTanks
} from './recoveryTanks.js'

import {
  manageAICrewHealing,
  handleAICrewLossEvent
} from './crewHealing.js'

import {
  shouldRetreatLowHealth,
  handleRetreatToBase,
  shouldHarvesterSeekProtection,
  handleHarvesterRetreat,
  shouldStopRetreating,
  sendUnitToWorkshop
} from './retreatLogic.js'

import {
  shouldAIStartAttacking,
  shouldConductGroupAttack,
  assignAttackDirection,
  calculateApproachPosition,
  handleMultiDirectionalAttack,
  resetAttackDirections,
  getAttackDirectionStats,
  computeLeastDangerAttackPoint
} from './attackCoordination.js'

import {
  manageAITankerTrucks,
  manageAIAmmunitionTrucks,
  manageAIAmmunitionMonitoring
} from './logistics.js'

// Re-export all imported functions for backward compatibility
export {
  manageAIRecoveryTanks,
  manageAICrewHealing,
  handleAICrewLossEvent,
  shouldRetreatLowHealth,
  handleRetreatToBase,
  shouldHarvesterSeekProtection,
  handleHarvesterRetreat,
  shouldStopRetreating,
  shouldAIStartAttacking,
  shouldConductGroupAttack,
  assignAttackDirection,
  calculateApproachPosition,
  handleMultiDirectionalAttack,
  resetAttackDirections,
  getAttackDirectionStats,
  computeLeastDangerAttackPoint,
  manageAITankerTrucks,
  manageAIAmmunitionTrucks,
  manageAIAmmunitionMonitoring
}

// Configuration constants for AI behavior
const AI_REPAIR_COOLDOWN_SECONDS = 10
const AI_LOW_BUDGET_THRESHOLD = 3500
const AI_CRITICAL_BUILDINGS = new Set([
  'constructionYard',
  'powerPlant',
  'oreRefinery',
  'vehicleFactory',
  'vehicleWorkshop',
  'radarStation'
])

function hasPendingRepair(building, awaitingList, underRepairList) {
  if (!building) return true
  const awaiting = awaitingList?.some(entry => entry.building === building)
  if (awaiting) return true
  const repairing = underRepairList?.some(entry => entry.building === building)
  return !!repairing
}

function compareRepairPriority(a, b, lowBudget) {
  if (lowBudget) {
    const aCritical = AI_CRITICAL_BUILDINGS.has(a.type)
    const bCritical = AI_CRITICAL_BUILDINGS.has(b.type)
    if (aCritical !== bCritical) {
      return aCritical ? -1 : 1
    }
  }

  const aDamage = (a.maxHealth - a.health) / a.maxHealth
  const bDamage = (b.maxHealth - b.health) / b.maxHealth

  if (bDamage !== aDamage) {
    return bDamage - aDamage
  }

  return (a.health || 0) - (b.health || 0)
}

/**
 * Manages AI building repair prioritization and queueing
 */
export function manageAIRepairs(aiPlayerId, aiFactory, gameState, now) {
  if (!aiFactory || aiFactory.health <= 0) return
  if (!Array.isArray(gameState.buildings) || gameState.buildings.length === 0) return

  const aiBuildings = gameState.buildings.filter(building => (
    building &&
    building.owner === aiPlayerId &&
    building.health > 0 &&
    building.health < building.maxHealth &&
    building.type !== 'concreteWall'
  ))

  if (aiBuildings.length === 0) {
    return
  }

  if (!gameState.buildingsAwaitingRepair) {
    gameState.buildingsAwaitingRepair = []
  }
  if (!gameState.buildingsUnderRepair) {
    gameState.buildingsUnderRepair = []
  }

  const awaitingList = gameState.buildingsAwaitingRepair
  const underRepairList = gameState.buildingsUnderRepair
  const availableBudget = aiFactory.budget || 0
  const lowBudget = availableBudget < AI_LOW_BUDGET_THRESHOLD
  const hasCriticalDamage = aiBuildings.some(b => AI_CRITICAL_BUILDINGS.has(b.type))

  aiBuildings.sort((a, b) => compareRepairPriority(a, b, lowBudget))

  aiBuildings.forEach(building => {
    if (lowBudget && hasCriticalDamage && !AI_CRITICAL_BUILDINGS.has(building.type)) {
      return
    }

    if (hasPendingRepair(building, awaitingList, underRepairList)) {
      return
    }

    const healthToRepair = building.maxHealth - building.health
    if (healthToRepair <= 0) {
      return
    }

    const repairCost = calculateRepairCost(building)
    if (!repairCost || repairCost <= 0) {
      return
    }

    const lastAttackedTime = (typeof building.lastAttackedTime === 'number')
      ? building.lastAttackedTime
      : (now - AI_REPAIR_COOLDOWN_SECONDS * 1000)

    awaitingList.push({
      building,
      repairCost,
      healthToRepair,
      lastAttackedTime,
      isFactory: false,
      initiatedByAI: true
    })
  })
}

/**
 * Main strategy coordinator - applies all AI policies to a unit
 * This is the primary entry point that orchestrates all AI behaviors
 */
export function applyEnemyStrategies(unit, units, gameState, mapGrid, now) {
  // Skip if unit is dead
  if (!unit.health || unit.health <= 0) return

  // Ignore other strategies while heading to or being repaired at a workshop
  if (unit.returningToWorkshop || unit.repairingAtWorkshop) {
    return
  }

  // Handle retreating units
  if (unit.isRetreating) {
    if (shouldStopRetreating(unit, gameState)) {
      unit.isRetreating = false
      unit.retreatIssuedByPlayer = false
      unit.retreatTarget = null
      unit.path = []
      if (unit.needsWorkshopRepair && unit.health < unit.maxHealth) {
        sendUnitToWorkshop(unit, gameState, mapGrid)
        unit.needsWorkshopRepair = false
      }
    } else {
      // Continue retreating
      return
    }
  }

  // Check for low health - immediately send to workshop when possible
  if ((unit.type === 'tank' || unit.type === 'tank_v1' || unit.type === 'tank-v2' || unit.type === 'tank-v3' || unit.type === 'rocketTank' || unit.type === 'howitzer')) {
    if (shouldRetreatLowHealth(unit)) {
      const sent = sendUnitToWorkshop(unit, gameState, mapGrid)
      if (!sent) {
        handleRetreatToBase(unit, gameState, mapGrid)
      }
      return
    }
  }

  // Check for harvester protection
  if (unit.type === 'harvester') {
    if (shouldHarvesterSeekProtection(unit, units)) {
      handleHarvesterRetreat(unit, gameState, mapGrid)
      return
    }
  }

  // Apply group attack strategies for combat units
  if ((unit.type === 'tank' || unit.type === 'tank_v1' || unit.type === 'tank-v2' || unit.type === 'tank-v3' || unit.type === 'rocketTank' || unit.type === 'howitzer')) {
    // Only evaluate group-attack gating when the unit already has a target.
    // When target is null, shouldConductGroupAttack returns false which would
    // incorrectly clear allowedToAttack and prevent the unit from ever firing.
    if (unit.target) {
      const shouldAttack = shouldConductGroupAttack(unit, units, gameState, unit.target)
      unit.allowedToAttack = shouldAttack

      // Apply multi-directional attack coordination if allowed to attack
      if (shouldAttack) {
        handleMultiDirectionalAttack(unit, units, gameState, mapGrid, now)
      }
    }
  }
}
