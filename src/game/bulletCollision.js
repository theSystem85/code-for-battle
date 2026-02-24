// bulletCollision.js - Handles bullet collision detection
import { TILE_SIZE } from '../config.js'

/**
 * Checks if a bullet collides with a specific unit
 * @param {Object} bullet - The bullet object
 * @param {Object} unit - The unit to check collision with
 * @returns {boolean} - Whether the bullet collides with the unit
 */
export function checkUnitCollision(bullet, unit) {
  try {
    // Validate inputs
    if (!bullet || !unit || unit.health <= 0) return false

    // Skip collision with self (building that shot the bullet)
    if (bullet.shooter && bullet.shooter.isBuilding &&
        bullet.x >= bullet.shooter.x * TILE_SIZE &&
        bullet.x <= (bullet.shooter.x + bullet.shooter.width) * TILE_SIZE &&
        bullet.y >= bullet.shooter.y * TILE_SIZE &&
        bullet.y <= (bullet.shooter.y + bullet.shooter.height) * TILE_SIZE) {
      return false
    }

    // Skip friendly units unless this is a forced attack
    // Use bullet.target if available because shooter.target may change
    const forcedTarget = bullet.target || bullet.shooter?.target
    if (unit.owner === bullet.shooter?.owner &&
        !(bullet.shooter?.forcedAttack && forcedTarget === unit)) {
      return false
    }

    // Calculate distance from bullet to unit center
    const unitCenterX = unit.x + TILE_SIZE / 2
    let unitCenterY = unit.y + TILE_SIZE / 2

    // For air units (Apache, F22), adjust the collision Y to account for altitude visual offset
    // The unit visual is rendered at y - (altitude * 0.4), so collision should match
    if (unit.isAirUnit && unit.altitude) {
      const altitudeLift = unit.altitude * 0.4
      unitCenterY -= altitudeLift
    }

    const dx = unitCenterX - bullet.x
    const dy = unitCenterY - bullet.y
    const distance = Math.hypot(dx, dy)

    // Return true if collision detected (within threshold)
    return distance < 10 // 10-pixel threshold for collision
  } catch (error) {
    console.error('Error in checkUnitCollision:', error)
    return false
  }
}

/**
 * Checks if a bullet collides with a wreck
 * @param {Object} bullet - The bullet object
 * @param {Object} wreck - The wreck to check collision with
 * @returns {boolean} - Whether the bullet collides with the wreck
 */
export function checkWreckCollision(bullet, wreck) {
  try {
    if (!bullet || !wreck || wreck.health <= 0) return false

    const wreckCenterX = wreck.x + TILE_SIZE / 2
    const wreckCenterY = wreck.y + TILE_SIZE / 2
    const dx = wreckCenterX - bullet.x
    const dy = wreckCenterY - bullet.y

    return Math.hypot(dx, dy) < 12
  } catch (error) {
    console.error('Error in checkWreckCollision:', error)
    return false
  }
}

/**
 * Checks if a bullet collides with a building
 * @param {Object} bullet - The bullet object
 * @param {Object} building - The building to check collision with
 * @returns {boolean} - Whether the bullet collides with the building
 */
export function checkBuildingCollision(bullet, building) {
  try {
    if (!bullet || !building || building.health <= 0) return false

    // Skip friendly buildings unless this is a forced attack
    const forcedTarget = bullet.target || bullet.shooter?.target
    if (building.owner === bullet.shooter?.owner &&
        !(bullet.shooter?.forcedAttack && forcedTarget === building)) {
      return false
    }

    // Check if bullet is within building bounds (with small buffer)
    const buildingX = building.x * TILE_SIZE
    const buildingY = building.y * TILE_SIZE
    const buildingWidth = building.width * TILE_SIZE
    const buildingHeight = building.height * TILE_SIZE

    return bullet.x >= buildingX - 5 &&
           bullet.x <= buildingX + buildingWidth + 5 &&
           bullet.y >= buildingY - 5 &&
           bullet.y <= buildingY + buildingHeight + 5
  } catch (error) {
    console.error('Error in checkBuildingCollision:', error)
    return false
  }
}

/**
 * Checks if a bullet collides with a factory
 * @param {Object} bullet - The bullet object
 * @param {Object} factory - The factory to check collision with
 * @returns {boolean} - Whether the bullet collides with the factory
 */
export function checkFactoryCollision(bullet, factory) {
  try {
    if (!bullet || !factory || factory.destroyed) return false

    // Skip friendly factories unless this is a forced attack
    const forcedTarget = bullet.target || bullet.shooter?.target
    if (factory.id === bullet.shooter?.owner &&
        !(bullet.shooter?.forcedAttack && forcedTarget === factory)) {
      return false
    }

    // Check if bullet is within factory bounds (with small buffer)
    const factoryX = factory.x * TILE_SIZE
    const factoryY = factory.y * TILE_SIZE
    const factoryWidth = factory.width * TILE_SIZE
    const factoryHeight = factory.height * TILE_SIZE

    return bullet.x >= factoryX - 5 &&
           bullet.x <= factoryX + factoryWidth + 5 &&
           bullet.y >= factoryY - 5 &&
           bullet.y <= factoryY + factoryHeight + 5
  } catch (error) {
    console.error('Error in checkFactoryCollision:', error)
    return false
  }
}
