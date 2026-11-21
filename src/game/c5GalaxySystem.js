import { advanceC5Airdrop, advanceC5FlightAnimation, destroyC5Cargo } from './c5Cargo.js'
import { hasFixedOccupancy, hasMovableOccupancy } from './occupancyTags.js'
import { getBuildingIdentifier } from '../utils.js'
import { releaseC5ParkingSlots, reserveC5ParkingSlots, setC5ParkingOccupant } from '../utils/airstripUtils.js'

function terrainAllowsDrop(mapGrid, occupancyMap, buildings, x, y) {
  const row = mapGrid?.[y]
  const tile = row?.[x]
  if (tile == null) return false
  const terrain = typeof tile === 'string' ? tile : tile.type || tile.terrain
  if (terrain === 'water' || terrain === 'cliff') return false
  if (buildings.some(building => x >= building.x && x < building.x + (building.width || 1) && y >= building.y && y < building.y + (building.height || 1))) return false
  const occupancy = occupancyMap?.[y]?.[x] || 0
  return !hasFixedOccupancy(occupancy) && !hasMovableOccupancy(occupancy)
}

/** Simulation-tick C-5 driver. This is deliberately called by updateGame, not a UI animation loop. */
export function updateC5GalaxySystem(units, mapGrid, gameState, tick) {
  const buildings = gameState.buildings || []
  for (const galaxy of units) {
    if (galaxy.type !== 'c5Galaxy') continue
    const airstrip = buildings.find(building => building.type === 'airstrip' &&
      (getBuildingIdentifier(building) === galaxy.homeAirstripId || getBuildingIdentifier(building) === galaxy.airstripId))
    if (galaxy.health <= 0) {
      destroyC5Cargo(galaxy, units)
      if (airstrip) releaseC5ParkingSlots(airstrip, galaxy.id)
      continue
    }
    const previousState = galaxy.flightState
    advanceC5FlightAnimation(galaxy)
    if (previousState === 'grounded' && galaxy.flightState !== 'grounded' && airstrip) releaseC5ParkingSlots(airstrip, galaxy.id)
    if (galaxy.flightState === 'grounded' && airstrip && reserveC5ParkingSlots(airstrip, galaxy.id)) setC5ParkingOccupant(airstrip, galaxy.id)
    if (galaxy.dropQueueState) advanceC5Airdrop(galaxy, tick, units,
      (x, y) => terrainAllowsDrop(mapGrid, gameState.occupancyMap, buildings, x, y),
      message => gameState.showNotification?.(message))
  }
}
