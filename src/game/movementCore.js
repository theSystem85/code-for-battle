import {
  TILE_SIZE,
  MINE_TRIGGER_RADIUS,
  STREET_SPEED_MULTIPLIER,
  TILE_LENGTH_METERS
} from '../config.js'
import { getMineAtTile, detonateMine } from './mineSystem.js'
import { detonateTankerTruck } from './tankerTruckUtils.js'
import { updateUnitOccupancy } from '../units.js'
import { playPositionalSound, playSound, audioContext, getMasterVolume } from '../sound.js'
import { gameState as globalGameState } from '../gameState.js'
import { smoothRotateTowardsAngle } from '../logic.js'
import { MOVEMENT_CONFIG } from './movementConstants.js'
import {
  calculatePositionalAudio,
  consumeUnitGas,
  normalizeAngle,
  isAirborneUnit,
  isGroundUnit,
  ownersAreEnemies
} from './movementHelpers.js'
import { updateApacheFlightState } from './movementApache.js'
import { updateF22FlightState } from './movementF22.js'
import {
  checkUnitCollision,
  applyWreckCollisionResponse,
  applyStaticObstacleCollisionResponse,
  applyUnitCollisionResponse,
  applyBuildingCollisionResponse,
  trySlideMovement,
  calculateAirCollisionAvoidance,
  calculateCollisionAvoidance
} from './movementCollision.js'
import { handleStuckUnit } from './movementStuck.js'

const MOVEMENT_SOUND_STOP_FADE_SECONDS = 0.08
const TANK_ENGINE_LOOP_VOLUME = 0.2

function stopLoopedMovementSound(soundHandle, fadeSeconds = MOVEMENT_SOUND_STOP_FADE_SECONDS) {
  if (!soundHandle || !audioContext) return

  const { source, gainNode } = soundHandle
  const stopAt = audioContext.currentTime + Math.max(0, fadeSeconds)

  if (gainNode) {
    gainNode.gain.cancelScheduledValues(audioContext.currentTime)
    gainNode.gain.setValueAtTime(gainNode.gain.value, audioContext.currentTime)
    gainNode.gain.linearRampToValueAtTime(0, stopAt)
  }

  if (source) {
    try {
      source.stop(stopAt)
    } catch (e) {
      console.error('Error stopping movement loop sound:', e)
    }
  }
}

function shouldPlayTankEngineSound(unit, movement) {
  if (!unit || !movement) return false
  if (unit.health <= 0 || unit.destroyed) return false
  return movement.currentSpeed > MOVEMENT_CONFIG.MIN_SPEED
}

function beginTankEngineLoop(unit) {
  if (!unit || unit.engineSound || unit.engineSoundLoading) return

  unit.engineSoundLoading = true
  const requestId = (unit.engineSoundRequestId || 0) + 1
  unit.engineSoundRequestId = requestId

  playPositionalSound('tankDriveLoop', unit.x, unit.y, TANK_ENGINE_LOOP_VOLUME, 0, false, { playLoop: true })
    .then(handle => {
      unit.engineSoundLoading = false
      if (!handle) return

      const requestStillValid = unit.engineSoundRequestId === requestId
      const stillMoving = shouldPlayTankEngineSound(unit, unit.movement)
      if (!requestStillValid || !stillMoving || unit.engineSound) {
        stopLoopedMovementSound(handle)
        return
      }

      const { pan, volumeFactor } = calculatePositionalAudio(unit.x, unit.y)
      const targetGain = TANK_ENGINE_LOOP_VOLUME * volumeFactor * getMasterVolume()
      if (handle.gainNode) {
        handle.gainNode.gain.setValueAtTime(0, audioContext.currentTime)
        handle.gainNode.gain.linearRampToValueAtTime(targetGain, audioContext.currentTime + 0.08)
      }
      if (handle.panner) handle.panner.pan.value = pan
      unit.engineSound = handle
    })
    .catch(error => {
      unit.engineSoundLoading = false
      console.error('Error playing tank engine loop:', error)
    })
}

