/**
 * Building placement validation functions
 *
 * Pure functions for validating building placement that can be imported
 * without triggering the full import chain of buildings.js.
 *
 * These functions are re-exported from buildings.js for backwards compatibility.
 */

import { MAX_BUILDING_GAP_TILES } from '../config.js'
import { buildingData } from '../data/buildingData.js'

/**
 * Checks if a position is near existing buildings using Chebyshev distance
 * @param {number} tileX - X tile position to check
 * @param {number} tileY - Y tile position to check
 * @param {Array} buildings - Array of existing buildings
 * @param {Array} factories - Array of factories (construction yards)
 * @param {number} maxDistance - Maximum allowed distance (default: MAX_BUILDING_GAP_TILES)
 * @param {string} owner - Owner to check against (default: 'player')
 * @returns {boolean} - Whether the position is near an existing building
 */
export function isNearExistingBuilding(tileX, tileY, buildings, factories, maxDistance = MAX_BUILDING_GAP_TILES, owner = 'player') {
  // First check factories
  if (factories && factories.length > 0) {
    for (const factory of factories) {
      // Only consider factories belonging to the same owner
      if (factory.id === owner || factory.owner === owner) {
        // Calculate the shortest distance from the new position to any tile of the factory
        for (let bY = factory.y; bY < factory.y + factory.height; bY++) {
          for (let bX = factory.x; bX < factory.x + factory.width; bX++) {
            const chebyshevDistance = Math.max(
              Math.abs(tileX - bX),
              Math.abs(tileY - bY)
            )

            if (chebyshevDistance <= maxDistance) {
              return true
            }
          }
        }
      }
    }
  }

  // Then check buildings
  if (buildings && buildings.length > 0) {
    for (const building of buildings) {
      // Skip buildings not belonging to the same owner
      if (building.owner !== owner) {
        continue
      }

      // Calculate the shortest distance from the new position to any tile of the existing building
      for (let bY = building.y; bY < building.y + building.height; bY++) {
        for (let bX = building.x; bX < building.x + building.width; bX++) {
          const chebyshevDistance = Math.max(
            Math.abs(tileX - bX),
            Math.abs(tileY - bY)
          )

          if (chebyshevDistance <= maxDistance) {
            return true
          }
        }
      }
    }
  }

  return false
}

/**
 * Check if a building can be placed at given coordinates
 * @param {string} type - Building type
 * @param {number} tileX - X tile position
 * @param {number} tileY - Y tile position
 * @param {Array<Array>} mapGrid - The map grid
 * @param {Array} units - Array of units
 * @param {Array} buildings - Array of buildings
 * @param {Array} factories - Array of factories
 * @param {string} owner - Owner identifier
 * @param {Object} options - Optional configuration
 * @param {boolean} options.mapEditMode - Whether map edit mode is active (skips range check)
 * @returns {boolean} - Whether the building can be placed
 */
