/**
 * Building placement validation functions
 *
 * Shared validation that can be imported without the full buildings.js chain.
 * Active-map placement also checks the movable occupancy layer.
 *
 * These functions are re-exported from buildings.js for backwards compatibility.
 */

import { MAX_BUILDING_GAP_TILES, TILE_SIZE } from '../config.js'
import { buildingData } from '../data/buildingData.js'
import { getRegisteredDecorationLayout } from '../game/decorationLayoutRegistry.js'
import { gameState } from '../gameState.js'
import { hasMovableOccupancy } from '../game/occupancyTags.js'
import { getValidDecorationCell } from '../rendering/decorationLayout.js'

const NON_EXPANDING_BUILD_AREA_TYPES = new Set(['street', 'concreteWall'])
export const SHIPYARD_BUILD_RANGE_TILES = 4
export const PLACEMENT_OVERLAY_GREEN = 'rgba(0, 255, 0, 0.5)'
export const PLACEMENT_OVERLAY_ORANGE = 'rgba(255, 165, 0, 0.5)'
export const PLACEMENT_OVERLAY_RED = 'rgba(255, 0, 0, 0.5)'

/**
 * Living city buildings and stone decorations block construction.
 * The lookup is one layout-cell read. The decoration footprint is validated
 * only when that cell is a city or a stone, so ordinary land stays O(1).
 */
export function isDecorativeBuildBlocker(mapGrid, tileX, tileY) {
  const tile = mapGrid?.[tileY]?.[tileX]
  if (tile?.cityBuilding?.health > 0) return true
  const layout = getRegisteredDecorationLayout(mapGrid)
  if (!layout || tileX < 0 || tileY < 0 || tileX >= layout.width || tileY >= layout.height) return false
  const cell = layout.cells?.[tileY * layout.width + tileX]
  if (!cell) return false
  // A living city occupies its whole footprint, including tiles that are not the anchor.
  if (cell.cityBuilding?.health > 0) return true
  if (cell.group?.tagSet?.has('stones') !== true) return false
  return getValidDecorationCell(layout, mapGrid, tileX, tileY) != null
}

/**
 * Green only when the tile itself is free and the footprint reaches a friendly base.
 * `footprintInRange` is true when any footprint tile is inside build range.
 */
export function shouldShowPlacementTileAsValid(_buildingType, tileValid, footprintInRange) {
  return placementTileOverlayFill(tileValid, footprintInRange) === PLACEMENT_OVERLAY_GREEN
}

export function placementTileOverlayFill(tileValid, footprintInRange) {
  if (!tileValid) return PLACEMENT_OVERLAY_RED
  return footprintInRange ? PLACEMENT_OVERLAY_GREEN : PLACEMENT_OVERLAY_ORANGE
}

function hasMovablePlacementBlocker(mapGrid, x, y) {
  return gameState.mapGrid === mapGrid && hasMovableOccupancy(gameState.occupancyMap?.[y]?.[x])
}

function hasUnitAtTile(units, tileX, tileY) {
  return units.some(unit =>
    Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE) === tileX &&
    Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE) === tileY
  )
}

/** Shared Shipyard footprint rule used by placement validation and its overlay. */
export function isShipyardPlacementTileValid(tileX, tileY, mapGrid, units = []) {
  const tile = mapGrid?.[tileY]?.[tileX]
  return Boolean(
    tile?.type === 'water' &&
    !tile.building &&
    !tile.buildOnlyOccupied &&
    !tile.seedCrystal &&
    !tile.noBuild &&
    !hasMovablePlacementBlocker(mapGrid, tileX, tileY) &&
    !hasUnitAtTile(units, tileX, tileY) &&
    !isDecorativeBuildBlocker(mapGrid, tileX, tileY)
  )
}

export function doesShipyardFootprintTouchCoast(tileX, tileY, width, height, mapGrid) {
  for (let y = tileY - 1; y <= tileY + height; y++) {
    for (let x = tileX - 1; x <= tileX + width; x++) {
      const inside = x >= tileX && x < tileX + width && y >= tileY && y < tileY + height
      if (!inside && mapGrid?.[y]?.[x] && mapGrid[y][x].type !== 'water') return true
    }
  }
  return false
}