function stopTankEngineLoop(unit) {
  if (!unit) return

  unit.engineSoundRequestId = (unit.engineSoundRequestId || 0) + 1
  unit.engineSoundLoading = false

  if (unit.engineSound) {
    stopLoopedMovementSound(unit.engineSound)
    unit.engineSound = null
  }
}

export function checkMineDetonation(unit, tileX, tileY, units, buildings) {
  if (!unit) return
  const mine = getMineAtTile(tileX, tileY)
  if (!mine || !mine.active || !isUnitCenterInsideMineCircle(unit, tileX, tileY)) {
    return
  }
  if (unit.type === 'mineSweeper' && unit.sweeping) {
    detonateMine(mine, units, buildings)
    return
  }
  detonateMine(mine, units, buildings)
}

export function isUnitCenterInsideMineCircle(unit, tileX, tileY) {
  if (!unit || typeof tileX !== 'number' || typeof tileY !== 'number') return false
  const offset = TILE_SIZE / 2
  const unitCenterX = unit.x + offset
  const unitCenterY = unit.y + offset
  const tileCenterX = tileX * TILE_SIZE + offset
  const tileCenterY = tileY * TILE_SIZE + offset
  const dx = unitCenterX - tileCenterX
  const dy = unitCenterY - tileCenterY
  const radiusSq = MINE_TRIGGER_RADIUS * MINE_TRIGGER_RADIUS
  return dx * dx + dy * dy <= radiusSq
}

export function hasFriendlyUnitOnTile(unit, tileX, tileY, units = []) {
  if (!unit || !Number.isFinite(tileX) || !Number.isFinite(tileY) || !Array.isArray(units)) {
    return false
  }

  for (const otherUnit of units) {
    if (!otherUnit || otherUnit.id === unit.id || otherUnit.health <= 0) continue
    if (!isGroundUnit(otherUnit)) continue

    const otherTileX = Math.floor((otherUnit.x + TILE_SIZE / 2) / TILE_SIZE)
    const otherTileY = Math.floor((otherUnit.y + TILE_SIZE / 2) / TILE_SIZE)

    if (otherTileX === tileX && otherTileY === tileY) {
      if (!ownersAreEnemies(unit.owner, otherUnit.owner)) {
        return true
      }
    }
  }

  return false
}

export function initializeUnitMovement(unit) {
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
}

