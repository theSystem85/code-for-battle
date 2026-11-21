import { TILE_SIZE, UNIT_PROPERTIES } from '../config.js'
import { advanceC5Airdrop, beginC5Airdrop, destroyC5Cargo } from './c5Cargo.js'
import { getBuildingIdentifier } from '../utils.js'
import { getAirstripRunwayPoints, getAirstripParkingSpots, releaseC5ParkingSlots, reserveC5ParkingSlots, setC5ParkingOccupant } from '../utils/airstripUtils.js'

const moveToward = (unit, target, speed) => { const dx = target.x - unit.x; const dy = target.y - unit.y; const distance = Math.hypot(dx, dy); if (distance <= speed) { unit.x = target.x; unit.y = target.y; return true } unit.direction = Math.atan2(dy, dx); unit.x += dx / distance * speed; unit.y += dy / distance * speed; return false }
const centerOfC5Slots = airstrip => { const spots = getAirstripParkingSpots(airstrip).slice(0, 3); return { x: spots.reduce((sum, p) => sum + p.worldX, 0) / 3 - TILE_SIZE / 2, y: spots.reduce((sum, p) => sum + p.worldY, 0) / 3 - TILE_SIZE / 2 } }
const dropAllowed = (grid, occupancy, buildings, x, y) => { const tile = grid?.[y]?.[x]; const terrain = typeof tile === 'string' ? tile : tile?.type || tile?.terrain; return Boolean(tile) && terrain !== 'water' && terrain !== 'cliff' && !occupancy?.[y]?.[x] && !buildings.some(b => x >= b.x && x < b.x + (b.width || 1) && y >= b.y && y < b.y + (b.height || 1)) }

export function startC5Mission(galaxy, target, tick) { galaxy.c5Mission = { phase: 'outbound', target: { ...target }, startedTick: tick }; if (galaxy.flightState === 'grounded') galaxy.flightState = 'taxiOut' }

export function updateC5GalaxySystem(units, mapGrid, gameState, tick) {
  const buildings = gameState.buildings || []
  for (const galaxy of units) {
    if (galaxy.type !== 'c5Galaxy') continue
    const airstrip = buildings.find(b => b.type === 'airstrip' && [galaxy.homeAirstripId, galaxy.airstripId].includes(getBuildingIdentifier(b)))
    if (galaxy.health <= 0) { destroyC5Cargo(galaxy, units); if (airstrip) releaseC5ParkingSlots(airstrip, galaxy.id); continue }
    const maxAltitude = galaxy.maxAltitude || TILE_SIZE * 4.5; const speed = UNIT_PROPERTIES.c5Galaxy.speed
    if (airstrip) {
      const runway = getAirstripRunwayPoints(airstrip)
      if (galaxy.flightState === 'taxiOut') { releaseC5ParkingSlots(airstrip, galaxy.id); if (moveToward(galaxy, { x: runway.runwayStart.worldX, y: runway.runwayStart.worldY }, speed * 0.45)) galaxy.flightState = 'takeoffRoll' }
      else if (galaxy.flightState === 'takeoffRoll' && moveToward(galaxy, { x: runway.runwayLiftOff.worldX, y: runway.runwayLiftOff.worldY }, speed)) galaxy.flightState = 'climb'
      else if (galaxy.flightState === 'climb') { galaxy.altitude = Math.min(maxAltitude, (galaxy.altitude || 0) + maxAltitude / 90); moveToward(galaxy, { x: runway.runwayExit.worldX, y: runway.runwayExit.worldY }, speed); if (galaxy.altitude >= maxAltitude) galaxy.flightState = 'airborne' }
      else if (galaxy.flightState === 'approach') { galaxy.altitude = Math.max(0, galaxy.altitude - maxAltitude / 90); if (moveToward(galaxy, { x: runway.runwayStart.worldX, y: runway.runwayStart.worldY }, speed) && galaxy.altitude === 0) galaxy.flightState = 'touchdown' }
      else if (galaxy.flightState === 'touchdown' && moveToward(galaxy, { x: runway.runwayLiftOff.worldX, y: runway.runwayLiftOff.worldY }, speed * 0.7)) galaxy.flightState = 'taxiIn'
      else if (galaxy.flightState === 'taxiIn' && moveToward(galaxy, centerOfC5Slots(airstrip), speed * 0.4)) { galaxy.flightState = 'grounded'; reserveC5ParkingSlots(airstrip, galaxy.id); setC5ParkingOccupant(airstrip, galaxy.id); if (galaxy.c5Mission?.phase === 'return') galaxy.c5Mission = null }
    }
    const mission = galaxy.c5Mission
    if (mission && galaxy.flightState === 'airborne') {
      if (mission.phase === 'outbound') { const target = { x: mission.target.x * TILE_SIZE, y: mission.target.y * TILE_SIZE }; if (moveToward(galaxy, target, speed)) { beginC5Airdrop(galaxy, mission.target, tick); mission.phase = 'dropping' } }
      else if (mission.phase === 'dropping' && !galaxy.dropQueueState) mission.phase = 'return'
      else if (mission.phase === 'return' && airstrip && moveToward(galaxy, { x: getAirstripRunwayPoints(airstrip).runwayExit.worldX, y: getAirstripRunwayPoints(airstrip).runwayExit.worldY }, speed)) galaxy.flightState = 'approach'
    }
    if (galaxy.dropQueueState) advanceC5Airdrop(galaxy, tick, units, (x, y) => dropAllowed(mapGrid, gameState.occupancyMap, buildings, x, y), message => gameState.showNotification?.(message))
    galaxy.shadow ||= {}; galaxy.shadow.offset = (galaxy.altitude || 0) * 0.25; galaxy.shadow.scale = 1 + (galaxy.altitude || 0) / maxAltitude * 0.35
  }
}
