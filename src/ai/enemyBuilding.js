import { buildingData, createBuilding, canPlaceBuilding, placeBuilding, isNearExistingBuilding, isTileValid, updatePowerSupply } from '../buildings.js'
import { getClosestEnemyFactory, isPartOfFactory } from './enemyUtils.js'
import { updateDangerZoneMaps } from '../game/dangerZoneMap.js'
import { gameRandom } from '../utils/gameRandom.js'

const defensiveBuildingTypes = new Set([
  'rocketTurret',
  'teslaCoil',
  'artilleryTurret'
])

function isDefensiveBuildingType(buildingType) {
  return (
    defensiveBuildingTypes.has(buildingType) ||
    (buildingType && buildingType.startsWith('turretGun'))
  )
}

function isWallBuilding(buildingType) {
  return buildingType === 'concreteWall'
}

function isZeroGapAllowed(buildingType, otherBuildingType) {
  if (!buildingType || !otherBuildingType) return false

  if (isWallBuilding(buildingType) && isWallBuilding(otherBuildingType)) {
    return true
  }

  if (isDefensiveBuildingType(buildingType) && isDefensiveBuildingType(otherBuildingType)) {
    return true
  }

  return false
}

// Let's improve this function to fix issues with enemy building placement
// Modified to improve building placement with better spacing and factory avoidance
export function findBuildingPosition(buildingType, mapGrid, units, buildings, factories, aiPlayerId) {
  // Validate inputs
  if (!buildingType) {
    console.error('findBuildingPosition called with undefined/null buildingType', {
      buildingType,
      aiPlayerId,
      mapGridExists: !!mapGrid,
      factoriesCount: factories?.length || 0
    })
    return null
  }

  // Guard against invalid/empty mapGrid (can occur briefly during save-game restore)
  if (!Array.isArray(mapGrid) || mapGrid.length === 0 || !Array.isArray(mapGrid[0]) || mapGrid[0].length === 0) {
    return null
  }

  if (!buildingData[buildingType]) {
    console.error(`findBuildingPosition called with unknown buildingType: ${buildingType}`, {
      buildingType,
      aiPlayerId,
      availableTypes: Object.keys(buildingData)
    })
    return null
  }

  const factory = factories.find(f => f.id === aiPlayerId)
  if (!factory) return null

  const buildingWidth = buildingData[buildingType].width
  const buildingHeight = buildingData[buildingType].height

  // Get human player factory for directional placement (to build defenses toward them)
  const humanPlayerFactory = getClosestEnemyFactory(factory, factories, aiPlayerId)
  const factoryX = factory.x + Math.floor(factory.width / 2)
  const factoryY = factory.y + Math.floor(factory.height / 2)

  // Direction toward human player (for defensive buildings)
  const playerDirection = { x: 0, y: 0 }
  if (humanPlayerFactory) {
    const playerX = humanPlayerFactory.x + Math.floor(humanPlayerFactory.width / 2)
    const playerY = humanPlayerFactory.y + Math.floor(humanPlayerFactory.height / 2)
    playerDirection.x = playerX - factoryX
    playerDirection.y = playerY - factoryY
    const mag = Math.hypot(playerDirection.x, playerDirection.y)
    if (mag > 0) {
      playerDirection.x /= mag
      playerDirection.y /= mag
    }
  }

  // Find closest ore field to prioritize defense in that direction
  let closestOrePos = null
  let closestOreDist = Infinity

  // Search for ore fields
  for (let y = 0; y < mapGrid.length; y++) {
    for (let x = 0; x < mapGrid[0].length; x++) {
      if (mapGrid[y][x].ore) {
        const dist = Math.hypot(x - factoryX, y - factoryY)
        if (dist < closestOreDist) {
          closestOreDist = dist
          closestOrePos = { x, y }
        }
      }
    }
  }

  // Determine direction vector - defensive structures should face the nearest ore field
  let directionVector = { x: 0, y: 0 }
  const isDefensiveBuilding = isDefensiveBuildingType(buildingType)

  if (isDefensiveBuilding && closestOrePos) {
    // Face defenses towards the closest ore field to protect harvesters
    directionVector.x = closestOrePos.x - factoryX
    directionVector.y = closestOrePos.y - factoryY
    const mag = Math.hypot(directionVector.x, directionVector.y)
    if (mag > 0) {
      directionVector.x /= mag
      directionVector.y /= mag
    }
  } else if (isDefensiveBuilding && humanPlayerFactory) {
    // Fallback to facing the human player if no ore exists
    directionVector = playerDirection
  } else if (closestOrePos) {
    // Non‑defensive buildings prefer ore direction
    directionVector.x = closestOrePos.x - factoryX
    directionVector.y = closestOrePos.y - factoryY
    const mag = Math.hypot(directionVector.x, directionVector.y)
    if (mag > 0) {
      directionVector.x /= mag
      directionVector.y /= mag
    }
  } else if (humanPlayerFactory) {
    // Otherwise face towards the human player's base
    directionVector = playerDirection
  }

  // Preferred placement distances - increased to ensure more space between buildings
  // For refineries and factories, use larger distances
  const preferredDistances = (buildingType === 'oreRefinery' || buildingType === 'vehicleFactory')
    ? [4, 5, 6, 3]
    : [3, 4, 5, 2]
  const spacingPreferences = [2, 1]

  for (const minSpaceBetweenBuildings of spacingPreferences) {
    const position = attemptPlacementWithSpacing(minSpaceBetweenBuildings)
    if (position) return position
  }

  return null

  function attemptPlacementWithSpacing(minSpaceBetweenBuildings) {
    // First try placing along the line from the factory to the closest ore field
    if (isDefensiveBuilding && closestOrePos) {
      const lineDistances = preferredDistances.concat([6, 7])
      for (const distance of lineDistances) {
        const x = factory.x + Math.round(directionVector.x * distance)
        const y = factory.y + Math.round(directionVector.y * distance)

        if (
          x >= 0 &&
          y >= 0 &&
          x + buildingWidth <= mapGrid[0].length &&
          y + buildingHeight <= mapGrid.length
        ) {
          let valid = true

          for (let cy = y; cy < y + buildingHeight && valid; cy++) {
            for (let cx = x; cx < x + buildingWidth && valid; cx++) {
              if (
                !isTileValid(cx, cy, mapGrid, units, buildings, factories, buildingType)
              ) {
                valid = false
              }
            }
          }

          if (!valid) continue

          const hasClearPaths = ensurePathsAroundBuilding(
            x,
            y,
            buildingWidth,
            buildingHeight,
            mapGrid,
            buildings,
            factories,
            minSpaceBetweenBuildings,
            aiPlayerId,
            buildingType
          )

          if (hasClearPaths) {
            return { x, y }
          }
        }
      }
    }

    // Search for positions prioritizing direction and preferred distance
    for (let angle = 0; angle < 360; angle += 30) {
      // Calculate angle alignment with target direction
      const angleRad = angle * Math.PI / 180
      const checkVector = { x: Math.cos(angleRad), y: Math.sin(angleRad) }
      const dotProduct = directionVector.x * checkVector.x + directionVector.y * checkVector.y

      // Skip angles that don't face toward the desired direction for defensive buildings
      if (isDefensiveBuilding && dotProduct < 0.5 && gameRandom() < 0.8) continue

      // Try each of our preferred distances
      for (const distance of preferredDistances) {
        // Calculate position at this angle and distance
        const dx = Math.round(Math.cos(angleRad) * distance)
        const dy = Math.round(Math.sin(angleRad) * distance)

        const x = factory.x + dx
        const y = factory.y + dy

        // Skip if out of bounds
        if (x < 0 || y < 0 ||
            x + buildingWidth > mapGrid[0].length ||
            y + buildingHeight > mapGrid.length) {
          continue
        }

        // Validate position - check for factory overlaps and other issues
        let isValid = true
        let conflictsWithFactory = false

        // First verify this position doesn't overlap with any factory
        for (let checkY = y; checkY < y + buildingHeight && isValid; checkY++) {
          for (let checkX = x; checkX < x + buildingWidth && isValid; checkX++) {
            if (isPartOfFactory(checkX, checkY, factories)) {
              conflictsWithFactory = true
              isValid = false
              break
            }
          }
        }

        if (conflictsWithFactory) continue

        // Now check if each tile is valid (terrain, units, etc.)
        for (let checkY = y; checkY < y + buildingHeight && isValid; checkY++) {
          for (let checkX = x; checkX < x + buildingWidth && isValid; checkX++) {
            if (!isTileValid(checkX, checkY, mapGrid, units, buildings, factories, buildingType)) {
              isValid = false
              break
            }
          }
        }

        if (!isValid) continue

        // Check if ANY tile of the building is within range of an existing enemy building
        // This means we're connected to the base, but not too close
        // Use different connection ranges for different building types
        const connectionRange = (buildingType === 'oreRefinery' || buildingType === 'vehicleFactory') ? 7 : 6

        let isNearBase = false
        for (let checkY = y; checkY < y + buildingHeight && !isNearBase; checkY++) {
          for (let checkX = x; checkX < x + buildingWidth && !isNearBase; checkX++) {
            if (isNearExistingBuilding(checkX, checkY, buildings, factories, connectionRange, aiPlayerId)) {
              isNearBase = true
            }
          }
        }

        if (!isNearBase) continue

        // NEW: Check if this building would create a bottleneck by being too close to other buildings
        const hasClearPaths = ensurePathsAroundBuilding(x, y, buildingWidth, buildingHeight, mapGrid, buildings, factories, minSpaceBetweenBuildings, aiPlayerId, buildingType)

        if (!hasClearPaths) continue

        // If we got here, the position is valid
        return { x, y }
      }
    }

    // If we couldn't find a position with our preferred approach, try the fallback
    return fallbackBuildingPosition(buildingType, mapGrid, units, buildings, factories, aiPlayerId, minSpaceBetweenBuildings)
  }
}

