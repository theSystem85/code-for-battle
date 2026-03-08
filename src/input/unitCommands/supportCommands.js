import { TILE_SIZE } from '../../config.js'
import { playSound, playPositionalSound } from '../../sound.js'
import { showNotification } from '../../ui/notifications.js'
import { findPathForOwner } from '../../units.js'
import { gameState } from '../../gameState.js'
import { forceHarvesterUnloadPriority } from '../../game/harvesterLogic.js'
import { UTILITY_QUEUE_MODES } from './utilityHelpers.js'
import {
  canAmbulanceProvideCrew,
  canTankerProvideFuel,
  canAmmunitionTruckOperate,
  canAmmunitionTruckProvideAmmo,
  canRecoveryTankRepair
} from './utilityQueue.js'

export function handleRefineryUnloadCommand(handler, selectedUnits, refinery, mapGrid) {
  selectedUnits.forEach(u => { u.commandQueue = []; u.currentCommand = null })
  handler.clearAttackGroupState(selectedUnits)

  let harvestersCommanded = 0

  selectedUnits.forEach(unit => {
    if (unit.type === 'harvester') {
      unit.guardTarget = null
      unit.guardMode = false
      unit.assignedRefinery = refinery

      if (unit.oreCarried > 0) {
        forceHarvesterUnloadPriority(unit, refinery, handler.units || [])

        const path = findPathForOwner(
          { x: unit.tileX, y: unit.tileY },
          {
            x: refinery.x + Math.floor(refinery.width / 2),
            y: refinery.y + Math.floor(refinery.height / 2)
          },
          mapGrid,
          gameState.occupancyMap,
          unit.owner
        )

        if (path && path.length > 0) {
          unit.path = path.length > 1 ? path.slice(1) : path
          unit.target = null
          unit.moveTarget = { x: refinery.x + Math.floor(refinery.width / 2),
            y: refinery.y + Math.floor(refinery.height / 2) }
          unit.forcedAttack = false
        }
      }

      harvestersCommanded++
    }
  })

  if (harvestersCommanded > 0) {
    playSound('confirmed', 0.8)
  }
}

export function handleHarvesterCommand(handler, selectedUnits, oreTarget, mapGrid) {
  selectedUnits.forEach(u => { u.commandQueue = []; u.currentCommand = null })
  handler.clearAttackGroupState(selectedUnits)

  let anyAssigned = false
  selectedUnits.forEach(unit => {
    if (unit.type === 'harvester') {
      unit.guardTarget = null
      unit.guardMode = false
      const path = findPathForOwner(
        { x: unit.tileX, y: unit.tileY },
        oreTarget,
        mapGrid,
        gameState.occupancyMap,
        unit.owner
      )

      if (path && path.length > 0) {
        unit.path = path.length > 1 ? path.slice(1) : path
        unit.manualOreTarget = oreTarget
        unit.oreField = null
        unit.target = null
        unit.moveTarget = oreTarget
        unit.forcedAttack = false
        anyAssigned = true
      }
    }
  })

  if (anyAssigned) {
    const avgX = selectedUnits.reduce((sum, u) => sum + u.x, 0) / selectedUnits.length
    const avgY = selectedUnits.reduce((sum, u) => sum + u.y, 0) / selectedUnits.length
    playPositionalSound('movement', avgX, avgY, 0.5)
  }
}

export function handleRepairWorkshopCommand(handler, selectedUnits, workshop, mapGrid) {
  selectedUnits.forEach(u => { u.commandQueue = []; u.currentCommand = null })
  handler.clearAttackGroupState(selectedUnits)

  selectedUnits.forEach((unit, index) => {
    unit.guardTarget = null
    unit.guardMode = false
    if (!workshop.repairQueue) workshop.repairQueue = []
    if (!workshop.repairQueue.includes(unit)) {
      workshop.repairQueue.push(unit)
      unit.targetWorkshop = workshop
    }

    const waitingY = workshop.y + workshop.height + 1
    const waitingX = workshop.x + (index % workshop.width)
    const targetTile = { x: waitingX, y: waitingY }

    const path = findPathForOwner({ x: unit.tileX, y: unit.tileY }, targetTile, mapGrid, gameState.occupancyMap, unit.owner)
    if (path && path.length > 0) {
      unit.path = path.length > 1 ? path.slice(1) : path
      unit.moveTarget = targetTile
    } else {
      unit.x = targetTile.x * TILE_SIZE
      unit.y = targetTile.y * TILE_SIZE
      unit.tileX = targetTile.x
      unit.tileY = targetTile.y
      unit.moveTarget = null
    }
  })
  playSound('movement', 0.5)
}

