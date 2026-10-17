import { UNIT_COSTS } from '../config.js'
import { buildingData } from '../data/buildingData.js'
import { getBuildingRequirements } from '../production/buildingRequirements.js'
import { productionUnlockRules } from '../production/techTree.js'
import { getProductionDuration, vehicleFactorySpeedUnitTypes } from '../production/timing.js'

/** Index existing production buttons once, combining tech unlocks and build-order gates. */
export function buildProductionUnlockIndex(buttons = document.querySelectorAll('.production-button')) {
  const unitTypes = new Set()
  const buildingTypes = new Set()
  for (const button of buttons) {
    if (button.dataset.unitType) unitTypes.add(button.dataset.unitType)
    if (button.dataset.buildingType) buildingTypes.add(button.dataset.buildingType)
  }
  const index = new Map([...buildingTypes].map(type => [type, { units: new Set(), buildings: new Set() }]))
  const prerequisites = new Map(Object.keys(buildingData).map(type => [type,
    new Set(getBuildingRequirements(type).map(requirement => requirement.type))
  ]))
  for (const rule of productionUnlockRules) {
    for (const type of rule.requires.flat()) {
      for (const unit of rule.units || []) {
        if (unitTypes.has(unit)) index.get(type)?.units.add(unit)
      }
      for (const building of rule.buildings || []) prerequisites.get(building)?.add(type)
    }
  }
  // The starting Yard is the root of normal base construction. Stop traversal
  // there to avoid the Yard -> Workshop -> Yard expansion cycle, while retaining
  // its direct Power Plant gate and the Workshop's later Construction Yard unlock.
  const dependsOn = (type, prerequisite, visited = new Set()) => {
    if (type === 'constructionYard' || visited.has(type)) return false
    visited.add(type)
    for (const dependency of prerequisites.get(type) || []) {
      if (dependency === prerequisite || dependsOn(dependency, prerequisite, visited)) return true
    }
    return false
  }
  for (const building of buildingTypes) {
    const requirements = [...(prerequisites.get(building) || [])]
    for (const type of requirements) {
      // Attribute only to the last prerequisite(s), rather than every earlier gate.
      if (!requirements.some(other => other !== type && dependsOn(other, type))) {
        index.get(type)?.buildings.add(building)
      }
    }
  }
  return new Map([...index].map(([type, unlocks]) => [type, {
    units: [...unlocks.units], buildings: [...unlocks.buildings]
  }]))
}

let unlockIndex

export function getProductionUnlocks(kind, type) {
  if (kind !== 'building') return undefined
  if (!unlockIndex) unlockIndex = buildProductionUnlockIndex()
  return unlockIndex.get(type)
}

export function formatProductionUnlocks(unlocks) {
  const units = unlocks?.units.length || 0
  const buildings = unlocks?.buildings.length || 0
  return units || buildings
    ? `Unlocks: ${units} ${units === 1 ? 'unit' : 'units'}, ${buildings} ${buildings === 1 ? 'building' : 'buildings'}`
    : 'Unlocks: none'
}

/** Refresh only at setup and pointer/focus entry, never from a simulation tick. */
export function getCardBuildTime(kind, type, state, queue) {
  const isBuilding = kind === 'building'
  const cost = isBuilding ? buildingData[type]?.cost : UNIT_COSTS[type]
  let multiplier = 1
  if (isBuilding) {
    multiplier = queue.getConstructionYardMultiplier()
  } else if (vehicleFactorySpeedUnitTypes.includes(type)) {
    multiplier = queue.getVehicleFactoryMultiplier()
  }
  // A missing producer shows the baseline estimate, rather than infinity.
  const duration = getProductionDuration(cost || 0, isBuilding, multiplier || 1,
    state.playerPowerSupply < 0 ? state.playerBuildSpeedModifier : 1)
  return `Build time: ${Number((duration / 1000).toFixed(1))}s`
}

export function setupProductionHoverCard(button, context, state, queue) {
  if (button.querySelector('.production-hover-sheet')) return
  const name = button.querySelector('.building-name, .unit-name')
  if (!name) return

  const sheet = document.createElement('div')
  sheet.className = 'production-hover-sheet'
  const stats = document.createElement('div')
  stats.className = 'production-hover-stats'
  const cost = button.querySelector('.building-cost, .unit-cost')
  const power = button.querySelector('.building-power')
  if (cost) {
    const value = context.kind === 'building' ? buildingData[context.type]?.cost : UNIT_COSTS[context.type]
    cost.textContent = `Cost: $${value || 0}`
    stats.appendChild(cost)
  }
  if (power) {
    const value = buildingData[context.type]?.power || 0
    power.textContent = `Power: ${value > 0 ? '+' : ''}${value} MW`
    stats.appendChild(power)
  }
  const time = document.createElement('span')
  time.className = 'production-build-time'
  stats.appendChild(time)
  const requirement = document.createElement('span')
  requirement.className = 'production-requirement'
  const refreshDetails = () => {
    time.textContent = getCardBuildTime(context.kind, context.type, state, queue)
    requirement.textContent = button.dataset.requirement?.trim() || ''
    requirement.hidden = !requirement.textContent
  }
  refreshDetails()

  const unlocks = getProductionUnlocks(context.kind, context.type)
  if (context.kind === 'building') {
    const summary = document.createElement('span')
    summary.className = 'production-unlocks'
    summary.textContent = formatProductionUnlocks(unlocks)
    stats.appendChild(summary)
  }
  stats.appendChild(requirement)

  // Small unlock lists are optional detail. CSS reveals them only on roomy cards.
  const types = [...(unlocks?.units || []), ...(unlocks?.buildings || [])]
  if (types.length > 0 && types.length <= 2) {
    const names = document.createElement('span')
    names.className = 'production-unlock-names'
    names.textContent = types.map(type => {
      const target = document.querySelector(`.production-button[data-unit-type="${type}"] .unit-name`)
      return buildingData[type]?.displayName || target?.textContent.trim() || type
    }).join(', ')
    stats.appendChild(names)
  }

  sheet.append(name, stats)
  button.appendChild(sheet)
  button.addEventListener('pointerenter', refreshDetails)
  button.addEventListener('focus', refreshDetails)
}
