// Ammunition System Module - Handles ammunition resupply at factories and by supply trucks
import { TILE_SIZE, AMMO_RESUPPLY_TIME, AMMO_FACTORY_RANGE, AMMO_TRUCK_RANGE } from '../config.js'
import { logPerformance } from '../performanceUtils.js'
import { getServiceRadiusPixels } from '../utils/serviceRadius.js'
import { gameState } from '../gameState.js'

function isUnitWithinBuildingRange(unit, building, rangeInTiles) {
  if (!unit || !building || typeof rangeInTiles !== 'number') {
    return false
  }

  const unitTileX = typeof unit.tileX === 'number' ? unit.tileX : Math.floor((unit.x ?? 0) / TILE_SIZE)
  const unitTileY = typeof unit.tileY === 'number' ? unit.tileY : Math.floor((unit.y ?? 0) / TILE_SIZE)
  const width = building.width || 1
  const height = building.height || 1

  for (let bx = building.x; bx < building.x + width; bx++) {
    for (let by = building.y; by < building.y + height; by++) {
      const distance = Math.hypot(unitTileX - bx, unitTileY - by)
      if (distance <= rangeInTiles) {
        return true
      }
    }
  }
  return false
}

/**
 * Updates ammunition resupply logic for all units near ammunition factories or supply trucks
 * @param {Array} units - Array of unit objects
 * @param {Array} buildings - Array of building objects
 * @param {Object} gameState - Game state object
 * @param {number} delta - Time delta in milliseconds
 */
export const updateAmmunitionSystem = logPerformance(function(units, buildings, gameState, delta) {
  // Process ammunition factories
  const ammoFactories = buildings.filter(b => b.type === 'ammunitionFactory' && b.health > 0)
  ammoFactories.forEach(factory => {
    processAmmunitionResupply(factory, units, delta, AMMO_FACTORY_RANGE)
  })

  // Process ammunition supply trucks
  const ammoTrucks = units.filter(u => u.type === 'ammunitionTruck' && u.health > 0)
  ammoTrucks.forEach(truck => {
    processAmmunitionTruckResupply(truck, units, delta)
    // Reload ammunition truck at factories
    reloadAmmunitionTruck(truck, ammoFactories, delta)
  })
})

/**
 * Process ammunition resupply from a factory or building
 * @param {Object} source - The ammunition factory building
 * @param {Array} units - Array of unit objects
 * @param {number} delta - Time delta in milliseconds
 * @param {number} rangeInTiles - Resupply range in tiles
 */
function processAmmunitionResupply(source, units, delta, rangeInTiles) {
  const serviceRadius = getServiceRadiusPixels(source, rangeInTiles)
  if (serviceRadius <= 0) return

  const centerX = source.x * TILE_SIZE + (source.width * TILE_SIZE) / 2
  const centerY = source.y * TILE_SIZE + (source.height * TILE_SIZE) / 2

  // Get power supply for the factory owner
  const powerSupply = source.owner === 'player' ? gameState.playerPowerSupply : gameState.enemyPowerSupply
  // If power is insufficient, resupply takes 2x longer (same as harvester unload time)
  const powerMultiplier = powerSupply < 0 ? 2 : 1

  units.forEach(unit => {
    // Only resupply units with ammunition system
    if ((typeof unit.maxAmmunition !== 'number' && typeof unit.maxRocketAmmo !== 'number') || unit.health <= 0) return

    const unitCenterX = (unit.x ?? unit.tileX * TILE_SIZE) + TILE_SIZE / 2
    const unitCenterY = (unit.y ?? unit.tileY * TILE_SIZE) + TILE_SIZE / 2
    const distance = Math.hypot(unitCenterX - centerX, unitCenterY - centerY)
    const inArea = distance <= serviceRadius

    const stationary = !(unit.movement && unit.movement.isMoving)

    const isHelicopter = unit.type === 'apache' || unit.type === 'f22Raptor'
    const maxAmmo = isHelicopter ? unit.maxRocketAmmo : unit.maxAmmunition
    const currentAmmo = isHelicopter ? unit.rocketAmmo : unit.ammunition

    if (inArea && stationary) {
      if (currentAmmo < maxAmmo) {
        if (!unit.resupplyingAmmo) {
          unit.resupplyingAmmo = true
        }

        const baseRefillRate = maxAmmo / AMMO_RESUPPLY_TIME
        const refillRate = baseRefillRate / powerMultiplier
        unit.ammoRefillTimer = (unit.ammoRefillTimer || 0) + delta
        if (isHelicopter) {
          unit.rocketAmmo = Math.min(maxAmmo, currentAmmo + refillRate * delta)
        } else {
          unit.ammunition = Math.min(maxAmmo, currentAmmo + refillRate * delta)
        }
      } else {
        unit.ammoRefillTimer = 0
        unit.resupplyingAmmo = false
      }
    } else {
      unit.ammoRefillTimer = 0
      unit.resupplyingAmmo = false
    }
  })
}

