import { TILE_SIZE } from '../config.js'

export const WATER_MOVEMENT_TYPE = 'water'
export const navalUnitTypes = ['destroyer']
export const navalProductionBuildingTypes = ['shipyard']
export const SHIPYARD_SERVICE_RADIUS_TILES = 3
export const DESTROYER_RENDER_LENGTH_TILES = 2.6
export const DESTROYER_HULL_LENGTH_RATIO = 0.895

const SHIPYARD_SERVICE_REQUIREMENTS = Object.freeze({
  fuel: 'gasStation',
  ammunition: 'ammunitionFactory',
  crew: 'hospital',
  health: 'vehicleWorkshop'
})

export function isNavalUnitType(type) {
  return navalUnitTypes.includes(type)
}

export function isWaterTile(mapGrid, x, y) {
  return Boolean(mapGrid?.[y]?.[x] && mapGrid[y][x].type === 'water')
}

export function isWaterPassableTile(mapGrid, x, y) {
  const tile = mapGrid?.[y]?.[x]
  return Boolean(tile && tile.type === 'water' && !tile.building && !tile.seedCrystal)
}

export function getShipyardWaterLocalTiles(width = 5, height = 5) {
  const tiles = []
  const firstWaterRow = Math.floor(height / 2)
  for (let y = firstWaterRow; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles.push({ x, y })
    }
  }
  return tiles
}

export function isShipyardWaterLocalTile(localX, localY, width = 5, height = 5) {
  return localX >= 0 && localX < width && localY >= Math.floor(height / 2) && localY < height
}

export function getShipyardLaunchTile(shipyard, mapGrid) {
  const candidates = []
  const y = shipyard.y + shipyard.height
  for (let x = shipyard.x; x < shipyard.x + shipyard.width; x++) {
    candidates.push({ x, y })
  }
  const centerX = shipyard.x + Math.floor(shipyard.width / 2)
  return candidates
    .filter(tile => isWaterPassableTile(mapGrid, tile.x, tile.y))
    .sort((a, b) => Math.abs(a.x - centerX) - Math.abs(b.x - centerX))[0] || null
}

export function getNavalPathOptions(unitOrOwner = null) {
  return {
    movementType: WATER_MOVEMENT_TYPE,
    unitOwner: typeof unitOrOwner === 'string' ? unitOrOwner : unitOrOwner?.owner
  }
}

function normalizeOwner(owner) {
  return owner === 'player' ? 'player1' : owner
}

export function hasShipyardServiceDependency(shipyard, buildings, service) {
  const requiredType = SHIPYARD_SERVICE_REQUIREMENTS[service]
  if (!requiredType || !shipyard || !Array.isArray(buildings)) return false
  const owner = normalizeOwner(shipyard.owner)
  return buildings.some(building =>
    building?.type === requiredType &&
    building.health > 0 &&
    normalizeOwner(building.owner) === owner
  )
}

export function isTileInShipyardServiceArea(shipyard, tileX, tileY, mapGrid, radius = SHIPYARD_SERVICE_RADIUS_TILES) {
  if (!shipyard || !isWaterTile(mapGrid, tileX, tileY)) return false

  const leftDistance = Math.max(shipyard.x - tileX, 0, tileX - (shipyard.x + shipyard.width - 1))
  const topDistance = Math.max(shipyard.y - tileY, 0, tileY - (shipyard.y + shipyard.height - 1))
  const edgeDistance = Math.max(leftDistance, topDistance)
  const insideFootprint =
    tileX >= shipyard.x && tileX < shipyard.x + shipyard.width &&
    tileY >= shipyard.y && tileY < shipyard.y + shipyard.height

  return !insideFootprint && edgeDistance >= 1 && edgeDistance <= radius
}

export function isNavalUnitInShipyardServiceArea(unit, shipyard, mapGrid) {
  if (!unit?.isNaval || unit.health <= 0 || normalizeOwner(unit.owner) !== normalizeOwner(shipyard?.owner)) {
    return false
  }
  const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
  return isTileInShipyardServiceArea(shipyard, tileX, tileY, mapGrid)
}

export function getShipyardServiceWaterTiles(shipyard, mapGrid) {
  if (!shipyard || !Array.isArray(mapGrid) || !Array.isArray(mapGrid[0])) return []
  const tiles = []
  const radius = SHIPYARD_SERVICE_RADIUS_TILES
  const startX = Math.max(0, shipyard.x - radius)
  const endX = Math.min(mapGrid[0].length - 1, shipyard.x + shipyard.width - 1 + radius)
  const startY = Math.max(0, shipyard.y - radius)
  const endY = Math.min(mapGrid.length - 1, shipyard.y + shipyard.height - 1 + radius)

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      if (isTileInShipyardServiceArea(shipyard, x, y, mapGrid, radius)) {
        tiles.push({ x, y })
      }
    }
  }
  return tiles
}

export function addShipWake(unit, gameState, now = performance.now()) {
  const speed = unit?.movement?.currentSpeed || 0
  if (!unit?.isNaval || !gameState || !unit.movement?.isMoving || speed <= 0.01) return
  if (unit.lastWakeTime && now - unit.lastWakeTime < 90) return

  const direction = unit.direction || 0
  const centerX = unit.x + TILE_SIZE / 2
  const centerY = unit.y + TILE_SIZE / 2
  const hullEndOffset = TILE_SIZE * (DESTROYER_RENDER_LENGTH_TILES / 2) * DESTROYER_HULL_LENGTH_RATIO
  const directionX = Math.cos(direction)
  const directionY = Math.sin(direction)
  gameState.shipWakes = gameState.shipWakes || []
  gameState.shipWakes.push({
    x: centerX - directionX * hullEndOffset,
    y: centerY - directionY * hullEndOffset,
    direction,
    createdAt: now,
    duration: 1100,
    size: TILE_SIZE * 0.55,
    speed,
    kind: 'stern'
  }, {
    x: centerX + directionX * hullEndOffset,
    y: centerY + directionY * hullEndOffset,
    direction,
    createdAt: now,
    duration: 650,
    size: TILE_SIZE * 0.24,
    speed,
    kind: 'bow'
  })
  unit.lastWakeTime = now
}