export function handleWorkshopRepairHotkey(handler, selectedUnits, mapGrid, queue = false, fromQueue = false) {
  const workshops = gameState.buildings.filter(b =>
    b.type === 'vehicleWorkshop' && b.owner === gameState.humanPlayer && b.health > 0
  )
  if (workshops.length === 0) {
    showNotification('No operational workshop available!', 2000)
    return
  }

  const damaged = selectedUnits.filter(u => u.health < u.maxHealth)
  if (damaged.length === 0) {
    if (!fromQueue) showNotification('No damaged units selected', 2000)
    return
  }

  damaged.forEach(unit => {
    let nearest = null
    let nearestDist = Infinity
    workshops.forEach(ws => {
      const dist = Math.hypot(unit.tileX - ws.x, unit.tileY - ws.y)
      if (dist < nearestDist) { nearest = ws; nearestDist = dist }
    })
    if (!nearest) return

    if (queue) {
      if (!unit.commandQueue) unit.commandQueue = []
      unit.commandQueue.push({ type: 'workshopRepair' })
    } else {
      unit.returnTile = { x: unit.tileX, y: unit.tileY }
      if (!nearest.repairQueue) nearest.repairQueue = []
      if (!nearest.repairQueue.includes(unit)) {
        nearest.repairQueue.push(unit)
        unit.targetWorkshop = nearest
      }
      const waitingY = nearest.y + nearest.height + 1
      const waitingX = nearest.x + (nearest.repairQueue.indexOf(unit) % nearest.width)
      const targetTile = { x: waitingX, y: waitingY }
      const path = findPathForOwner({ x: unit.tileX, y: unit.tileY }, targetTile, mapGrid, gameState.occupancyMap, unit.owner)
      if (path && path.length > 0) {
        unit.path = path.slice(1)
        unit.moveTarget = targetTile
      } else {
        unit.x = targetTile.x * TILE_SIZE
        unit.y = targetTile.y * TILE_SIZE
        unit.tileX = targetTile.x
        unit.tileY = targetTile.y
        unit.moveTarget = null
      }
      if (!fromQueue) playSound('movement', 0.5)
    }
  })
}

export function handleAmbulanceHealCommand(handler, selectedUnits, targetUnit, mapGrid, options = {}) {
  const { append = false, suppressNotifications = false } = options
  const ambulances = selectedUnits.filter(unit => handler.canAmbulanceProvideCrew ? handler.canAmbulanceProvideCrew(unit) : canAmbulanceProvideCrew(unit))
  if (ambulances.length === 0) {
    showNotification('No ambulances with crew selected!', 2000)
    return
  }

  if (!targetUnit || !targetUnit.crew || typeof targetUnit.crew !== 'object') {
    showNotification('Target unit cannot be healed!', 2000)
    return
  }

  const missingCrew = Object.entries(targetUnit.crew).some(([_, alive]) => !alive)
  if (!missingCrew) {
    showNotification('Target unit is already fully crewed!', 2000)
    return
  }

  let anyStarted = false
  ambulances.forEach(ambulance => {
    const result = handler.setUtilityQueue(ambulance, [targetUnit], UTILITY_QUEUE_MODES.HEAL, mapGrid, {
      append,
      suppressNotifications
    })
    if (result.addedTargets.length > 0 || result.started) {
      anyStarted = true
    }
  })

  if (anyStarted) {
    playSound('movement', 0.5)
  }
}

export function handleTankerRefuelCommand(handler, selectedUnits, targetUnit, mapGrid, options = {}) {
  const { append = false, suppressNotifications = false } = options
  const tankers = selectedUnits.filter(unit => handler.canTankerProvideFuel ? handler.canTankerProvideFuel(unit) : canTankerProvideFuel(unit))
  if (tankers.length === 0) {
    return
  }
  if (!targetUnit || typeof targetUnit.maxGas !== 'number' || targetUnit.gas >= targetUnit.maxGas) {
    showNotification('Target unit does not need fuel!', 2000)
    return
  }

  let anyStarted = false
  tankers.forEach(tanker => {
    const result = handler.setUtilityQueue(tanker, [targetUnit], UTILITY_QUEUE_MODES.REFUEL, mapGrid, {
      append,
      suppressNotifications
    })
    if (result.addedTargets.length > 0 || result.started) {
      anyStarted = true
    }
  })

  if (anyStarted) {
    playSound('movement', 0.5)
  }
}

