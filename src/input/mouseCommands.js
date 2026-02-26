import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { markWaypointsAdded } from '../game/waypointSounds.js'
import { findWreckAtTile } from '../game/unitWreckManager.js'
import { playSound } from '../sound.js'
import { findEnemyTarget } from './mouseHelpers.js'
import { isForceAttackModifierActive } from '../utils/inputUtils.js'
import { initiateRetreat } from '../behaviours/retreat.js'
import { getUnitSelectionCenter } from './selectionManager.js'

const DEFENSIVE_BUILDING_TYPES = new Set(['turretGunV1', 'turretGunV2', 'turretGunV3', 'rocketTurret', 'teslaCoil', 'artilleryTurret'])
const AIRSTRIP_SUPPLY_UNIT_TYPES = new Set(['ambulance', 'tankerTruck', 'ammunitionTruck', 'recoveryTank'])


function findForcedAttackTargetForBuilding(worldX, worldY, units, selectionManager, gameFactories = []) {
  let target = findEnemyTarget(worldX, worldY, gameFactories, units)
  if (target) {
    return target
  }

  if (gameState.buildings && gameState.buildings.length > 0) {
    for (const building of gameState.buildings) {
      if (!building || building.health <= 0 || selectionManager.isHumanPlayerBuilding(building)) {
        continue
      }
      const buildingX = building.x * TILE_SIZE
      const buildingY = building.y * TILE_SIZE
      const buildingWidth = building.width * TILE_SIZE
      const buildingHeight = building.height * TILE_SIZE
      if (worldX >= buildingX && worldX < buildingX + buildingWidth && worldY >= buildingY && worldY < buildingY + buildingHeight) {
        target = building
        break
      }
    }
  }

  return target
}


function queueDefenseBuildingTarget(building, target) {
  if (!building || !target) {
    return false
  }

  if (!Array.isArray(building.forcedAttackQueue)) {
    building.forcedAttackQueue = []
  }

  const isSameTarget = candidate => candidate && target && candidate.id === target.id
  const currentTarget = building.forcedAttackTarget
  const targetAlreadyQueued = building.forcedAttackQueue.some(isSameTarget)

  if (!currentTarget || currentTarget.health <= 0) {
    building.forcedAttackTarget = target
  } else if (!isSameTarget(currentTarget) && !targetAlreadyQueued) {
    // New target becomes active immediately; previous active target is queued next.
    building.forcedAttackQueue.unshift(currentTarget)
    building.forcedAttackTarget = target
  }

  building.forcedAttack = true
  building.holdFire = false
  return true
}

export function handleForceAttackCommand(handler, worldX, worldY, units, selectedUnits, unitCommands, mapGrid, selectionManager) {
  const commandableUnits = selectedUnits.filter(u => selectionManager.isCommandableUnit(u))
  if (commandableUnits.length === 0) {
    return false
  }
  selectionManager.clearWreckSelection()
  if (commandableUnits[0].type !== 'factory') {
    let forceAttackTarget = null
    const first = commandableUnits[0]

    if (first.isBuilding) {
      forceAttackTarget = findForcedAttackTargetForBuilding(worldX, worldY, units, selectionManager, handler.gameFactories || [])
    } else {
      if (gameState.buildings && gameState.buildings.length > 0) {
        for (const building of gameState.buildings) {
          if (selectionManager.isHumanPlayerBuilding(building)) {
            const buildingX = building.x * TILE_SIZE
            const buildingY = building.y * TILE_SIZE
            const buildingWidth = building.width * TILE_SIZE
            const buildingHeight = building.height * TILE_SIZE

            if (worldX >= buildingX &&
                worldX < buildingX + buildingWidth &&
                worldY >= buildingY &&
                worldY < buildingY + buildingHeight) {
              forceAttackTarget = building
              break
            }
          }
        }
      }

      if (!forceAttackTarget) {
        for (const unit of units) {
          if (selectionManager.isHumanPlayerUnit(unit) && !unit.selected) {
            const { centerX, centerY } = getUnitSelectionCenter(unit)
            if (Math.hypot(worldX - centerX, worldY - centerY) < TILE_SIZE / 2) {
              forceAttackTarget = unit
              break
            }
          }
        }
      }
    }

    const targetTileX = Math.floor(worldX / TILE_SIZE)
    const targetTileY = Math.floor(worldY / TILE_SIZE)

    if (!forceAttackTarget) {
      const wreckTarget = findWreckAtTile(gameState, targetTileX, targetTileY)
      if (wreckTarget) {
        forceAttackTarget = wreckTarget
      }
    }

    if (!forceAttackTarget) {
      forceAttackTarget = {
        id: `ground_${targetTileX}_${targetTileY}_${Date.now()}`,
        type: 'groundTarget',
        x: worldX,
        y: worldY,
        tileX: targetTileX,
        tileY: targetTileY,
        health: 1,
        maxHealth: 1,
        isGroundTarget: true
      }
    }

    if (forceAttackTarget) {
      if (first.isBuilding) {
        commandableUnits.forEach(b => {
          queueDefenseBuildingTarget(b, forceAttackTarget)
        })
        return true
      } else {
        commandableUnits.forEach(unit => {
          unit.forcedAttack = true
        })
        unitCommands.handleAttackCommand(commandableUnits, forceAttackTarget, mapGrid, true)
        return true
      }
    }
  }
  return false
}

