export function getAircraftAltitudeLift(target) {
  const isAircraft = target && (
    target.type === 'apache' ||
    target.type === 'f22Raptor' ||
    target.type === 'f35'
  )
  if (!isAircraft || target.flightState === 'grounded') {
    return 0
  }

  return Number.isFinite(target.altitude) ? target.altitude * 0.4 : 0
}
