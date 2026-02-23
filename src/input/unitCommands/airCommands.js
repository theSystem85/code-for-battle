import { TILE_SIZE } from '../../config.js'
import { gameState } from '../../gameState.js'
import { playPositionalSound } from '../../sound.js'
import { showNotification } from '../../ui/notifications.js'
import { getBuildingIdentifier } from '../../utils.js'
import { getHelipadLandingCenter, getHelipadLandingTile, isHelipadAvailableForUnit } from '../../utils/helipadUtils.js'
import { units } from '../../main.js'

export function assignApacheFlight(unit, destTile, destCenter, options = {}) {
  if (!unit || (unit.type !== 'apache' && unit.type !== 'f22') || !destCenter) {
    return false
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
  const airUnits = selectedUnits.filter(unit => unit.type === 'apache' || unit.type === 'f22')
  if (airUnits.length === 0 || !helipad) {
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
  airUnits.forEach(unit => {
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

  if (blockedUnits.length === airUnits.length) {
    showNotification('No available helipads for landing!', 2000)
    return
  }

  if (blockedUnits.length > 0) {
    showNotification('Some helipads are occupied; only available pads assigned.', 2000)
  }

  const avgX = airUnits.reduce((sum, u) => sum + u.x, 0) / airUnits.length
  const avgY = airUnits.reduce((sum, u) => sum + u.y, 0) / airUnits.length
  playPositionalSound('movement', avgX, avgY, 0.5)
}
