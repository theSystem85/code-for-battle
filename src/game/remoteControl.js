import {
  TILE_SIZE,
  TANK_FIRE_RANGE,
  STREET_SPEED_MULTIPLIER,
  ENABLE_ENEMY_CONTROL,
  isTurretTankUnitType,
  APACHE_RANGE_REDUCTION
} from '../config.js'
import { fireBullet } from './bulletSystem.js'
import { selectedUnits, getKeyboardHandler } from '../inputHandler.js'
import { gameState } from '../gameState.js'
import { angleDiff, normalizeAngle, smoothRotateTowardsAngle } from '../logic.js'
import { getApacheRocketSpawnPoints } from '../rendering/apacheImageRenderer.js'
import { getPlayableViewportWidth, getPlayableViewportHeight } from '../utils/layoutMetrics.js'

const APACHE_REMOTE_RANGE_MULTIPLIER = 1.5

function clampRangeToViewport(rangePx, centerX, centerY, direction) {
  const scroll = gameState.scrollOffset || { x: 0, y: 0 }
  const screenX = centerX - (scroll.x || 0)
  const screenY = centerY - (scroll.y || 0)
  const gameCanvas = typeof document !== 'undefined'
    ? document.getElementById('gameCanvas')
    : null

  if (!gameCanvas) {
    return rangePx
  }

  const viewportWidth = getPlayableViewportWidth(gameCanvas)
  const viewportHeight = getPlayableViewportHeight(gameCanvas)
  if (!viewportWidth || !viewportHeight) {
    return rangePx
  }

  const cosDir = Math.cos(direction)
  const sinDir = Math.sin(direction)
  const epsilon = 1e-3
  let maxDistance = rangePx

  if (Math.abs(cosDir) > epsilon) {
    const boundaryX = cosDir > 0 ? viewportWidth - screenX : -screenX
    const limit = boundaryX / cosDir
    if (limit > 0) {
      maxDistance = Math.min(maxDistance, limit)
    }
  }

  if (Math.abs(sinDir) > epsilon) {
    const boundaryY = sinDir > 0 ? viewportHeight - screenY : -screenY
    const limit = boundaryY / sinDir
    if (limit > 0) {
      maxDistance = Math.min(maxDistance, limit)
    }
  }

  if (!Number.isFinite(maxDistance)) {
    return rangePx
  }

  return Math.max(0, Math.min(rangePx, maxDistance))
}

function computeApacheRemoteAim(unit, direction) {
  const centerX = unit.x + TILE_SIZE / 2
  const centerY = unit.y + TILE_SIZE / 2
  const baseRange = getApacheRemoteRange(unit)
  const viewportLimitedRange = clampRangeToViewport(baseRange, centerX, centerY, direction)

  const cosDir = Math.cos(direction)
  const sinDir = Math.sin(direction)
  let targetX = centerX + cosDir * viewportLimitedRange
  let targetY = centerY + sinDir * viewportLimitedRange

  const mapGrid = gameState.mapGrid || []
  if (Array.isArray(mapGrid) && mapGrid.length > 0 && Array.isArray(mapGrid[0])) {
    const mapWidth = mapGrid[0].length * TILE_SIZE
    const mapHeight = mapGrid.length * TILE_SIZE
    const minX = TILE_SIZE * 0.5
    const minY = TILE_SIZE * 0.5
    const maxX = Math.max(minX, mapWidth - TILE_SIZE * 0.5)
    const maxY = Math.max(minY, mapHeight - TILE_SIZE * 0.5)
    const clampedX = Math.max(minX, Math.min(targetX, maxX))
    const clampedY = Math.max(minY, Math.min(targetY, maxY))
    targetX = clampedX
    targetY = clampedY
  }

  const actualRange = Math.min(
    viewportLimitedRange,
    Math.hypot(targetX - centerX, targetY - centerY)
  )

  return {
    x: targetX,
    y: targetY,
    tileX: Math.max(0, Math.floor(targetX / TILE_SIZE)),
    tileY: Math.max(0, Math.floor(targetY / TILE_SIZE)),
    range: actualRange
  }
}

function getApacheRemoteRange(unit) {
  let baseRange = TANK_FIRE_RANGE * TILE_SIZE
  if (unit.level >= 1) {
    baseRange *= unit.rangeMultiplier || 1.2
  }
  baseRange *= APACHE_RANGE_REDUCTION
  return baseRange * APACHE_REMOTE_RANGE_MULTIPLIER
}

// Rocket Tank remote range is the same as its normal fire range
function getRocketTankRemoteRange(unit) {
  let baseRange = TANK_FIRE_RANGE * TILE_SIZE
  if (unit.level >= 1) {
    baseRange *= unit.rangeMultiplier || 1.2
  }
  return baseRange
}