export function handleAmmunitionTruckResupplyCommand(handler, selectedUnits, target, mapGrid, options = {}) {
  const { suppressNotifications = false } = options
  const operableTrucks = selectedUnits.filter(unit => handler.canAmmunitionTruckOperate ? handler.canAmmunitionTruckOperate(unit) : canAmmunitionTruckOperate(unit))
  const ammoTrucks = operableTrucks.filter(unit => handler.canAmmunitionTruckProvideAmmo ? handler.canAmmunitionTruckProvideAmmo(unit) : canAmmunitionTruckProvideAmmo(unit))

  const isUnit = typeof target.tileX === 'number'
  const isAmmoFactory = !isUnit && target.type === 'ammunitionFactory'

  if (isAmmoFactory) {
    const reloadableTrucks = operableTrucks.filter(unit => unit.ammoCargo < unit.maxAmmoCargo)
    if (reloadableTrucks.length === 0) {
      if (!suppressNotifications) {
        showNotification('Ammunition trucks are already fully loaded!', 2000)
      }
      return
    }
    handler.handleAmmunitionTruckReloadCommand(reloadableTrucks, target, mapGrid, { suppressNotifications })
    return
  }

  if (ammoTrucks.length === 0) {
    if (!suppressNotifications) {
      showNotification('No ammunition trucks with ammo selected!', 2000)
    }
    return
  }

  const needsAmmo = isUnit ?
    ((target.type === 'apache' || target.type === 'f35') ?
      (typeof target.maxRocketAmmo === 'number' && target.rocketAmmo < target.maxRocketAmmo) :
      (typeof target.maxAmmunition === 'number' && target.ammunition < target.maxAmmunition)) :
    (typeof target.maxAmmo === 'number' && target.ammo < target.maxAmmo)

  if (!needsAmmo) {
    if (!suppressNotifications) {
      showNotification('Target does not need ammo!', 2000)
    }
    return
  }

  let anyStarted = false
  ammoTrucks.forEach(ammoTruck => {
    if (handler.assignAmmunitionTruckToTarget(ammoTruck, target, mapGrid, { suppressNotifications: true })) {
      anyStarted = true
    }
  })

  if (anyStarted) {
    playSound('movement', 0.5)
  }
}

export function handleAmmunitionTruckReloadCommand(handler, selectedUnits, factory, mapGrid, options = {}) {
  const { suppressNotifications = false } = options
  if (!factory || factory.type !== 'ammunitionFactory') {
    return
  }

  const ammoTrucks = selectedUnits.filter(unit => handler.canAmmunitionTruckOperate ? handler.canAmmunitionTruckOperate(unit) : canAmmunitionTruckOperate(unit))
  if (ammoTrucks.length === 0) {
    if (!suppressNotifications) {
      showNotification('No ammunition trucks are available!', 2000)
    }
    return
  }

  const reloadable = ammoTrucks.filter(truck => truck.ammoCargo < truck.maxAmmoCargo)
  if (reloadable.length === 0) {
    if (!suppressNotifications) {
      showNotification('Ammunition trucks are already fully loaded!', 2000)
    }
    return
  }

  let anyStarted = false
  reloadable.forEach(ammoTruck => {
    if (handler.assignAmmunitionTruckToTarget(ammoTruck, factory, mapGrid, { suppressNotifications: true, mode: 'reload' })) {
      anyStarted = true
    }
  })

  if (anyStarted) {
    playSound('movement', 0.5)
  }
}

export function handleServiceProviderRequest(handler, provider, selectedUnits, mapGrid) {
  if (!provider || !Array.isArray(selectedUnits) || selectedUnits.length === 0) {
    return false
  }

  let mode = null
  if (provider.type === 'ambulance') {
    if (!handler.canAmbulanceProvideCrew(provider)) return false
    mode = UTILITY_QUEUE_MODES.HEAL
  } else if (provider.type === 'tankerTruck') {
    if (!handler.canTankerProvideFuel(provider)) return false
    mode = UTILITY_QUEUE_MODES.REFUEL
  } else if (provider.type === 'recoveryTank') {
    if (!handler.canRecoveryTankRepair(provider)) return false
    mode = UTILITY_QUEUE_MODES.REPAIR
  } else if (provider.type === 'ammunitionTruck') {
    if (!handler.canAmmunitionTruckProvideAmmo(provider)) return false
    mode = UTILITY_QUEUE_MODES.AMMO
  }

  if (!mode) {
    return false
  }

  const eligibleTargets = selectedUnits.filter(unit => handler.isUtilityTargetValid(mode, provider, unit))
  if (eligibleTargets.length === 0) {
    return false
  }

  const queueResult = handler.setUtilityQueue(provider, eligibleTargets, mode, mapGrid, {
    append: true,
    suppressNotifications: true,
    priority: true
  })

  if ((queueResult.addedTargets && queueResult.addedTargets.length > 0) || queueResult.started) {
    playSound('movement', 0.5)
    return true
  }

  return false
}