// New helper function to ensure there are clear paths around a potential building placement
function ensurePathsAroundBuilding(x, y, width, height, mapGrid, buildings, factories, minSpace, aiPlayerId, buildingType) {
  // Enhanced spacing validation: ensure full minSpace gap between building footprints
  // This checks that there are at least minSpace tiles of clear space between the edge of
  // this building and any other building

  // Check the entire perimeter with the required spacing
  for (let spaceLayer = 1; spaceLayer <= minSpace; spaceLayer++) {
    // Check north border (multiple rows if minSpace > 1)
    for (let checkX = x - spaceLayer; checkX < x + width + spaceLayer; checkX++) {
      const checkY = y - spaceLayer
      if (checkX < 0 || checkY < 0 || checkX >= mapGrid[0].length || checkY >= mapGrid.length) continue

      // Check if this tile is blocked by another building
      const occupyingBuilding = mapGrid[checkY][checkX].building
      if (occupyingBuilding && !isZeroGapAllowed(buildingType, occupyingBuilding.type)) {
        return false
      }

      if (mapGrid[checkY][checkX].type === 'water' ||
          mapGrid[checkY][checkX].type === 'rock' ||
          mapGrid[checkY][checkX].seedCrystal ||
          mapGrid[checkY][checkX].noBuild) {
        return false
      }

      // Check if this tile is part of an existing factory
      if (isPartOfFactory(checkX, checkY, factories)) {
        return false
      }
    }

    // Check south border (multiple rows if minSpace > 1)
    for (let checkX = x - spaceLayer; checkX < x + width + spaceLayer; checkX++) {
      const checkY = y + height + spaceLayer - 1
      if (checkX < 0 || checkY < 0 || checkX >= mapGrid[0].length || checkY >= mapGrid.length) continue

      // Check if this tile is blocked by another building
      const occupyingBuilding = mapGrid[checkY][checkX].building
      if (occupyingBuilding && !isZeroGapAllowed(buildingType, occupyingBuilding.type)) {
        return false
      }

      if (mapGrid[checkY][checkX].type === 'water' ||
          mapGrid[checkY][checkX].type === 'rock' ||
          mapGrid[checkY][checkX].seedCrystal ||
          mapGrid[checkY][checkX].noBuild) {
        return false
      }

      // Check if this tile is part of an existing factory
      if (isPartOfFactory(checkX, checkY, factories)) {
        return false
      }
    }

    // Check west border (multiple columns if minSpace > 1)
    for (let checkY = y - spaceLayer; checkY < y + height + spaceLayer; checkY++) {
      const checkX = x - spaceLayer
      if (checkX < 0 || checkY < 0 || checkX >= mapGrid[0].length || checkY >= mapGrid.length) continue

      // Check if this tile is blocked by another building
      const occupyingBuilding = mapGrid[checkY][checkX].building
      if (occupyingBuilding && !isZeroGapAllowed(buildingType, occupyingBuilding.type)) {
        return false
      }

      if (mapGrid[checkY][checkX].type === 'water' ||
          mapGrid[checkY][checkX].type === 'rock' ||
          mapGrid[checkY][checkX].seedCrystal ||
          mapGrid[checkY][checkX].noBuild) {
        return false
      }

      // Check if this tile is part of an existing factory
      if (isPartOfFactory(checkX, checkY, factories)) {
        return false
      }
    }

    // Check east border (multiple columns if minSpace > 1)
    for (let checkY = y - spaceLayer; checkY < y + height + spaceLayer; checkY++) {
      const checkX = x + width + spaceLayer - 1
      if (checkX < 0 || checkY < 0 || checkX >= mapGrid[0].length || checkY >= mapGrid.length) continue

      // Check if this tile is blocked by another building
      const occupyingBuilding = mapGrid[checkY][checkX].building
      if (occupyingBuilding && !isZeroGapAllowed(buildingType, occupyingBuilding.type)) {
        return false
      }

      if (mapGrid[checkY][checkX].type === 'water' ||
          mapGrid[checkY][checkX].type === 'rock' ||
          mapGrid[checkY][checkX].seedCrystal ||
          mapGrid[checkY][checkX].noBuild) {
        return false
      }

      // Check if this tile is part of an existing factory
      if (isPartOfFactory(checkX, checkY, factories)) {
        return false
      }
    }
  }

  // All spacing layers passed - building has adequate separation from other structures
  return true
}

