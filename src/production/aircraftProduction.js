import { hasBlockingBuilding } from '../utils/buildingPassability.js'

export const AIRCRAFT_TYPES = Object.freeze(['apache', 'f22Raptor', 'f35', 'c5Galaxy'])

export function isOperationalPlaneFactory(building, owner) {
  return building.type === 'planeFactory' && building.owner === owner &&
    building.health > 0 && !building.isBeingSold && !building.destroyed
}

export function hasPlaneFactory(buildings, owner) {
  return buildings.some(building => isOperationalPlaneFactory(building, owner))
}

export function isGroundAircraftDelivery(unit) {
  return Boolean(unit.aircraftDelivery && (unit.type === 'f22Raptor' || unit.type === 'c5Galaxy'))
}

export function findGalaxySpawnTile(factory, mapGrid, occupancy) {
  const edgeY = factory.y + (factory.height || 3)
  const edgeX = factory.x + (factory.width || 3)
  const candidates = [
    [factory.x + 1, edgeY + 1],
    [factory.x + 2, edgeY + 1],
    [factory.x - 2, edgeY - 1],
    [edgeX + 1, edgeY - 1]
  ]
  for (const [x, y] of candidates) {
    let clear = true
    for (let row = y - 1; row <= y + 1 && clear; row++) {
      for (let column = x - 1; column <= x + 1; column++) {
        const tile = mapGrid?.[row]?.[column]
        if (!tile || tile.type === 'water' || tile.type === 'rock' || hasBlockingBuilding(tile) || tile.seedCrystal ||
          tile.airstripStreet || tile.impassable || occupancy?.[row]?.[column] > 0) {
          clear = false
          break
        }
      }
    }
    if (clear) return { x, y }
  }
  return null
}