export function handleGuardCommand(_handler, worldX, worldY, units, selectedUnits, unitCommands, selectionManager, _mapGrid) {
  const commandableUnits = selectedUnits.filter(u => selectionManager.isCommandableUnit(u))
  if (commandableUnits.length === 0) {
    return false
  }
  let guardTarget = null
  for (const unit of units) {
    if (selectionManager.isHumanPlayerUnit(unit) && !unit.selected) {
      const { centerX, centerY } = getUnitSelectionCenter(unit)
      if (Math.hypot(worldX - centerX, worldY - centerY) < TILE_SIZE / 2) {
        guardTarget = unit
        break
      }
    }
  }

  if (guardTarget) {
    commandableUnits.forEach(u => {
      u.guardTarget = guardTarget
      u.guardMode = true
      u.target = null
      u.moveTarget = null
    })
    playSound('confirmed', 0.5)
    return true
  }
  return false
}

export function handleStandardCommands(handler, worldX, worldY, selectedUnits, unitCommands, mapGrid, altPressed = false) {
  const selectionManager = handler.selectionManager
  const commandableUnits = selectedUnits.filter(u => selectionManager.isCommandableUnit(u) && !u.isBuilding)
  if (commandableUnits.length === 0 || commandableUnits[0].type === 'factory') {
    return
  }

  let target = null
  let oreTarget = null
  let refineryTarget = null

  const tileX = Math.floor(worldX / TILE_SIZE)
  const tileY = Math.floor(worldY / TILE_SIZE)
  const hasSelectedHarvesters = commandableUnits.some(unit => unit.type === 'harvester')
  const hasSelectedApaches = commandableUnits.some(unit => unit.type === 'apache')

  if (
    hasSelectedApaches &&
    commandableUnits.every(unit => unit.type === 'apache') &&
    gameState.buildings &&
    Array.isArray(gameState.buildings)
  ) {
    for (const building of gameState.buildings) {
      if (building.type === 'helipad' &&
          building.owner === gameState.humanPlayer &&
          building.health > 0 &&
          tileX >= building.x && tileX < building.x + building.width &&
          tileY >= building.y && tileY < building.y + building.height) {
        unitCommands.handleApacheHelipadCommand(commandableUnits, building, mapGrid)
        return
      }
    }
  }

  if (hasSelectedHarvesters && gameState.buildings && Array.isArray(gameState.buildings)) {
    for (const building of gameState.buildings) {
      if (building.type === 'oreRefinery' &&
          building.owner === gameState.humanPlayer &&
          building.health > 0 &&
          tileX >= building.x && tileX < building.x + building.width &&
          tileY >= building.y && tileY < building.y + building.height) {
        refineryTarget = building
        break
      }
    }
  }

  if (hasSelectedHarvesters &&
      mapGrid && Array.isArray(mapGrid) && mapGrid.length > 0 &&
      tileX >= 0 && tileY >= 0 && tileX < mapGrid[0].length && tileY < mapGrid.length &&
      mapGrid[tileY][tileX].ore) {
    oreTarget = { x: tileX, y: tileY }
  }

  let workshopTarget = null
  let hospitalTarget = null
  let gasStationTarget = null
  if (gameState.buildings && Array.isArray(gameState.buildings)) {
    for (const building of gameState.buildings) {
      if (building.type === 'vehicleWorkshop' && building.owner === gameState.humanPlayer && building.health > 0 &&
          tileX >= building.x && tileX < building.x + building.width &&
          tileY >= building.y && tileY < building.y + building.height) {
        workshopTarget = building
        break
      }
    }

    const hasNotFullyLoadedAmbulances = commandableUnits.some(unit => unit.type === 'ambulance' && unit.medics < 4)
    if (hasNotFullyLoadedAmbulances) {
      for (const building of gameState.buildings) {
        if (building.type === 'hospital' && building.owner === gameState.humanPlayer && building.health > 0 &&
            tileX >= building.x && tileX < building.x + building.width &&
            tileY >= building.y && tileY < building.y + building.height) {
          hospitalTarget = building
          break
        }
      }
    }

    const needsGas = commandableUnits.some(u => typeof u.maxGas === 'number' && u.gas < u.maxGas * 0.75)
    if (needsGas) {
      for (const building of gameState.buildings) {
        if (building.type === 'gasStation' && building.owner === gameState.humanPlayer && building.health > 0 &&
            tileX >= building.x && tileX < building.x + building.width &&
            tileY >= building.y && tileY < building.y + building.height) {
          gasStationTarget = building
          break
        }
      }
    }
  }

  if (refineryTarget) {
    unitCommands.handleRefineryUnloadCommand(commandableUnits, refineryTarget, mapGrid)
  } else if (workshopTarget) {
    unitCommands.handleRepairWorkshopCommand(commandableUnits, workshopTarget, mapGrid)
  } else if (hospitalTarget) {
    unitCommands.handleAmbulanceRefillCommand(commandableUnits, hospitalTarget, mapGrid)
  } else if (gasStationTarget) {
    unitCommands.handleGasStationRefillCommand(commandableUnits, gasStationTarget, mapGrid)
  } else if (oreTarget) {
    unitCommands.handleHarvesterCommand(commandableUnits, oreTarget, mapGrid)
  } else {
    const humanPlayer = gameState.humanPlayer || 'player1'
    const friendlyAirstrip = (gameState.buildings || []).find(building => {
      if (!building || building.health <= 0 || building.type !== 'airstrip') return false
      const isFriendly =
        building.owner === humanPlayer ||
        (humanPlayer === 'player1' && building.owner === 'player')
      return isFriendly &&
        tileX >= building.x && tileX < building.x + building.width &&
        tileY >= building.y && tileY < building.y + building.height
    })

    const clickedFriendlyBuilding = (gameState.buildings || []).some(building => {
      if (!building || building.health <= 0) return false
      const isFriendly =
        building.owner === humanPlayer ||
        (humanPlayer === 'player1' && building.owner === 'player')
      return isFriendly &&
        tileX >= building.x && tileX < building.x + building.width &&
        tileY >= building.y && tileY < building.y + building.height
    })

    const clickedFriendlyFactory = (handler.gameFactories || []).some(factory => {
      if (!factory) return false
      const isFriendly =
        factory.id === humanPlayer ||
        (humanPlayer === 'player1' && factory.id === 'player')
      return isFriendly &&
        worldX >= factory.x * TILE_SIZE &&
        worldX < (factory.x + factory.width) * TILE_SIZE &&
        worldY >= factory.y * TILE_SIZE &&
        worldY < (factory.y + factory.height) * TILE_SIZE
    })

    if (clickedFriendlyBuilding || clickedFriendlyFactory) {
      const onlyF22Selected = commandableUnits.length > 0 && commandableUnits.every(unit => unit.type === 'f22Raptor')
      const onlySupplyUnitsSelected =
        commandableUnits.length > 0 &&
        commandableUnits.every(unit => AIRSTRIP_SUPPLY_UNIT_TYPES.has(unit.type))

      if (friendlyAirstrip && (onlyF22Selected || onlySupplyUnitsSelected)) {
        unitCommands.handleMovementCommand(commandableUnits, worldX, worldY, mapGrid)
      }
      return
    }

    target = findEnemyTarget(worldX, worldY, handler.gameFactories || [], handler.gameUnits || [])

    if (target) {
      if (altPressed) {
        commandableUnits.forEach(unit => {
          if (!unit.commandQueue) unit.commandQueue = []
          unit.commandQueue.push({ type: 'attack', target })
        })
        markWaypointsAdded()
      } else {
        unitCommands.handleAttackCommand(commandableUnits, target, mapGrid, false)
      }
    } else {
      if (altPressed) {
        commandableUnits.forEach(unit => {
          if (!unit.commandQueue) unit.commandQueue = []
          unit.commandQueue.push({ type: 'move', x: worldX, y: worldY })
        })
        markWaypointsAdded()
      } else {
        unitCommands.handleMovementCommand(commandableUnits, worldX, worldY, mapGrid)
      }
    }
  }
}