function canBuildingTypeExtendBuildArea(type) {
  return !NON_EXPANDING_BUILD_AREA_TYPES.has(type)
}

function canExistingBuildingAnchorPlacement(existingType, placementType) {
  if (canBuildingTypeExtendBuildArea(existingType)) {
    return true
  }

  return existingType === placementType
}

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
export function isNearExistingBuilding(tileX, tileY, buildings, factories, maxDistance = MAX_BUILDING_GAP_TILES, owner = 'player', placementType = null) {
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

      if (!canExistingBuildingAnchorPlacement(building.type, placementType)) {
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
 * True when map edit mode skips range, or any footprint tile is within the
 * building's base range. Shipyards use four tiles; every other type uses three.
 * One in-range tile makes the whole footprint "in range".
 */
export function isBuildingFootprintInBuildRange(type, tileX, tileY, buildings, factories, owner = 'player', options = {}) {
  if (options.mapEditMode) return true
  if (!buildingData[type]) return false
  const width = buildingData[type].width
  const height = buildingData[type].height
  const buildRange = type === 'shipyard' ? SHIPYARD_BUILD_RANGE_TILES : MAX_BUILDING_GAP_TILES
  for (let y = tileY; y < tileY + height; y++) {
    for (let x = tileX; x < tileX + width; x++) {
      if (isNearExistingBuilding(x, y, buildings, factories, buildRange, owner, type)) return true
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
  const isShipyard = type === 'shipyard'

  // Check map boundaries
  if (tileX < 0 || tileY < 0 ||
      tileX + width > mapGrid[0].length ||
      tileY + height > mapGrid.length) {
    return false
  }

  // Any one footprint tile inside base range is enough. Edit mode skips range.
  if (!isBuildingFootprintInBuildRange(type, tileX, tileY, buildings, factories, owner, options)) {
    return false
  }

  // Check if any tile is blocked
  for (let y = tileY; y < tileY + height; y++) {
    for (let x = tileX; x < tileX + width; x++) {
      // Check map terrain
      if (isShipyard && !isShipyardPlacementTileValid(x, y, mapGrid, units)) return false
      if ((!isShipyard && mapGrid[y][x].type === 'water') ||
          mapGrid[y][x].type === 'rock' ||
          mapGrid[y][x].seedCrystal ||
          mapGrid[y][x].building ||
          mapGrid[y][x].buildOnlyOccupied ||
          hasMovablePlacementBlocker(mapGrid, x, y) ||
          (!isFactoryOrRefinery && mapGrid[y][x].noBuild) ||
          (!isShipyard && isDecorativeBuildBlocker(mapGrid, x, y))) {
        return false
      }

      // Check for units at this position
      if (!isShipyard && hasUnitAtTile(units, x, y)) {
        return false
      }
    }
  }

  if (isShipyard) {
    if (!doesShipyardFootprintTouchCoast(tileX, tileY, width, height, mapGrid)) return false
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
export function isTileValid(tileX, tileY, mapGrid, _units, _buildings, _factories, buildingType = null, placementOrigin = null) {
  // Out of bounds
  if (tileX < 0 || tileY < 0 ||
      tileX >= mapGrid[0].length ||
      tileY >= mapGrid.length) {
    return false
  }

  // Invalid terrain
  const isFactoryOrRefinery =
    buildingType === 'vehicleFactory' || buildingType === 'oreRefinery' || buildingType === 'vehicleWorkshop'
  const isShipyard = buildingType === 'shipyard' && placementOrigin
  if (isShipyard) return isShipyardPlacementTileValid(tileX, tileY, mapGrid, _units)

  if (mapGrid[tileY][tileX].type === 'water' ||
      mapGrid[tileY][tileX].type === 'rock' ||
      mapGrid[tileY][tileX].seedCrystal ||
      mapGrid[tileY][tileX].building ||
      mapGrid[tileY][tileX].buildOnlyOccupied ||
      hasMovablePlacementBlocker(mapGrid, tileX, tileY) ||
      (!isFactoryOrRefinery && mapGrid[tileY][tileX].noBuild) ||
      isDecorativeBuildBlocker(mapGrid, tileX, tileY)) {
    return false
  }

  // Check for units
  // Note: Unit check would need units array, but this is for overlay rendering
  // and is typically checked separately

  return true
}
