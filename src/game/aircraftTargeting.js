export function isAirborneCombatTarget(target) {
  return Boolean(target?.c5Drop || (target && (
    target.type === 'apache' || target.type === 'f22Raptor' || target.type === 'f35' || target.type === 'c5Galaxy'
  ) && (target.type === 'c5Galaxy' ? target.altitude > 0 : target.flightState !== 'grounded')))
}

export function getAircraftAltitudeLift(target) {
  return isAirborneCombatTarget(target) && Number.isFinite(target.altitude) ? target.altitude * 0.4 : 0
}

export function isAntiAirWeapon(shooter) {
  return shooter?.type === 'rocketTurret' || shooter?.type === 'rocketTank' || shooter?.type === 'apache' ||
    shooter?.type === 'f22Raptor' || shooter?.type === 'destroyer'
}
