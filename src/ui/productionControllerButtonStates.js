import { gameState } from '../gameState.js'
import { buildingData } from '../buildings.js'

export function updateVehicleButtonStates(controller) {
  // In edit mode, enable all units regardless of tech tree
  if (gameState.mapEditMode) {
    const unitButtons = document.querySelectorAll('.production-button[data-unit-type]')
    unitButtons.forEach(button => {
      button.classList.remove('disabled')
      button.title = ''
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
  const hasAmmunitionFactory = gameState.buildings.some(
    b => b.type === 'ammunitionFactory' && b.owner === gameState.humanPlayer && b.health > 0
  )

  unitButtons.forEach(button => {
    const unitType = button.getAttribute('data-unit-type')

    if (unitType === 'tankerTruck') {
      if (hasVehicleFactory && hasGasStation) {
        button.classList.remove('disabled')
        button.title = ''
      } else {
        button.classList.add('disabled')
        button.title = 'Requires Vehicle Factory & Gas Station'
      }
    } else if (unitType === 'recoveryTank') {
      if (hasVehicleFactory && hasWorkshop) {
        button.classList.remove('disabled')
        button.title = ''
      } else {
        button.classList.add('disabled')
        button.title = 'Requires Vehicle Factory & Workshop'
      }
    } else if (unitType === 'ammunitionTruck') {
      if (hasVehicleFactory && hasAmmunitionFactory) {
        button.classList.remove('disabled')
        button.title = ''
      } else {
        button.classList.add('disabled')
        button.title = 'Requires Vehicle Factory & Ammunition Factory'
      }
    } else if (unitType === 'howitzer') {
      if (hasVehicleFactory && hasRadar) {
        button.classList.remove('disabled')
        button.title = ''
      } else {
        button.classList.add('disabled')
        button.title = 'Requires Vehicle Factory & Radar Station'
      }
    } else if (unitType === 'ambulance') {
      if (hasVehicleFactory && hasHospital) {
        button.classList.remove('disabled')
        button.title = ''
      } else {
        button.classList.add('disabled')
        button.title = 'Requires Vehicle Factory & Hospital'
      }
    } else if (unitType === 'apache') {
      if (hasHelipad) {
        button.classList.remove('disabled')
        button.title = ''
      } else {
        button.classList.add('disabled')
        button.title = 'Requires Helipad'
      }
    } else if (unitType === 'f22Raptor') {
      const hasAirstrip = gameState.buildings.some(b => b.type === 'airstrip' && b.owner === gameState.humanPlayer && b.health > 0)
      if (hasAirstrip) {
        button.classList.remove('disabled')
        button.title = ''
      } else {
        button.classList.add('disabled')
        button.title = 'Requires Airstrip'
      }
    } else if (unitType === 'mineLayer') {
      if (hasVehicleFactory && hasWorkshop && hasAmmunitionFactory) {
        button.classList.remove('disabled')
        button.title = ''
      } else {
        button.classList.add('disabled')
        button.title = 'Requires Vehicle Factory, Workshop & Ammunition Factory'
      }
    } else if (unitType === 'mineSweeper') {
      if (hasVehicleFactory && hasWorkshop) {
        button.classList.remove('disabled')
        button.title = ''
      } else {
        button.classList.add('disabled')
        button.title = 'Requires Vehicle Factory & Workshop'
      }
    } else if (controller.vehicleUnitTypes.includes(unitType)) {
      if (hasVehicleFactory) {
        button.classList.remove('disabled')
        button.title = '' // Clear tooltip
      } else {
        button.classList.add('disabled')
        button.title = 'Requires Vehicle Factory' // Add tooltip
      }
    } else if (unitType === 'harvester') {
      if (hasVehicleFactory && hasRefinery) {
        button.classList.remove('disabled')
        button.title = '' // Clear tooltip
      } else {
        button.classList.add('disabled')
        button.title = 'Requires Vehicle Factory & Ore Refinery' // Add tooltip
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
      button.title = ''
      button.style.display = ''
    })
    return
  }

  const playerBuildings = (gameState.buildings || []).filter(
    b => b.owner === gameState.humanPlayer && b.health > 0
  )

  const hasRadar = playerBuildings.some(b => b.type === 'radarStation')
  const hasConstructionYard = playerBuildings.some(b => b.type === 'constructionYard')
  const hasPowerPlant = playerBuildings.some(b => b.type === 'powerPlant')
  const hasRefinery = playerBuildings.some(b => b.type === 'oreRefinery')
  const hasVehicleFactory = playerBuildings.some(b => b.type === 'vehicleFactory')
  const hasVehicleWorkshop = playerBuildings.some(b => b.type === 'vehicleWorkshop')

  const buildingButtons = document.querySelectorAll('.production-button[data-building-type]')

  buildingButtons.forEach(button => {
    const type = button.getAttribute('data-building-type')
    let disable = false
    const req = []
    const shouldForceVisible =
      button.classList.contains('ready-for-placement') ||
      controller.getBuildingProductionCount(button) > 0

    if (!gameState.availableBuildingTypes.has(type)) {
      button.classList.add('disabled')
      button.style.display = 'none'
      return
    }

    const isPowerPlant = type === 'powerPlant'
    const isOreRefinery = type === 'oreRefinery'
    const isVehicleFactory = type === 'vehicleFactory'
    const isConstructionYardButton = type === 'constructionYard'
    const isStreet = type === 'street'

    if (!hasConstructionYard && !isConstructionYardButton && !isStreet) {
      disable = true
      if (!req.includes('Construction Yard')) req.push('Construction Yard')
    }

    if (buildingData[type]?.requiresRadar && !hasRadar && !isStreet) {
      disable = true
      if (!req.includes('Radar Station')) req.push('Radar Station')
    }

    if (buildingData[type]?.requiresVehicleFactory && !hasVehicleFactory && !isStreet) {
      disable = true
      if (!req.includes('Vehicle Factory')) req.push('Vehicle Factory')
    }

    if (!hasPowerPlant && !isPowerPlant && !isConstructionYardButton && !isStreet) {
      disable = true
      if (!req.includes('Power Plant')) req.push('Power Plant')
    }

    if (hasPowerPlant && !hasRefinery && !isPowerPlant && !isOreRefinery && !isConstructionYardButton && !isStreet) {
      disable = true
      if (!req.includes('Ore Refinery')) req.push('Ore Refinery')
    }

    if (hasPowerPlant && hasRefinery && !hasVehicleFactory && !isPowerPlant && !isOreRefinery && !isVehicleFactory && !isConstructionYardButton && !isStreet) {
      disable = true
      if (!req.includes('Vehicle Factory')) req.push('Vehicle Factory')
    }

    if (isConstructionYardButton && !hasVehicleWorkshop) {
      disable = true
      if (!req.includes('Vehicle Workshop')) req.push('Vehicle Workshop')
    }

    // Vehicle Factory now only requires Power Plant (removed refinery requirement)

    if (disable) {
      button.classList.add('disabled')
      const requirementText = req.length ? 'Requires ' + req.join(' & ') : ''
      button.title = requirementText
      if (!shouldForceVisible) {
        button.style.display = 'none'
      } else {
        button.style.display = ''
      }
    } else {
      button.classList.remove('disabled')
      button.title = ''
      button.style.display = ''
    }
  })
}
