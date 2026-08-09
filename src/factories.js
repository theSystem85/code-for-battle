// factories.js
import { buildingData, createBuilding } from './buildings.js'
import { MAP_TILES_X, MAP_TILES_Y, PLAYER_POSITIONS } from './config.js'
import { gameState } from './gameState.js'

export function initFactories(factories, mapGrid) {
  // Clear existing factories
  factories.length = 0

  // Get the factory dimensions from buildingData
  const factoryWidth = buildingData.constructionYard.width
  const factoryHeight = buildingData.constructionYard.height

  // Create factories for each player based on player count
  const playerCount = gameState.playerCount || 2
  const playerIds = ['player1', 'player2', 'player3', 'player4'].slice(0, playerCount)

  playerIds.forEach(playerId => {
    const position = PLAYER_POSITIONS[playerId]
    const factoryX = Math.floor(MAP_TILES_X * position.x) - Math.floor(factoryWidth / 2)
    const factoryY = Math.floor(MAP_TILES_Y * position.y) - Math.floor(factoryHeight / 2)

    // Create factory as a regular construction yard building
    const factory = createBuilding('constructionYard', factoryX, factoryY)
    factory.id = playerId
    factory.owner = playerId
    factory.constructionFinished = true
    factory.constructionStartTime = performance.now() - 5000
    factory.productionCountdown = 0
    factory.budget = Number.isFinite(gameState.startMoney) ? gameState.startMoney : 20000
    // Keep legacy compatibility
    factory.isHuman = playerId === gameState.humanPlayer

    factories.push(factory)
  })

  // Ensure factory areas have proper background tiles (street or land)
  // Use the factories array instead of creating a new array
  factories.forEach(factory => {
    for (let y = factory.y; y < factory.y + factory.height; y++) {
      for (let x = factory.x; x < factory.x + factory.width; x++) {
        // If the tile is void (undefined) or has no proper background, set it to street
        if (!mapGrid[y] || !mapGrid[y][x] || !mapGrid[y][x].type || mapGrid[y][x].type === 'building') {
          if (!mapGrid[y]) mapGrid[y] = []
          if (!mapGrid[y][x]) mapGrid[y][x] = {}
          mapGrid[y][x].type = 'street'
        }
      }
    }
  })

  // Mark factory tiles as "building" to block unit movement, but preserve background tiles.
  factories.forEach(factory => {
    // Store original tile types for factories (similar to placeBuilding in buildings.js)
    factory.originalTiles = []

    for (let y = factory.y; y < factory.y + factory.height; y++) {
      factory.originalTiles[y - factory.y] = []

      for (let x = factory.x; x < factory.x + factory.width; x++) {
        // Store the original tile type before marking as building
        factory.originalTiles[y - factory.y][x - factory.x] = mapGrid[y][x].type

        // Mark tile as having a building (for collision detection) but preserve the original tile type for rendering
        mapGrid[y][x].building = factory

        // Remove any ore from tiles where factories are placed
        if (mapGrid[y][x].ore) {
          mapGrid[y][x].ore = false
          // Clear any cached texture variations for this tile to force re-render
          mapGrid[y][x].textureVariation = null
        }

        // DON'T change the tile type - keep the original background texture visible
        // mapGrid[y][x].type = 'building' // REMOVED: This was causing solid color rendering
      }
    }
  })

  // Add minimal local connectivity between factories if needed
  // This creates L-shaped connections with original 2-tile thickness only between adjacent factory pairs to supplement the main network
  if (factories.length === 2) {
    // For 2 factories, create a direct L-shaped connection
    const factory1 = factories[0]
    const factory2 = factories[1]

    const startX = factory1.x + Math.floor(factory1.width / 2)
    const startY = factory1.y + Math.floor(factory1.height / 2)
    const endX = factory2.x + Math.floor(factory2.width / 2)
    const endY = factory2.y + Math.floor(factory2.height / 2)

    // Create L-shaped connection (horizontal then vertical) with 2-tile thickness
    for (let x = Math.min(startX, endX); x <= Math.max(startX, endX); x++) {
      if (mapGrid[startY] && mapGrid[startY][x]) {
        mapGrid[startY][x].type = 'street'
      }
      // Add thickness
      if (mapGrid[startY + 1] && mapGrid[startY + 1][x]) {
        mapGrid[startY + 1][x].type = 'street'
      }
    }
    for (let y = Math.min(startY, endY); y <= Math.max(startY, endY); y++) {
      if (mapGrid[y] && mapGrid[y][endX]) {
        mapGrid[y][endX].type = 'street'
      }
      // Add thickness
      if (mapGrid[y] && mapGrid[y][endX + 1]) {
        mapGrid[y][endX + 1].type = 'street'
      }
    }
  } else if (factories.length > 2) {
    // For multiple factories, the main street network should handle most connectivity
    // Only add a minimal connection if factories are very close to each other
    for (let i = 0; i < factories.length; i++) {
      for (let j = i + 1; j < factories.length; j++) {
        const factory1 = factories[i]
        const factory2 = factories[j]

        const centerX1 = factory1.x + Math.floor(factory1.width / 2)
        const centerY1 = factory1.y + Math.floor(factory1.height / 2)
        const centerX2 = factory2.x + Math.floor(factory2.width / 2)
        const centerY2 = factory2.y + Math.floor(factory2.height / 2)

        const distance = Math.hypot(centerX1 - centerX2, centerY1 - centerY2)

        // Only connect if factories are very close (less than 15 tiles apart)
        if (distance < 15) {
          // Simple horizontal then vertical connection with 2-tile thickness
          for (let x = Math.min(centerX1, centerX2); x <= Math.max(centerX1, centerX2); x++) {
            if (mapGrid[centerY1] && mapGrid[centerY1][x]) {
              mapGrid[centerY1][x].type = 'street'
            }
            // Add thickness
            if (mapGrid[centerY1 + 1] && mapGrid[centerY1 + 1][x]) {
              mapGrid[centerY1 + 1][x].type = 'street'
            }
          }
          for (let y = Math.min(centerY1, centerY2); y <= Math.max(centerY1, centerY2); y++) {
            if (mapGrid[y] && mapGrid[y][centerX2]) {
              mapGrid[y][centerX2].type = 'street'
            }
            // Add thickness
            if (mapGrid[y] && mapGrid[y][centerX2 + 1]) {
              mapGrid[y][centerX2 + 1].type = 'street'
            }
          }
          // Only connect the first close pair to avoid redundancy
          break
        }
      }
    }
  }
}

/**
 * Remove factory from the map grid: restore original tiles and clear building flag
 * Similar to clearBuildingFromMapGrid but for factories
 */
export function clearFactoryFromMapGrid(factory, mapGrid) {
  for (let y = factory.y; y < factory.y + factory.height; y++) {
    for (let x = factory.x; x < factory.x + factory.width; x++) {
      if (mapGrid[y] && mapGrid[y][x]) {
        // Restore the original tile type if it was saved, otherwise default to 'land'
        if (factory.originalTiles &&
            factory.originalTiles[y - factory.y] &&
            factory.originalTiles[y - factory.y][x - factory.x]) {
          mapGrid[y][x].type = factory.originalTiles[y - factory.y][x - factory.x]
        } else {
          mapGrid[y][x].type = 'land'
          // Make sure ore property exists when restoring tiles
          if (mapGrid[y][x].ore === undefined) {
            mapGrid[y][x].ore = false
          }
        }
        // Clear any building reference to unblock this tile for pathfinding
        delete mapGrid[y][x].building
      }
    }
  }
}