export function handleAmbulanceRefillCommand(handler, selectedUnits, hospital, mapGrid) {
  const ambulances = selectedUnits.filter(unit =>
    unit.type === 'ambulance' && unit.medics < 4
  )

  if (ambulances.length === 0) {
    showNotification('No ambulances need refilling!', 2000)
    return
  }

  ambulances.forEach(ambulance => {
    ambulance.refillingTarget = hospital

    const hospitalCenterX = hospital.x + Math.floor(hospital.width / 2)
    const refillY = hospital.y + hospital.height + 1

    const refillPositions = [
      { x: hospitalCenterX - 1, y: refillY },
      { x: hospitalCenterX, y: refillY },
      { x: hospitalCenterX + 1, y: refillY },
      { x: hospitalCenterX - 1, y: refillY + 1 },
      { x: hospitalCenterX, y: refillY + 1 },
      { x: hospitalCenterX + 1, y: refillY + 1 },
      { x: hospitalCenterX - 1, y: refillY + 2 },
      { x: hospitalCenterX, y: refillY + 2 },
      { x: hospitalCenterX + 1, y: refillY + 2 }
    ]

    let destinationFound = false
    for (const pos of refillPositions) {
      if (pos.x >= 0 && pos.y >= 0 && pos.x < mapGrid[0].length && pos.y < mapGrid.length) {
        const path = findPathForOwner(
          { x: ambulance.tileX, y: ambulance.tileY },
          { x: pos.x, y: pos.y },
          mapGrid,
          gameState.occupancyMap,
          ambulance.owner
        )
        if (path && path.length > 0) {
          ambulance.path = path
          ambulance.moveTarget = { x: pos.x * TILE_SIZE, y: pos.y * TILE_SIZE }
          ambulance.target = null
          destinationFound = true
          break
        }
      }
    }

    if (!destinationFound) {
      showNotification('Cannot reach hospital refill area!', 2000)
      ambulance.refillingTarget = null
    }
  })

  playSound('movement', 0.5)
}

export function handleGasStationRefillCommand(handler, selectedUnits, station, mapGrid) {
  const unitsNeedingGas = selectedUnits.filter(
    u => typeof u.maxGas === 'number' && u.gas < u.maxGas * 0.75
  )

  if (unitsNeedingGas.length === 0) {
    showNotification('No units need refilling!', 2000)
    return
  }

  const positions = []
  for (let x = station.x - 1; x <= station.x + station.width; x++) {
    for (let y = station.y - 1; y <= station.y + station.height; y++) {
      const insideX = x >= station.x && x < station.x + station.width
      const insideY = y >= station.y && y < station.y + station.height
      if (insideX && insideY) continue
      if (x >= 0 && y >= 0 && x < mapGrid[0].length && y < mapGrid.length) {
        positions.push({ x, y })
      }
    }
  }

  unitsNeedingGas.forEach((unit, index) => {
    const pos = positions[index % positions.length]
    const path = findPathForOwner(
      { x: unit.tileX, y: unit.tileY },
      { x: pos.x, y: pos.y },
      mapGrid,
      gameState.occupancyMap,
      unit.owner
    )
    if (path && path.length > 0) {
      unit.path = path
      unit.moveTarget = { x: pos.x * TILE_SIZE, y: pos.y * TILE_SIZE }
    }
  })
  playSound('movement', 0.5)
}

export function handleRecoveryTowCommand(handler, selectedUnits, targetUnit) {
  const tanks = selectedUnits.filter(u => u.type === 'recoveryTank')
  if (tanks.length === 0) return
  if (targetUnit?.restorationProtectedFromRecovery) {
    showNotification('Cannot tow units leaving the workshop.', 2000)
    return
  }

  tanks.forEach(tank => {
    if (tank.towedUnit && tank.towedUnit.id === targetUnit.id) {
      tank.towedUnit.towedBy = null
      tank.towedUnit = null
      return
    }
    if (!tank.towedUnit && targetUnit.crew && (!targetUnit.crew.driver || !targetUnit.crew.commander)) {
      tank.towedUnit = targetUnit
      targetUnit.towedBy = tank
    }
  })
}