export function canPlaceBuilding(type, tileX, tileY, mapGrid, units, buildings, factories, owner = 'player', options = {}) {
  if (!buildingData[type]) return false

  // Validate mapGrid parameter
  if (!mapGrid || !Array.isArray(mapGrid) || mapGrid.length === 0 || !mapGrid[0]) {
    if (typeof window !== 'undefined' && window.logger) {
      window.logger.warn('canPlaceBuilding: Invalid mapGrid provided', { mapGrid, type, tileX, tileY })
    }
    return false
  }

  const width = buildingData[type].width
  const height = buildingData[type].height

  const isFactoryOrRefinery = type === 'vehicleFactory' || type === 'oreRefinery' || type === 'vehicleWorkshop'

  // Check map boundaries
  if (tileX < 0 || tileY < 0 ||
      tileX + width > mapGrid[0].length ||
      tileY + height > mapGrid.length) {
    return false
  }

  // Check if ANY tile of the building is within range of an existing building
  // Skip range check in edit mode
  const mapEditMode = options.mapEditMode || false
  if (!mapEditMode) {
    let isAnyTileInRange = false
    for (let y = tileY; y < tileY + height; y++) {
      for (let x = tileX; x < tileX + width; x++) {
        if (isNearExistingBuilding(x, y, buildings, factories, MAX_BUILDING_GAP_TILES, owner)) {
          isAnyTileInRange = true
          break
        }
      }
      if (isAnyTileInRange) break
    }

    // If no tile is in range, return false
    if (!isAnyTileInRange) {
      return false
    }
  }

  // Check if any tile is blocked
  for (let y = tileY; y < tileY + height; y++) {
    for (let x = tileX; x < tileX + width; x++) {
      // Check map terrain
      if (mapGrid[y][x].type === 'water' ||
          mapGrid[y][x].type === 'rock' ||
          mapGrid[y][x].seedCrystal ||
          mapGrid[y][x].building ||
          mapGrid[y][x].buildOnlyOccupied ||
          (!isFactoryOrRefinery && mapGrid[y][x].noBuild)) {
        return false
      }

      // Check for units at this position
      const unitsAtTile = units.filter(unit =>
        Math.floor(unit.x / 32) === x &&
        Math.floor(unit.y / 32) === y
      )

      if (unitsAtTile.length > 0) {
        return false
      }
    }
  }

  // Additional protection area checks for factories and refineries
  if (isFactoryOrRefinery) {
    // Space directly below must be free of buildings
    const belowY = tileY + height
    if (belowY < mapGrid.length) {
      for (let x = tileX; x < tileX + width; x++) {
        if (mapGrid[belowY][x].building) {
          return false
        }
      }
    }

    // For vehicle workshop, also check the waiting area (2 tiles below)
    if (type === 'vehicleWorkshop') {
      const waitingY = tileY + height + 1
      if (waitingY < mapGrid.length) {
        for (let x = tileX; x < tileX + width; x++) {
          if (mapGrid[waitingY][x].building) {
            return false
          }
        }
      }
    }

    if (type === 'oreRefinery') {
      // 1 tile border around refinery must be free of buildings
      for (let y = tileY - 1; y <= tileY + height; y++) {
        for (let x = tileX - 1; x <= tileX + width; x++) {
          if (y < 0 || x < 0 || y >= mapGrid.length || x >= mapGrid[0].length) continue
          if (x >= tileX && x < tileX + width && y >= tileY && y < tileY + height) continue
          if (mapGrid[y][x].building) {
            return false
          }
        }
      }
    }
  }

  return true
}

/**
 * Check individual tile validity for coloring the placement overlay
 * @param {number} tileX - X tile position
 * @param {number} tileY - Y tile position
 * @param {Array<Array>} mapGrid - The map grid
 * @param {Array} _units - Array of units (unused)
 * @param {Array} _buildings - Array of buildings (unused)
 * @param {Array} _factories - Array of factories (unused)
 * @param {string} buildingType - Type of building being placed
 * @returns {boolean} - Whether the tile is valid for placement
 */
export function isTileValid(tileX, tileY, mapGrid, _units, _buildings, _factories, buildingType = null) {
  // Out of bounds
  if (tileX < 0 || tileY < 0 ||
      tileX >= mapGrid[0].length ||
      tileY >= mapGrid.length) {
    return false
  }

  // Invalid terrain
  const isFactoryOrRefinery =
    buildingType === 'vehicleFactory' || buildingType === 'oreRefinery' || buildingType === 'vehicleWorkshop'

  if (mapGrid[tileY][tileX].type === 'water' ||
      mapGrid[tileY][tileX].type === 'rock' ||
      mapGrid[tileY][tileX].seedCrystal ||
      mapGrid[tileY][tileX].building ||
      mapGrid[tileY][tileX].buildOnlyOccupied ||
      (!isFactoryOrRefinery && mapGrid[tileY][tileX].noBuild)) {
    return false
  }

  // Check for units
  // Note: Unit check would need units array, but this is for overlay rendering
  // and is typically checked separately

  return true
}
