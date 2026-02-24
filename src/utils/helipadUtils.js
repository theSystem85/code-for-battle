import { TILE_SIZE } from '../config.js'
import { getBuildingIdentifier } from '../utils.js'

export const HELIPAD_LANDING_CENTER_OFFSET = Object.freeze({ x: 25, y: 44 })

export function getHelipadLandingCenter(helipad) {
  if (!helipad || typeof helipad.x !== 'number' || typeof helipad.y !== 'number') {
    return null
  }
  const originX = helipad.x * TILE_SIZE
  const originY = helipad.y * TILE_SIZE
  return {
    x: originX + HELIPAD_LANDING_CENTER_OFFSET.x,
    y: originY + HELIPAD_LANDING_CENTER_OFFSET.y
  }
}

export function getHelipadLandingTile(helipad) {
  const center = getHelipadLandingCenter(helipad)
  if (!center) {
    return null
  }
  return {
    x: Math.floor(center.x / TILE_SIZE),
    y: Math.floor(center.y / TILE_SIZE)
  }
}

export function getHelipadLandingTopLeft(helipad) {
  const center = getHelipadLandingCenter(helipad)
  if (!center) {
    return null
  }
  return {
    x: center.x - TILE_SIZE / 2,
    y: center.y - TILE_SIZE / 2
  }
}

export function isHelipadAvailableForUnit(helipad, units = [], excludeUnitIds = []) {
  const helipadId = getBuildingIdentifier(helipad)
  if (!helipadId) {
    return false
  }

  const excludedIds = new Set(Array.isArray(excludeUnitIds) ? excludeUnitIds.filter(Boolean) : [excludeUnitIds].filter(Boolean))
  const unitList = Array.isArray(units) ? units : []

  const isAirUnitType = t => t === 'apache' || t === 'f22Raptor'

  if (helipad?.landedUnitId && !excludedIds.has(helipad.landedUnitId)) {
    const occupant = unitList.find(unit => unit && unit.id === helipad.landedUnitId)
    if (occupant && isAirUnitType(occupant.type) && occupant.health > 0 && occupant.flightState === 'grounded') {
      return false
    }
  }

  const reservedByOther = unitList.some(unit => {
    if (!unit || !isAirUnitType(unit.type) || unit.health <= 0 || excludedIds.has(unit.id)) {
      return false
    }

    const targetsHelipad = unit.helipadTargetId === helipadId
    const landingRequested = unit.helipadLandingRequested && (!unit.helipadTargetId || unit.helipadTargetId === helipadId)
    const landingPlanned = unit.flightPlan?.mode === 'helipad' && (!unit.helipadTargetId || unit.helipadTargetId === helipadId)
    const landedAtHelipad = unit.landedHelipadId === helipadId
    const autoReturnTarget = unit.autoHelipadReturnTargetId === helipadId

    return targetsHelipad || landingRequested || landingPlanned || landedAtHelipad || autoReturnTarget
  })

  return !reservedByOther
}