export function handleRecoveryTankRepairCommand(handler, selectedUnits, targetUnit, mapGrid, options = {}) {
  const { append = false, suppressNotifications = false } = options
  const recoveryTanks = selectedUnits.filter(unit => handler.canRecoveryTankRepair ? handler.canRecoveryTankRepair(unit) : canRecoveryTankRepair(unit))
  if (recoveryTanks.length === 0) {
    return
  }

  if (!targetUnit || targetUnit.health >= targetUnit.maxHealth) {
    showNotification('Target unit does not need repairs!', 2000)
    return
  }

  let anyStarted = false
  recoveryTanks.forEach(tank => {
    const result = handler.setUtilityQueue(tank, [targetUnit], UTILITY_QUEUE_MODES.REPAIR, mapGrid, {
      append,
      suppressNotifications
    })
    if (result.addedTargets.length > 0 || result.started) {
      anyStarted = true
    }
  })

  if (anyStarted) {
    playSound('movement', 0.5)
  }
}

export function handleRecoveryWreckTowCommand(handler, selectedUnits, wreck, mapGrid, options = {}) {
  if (!wreck) return
  const { append = false, suppressNotifications = false } = options
  const recoveryTanks = selectedUnits.filter(u => handler.canRecoveryTankRepair ? handler.canRecoveryTankRepair(u) : canRecoveryTankRepair(u))
  if (recoveryTanks.length === 0) return

  if (append) {
    const queuedEntry = { id: wreck.id, isWreckTarget: true, queueAction: 'tow' }
    let anyQueued = false
    recoveryTanks.some(tank => {
      const result = handler.setUtilityQueue(tank, [queuedEntry], UTILITY_QUEUE_MODES.REPAIR, mapGrid, {
        append: true,
        suppressNotifications: true
      })
      if (result.addedTargets.length > 0 || result.started) {
        anyQueued = true
        return true
      }
      return false
    })

    if (anyQueued && !suppressNotifications) {
      playSound('movement', 0.5)
    } else if (!anyQueued && !suppressNotifications) {
      showNotification('All selected recovery tanks are busy.', 2000)
    }
    return
  }

  const availableTank = recoveryTanks.find(tank => !tank.recoveryTask || tank.recoveryTask.wreckId === wreck.id)
  if (!availableTank) {
    if (!suppressNotifications) {
      showNotification('All selected recovery tanks are busy.', 2000)
    }
    return
  }

  handler.assignRecoveryTankToWreck(availableTank, wreck, mapGrid, { mode: 'tow', suppressNotifications })
}

export function handleRecoveryWreckRecycleCommand(handler, selectedUnits, wreck, mapGrid, options = {}) {
  if (!wreck) return
  const { append = false, suppressNotifications = false } = options
  const recoveryTanks = selectedUnits.filter(u => handler.canRecoveryTankRepair ? handler.canRecoveryTankRepair(u) : canRecoveryTankRepair(u))
  if (recoveryTanks.length === 0) return

  if (append) {
    const queuedEntry = { id: wreck.id, isWreckTarget: true, queueAction: 'recycle' }
    let anyQueued = false
    recoveryTanks.some(tank => {
      const result = handler.setUtilityQueue(tank, [queuedEntry], UTILITY_QUEUE_MODES.REPAIR, mapGrid, {
        append: true,
        suppressNotifications: true
      })
      if (result.addedTargets.length > 0 || result.started) {
        anyQueued = true
        return true
      }
      return false
    })

    if (anyQueued && !suppressNotifications) {
      playSound('movement', 0.5)
    } else if (!anyQueued && !suppressNotifications) {
      showNotification('All selected recovery tanks are busy.', 2000)
    }
    return
  }

  const availableTank = recoveryTanks.find(tank => !tank.recoveryTask || tank.recoveryTask.wreckId === wreck.id)
  if (!availableTank) {
    if (!suppressNotifications) {
      showNotification('All selected recovery tanks are busy.', 2000)
    }
    return
  }

  handler.assignRecoveryTankToWreck(availableTank, wreck, mapGrid, { mode: 'recycle', suppressNotifications })
}

export function handleDamagedUnitToRecoveryTankCommand(handler, selectedUnits, recoveryTank, mapGrid) {
  const damagedUnits = selectedUnits.filter(unit => unit.health < unit.maxHealth && unit.type !== 'recoveryTank')
  if (damagedUnits.length === 0) {
    return
  }

  const result = handler.setUtilityQueue(recoveryTank, damagedUnits, UTILITY_QUEUE_MODES.REPAIR, mapGrid, {
    append: true,
    suppressNotifications: true,
    priority: true
  })

  if ((result.addedTargets && result.addedTargets.length > 0) || result.started) {
    playSound('movement', 0.5)
  }
}
