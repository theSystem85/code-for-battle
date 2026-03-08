import { TILE_SIZE } from '../../config.js'
import { gameState } from '../../gameState.js'
import { playPositionalSound } from '../../sound.js'
import { showNotification } from '../../ui/notifications.js'
import { getBuildingIdentifier } from '../../utils.js'
import { getHelipadLandingCenter, getHelipadLandingTile, isHelipadAvailableForUnit } from '../../utils/helipadUtils.js'
import { claimAirstripParkingSlot, getAirstripParkingSpots, getAirstripRunwayPoints, setAirstripSlotOccupant } from '../../utils/airstripUtils.js'
import { units } from '../../main.js'

export function assignApacheFlight(unit, destTile, destCenter, options = {}) {
  if (!unit || (unit.type !== 'apache' && unit.type !== 'f22Raptor' && unit.type !== 'f35') || !destCenter) {
    return false
  }

  if (unit.type === 'f22Raptor') {
    const stopRadius = Math.max(6, options.stopRadius || TILE_SIZE * 0.5)
    unit.path = []
    unit.originalPath = null
    unit.moveTarget = destTile ? { x: destTile.x, y: destTile.y } : null
    unit.f22AssignedDestination = {
      x: destCenter.x,
      y: destCenter.y,
      stopRadius,
      mode: options.mode || 'manual',
      destinationTile: destTile ? { ...destTile } : null,
      followTargetId: options.followTargetId || null
    }
    const unitCenterX = unit.x + TILE_SIZE / 2
    const unitCenterY = unit.y + TILE_SIZE / 2
    unit.f22OrbitAngle = Math.atan2(unitCenterY - destCenter.y, unitCenterX - destCenter.x)
    unit.autoHoldAltitude = true

    if (options.mode === 'airstrip' && options.airstrip) {
      unit.airstripId = getBuildingIdentifier(options.airstrip)
      unit.runwayPoints = getAirstripRunwayPoints(options.airstrip)
      unit.f22State = 'approach_runway'
      unit.f22PendingTakeoff = false
      unit.helipadLandingRequested = true
    } else {
      unit.helipadLandingRequested = false
      if (unit.flightState === 'grounded') {
        unit.f22PendingTakeoff = true
        unit.f22State = 'wait_takeoff_clearance'
        unit.path = []
        unit.moveTarget = null
      } else {
        unit.f22State = 'airborne'
      }
    }

    unit.remoteControlActive = false
    unit.hovering = false
    return true
  }

  if (unit.type === 'f35') {
    const stopRadius = Math.max(6, options.stopRadius || TILE_SIZE * 0.4)
    unit.path = []
    unit.originalPath = null
    unit.moveTarget = destTile ? { x: destTile.x, y: destTile.y } : null
    unit.flightPlan = {
      x: destCenter.x,
      y: destCenter.y,
      stopRadius,
      mode: options.mode || 'manual',
      followTargetId: options.followTargetId || null,
      destinationTile: destTile ? { ...destTile } : null
    }
    unit.autoHoldAltitude = true
    unit.remoteControlActive = false
    unit.hovering = false
    unit.landedOnGround = false

    if (options.mode === 'airstrip' && options.airstrip) {
      const airstripId = getBuildingIdentifier(options.airstrip)
      let slotIndex = Number.isInteger(options.airstripParkingSlotIndex) ? options.airstripParkingSlotIndex : claimAirstripParkingSlot(options.airstrip, unit.airstripParkingSlotIndex)
      if (slotIndex < 0) {
        slotIndex = unit.airstripParkingSlotIndex
      }
      const slot = getAirstripParkingSpots(options.airstrip)[slotIndex]
      if (slot) {
        unit.moveTarget = { x: slot.x, y: slot.y }
        unit.flightPlan.x = slot.worldX
        unit.flightPlan.y = slot.worldY
        unit.flightPlan.destinationTile = { x: slot.x, y: slot.y }
      }
      unit.helipadLandingRequested = true
      unit.groundLandingRequested = false
      unit.groundLandingTarget = null
      unit.helipadTargetId = airstripId
      unit.airstripId = airstripId
      unit.airstripParkingSlotIndex = slotIndex
      if (Number.isInteger(slotIndex)) {
        setAirstripSlotOccupant(options.airstrip, slotIndex, unit.id)
      }
    } else if (options.mode === 'helipad') {
      unit.helipadLandingRequested = true
      unit.groundLandingRequested = false
      unit.groundLandingTarget = null
      unit.helipadTargetId = options.helipadId || null
      unit.airstripId = null
    } else if (options.mode === 'groundLand') {
      unit.helipadLandingRequested = false
      unit.helipadTargetId = null
      unit.airstripId = null
      unit.groundLandingRequested = true
      unit.groundLandingTarget = { x: destCenter.x, y: destCenter.y }
    } else {
      unit.helipadLandingRequested = false
      unit.helipadTargetId = null
      unit.groundLandingRequested = false
      unit.groundLandingTarget = null
    }

    if (unit.flightState === 'grounded') {
      unit.manualFlightState = 'takeoff'
    }
    return true
  }

  const stopRadius = Math.max(6, options.stopRadius || TILE_SIZE * 0.5)
  unit.path = []
  unit.originalPath = null
  unit.moveTarget = destTile ? { x: destTile.x, y: destTile.y } : null
  unit.flightPlan = {
    x: destCenter.x,
    y: destCenter.y,
    stopRadius,
    mode: options.mode || 'manual',
    followTargetId: options.followTargetId || null,
    destinationTile: destTile ? { ...destTile } : null
  }
  unit.autoHoldAltitude = true
  if (unit.landedHelipadId) {
    const helipad = Array.isArray(gameState.buildings)
      ? gameState.buildings.find(b => getBuildingIdentifier(b) === unit.landedHelipadId)
      : null
    if (helipad && helipad.landedUnitId === unit.id) {
      helipad.landedUnitId = null
    }
    unit.landedHelipadId = null
  }
  if (options.mode === 'helipad') {
    const helipadId = options.helipadId || null
    unit.helipadLandingRequested = true
    unit.helipadTargetId = helipadId
    unit.manualFlightHoverRequested = false
  } else {
    unit.helipadLandingRequested = false
    unit.helipadTargetId = null
    unit.manualFlightHoverRequested = true
  }
  if (unit.flightState === 'grounded') {
    unit.manualFlightState = 'takeoff'
  }
  unit.remoteControlActive = false
  unit.hovering = false
  return true
}

