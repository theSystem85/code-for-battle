import { AMMO_RESUPPLY_TIME, GAS_REFILL_TIME, TILE_SIZE } from '../config.js'
import { logPerformance } from '../performanceUtils.js'
import {
  hasShipyardServiceDependency,
  isNavalUnitInShipyardServiceArea
} from '../utils/navalUtils.js'

const HEALTH_REFILL_TIME = 10000
const CREW_REFILL_INTERVAL = 10000
const CREW_REFILL_ORDER = ['driver', 'commander', 'loader', 'gunner']
const SUPPLY_SHIP_RADIUS_TILES = 2
const SUPPLY_SHIP_SERVICE_REQUIREMENTS = Object.freeze({
  fuel: 'gasStation',
  ammunition: 'ammunitionFactory',
  crew: 'hospital',
  health: 'vehicleWorkshop'
})

function normalizeOwner(owner) {
  return owner === 'player' ? 'player1' : owner
}

function isStationary(unit) {
  return !unit.movement?.isMoving && (unit.movement?.currentSpeed || 0) <= 0.01
}

function refillFuel(unit, delta, supplier = null) {
  if (typeof unit.maxGas !== 'number' || unit.gas >= unit.maxGas) return
  const requested = (unit.maxGas / GAS_REFILL_TIME) * delta
  const available = supplier ? Math.max(0, supplier.supplyFuel || 0) : requested
  const amount = Math.min(requested, available, unit.maxGas - (unit.gas || 0))
  if (amount <= 0) return
  unit.gas = Math.min(unit.maxGas, (unit.gas || 0) + amount)
  if (supplier) supplier.supplyFuel = Math.max(0, (supplier.supplyFuel || 0) - amount)
  unit.refueling = true
  unit.shipyardRefueling = true
  unit.outOfGasPlayed = false
}

function refillAmmunition(unit, delta, supplier = null) {
  if (typeof unit.maxAmmunition !== 'number' || unit.ammunition >= unit.maxAmmunition) return
  const requested = (unit.maxAmmunition / AMMO_RESUPPLY_TIME) * delta
  const available = supplier ? Math.max(0, supplier.supplyAmmo || 0) : requested
  const amount = Math.min(requested, available, unit.maxAmmunition - (unit.ammunition || 0))
  if (amount <= 0) return
  unit.ammunition = Math.min(unit.maxAmmunition, (unit.ammunition || 0) + amount)
  if (supplier) supplier.supplyAmmo = Math.max(0, (supplier.supplyAmmo || 0) - amount)
  unit.resupplyingAmmo = true
  unit.shipyardResupplyingAmmo = true
}

function refillHealth(unit, delta, supplier = null) {
  if (typeof unit.maxHealth !== 'number' || unit.health >= unit.maxHealth) return
  const requested = (unit.maxHealth / HEALTH_REFILL_TIME) * delta
  const available = supplier ? Math.max(0, supplier.supplyRepairTools || 0) : requested
  const amount = Math.min(requested, available, unit.maxHealth - (unit.health || 0))
  if (amount <= 0) return
  unit.health = Math.min(unit.maxHealth, (unit.health || 0) + amount)
  if (supplier) supplier.supplyRepairTools = Math.max(0, (supplier.supplyRepairTools || 0) - amount)
  unit.repairingAtShipyard = true
}

function refillCrew(unit, delta, supplier = null) {
  if (!unit.crew || typeof unit.crew !== 'object') return
  const missingRole = CREW_REFILL_ORDER.find(role => unit.crew[role] === false)
  if (!missingRole) {
    unit.shipyardCrewRefillProgress = 0
    return
  }
  if (supplier && (supplier.supplyCrew || 0) < 1) return

  unit.shipyardCrewRefillProgress = (unit.shipyardCrewRefillProgress || 0) + delta
  if (unit.shipyardCrewRefillProgress >= CREW_REFILL_INTERVAL) {
    unit.crew[missingRole] = true
    if (supplier) supplier.supplyCrew = Math.max(0, (supplier.supplyCrew || 0) - 1)
    unit.shipyardCrewRefillProgress -= CREW_REFILL_INTERVAL
  }
}

function hasOwnedServiceBuilding(buildings, owner, service) {
  const requiredType = SUPPLY_SHIP_SERVICE_REQUIREMENTS[service]
  return Boolean(requiredType) && (buildings || []).some(building =>
    building?.type === requiredType &&
    building.health > 0 &&
    building.constructionFinished !== false &&
    normalizeOwner(building.owner) === normalizeOwner(owner)
  )
}