export function handleServiceProviderClick(handler, provider, selectedUnits, unitCommands, mapGrid) {
  if (!unitCommands || !provider) {
    return false
  }
  const selectionManager = handler.selectionManager
  if (!selectionManager || !selectionManager.isHumanPlayerUnit(provider)) {
    return false
  }

  const providerTypes = ['ammunitionTruck', 'tankerTruck', 'ambulance', 'recoveryTank']
  if (!providerTypes.includes(provider.type)) {
    return false
  }

  const requesters = selectedUnits.filter(unit => {
    const isFriendlyUnit = selectionManager.isHumanPlayerUnit(unit)
    const isFriendlyBuilding = Boolean(unit?.isBuilding && selectionManager.isHumanPlayerBuilding(unit))
    return (isFriendlyUnit || isFriendlyBuilding) && unit.id !== provider.id
  })

  if (requesters.length === 0) {
    return false
  }

  if (provider.type === 'ammunitionTruck') {
    let handled = false
    requesters.forEach(requester => {
      const needsAmmo = requester.isBuilding
        ? (typeof requester.maxAmmo === 'number' && requester.ammo < requester.maxAmmo)
        : (requester.type === 'apache'
          ? (typeof requester.maxRocketAmmo === 'number' && requester.rocketAmmo < requester.maxRocketAmmo)
          : (typeof requester.maxAmmunition === 'number' && requester.ammunition < requester.maxAmmunition))
      if (needsAmmo) {
        unitCommands.handleAmmunitionTruckResupplyCommand([provider], requester, mapGrid, { suppressNotifications: true })
        handled = true
      }
    })
    return handled
  }

  return unitCommands.handleServiceProviderRequest(provider, requesters, mapGrid)
}

