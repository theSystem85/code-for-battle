// A requirement is a building type, or a group of alternative building types.
// These rules drive both gameplay unlocks and the cached build-card summaries.
export const productionUnlockRules = [
  { requires: ['vehicleFactory'], units: ['tank', 'lightTank'], buildings: ['ammunitionFactory'] },
  { requires: ['vehicleFactory', 'oreRefinery'], units: ['harvester'] },
  { requires: ['vehicleFactory', 'gasStation'], units: ['tankerTruck'] },
  { requires: ['vehicleFactory', 'ammunitionFactory'], units: ['ammunitionTruck'] },
  { requires: ['hospital'], units: ['ambulance'] },
  { requires: ['vehicleFactory', 'vehicleWorkshop'], units: ['recoveryTank', 'mineSweeper'] },
  { requires: ['vehicleFactory', 'vehicleWorkshop', 'ammunitionFactory'], units: ['mineLayer'] },
  { requires: ['helipad'], units: ['apache'] },
  { requires: ['airstrip'], units: ['f22Raptor'] },
  { requires: [['helipad', 'airstrip'], 'ammunitionFactory'], units: ['f35'] },
  { requires: ['vehicleFactory'], count: 2, units: ['tank-v3'] },
  { requires: ['shipyard'], units: ['destroyer', 'hovercraft', 'vehicleFerry', 'aircraftCarrier', 'navalMineLayer', 'battleship', 'submarine'] },
  { requires: ['shipyard', ['gasStation', 'hospital', 'ammunitionFactory', 'vehicleWorkshop']], units: ['supplyShip'] },
  { requires: ['rocketTurret'], units: ['rocketTank'] },
  { requires: ['radarStation'], units: ['tank-v2'], buildings: ['airstrip', 'turretGunV2', 'turretGunV3', 'rocketTurret', 'teslaCoil', 'artilleryTurret'] },
  { requires: ['radarStation', 'vehicleFactory'], buildings: ['shipyard'] },
  { requires: ['radarStation', 'vehicleFactory', 'artilleryTurret'], units: ['howitzer'] }
]

/** Event-driven tech-tree sync; never called by rendering or simulation updates. */
export function visitProductionUnlocks(playerBuildings, owner, controller) {
  const counts = Object.create(null)
  for (const building of playerBuildings) {
    if (building.owner !== owner || (building.type === 'airstrip' && !(building.health > 0))) continue
    counts[building.type] = (counts[building.type] || 0) + 1
  }
  for (const rule of productionUnlockRules) {
    if (!rule.requires.every(requirement => Array.isArray(requirement)
      ? requirement.some(type => counts[type] > 0)
      : counts[requirement] >= (rule.count || 1))) continue
    if (rule.units) {
      for (const type of rule.units) controller.forceUnlockUnitType(type)
    }
    if (rule.buildings) {
      for (const type of rule.buildings) controller.forceUnlockBuildingType(type)
    }
  }
}