function getUnitTile(unit) {
  return {
    x: Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE),
    y: Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
  }
}

function isInSupplyShipRadius(target, supplier) {
  if (!target?.isNaval || !supplier?.isNaval || target === supplier) return false
  if (target.health <= 0 || supplier.health <= 0) return false
  if (normalizeOwner(target.owner) !== normalizeOwner(supplier.owner)) return false
  const targetTile = getUnitTile(target)
  const supplierTile = getUnitTile(supplier)
  const radius = supplier.supplyRadiusTiles || SUPPLY_SHIP_RADIUS_TILES
  return Math.max(Math.abs(targetTile.x - supplierTile.x), Math.abs(targetTile.y - supplierTile.y)) <= radius
}

function refillSupplyShipCargo(unit, delta, buildings, mapGrid) {
  const shipyard = (buildings || []).find(candidate => isNavalUnitInShipyardServiceArea(unit, candidate, mapGrid))
  if (!shipyard || !isStationary(unit)) return
  if (hasShipyardServiceDependency(shipyard, buildings, 'fuel') && typeof unit.maxSupplyFuel === 'number') {
    unit.supplyFuel = Math.min(unit.maxSupplyFuel, (unit.supplyFuel || 0) + (unit.maxSupplyFuel / GAS_REFILL_TIME) * delta)
  }
  if (hasShipyardServiceDependency(shipyard, buildings, 'ammunition') && typeof unit.maxSupplyAmmo === 'number') {
    unit.supplyAmmo = Math.min(unit.maxSupplyAmmo, (unit.supplyAmmo || 0) + (unit.maxSupplyAmmo / AMMO_RESUPPLY_TIME) * delta)
  }
  if (hasShipyardServiceDependency(shipyard, buildings, 'health') && typeof unit.maxSupplyRepairTools === 'number') {
    unit.supplyRepairTools = Math.min(unit.maxSupplyRepairTools, (unit.supplyRepairTools || 0) + (unit.maxSupplyRepairTools / HEALTH_REFILL_TIME) * delta)
  }
  if (hasShipyardServiceDependency(shipyard, buildings, 'crew') && typeof unit.maxSupplyCrew === 'number') {
    unit.supplyCrewRefillProgress = (unit.supplyCrewRefillProgress || 0) + delta
    if (unit.supplyCrewRefillProgress >= CREW_REFILL_INTERVAL && unit.supplyCrew < unit.maxSupplyCrew) {
      unit.supplyCrew += 1
      unit.supplyCrewRefillProgress -= CREW_REFILL_INTERVAL
    }
  }
}

function updateSupplyShipService(units, buildings, delta) {
  const suppliers = (units || []).filter(unit => unit?.type === 'supplyShip' && unit.health > 0 && isStationary(unit))
  suppliers.forEach(supplier => {
    ;(units || []).forEach(target => {
      if (!isInSupplyShipRadius(target, supplier) || !isStationary(target)) return
      if (hasOwnedServiceBuilding(buildings, supplier.owner, 'fuel')) refillFuel(target, delta, supplier)
      if (hasOwnedServiceBuilding(buildings, supplier.owner, 'ammunition')) refillAmmunition(target, delta, supplier)
      if (hasOwnedServiceBuilding(buildings, supplier.owner, 'health')) refillHealth(target, delta, supplier)
      if (hasOwnedServiceBuilding(buildings, supplier.owner, 'crew')) refillCrew(target, delta, supplier)
    })
  })
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

    if (hasShipyardServiceDependency(shipyard, buildings, 'fuel')) refillFuel(unit, delta)
    if (hasShipyardServiceDependency(shipyard, buildings, 'ammunition')) refillAmmunition(unit, delta)
    if (hasShipyardServiceDependency(shipyard, buildings, 'health')) refillHealth(unit, delta)
    if (hasShipyardServiceDependency(shipyard, buildings, 'crew')) refillCrew(unit, delta)
    else unit.shipyardCrewRefillProgress = 0
  })

  ;(units || []).forEach(unit => {
    if (unit?.type === 'supplyShip') refillSupplyShipCargo(unit, delta, buildings, mapGrid)
  })
  updateSupplyShipService(units, buildings, delta)
}, false)