export function updateUnitPosition(unit, mapGrid, occupancyMap, now, units = [], gameState = globalGameState, factories = null) {
  initializeUnitMovement(unit)

  const isAirborne = isAirborneUnit(unit)
  const hasRestorationOverride = Boolean(unit.restorationMoveOverride)

  if (!hasRestorationOverride && typeof unit.gas === 'number' && unit.gas <= 0) {
    if (!unit.outOfGasPlayed) {
      playSound('outOfGas')
      unit.outOfGasPlayed = true
    }
    unit.path = []
    unit.moveTarget = null
    unit.movement.velocity = { x: 0, y: 0 }
    unit.movement.targetVelocity = { x: 0, y: 0 }
    unit.movement.isMoving = false
    unit.movement.currentSpeed = 0
    if (unit.type === 'apache' || unit.type === 'f22Raptor') {
      unit.flightPlan = null
      unit.autoHoldAltitude = false
      unit.helipadLandingRequested = false
      if (unit.flightState !== 'grounded') {
        unit.manualFlightState = 'land'
      }
    }
    return
  } else if (unit.gas > 0 && unit.needsEmergencyFuel) {
    unit.needsEmergencyFuel = false
    unit.emergencyFuelRequestTime = null
  }

  if (unit.type === 'harvester') {
    if (unit.harvesting) {
      unit.path = []
      unit.moveTarget = null
      unit.movement.velocity = { x: 0, y: 0 }
      unit.movement.targetVelocity = { x: 0, y: 0 }
      unit.movement.isMoving = false
      unit.movement.currentSpeed = 0
      return
    }

    if (unit.unloadingAtRefinery) {
      unit.path = []
      unit.moveTarget = null
      unit.movement.velocity = { x: 0, y: 0 }
      unit.movement.targetVelocity = { x: 0, y: 0 }
      unit.movement.isMoving = false
      unit.movement.currentSpeed = 0
      return
    }
  }

  if (!hasRestorationOverride && unit.crew && typeof unit.crew === 'object' && !unit.crew.driver && unit.type !== 'ambulance') {
    unit.path = []
    unit.moveTarget = null
    unit.movement.velocity = { x: 0, y: 0 }
    unit.movement.targetVelocity = { x: 0, y: 0 }
    unit.movement.isMoving = false
    unit.movement.currentSpeed = 0
    return
  }

  if (unit.repairingAtWorkshop) {
    unit.path = []
    unit.moveTarget = null
    unit.movement.velocity = { x: 0, y: 0 }
    unit.movement.targetVelocity = { x: 0, y: 0 }
    unit.movement.isMoving = false
    unit.movement.currentSpeed = 0
    return
  }

  const movement = unit.movement
  const speedModifier = unit.speedModifier || 1
  const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
  const tile = mapGrid[tileY] && mapGrid[tileY][tileX]
  const onStreet = tile && (tile.type === 'street' || tile.airstripStreet)
  const onOre = Boolean(tile && tile.ore)
  const isGroundMover = !isAirborne

  let terrainMultiplier = onStreet ? STREET_SPEED_MULTIPLIER : 1
  if (unit.type === 'ambulance' && onStreet) {
    const ambulanceProps = unit.ambulanceProps || { streetSpeedMultiplier: 6.0 }
    terrainMultiplier = ambulanceProps.streetSpeedMultiplier || 6.0
  } else if (unit.type === 'rocketTank' && onStreet) {
    terrainMultiplier = STREET_SPEED_MULTIPLIER * 1.3
  }

  if (isGroundMover && onOre && unit.type !== 'harvester') {
    terrainMultiplier *= 0.7
  }

  const effectiveMaxSpeed = MOVEMENT_CONFIG.MAX_SPEED * speedModifier * terrainMultiplier

  if (unit.type === 'f22Raptor') {
    updateF22FlightState(unit, movement, now)
  }

  const isApacheFlightUnit = unit.type === 'apache'
  const isF22AirborneState = unit.type === 'f22Raptor' && unit.flightState !== 'grounded'
  const isAirFlightUnit = isApacheFlightUnit || isF22AirborneState
  const isF22RunwayControlled = unit.type === 'f22Raptor' && (
    unit.f22State === 'takeoff_roll' ||
    unit.f22State === 'liftoff' ||
    unit.f22State === 'landing_roll'
  )
  let activeFlightPlan = null
  let hadFlightPlanAtStart = false
  if (isAirFlightUnit) {
    if (unit.remoteControlActive) {
      unit.flightPlan = null
    } else {
      activeFlightPlan = unit.flightPlan
      hadFlightPlanAtStart = Boolean(activeFlightPlan)
    }

    if (activeFlightPlan) {
      const unitCenterX = unit.x + TILE_SIZE / 2
      const unitCenterY = unit.y + TILE_SIZE / 2
      const dx = activeFlightPlan.x - unitCenterX
      const dy = activeFlightPlan.y - unitCenterY
      const distance = Math.hypot(dx, dy)
      const stopRadius = Math.max(6, activeFlightPlan.stopRadius || TILE_SIZE * 0.4)

      if (distance <= stopRadius) {
        unit.flightPlan = null
        activeFlightPlan = null
        movement.targetVelocity.x = 0
        movement.targetVelocity.y = 0
        movement.isMoving = false
        movement.targetRotation = movement.rotation
        unit.hovering = unit.flightState === 'airborne'
        if (!unit.helipadLandingRequested) {
          unit.autoHoldAltitude = true
        }
      } else {
        const airSpeed = (unit.airCruiseSpeed || unit.speed || MOVEMENT_CONFIG.MAX_SPEED) * (unit.speedModifier || 1)
        const dirX = dx / distance
        const dirY = dy / distance
        const desiredRotation = normalizeAngle(Math.atan2(dirY, dirX))
        const apacheRotationSpeed = unit.type === 'f22Raptor'
          ? Math.max(0.02, (unit.rotationSpeed || 0.18) * 0.28)
          : (unit.rotationSpeed || 0.18)
        const currentRotation = unit.direction || movement.rotation || 0
        const smoothedRotation = smoothRotateTowardsAngle(currentRotation, desiredRotation, apacheRotationSpeed)
        movement.targetRotation = smoothedRotation

        if (unit.type === 'f22Raptor') {
          const angleToTarget = Math.abs(normalizeAngle(desiredRotation - smoothedRotation))
          const forwardThrottle = Math.max(0.22, Math.cos(angleToTarget))
          movement.targetVelocity.x = Math.cos(smoothedRotation) * airSpeed * forwardThrottle
          movement.targetVelocity.y = Math.sin(smoothedRotation) * airSpeed * forwardThrottle
        } else if (activeFlightPlan.mode === 'helipad') {
          const angleToTarget = Math.abs(normalizeAngle(desiredRotation - smoothedRotation))
          const forwardThrottle = Math.max(0, Math.cos(angleToTarget))
          const minThrottle = angleToTarget < Math.PI * 0.35 ? 0.2 : 0
          const throttle = Math.max(minThrottle, forwardThrottle)
          movement.targetVelocity.x = Math.cos(smoothedRotation) * airSpeed * throttle
          movement.targetVelocity.y = Math.sin(smoothedRotation) * airSpeed * throttle
        } else {
          movement.targetVelocity.x = dirX * airSpeed
          movement.targetVelocity.y = dirY * airSpeed
        }

        movement.isMoving = true
        movement.rotation = smoothedRotation
        unit.direction = smoothedRotation
        unit.rotation = smoothedRotation
        unit.hovering = false
      }
      unit.path = []
    } else if (!unit.remoteControlActive && !isF22RunwayControlled) {
      movement.targetVelocity.x = 0
      movement.targetVelocity.y = 0
      movement.targetRotation = movement.rotation
      if (movement.isMoving) {
        movement.isMoving = false
      }
      if (movement.currentSpeed < MOVEMENT_CONFIG.MIN_SPEED) {
        unit.hovering = unit.flightState === 'airborne'
      }
    }
  }

  const skipPathHandlingForAirFlight =
    (isAirFlightUnit && !unit.remoteControlActive && hadFlightPlanAtStart) ||
    isF22RunwayControlled
  if (!skipPathHandlingForAirFlight && unit.path && unit.path.length > 0) {
    const nextTile = unit.path[0]
    const targetX = nextTile.x * TILE_SIZE
    const targetY = nextTile.y * TILE_SIZE

    const dx = targetX - unit.x
    const dy = targetY - unit.y
    const distance = Math.hypot(dx, dy)

    const baseReachDistance = TILE_SIZE / 3
    let waypointReachDistance = baseReachDistance

    if (distance >= baseReachDistance && hasFriendlyUnitOnTile(unit, nextTile.x, nextTile.y, units)) {
      const friendlyAllowance = Math.min(TILE_SIZE * 0.95, MOVEMENT_CONFIG.MIN_UNIT_DISTANCE * 1.25)
      waypointReachDistance = Math.max(baseReachDistance, friendlyAllowance)
    }

    if (distance < waypointReachDistance) {
      unit.path.shift()
      if (unit.isDodging && unit.localAvoidanceRemainingSteps > 0) {
        unit.localAvoidanceRemainingSteps = Math.max(0, unit.localAvoidanceRemainingSteps - 1)
        if (unit.localAvoidanceRemainingSteps === 0) {
          unit.isDodging = false
          unit.dodgeEndTime = null
        }
      }

      const humanPlayer = gameState.humanPlayer || 'player1'
      const isPlayerUnit = unit.owner === humanPlayer || (humanPlayer === 'player1' && unit.owner === 'player')
      const isUsingPathPlanning = unit.commandQueue && unit.commandQueue.length > 0
      if (isPlayerUnit && unit.path.length > 0 && isUsingPathPlanning) {
        playPositionalSound('movingAlongThePath', unit.x, unit.y, 0.6, 2)
      }

      unit.tileX = nextTile.x
      unit.tileY = nextTile.y

      checkMineDetonation(unit, nextTile.x, nextTile.y, units, gameState?.buildings || [])

      if (unit.path.length === 0) {
        movement.targetVelocity.x = 0
        movement.targetVelocity.y = 0
        movement.isMoving = false
      }
    } else {
      const dirX = dx / distance
      const dirY = dy / distance

      if (unit.isRetreating) {
        const currentDirection = unit.direction || 0

        if (unit.isMovingBackwards) {
          const forwardX = Math.cos(currentDirection)
          const forwardY = Math.sin(currentDirection)

          const dotProduct = (dirX * forwardX) + (dirY * forwardY)

          if (dotProduct > 0) {
            movement.targetVelocity.x = forwardX * effectiveMaxSpeed
            movement.targetVelocity.y = forwardY * effectiveMaxSpeed
          } else {
            movement.targetVelocity.x = -forwardX * effectiveMaxSpeed
            movement.targetVelocity.y = -forwardY * effectiveMaxSpeed
          }

          movement.isMoving = true
          movement.targetRotation = currentDirection
        } else {
          const targetDirection = unit.retreatTargetDirection || Math.atan2(dy, dx)
          const rotationDiff = Math.abs(normalizeAngle(targetDirection - currentDirection))

          if (rotationDiff < 0.1) {
            const forwardX = Math.cos(currentDirection)
            const forwardY = Math.sin(currentDirection)

            movement.targetVelocity.x = forwardX * effectiveMaxSpeed
            movement.targetVelocity.y = forwardY * effectiveMaxSpeed
            movement.isMoving = true
          } else {
            movement.targetVelocity.x = 0
            movement.targetVelocity.y = 0
            movement.isMoving = false
          }

          movement.targetRotation = targetDirection
        }
      } else {
        movement.targetVelocity.x = dirX * effectiveMaxSpeed
        movement.targetVelocity.y = dirY * effectiveMaxSpeed
        movement.isMoving = true

        movement.targetRotation = Math.atan2(dy, dx)
      }
    }
  } else if (!skipPathHandlingForAirFlight) {
    if (!unit.remoteControlActive) {
      movement.targetVelocity.x = 0
      movement.targetVelocity.y = 0
      movement.isMoving = false
    }
  }

  const noAutoRotationTypes = ['tank', 'tank_v1', 'tank-v2', 'tank-v3', 'rocketTank', 'howitzer', 'apache', 'f22Raptor']
  if (!noAutoRotationTypes.includes(unit.type)) {
    updateUnitRotation(unit)
  }

  let canAccelerate = true
  let shouldDecelerate = false

  if (unit.type === 'tank' || unit.type === 'tank_v1' || unit.type === 'tank-v2' || unit.type === 'tank-v3' || unit.type === 'rocketTank' || unit.type === 'howitzer') {
    if (unit.isRetreating) {
      canAccelerate = unit.canAccelerate !== false
      shouldDecelerate = !canAccelerate
    } else {
      canAccelerate = unit.canAccelerate !== false
      shouldDecelerate = !canAccelerate && movement.isMoving
    }
  } else if (unit.type !== 'apache' && !(unit.type === 'f22Raptor' && unit.flightState !== 'grounded')) {
    const rotationDiff = Math.abs(normalizeAngle(movement.targetRotation - movement.rotation))
    canAccelerate = rotationDiff < Math.PI / 12
    shouldDecelerate = !canAccelerate && movement.isMoving
  }

  let avoidanceForce = { x: 0, y: 0 }
  if (movement.isMoving && canAccelerate) {
    // F22s never participate in collision avoidance (airborne or grounded taxi)
    if (unit.type === 'f22Raptor') {
      avoidanceForce = { x: 0, y: 0 }
    } else {
      avoidanceForce = isAirborne
        ? calculateAirCollisionAvoidance(unit, units)
        : calculateCollisionAvoidance(unit, units, mapGrid, occupancyMap)
    }
  }

  let accelRate
  if (shouldDecelerate || !movement.isMoving) {
    accelRate = MOVEMENT_CONFIG.DECELERATION
  } else if (canAccelerate && movement.isMoving) {
    if (unit.type === 'ambulance') {
      accelRate = MOVEMENT_CONFIG.ACCELERATION * 0.25
    } else {
      accelRate = MOVEMENT_CONFIG.ACCELERATION
      if (unit.accelerationMultiplier) {
        accelRate *= unit.accelerationMultiplier
      }
    }
  } else {
    accelRate = MOVEMENT_CONFIG.DECELERATION
  }

  let targetVelX, targetVelY

  if (shouldDecelerate) {
    targetVelX = 0
    targetVelY = 0
  } else {
    targetVelX = movement.targetVelocity.x + avoidanceForce.x
    targetVelY = movement.targetVelocity.y + avoidanceForce.y
  }

  movement.velocity.x += (targetVelX - movement.velocity.x) * accelRate
  movement.velocity.y += (targetVelY - movement.velocity.y) * accelRate

  const currentSpeed = Math.hypot(movement.velocity.x, movement.velocity.y)
  if (currentSpeed < MOVEMENT_CONFIG.MIN_SPEED && !movement.isMoving) {
    movement.velocity.x = 0
    movement.velocity.y = 0
    movement.currentSpeed = 0
  } else {
    movement.currentSpeed = currentSpeed
  }

  const prevX = unit.x
  const prevY = unit.y
  const prevTileX = Math.floor((prevX + TILE_SIZE / 2) / TILE_SIZE)
  const prevTileY = Math.floor((prevY + TILE_SIZE / 2) / TILE_SIZE)

  unit.x += movement.velocity.x
  unit.y += movement.velocity.y

  const attemptedX = unit.x
  const attemptedY = unit.y

  if (typeof unit.gas === 'number') {
    const distTiles = Math.hypot(unit.x - prevX, unit.y - prevY) / TILE_SIZE
    const distMeters = distTiles * TILE_LENGTH_METERS
    const usage = (unit.gasConsumption || 0) * distMeters / 100000
    consumeUnitGas(unit, usage)
  }

  if (
    unit.type === 'tankerTruck' &&
    unit.kamikazeMode &&
    unit.kamikazeTargetType === 'building' &&
    unit.kamikazeTargetPoint
  ) {
    const tankerCenterX = unit.x + TILE_SIZE / 2
    const tankerCenterY = unit.y + TILE_SIZE / 2
    const distanceToTarget = Math.hypot(
      unit.kamikazeTargetPoint.x - tankerCenterX,
      unit.kamikazeTargetPoint.y - tankerCenterY
    )

    if (distanceToTarget <= TILE_SIZE * 0.75) {
      const detonated = detonateTankerTruck(unit, units, factories || [], gameState)
      if (detonated) {
        movement.velocity.x = 0
        movement.velocity.y = 0
        if (movement.targetVelocity) {
          movement.targetVelocity.x = 0
          movement.targetVelocity.y = 0
        }
        movement.currentSpeed = 0
        return
      }
    }
  }

  const wrecks = Array.isArray(gameState?.unitWrecks) ? gameState.unitWrecks : []

  const collisionResult = checkUnitCollision(unit, mapGrid, occupancyMap, units, wrecks)

  if (collisionResult.collided) {
    unit.x = prevX
    unit.y = prevY

    if (collisionResult.type === 'wreck') {
      applyWreckCollisionResponse(unit, movement, collisionResult)
    } else if (collisionResult.type === 'unit') {
      const detonated = applyUnitCollisionResponse(
        unit,
        movement,
        collisionResult,
        units,
        factories || [],
        gameState,
        mapGrid,
        occupancyMap,
        wrecks
      )
      if (detonated) {
        movement.velocity.x = 0
        movement.velocity.y = 0
        if (movement.targetVelocity) {
          movement.targetVelocity.x = 0
          movement.targetVelocity.y = 0
        }
        movement.currentSpeed = 0
      }
    } else if (collisionResult.type === 'building') {
      const detonated = applyBuildingCollisionResponse(unit, movement, collisionResult, units, factories || [], gameState)
      if (detonated) {
        movement.velocity.x = 0
        movement.velocity.y = 0
        if (movement.targetVelocity) {
          movement.targetVelocity.x = 0
          movement.targetVelocity.y = 0
        }
        movement.currentSpeed = 0
      } else {
        applyStaticObstacleCollisionResponse(
          unit,
          movement,
          collisionResult,
          attemptedX,
          attemptedY,
          mapGrid,
          occupancyMap,
          units,
          wrecks
        )
      }
    } else if (collisionResult.type === 'terrain' || collisionResult.type === 'bounds') {
      applyStaticObstacleCollisionResponse(
        unit,
        movement,
        collisionResult,
        attemptedX,
        attemptedY,
        mapGrid,
        occupancyMap,
        units,
        wrecks
      )
    } else {
      trySlideMovement(unit, movement, mapGrid, occupancyMap, units, wrecks)
    }
  }

  unit.tileX = Math.floor(unit.x / TILE_SIZE)
  unit.tileY = Math.floor(unit.y / TILE_SIZE)

  unit.tileX = Math.max(0, Math.min(unit.tileX, mapGrid[0].length - 1))
  unit.tileY = Math.max(0, Math.min(unit.tileY, mapGrid.length - 1))
  unit.x = Math.max(0, Math.min(unit.x, (mapGrid[0].length - 1) * TILE_SIZE))
  unit.y = Math.max(0, Math.min(unit.y, (mapGrid.length - 1) * TILE_SIZE))

  const tileChanged = prevTileX !== unit.tileX || prevTileY !== unit.tileY
  if (tileChanged) {
    const buildings = gameState?.buildings || []
    checkMineDetonation(unit, unit.tileX, unit.tileY, units, buildings)
  }

  if (unit.type === 'apache') {
    updateApacheFlightState(unit, movement, occupancyMap, now)
  }

  const currentTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  const currentTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

  if ((prevTileX !== currentTileX || prevTileY !== currentTileY) && occupancyMap) {
    updateUnitOccupancy(unit, prevTileX, prevTileY, occupancyMap)
  }

  if (unit.restorationMoveOverride) {
    const target = unit.restorationMoveTarget || unit.moveTarget
    const noPathRemaining = !unit.path || unit.path.length === 0
    let reachedTarget = false

    if (!target) {
      reachedTarget = noPathRemaining
    } else {
      const targetCenterX = (target.x + 0.5) * TILE_SIZE
      const targetCenterY = (target.y + 0.5) * TILE_SIZE
      const distanceToTarget = Math.hypot((unit.x + TILE_SIZE / 2) - targetCenterX, (unit.y + TILE_SIZE / 2) - targetCenterY)
      const tileDistance = Math.max(Math.abs(currentTileX - target.x), Math.abs(currentTileY - target.y))
      reachedTarget = noPathRemaining && (tileDistance === 0 || distanceToTarget <= TILE_SIZE / 2)
    }

    if (reachedTarget) {
      unit.restorationMoveOverride = false
      unit.restorationMoveTarget = null
      unit.restorationProtectedFromRecovery = false
      if (target && unit.moveTarget && unit.moveTarget.x === target.x && unit.moveTarget.y === target.y) {
        unit.moveTarget = null
      }
      unit.path = []
      unit.movement.velocity = { x: 0, y: 0 }
      unit.movement.targetVelocity = { x: 0, y: 0 }
      unit.movement.isMoving = false
      unit.movement.currentSpeed = 0
    }
  } else if (unit.restorationProtectedFromRecovery) {
    unit.restorationProtectedFromRecovery = false
  }

  handleStuckUnit(unit, mapGrid, occupancyMap, units, gameState, factories)

  if (unit.returningFromWorkshop && (!unit.path || unit.path.length === 0) && !unit.moveTarget) {
    unit.returningFromWorkshop = false
    unit.returnTile = null
  }

  const isTank = unit.type && unit.type.includes('tank')
  if (isTank) {
    const shouldPlayEngineLoop = shouldPlayTankEngineSound(unit, movement)
    if (shouldPlayEngineLoop) {
      if (!unit.engineSound) {
        beginTankEngineLoop(unit)
      } else {
        const { pan, volumeFactor } = calculatePositionalAudio(unit.x, unit.y)
        const targetGain = TANK_ENGINE_LOOP_VOLUME * volumeFactor * getMasterVolume()
        if (unit.engineSound.panner) unit.engineSound.panner.pan.value = pan
        if (unit.engineSound.gainNode) {
          unit.engineSound.gainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.05)
        }
      }
    } else {
      stopTankEngineLoop(unit)
    }
  }
}

