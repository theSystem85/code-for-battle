import {
  TILE_SIZE,
  STUCK_CHECK_INTERVAL,
  STUCK_THRESHOLD,
  STUCK_HANDLING_COOLDOWN,
  DODGE_ATTEMPT_COOLDOWN
} from '../config.js'
import { clearStuckHarvesterOreField, handleStuckHarvester } from './harvesterLogic.js'
import { findPath } from '../units.js'
import { MOVEMENT_CONFIG } from './movementConstants.js'
import { normalizeAngle } from './movementHelpers.js'
import { gameRandom } from '../utils/gameRandom.js'
import { hasBlockingBuilding } from '../utils/buildingPassability.js'

function ensureMovement(unit) {
  if (!unit.movement) {
    unit.movement = {
      velocity: { x: 0, y: 0 },
      targetVelocity: { x: 0, y: 0 },
      rotation: unit.rotation || 0,
      targetRotation: unit.rotation || 0,
      isMoving: false,
      currentSpeed: 0
    }
  }
  return unit.movement
}

function beginLocalAvoidance(unit, detourTiles) {
  if (!unit || !Array.isArray(detourTiles) || detourTiles.length === 0) {
    return false
  }

  const now = performance.now()
  const remainingRoute = Array.isArray(unit.path) ? [...unit.path] : []
  const lastDetourTile = detourTiles[detourTiles.length - 1]

  const mergedRoute = [...detourTiles]
  if (remainingRoute.length > 0) {
    const firstMainRouteTile = remainingRoute[0]
    const skipFirstMainTile = firstMainRouteTile && firstMainRouteTile.x === lastDetourTile.x && firstMainRouteTile.y === lastDetourTile.y
    mergedRoute.push(...(skipFirstMainTile ? remainingRoute.slice(1) : remainingRoute))
  }

  unit.path = mergedRoute
  unit.isDodging = true
  unit.dodgeEndTime = now + 2500
  unit.localAvoidanceRemainingSteps = detourTiles.length
  unit.localAvoidanceTotalSteps = detourTiles.length

  return true
}

export function rotateUnitInPlace(unit, targetDirection = null) {
  if (!unit) {
    return false
  }

  const movement = ensureMovement(unit)

  if (targetDirection !== null) {
    movement.targetRotation = targetDirection
  } else {
    movement.targetRotation = gameRandom() * Math.PI * 2
  }

  const rotationDiff = normalizeAngle(movement.targetRotation - movement.rotation)

  if (Math.abs(rotationDiff) > 0.1) {
    const rotationStep = MOVEMENT_CONFIG.ROTATION_SPEED * 2

    if (rotationDiff > 0) {
      movement.rotation += Math.min(rotationStep, rotationDiff)
    } else {
      movement.rotation -= Math.min(rotationStep, Math.abs(rotationDiff))
    }

    movement.rotation = normalizeAngle(movement.rotation)
    unit.rotation = movement.rotation
    return true
  }

  return false
}