// Calculate direction to the closest ore field from a given position
function directionToClosestOre(x, y, mapGrid) {
  let closest = Infinity
  let angle = null
  for (let oy = 0; oy < mapGrid.length; oy++) {
    for (let ox = 0; ox < mapGrid[0].length; ox++) {
      if (mapGrid[oy][ox].ore) {
        const dist = Math.hypot(ox - x, oy - y)
        if (dist < closest) {
          closest = dist
          angle = Math.atan2(oy - y, ox - x)
        }
      }
    }
  }
  return angle
}

// Fallback position search with the original spiral pattern
function fallbackBuildingPosition(buildingType, mapGrid, units, buildings, factories, aiPlayerId, minSpaceBetweenBuildings = 2) {
  // Validate inputs
  if (!buildingType) {
    window.logger.warn('fallbackBuildingPosition called with undefined buildingType')
    return null
  }

  if (!buildingData[buildingType]) {
    window.logger.warn(`fallbackBuildingPosition called with unknown buildingType: ${buildingType}`)
    return null
  }

  // Find AI player factory using the aiPlayerId from context
  const factory = factories.find(f => f.id === aiPlayerId)
  if (!factory) return null

  const buildingWidth = buildingData[buildingType].width
  const buildingHeight = buildingData[buildingType].height

  const preferredDistances = (buildingType === 'oreRefinery' || buildingType === 'vehicleFactory')
    ? [4, 5, 6, 3]
    : [3, 4, 5, 2]

  // Get human player factory for directional placement of defensive buildings
  const playerFactory = getClosestEnemyFactory(factory, factories, aiPlayerId)
  const isDefensiveBuilding = isDefensiveBuildingType(buildingType)

  // Calculate player direction for fallback
  let playerDirection = null
  if (playerFactory && isDefensiveBuilding) {
    const factoryX = factory.x + Math.floor(factory.width / 2)
    const factoryY = factory.y + Math.floor(factory.height / 2)
    const playerX = playerFactory.x + Math.floor(playerFactory.width / 2)
    const playerY = playerFactory.y + Math.floor(playerFactory.height / 2)

    playerDirection = {
      x: playerX - factoryX,
      y: playerY - factoryY
    }

    const mag = Math.hypot(playerDirection.x, playerDirection.y)
    if (mag > 0) {
      playerDirection.x /= mag
      playerDirection.y /= mag
    }
  }

  // Determine direction towards closest ore field for defensive buildings
  let oreDirection = null
  if (isDefensiveBuilding) {
    const fx = factory.x + Math.floor(factory.width / 2)
    const fy = factory.y + Math.floor(factory.height / 2)
    let closestDist = Infinity
    for (let y = 0; y < mapGrid.length; y++) {
      for (let x = 0; x < mapGrid[0].length; x++) {
        if (mapGrid[y][x].ore) {
          const dist = Math.hypot(x - fx, y - fy)
          if (dist < closestDist) {
            closestDist = dist
            oreDirection = { x: x - fx, y: y - fy }
          }
        }
      }
    }
    if (oreDirection) {
      const mag = Math.hypot(oreDirection.x, oreDirection.y)
      if (mag > 0) {
        oreDirection.x /= mag
        oreDirection.y /= mag
      }
    }
  }

  const defendDirection = oreDirection || playerDirection

  if (isDefensiveBuilding && oreDirection) {
    const lineDistances = preferredDistances.concat([6, 7])
    for (const distance of lineDistances) {
      const x = factory.x + Math.round(oreDirection.x * distance)
      const y = factory.y + Math.round(oreDirection.y * distance)

      if (
        x < 0 ||
        y < 0 ||
        x + buildingWidth > mapGrid[0].length ||
        y + buildingHeight > mapGrid.length
      ) {
        continue
      }

      let valid = true
      for (let cy = y; cy < y + buildingHeight && valid; cy++) {
        for (let cx = x; cx < x + buildingWidth && valid; cx++) {
          if (!isTileValid(cx, cy, mapGrid, units, buildings, factories, buildingType)) {
            valid = false
          }
        }
      }

      if (!valid) continue

      const hasClearPaths = ensurePathsAroundBuilding(
        x,
        y,
        buildingWidth,
        buildingHeight,
        mapGrid,
        buildings,
        factories,
        minSpaceBetweenBuildings,
        aiPlayerId,
        buildingType
      )

      if (hasClearPaths) {
        return { x, y }
      }
    }
  }

  // Search in a spiral pattern around the factory with preference to player direction
  for (let distance = 1; distance <= 10; distance++) {
    // Prioritize distances from our preferred list
    if (preferredDistances.includes(distance)) {
      // Prioritize building in 8 cardinal directions first
      for (let angle = 0; angle < 360; angle += 45) {
        // For defensive buildings, prioritize direction toward ore field
        if (isDefensiveBuilding && defendDirection) {
          // Calculate how closely this angle aligns with preferred direction
          const angleRad = angle * Math.PI / 180
          const dirVector = {
            x: Math.cos(angleRad),
            y: Math.sin(angleRad)
          }

          const dotProduct = defendDirection.x * dirVector.x + defendDirection.y * dirVector.y

          // Skip angles that don't face toward the preferred direction
          if (dotProduct < 0.3 && gameRandom() < 0.7) continue
        }

        // Calculate position at this angle and distance
        const angleRad = angle * Math.PI / 180
        const dx = Math.round(Math.cos(angleRad) * distance)
        const dy = Math.round(Math.sin(angleRad) * distance)

        const x = factory.x + dx
        const y = factory.y + dy

        // Skip if out of bounds
        if (x < 0 || y < 0 ||
            x + buildingWidth > mapGrid[0].length ||
            y + buildingHeight > mapGrid.length) {
          continue
        }

        // First check factory overlap
        let overlapsFactory = false
        for (let cy = y; cy < y + buildingHeight && !overlapsFactory; cy++) {
          for (let cx = x; cx < x + buildingWidth && !overlapsFactory; cx++) {
            if (isPartOfFactory(cx, cy, factories)) {
              overlapsFactory = true
            }
          }
        }

        if (overlapsFactory) continue

        // Check if ANY tile of the building is within range of an existing building
        let isNearBase = false
        for (let cy = y; cy < y + buildingHeight && !isNearBase; cy++) {
          for (let cx = x; cx < x + buildingWidth && !isNearBase; cx++) {
            if (isNearExistingBuilding(cx, cy, buildings, factories, 6, aiPlayerId)) {
              isNearBase = true
            }
          }
        }

        if (!isNearBase) continue

        // Check if each tile is valid (terrain, units, etc.)
        let isValid = true
        for (let cy = y; cy < y + buildingHeight && isValid; cy++) {
          for (let cx = x; cx < x + buildingWidth && isValid; cx++) {
            if (!isTileValid(cx, cy, mapGrid, units, buildings, factories, buildingType)) {
              isValid = false
            }
          }
        }

        if (!isValid) continue

        // Use the same path checking as in the main function
        const hasClearPaths = ensurePathsAroundBuilding(
          x,
          y,
          buildingWidth,
          buildingHeight,
          mapGrid,
          buildings,
          factories,
          minSpaceBetweenBuildings,
          aiPlayerId,
          buildingType
        )

        if (!hasClearPaths) continue

        return { x, y }
      }
    }
  }

  // Last resort: check the entire spiral without preferred distances
  for (let distance = 1; distance <= 10; distance++) {
    // Skip distances we already checked
    if (preferredDistances.includes(distance)) continue

    for (let dx = -distance; dx <= distance; dx++) {
      for (let dy = -distance; dy <= distance; dy++) {
        // Skip positions not on the perimeter
        if (Math.abs(dx) < distance && Math.abs(dy) < distance) continue

        const x = factory.x + dx
        const y = factory.y + dy

        // Skip if out of bounds
        if (x < 0 || y < 0 ||
            x + buildingWidth > mapGrid[0].length ||
            y + buildingHeight > mapGrid.length) {
          continue
        }

        // First verify not overlapping a factory
        let overlapsFactory = false
        for (let cy = y; cy < y + buildingHeight && !overlapsFactory; cy++) {
          for (let cx = x; cx < x + buildingWidth && !overlapsFactory; cx++) {
            if (isPartOfFactory(cx, cy, factories)) {
              overlapsFactory = true
            }
          }
        }

        if (overlapsFactory) continue

        // Check if near base and all tiles are valid
        let isNearBase = false
        let allTilesValid = true

        for (let cy = y; cy < y + buildingHeight; cy++) {
          for (let cx = x; cx < x + buildingWidth; cx++) {
            if (isNearExistingBuilding(cx, cy, buildings, factories, 6, aiPlayerId)) {
              isNearBase = true
            }
            if (!isTileValid(cx, cy, mapGrid, units, buildings, factories, buildingType)) {
              allTilesValid = false
            }
          }
        }

        if (!isNearBase || !allTilesValid) continue

        // Final check for pathfinding
        const hasClearPaths = ensurePathsAroundBuilding(
          x,
          y,
          buildingWidth,
          buildingHeight,
          mapGrid,
          buildings,
          factories,
          minSpaceBetweenBuildings,
          aiPlayerId,
          buildingType
        )

        if (!hasClearPaths) continue

        return { x, y }
      }
    }
  }

  return null
}