function updateUnitRotation(unit) {
  const movement = unit.movement

  const rotationDiff = normalizeAngle(movement.targetRotation - movement.rotation)

  if (Math.abs(rotationDiff) > 0.1) {
    const rotationStep = MOVEMENT_CONFIG.ROTATION_SPEED

    if (rotationDiff > 0) {
      movement.rotation += Math.min(rotationStep, rotationDiff)
    } else {
      movement.rotation -= Math.min(rotationStep, Math.abs(rotationDiff))
    }

    movement.rotation = normalizeAngle(movement.rotation)
  }

  unit.rotation = movement.rotation
}

export function stopUnitMovement(unit) {
  initializeUnitMovement(unit)

  unit.movement.velocity.x = 0
  unit.movement.velocity.y = 0
  unit.movement.targetVelocity.x = 0
  unit.movement.targetVelocity.y = 0
  unit.movement.isMoving = false
  unit.movement.currentSpeed = 0

  stopTankEngineLoop(unit)

  if (unit.path) {
    unit.path = []
  }
}

export function cancelUnitMovement(unit) {
  initializeUnitMovement(unit)

  if (unit.path) {
    unit.path = []
  }

  unit.movement.targetVelocity.x = 0
  unit.movement.targetVelocity.y = 0
  unit.movement.isMoving = false
  unit.moveTarget = null

  if (unit.engineSound) {
    stopLoopedMovementSound(unit.engineSound)
    unit.engineSound = null
  }
}

export function resetUnitVelocityForNewPath(unit) {
  initializeUnitMovement(unit)

  unit.movement.velocity.x = 0
  unit.movement.velocity.y = 0
  unit.movement.currentSpeed = 0
}

export function isUnitMoving(unit) {
  initializeUnitMovement(unit)
  return unit.movement.currentSpeed > MOVEMENT_CONFIG.MIN_SPEED
}
