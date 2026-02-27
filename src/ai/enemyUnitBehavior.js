import { TILE_SIZE, TANK_FIRE_RANGE, ATTACK_PATH_CALC_INTERVAL, AI_DECISION_INTERVAL, MOVING_TARGET_CHECK_INTERVAL, TARGET_MOVEMENT_THRESHOLD } from '../config.js'
import { getCachedPath } from '../game/pathfinding.js'
import { applyEnemyStrategies, shouldConductGroupAttack, shouldRetreatLowHealth, shouldAIStartAttacking } from './enemyStrategies.js'
import { isEnemyTo } from './enemyUtils.js'
import { buildingData } from '../buildings.js'
import { gameRandom } from '../utils/gameRandom.js'
import { getEffectiveFireRange } from '../game/unitCombat/combatHelpers.js'

function isAirborneAirUnit(target) {
  if (!target) return false
  const isAirUnitType = target.type === 'apache' || target.type === 'f22Raptor'
  return isAirUnitType && target.flightState !== 'grounded'
}

function canUnitHitTarget(shooter, target) {
  if (!shooter || !target) return false
  if (!isAirborneAirUnit(target)) return true
  return shooter.type === 'rocketTank' || shooter.type === 'apache' || shooter.type === 'f22Raptor'
}

const ENABLE_DODGING = false
const lastPositionCheckTimeDelay = 3000
const dodgeTimeDelay = 3000
const useSafeAttackDistance = false
const _HARVESTER_REMOTE_DISTANCE = 8 * TILE_SIZE // Harvesters 8+ tiles from base are considered remote
const PLAYER_DEFENSE_RADIUS = 10 * TILE_SIZE
const PLAYER_DEFENSE_BUILDINGS = new Set([
  'turretGunV1',
  'turretGunV2',
  'turretGunV3',
  'rocketTurret',
  'teslaCoil',
  'artilleryTurret'
])
const AIR_DEFENSE_TYPES = new Set(['rocketTank'])
const AIR_DEFENSE_BUILDINGS = new Set(['rocketTurret'])
const HARVESTER_HUNTER_PATH_REFRESH = 2000
const ROCKET_TURRET_RANGE = (buildingData.rocketTurret?.fireRange || 16) * TILE_SIZE
const AIR_DEFENSE_RADIUS = TANK_FIRE_RANGE * TILE_SIZE * 1.2

