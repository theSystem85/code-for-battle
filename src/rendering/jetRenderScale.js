import { AIRCRAFT_RESIZE_AUDIT_TAGS } from './prepared/preparedSpritePipeline.js'

const LANDED_JET_SCALE = 0.75
const F22_TAKEOFF_STATES = new Set(['liftoff'])
const F22_LANDING_STATES = new Set(['landing_roll'])
const CARRIER_TAKEOFF_STATES = new Set(['launch'])
const CARRIER_LANDING_STATES = new Set(['approach', 'landing_roll', 'vertical_landing'])
const CARRIER_GROUND_STATES = new Set(['parked', 'launch_taxi', 'landing_taxi'])

function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}

export function getJetResizeAuditTag(unit) {
  const usesCarrierDeck = Boolean(unit?.carrierId || unit?.carrierOperation?.carrierId)
  const usesAirstrip = Boolean(unit?.airstripId)
  if (!usesCarrierDeck && !usesAirstrip) return null

  const carrierState = unit?.carrierOperation?.state
  if (carrierState) {
    if (CARRIER_TAKEOFF_STATES.has(carrierState)) return AIRCRAFT_RESIZE_AUDIT_TAGS.TAKEOFF
    if (CARRIER_LANDING_STATES.has(carrierState)) return AIRCRAFT_RESIZE_AUDIT_TAGS.LANDING
    return null
  }
  if (
    unit?.manualFlightState === 'takeoff' ||
    unit?.flightState === 'takeoff' ||
    F22_TAKEOFF_STATES.has(unit?.f22State)
  ) {
    return AIRCRAFT_RESIZE_AUDIT_TAGS.TAKEOFF
  }
  if (
    unit?.manualFlightState === 'land' ||
    unit?.flightState === 'landing' ||
    F22_LANDING_STATES.has(unit?.f22State)
  ) {
    return AIRCRAFT_RESIZE_AUDIT_TAGS.LANDING
  }
  return null
}

export function getJetRenderScale(unit) {
  const usesCarrierDeck = Boolean(unit?.carrierId || unit?.carrierOperation?.carrierId)
  const usesAirstrip = Boolean(unit?.airstripId)
  if (!usesCarrierDeck && !usesAirstrip) return 1
  if (!getJetResizeAuditTag(unit)) {
    return unit?.flightState === 'grounded' ||
      CARRIER_GROUND_STATES.has(unit?.carrierOperation?.state)
      ? LANDED_JET_SCALE
      : 1
  }

  const maximumAltitude = Math.max(unit?.maxAltitude || 0, 1)
  const altitudeProgress = clamp01((unit?.altitude || 0) / maximumAltitude)
  return LANDED_JET_SCALE + (1 - LANDED_JET_SCALE) * altitudeProgress
}

export { LANDED_JET_SCALE }
