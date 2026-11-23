export const OPENING_HARVESTER_COUNT = 4
const OPENING_TANK_COUNT = 2
const OPENING_TANK_TYPES = new Set(['tank', 'tank_v1', 'tank-v2', 'tank-v3', 'lightTank', 'rocketTank'])

export function getOpeningDefenseStep(aiPlayerId, aiBuildings, units, aiFactory) {
  if (!aiBuildings.some(b => b.type.startsWith('turretGun'))) return 'turretGunV1'
  if (!aiBuildings.some(b => b.type === 'radarStation')) return 'radarStation'
  if (!aiBuildings.some(b => b.type === 'rocketTurret')) return 'rocketTurret'

  if (!aiBuildings.some(b => b.type === 'artilleryTurret')) {
    let tankCount = 0
    for (const unit of units) {
      if (unit.owner === aiPlayerId && unit.health > 0 && OPENING_TANK_TYPES.has(unit.type)) {
        tankCount++
        if (tankCount === OPENING_TANK_COUNT) return 'artilleryTurret'
      }
    }
    return 'tank_v1'
  }

  // Existing walls or a hospital also identify a base that has moved on to expansion.
  const hasHowitzer = units.some(u => u.owner === aiPlayerId && u.type === 'howitzer' && u.health > 0)
  const hasExpanded = aiBuildings.some(b => b.type === 'concreteWall' || b.type === 'hospital')
  if (!hasHowitzer && !hasExpanded && aiFactory.currentlyProducingUnit !== 'howitzer') return 'howitzer'
  if (!aiBuildings.some(b => b.type === 'teslaCoil')) return 'teslaCoil'
  return !hasHowitzer && !hasExpanded ? 'howitzer' : null
}