export function handleStuckUnit(unit, mapGrid, occupancyMap, units, gameState = null, factories = null) {
  if (!unit) {
    return
  }

  const movement = ensureMovement(unit)

  // For human-controlled units following a player-issued move target, skip stuck
  // handling ONLY within the first 2 seconds after a path was calculated.
  // This prevents immediate re-path jitter while still allowing stuck recovery
  // when the unit is genuinely blocked.
  const now = performance.now()
  const isPlayerUnit = gameState && (unit.owner === gameState.humanPlayer ||
    (gameState.humanPlayer === 'player1' && unit.owner === 'player'))
  const hasRecentPath = unit.lastPathCalcTime && (now - unit.lastPathCalcTime < 2000)
  const hasActivePlayerMove = isPlayerUnit && unit.moveTarget && unit.path && unit.path.length > 0 &&
    !unit.isRetreating && !unit.sweepingOverrideMovement && !unit.isDodging
  if (hasActivePlayerMove && hasRecentPath) {
    return
  }

  if (!unit.movement.stuckDetection) {
    const randomOffset = gameRandom() * STUCK_CHECK_INTERVAL
    unit.movement.stuckDetection = {
      lastPosition: { x: unit.x, y: unit.y },
      stuckTime: 0,
      lastMovementCheck: performance.now() - randomOffset,
      rotationAttempts: 0,
      isRotating: false,
      dodgeAttempts: 0,
      lastDodgeTime: 0,
      lastStuckHandling: 0,
      checkInterval: STUCK_CHECK_INTERVAL + randomOffset
    }
  }

  const stuck = unit.movement.stuckDetection

  const stuckThreshold = STUCK_THRESHOLD
  const unitCheckInterval = stuck.checkInterval || STUCK_CHECK_INTERVAL

  if (now - stuck.lastMovementCheck > unitCheckInterval) {
    const distanceMoved = Math.hypot(unit.x - stuck.lastPosition.x, unit.y - stuck.lastPosition.y)
    const timeDelta = now - stuck.lastMovementCheck
    const recentStaticCollision = Boolean(
      movement?.lastStaticCollisionTime &&
      now - movement.lastStaticCollisionTime < 650
    )

    if (unit.type === 'harvester') {
      const isPerformingValidAction = unit.harvesting ||
                                    unit.unloadingAtRefinery ||
                                    (unit.oreCarried === 0 && !unit.oreField && (!unit.path || unit.path.length === 0)) ||
                                    (unit.manualOreTarget && !unit.path)

      if (isPerformingValidAction) {
        stuck.stuckTime = 0
        stuck.rotationAttempts = 0
        stuck.dodgeAttempts = 0
        stuck.isRotating = false
      } else if (distanceMoved < TILE_SIZE / 4 && unit.path && unit.path.length > 0) {
        const isAIHarvester = unit.owner === 'enemy'
        const movementThreshold = isAIHarvester ? TILE_SIZE / 8 : TILE_SIZE / 4
        const stuckTimeThreshold = isAIHarvester ? stuckThreshold * 2 : stuckThreshold

        if (distanceMoved < movementThreshold) {
          const slidingProgress = recentStaticCollision && distanceMoved >= movementThreshold * 0.35

          if (slidingProgress) {
            stuck.stuckTime = Math.max(0, stuck.stuckTime - timeDelta * 0.5)
          } else {
            stuck.stuckTime += timeDelta
          }

          if (stuck.stuckTime > stuckTimeThreshold && !stuck.isRotating && (now - stuck.lastStuckHandling > STUCK_HANDLING_COOLDOWN)) {

            stuck.lastStuckHandling = now

            if (isAIHarvester) {
              if (unit.oreField) {
                clearStuckHarvesterOreField(unit)
                unit.path = []
                stuck.stuckTime = 0
                stuck.rotationAttempts = 0
                stuck.dodgeAttempts = 0
                return
              } else {
                unit.path = []
                stuck.stuckTime = 0
                stuck.rotationAttempts = 0
                stuck.dodgeAttempts = 0
                stuck.isRotating = false
                return
              }
            }

            if (tryRandomStuckMovement(unit, mapGrid, occupancyMap, units)) {
              stuck.stuckTime = 0
              stuck.rotationAttempts = 0
              stuck.dodgeAttempts = 0
              return
            }

            if (gameState && factories) {
              handleStuckHarvester(unit, mapGrid, occupancyMap, gameState, factories)
              stuck.stuckTime = 0
              stuck.rotationAttempts = 0
              stuck.dodgeAttempts = 0
              return
            }

            if (unit.oreField && stuck.stuckTime > stuckThreshold) {
              clearStuckHarvesterOreField(unit)
              unit.path = []
              stuck.stuckTime = 0
            }

            if (stuck.dodgeAttempts < 3 && now - stuck.lastDodgeTime > DODGE_ATTEMPT_COOLDOWN) {
              if (tryDodgeMovement(unit, mapGrid, occupancyMap, units)) {
                stuck.dodgeAttempts++
                stuck.lastDodgeTime = now
                stuck.stuckTime = 0
                return
              }
            }

            if (stuck.rotationAttempts < 4) {
              stuck.isRotating = true
              stuck.rotationAttempts++

              const freeDirection = findFreeDirection(unit, mapGrid, occupancyMap, units)
              if (freeDirection !== null) {
                rotateUnitInPlace(unit, freeDirection)
              } else {
                rotateUnitInPlace(unit)
              }
            } else {
              if (!hasActivePlayerMove) {
                unit.path = []
              }
              stuck.stuckTime = 0
              stuck.rotationAttempts = 0
              stuck.dodgeAttempts = 0
              stuck.isRotating = false
            }
          }
        } else {
          stuck.stuckTime = 0
          stuck.rotationAttempts = 0
          stuck.dodgeAttempts = 0
          stuck.isRotating = false
        }
      } else {
        stuck.stuckTime = 0
        stuck.rotationAttempts = 0
        stuck.dodgeAttempts = 0
        stuck.isRotating = false
      }
    } else if (distanceMoved < TILE_SIZE / 4 && unit.path && unit.path.length > 0) {
      const isAICombatUnit = unit.owner === 'enemy' &&
        (unit.type === 'tank' || unit.type === 'tank_v1' || unit.type === 'tank-v2' || unit.type === 'tank-v3' || unit.type === 'rocketTank')

      const movementThreshold = isAICombatUnit ? TILE_SIZE / 8 : TILE_SIZE / 4
      const stuckTimeThreshold = isAICombatUnit ? stuckThreshold * 3 : stuckThreshold

      if (distanceMoved < movementThreshold) {
        const slidingProgress = recentStaticCollision && distanceMoved >= movementThreshold * 0.35

        if (slidingProgress) {
          stuck.stuckTime = Math.max(0, stuck.stuckTime - timeDelta * 0.5)
        } else {
          stuck.stuckTime += timeDelta
        }

        if (stuck.stuckTime > stuckTimeThreshold && !stuck.isRotating && (now - stuck.lastStuckHandling > STUCK_HANDLING_COOLDOWN)) {

          stuck.lastStuckHandling = now

          if (isAICombatUnit) {
            unit.path = []
            stuck.stuckTime = 0
            stuck.rotationAttempts = 0
            stuck.dodgeAttempts = 0
            stuck.isRotating = false
            return
          }

          if (tryRandomStuckMovement(unit, mapGrid, occupancyMap, units)) {
            stuck.stuckTime = 0
            stuck.rotationAttempts = 0
            stuck.dodgeAttempts = 0
            return
          }

          if (stuck.rotationAttempts < 3) {
            stuck.isRotating = true
            stuck.rotationAttempts++

            const freeDirection = findFreeDirection(unit, mapGrid, occupancyMap, units)
            if (freeDirection !== null) {
              rotateUnitInPlace(unit, freeDirection)
            } else {
              rotateUnitInPlace(unit)
            }
          } else {
            if (!hasActivePlayerMove) {
              unit.path = []
            }
            stuck.stuckTime = 0
            stuck.rotationAttempts = 0
            stuck.dodgeAttempts = 0
            stuck.isRotating = false
          }
        }
      } else {
        stuck.stuckTime = 0
        stuck.rotationAttempts = 0
        stuck.dodgeAttempts = 0
        stuck.isRotating = false
      }
    } else {
      stuck.stuckTime = 0
      stuck.rotationAttempts = 0
      stuck.dodgeAttempts = 0
      stuck.isRotating = false
    }

    stuck.lastPosition.x = unit.x
    stuck.lastPosition.y = unit.y
    stuck.lastMovementCheck = now
  }

  if (stuck.isRotating) {
    const stillRotating = rotateUnitInPlace(unit)
    if (!stillRotating) {
      stuck.isRotating = false
      stuck.stuckTime = 0
    }
  }
}

