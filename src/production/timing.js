// Aircraft also receive the existing vehicle-factory speed bonus; naval units do not.
export const vehicleFactorySpeedUnitTypes = [
  'tank', 'tank-v2', 'rocketTank', 'tank_v1', 'tank-v3', 'lightTank', 'harvester',
  'ambulance', 'tankerTruck', 'ammunitionTruck', 'recoveryTank', 'howitzer',
  'mineLayer', 'mineSweeper', 'apache', 'f22Raptor', 'f35'
]

/** Production duration in simulation milliseconds, shared by queues and card estimates. */
export function getProductionDuration(cost, isBuilding, multiplier = 1, powerModifier = 1) {
  const baseDuration = isBuilding ? 750 : 3000
  return baseDuration * (cost / 500) / multiplier / powerModifier
}
