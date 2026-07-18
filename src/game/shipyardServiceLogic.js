import { AMMO_RESUPPLY_TIME, GAS_REFILL_TIME } from '../config.js'
import { logPerformance } from '../performanceUtils.js'
import {
  hasShipyardServiceDependency,
  isNavalUnitInShipyardServiceArea
} from '../utils/navalUtils.js'

const HEALTH_REFILL_TIME = 10000
const CREW_REFILL_INTERVAL = 10000
const CREW_REFILL_ORDER = ['driver', 'commander', 'loader', 'gunner']

function isStationary(unit) {
  return !unit.movement?.isMoving && (unit.movement?.currentSpeed || 0) <= 0.01
}

function refillFuel(unit, delta) {
  if (typeof unit.maxGas !== 'number' || unit.gas >= unit.maxGas) return
  unit.gas = Math.min(unit.maxGas, unit.gas + (unit.maxGas / GAS_REFILL_TIME) * delta)
  unit.refueling = true
  unit.shipyardRefueling = true
  unit.outOfGasPlayed = false
}

function refillAmmunition(unit, delta) {
  if (typeof unit.maxAmmunition !== 'number' || unit.ammunition >= unit.maxAmmunition) return
  unit.ammunition = Math.min(
    unit.maxAmmunition,
    unit.ammunition + (unit.maxAmmunition / AMMO_RESUPPLY_TIME) * delta
  )
  unit.resupplyingAmmo = true
  unit.shipyardResupplyingAmmo = true
}

function refillHealth(unit, delta) {
  if (typeof unit.maxHealth !== 'number' || unit.health >= unit.maxHealth) return
  unit.health = Math.min(unit.maxHealth, unit.health + (unit.maxHealth / HEALTH_REFILL_TIME) * delta)
  unit.repairingAtShipyard = true
}

function refillCrew(unit, delta) {
  if (!unit.crew || typeof unit.crew !== 'object') return
  const missingRole = CREW_REFILL_ORDER.find(role => unit.crew[role] === false)
  if (!missingRole) {
    unit.shipyardCrewRefillProgress = 0
    return
  }

  unit.shipyardCrewRefillProgress = (unit.shipyardCrewRefillProgress || 0) + delta
  if (unit.shipyardCrewRefillProgress >= CREW_REFILL_INTERVAL) {
    unit.crew[missingRole] = true
    unit.shipyardCrewRefillProgress -= CREW_REFILL_INTERVAL
  }
}

export const updateShipyardServiceLogic = logPerformance(function updateShipyardServiceLogic(units, buildings, mapGrid, delta) {
  const shipyards = (buildings || []).filter(building =>
    building?.type === 'shipyard' && building.health > 0 && building.constructionFinished !== false
  )

  ;(units || []).forEach(unit => {
    if (!unit?.isNaval) return

    if (unit.shipyardRefueling) unit.refueling = false
    if (unit.shipyardResupplyingAmmo) unit.resupplyingAmmo = false
    unit.shipyardRefueling = false
    unit.shipyardResupplyingAmmo = false
    unit.repairingAtShipyard = false
    const shipyard = shipyards.find(candidate =>
      isNavalUnitInShipyardServiceArea(unit, candidate, mapGrid)
    )
    if (!shipyard || !isStationary(unit)) {
      unit.shipyardCrewRefillProgress = 0
      return
    }

    if (hasShipyardServiceDependency(shipyard, buildings, 'fuel')) {
      refillFuel(unit, delta)
    }
    if (hasShipyardServiceDependency(shipyard, buildings, 'ammunition')) {
      refillAmmunition(unit, delta)
    }
    if (hasShipyardServiceDependency(shipyard, buildings, 'health')) {
      refillHealth(unit, delta)
    }
    if (hasShipyardServiceDependency(shipyard, buildings, 'crew')) {
      refillCrew(unit, delta)
    } else {
      unit.shipyardCrewRefillProgress = 0
    }
  })
}, false)