function tryRandomStuckMovement(unit, mapGrid, occupancyMap, units) {
  const currentTileX = Math.floor(unit.x / TILE_SIZE)
  const currentTileY = Math.floor(unit.y / TILE_SIZE)

  let currentDirection = unit.movement?.rotation || 0
  if (unit.path && unit.path.length > 0) {
    const nextTile = unit.path[0]
    const dx = nextTile.x * TILE_SIZE - unit.x
    const dy = nextTile.y * TILE_SIZE - unit.y
    currentDirection = Math.atan2(dy, dx)
  }

  const turnDirection = gameRandom() < 0.5 ? -Math.PI / 2 : Math.PI / 2
  const newDirection = currentDirection + turnDirection

  const forwardDistance = gameRandom() < 0.5 ? 1 : 2

  const targetX = Math.round(currentTileX + Math.cos(newDirection) * forwardDistance)
  const targetY = Math.round(currentTileY + Math.sin(newDirection) * forwardDistance)

  if (isValidDodgePosition(targetX, targetY, mapGrid, units)) {
    return beginLocalAvoidance(unit, [{ x: targetX, y: targetY }])
  }

  return false
}

async function tryDodgeMovement(unit, mapGrid, occupancyMap, units) {
  const currentTileX = Math.floor(unit.x / TILE_SIZE)
  const currentTileY = Math.floor(unit.y / TILE_SIZE)

  const dodgePositions = []

  for (let radius = 1; radius <= 3; radius++) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const dodgeX = Math.round(currentTileX + Math.cos(angle) * radius)
      const dodgeY = Math.round(currentTileY + Math.sin(angle) * radius)

      if (isValidDodgePosition(dodgeX, dodgeY, mapGrid, units)) {
        dodgePositions.push({ x: dodgeX, y: dodgeY, radius })
      }
    }

    if (dodgePositions.length > 0) break
  }

  if (dodgePositions.length > 0) {
    const dodgePos = dodgePositions[Math.floor(gameRandom() * dodgePositions.length)]

    const dodgePath = findPath(
      { x: currentTileX, y: currentTileY, owner: unit.owner },
      dodgePos,
      mapGrid,
      occupancyMap,
      undefined,
      { unitOwner: unit.owner }
    )

    if (dodgePath.length > 1) {
      return beginLocalAvoidance(unit, dodgePath.slice(1))
    }
  }

  return false
}