// Handle enemy building production completion
// eslint-disable-next-line no-unused-vars
function completeEnemyBuilding(gameState, mapGrid) {
  const production = gameState.enemy.currentBuildingProduction
  if (!production) return

  // Do a final check to make sure the location is still valid
  const buildingType = production.type
  const x = production.x
  const y = production.y

  // Validate the building placement one final time
  if (canPlaceBuilding(buildingType, x, y, gameState.mapGrid || mapGrid, gameState.units, gameState.buildings, gameState.factories || [], 'enemy')) {
    // Create and place the building
    const newBuilding = createBuilding(buildingType, x, y)
    newBuilding.owner = 'enemy'

    if (
      buildingType.startsWith('turretGun') ||
      buildingType === 'rocketTurret' ||
      buildingType === 'teslaCoil' ||
      buildingType === 'artilleryTurret'
    ) {
      const centerX = x + Math.floor(newBuilding.width / 2)
      const centerY = y + Math.floor(newBuilding.height / 2)
      const oreDir = directionToClosestOre(centerX, centerY, gameState.mapGrid || mapGrid)
      if (oreDir !== null) {
        newBuilding.turretDirection = oreDir
        newBuilding.targetDirection = oreDir
      }
    }

    // Add to game state
    gameState.buildings.push(newBuilding)
    updateDangerZoneMaps(gameState)

    // Update map grid
    placeBuilding(newBuilding, mapGrid)

    // Update power supply
    updatePowerSupply(gameState.buildings, gameState)

  }
  // else: placement failed, no action needed

  // Reset production state
  gameState.enemy.currentBuildingProduction = null
}

