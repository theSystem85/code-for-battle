import { buildingData } from '../data/buildingData.js'

// Preserve the sidebar's conditional checks and their requirement-message order.
// Prepared once; both button availability and hover unlock attribution use these.
const requirementsByType = new Map(Object.keys(buildingData).map(type => {
  const requirements = []
  if (type !== 'street') {
    if (type !== 'constructionYard') requirements.push({ type: 'constructionYard' })
    if (buildingData[type].requiresRadar) requirements.push({ type: 'radarStation' })
    if (buildingData[type].requiresVehicleFactory) requirements.push({ type: 'vehicleFactory' })
    if (type !== 'powerPlant' && type !== 'constructionYard') {
      requirements.push({ type: 'powerPlant' })
      if (type !== 'oreRefinery') {
        requirements.push({ type: 'oreRefinery', after: ['powerPlant'] })
        if (type !== 'vehicleFactory') {
          requirements.push({ type: 'vehicleFactory', after: ['powerPlant', 'oreRefinery'] })
        }
      }
    }
    if (type === 'constructionYard') requirements.push({ type: 'vehicleWorkshop' })
  }
  return [type, requirements]
}))

export function getBuildingRequirements(type) {
  return requirementsByType.get(type) || []
}

/** Event-driven availability checks, including the original conditional build order. */
export function getMissingBuildingRequirements(type, ownedTypes) {
  const missing = []
  for (const requirement of getBuildingRequirements(type)) {
    if (ownedTypes.has(requirement.type)) continue
    if (requirement.after && !requirement.after.every(prerequisite => ownedTypes.has(prerequisite))) continue
    const name = buildingData[requirement.type].displayName
    if (!missing.includes(name)) missing.push(name)
  }
  return missing
}