function updateAIUnit(unit, units, gameState, mapGrid, now, aiPlayerId, _targetedOreTiles, bullets) {
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
        const humanPlayer = gameState.humanPlayer || 'player1'
        let nearestBuilding = null
        let nearestBldgDist = Infinity
        for (const bld of allBuildings) {
          if (bld.health <= 0) continue
          if (bld.owner === unit.owner) continue
          if (bld.owner !== humanPlayer && bld.owner !== 'player') continue
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
        // For now, just mark it as needing hospital
        unit.needsHospital = true
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

  if (unit.type === 'apache') {
    updateApacheAI(unit, units, gameState, mapGrid, now, aiPlayerId)
    return
  }

  // Combat unit behavior
  if (unit.type === 'tank' || unit.type === 'tank_v1' || unit.type === 'rocketTank' || unit.type === 'tank-v2' || unit.type === 'tank-v3' || unit.type === 'howitzer') {
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
        return // Skip other target selection when defending base
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
              u.owner === gameState.humanPlayer &&
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
                u.owner === gameState.humanPlayer &&
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
                  if (u.owner === gameState.humanPlayer && u.health > 0) {
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
                  const playerBuildings = gameState.buildings.filter(b => b.owner === gameState.humanPlayer && b.health > 0)
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
                  if (u.owner !== gameState.humanPlayer || u.health <= 0) {
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
        }
      } else {
        // If we can't change targets but don't have a target, keep existing logic for path recalculation
        // This ensures units don't get stuck when they can't change targets but need to continue moving
        if (!unit.target) {
          // Only set a new target if we don't have one at all
          const existingTargets = units.filter(u =>
            u.owner === gameState.humanPlayer &&
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
        let targetPos = null
        let targetTileX, targetTileY
        if (unit.target.tileX !== undefined) {
          targetTileX = unit.target.tileX
          targetTileY = unit.target.tileY
          targetPos = { x: targetTileX, y: targetTileY }
        } else {
          targetTileX = unit.target.x
          targetTileY = unit.target.y
          targetPos = { x: targetTileX, y: targetTileY }
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

        // Check if we should recalculate based on distance trend (for moving targets)
        let shouldRecalcForDistance = false
        const checkIntervalPassed = !unit.lastDistanceCheckTime || (now - unit.lastDistanceCheckTime > MOVING_TARGET_CHECK_INTERVAL)

        if (checkIntervalPassed) {
          unit.lastDistanceCheckTime = now
          const lastDistance = unit.lastDistanceToTarget
          // Only recalculate if distance is increasing (unit going wrong direction)
          if (lastDistance !== null && lastDistance !== undefined && distToTarget > lastDistance && hasValidPath) {
            shouldRecalcForDistance = true
          }
          unit.lastDistanceToTarget = distToTarget
        }

        // Throttle path recalculation
        const pathRecalcNeeded = !unit.lastPathCalcTime || (now - unit.lastPathCalcTime > ATTACK_PATH_CALC_INTERVAL)

        // Only recalculate if:
        // 1. We need an initial path
        // 2. Target has moved significantly AND throttle interval passed
        // 3. We're getting farther from target AND interval passed
        const shouldRecalculatePath = needsInitialPath || (pathRecalcNeeded && (targetHasMoved || shouldRecalcForDistance))

        if (shouldRecalculatePath) {
          // Store target position for movement tracking
          unit.lastKnownTargetPos = { x: targetTileX, y: targetTileY }
          unit.lastDistanceToTarget = distToTarget

          // Use occupancy map in attack mode to prevent moving through occupied tiles
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

    // --- Dodge Logic: toggled by ENABLE_DODGING ---
    if (ENABLE_DODGING) {
      let underFire = false
      bullets.forEach(bullet => {
        if (bullet.shooter && isEnemyTo(bullet.shooter, aiPlayerId)) {
          const d = Math.hypot(bullet.x - (unit.x + TILE_SIZE / 2), bullet.y - (unit.y + TILE_SIZE / 2))
          if (d < 2 * TILE_SIZE) {
            underFire = true
          }
        }
      })

      if (underFire) {
        if (!unit.lastDodgeTime || now - unit.lastDodgeTime > dodgeTimeDelay) {
          unit.lastDodgeTime = now
          const dodgeDir = { x: 0, y: 0 }
          bullets.forEach(bullet => {
            if (bullet.shooter && isEnemyTo(bullet.shooter, aiPlayerId)) {
              const dx = (unit.x + TILE_SIZE / 2) - bullet.x
              const dy = (unit.y + TILE_SIZE / 2) - bullet.y
              const mag = Math.hypot(dx, dy)
              if (mag > 0) {
                dodgeDir.x += dx / mag
                dodgeDir.y += dy / mag
              }
            }
          })
          const mag = Math.hypot(dodgeDir.x, dodgeDir.y)
          if (mag > 0) {
            dodgeDir.x /= mag
            dodgeDir.y /= mag
            const dodgeDistance = 1 + Math.floor(gameRandom() * 2)
            const destTileX = Math.floor(unit.tileX + Math.round(dodgeDir.x * dodgeDistance))
            const destTileY = Math.floor(unit.tileY + Math.round(dodgeDir.y * dodgeDistance))
            if (destTileX >= 0 && destTileX < mapGrid[0].length &&
                  destTileY >= 0 && destTileY < mapGrid.length) {
              const tileType = mapGrid[destTileY][destTileX].type
              const hasBuilding = mapGrid[destTileY][destTileX].building
              if (tileType !== 'water' && tileType !== 'rock' && !hasBuilding) {
                if (!unit.originalPath) {
                  unit.originalPath = unit.path ? [...unit.path] : []
                  unit.originalTarget = unit.target
                  unit.dodgeEndTime = now + dodgeTimeDelay
                }
                const newPath = getCachedPath(
                  { x: unit.tileX, y: unit.tileY, owner: unit.owner },
                  { x: destTileX, y: destTileY },
                  mapGrid,
                  gameState.occupancyMap,
                  { unitOwner: unit.owner }
                )
                if (newPath.length > 1) {
                  unit.isDodging = true
                  unit.path = newPath.slice(1)
                  unit.lastPathCalcTime = now
                }
              }
            }
          }
        }
      }
    }

    // Resume original path after dodging
    if (unit.isDodging && unit.originalPath) {
      if (unit.path.length === 0 || now > unit.dodgeEndTime) {
        unit.path = unit.originalPath
        unit.target = unit.originalTarget
        unit.originalPath = null
        unit.originalTarget = null
        unit.isDodging = false
        unit.dodgeEndTime = null
        unit.lastPathCalcTime = now
      }
    }
  }
  // NOTE: Harvester behavior is now handled by the unified harvesterLogic.js module
  // AI harvesters use the same logic as player harvesters for consistent behavior

  // Maintain safe attack distance for combat units
  if (useSafeAttackDistance) {
    if ((unit.type === 'tank' || unit.type === 'rocketTank' || unit.type === 'howitzer') && unit.target) {
      const positionCheckNeeded = !unit.lastPositionCheckTime || (now - unit.lastPositionCheckTime > lastPositionCheckTimeDelay)
      if (positionCheckNeeded) {
        unit.lastPositionCheckTime = now
        const unitCenterX = unit.x + TILE_SIZE / 2
        const unitCenterY = unit.y + TILE_SIZE / 2
        let targetCenterX, targetCenterY
        if (unit.target.tileX !== undefined) {
          targetCenterX = unit.target.x + TILE_SIZE / 2
          targetCenterY = unit.target.y + TILE_SIZE / 2
        } else {
          targetCenterX = unit.target.x * TILE_SIZE + (unit.target.width * TILE_SIZE) / 2
          targetCenterY = unit.target.y * TILE_SIZE + (unit.target.height * TILE_SIZE) / 2
        }
        const dx = targetCenterX - unitCenterX
        const dy = targetCenterY - unitCenterY
        const currentDist = Math.hypot(dx, dy)
        const explosionSafetyBuffer = TILE_SIZE * 0.5
        const safeAttackDistance = Math.max(
          TANK_FIRE_RANGE * TILE_SIZE,
          TILE_SIZE * 2 + explosionSafetyBuffer
        )
        if (currentDist < safeAttackDistance && !unit.isDodging) {
          const destTileX = Math.floor(unit.tileX - Math.round((dx / currentDist) * 2))
          const destTileY = Math.floor(unit.tileY - Math.round((dy / currentDist) * 2))
          if (destTileX >= 0 && destTileX < mapGrid[0].length &&
                destTileY >= 0 && destTileY < mapGrid.length) {
            const tileType = mapGrid[destTileY][destTileX].type
            const hasBuilding = mapGrid[destTileY][destTileX].building
            if (tileType !== 'water' && tileType !== 'rock' && !hasBuilding) {
              // Use occupancy map for tactical retreat movement to avoid moving through units
              const occupancyMap = gameState.occupancyMap
              const newPath = getCachedPath(
                { x: unit.tileX, y: unit.tileY, owner: unit.owner },
                { x: destTileX, y: destTileY },
                mapGrid,
                occupancyMap,
                { unitOwner: unit.owner }
              )
              if (newPath.length > 1) {
                unit.path = newPath.slice(1)
                unit.lastPathCalcTime = now
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Checks if the AI base is under attack and units should defend it
 */
function checkBaseDefenseNeeded(unit, units, gameState, aiPlayerId) {
  const aiBuildings = gameState.buildings.filter(b => b.owner === aiPlayerId && b.health > 0)
  if (aiBuildings.length === 0) return false

  // Check if any player units are near our base
  const playerUnitsNearBase = units.filter(u => {
    if (u.owner !== gameState.humanPlayer || u.health <= 0) return false

    return aiBuildings.some(building => {
      const buildingCenterX = (building.x + building.width / 2) * TILE_SIZE
      const buildingCenterY = (building.y + building.height / 2) * TILE_SIZE
      const distance = Math.hypot(
        (u.x + TILE_SIZE / 2) - buildingCenterX,
        (u.y + TILE_SIZE / 2) - buildingCenterY
      )
      return distance < 12 * TILE_SIZE // Within 12 tiles of our base
    })
  })

  // Check if we're already sending enough defenders
  const currentDefenders = units.filter(u =>
    u.owner === aiPlayerId &&
    u.health > 0 &&
    u.defendingBase &&
    (u.type === 'tank' || u.type === 'tank_v1' || u.type === 'tank-v2' || u.type === 'tank-v3' || u.type === 'rocketTank' || u.type === 'howitzer')
  )

  // Need defense if player units near base and we don't have enough defenders
  const needsDefense = playerUnitsNearBase.length > 0 && currentDefenders.length < Math.min(playerUnitsNearBase.length * 2, 6)

  // Only nearby units should defend (within reasonable distance)
  if (needsDefense) {
    const distanceToBase = Math.min(...aiBuildings.map(building => {
      const buildingCenterX = (building.x + building.width / 2) * TILE_SIZE
      const buildingCenterY = (building.y + building.height / 2) * TILE_SIZE
      return Math.hypot(
        (unit.x + TILE_SIZE / 2) - buildingCenterX,
        (unit.y + TILE_SIZE / 2) - buildingCenterY
      )
    }))

    return distanceToBase < 20 * TILE_SIZE // Only units within 20 tiles should defend
  }

  return false
}

/**
 * Finds the best target for base defense
 */
function findBaseDefenseTarget(unit, units, gameState, aiPlayerId) {
  const aiBuildings = gameState.buildings.filter(b => b.owner === aiPlayerId && b.health > 0)
  if (aiBuildings.length === 0) return null

  // Find player units threatening our base
  const threats = units.filter(u => {
    if (u.owner !== gameState.humanPlayer || u.health <= 0) return false

    return aiBuildings.some(building => {
      const buildingCenterX = (building.x + building.width / 2) * TILE_SIZE
      const buildingCenterY = (building.y + building.height / 2) * TILE_SIZE
      const distance = Math.hypot(
        (u.x + TILE_SIZE / 2) - buildingCenterX,
        (u.y + TILE_SIZE / 2) - buildingCenterY
      )
      return distance < 12 * TILE_SIZE
    })
  })

  if (threats.length === 0) return null

  // Find closest threat to our unit
  let closestThreat = null
  let closestDistance = Infinity

  threats.forEach(threat => {
    const distance = Math.hypot(
      (threat.x + TILE_SIZE / 2) - (unit.x + TILE_SIZE / 2),
      (threat.y + TILE_SIZE / 2) - (unit.y + TILE_SIZE / 2)
    )

    if (distance < closestDistance) {
      closestDistance = distance
      closestThreat = threat
    }
  })

  return closestThreat
}

// Handle ambulance AI behavior
function updateAmbulanceAI(unit, units, gameState, mapGrid, now, aiPlayerId) {
  // Skip if ambulance is on critical healing mission (should have priority)
  if (unit.criticalHealing) return

  // Skip if already refilling or healing
  if (unit.refillingTarget || unit.healingTarget) return

  // Check if ambulance needs refilling
  if (unit.crew < 4) {
    const hospitals = gameState.buildings?.filter(b =>
      b.type === 'hospital' &&
      b.owner === aiPlayerId &&
      b.health > 0
    )

    if (hospitals.length > 0 && !unit.refillingTarget) {
      // Send to hospital for refilling
      unit.refillingTarget = hospitals[0]
      const hospitalCenterX = hospitals[0].x + Math.floor(hospitals[0].width / 2)
      const refillY = hospitals[0].y + hospitals[0].height + 1

      const startNode = { x: unit.tileX, y: unit.tileY, owner: unit.owner }
      const targetTile = { x: hospitalCenterX, y: refillY }
      const path = getCachedPath(startNode, targetTile, mapGrid, gameState.occupancyMap, { unitOwner: unit.owner })
      if (path && path.length > 0) {
        unit.path = path
        unit.moveTarget = { x: hospitalCenterX * TILE_SIZE, y: refillY * TILE_SIZE }
      }
    }
    return
  }

  // Look for nearby units that need healing
  const unitsNeedingHealing = units.filter(u =>
    u.owner === aiPlayerId &&
    u !== unit &&
    u.crew &&
    typeof u.crew === 'object' &&
    Object.values(u.crew).some(alive => !alive) &&
    Math.hypot(u.x - unit.x, u.y - unit.y) < 15 * TILE_SIZE
  )

  if (unitsNeedingHealing.length > 0) {
    // Prioritize units that cannot move (excluding ambulance which doesn't use the crew system)
    const immobileUnits = unitsNeedingHealing.filter(u =>
      u.crew && u.type !== 'ambulance' && (!u.crew.driver || !u.crew.commander)
    )
    const targetUnit = immobileUnits.length > 0 ? immobileUnits[0] : unitsNeedingHealing[0]

    unit.healingTarget = targetUnit
    unit.healingTimer = 0
    unit.target = null
    unit.moveTarget = null
    unit.path = []
  }
}

function updateHarvesterHunterTank(unit, units, gameState, mapGrid, now, aiPlayerId) {
  unit.defendingBase = false

  const playerBaseCenter = findPlayerBaseCenter(gameState)
  const remoteHarvesters = findRemotePlayerHarvesters(units, gameState, playerBaseCenter)

  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2
  // SELF-DEFENSE: If being attacked by enemy tanks, prioritize fighting back
  // Check for nearby enemy tanks that might be attacking us
  const nearbyEnemyTanks = units.filter(u => {
    if (u.owner === unit.owner || u.type === 'harvester' || u.health <= 0) return false

    const dist = Math.hypot(
      (u.x + TILE_SIZE / 2) - unitCenterX,
      (u.y + TILE_SIZE / 2) - unitCenterY
    )

    // Consider tanks within fire range as threats
    return dist <= TANK_FIRE_RANGE * TILE_SIZE * 1.5
  })

  // If there are enemy tanks nearby, fight them instead of pursuing harvesters
  if (nearbyEnemyTanks.length > 0) {
    // Target the closest enemy tank
    nearbyEnemyTanks.sort((a, b) => {
      const aDist = Math.hypot((a.x + TILE_SIZE / 2) - unitCenterX, (a.y + TILE_SIZE / 2) - unitCenterY)
      const bDist = Math.hypot((b.x + TILE_SIZE / 2) - unitCenterX, (b.y + TILE_SIZE / 2) - unitCenterY)
      return aDist - bDist
    })

    const threatTank = nearbyEnemyTanks[0]
    unit.target = threatTank
    unit.allowedToAttack = true

    // Stop moving and engage in combat
    unit.path = []
    unit.moveTarget = null
    unit.lastDecisionTime = now
    return
  }

  const nearDefense = isNearPlayerDefense(unitCenterX, unitCenterY, gameState)

  if (!nearDefense) {
    unit.retreatingFromDefense = false
    unit.harvesterHunterRetreatTarget = null
    if (!unit.lastSafeTile || unit.lastSafeTile.x !== unit.tileX || unit.lastSafeTile.y !== unit.tileY) {
      unit.lastSafeTile = { x: unit.tileX, y: unit.tileY }
    }
  }

  if (nearDefense) {
    // Calculate retreat position: move away from nearest defense to just outside its range
    const nearestDefense = findNearestPlayerDefense(unitCenterX, unitCenterY, gameState)
    let retreatTile = null

    if (nearestDefense) {
      // Calculate direction away from the defense
      const dx = unitCenterX - nearestDefense.centerX
      const dy = unitCenterY - nearestDefense.centerY
      const distance = Math.hypot(dx, dy)

      if (distance > 0) {
        // Normalize direction and move to safe distance (defense radius + 3 tiles buffer)
        const safeDistance = (PLAYER_DEFENSE_RADIUS + 3 * TILE_SIZE) / TILE_SIZE
        const retreatX = Math.floor(nearestDefense.centerX / TILE_SIZE + (dx / distance) * safeDistance)
        const retreatY = Math.floor(nearestDefense.centerY / TILE_SIZE + (dy / distance) * safeDistance)

        // Clamp to map bounds
        retreatTile = {
          x: Math.max(0, Math.min(mapGrid[0].length - 1, retreatX)),
          y: Math.max(0, Math.min(mapGrid.length - 1, retreatY))
        }
      }
    }

    // Fallback to last safe tile if calculation failed
    if (!retreatTile) {
      retreatTile = unit.lastSafeTile || findNearestAIBuildingTile(unit, gameState, aiPlayerId)
    }

    if (retreatTile) {
      if (
        !unit.harvesterHunterRetreatTarget ||
        unit.harvesterHunterRetreatTarget.x !== retreatTile.x ||
        unit.harvesterHunterRetreatTarget.y !== retreatTile.y ||
        !unit.path ||
        unit.path.length === 0 ||
        (unit.lastPathCalcTime && now - unit.lastPathCalcTime > HARVESTER_HUNTER_PATH_REFRESH)
      ) {
        const path = getCachedPath(
          { x: unit.tileX, y: unit.tileY, owner: unit.owner },
          retreatTile,
          mapGrid,
          gameState.occupancyMap,
          { unitOwner: unit.owner }
        )
        unit.path = path.length > 1 ? path.slice(1) : []
        unit.lastPathCalcTime = now
      }
      unit.harvesterHunterRetreatTarget = retreatTile
      unit.moveTarget = {
        x: (retreatTile.x + 0.5) * TILE_SIZE,
        y: (retreatTile.y + 0.5) * TILE_SIZE
      }
    } else {
      unit.path = []
      unit.moveTarget = null
    }

    unit.target = null
    unit.retreatingFromDefense = true
    unit.harvesterHunterPathTarget = null
    unit.lastDecisionTime = now
    return
  }

  if (unit.retreatingFromDefense && unit.harvesterHunterRetreatTarget) {
    const retreatTarget = unit.harvesterHunterRetreatTarget
    const distanceToRetreatTarget = Math.hypot(
      (retreatTarget.x + 0.5) * TILE_SIZE - unitCenterX,
      (retreatTarget.y + 0.5) * TILE_SIZE - unitCenterY
    )

    // Reached retreat position (within 1.5 tiles)
    if (distanceToRetreatTarget < 1.5 * TILE_SIZE) {
      unit.retreatingFromDefense = false
      unit.harvesterHunterRetreatTarget = null
      unit.path = [] // Stop moving
      unit.moveTarget = null

      // Update last safe tile to current position
      unit.lastSafeTile = { x: unit.tileX, y: unit.tileY }
    }

    // While retreating, still check for harvesters in range and attack them
    if (remoteHarvesters.length > 0) {
      // Find closest harvester within attack range
      const harvesterInRange = remoteHarvesters.find(h => {
        const dist = Math.hypot(
          (h.x + TILE_SIZE / 2) - unitCenterX,
          (h.y + TILE_SIZE / 2) - unitCenterY
        )
        return dist <= TANK_FIRE_RANGE * TILE_SIZE
      })

      if (harvesterInRange) {
        // Stop retreating and engage the harvester
        unit.target = harvesterInRange
        unit.allowedToAttack = true
        unit.retreatingFromDefense = false
        unit.harvesterHunterRetreatTarget = null
        unit.path = []
        unit.moveTarget = null
        unit.lastDecisionTime = now
        return
      }
    }

    // Continue retreating
    return
  }

  if (remoteHarvesters.length > 0) {
    // Sort by distance to find closest harvester
    remoteHarvesters.sort((a, b) => {
      const aDist = Math.hypot(
        (a.x + TILE_SIZE / 2) - unitCenterX,
        (a.y + TILE_SIZE / 2) - unitCenterY
      )
      const bDist = Math.hypot(
        (b.x + TILE_SIZE / 2) - unitCenterX,
        (b.y + TILE_SIZE / 2) - unitCenterY
      )
      return aDist - bDist
    })

    const targetHarvester = remoteHarvesters[0]
    const _distanceToHarvester = Math.hypot(
      (targetHarvester.x + TILE_SIZE / 2) - unitCenterX,
      (targetHarvester.y + TILE_SIZE / 2) - unitCenterY
    )

    // Set as target for shooting
    if (!unit.target || unit.target.id !== targetHarvester.id) {
      unit.target = targetHarvester
      unit.lastTargetChangeTime = now
    }

    // Enable attacking so the combat system allows firing
    unit.allowedToAttack = true

    // Always pursue remote harvesters - move to intercept them
    const desiredTile = { x: targetHarvester.tileX, y: targetHarvester.tileY }
    if (
      !unit.harvesterHunterPathTarget ||
      unit.harvesterHunterPathTarget.x !== desiredTile.x ||
      unit.harvesterHunterPathTarget.y !== desiredTile.y ||
      !unit.path ||
      unit.path.length === 0 ||
      (unit.lastPathCalcTime && now - unit.lastPathCalcTime > HARVESTER_HUNTER_PATH_REFRESH)
    ) {
      const path = getCachedPath(
        { x: unit.tileX, y: unit.tileY, owner: unit.owner },
        desiredTile,
        mapGrid,
        gameState.occupancyMap,
        { unitOwner: unit.owner }
      )
      unit.path = path.length > 1 ? path.slice(1) : []
      unit.lastPathCalcTime = now
      unit.harvesterHunterPathTarget = desiredTile
    }

    unit.moveTarget = {
      x: targetHarvester.x + TILE_SIZE / 2,
      y: targetHarvester.y + TILE_SIZE / 2
    }

    unit.harvesterHunterRetreatTarget = null
    unit.lastDecisionTime = now
    return
  }

  // No remote harvesters found and not retreating - hold position at last safe tile
  unit.target = null
  unit.harvesterHunterPathTarget = null

  // If we don't have a last safe tile yet, or we're too far from it, move there
  if (!unit.lastSafeTile) {
    unit.lastSafeTile = { x: unit.tileX, y: unit.tileY }
  }

  const distanceToSafeTile = Math.hypot(
    (unit.lastSafeTile.x + 0.5) * TILE_SIZE - unitCenterX,
    (unit.lastSafeTile.y + 0.5) * TILE_SIZE - unitCenterY
  )

  // Only move back to safe tile if we're more than 5 tiles away from it
  if (distanceToSafeTile > 5 * TILE_SIZE) {
    if (
      !unit.harvesterHunterRetreatTarget ||
      unit.harvesterHunterRetreatTarget.x !== unit.lastSafeTile.x ||
      unit.harvesterHunterRetreatTarget.y !== unit.lastSafeTile.y ||
      !unit.path ||
      unit.path.length === 0 ||
      (unit.lastPathCalcTime && now - unit.lastPathCalcTime > HARVESTER_HUNTER_PATH_REFRESH)
    ) {
      const path = getCachedPath(
        { x: unit.tileX, y: unit.tileY, owner: unit.owner },
        unit.lastSafeTile,
        mapGrid,
        gameState.occupancyMap,
        { unitOwner: unit.owner }
      )
      unit.path = path.length > 1 ? path.slice(1) : []
      unit.lastPathCalcTime = now
      unit.harvesterHunterRetreatTarget = unit.lastSafeTile
    }
    unit.moveTarget = {
      x: (unit.lastSafeTile.x + 0.5) * TILE_SIZE,
      y: (unit.lastSafeTile.y + 0.5) * TILE_SIZE
    }
  } else {
    // Close enough to safe position - hold position and wait
    unit.path = []
    unit.moveTarget = null
    unit.harvesterHunterRetreatTarget = null
  }

  unit.lastDecisionTime = now
}

function findPlayerBaseCenter(gameState) {
  if (!gameState?.buildings || !gameState.humanPlayer) {
    return null
  }

  const playerBuildings = gameState.buildings.filter(
    b => b.owner === gameState.humanPlayer && b.health > 0
  )

  if (playerBuildings.length === 0) return null

  const baseBuilding =
    playerBuildings.find(b => b.type === 'constructionYard') || playerBuildings[0]

  return {
    x: (baseBuilding.x + (baseBuilding.width || 1) / 2) * TILE_SIZE,
    y: (baseBuilding.y + (baseBuilding.height || 1) / 2) * TILE_SIZE
  }
}

function getPlayerDefensiveBuildings(gameState) {
  if (!gameState?.buildings || !gameState.humanPlayer) {
    return []
  }

  return gameState.buildings.filter(
    b => b.owner === gameState.humanPlayer && PLAYER_DEFENSE_BUILDINGS.has(b.type)
  )
}

function isNearPlayerDefense(x, y, gameState) {
  const defenses = getPlayerDefensiveBuildings(gameState)
  if (defenses.length === 0) return false

  return defenses.some(defense => {
    const centerX = (defense.x + (defense.width || 1) / 2) * TILE_SIZE
    const centerY = (defense.y + (defense.height || 1) / 2) * TILE_SIZE
    return Math.hypot(x - centerX, y - centerY) < PLAYER_DEFENSE_RADIUS
  })
}

function findNearestPlayerDefense(x, y, gameState) {
  const defenses = getPlayerDefensiveBuildings(gameState)
  if (defenses.length === 0) return null

  let nearest = null
  let nearestDist = Infinity

  defenses.forEach(defense => {
    const centerX = (defense.x + (defense.width || 1) / 2) * TILE_SIZE
    const centerY = (defense.y + (defense.height || 1) / 2) * TILE_SIZE
    const dist = Math.hypot(x - centerX, y - centerY)

    if (dist < nearestDist) {
      nearestDist = dist
      nearest = { defense, centerX, centerY, distance: dist }
    }
  })

  return nearest
}

function findRemotePlayerHarvesters(units, gameState, baseCenter) {
  if (!gameState?.humanPlayer) return []

  return units.filter(unit => {
    if (unit.owner !== gameState.humanPlayer) return false
    if (unit.type !== 'harvester' || unit.health <= 0) return false
    return isHarvesterRemote(unit, baseCenter, gameState)
  })
}

function isHarvesterRemote(harvester, baseCenter, gameState) {
  const centerX = harvester.x + TILE_SIZE / 2
  const centerY = harvester.y + TILE_SIZE / 2

  // Main requirement: harvester must NOT be near player defenses
  if (isNearPlayerDefense(centerX, centerY, gameState)) {
    return false
  }

  // Secondary requirement: harvester must be actively working (harvesting or carrying ore)
  if (!harvester.harvesting && harvester.oreCarried <= 0) {
    return false
  }

  // If not near defenses and actively working, it's a valid target
  // Distance from base is less important than whether it's protected by defenses
  return true
}

function findNearestAIBuildingTile(unit, gameState, aiPlayerId) {
  if (!gameState?.buildings) return null

  const aiBuildings = gameState.buildings.filter(
    b => b.owner === aiPlayerId && b.health > 0
  )
  if (aiBuildings.length === 0) return null

  let closestTile = null
  let closestDistance = Infinity

  aiBuildings.forEach(building => {
    const centerTile = {
      x: Math.floor(building.x + (building.width || 1) / 2),
      y: Math.floor(building.y + (building.height || 1) / 2)
    }

    const distance = Math.hypot(
      (centerTile.x + 0.5) * TILE_SIZE - (unit.x + TILE_SIZE / 2),
      (centerTile.y + 0.5) * TILE_SIZE - (unit.y + TILE_SIZE / 2)
    )

    if (distance < closestDistance) {
      closestDistance = distance
      closestTile = centerTile
    }
  })

  return closestTile
}

function updateApacheAI(unit, units, gameState, mapGrid, now, aiPlayerId) {
  const allowDecision = !unit.lastDecisionTime || (now - unit.lastDecisionTime >= AI_DECISION_INTERVAL)
  const unitCenter = getUnitCenter(unit)
  const nearDefense = isAirDefenseNearby(unitCenter, units, gameState)
  const airTarget = findEnemyApacheInRange(unit, units, gameState)

  if (airTarget) {
    if (unit.target !== airTarget) {
      if (unit.target && unit.target.type !== 'apache') {
        unit.apacheResumeTarget = unit.target
      }
      unit.target = airTarget
      unit.allowedToAttack = true
      unit.lastTargetChangeTime = now
    }
    unit.path = []
    unit.moveTarget = null
    unit.lastDecisionTime = now
    return
  }

  if (unit.target && unit.target.type === 'apache' && unit.apacheResumeTarget) {
    unit.target = unit.apacheResumeTarget
    unit.apacheResumeTarget = null
  }

  if (nearDefense || unit.airDefenseRetreating) {
    const safeTile = findNearestAIBuildingTile(unit, gameState, aiPlayerId)
    unit.airDefenseRetreating = true
    unit.target = null

    if (safeTile) {
      unit.path = []
      unit.moveTarget = null
      const retreatTarget = {
        x: (safeTile.x + 0.5) * TILE_SIZE,
        y: (safeTile.y + 0.5) * TILE_SIZE
      }
      unit.flightPlan = {
        x: retreatTarget.x,
        y: retreatTarget.y,
        stopRadius: TILE_SIZE * 0.6,
        mode: 'retreat',
        followTargetId: null,
        destinationTile: { ...safeTile }
      }
      unit.lastDecisionTime = now

      const distanceToBase = Math.hypot(retreatTarget.x - unitCenter.x, retreatTarget.y - unitCenter.y)
      if (!nearDefense && distanceToBase < TILE_SIZE * 2) {
        unit.airDefenseRetreating = false
      }
    } else {
      unit.airDefenseRetreating = false
    }
    return
  }

  if (!allowDecision) {
    return
  }

  const target = findApacheStrikeTarget(units, gameState, unit)

  if (!target) {
    unit.target = null
    unit.moveTarget = null
    unit.path = []
    unit.lastDecisionTime = now
    return
  }

  unit.target = target
  unit.allowedToAttack = true
  unit.lastTargetChangeTime = now
  unit.lastDecisionTime = now

  const targetTile = target.tileX !== undefined
    ? { x: target.tileX, y: target.tileY }
    : { x: target.x, y: target.y }

  unit.moveTarget = null
  unit.path = []
  unit.flightPlan = {
    x: (targetTile.x + 0.5) * TILE_SIZE,
    y: (targetTile.y + 0.5) * TILE_SIZE,
    stopRadius: TILE_SIZE * 0.6,
    mode: 'attack',
    followTargetId: target.id || null,
    destinationTile: { ...targetTile }
  }
}

function findEnemyApacheInRange(unit, units, gameState) {
  if (!unit || !Array.isArray(units)) {
    return null
  }

  const effectiveRange = getEffectiveFireRange(unit)
  const unitCenter = getUnitCenter(unit)
  const enemyApaches = units.filter(candidate =>
    candidate &&
    candidate.type === 'apache' &&
    candidate.health > 0 &&
    candidate.owner !== unit.owner &&
    candidate.owner === gameState.humanPlayer
  )

  let bestTarget = null
  let bestDistance = Infinity
  enemyApaches.forEach(candidate => {
    const candidateCenter = getUnitCenter(candidate)
    const distance = Math.hypot(candidateCenter.x - unitCenter.x, candidateCenter.y - unitCenter.y)
    if (distance <= effectiveRange && distance < bestDistance) {
      bestTarget = candidate
      bestDistance = distance
    }
  })

  return bestTarget
}

function getUnitCenter(unit) {
  return {
    x: unit.x + TILE_SIZE / 2,
    y: unit.y + TILE_SIZE / 2
  }
}

function isAirDefenseNearby(position, units, gameState) {
  const player = gameState.humanPlayer
  const nearbyRocketTanks = units.some(u =>
    u.owner === player &&
    AIR_DEFENSE_TYPES.has(u.type) &&
    u.health > 0 &&
    Math.hypot((u.x + TILE_SIZE / 2) - position.x, (u.y + TILE_SIZE / 2) - position.y) <= AIR_DEFENSE_RADIUS
  )

  if (nearbyRocketTanks) return true

  const nearbyTurrets = (gameState.buildings || []).some(building => {
    if (building.owner !== player || !AIR_DEFENSE_BUILDINGS.has(building.type) || building.health <= 0) return false

    const centerX = (building.x + (building.width || 1) / 2) * TILE_SIZE
    const centerY = (building.y + (building.height || 1) / 2) * TILE_SIZE
    const distance = Math.hypot(centerX - position.x, centerY - position.y)
    return distance <= ROCKET_TURRET_RANGE + TILE_SIZE
  })

  return nearbyTurrets
}

function findApacheStrikeTarget(units, gameState, seeker) {
  const player = gameState.humanPlayer
  const playerHarvesters = units.filter(u => u.owner === player && u.type === 'harvester' && u.health > 0)
  const seekerCenter = getUnitCenter(seeker)

  const unprotectedHarvesters = playerHarvesters.filter(harvester => {
    const center = getUnitCenter(harvester)
    return !isAirDefenseNearby(center, units, gameState)
  })

  if (unprotectedHarvesters.length > 0) {
    unprotectedHarvesters.sort((a, b) => {
      const aCenter = getUnitCenter(a)
      const bCenter = getUnitCenter(b)
      return Math.hypot(aCenter.x - seekerCenter.x, aCenter.y - seekerCenter.y) - Math.hypot(bCenter.x - seekerCenter.x, bCenter.y - seekerCenter.y)
    })
    return unprotectedHarvesters[0]
  }

  const priorityBuildings = ['constructionYard', 'oreRefinery', 'vehicleFactory', 'powerPlant']
  const playerBuildings = (gameState.buildings || []).filter(b => b.owner === player && b.health > 0)

  for (const type of priorityBuildings) {
    const candidate = playerBuildings
      .filter(b => b.type === type)
      .find(b => !isAirDefenseNearby({
        x: (b.x + (b.width || 1) / 2) * TILE_SIZE,
        y: (b.y + (b.height || 1) / 2) * TILE_SIZE
      }, units, gameState))

    if (candidate) return candidate
  }

  const fallback = playerBuildings.find(b => !isAirDefenseNearby({
    x: (b.x + (b.width || 1) / 2) * TILE_SIZE,
    y: (b.y + (b.height || 1) / 2) * TILE_SIZE
  }, units, gameState))

  return fallback || null
}

export { updateAIUnit }
