// ammunitionTruckLogic.js
import { AMMO_RESUPPLY_TIME, AMMO_TRUCK_RANGE, TILE_SIZE } from '../config.js'
import { logPerformance } from '../performanceUtils.js'
import { getUnitCommandsHandler } from '../inputHandler.js'
import { triggerExplosion } from '../logic.js'
import { triggerDistortionEffect } from '../ui/distortionEffect.js'
import { gameRandom } from '../utils/gameRandom.js'

/**
 * Check if a unit is adjacent to any tile of a building
 * @param {Object} unit - Unit with tileX/tileY properties
 * @param {Object} building - Building with x/y (tile coords), width, height
 * @param {number} range - Range in tiles (default 1 for immediate adjacency)
 * @returns {boolean} True if unit is within range of any building tile
 */
function isUnitAdjacentToBuilding(unit, building, range = 1) {
  const unitTileX = unit.tileX
  const unitTileY = unit.tileY
  const buildingWidth = building.width || 1
  const buildingHeight = building.height || 1

  // Check if unit is within range of any tile occupied by the building
  for (let bx = building.x; bx < building.x + buildingWidth; bx++) {
    for (let by = building.y; by < building.y + buildingHeight; by++) {
      const distance = Math.hypot(unitTileX - bx, unitTileY - by)
      if (distance <= range) {
        return true
      }
    }
  }
  return false
}


function findNearestEmptyAmmoBuilding(ammoTruck, buildings) {
  if (!Array.isArray(buildings) || buildings.length === 0) {
    return null
  }

  let best = null
  let bestDistance = Infinity
  for (const building of buildings) {
    if (!building || building.owner !== ammoTruck.owner || building.health <= 0) continue
    if (typeof building.maxAmmo !== 'number' || building.maxAmmo <= 0) continue
    if ((building.ammo ?? 0) > 0) continue

    const centerX = building.x + (building.width || 1) / 2
    const centerY = building.y + (building.height || 1) / 2
    const distance = Math.hypot(centerX - ammoTruck.tileX, centerY - ammoTruck.tileY)
    if (distance < bestDistance) {
      bestDistance = distance
      best = building
    }
  }

  return best
}

export const updateAmmunitionTruckLogic = logPerformance(function(units, gameState, delta) {
  const ammoTrucks = units.filter(u => u.type === 'ammunitionTruck' && u.health > 0)
  if (ammoTrucks.length === 0) return

  const unitCommands = getUnitCommandsHandler ? getUnitCommandsHandler() : null

  ammoTrucks.forEach(ammoTruck => {
    // Ensure ammo truck has proper ammo cargo properties initialized
    if (ammoTruck.ammoCargo === undefined || ammoTruck.maxAmmoCargo === undefined) {
      ammoTruck.maxAmmoCargo = 500 // Default AMMO_TRUCK_CARGO value
      ammoTruck.ammoCargo = 500
    }

    // Handle manual resupply target
    if (ammoTruck.ammoResupplyTarget) {
      const target = units.find(u => u.id === ammoTruck.ammoResupplyTarget.id) ||
                    gameState.buildings?.find(b => b.id === ammoTruck.ammoResupplyTarget.id)

      // Clear target if it doesn't exist
      if (!target) {
        ammoTruck.ammoResupplyTarget = null
        ammoTruck.ammoResupplyTimer = 0
        return
      }

      // Clear target if it's gone, dead, or full
      const isUnit = typeof target.tileX === 'number'
      if (target.health <= 0 ||
          (isUnit && target.isAirUnit && typeof target.maxRocketAmmo === 'number' && target.rocketAmmo >= target.maxRocketAmmo) ||
          (isUnit && !target.isAirUnit && typeof target.maxAmmunition === 'number' && target.ammunition >= target.maxAmmunition) ||
          (!isUnit && typeof target.maxAmmo === 'number' && target.ammo >= target.maxAmmo)) {
        ammoTruck.ammoResupplyTarget = null
        ammoTruck.ammoResupplyTimer = 0
      } else {
        // Check if we're close enough to start resupplying
        let inRange = false
        if (isUnit) {
          // For units: simple tile distance check
          const distance = Math.hypot(target.tileX - ammoTruck.tileX, target.tileY - ammoTruck.tileY)
          inRange = distance <= AMMO_TRUCK_RANGE
        } else {
          // For buildings: check adjacency to any building tile
          inRange = isUnitAdjacentToBuilding(ammoTruck, target, AMMO_TRUCK_RANGE)
        }

        if (inRange && !(ammoTruck.movement && ammoTruck.movement.isMoving)) {
          // Start resupplying
          ammoTruck.ammoResupplyTimer = (ammoTruck.ammoResupplyTimer || 0) + delta

          if (ammoTruck.ammoCargo > 0) {
            const needsAmmo = isUnit ?
              (target.isAirUnit ?
                (target.rocketAmmo < target.maxRocketAmmo) :
                (target.ammunition < target.maxAmmunition)) :
              (target.ammo < target.maxAmmo)

            if (needsAmmo) {
              const refillRate = (isUnit ?
                (target.isAirUnit ? target.maxRocketAmmo : target.maxAmmunition) :
                target.maxAmmo) / AMMO_RESUPPLY_TIME
              const ammoNeeded = isUnit ?
                (target.isAirUnit ?
                  (target.maxRocketAmmo - target.rocketAmmo) :
                  (target.maxAmmunition - target.ammunition)) :
                (target.maxAmmo - target.ammo)
              const transfer = Math.min(refillRate * delta, ammoNeeded, ammoTruck.ammoCargo)

              if (isUnit) {
                if (target.isAirUnit) {
                  target.rocketAmmo = Math.min(target.maxRocketAmmo, target.rocketAmmo + transfer)
                } else {
                  target.ammunition = Math.min(target.maxAmmunition, target.ammunition + transfer)
                }
              } else {
                target.ammo = Math.min(target.maxAmmo, target.ammo + transfer)
              }
              ammoTruck.ammoCargo = Math.max(0, ammoTruck.ammoCargo - transfer)
            } else {
              // Target is full, stop resupplying
              ammoTruck.ammoResupplyTarget = null
              ammoTruck.ammoResupplyTimer = 0
            }
          } else {
            // Truck is empty, stop resupplying
            ammoTruck.ammoResupplyTarget = null
            ammoTruck.ammoResupplyTimer = 0
          }
        }
        // Skip other logic while actively resupplying
        return
      }
    }

    // Handle queued resupply commands
    if (ammoTruck.utilityQueue && ammoTruck.utilityQueue.mode === 'ammoResupply') {
      if (!ammoTruck.ammoResupplyTarget) {
        if (ammoTruck.utilityQueue.currentTargetId || ammoTruck.utilityQueue.currentTargetType) {
          ammoTruck.utilityQueue.currentTargetId = null
          ammoTruck.utilityQueue.currentTargetType = null
        }
        if (unitCommands) {
          unitCommands.advanceUtilityQueue(ammoTruck, gameState.mapGrid, true)
        }
      } else if (ammoTruck.utilityQueue.currentTargetId !== ammoTruck.ammoResupplyTarget.id ||
                 ammoTruck.utilityQueue.currentTargetType !== (ammoTruck.ammoResupplyTarget.type ? 'unit' : 'building')) {
        ammoTruck.utilityQueue.currentTargetId = ammoTruck.ammoResupplyTarget.id
        ammoTruck.utilityQueue.currentTargetType = ammoTruck.ammoResupplyTarget.type ? 'unit' : 'building'
      }
      return
    }

    if (!ammoTruck.ammoResupplyTarget && ammoTruck.ammoCargo > 0 && unitCommands) {
      const emptyBuilding = findNearestEmptyAmmoBuilding(ammoTruck, gameState.buildings)
      if (emptyBuilding) {
        unitCommands.assignAmmunitionTruckToTarget(ammoTruck, emptyBuilding, gameState.mapGrid, {
          suppressNotifications: true,
          mode: 'resupply'
        })
      }
    }
  })
})

