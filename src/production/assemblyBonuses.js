import { hasOperationalBuilding } from './researchCenterRequirements.js'

const supportVehicles = new Set(['harvester', 'ambulance', 'fireEngine', 'tankerTruck', 'ammunitionTruck', 'recoveryTank'])

export function getAssemblySpeedMultiplier(type, buildings, owner) {
  return supportVehicles.has(type) && hasOperationalBuilding(buildings, 'droneFactory', owner) ? 1.25 : 1
}

export function getConstructionAssemblySpeedMultiplier(buildings, owner) {
  return hasOperationalBuilding(buildings, 'spaceshipFactory', owner) ? 1.2 : 1
}
