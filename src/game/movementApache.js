import { TILE_SIZE, TILE_LENGTH_METERS } from '../config.js'
import { removeUnitOccupancy } from '../units.js'
import { playPositionalSound, audioContext, getMasterVolume } from '../sound.js'
import { calculatePositionalAudio, consumeUnitGas } from './movementHelpers.js'
import { BASE_FRAME_SECONDS, MOVEMENT_CONFIG } from './movementConstants.js'
import { canF35StartLanding } from './f35Behavior.js'

const ROTOR_AIRBORNE_SPEED = 0.35
const ROTOR_GROUNDED_SPEED = 0
const ROTOR_SPINUP_RESPONSE = 4
const ROTOR_SPINDOWN_RESPONSE = 1.5
const ROTOR_STOP_EPSILON = 0.002
const APACHE_ROTOR_LOOP_VOLUME = 0.25
const APACHE_ROTOR_ALTITUDE_GAIN_MIN = 0.6
const APACHE_ROTOR_ALTITUDE_GAIN_MAX = 1.0
const APACHE_ROTOR_STOP_FADE_SECONDS = 0.05

function shouldPlayApacheRotorSound(unit) {
  return Boolean(
    unit.type === 'apache' &&
    unit.health > 0 &&
    !unit.destroyed &&
    unit.flightState &&
    unit.flightState !== 'grounded'
  )
}

function stopApacheRotorSound(unit, { immediate = false } = {}) {
  unit.rotorSoundRequestId = (unit.rotorSoundRequestId || 0) + 1

  if (!unit.rotorSound) {
    unit.rotorSound = null
    unit.rotorSoundLoading = false
    return
  }

  const { source, gainNode } = unit.rotorSound
  const stopDelay = immediate ? 0 : APACHE_ROTOR_STOP_FADE_SECONDS

  if (gainNode && audioContext) {
    gainNode.gain.cancelScheduledValues(audioContext.currentTime)
    gainNode.gain.setValueAtTime(gainNode.gain.value, audioContext.currentTime)
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + stopDelay)
  }

  if (source) {
    try {
      if (audioContext) {
        source.stop(audioContext.currentTime + stopDelay)
      } else {
        source.stop()
      }
    } catch (e) {
      console.error('Failed to stop apache rotor sound:', e)
    }
  }

  unit.rotorSound = null
  unit.rotorSoundLoading = false
}

function addUnitOccupancyDirect(unit, occupancyMap) {
  if (!occupancyMap) return
  const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
  if (
    tileX >= 0 &&
    tileY >= 0 &&
    tileY < occupancyMap.length &&
    tileX < occupancyMap[0].length
  ) {
    occupancyMap[tileY][tileX] = (occupancyMap[tileY][tileX] || 0) + 1
  }
}