export function handleApacheHelipadCommand(handler, selectedUnits, helipad, _mapGrid) {
  const apaches = selectedUnits.filter(unit => unit.type === 'apache' || unit.type === 'f35')
  if (apaches.length === 0 || !helipad) {
    return
  }

  if (helipad.type === 'airstrip') {
    const availableSlots = getAirstripParkingSpots(helipad)
      .map((slot, index) => ({ slot, index }))
      .filter(({ index }) => {
        const occupantId = helipad.f22OccupiedSlotUnitIds?.[index]
        return !occupantId || apaches.some(unit => unit.id === occupantId)
      })

    if (availableSlots.length === 0) {
      showNotification('No available airstrip parking for landing!', 2000)
      return
    }

    const blockedUnits = []
    const assignedSlots = new Set()

    apaches.forEach(unit => {
      const option = availableSlots.find(candidate => !assignedSlots.has(candidate.index))
      if (!option) {
        blockedUnits.push(unit)
        return
      }

      const handled = handler.assignApacheFlight && handler.assignApacheFlight(unit, {
        x: option.slot.x,
        y: option.slot.y
      }, {
        x: option.slot.worldX,
        y: option.slot.worldY
      }, {
        mode: 'airstrip',
        airstrip: helipad,
        airstripParkingSlotIndex: option.index,
        stopRadius: TILE_SIZE * 0.2
      })

      if (handled) {
        assignedSlots.add(option.index)
        unit.target = null
        unit.originalTarget = null
        unit.forcedAttack = false
      }
    })

    if (blockedUnits.length === apaches.length) {
      showNotification('No available airstrip parking for landing!', 2000)
      return
    }

    if (blockedUnits.length > 0) {
      showNotification('Some airstrip parking slots are occupied; only available slots assigned.', 2000)
    }

    const avgX = apaches.reduce((sum, u) => sum + u.x, 0) / apaches.length
    const avgY = apaches.reduce((sum, u) => sum + u.y, 0) / apaches.length
    playPositionalSound('movement', avgX, avgY, 0.5)
    return
  }

  const targetCenter = getHelipadLandingCenter(helipad)
  if (!targetCenter) {
    return
  }

  const helipads = Array.isArray(gameState.buildings)
    ? gameState.buildings.filter(building => building.type === 'helipad' && building.health > 0 && building.owner === helipad.owner)
    : []

  const helipadOptions = helipads.map(building => {
    const center = getHelipadLandingCenter(building)
    const tile = center ? getHelipadLandingTile(building) : null
    if (!center || !tile) {
      return null
    }
    const distance = Math.hypot(center.x - targetCenter.x, center.y - targetCenter.y)
    return {
      helipad: building,
      center,
      tile,
      distance,
      helipadId: getBuildingIdentifier(building)
    }
  }).filter(Boolean)

  helipadOptions.sort((a, b) => a.distance - b.distance)

  const blockedUnits = []
  const assignedHelipadIds = new Set()
  apaches.forEach(unit => {
    const option = helipadOptions.find(candidate => {
      if (!candidate.helipadId || assignedHelipadIds.has(candidate.helipadId)) {
        return false
      }
      return isHelipadAvailableForUnit(candidate.helipad, units, unit.id)
    })
    if (!option) {
      blockedUnits.push(unit)
      return
    }

    const handled = handler.assignApacheFlight && handler.assignApacheFlight(unit, option.tile, option.center, {
      mode: 'helipad',
      stopRadius: TILE_SIZE * 0.2,
      helipadId: option.helipadId
    })
    if (handled) {
      assignedHelipadIds.add(option.helipadId)
      unit.target = null
      unit.originalTarget = null
      unit.forcedAttack = false
    }
  })

  if (blockedUnits.length === apaches.length) {
    showNotification('No available helipads for landing!', 2000)
    return
  }

  if (blockedUnits.length > 0) {
    showNotification('Some helipads are occupied; only available pads assigned.', 2000)
  }

  const avgX = apaches.reduce((sum, u) => sum + u.x, 0) / apaches.length
  const avgY = apaches.reduce((sum, u) => sum + u.y, 0) / apaches.length
  playPositionalSound('movement', avgX, avgY, 0.5)
}