// Add function to replicate player building patterns
// eslint-disable-next-line no-unused-vars
function replicatePlayerBuildPattern(gameState, enemyBuildings) {
  try {
    // Get build patterns from localStorage if not already loaded
    if (!gameState.playerBuildHistory) {
      const savedHistory = localStorage.getItem('playerBuildHistory')
      gameState.playerBuildHistory = savedHistory ? JSON.parse(savedHistory) : []
    }

    // Check if we have any patterns to learn from
    if (!gameState.playerBuildHistory || gameState.playerBuildHistory.length === 0) {
      return null
    }

    // Pick a random session from the last 20 (or however many we have)
    const lastSessions = gameState.playerBuildHistory.slice(-20)
    const randomSession = lastSessions[Math.floor(gameRandom() * lastSessions.length)]

    if (!randomSession || !randomSession.buildings || randomSession.buildings.length === 0) {
      return null
    }

    // Get counts of existing enemy buildings by type
    const buildingCounts = {}
    enemyBuildings.forEach(building => {
      buildingCounts[building.type] = (buildingCounts[building.type] || 0) + 1
    })

    // Find the next building type from the pattern that we haven't matched yet
    for (let i = 0; i < randomSession.buildings.length; i++) {
      const buildingType = randomSession.buildings[i]

      // If we haven't built this type of building yet or haven't built as many as the pattern suggests
      const currentCount = buildingCounts[buildingType] || 0
      const patternCount = randomSession.buildings.slice(0, i + 1)
        .filter(type => type === buildingType).length

      if (currentCount < patternCount) {
        return buildingType
      }
    }

    // If we've replicated the entire pattern, choose the last building type
    return randomSession.buildings[randomSession.buildings.length - 1]
  } catch (error) {
    console.error('Error in replicatePlayerBuildPattern:', error)
    return null
  }
}
