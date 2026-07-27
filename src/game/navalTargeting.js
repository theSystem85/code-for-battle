export function isPartlyWaterBuilding(target) {
  return Boolean(target?.type === 'shipyard')
}

export function canSubmarineTargetEntity(submarine, target) {
  return Boolean(
    submarine &&
    target &&
    !target.embarkedOnId &&
    target.health > 0 &&
    target.owner !== submarine.owner &&
    (target.isNaval || isPartlyWaterBuilding(target) || target.type === 'constructionYard')
  )
}

export function canBattleshipTargetEntity(target) {
  if (!target || target.embarkedOnId || target.health <= 0) return false
  if (target.type === 'submarine' && target.depthState !== 'surfaced') return false
  const isAirUnit = target.isAirUnit || target.type === 'apache' || target.type === 'f22Raptor' || target.type === 'f35'
  return !isAirUnit
}