// Compute remote aim target for rocket tank (similar to Apache)
function computeRocketTankRemoteAim(unit, direction) {
  const centerX = unit.x + TILE_SIZE / 2
  const centerY = unit.y + TILE_SIZE / 2
  const baseRange = getRocketTankRemoteRange(unit)
  const viewportLimitedRange = clampRangeToViewport(baseRange, centerX, centerY, direction)

  const cosDir = Math.cos(direction)
  const sinDir = Math.sin(direction)
  let targetX = centerX + cosDir * viewportLimitedRange
  let targetY = centerY + sinDir * viewportLimitedRange

  const mapGrid = gameState.mapGrid || []
  if (Array.isArray(mapGrid) && mapGrid.length > 0 && Array.isArray(mapGrid[0])) {
    const mapWidth = mapGrid[0].length * TILE_SIZE
    const mapHeight = mapGrid.length * TILE_SIZE
    const minX = TILE_SIZE * 0.5
    const minY = TILE_SIZE * 0.5
    const maxX = Math.max(minX, mapWidth - TILE_SIZE * 0.5)
    const maxY = Math.max(minY, mapHeight - TILE_SIZE * 0.5)
    const clampedX = Math.max(minX, Math.min(targetX, maxX))
    const clampedY = Math.max(minY, Math.min(targetY, maxY))
    targetX = clampedX
    targetY = clampedY
  }

  const actualRange = Math.min(
    viewportLimitedRange,
    Math.hypot(targetX - centerX, targetY - centerY)
  )

  return {
    x: targetX,
    y: targetY,
    tileX: Math.max(0, Math.floor(targetX / TILE_SIZE)),
    tileY: Math.max(0, Math.floor(targetY / TILE_SIZE)),
    range: actualRange
  }
}

let lastAutoFocusUnitId = null
let autoFocusSuppressed = false
let autoFocusResumeArmed = false

export function suspendRemoteControlAutoFocus() {
  if (
    !gameState.cameraFollowUnitId ||
    gameState.cameraFollowUnitId !== lastAutoFocusUnitId
  ) {
    return
  }

  autoFocusSuppressed = true
  autoFocusResumeArmed = false
  lastAutoFocusUnitId = null
  gameState.cameraFollowUnitId = null
}

function ensureAutoFocusForRemoteControl(mapGrid) {
  if (!selectedUnits || selectedUnits.length !== 1) {
    lastAutoFocusUnitId = null
    autoFocusSuppressed = false
    autoFocusResumeArmed = false
    return
  }

  const [unit] = selectedUnits
  if (!unit) {
    lastAutoFocusUnitId = null
    autoFocusSuppressed = false
    autoFocusResumeArmed = false
    return
  }

  if (autoFocusSuppressed) {
    return
  }

  if (gameState.cameraFollowUnitId === unit.id) {
    lastAutoFocusUnitId = unit.id
    return
  }

  if (lastAutoFocusUnitId === unit.id) {
    return
  }

  const keyboardHandler = getKeyboardHandler ? getKeyboardHandler() : null
  if (!keyboardHandler || typeof keyboardHandler.toggleAutoFocus !== 'function') {
    return
  }

  keyboardHandler.toggleAutoFocus(selectedUnits, mapGrid)
  if (gameState.cameraFollowUnitId === unit.id) {
    lastAutoFocusUnitId = unit.id
  }
}

function getFireRateForUnit(unit) {
  if (unit.type === 'rocketTank') return 12000
  return 4000
}

function getTargetCenter(target) {
  if (!target) return null

  if (target.tileX !== undefined) {
    return {
      x: target.x + TILE_SIZE / 2,
      y: target.y + TILE_SIZE / 2
    }
  }

  if (target.width !== undefined && target.height !== undefined) {
    return {
      x: target.x * TILE_SIZE + (target.width * TILE_SIZE) / 2,
      y: target.y * TILE_SIZE + (target.height * TILE_SIZE) / 2
    }
  }

  return null
}

function aimTurretAtTarget(unit, target) {
  if (!target) return
  if (target.health !== undefined && target.health <= 0) return

  const targetCenter = getTargetCenter(target)
  if (!targetCenter) return

  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2
  const desiredAngle = Math.atan2(targetCenter.y - unitCenterY, targetCenter.x - unitCenterX)

  if (unit.crew && typeof unit.crew === 'object' && !unit.crew.gunner) {
    unit.turretDirection = unit.direction || 0
    return
  }

  const currentAngle =
    unit.turretDirection !== undefined ? unit.turretDirection : unit.direction || 0
  const rotationSpeed = unit.turretRotationSpeed || unit.rotationSpeed || 0.05
  unit.turretDirection = smoothRotateTowardsAngle(currentAngle, desiredAngle, rotationSpeed)
  unit.turretShouldFollowMovement = false
}