export function isValidDodgePosition(x, y, mapGrid, units) {
  if (!mapGrid || x < 0 || y < 0 || x >= mapGrid[0].length || y >= mapGrid.length) {
    return false
  }

  const tile = mapGrid[y][x]
  if (tile.type === 'water' || tile.type === 'rock' || tile.seedCrystal || hasBlockingBuilding(tile)) {
    return false
  }

  const tileCenter = { x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 }
  const unitRadius = TILE_SIZE * 0.4

  for (const otherUnit of units) {
    if (otherUnit.health <= 0) continue

    const otherCenter = { x: otherUnit.x + TILE_SIZE / 2, y: otherUnit.y + TILE_SIZE / 2 }
    const distance = Math.hypot(tileCenter.x - otherCenter.x, tileCenter.y - otherCenter.y)

    if (distance < unitRadius * 1.5) {
      return false
    }
  }

  return true
}

function findFreeDirection(unit, mapGrid, occupancyMap, units) {
  const currentTileX = Math.floor(unit.x / TILE_SIZE)
  const currentTileY = Math.floor(unit.y / TILE_SIZE)

  const directions = [
    { x: 0, y: -1, angle: -Math.PI / 2 },
    { x: 1, y: -1, angle: -Math.PI / 4 },
    { x: 1, y: 0, angle: 0 },
    { x: 1, y: 1, angle: Math.PI / 4 },
    { x: 0, y: 1, angle: Math.PI / 2 },
    { x: -1, y: 1, angle: 3 * Math.PI / 4 },
    { x: -1, y: 0, angle: Math.PI },
    { x: -1, y: -1, angle: -3 * Math.PI / 4 }
  ]

  for (const dir of directions) {
    const checkX = currentTileX + dir.x
    const checkY = currentTileY + dir.y

    if (isValidDodgePosition(checkX, checkY, mapGrid, units)) {
      return dir.angle
    }
  }

  return null
}
