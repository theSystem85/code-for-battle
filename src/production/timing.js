export const vehicleFactorySpeedUnitTypes = [
  'tank', 'tank-v2', 'rocketTank', 'tank_v1', 'tank-v3', 'lightTank', 'harvester',
  'ambulance', 'fireEngine', 'tankerTruck', 'ammunitionTruck', 'recoveryTank', 'howitzer',
  'mineLayer', 'mineSweeper'
]

/** Production duration in simulation milliseconds, shared by queues and card estimates. */
export function getProductionDuration(cost, isBuilding, multiplier = 1, powerModifier = 1) {
  const baseDuration = isBuilding ? 750 : 3000
  return baseDuration * (cost / 500) / multiplier / powerModifier
}