function handleApacheRemoteControl(unit, params) {
  const {
    forwardIntensity,
    backwardIntensity,
    turnLeftIntensity,
    turnRightIntensity,
    ascendIntensity,
    descendIntensity,
    strafeLeftIntensity,
    strafeRightIntensity,
    rawWagonDirection,
    rawWagonSpeed,
    fireIntensity = 0
  } = params

  if (!unit.movement) {
    unit.remoteControlActive = false
    return
  }

  const rotationSpeed = (unit.rotationSpeed || 0.05) * 0.25
  const baseSpeed = typeof unit.speed === 'number' ? unit.speed : 0.5
  const speedModifier = typeof unit.speedModifier === 'number' ? unit.speedModifier : 1
  const effectiveMaxSpeed = Math.max(0, baseSpeed * speedModifier)

  const ascendActive = ascendIntensity > 0.05
  const descendActive = descendIntensity > 0.05
  const strafeAxis = (strafeRightIntensity || 0) - (strafeLeftIntensity || 0)
  const movementAxis = (forwardIntensity || 0) - (backwardIntensity || 0)
  const netTurn = (turnRightIntensity || 0) - (turnLeftIntensity || 0)
  const absoluteMovementActive = rawWagonDirection !== null && rawWagonSpeed > 0

  let targetVx = 0
  let targetVy = 0
  let movementRequested = false

  if (absoluteMovementActive) {
    const desiredDirection = normalizeAngle(rawWagonDirection)
    const currentDirection = typeof unit.direction === 'number' ? unit.direction : 0
    unit.direction = smoothRotateTowardsAngle(currentDirection, desiredDirection, rotationSpeed)

    const magnitude = Math.max(0, Math.min(rawWagonSpeed, 1))
    if (magnitude > 0.001) {
      targetVx += Math.cos(unit.direction) * effectiveMaxSpeed * magnitude
      targetVy += Math.sin(unit.direction) * effectiveMaxSpeed * magnitude
      movementRequested = true
    }
  } else if (netTurn) {
    const currentDirection = typeof unit.direction === 'number' ? unit.direction : 0
    unit.direction = normalizeAngle(currentDirection + rotationSpeed * netTurn)
  }

  if (!absoluteMovementActive && Math.abs(movementAxis) > 0.001) {
    const directionSign = movementAxis > 0 ? 1 : -1
    const magnitude = Math.min(Math.abs(movementAxis), 1)
    const direction = typeof unit.direction === 'number' ? unit.direction : 0
    targetVx += Math.cos(direction) * effectiveMaxSpeed * directionSign * magnitude
    targetVy += Math.sin(direction) * effectiveMaxSpeed * directionSign * magnitude
    movementRequested = true
  }

  if (Math.abs(strafeAxis) > 0.05) {
    const canStrafe =
      unit.flightState !== 'grounded' || ascendActive || unit.manualFlightState === 'takeoff'
    if (canStrafe) {
      const direction = typeof unit.direction === 'number' ? unit.direction : 0
      const strafeAngle = direction + (strafeAxis > 0 ? Math.PI / 2 : -Math.PI / 2)
      const magnitude = Math.min(Math.abs(strafeAxis), 1)
      targetVx += Math.cos(strafeAngle) * effectiveMaxSpeed * magnitude
      targetVy += Math.sin(strafeAngle) * effectiveMaxSpeed * magnitude
      movementRequested = true
    }
  }

  const hasMovementInput =
    absoluteMovementActive ||
    Math.abs(movementAxis) > 0.001 ||
    Math.abs(netTurn) > 0.001 ||
    Math.abs(strafeAxis) > 0.05
  const hasFlightInput = ascendActive || descendActive
  const remoteActive = hasMovementInput || hasFlightInput
  const landingInProgress = Boolean(
    unit.helipadLandingRequested ||
    unit.flightPlan?.mode === 'helipad' ||
    unit.landedHelipadId
  )
  unit.remoteControlActive = remoteActive

  if (landingInProgress && !remoteActive && !descendActive) {
    unit.remoteControlActive = false
    if (!unit.remoteFireCommandActive) {
      unit.remoteRocketTarget = null
      unit.remoteReticleVisible = false
    }
    return
  }

  if (unit.remoteControlActive && !unit.hasUsedRemoteControl) {
    unit.hasUsedRemoteControl = true
  }

  if (remoteActive) {
    unit.flightPlan = null
    unit.helipadLandingRequested = false
    unit.groundLandingRequested = false
    unit.groundLandingTarget = null
    unit.helipadTargetId = null
    unit.autoHoldAltitude = !descendActive
  }

  if (remoteActive) {
    unit.path = []
    unit.moveTarget = null
  }

  if (remoteActive && !descendActive && unit.flightState !== 'grounded') {
    unit.manualFlightHoverRequested = true
  }

  if (ascendActive || (remoteActive && unit.flightState === 'grounded' && !descendActive)) {
    if (unit.type === 'f35') unit.commandIntent = 'move'
    unit.manualFlightHoverRequested = true
    unit.manualFlightState = 'takeoff'
    unit.autoHoldAltitude = true
  } else if (descendActive) {
    if (unit.type === 'f35') unit.commandIntent = 'explicitLand'
    unit.manualFlightHoverRequested = false
    unit.manualFlightState = 'land'
    unit.autoHoldAltitude = false
  } else if (unit.manualFlightHoverRequested && unit.flightState !== 'grounded') {
    if (unit.type === 'f35') unit.commandIntent = 'move'
    unit.manualFlightState = 'hover'
    unit.autoHoldAltitude = true
  } else if (!remoteActive && unit.flightState === 'grounded') {
    unit.manualFlightHoverRequested = false
    unit.manualFlightState = 'auto'
  }

  if (movementRequested) {
    unit.movement.targetVelocity.x = targetVx
    unit.movement.targetVelocity.y = targetVy
    unit.movement.isMoving = true
  } else {
    unit.movement.targetVelocity.x = 0
    unit.movement.targetVelocity.y = 0
    unit.movement.isMoving = false
  }

  const direction = typeof unit.direction === 'number' ? unit.direction : 0
  unit.movement.rotation = direction
  unit.movement.targetRotation = direction

  if (remoteActive || fireIntensity > 0) {
    const aimTarget = computeApacheRemoteAim(unit, direction)
    if (Number.isFinite(aimTarget.x) && Number.isFinite(aimTarget.y)) {
      unit.remoteRocketTarget = aimTarget
      unit.remoteReticleVisible = true
    } else {
      unit.remoteRocketTarget = null
      unit.remoteReticleVisible = false
    }
  } else if (!unit.remoteFireCommandActive) {
    unit.remoteRocketTarget = null
    unit.remoteReticleVisible = false
  }
}

