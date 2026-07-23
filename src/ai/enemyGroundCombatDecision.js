import {
  AI_DECISION_INTERVAL,
  ATTACK_PATH_CALC_INTERVAL,
  MOVING_TARGET_CHECK_INTERVAL,
  TARGET_MOVEMENT_THRESHOLD,
  TILE_SIZE
} from '../config.js'
import { getCachedPath } from '../game/pathfinding.js'
import {
  shouldAIStartAttacking,
  shouldConductGroupAttack,
  shouldRetreatLowHealth
} from './enemyStrategies.js'
import { isEnemyTo } from './enemyUtils.js'
import {
  canUnitHitTarget,
  findReachableAttackDestination
} from './enemyUnitBehaviorShared.js'
import {
  checkBaseDefenseNeeded,
  findBaseDefenseTarget
} from './enemySupportBehavior.js'

export function updateGroundCombatDecision(unit, units, gameState, mapGrid, now, aiPlayerId) {
  const allowDecision = !unit.lastDecisionTime || (now - unit.lastDecisionTime >= AI_DECISION_INTERVAL)

  // Target selection throttled - 5 second minimum between target changes
  // EXCEPT when unit gets attacked (immediate retaliation allowed)
  const justGotAttacked = unit.isBeingAttacked && unit.lastDamageTime && (now - unit.lastDamageTime < 1000)
  const canChangeTarget = justGotAttacked || !unit.lastTargetChangeTime || (now - unit.lastTargetChangeTime >= 5000)

  // Base defense: Check if our base is under attack and we should defend it
  const shouldDefendBase = checkBaseDefenseNeeded(unit, units, gameState, aiPlayerId)
  if (shouldDefendBase && (!unit.target || !justGotAttacked)) {
    const baseDefenseTarget = findBaseDefenseTarget(unit, units, gameState, aiPlayerId)
    if (baseDefenseTarget) {
      unit.target = baseDefenseTarget
      unit.lastTargetChangeTime = now
      unit.defendingBase = true

      // Store target position for movement tracking
      unit.lastTargetPosition = {
        x: unit.target.x + (unit.target.tileX !== undefined ? TILE_SIZE / 2 : 0),
        y: unit.target.y + (unit.target.tileX !== undefined ? TILE_SIZE / 2 : 0)
      }

      // Immediate path calculation for base defense
      let targetPos = null
      if (unit.target.tileX !== undefined) {
        targetPos = { x: unit.target.tileX, y: unit.target.tileY }
      } else {
        targetPos = { x: unit.target.x, y: unit.target.y }
      }

      if (targetPos && !unit.isDodging) {
        const occupancyMap = gameState.occupancyMap
        const path = getCachedPath(
          { x: unit.tileX, y: unit.tileY, owner: unit.owner },
          targetPos,
          mapGrid,
          occupancyMap,
          { unitOwner: unit.owner }
        )
        if (path.length > 1) {
          unit.path = path.slice(1)
          unit.lastPathCalcTime = now
        }
      }

      unit.lastDecisionTime = now
      return true // Skip other target selection when defending base
    }
  }

  if (allowDecision) {
    // Clear defending base flag if no longer needed
    if (unit.defendingBase && !checkBaseDefenseNeeded(unit, units, gameState, aiPlayerId)) {
      unit.defendingBase = false
    }

    if (canChangeTarget) {
      let newTarget = null

      // Check if current target is still valid and reasonably close before considering a new one
      let keepCurrentTarget = false
      if (unit.target && unit.target.health > 0) {
        let targetDistance = Infinity
        if (unit.target.tileX !== undefined) {
          // Target is a unit
          targetDistance = Math.hypot(
            (unit.target.x + TILE_SIZE / 2) - (unit.x + TILE_SIZE / 2),
            (unit.target.y + TILE_SIZE / 2) - (unit.y + TILE_SIZE / 2)
          )
        } else {
          // Target is a building
          const buildingCenterX = (unit.target.x + (unit.target.width || 1) / 2) * TILE_SIZE
          const buildingCenterY = (unit.target.y + (unit.target.height || 1) / 2) * TILE_SIZE
          targetDistance = Math.hypot(
            buildingCenterX - (unit.x + TILE_SIZE / 2),
            buildingCenterY - (unit.y + TILE_SIZE / 2)
          )
        }

        // Keep current target if it's within reasonable range (unless being attacked by someone else)
        const justGotAttacked = unit.isBeingAttacked && unit.lastDamageTime && (now - unit.lastDamageTime < 1000)
        // Increased range and added condition to prevent frequent target switching
        const isInCombatRange = targetDistance < 30 * TILE_SIZE // Increased from 25 to 30
        const targetStillValid = unit.target.health > 0
        const hasRecentPath = unit.path && unit.path.length > 0

        if (targetStillValid && isInCombatRange && !justGotAttacked && (hasRecentPath || targetDistance < 15 * TILE_SIZE)) {
          keepCurrentTarget = true
          newTarget = unit.target // Keep the current target
        }
      }

      if (!keepCurrentTarget) {
        // Only search for new targets if we don't have a valid current target

        // Check if unit should retreat due to low health (flee to base mode)
        const shouldFlee = shouldRetreatLowHealth(unit)

        // Highest priority: Retaliate against attacker when being attacked (unless fleeing)
        if (!shouldFlee && unit.isBeingAttacked && unit.lastAttacker &&
            unit.lastAttacker.health > 0 && isEnemyTo(unit.lastAttacker, aiPlayerId)) {

          let validTarget = false
          let attackerDist = Infinity

          // Handle unit attackers
          if (unit.lastAttacker.tileX !== undefined) {
            attackerDist = Math.hypot(
              (unit.lastAttacker.x + TILE_SIZE / 2) - (unit.x + TILE_SIZE / 2),
              (unit.lastAttacker.y + TILE_SIZE / 2) - (unit.y + TILE_SIZE / 2)
            )
            if (attackerDist < 15 * TILE_SIZE) { // Within reasonable retaliation range
              validTarget = true
            }
          }
          // Handle building attackers (like Tesla coils, turrets)
          else if (unit.lastAttacker.x !== undefined && unit.lastAttacker.y !== undefined) {
            const buildingCenterX = (unit.lastAttacker.x + (unit.lastAttacker.width || 1) / 2) * TILE_SIZE
            const buildingCenterY = (unit.lastAttacker.y + (unit.lastAttacker.height || 1) / 2) * TILE_SIZE
            attackerDist = Math.hypot(
              buildingCenterX - (unit.x + TILE_SIZE / 2),
              buildingCenterY - (unit.y + TILE_SIZE / 2)
            )
            if (attackerDist < 20 * TILE_SIZE) { // Longer range for buildings
              validTarget = true
            }
          }

          if (validTarget && canUnitHitTarget(unit, unit.lastAttacker)) {
            newTarget = unit.lastAttacker
          }
        }

        // Second priority: Defend harvesters under attack (if not retaliating)
        if (!newTarget) {
          const aiHarvesters = units.filter(u => u.owner === aiPlayerId && u.type === 'harvester')
          let harvesterUnderAttack = null
          for (const harvester of aiHarvesters) {
            const threateningEnemies = units.filter(u =>
              isEnemyTo(u, aiPlayerId) &&
              Math.hypot(u.x - harvester.x, u.y - harvester.y) < 5 * TILE_SIZE
            )
            if (threateningEnemies.length > 0) {
              harvesterUnderAttack = threateningEnemies[0] // Target closest threat to harvester
              break
            }
          }

          if (harvesterUnderAttack) {
            newTarget = harvesterUnderAttack
          }
        }

        // Third priority: Target player harvesters (key economic targets)
        if (!newTarget) {
          const playerHarvesters = units.filter(u =>
            isEnemyTo(u, aiPlayerId) &&
            u.type === 'harvester' &&
            u.health > 0
          )

          if (playerHarvesters.length > 0) {
            // Find closest player harvester
            let closestHarvester = null
            let closestDist = Infinity

            playerHarvesters.forEach(harvester => {
              const distance = Math.hypot(
                (harvester.x + TILE_SIZE / 2) - (unit.x + TILE_SIZE / 2),
                (harvester.y + TILE_SIZE / 2) - (unit.y + TILE_SIZE / 2)
              )
              if (distance < closestDist) {
                closestDist = distance
                closestHarvester = harvester
              }
            })

            // Target harvester if within reasonable range
            if (closestHarvester && closestDist < 20 * TILE_SIZE) {
              newTarget = closestHarvester
            }
          }
        }

        // Fourth priority: Group attack strategy (target player base and units)
        if (!newTarget) {
          // Check if AI should start attacking (has hospital built and player attacked first)
          const shouldAttack = shouldAIStartAttacking(aiPlayerId, gameState, units)
          if (!shouldAttack) {
            // AI not ready for major attacks - only defend and target harvesters
            const playerHarvesters = units.filter(u =>
              isEnemyTo(u, aiPlayerId) &&
                u.type === 'harvester' &&
                u.health > 0
            )

            if (playerHarvesters.length > 0) {
              // Target closest harvester only
              let closestHarvester = null
              let closestDist = Infinity

              playerHarvesters.forEach(harvester => {
                const d = Math.hypot(
                  (harvester.x + TILE_SIZE / 2) - (unit.x + TILE_SIZE / 2),
                  (harvester.y + TILE_SIZE / 2) - (unit.y + TILE_SIZE / 2)
                )
                if (d < closestDist) {
                  closestDist = d
                  closestHarvester = harvester
                }
              })

              if (closestHarvester && closestDist < 10 * TILE_SIZE) {
                newTarget = closestHarvester
              }
            }
          } else {
            // AI ready for major attacks - proceed with normal group attack logic
            // Check if we should conduct group attack before selecting targets
            const nearbyAllies = units.filter(u => u.owner === aiPlayerId && u !== unit &&
                (u.type === 'tank' || u.type === 'tank_v1' || u.type === 'tank-v2' || u.type === 'tank-v3' || u.type === 'rocketTank' || u.type === 'howitzer') &&
                Math.hypot(u.x - unit.x, u.y - unit.y) < 8 * TILE_SIZE)

            // Use group attack strategy with priority targeting
            if (nearbyAllies.length >= 1) { // Reduced from 2 to make AI more aggressive
              // Priority 1: Target closest player combat unit
              let closestPlayerUnit = null
              let closestPlayerDist = Infinity

              units.forEach(u => {
                if (isEnemyTo(u, aiPlayerId) && u.health > 0) {
                  if (!canUnitHitTarget(unit, u)) {
                    return
                  }

                  const d = Math.hypot((u.x + TILE_SIZE / 2) - (unit.x + TILE_SIZE / 2), (u.y + TILE_SIZE / 2) - (unit.y + TILE_SIZE / 2))
                  if (d < closestPlayerDist) {
                    closestPlayerDist = d
                    closestPlayerUnit = u
                  }
                }
              })

              // Priority 2: If no player units nearby, target player buildings (base attack)
              if (!closestPlayerUnit || closestPlayerDist > 15 * TILE_SIZE) {
                const playerBuildings = gameState.buildings.filter(b => isEnemyTo(b, aiPlayerId) && b.health > 0)
                if (playerBuildings.length > 0) {
                  // Prioritize important buildings: construction yard > vehicle factory > ore refinery > others
                  const priorityOrder = ['constructionYard', 'vehicleFactory', 'oreRefinery', 'powerPlant', 'radarStation']
                  let targetBuilding = null

                  for (const buildingType of priorityOrder) {
                    const building = playerBuildings.find(b => b.type === buildingType)
                    if (building) {
                      targetBuilding = building
                      break
                    }
                  }

                  // If no priority buildings, target any building
                  if (!targetBuilding) {
                    targetBuilding = playerBuildings[0]
                  }

                  if (targetBuilding) {
                    newTarget = targetBuilding
                  }
                }
              } else {
                newTarget = closestPlayerUnit
              }

              // Only attack if group is large enough for heavily defended targets
              if (newTarget && shouldConductGroupAttack(unit, units, gameState, newTarget)) {
                // Keep the target
              } else if (nearbyAllies.length >= 2) {
                // With 3+ units, attack anyway
                // Keep the target
              } else {
                // Single unit or pair - only attack if very close or harvester
                if (newTarget && (newTarget.type === 'harvester' ||
                  Math.hypot((newTarget.x + TILE_SIZE / 2) - (unit.x + TILE_SIZE / 2),
                    (newTarget.y + TILE_SIZE / 2) - (unit.y + TILE_SIZE / 2)) < 8 * TILE_SIZE)) {
                  // Keep the target
                } else {
                  newTarget = null
                }
              }
            } else {
              // Solo unit behavior - be more cautious, focus on harvesters and weak targets
              const soloTargets = units.filter(u => {
                if (!isEnemyTo(u, aiPlayerId) || u.health <= 0) {
                  return false
                }

                if (!canUnitHitTarget(unit, u)) {
                  return false
                }

                return u.type === 'harvester' || u.health <= 50 // Target harvesters or damaged units
              })

              if (soloTargets.length > 0) {
                let closestTarget = null
                let closestDist = Infinity
                soloTargets.forEach(target => {
                  const d = Math.hypot((target.x + TILE_SIZE / 2) - (unit.x + TILE_SIZE / 2), (target.y + TILE_SIZE / 2) - (unit.y + TILE_SIZE / 2))
                  if (d < closestDist) {
                    closestDist = d
                    closestTarget = target
                  }
                })
                // Only engage if very close
                newTarget = (closestTarget && closestDist < 6 * TILE_SIZE) ? closestTarget : null
              }
            }
          }
        } // Close the else block for shouldAttack check
      } // End of if (!keepCurrentTarget) block

      if (unit.target !== newTarget) {
        unit.target = newTarget
        unit.lastTargetChangeTime = now
        let targetPos = null
        if (unit.target && unit.target.tileX !== undefined) {
          targetPos = { x: unit.target.tileX, y: unit.target.tileY }
        } else if (unit.target) {
          targetPos = { x: unit.target.x, y: unit.target.y }
        }
        unit.moveTarget = targetPos

        // Store target position for movement tracking
        if (unit.target) {
          unit.lastTargetPosition = {
            x: unit.target.x + (unit.target.tileX !== undefined ? TILE_SIZE / 2 : 0),
            y: unit.target.y + (unit.target.tileX !== undefined ? TILE_SIZE / 2 : 0)
          }
        }

        if (!unit.isDodging && targetPos) {
          // Use occupancy map in attack mode to prevent moving through occupied tiles
          const occupancyMap = gameState.occupancyMap
          const attackPath = findReachableAttackDestination(unit, unit.target, mapGrid, occupancyMap)
          if (attackPath?.path?.length > 1) {
            unit.moveTarget = attackPath.destination
            unit.path = attackPath.path.slice(1)
            unit.lastPathCalcTime = now
          }
        }
      }
    } else {
      // If we can't change targets but don't have a target, keep existing logic for path recalculation
      // This ensures units don't get stuck when they can't change targets but need to continue moving
      if (!unit.target) {
        // Only set a new target if we don't have one at all
        const existingTargets = units.filter(u =>
          isEnemyTo(u, aiPlayerId) &&
            u.health > 0 &&
            canUnitHitTarget(unit, u) &&
            Math.hypot((u.x + TILE_SIZE / 2) - (unit.x + TILE_SIZE / 2), (u.y + TILE_SIZE / 2) - (unit.y + TILE_SIZE / 2)) < 10 * TILE_SIZE
        )
        if (existingTargets.length > 0) {
          unit.target = existingTargets[0]
          unit.lastTargetChangeTime = now
        }
      }
    }

    // Smart path recalculation: only recalculate if target moved or distance is increasing
    if (!unit.isDodging && unit.target) {
      let targetTileX, targetTileY
      if (unit.target.tileX !== undefined) {
        targetTileX = unit.target.tileX
        targetTileY = unit.target.tileY
      } else {
        targetTileX = unit.target.x
        targetTileY = unit.target.y
      }

      // Calculate current distance to target
      const distToTarget = Math.hypot(targetTileX - unit.tileX, targetTileY - unit.tileY)
      const hasValidPath = unit.path && unit.path.length >= 1
      const needsInitialPath = !hasValidPath

      // Check if target has moved significantly from last known position
      const lastTargetPos = unit.lastKnownTargetPos
      const targetHasMoved = !lastTargetPos ||
          Math.abs(targetTileX - lastTargetPos.x) > TARGET_MOVEMENT_THRESHOLD ||
          Math.abs(targetTileY - lastTargetPos.y) > TARGET_MOVEMENT_THRESHOLD

      // Track distance trend for observability, but don't use it to trigger
      // aggressive reroutes. Distance oscillation on clear paths can produce
      // unnecessary route churn and non-optimal deviations.
      const checkIntervalPassed = !unit.lastDistanceCheckTime || (now - unit.lastDistanceCheckTime > MOVING_TARGET_CHECK_INTERVAL)
      if (checkIntervalPassed) {
        unit.lastDistanceCheckTime = now
        unit.lastDistanceToTarget = distToTarget
      }

      // Throttle path recalculation
      const pathRecalcNeeded = !unit.lastPathCalcTime || (now - unit.lastPathCalcTime > ATTACK_PATH_CALC_INTERVAL)

      // Only recalculate if:
      // 1. We need an initial path
      // 2. Target has moved significantly AND throttle interval passed
      // 3. Target has actually moved to a new tile after throttle interval
      const shouldRecalculatePath = needsInitialPath || (pathRecalcNeeded && targetHasMoved)

      if (shouldRecalculatePath) {
        // Store target position for movement tracking
        unit.lastKnownTargetPos = { x: targetTileX, y: targetTileY }
        unit.lastDistanceToTarget = distToTarget

        // Use occupancy map in attack mode to prevent moving through occupied tiles
        const occupancyMap = gameState.occupancyMap
        const attackPath = findReachableAttackDestination(unit, unit.target, mapGrid, occupancyMap)
        if (attackPath?.path?.length > 1) {
          unit.moveTarget = attackPath.destination
          unit.path = attackPath.path.slice(1)
          unit.lastPathCalcTime = now
        }
      } else if (hasValidPath) {
        // Update distance tracking even if we don't recalculate
        // This ensures we keep tracking progress along current path
        if (!unit.lastDistanceToTarget || distToTarget < unit.lastDistanceToTarget) {
          unit.lastDistanceToTarget = distToTarget
        }
      }
    }

    unit.lastDecisionTime = now
  }
  return false
}
