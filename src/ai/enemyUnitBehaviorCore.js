import { AI_DECISION_INTERVAL, TILE_SIZE } from '../config.js'
import { getEffectiveFireRange } from '../game/unitCombat/combatHelpers.js'
import { applyEnemyStrategies } from './enemyStrategies.js'
import { isEnemyTo } from './enemyUtils.js'
import {
  canUnitHitTarget,
  syncAttackPermissionForCurrentTarget
} from './enemyUnitBehaviorShared.js'
import { updateNavalAIUnit } from './enemyNavalBehavior.js'
import {
  updateAmbulanceAI,
  updateHarvesterHunterTank
} from './enemySupportBehavior.js'
import { updateApacheAI } from './enemyAirBehavior.js'
import { updateGroundCombatDecision } from './enemyGroundCombatDecision.js'
import {
  maintainSafeAttackDistance,
  updateGroundDodge
} from './enemyGroundTactics.js'

const GROUND_COMBAT_TYPES = new Set([
  'tank',
  'tank_v1',
  'rocketTank',
  'tank-v2',
  'tank-v3',
  'howitzer'
])

export function updateAIUnitInternal(unit, units, gameState, mapGrid, now, aiPlayerId, _targetedOreTiles, bullets) {
  // Reset being attacked flag if enough time has passed since last damage
  if (unit.isBeingAttacked && unit.lastDamageTime && (now - unit.lastDamageTime > 5000)) {
    unit.isBeingAttacked = false
    unit.lastAttacker = null
  }
  if (unit.target && !canUnitHitTarget(unit, unit.target)) {
    unit.target = null
    unit.targetId = null
    unit.targetType = null
  }

  // Clear invalid attacker references
  if (unit.lastAttacker && (unit.lastAttacker.health <= 0 || unit.lastAttacker.destroyed)) {
    unit.lastAttacker = null
    if (!unit.lastDamageTime || (now - unit.lastDamageTime > 3000)) {
      unit.isBeingAttacked = false
    }
  }

  if (unit.isNaval) {
    updateNavalAIUnit(unit, units, gameState, mapGrid, now, aiPlayerId)
    return
  }

  // Skip decision making while returning to or repairing at a workshop
  if (unit.returningToWorkshop || unit.repairingAtWorkshop) {
    return
  }

  // LLM-locked units: still allow retaliation and auto-attack in range,
  // but skip all strategic AI decisions (movement, grouping, base defense, etc.)
  const isLlmLocked = unit.llmOrderLockUntil && now < unit.llmOrderLockUntil
  if (isLlmLocked) {
    // Ensure LLM-locked units are allowed to fire
    unit.allowedToAttack = true

    // Retaliate against attacker when being attacked
    if (unit.isBeingAttacked && unit.lastAttacker && unit.lastAttacker.health > 0) {
      const attacker = unit.lastAttacker
      const dx = attacker.x - unit.x
      const dy = attacker.y - unit.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const fireRange = getEffectiveFireRange(unit) * TILE_SIZE
      if (dist <= fireRange * 1.2 && canUnitHitTarget(unit, attacker)) {
        unit.target = attacker
        unit.targetId = attacker.id
        unit.targetType = 'unit'
      }
    }
    // Also auto-target any enemy in fire range if not already engaged
    if (!unit.target || (unit.target && unit.target.health <= 0)) {
      const fireRange = getEffectiveFireRange(unit) * TILE_SIZE
      // Search enemy units
      const nearestEnemy = units.find(enemy => {
        if (enemy.owner === unit.owner || enemy.health <= 0) return false
        if (!isEnemyTo(unit, enemy, gameState)) return false
        if (!canUnitHitTarget(unit, enemy)) return false
        const edx = enemy.x - unit.x
        const edy = enemy.y - unit.y
        return (edx * edx + edy * edy) <= fireRange * fireRange
      })
      if (nearestEnemy) {
        unit.target = nearestEnemy
        unit.targetId = nearestEnemy.id
        unit.targetType = 'unit'
      } else {
        // Search enemy buildings in fire range
        const allBuildings = gameState.buildings || []
        let nearestBuilding = null
        let nearestBldgDist = Infinity
        for (const bld of allBuildings) {
          if (bld.health <= 0) continue
          if (bld.owner === unit.owner) continue
          if (!isEnemyTo(bld, unit.owner)) continue
          const bldCX = (bld.x + (bld.width || 1) / 2) * TILE_SIZE
          const bldCY = (bld.y + (bld.height || 1) / 2) * TILE_SIZE
          const bdx = bldCX - (unit.x + TILE_SIZE / 2)
          const bdy = bldCY - (unit.y + TILE_SIZE / 2)
          const bldDist = Math.sqrt(bdx * bdx + bdy * bdy)
          if (bldDist <= fireRange && bldDist < nearestBldgDist) {
            nearestBldgDist = bldDist
            nearestBuilding = bld
          }
        }
        if (nearestBuilding) {
          unit.target = nearestBuilding
          unit.targetId = nearestBuilding.id
          unit.targetType = 'building'
        }
      }
    }
    return // Skip all other AI decisions
  }

  // Apply new AI strategies first - but only when allowed to make decisions to prevent wiggling
  const allowDecision = !unit.lastDecisionTime || (now - unit.lastDecisionTime >= AI_DECISION_INTERVAL)
  const justGotAttacked = unit.isBeingAttacked && unit.lastDamageTime && (now - unit.lastDamageTime < 1000)

  // Apply strategies on decision intervals OR when just got attacked (immediate response)
  if ((allowDecision || justGotAttacked) && !unit.harvesterHunter) {
    applyEnemyStrategies(unit, units, gameState, mapGrid, now)
  }

  syncAttackPermissionForCurrentTarget(unit, units, gameState)

  // Skip further processing if unit is retreating
  if (unit.isRetreating) return

  // PRIORITY: Check crew status and handle hospital returns (exclude ambulance for AI)
  if (unit.crew && typeof unit.crew === 'object' && unit.type !== 'ambulance') {
    const missingCrew = Object.values(unit.crew).filter(alive => !alive).length

    if (missingCrew > 0 && !unit.returningToHospital) {
      // Unit has missing crew - prioritize hospital return
      const canMove = unit.crew.driver && unit.crew.commander

      if (!canMove) {
        // Unit cannot move - wait for ambulance assistance
        unit.target = null
        unit.moveTarget = null
        unit.path = []
        // Allow defensive firing only
        if (unit.isBeingAttacked && unit.lastAttacker && unit.crew.gunner) {
          unit.target = unit.lastAttacker
        }
        return // Skip normal AI behavior
      } else {
        // Unit can move - should return to hospital immediately
        // This will be handled by manageAICrewHealing
        unit.needsHospital = true
        // Stop offensive behavior - only allow defensive firing
        unit.moveTarget = null
        unit.path = []
        if (unit.isBeingAttacked && unit.lastAttacker && unit.crew.gunner) {
          unit.target = unit.lastAttacker
        } else {
          unit.target = null
        }
        return // Skip normal AI behavior until crew is restored
      }
    }

    // If unit is returning to hospital, only allow defensive actions
    if (unit.returningToHospital) {
      // Allow firing back if being attacked and has gunner
      if (unit.isBeingAttacked && unit.lastAttacker && unit.crew.gunner) {
        unit.target = unit.lastAttacker
      } else {
        unit.target = null
      }

      // Check if reached hospital area for healing
      if (unit.hospitalTarget && unit.moveTarget) {
        const distanceToHospital = Math.hypot(
          unit.x - unit.moveTarget.x,
          unit.y - unit.moveTarget.y
        )

        if (distanceToHospital < TILE_SIZE * 2) {
          // Near hospital - check if crew is restored
          const currentMissingCrew = Object.values(unit.crew).filter(alive => !alive).length
          if (currentMissingCrew === 0) {
            // Crew fully restored - resume normal behavior
            unit.returningToHospital = false
            unit.hospitalTarget = null
            unit.needsHospital = false
            unit.moveTarget = null
            unit.path = []
          }
        }
      }

      return // Skip normal combat AI when returning to hospital
    }
  }

  // Handle ambulance behavior
  if (unit.type === 'ambulance') {
    updateAmbulanceAI(unit, units, gameState, mapGrid, now, aiPlayerId)
    return // Ambulances don't engage in combat
  }

  if (unit.harvesterHunter) {
    // Release from factory hold immediately
    if (unit.holdInFactory || unit.spawnedInFactory) {
      unit.holdInFactory = false
      unit.spawnedInFactory = false
    }
    updateHarvesterHunterTank(unit, units, gameState, mapGrid, now, aiPlayerId)
    return
  }

  if (unit.type === 'apache' || unit.type === 'f22Raptor' || unit.type === 'f35') {
    updateApacheAI(unit, units, gameState, mapGrid, now, aiPlayerId)
    return
  }


  if (GROUND_COMBAT_TYPES.has(unit.type)) {
    const handled = updateGroundCombatDecision(unit, units, gameState, mapGrid, now, aiPlayerId)
    if (handled) return
    updateGroundDodge(unit, bullets, mapGrid, gameState, now, aiPlayerId)
  }

  maintainSafeAttackDistance(unit, mapGrid, gameState, now)
}