export function updateRemoteControlledUnits(units, bullets, mapGrid, occupancyMap) {
  const rc = gameState.remoteControl
  if (!rc) return
  if (!selectedUnits || selectedUnits.length === 0) {
    lastAutoFocusUnitId = null
    return
  }

  const now = performance.now()
  const forwardIntensity = rc.forward || 0
  const backwardIntensity = rc.backward || 0
  const turnLeftIntensity = rc.turnLeft || 0
  const turnRightIntensity = rc.turnRight || 0
  const turretLeftIntensity = rc.turretLeft || 0
  const turretRightIntensity = rc.turretRight || 0
  const fireIntensity = rc.fire || 0
  const ascendIntensity = rc.ascend || 0
  const descendIntensity = rc.descend || 0
  const strafeLeftIntensity = rc.strafeLeft || 0
  const strafeRightIntensity = rc.strafeRight || 0
  const rcAbsolute = gameState.remoteControlAbsolute || {}
  const rawWagonDirection =
    Number.isFinite(rcAbsolute.wagonDirection) ? rcAbsolute.wagonDirection : null
  const rawWagonSpeed = typeof rcAbsolute.wagonSpeed === 'number' ? rcAbsolute.wagonSpeed : 0
  const rawTurretDirection =
    Number.isFinite(rcAbsolute.turretDirection) ? rcAbsolute.turretDirection : null
  const rawTurretTurnFactor =
    typeof rcAbsolute.turretTurnFactor === 'number' ? rcAbsolute.turretTurnFactor : 0
  const remoteControlEngaged =
    forwardIntensity > 0 ||
    backwardIntensity > 0 ||
    turnLeftIntensity > 0 ||
    turnRightIntensity > 0 ||
    turretLeftIntensity > 0 ||
    turretRightIntensity > 0 ||
    fireIntensity > 0 ||
    ascendIntensity > 0 ||
    descendIntensity > 0 ||
    strafeLeftIntensity > 0 ||
    strafeRightIntensity > 0 ||
    rawWagonSpeed > 0 ||
    rawTurretTurnFactor > 0

  if (remoteControlEngaged) {
    if (autoFocusSuppressed && autoFocusResumeArmed) {
      autoFocusSuppressed = false
      autoFocusResumeArmed = false
    }

    if (!autoFocusSuppressed) {
      ensureAutoFocusForRemoteControl(mapGrid)
    }
  } else {
    if (autoFocusSuppressed) {
      autoFocusResumeArmed = true
    }

    if (!gameState.cameraFollowUnitId) {
      lastAutoFocusUnitId = null
      autoFocusSuppressed = false
      autoFocusResumeArmed = false
    }
  }

  selectedUnits.forEach(unit => {
    if (!unit || !unit.movement) return

    const hasTurret = isTurretTankUnitType(unit.type)
    const isApache = unit.type === 'apache' || unit.type === 'f35'
    const isTouchLayout = typeof document !== 'undefined' && document.body?.classList.contains('is-touch')

    // Only allow remote control for player units unless enemy control is enabled
    const humanPlayer = gameState.humanPlayer || 'player1'
    const isPlayerUnit =
      unit.owner === humanPlayer || (humanPlayer === 'player1' && unit.owner === 'player')
    if (!isPlayerUnit && !ENABLE_ENEMY_CONTROL) {
      return
    }

    const absoluteMovementActive =
      hasTurret && rawWagonDirection !== null && rawWagonSpeed > 0
    const hasMovementInput =
      absoluteMovementActive ||
      forwardIntensity > 0 ||
      backwardIntensity > 0 ||
      turnLeftIntensity > 0 ||
      turnRightIntensity > 0
    const hasTurretInput =
      hasTurret && ((rawTurretDirection !== null && rawTurretTurnFactor > 0) || turretLeftIntensity > 0 || turretRightIntensity > 0)
    const hasRemoteCommandInput = hasMovementInput || hasTurretInput || fireIntensity > 0

    if (isApache) {
      const landingInProgress = Boolean(unit.helipadLandingRequested || unit.flightPlan?.mode === 'helipad' || unit.landedHelipadId)
      const landingOverrideThreshold = landingInProgress && isTouchLayout ? 0.2 : 0
      const effectiveWagonSpeed = rawWagonSpeed > landingOverrideThreshold ? rawWagonSpeed : 0
      const effectiveWagonDirection = effectiveWagonSpeed > 0 ? rawWagonDirection : null
      const apacheAbsoluteActive = effectiveWagonDirection !== null && effectiveWagonSpeed > 0
      const apacheHasMovementInput =
        apacheAbsoluteActive ||
        forwardIntensity > landingOverrideThreshold ||
        backwardIntensity > landingOverrideThreshold ||
        turnLeftIntensity > landingOverrideThreshold ||
        turnRightIntensity > landingOverrideThreshold ||
        strafeLeftIntensity > landingOverrideThreshold ||
        strafeRightIntensity > landingOverrideThreshold ||
        ascendIntensity > landingOverrideThreshold ||
        descendIntensity > landingOverrideThreshold

      if (apacheHasMovementInput) {
        unit.path = []
        unit.moveTarget = null
        unit.remoteControlActive = true
        unit.lastRemoteControlTime = now
        unit.lastPlayerCommandTime = now
      } else {
        unit.remoteControlActive = false
      }

      handleApacheRemoteControl(unit, {
        forwardIntensity,
        backwardIntensity,
        turnLeftIntensity,
        turnRightIntensity,
        ascendIntensity,
        descendIntensity,
        strafeLeftIntensity,
        strafeRightIntensity,
        rawWagonDirection: effectiveWagonDirection,
        rawWagonSpeed: effectiveWagonSpeed,
        fireIntensity
      })

      const firePressed = fireIntensity > 0
      const previouslyPressed = Boolean(unit.remoteFireCommandActive)
      unit.remoteFireCommandActive = firePressed

      if (firePressed && !previouslyPressed && unit.canFire !== false) {
        const ammoRemaining = Math.max(0, Math.floor(unit.rocketAmmo || 0))
        if (ammoRemaining > 0 && (!unit.lastShotTime || now - unit.lastShotTime >= 300)) {
          const direction = unit.direction || 0
          const aimTarget = unit.remoteRocketTarget || computeApacheRemoteAim(unit, direction)
          const target = {
            tileX: aimTarget.tileX,
            tileY: aimTarget.tileY,
            x: aimTarget.x,
            y: aimTarget.y
          }

          const centerX = unit.x + TILE_SIZE / 2
          const centerY = unit.y + TILE_SIZE / 2
          const spawnPoints = getApacheRocketSpawnPoints(unit, centerX, centerY)
          const spawn = spawnPoints.left || { x: centerX, y: centerY }

          unit.customRocketSpawn = spawn
          const fired = fireBullet(unit, target, bullets, now)
          unit.customRocketSpawn = null

          if (fired) {
            unit.lastShotTime = now
            unit.rocketAmmo = Math.max(0, (unit.rocketAmmo || 0) - 1)
            unit.apacheAmmoEmpty = unit.rocketAmmo <= 0
            if (unit.apacheAmmoEmpty) {
              unit.canFire = false
            }
            unit.remoteReticleVisible = true
          }
        }
      } else if (!firePressed && !unit.remoteControlActive) {
        unit.remoteReticleVisible = false
      }

      return
    }
    if (unit.crew && typeof unit.crew === 'object' && !unit.crew.commander) {
      unit.remoteControlActive = false
      return
    }

    // Units without fuel cannot be remote controlled
    if (unit.gas !== undefined && unit.gas <= 0) {
      unit.remoteControlActive = false
      return
    }

    // Cancel pathing when using remote control
    if (hasMovementInput) {
      unit.path = []
      unit.moveTarget = null
    }

    // Track whether this unit is actively being moved via remote control
    unit.remoteControlActive = !!hasMovementInput
    if (hasRemoteCommandInput) {
      unit.lastRemoteControlTime = now
      if (unit.type === 'harvester' && hasMovementInput) {
        unit.lastPlayerCommandTime = now
      }
    }

    if (unit.remoteControlActive && !unit.hasUsedRemoteControl) {
      unit.hasUsedRemoteControl = true
    }

    // Adjust rotation of the wagon directly so movement aligns with it
    const rotationSpeed = unit.rotationSpeed || 0.05
    let absoluteMovementDirectionSign = 1
    if (absoluteMovementActive) {
      const desiredDirection = normalizeAngle(rawWagonDirection)
      const currentDirection = unit.direction || 0
      let targetDirection = desiredDirection

      const reverseDirection = normalizeAngle(desiredDirection + Math.PI)
      const frontDiff = angleDiff(currentDirection, desiredDirection)
      const backDiff = angleDiff(currentDirection, reverseDirection)

      if (backDiff + 0.0001 < frontDiff) {
        targetDirection = reverseDirection
        absoluteMovementDirectionSign = -1
      }

      unit.direction = smoothRotateTowardsAngle(currentDirection, targetDirection, rotationSpeed)
    } else {
      const netTurn = turnRightIntensity - turnLeftIntensity
      if (netTurn) {
        unit.direction = normalizeAngle((unit.direction || 0) + rotationSpeed * netTurn)
      }
    }

    // Manual turret rotation when shift-modified keys are used
    const turretSpeed = unit.turretRotationSpeed || unit.rotationSpeed || 0.05
    const absoluteTurretActive =
      hasTurret && rawTurretDirection !== null && rawTurretTurnFactor > 0
    const netTurret = turretRightIntensity - turretLeftIntensity
    if (hasTurret && absoluteTurretActive) {
      const current =
        unit.turretDirection !== undefined ? unit.turretDirection : unit.direction
      const desiredTurret = normalizeAngle(rawTurretDirection)
      const rotationRate = turretSpeed * Math.max(0, Math.min(rawTurretTurnFactor, 1))
      unit.turretDirection = smoothRotateTowardsAngle(current, desiredTurret, rotationRate)
      unit.turretShouldFollowMovement = false
      unit.manualTurretOverrideUntil = now + 150
    } else if (hasTurret && netTurret) {
      const current =
        unit.turretDirection !== undefined ? unit.turretDirection : unit.direction
      unit.turretDirection = normalizeAngle(current + turretSpeed * netTurret)
      unit.turretShouldFollowMovement = false
      unit.manualTurretOverrideUntil = now + 150
    }

    const manualTurretInput =
      hasTurret &&
      (absoluteTurretActive || turretLeftIntensity > 0 || turretRightIntensity > 0)
    if (!manualTurretInput && hasTurret && unit.manualTurretOverrideUntil && now >= unit.manualTurretOverrideUntil) {
      unit.manualTurretOverrideUntil = null
    }

    const manualOverrideActive =
      manualTurretInput || (hasTurret && unit.manualTurretOverrideUntil && now < unit.manualTurretOverrideUntil)

    // Keep movement rotation in sync with wagon direction
    unit.movement.rotation = unit.direction
    unit.movement.targetRotation = unit.direction

    // Compute effective max speed similar to unified movement
    const speedModifier = unit.speedModifier || 1
    const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
    const onStreet = mapGrid[tileY] && mapGrid[tileY][tileX] && mapGrid[tileY][tileX].type === 'street'
    let terrainMultiplier = onStreet ? STREET_SPEED_MULTIPLIER : 1
    if (unit.type === 'ambulance' && onStreet) {
      const props = unit.ambulanceProps || { streetSpeedMultiplier: 6.0 }
      terrainMultiplier = props.streetSpeedMultiplier || 6.0
    } else if (unit.type === 'rocketTank' && onStreet) {
      // Rocket tanks are 30% faster on streets than regular tanks
      terrainMultiplier = STREET_SPEED_MULTIPLIER * 1.3
    }
    const effectiveMaxSpeed = 0.9 * speedModifier * terrainMultiplier

    // Move forward/backward relative to wagon direction
    if (absoluteMovementActive) {
      const movementMagnitude = Math.max(0, Math.min(rawWagonSpeed, 1))
      const fx = Math.cos(unit.direction)
      const fy = Math.sin(unit.direction)

      const checkDistance = TILE_SIZE
      const checkX =
        unit.x + TILE_SIZE / 2 + fx * checkDistance * absoluteMovementDirectionSign
      const checkY =
        unit.y + TILE_SIZE / 2 + fy * checkDistance * absoluteMovementDirectionSign
      const nextTileX = Math.floor(checkX / TILE_SIZE)
      const nextTileY = Math.floor(checkY / TILE_SIZE)
      const currentTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
      const currentTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
      const occupied =
        occupancyMap &&
        occupancyMap[nextTileY] &&
        occupancyMap[nextTileY][nextTileX] &&
        !(nextTileX === currentTileX && nextTileY === currentTileY)

      if (!occupied) {
        unit.movement.targetVelocity.x =
          fx * effectiveMaxSpeed * movementMagnitude * absoluteMovementDirectionSign
        unit.movement.targetVelocity.y =
          fy * effectiveMaxSpeed * movementMagnitude * absoluteMovementDirectionSign
        unit.movement.isMoving = movementMagnitude > 0
      } else {
        unit.movement.targetVelocity.x = 0
        unit.movement.targetVelocity.y = 0
        unit.movement.isMoving = false
      }
    } else {
      const movementAxis = forwardIntensity - backwardIntensity
      if (movementAxis) {
        const directionSign = movementAxis > 0 ? 1 : -1
        const movementMagnitude = Math.min(Math.abs(movementAxis), 1)
        const fx = Math.cos(unit.direction)
        const fy = Math.sin(unit.direction)

        // Check the tile one tile ahead (or behind) for occupancy
        const checkDistance = TILE_SIZE
        const checkX = unit.x + TILE_SIZE / 2 + fx * checkDistance * directionSign
        const checkY = unit.y + TILE_SIZE / 2 + fy * checkDistance * directionSign
        const nextTileX = Math.floor(checkX / TILE_SIZE)
        const nextTileY = Math.floor(checkY / TILE_SIZE)
        const currentTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
        const currentTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
        const occupied =
          occupancyMap &&
          occupancyMap[nextTileY] &&
          occupancyMap[nextTileY][nextTileX] &&
          !(nextTileX === currentTileX && nextTileY === currentTileY)

        if (!occupied) {
          unit.movement.targetVelocity.x = fx * effectiveMaxSpeed * directionSign * movementMagnitude
          unit.movement.targetVelocity.y = fy * effectiveMaxSpeed * directionSign * movementMagnitude
          unit.movement.isMoving = true
        } else {
          unit.movement.targetVelocity.x = 0
          unit.movement.targetVelocity.y = 0
          unit.movement.isMoving = false
        }
      } else {
        unit.movement.targetVelocity.x = 0
        unit.movement.targetVelocity.y = 0
        unit.movement.isMoving = false
      }
    }

    if (hasTurret && unit.target && !manualOverrideActive) {
      aimTurretAtTarget(unit, unit.target)
    }

    // Handle remote control aim reticle and firing for rocket tanks
    const isRocketTank = unit.type === 'rocketTank'
    if (isRocketTank) {
      // Track remote control activity
      const remoteControlActive = hasMovementInput || manualTurretInput || fireIntensity > 0
      unit.remoteControlActive = remoteControlActive

      if (unit.remoteControlActive && !unit.hasUsedRemoteControl) {
        unit.hasUsedRemoteControl = true
      }
      if (remoteControlActive) {
        unit.lastRemoteControlTime = now
      }

      // Determine aim target: use selected target if available, otherwise use forward direction
      let aimTarget = null
      let targetDir = unit.movement.rotation

      if (unit.target && unit.target.health > 0) {
        // Use selected target's current position
        const targetCenterX = unit.target.x + TILE_SIZE / 2
        const targetCenterY = unit.target.y + TILE_SIZE / 2
        const centerX = unit.x + TILE_SIZE / 2
        const centerY = unit.y + TILE_SIZE / 2
        targetDir = Math.atan2(targetCenterY - centerY, targetCenterX - centerX)

        // Create aim target at the selected unit's position
        aimTarget = {
          x: targetCenterX,
          y: targetCenterY,
          tileX: Math.floor(targetCenterX / TILE_SIZE),
          tileY: Math.floor(targetCenterY / TILE_SIZE),
          range: Math.hypot(targetCenterX - centerX, targetCenterY - centerY)
        }
      } else {
        // Clear dead target
        if (unit.target && unit.target.health <= 0) {
          unit.target = null
        }
        // No target: compute aim direction based on current rotation
        const dir = unit.movement.rotation
        aimTarget = computeRocketTankRemoteAim(unit, dir)
        targetDir = dir
      }

      if (Number.isFinite(aimTarget.x) && Number.isFinite(aimTarget.y)) {
        unit.remoteRocketTarget = aimTarget
        // Show reticle only up to 1s after remote control ends
        const timeSinceLastControl = unit.lastRemoteControlTime ? (now - unit.lastRemoteControlTime) : Infinity
        unit.remoteReticleVisible = timeSinceLastControl <= 1000
      } else {
        unit.remoteRocketTarget = null
        unit.remoteReticleVisible = false
      }

      // Rotate unit towards remote rocket target - use fast rotation for immediate response
      if (unit.remoteRocketTarget) {
        const _centerX = unit.x + TILE_SIZE / 2
        const _centerY = unit.y + TILE_SIZE / 2

        // If there's a selected target, rotate immediately and aggressively towards it
        // Otherwise, smoothly rotate in the current direction
        let rotationSpeed = unit.rotationSpeed || 0.1
        if (unit.target && unit.target.health > 0) {
          // Fast rotation towards selected target (10x normal speed)
          rotationSpeed = Math.max(0.5, rotationSpeed * 10)
        }

        unit.movement.rotation = smoothRotateTowardsAngle(
          unit.movement.rotation,
          targetDir,
          rotationSpeed
        )

        // Check if unit is facing the target (within 5 degrees)
        const angleDifference = Math.abs(angleDiff(unit.movement.rotation, targetDir))
        const isFacingTarget = angleDifference < (5 * Math.PI / 180)

        // Store facing state and fire when ready
        unit.isFacingRemoteTarget = isFacingTarget
      }

      // Fire rocket burst when space is pressed OR when unit is reloaded and has a target
      const shouldFire =
        fireIntensity > 0 ||
        (remoteControlActive && unit.remoteRocketTarget && unit.isFacingRemoteTarget)
      if (shouldFire && unit.canFire !== false) {
        const baseRate = getFireRateForUnit(unit)
        const effectiveRate = unit.level >= 3 ? baseRate / (unit.fireRateMultiplier || 1.33) : baseRate

        // Check if we need to start a new burst or continue existing one
        if (!unit.burstState) {
          // Start new burst if cooldown has passed
          if (!unit.lastShotTime || now - unit.lastShotTime >= effectiveRate) {
            // Check ammunition
            const hasAmmo = unit.ammunition === undefined || unit.ammunition > 0
            if (hasAmmo && unit.isFacingRemoteTarget) {
              // Fire as many rockets as we have ammo for, up to 4
              const rocketsToFire = typeof unit.ammunition === 'number'
                ? Math.min(4, unit.ammunition)
                : 4
              // Start burst - don't set lastShotTime yet, only after burst completes
              unit.burstState = {
                rocketsToFire: rocketsToFire,
                lastRocketTime: 0,
                remoteControlTarget: {
                  tileX: aimTarget.tileX,
                  tileY: aimTarget.tileY,
                  x: aimTarget.x,
                  y: aimTarget.y
                }
              }
            }
          }
        } else {
          // Continue existing burst (fire remaining rockets)
          if (unit.burstState.rocketsToFire > 0 &&
              now - unit.burstState.lastRocketTime >= 200) { // 200ms delay between rockets
            const target = unit.burstState.remoteControlTarget
            // Only fire if we have a valid remote control target (burst may have been started by normal combat)
            if (target) {
              fireBullet(unit, target, bullets, now)
              unit.burstState.rocketsToFire--
              unit.burstState.lastRocketTime = now

              if (unit.burstState.rocketsToFire <= 0) {
                unit.burstState = null // Reset burst state
                unit.lastShotTime = now // Set cooldown for next burst - reload phase begins now
              }
            } else {
              // Burst was started by normal combat, not remote control - clear it and let normal combat handle it
              // Or if in remote control mode, reinitialize with current aim target
              if (aimTarget) {
                unit.burstState.remoteControlTarget = {
                  tileX: aimTarget.tileX,
                  tileY: aimTarget.tileY,
                  x: aimTarget.x,
                  y: aimTarget.y
                }
              }
            }
          }
        }
      }
    } else if (hasTurret && fireIntensity > 0 && unit.canFire !== false) {
      // Fire forward when requested (for non-rocket tank turret units)
      const baseRate = getFireRateForUnit(unit)
      const effectiveRate =
        unit.level >= 3 ? baseRate / (unit.fireRateMultiplier || 1.33) : baseRate

      if (!unit.lastShotTime || now - unit.lastShotTime >= effectiveRate) {
        const rangePx = TANK_FIRE_RANGE * TILE_SIZE
        const dir =
          unit.turretDirection !== undefined
            ? unit.turretDirection
            : unit.movement.rotation
        const tx = unit.x + TILE_SIZE / 2 + Math.cos(dir) * rangePx
        const ty = unit.y + TILE_SIZE / 2 + Math.sin(dir) * rangePx
        const target = {
          tileX: Math.floor(tx / TILE_SIZE),
          tileY: Math.floor(ty / TILE_SIZE),
          x: tx,
          y: ty
        }
        fireBullet(unit, target, bullets, now)
      }
    }

    // Clear reticle for non-rocket tank turret units
    if (!isRocketTank && hasTurret) {
      unit.remoteReticleVisible = false
      unit.remoteRocketTarget = null
    }
  })

  rc.fire = 0
}
