import { AIRCRAFT_TYPES, hasPlaneFactory } from '../production/aircraftProduction.js'
import { getAdvancedBuildingRequirement, hasBuildingBlueprint } from '../production/advancedBuildingAccess.js'
import { hasResearchCenterPrerequisites } from '../production/researchCenterRequirements.js'
import { gameState } from '../gameState.js'
import { getMissingBuildingRequirements } from '../production/buildingRequirements.js'
import { buildingData } from '../data/buildingData.js'

export function updateVehicleButtonStates(controller) {
  // In edit mode, enable all units regardless of tech tree
  if (gameState.mapEditMode) {
    const unitButtons = document.querySelectorAll('.production-button[data-unit-type]')
    unitButtons.forEach(button => {
      button.classList.remove('disabled')
      button.dataset.requirement = ''
      button.style.display = ''
    })
    return
  }

  const hasVehicleFactory = gameState.buildings.some(
    b => b.type === 'vehicleFactory' && b.owner === gameState.humanPlayer && b.health > 0
  )
  const hasRefinery = gameState.buildings.some(
    b => b.type === 'oreRefinery' && b.owner === gameState.humanPlayer && b.health > 0
  )
  const hasGasStation = gameState.buildings.some(
    b => b.type === 'gasStation' && b.owner === gameState.humanPlayer && b.health > 0
  )
  const hasWorkshop = gameState.buildings.some(
    b => b.type === 'vehicleWorkshop' && b.owner === gameState.humanPlayer && b.health > 0
  )
  const hasHospital = gameState.buildings.some(
    b => b.type === 'hospital' && b.owner === gameState.humanPlayer && b.health > 0
  )
  const hasRadar = gameState.buildings.some(
    b => b.type === 'radarStation' && b.owner === gameState.humanPlayer && b.health > 0
  )
  const unitButtons = document.querySelectorAll('.production-button[data-unit-type]')
  const hasAircraftProduction = hasPlaneFactory(gameState.buildings, gameState.humanPlayer)
  const hasShipyard = gameState.buildings.some(
    b => b.type === 'shipyard' && b.owner === gameState.humanPlayer && b.health > 0
  )
  const hasAmmunitionFactory = gameState.buildings.some(
    b => b.type === 'ammunitionFactory' && b.owner === gameState.humanPlayer && b.health > 0
  )

  unitButtons.forEach(button => {
    const unitType = button.getAttribute('data-unit-type')

    if (unitType === 'fireEngine') {
      const ready = hasVehicleFactory && gameState.buildings.some(b => b.type === 'fireDepartment' && b.owner === gameState.humanPlayer && b.health > 0)
      button.classList.toggle('disabled', !ready)
      button.dataset.requirement = ready ? '' : 'Requires Vehicle Factory & Fire Department'
    } else if (unitType === 'tankerTruck') {
      if (hasVehicleFactory && hasGasStation) {
        button.classList.remove('disabled')
        button.dataset.requirement = ''
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Vehicle Factory & Gas Station'
      }
    } else if (unitType === 'recoveryTank') {
      if (hasVehicleFactory && hasWorkshop) {
        button.classList.remove('disabled')
        button.dataset.requirement = ''
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Vehicle Factory & Workshop'
      }
    } else if (unitType === 'ammunitionTruck') {
      if (hasVehicleFactory && hasAmmunitionFactory) {
        button.classList.remove('disabled')
        button.dataset.requirement = ''
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Vehicle Factory & Ammunition Factory'
      }
    } else if (unitType === 'howitzer') {
      if (hasVehicleFactory && hasRadar) {
        button.classList.remove('disabled')
        button.dataset.requirement = ''
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Vehicle Factory & Radar Station'
      }
    } else if (unitType === 'ambulance') {
      if (hasVehicleFactory && hasHospital) {
        button.classList.remove('disabled')
        button.dataset.requirement = ''
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Vehicle Factory & Hospital'
      }
    } else if (AIRCRAFT_TYPES.includes(unitType)) {
      button.classList.toggle('disabled', !hasAircraftProduction)
      button.dataset.requirement = hasAircraftProduction ? '' : 'Requires Plane Factory'
    } else if (controller.navalUnitTypes.includes(unitType) && unitType !== 'supplyShip') {
      if (hasShipyard) {
        button.classList.remove('disabled')
        button.dataset.requirement = ''
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Shipyard'
      }
    } else if (unitType === 'supplyShip') {
      const hasSupplyBuilding = hasGasStation || hasHospital || hasAmmunitionFactory || hasWorkshop
      if (hasShipyard && hasSupplyBuilding) {
        button.classList.remove('disabled')
        button.dataset.requirement = ''
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Shipyard and Gas Station, Hospital, Ammunition Factory, or Workshop'
      }
    } else if (unitType === 'mineLayer') {
      if (hasVehicleFactory && hasWorkshop && hasAmmunitionFactory) {
        button.classList.remove('disabled')
        button.dataset.requirement = ''
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Vehicle Factory, Workshop & Ammunition Factory'
      }
    } else if (unitType === 'mineSweeper') {
      if (hasVehicleFactory && hasWorkshop) {
        button.classList.remove('disabled')
        button.dataset.requirement = ''
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Vehicle Factory & Workshop'
      }
    } else if (controller.vehicleUnitTypes.includes(unitType)) {
      if (hasVehicleFactory) {
        button.classList.remove('disabled')
        button.dataset.requirement = '' // Clear tooltip
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Vehicle Factory' // Add tooltip
      }
    } else if (unitType === 'harvester') {
      if (hasVehicleFactory && hasRefinery) {
        button.classList.remove('disabled')
        button.dataset.requirement = '' // Clear tooltip
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Vehicle Factory & Ore Refinery' // Add tooltip
      }
    }
  })
}

