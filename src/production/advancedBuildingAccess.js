import { buildingData } from '../data/buildingData.js'
import { getPerk } from '../perks/perkCatalog.js'
import { ownsResearchPerk } from '../perks/perkState.js'
import { hasOperationalBuilding } from './researchCenterRequirements.js'

export const advancedBuildingTypes = Object.keys(buildingData).filter(type => buildingData[type].researchPerk)

export function hasBuildingBlueprint(type, owner) {
  const perk = buildingData[type]?.researchPerk
  return !perk || ownsResearchPerk(owner, perk)
}

export function getAdvancedBuildingRequirement(type, buildings, owner) {
  const data = buildingData[type]
  if (!data) return ''
  if (data.researchPerk) {
    if (!hasBuildingBlueprint(type, owner)) return `Research ${getPerk(data.researchPerk).name}`
    if (!hasOperationalBuilding(buildings, 'technologyResearchCenter', owner)) return 'Requires a Technology Research Center'
  }
  if (data.operationalPrerequisite && !hasOperationalBuilding(buildings, data.operationalPrerequisite, owner)) {
    return `Requires an operational ${buildingData[data.operationalPrerequisite].displayName}`
  }
  return ''
}