export function detonateAmmunitionTruck(unit, units, factories = [], gameState = null) {
  if (!unit || unit.health > 0) {
    return false
  }

  if (unit._ammoTruckDetonated) {
    return false
  }

  const explosionX = unit.x + TILE_SIZE / 2
  const explosionY = unit.y + TILE_SIZE / 2
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()

  const primaryRadius = TILE_SIZE * 2
  const primaryDamage = 80

  triggerExplosion(
    explosionX,
    explosionY,
    primaryDamage,
    units,
    factories,
    null,
    now,
    undefined,
    primaryRadius,
    true
  )

  if (gameState) {
    triggerDistortionEffect(explosionX, explosionY, primaryRadius, gameState)
  }

  const roundTypes = [
    {
      name: 'bullet',
      damage: 55,
      radius: TILE_SIZE * 0.75,
      constantDamage: true,
      buildingDamageMultiplier: 0.7,
      factoryDamageMultiplier: 0.7
    },
    {
      name: 'rocket',
      damage: 75,
      radius: TILE_SIZE * 1.25,
      constantDamage: false,
      buildingDamageMultiplier: 0.9,
      factoryDamageMultiplier: 0.9
    },
    {
      name: 'artillery',
      damage: 95,
      radius: TILE_SIZE * 1.5,
      constantDamage: false,
      buildingDamageMultiplier: 1,
      factoryDamageMultiplier: 1
    }
  ]

  const randomBetween = (min, max) => gameRandom() * (max - min) + min

  for (let i = 0; i < 10; i++) {
    const round = roundTypes[Math.floor(gameRandom() * roundTypes.length)]
    const angle = gameRandom() * Math.PI * 2
    const distance = TILE_SIZE * randomBetween(1.5, 4.5)
    const impactX = explosionX + Math.cos(angle) * distance
    const impactY = explosionY + Math.sin(angle) * distance
    const delay = i * 30

    triggerExplosion(
      impactX,
      impactY,
      round.damage,
      units,
      factories,
      null,
      now + delay,
      undefined,
      round.radius,
      round.constantDamage,
      {
        buildingDamageMultiplier: round.buildingDamageMultiplier,
        factoryDamageMultiplier: round.factoryDamageMultiplier
      }
    )
  }

  unit._ammoTruckDetonated = true
  unit.movement = unit.movement || {}
  if (unit.movement.velocity) {
    unit.movement.velocity.x = 0
    unit.movement.velocity.y = 0
  }
  if (unit.movement.targetVelocity) {
    unit.movement.targetVelocity.x = 0
    unit.movement.targetVelocity.y = 0
  }
  unit.movement.isMoving = false
  unit.movement.currentSpeed = 0

  unit.health = 0
  unit.ammoCargo = 0

  return true
}
