import { gameState } from '../gameState.js'
import { getMissingBuildingRequirements } from '../production/buildingRequirements.js'

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
  const hasHelipad = gameState.buildings.some(
    b => b.type === 'helipad' && b.owner === gameState.humanPlayer && b.health > 0
  )
  const hasShipyard = gameState.buildings.some(
    b => b.type === 'shipyard' && b.owner === gameState.humanPlayer && b.health > 0
  )
  const hasAmmunitionFactory = gameState.buildings.some(
    b => b.type === 'ammunitionFactory' && b.owner === gameState.humanPlayer && b.health > 0
  )

  unitButtons.forEach(button => {
    const unitType = button.getAttribute('data-unit-type')

    if (unitType === 'tankerTruck') {
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
    } else if (unitType === 'apache') {
      if (hasHelipad) {
        button.classList.remove('disabled')
        button.dataset.requirement = ''
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Helipad'
      }
    } else if (unitType === 'f22Raptor') {
      const hasAirstrip = gameState.buildings.some(b => b.type === 'airstrip' && b.owner === gameState.humanPlayer && b.health > 0)
      if (hasAirstrip) {
        button.classList.remove('disabled')
        button.dataset.requirement = ''
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Airstrip'
      }
    } else if (unitType === 'f35') {
      const hasAirstrip = gameState.buildings.some(b => b.type === 'airstrip' && b.owner === gameState.humanPlayer && b.health > 0)
      if ((hasHelipad || hasAirstrip) && hasAmmunitionFactory) {
        button.classList.remove('disabled')
        button.dataset.requirement = ''
      } else {
        button.classList.add('disabled')
        button.dataset.requirement = 'Requires Helipad or Airstrip and Ammunition Factory'
      }
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

    if (!gameState.availableBuildingTypes.has(type)) {
      button.classList.add('disabled')
      button.style.display = 'none'
      return
    }

    const req = getMissingBuildingRequirements(type, ownedTypes)

    if (req.length > 0) {
      button.classList.add('disabled')
      const requirementText = req.length ? 'Requires ' + req.join(' & ') : ''
      button.dataset.requirement = requirementText
      if (!shouldForceVisible) {
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