export function handleFallbackCommand(handler, worldX, worldY, selectedUnits, unitCommands, mapGrid, e, units = [], factories = []) {
  if (selectedUnits.length === 0 || gameState.buildingPlacementMode || gameState.repairMode || gameState.sellMode) {
    return
  }
  const selectionManager = handler.selectionManager
  const commandableUnits = selectedUnits.filter(u => selectionManager.isCommandableUnit(u) && !u.isBuilding)
  if (commandableUnits.length === 0) {
    return
  }

  if (e.shiftKey) {
    initiateRetreat(commandableUnits, worldX, worldY, mapGrid)
    return
  }

  const defensiveBuildings = selectedUnits.filter(unit =>
    selectionManager.isCommandableUnit(unit) &&
    unit?.isBuilding && unit.owner === gameState.humanPlayer && DEFENSIVE_BUILDING_TYPES.has(unit.type)
  )

  if (!isForceAttackModifierActive(e) && defensiveBuildings.length > 0) {
    const fallbackTarget = findForcedAttackTargetForBuilding(worldX, worldY, units, selectionManager, factories)
    if (fallbackTarget && (fallbackTarget.health === undefined || fallbackTarget.health > 0)) {
      defensiveBuildings.forEach(building => {
        queueDefenseBuildingTarget(building, fallbackTarget)
      })
    }
  }

  if (e.altKey) {
    handleStandardCommands(handler, worldX, worldY, commandableUnits, unitCommands, mapGrid, true)
  } else if (!isForceAttackModifierActive(e)) {
    handleStandardCommands(handler, worldX, worldY, commandableUnits, unitCommands, mapGrid, false)
  }
}
