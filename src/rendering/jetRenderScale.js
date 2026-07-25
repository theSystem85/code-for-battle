const LANDED_JET_SCALE = 0.75

function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}

export function getJetRenderScale(unit) {
  const usesCarrierDeck = Boolean(unit?.carrierId || unit?.carrierOperation?.carrierId)
  const usesAirstrip = Boolean(unit?.airstripId)
  if (!usesCarrierDeck && !usesAirstrip) return 1

  const maximumAltitude = Math.max(unit?.maxAltitude || 0, 1)
  const altitudeProgress = clamp01((unit?.altitude || 0) / maximumAltitude)
  return LANDED_JET_SCALE + (1 - LANDED_JET_SCALE) * altitudeProgress
}

export { LANDED_JET_SCALE }