/**
 * Process ammunition resupply from an ammunition supply truck
 * @param {Object} truck - The ammunition supply truck unit
 * @param {Array} units - Array of unit objects
 * @param {number} delta - Time delta in milliseconds
 */
function processAmmunitionTruckResupply(truck, units, delta) {
  if (truck.ammoCargo <= 0) return

  const truckCenterX = truck.x + TILE_SIZE / 2
  const truckCenterY = truck.y + TILE_SIZE / 2
  const range = AMMO_TRUCK_RANGE * TILE_SIZE

  units.forEach(unit => {
    // Only resupply units with ammunition system (not the truck itself or other supply units)
    if ((typeof unit.maxAmmunition !== 'number' && typeof unit.maxRocketAmmo !== 'number') || unit.health <= 0 || unit.id === truck.id) return
    if (unit.type === 'ammunitionTruck') return // Don't resupply other ammo trucks

    const unitCenterX = unit.x + TILE_SIZE / 2
    const unitCenterY = unit.y + TILE_SIZE / 2
    const distance = Math.hypot(unitCenterX - truckCenterX, unitCenterY - truckCenterY)
    const inRange = distance <= range

    const stationary = !(unit.movement && unit.movement.isMoving)

    const isHelicopter = unit.type === 'apache' || unit.type === 'f22Raptor'
    const maxAmmo = isHelicopter ? unit.maxRocketAmmo : unit.maxAmmunition
    const currentAmmo = isHelicopter ? unit.rocketAmmo : unit.ammunition

    if (inRange && stationary && currentAmmo < maxAmmo) {
      if (!unit.resupplyingAmmo) {
        unit.resupplyingAmmo = true
      }

      const refillRate = maxAmmo / AMMO_RESUPPLY_TIME
      const ammoNeeded = (refillRate * delta)
      const ammoToTransfer = Math.min(ammoNeeded, truck.ammoCargo, maxAmmo - currentAmmo)

      unit.ammoRefillTimer = (unit.ammoRefillTimer || 0) + delta
      if (isHelicopter) {
        unit.rocketAmmo = Math.min(maxAmmo, currentAmmo + ammoToTransfer)
      } else {
        unit.ammunition = Math.min(maxAmmo, currentAmmo + ammoToTransfer)
      }
      truck.ammoCargo = Math.max(0, truck.ammoCargo - ammoToTransfer)
    } else if (!inRange || !stationary) {
      if (unit.resupplyingAmmo) {
        unit.ammoRefillTimer = 0
        unit.resupplyingAmmo = false
      }
    }
  })
}

/**
 * Reload ammunition supply truck's cargo at an ammunition factory
 * @param {Object} truck - The ammunition supply truck unit
 * @param {Array} factories - Array of ammunition factory buildings
 * @param {number} delta - Time delta in milliseconds
 */
function reloadAmmunitionTruck(truck, factories, delta) {
  if (truck.ammoCargo >= truck.maxAmmoCargo) {
    truck.reloadingAmmo = false
    truck.ammoReloadTimer = 0
    if (truck.ammoReloadTargetId) {
      truck.ammoReloadTargetId = null
    }
    return
  }

  const range = AMMO_FACTORY_RANGE

  const stationary = !(truck.movement && truck.movement.isMoving)

  for (const factory of factories) {
    if (factory.health <= 0) continue

    const inRange = isUnitWithinBuildingRange(truck, factory, range)

    if (inRange && stationary) {
      if (!truck.reloadingAmmo) {
        truck.reloadingAmmo = true
      }

      const reloadRate = truck.maxAmmoCargo / (AMMO_RESUPPLY_TIME * 1.4) // Slightly slower reload (10s)
      truck.ammoReloadTimer = (truck.ammoReloadTimer || 0) + delta
      truck.ammoCargo = Math.min(truck.maxAmmoCargo, truck.ammoCargo + reloadRate * delta)
      if (truck.ammoReloadTargetId && truck.ammoReloadTargetId !== factory.id) {
        truck.ammoReloadTargetId = factory.id
      } else if (!truck.ammoReloadTargetId) {
        truck.ammoReloadTargetId = factory.id
      }
      return // Only reload from one factory at a time
    }
  }

  // If not in range of any factory, stop reloading
  truck.reloadingAmmo = false
  truck.ammoReloadTimer = 0
}