export function updateBuildingButtonStates(controller) {
  // In edit mode, enable all buildings regardless of tech tree
  if (gameState.mapEditMode) {
    const buildingButtons = document.querySelectorAll('.production-button[data-building-type]')
    buildingButtons.forEach(button => {
      button.classList.remove('disabled')
      button.dataset.requirement = ''
      button.style.display = ''
    })
    return
  }

  const playerBuildings = (gameState.buildings || []).filter(
    b => b.owner === gameState.humanPlayer && b.health > 0
  )

  const ownedTypes = new Set(playerBuildings.map(building => building.type))

  const buildingButtons = document.querySelectorAll('.production-button[data-building-type]')

  buildingButtons.forEach(button => {
    const type = button.getAttribute('data-building-type')
    const shouldForceVisible =
      button.classList.contains('ready-for-placement') ||
      controller.getBuildingProductionCount(button) > 0

    if (!hasBuildingBlueprint(type, gameState.humanPlayer) || !gameState.availableBuildingTypes.has(type)) {
      button.classList.add('disabled')
      button.style.display = 'none'
      return
    }

    const advancedRequirement = getAdvancedBuildingRequirement(type, playerBuildings, gameState.humanPlayer)
    const req = getMissingBuildingRequirements(type, ownedTypes)
    if (type === 'technologyResearchCenter' && !hasResearchCenterPrerequisites(playerBuildings, gameState.humanPlayer) && req.length === 0) {
      req.push('operational Radar Station and Command Center')
    }
    const limit = buildingData[type]?.limit
    const count = playerBuildings.filter(building => building.type === type).length + controller.getBuildingProductionCount(button)
    if (Number.isFinite(limit) && count >= limit) {
      button.classList.add('disabled')
      button.dataset.requirement = `Limit ${limit} per player`
      button.title = button.dataset.requirement
      button.style.display = ''
      return
    }

    if (req.length > 0 || advancedRequirement) {
      button.classList.add('disabled')
      const requirementText = advancedRequirement || 'Requires ' + req.join(' & ')
      button.dataset.requirement = requirementText
      if (!shouldForceVisible && !buildingData[type]?.researchPerk) {
        button.style.display = 'none'
      } else {
        button.style.display = ''
      }
    } else {
      button.classList.remove('disabled')
      button.dataset.requirement = ''
      button.style.display = ''
    }
  })
}
