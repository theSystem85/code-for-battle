import { hasOperationalBuilding } from './researchCenterRequirements.js'

const supportVehicles = new Set(['harvester', 'ambulance', 'fireEngine', 'tankerTruck', 'ammunitionTruck', 'recoveryTank'])

const fighters = new Set(['f22Raptor', 'f35'])

export function getAssemblySpeedMultiplier(type, buildings, owner) {
  if (supportVehicles.has(type) && hasOperationalBuilding(buildings, 'droneFactory', owner)) return 1.25
  if (fighters.has(type) && hasOperationalBuilding(buildings, 'planeFactory', owner)) return 1.25
  return 1
}

export function getConstructionAssemblySpeedMultiplier(buildings, owner) {
  return hasOperationalBuilding(buildings, 'spaceshipFactory', owner) ? 1.2 : 1
}