export function updateApacheFlightState(unit, movement, occupancyMap, now) {
  const rotor = unit.rotor || { angle: 0, speed: 0, targetSpeed: 0 }
  unit.rotor = rotor
  const shadow = unit.shadow || { offset: 0, scale: 1 }
  unit.shadow = shadow

  const deltaMs = Math.max(16, now - (unit.lastFlightUpdate || now))
  unit.lastFlightUpdate = now
  const deltaSeconds = deltaMs / 1000

  let manualState = unit.manualFlightState || 'auto'
  let landingBlocked = false
  const hasGroundLandingRequest = Boolean(unit.type === 'f35' && unit.groundLandingRequested && unit.groundLandingTarget)

  if (unit.type === 'f35' && !canF35StartLanding(unit) && manualState === 'land') {
    manualState = 'auto'
  }

  if (hasGroundLandingRequest && unit.groundLandingTarget && canF35StartLanding(unit)) {
    const centerX = unit.x + TILE_SIZE / 2
    const centerY = unit.y + TILE_SIZE / 2
    const targetDistance = Math.hypot(centerX - unit.groundLandingTarget.x, centerY - unit.groundLandingTarget.y)
    const stopRadius = Math.max(8, unit.flightPlan?.stopRadius || TILE_SIZE * 0.35)
    if (targetDistance <= stopRadius) {
      manualState = 'land'
    }
  }

  if (manualState === 'land' && occupancyMap) {
    const centerTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const centerTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

    const row =
      centerTileY >= 0 && centerTileY < occupancyMap.length
        ? occupancyMap[centerTileY]
        : null

    if (row && centerTileX >= 0 && centerTileX < row.length) {
      const occupancy = row[centerTileX] || 0
      const helipadLandingActive = Boolean((unit.helipadLandingRequested && canF35StartLanding(unit)) || unit.landedHelipadId || (hasGroundLandingRequest && canF35StartLanding(unit)))

      landingBlocked = occupancy > 0 && !helipadLandingActive
      if (landingBlocked) {
        manualState = 'hover'
        unit.manualFlightState = 'hover'
        unit.autoHoldAltitude = true
      }
    }
  }

  if (!landingBlocked && unit.blockedFromLanding) {
    unit.blockedFromLanding = false
  } else if (landingBlocked) {
    unit.blockedFromLanding = true
  }

  // Check if the helicopter is stably landed on a helipad
  const isGroundedOnHelipad = unit.flightState === 'grounded' && Boolean(unit.landedHelipadId)

  const holdAltitude = Boolean(unit.autoHoldAltitude) || Boolean(unit.flightPlan) || Boolean(unit.remoteControlActive)
  // Don't consider moveTarget as "in motion" if we're grounded on a helipad
  const isInMotion = Boolean(movement?.isMoving) || (unit.path && unit.path.length > 0) || (Boolean(unit.moveTarget) && !isGroundedOnHelipad)

  let desiredAltitude = 0
  if (manualState === 'takeoff') {
    desiredAltitude = unit.maxAltitude
  } else if (manualState === 'land') {
    desiredAltitude = 0
  } else if (manualState === 'hover') {
    desiredAltitude = unit.maxAltitude * 0.75
  } else {
    desiredAltitude = (holdAltitude || isInMotion) ? unit.maxAltitude : 0
  }

  if (landingBlocked) {
    const safeHoverAltitude = Math.max(unit.altitude, unit.maxAltitude * 0.35)
    desiredAltitude = safeHoverAltitude
  }

  unit.targetAltitude = desiredAltitude

  const altitudeDiff = desiredAltitude - unit.altitude
  const climbRate = unit.maxAltitude * (manualState === 'land' ? 2.5 : 3)
  const maxStep = climbRate * deltaSeconds
  const altitudeStep = Math.max(-maxStep, Math.min(maxStep, altitudeDiff))
  unit.altitude = Math.max(0, unit.altitude + altitudeStep)

  let newFlightState = unit.flightState
  if (unit.altitude > 2 && altitudeDiff > 0.5) {
    newFlightState = 'takeoff'
  } else if (unit.altitude > 2 && Math.abs(altitudeDiff) <= 1) {
    newFlightState = 'airborne'
  } else if (unit.altitude <= 2 && altitudeDiff < -0.5) {
    newFlightState = 'landing'
  } else if (unit.altitude <= 2) {
    newFlightState = 'grounded'
  }

  const previouslyGrounded = unit.flightState === 'grounded' || unit.flightState === undefined
  const hadGroundOccupancy =
    unit.groundedOccupancyApplied !== undefined
      ? Boolean(unit.groundedOccupancyApplied)
      : !unit.occupancyRemoved
  unit.flightState = newFlightState

  const isGroundedNow = unit.flightState === 'grounded'
  const onHelipadNow = isGroundedNow && Boolean(unit.landedHelipadId)
  const onGroundLandingNow = isGroundedNow && Boolean(unit.type === 'f35' && unit.groundLandingRequested && !unit.landedHelipadId)

  if (!isGroundedNow) {
    if (previouslyGrounded && hadGroundOccupancy) {
      removeUnitOccupancy(unit, occupancyMap, { ignoreFlightState: true })
    }
    unit.groundedOccupancyApplied = false
    unit.occupancyRemoved = true
    unit.lastGroundedOnHelipad = false
  } else {
    if (onHelipadNow) {
      if (hadGroundOccupancy) {
        removeUnitOccupancy(unit, occupancyMap, { ignoreFlightState: true })
      }
      unit.groundedOccupancyApplied = false
      unit.occupancyRemoved = true
    } else if (!hadGroundOccupancy) {
      addUnitOccupancyDirect(unit, occupancyMap)
      unit.groundedOccupancyApplied = true
      unit.occupancyRemoved = false
    }
    if (!onHelipadNow && hadGroundOccupancy) {
      unit.occupancyRemoved = false
    }
    unit.lastGroundedOnHelipad = onHelipadNow
    if (onGroundLandingNow && unit.groundLandingTarget) {
      unit.x = unit.groundLandingTarget.x - TILE_SIZE / 2
      unit.y = unit.groundLandingTarget.y - TILE_SIZE / 2
      unit.tileX = Math.floor(unit.x / TILE_SIZE)
      unit.tileY = Math.floor(unit.y / TILE_SIZE)
      unit.path = []
      unit.moveTarget = { x: unit.tileX, y: unit.tileY }
      unit.flightPlan = null
      unit.landedOnGround = true
    }
  }

  const rotorTargetSpeed = unit.flightState === 'grounded'
    ? ROTOR_GROUNDED_SPEED
    : ROTOR_AIRBORNE_SPEED
  const rotorResponse = unit.flightState === 'grounded'
    ? ROTOR_SPINDOWN_RESPONSE
    : ROTOR_SPINUP_RESPONSE
  rotor.speed += (rotorTargetSpeed - rotor.speed) * Math.min(1, deltaSeconds * rotorResponse)
  if (unit.flightState === 'grounded' && Math.abs(rotor.speed - ROTOR_GROUNDED_SPEED) < ROTOR_STOP_EPSILON) {
    rotor.speed = ROTOR_GROUNDED_SPEED
  }
  rotor.angle = (rotor.angle + rotor.speed * deltaMs) % (Math.PI * 2)
  rotor.targetSpeed = rotorTargetSpeed

  const altitudeRatio = Math.min(1, unit.maxAltitude > 0 ? unit.altitude / unit.maxAltitude : 0)
  shadow.offset = altitudeRatio * TILE_SIZE * 1.8
  shadow.scale = 1 + altitudeRatio * 0.5

  if (manualState === 'takeoff' && unit.altitude >= unit.maxAltitude * 0.95) {
    if (unit.type === 'f35' && !unit._f35TakeoffSoundAt) {
      playPositionalSound('f35Takeoff', unit.x + TILE_SIZE / 2, unit.y + TILE_SIZE / 2, 0.55)
      unit._f35TakeoffSoundAt = now
    }
    unit.manualFlightState = 'auto'
  } else if (manualState === 'land' && unit.altitude <= 1) {
    if (unit.type === 'f35' && (!unit._f35LandingSoundAt || now - unit._f35LandingSoundAt > 1000)) {
      playPositionalSound('f35Landing', unit.x + TILE_SIZE / 2, unit.y + TILE_SIZE / 2, 0.55)
      unit._f35LandingSoundAt = now
    }
    unit.manualFlightState = 'auto'
  }

  if (unit.dodgeVelocity) {
    if (now < unit.dodgeVelocity.endTime) {
      unit.x += unit.dodgeVelocity.vx * deltaSeconds
      unit.y += unit.dodgeVelocity.vy * deltaSeconds
    } else {
      unit.dodgeVelocity = null
    }
  }

  const isHovering = unit.flightState === 'airborne' && (!movement || movement.currentSpeed < 0.1)
  unit.hovering = isHovering

  if (typeof unit.gas === 'number' && unit.gas > 0) {
    const shouldConsumeHoverFuel = isHovering && !unit.helipadLandingRequested && manualState !== 'land'
    if (shouldConsumeHoverFuel) {
      const frameScale = Math.max(0, Math.min(deltaSeconds / BASE_FRAME_SECONDS, 6))
      const airSpeed = unit.airCruiseSpeed || unit.speed || MOVEMENT_CONFIG.MAX_SPEED
      const hoverEquivalentPixels = airSpeed * frameScale
      const metersPerPixel = TILE_LENGTH_METERS / TILE_SIZE
      const hoverMeters = hoverEquivalentPixels * metersPerPixel
      const hoverUsage = (unit.gasConsumption || 0) * hoverMeters / 100000 * (unit.hoverFuelMultiplier || 0.2)
      consumeUnitGas(unit, hoverUsage)
    }
  }


  if (unit.type === 'f35' && unit.flightState && unit.flightState !== 'grounded') {
    if (!unit.lastF22FlightSoundAt || now - unit.lastF22FlightSoundAt > 4500) {
      playPositionalSound('f22Flight', unit.x, unit.y, 0.25)
      unit.lastF22FlightSoundAt = now
    }
  }

  const shouldPlayRotorSound = shouldPlayApacheRotorSound(unit)

  if (shouldPlayRotorSound) {
    const altitudeRatioNow = unit.maxAltitude > 0 ? Math.min(1, unit.altitude / unit.maxAltitude) : 0
    const altitudeGain =
      APACHE_ROTOR_ALTITUDE_GAIN_MIN +
      altitudeRatioNow * (APACHE_ROTOR_ALTITUDE_GAIN_MAX - APACHE_ROTOR_ALTITUDE_GAIN_MIN)

    if (!unit.rotorSound && !unit.rotorSoundLoading) {
      const requestId = (unit.rotorSoundRequestId || 0) + 1
      unit.rotorSoundRequestId = requestId
      unit.rotorSoundLoading = true
      playPositionalSound('apache_fly', unit.x, unit.y, APACHE_ROTOR_LOOP_VOLUME, 0, false, { playLoop: true })
        .then(handle => {
          unit.rotorSoundLoading = false
          if (!handle) {
            return
          }

          const stillAirborne =
            unit.rotorSoundRequestId === requestId &&
            shouldPlayApacheRotorSound(unit)

          if (!stillAirborne) {
            try {
              handle.source.stop()
            } catch (e) {
              console.error('Failed to stop apache rotor sound after state change:', e)
            }
            return
          }

          const altitudeRatioAfter = unit.maxAltitude > 0 ? Math.min(1, unit.altitude / unit.maxAltitude) : 0
          const altitudeGainAfter =
            APACHE_ROTOR_ALTITUDE_GAIN_MIN +
            altitudeRatioAfter * (APACHE_ROTOR_ALTITUDE_GAIN_MAX - APACHE_ROTOR_ALTITUDE_GAIN_MIN)

          const { pan, volumeFactor } = calculatePositionalAudio(unit.x, unit.y)
          const targetGain =
            APACHE_ROTOR_LOOP_VOLUME *
            volumeFactor *
            altitudeGainAfter *
            getMasterVolume()

          if (handle.gainNode) {
            handle.gainNode.gain.setValueAtTime(0, audioContext.currentTime)
            handle.gainNode.gain.linearRampToValueAtTime(targetGain, audioContext.currentTime + 0.4)
          }
          if (handle.panner) {
            handle.panner.pan.value = pan
          }

          handle.baseVolume = APACHE_ROTOR_LOOP_VOLUME
          unit.rotorSound = handle
        })
        .catch(error => {
          unit.rotorSoundLoading = false
          console.error('Error playing apache rotor loop:', error)
        })
    } else if (unit.rotorSound) {
      const { pan, volumeFactor } = calculatePositionalAudio(unit.x, unit.y)
      const targetGain =
        (unit.rotorSound.baseVolume || APACHE_ROTOR_LOOP_VOLUME) *
        volumeFactor *
        altitudeGain *
        getMasterVolume()

      if (unit.rotorSound.panner) {
        unit.rotorSound.panner.pan.value = pan
      }
      if (unit.rotorSound.gainNode) {
        unit.rotorSound.gainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.05)
      }
    }
  } else {
    stopApacheRotorSound(unit)
  }
}
