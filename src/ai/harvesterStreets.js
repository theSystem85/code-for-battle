import { TILE_SIZE } from '../config.js'
import { buildingData, createBuilding, placeBuilding } from '../buildings.js'
import { isDecorativeBuildBlocker } from '../validation/buildingPlacement.js'

// Transient traffic evidence: saves start learning routes again, without changing
// the saved game schema. History is bounded per factory and reset for a new map.
const trafficByFactory = new WeakMap()
const MAX_TRAFFIC_TILES = 1024
const TRAFFIC_LIFETIME = 180000

export function canPave(tile, mapGrid, x, y) {
  return tile?.type === 'land' && !tile.ore && !tile.seedCrystal &&
    !tile.building && !tile.noBuild && !tile.buildOnlyOccupied &&
    !isDecorativeBuildBlocker(mapGrid, x, y)
}

export function updateHarvesterStreets(factory, harvesters, mapGrid, gameState, occupancyMap, now) {
  let traffic = trafficByFactory.get(factory)
  if (!traffic || traffic.mapGrid !== mapGrid || now < traffic.lastBuild) {
    traffic = { mapGrid, positions: new WeakMap(), tiles: new Map(), lastBuild: now }
    trafficByFactory.set(factory, traffic)
  }

  // One O(harvesters) pass at the existing AI cadence, with no per-tick
  // allocations for stationary units. Count tile entries, never idle time.
  for (const unit of harvesters) {
    const x = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const y = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
    const key = y * (mapGrid[0]?.length || 0) + x
    const previous = traffic.positions.get(unit)
    if (previous === key) continue
    traffic.positions.set(unit, key)
    if (previous === undefined || !canPave(mapGrid[y]?.[x], mapGrid, x, y)) continue
    let evidence = traffic.tiles.get(key)
    if (!evidence) {
      if (traffic.tiles.size >= MAX_TRAFFIC_TILES) {
        traffic.tiles.delete(traffic.tiles.keys().next().value)
      }
      evidence = { x, y, passes: 0, lastPass: now }
      traffic.tiles.set(key, evidence)
    }
    if (now - evidence.lastPass > TRAFFIC_LIFETIME) evidence.passes = 0
    evidence.passes++
    evidence.lastPass = now
  }

  if (now - traffic.lastBuild < 1000) return
  traffic.lastBuild = now
  const cost = buildingData.street.cost
  if (!(factory.budget >= cost)) return
  for (const [key, evidence] of traffic.tiles) {
    const { x, y } = evidence
    if (now - evidence.lastPass > TRAFFIC_LIFETIME || !canPave(mapGrid[y]?.[x], mapGrid, x, y)) {
      traffic.tiles.delete(key)
      continue
    }
    if (evidence.passes < 3) continue
    // Grow a connected road rather than scattering isolated street tiles.
    if (mapGrid[y]?.[x - 1]?.type !== 'street' && mapGrid[y]?.[x + 1]?.type !== 'street' &&
        mapGrid[y - 1]?.[x]?.type !== 'street' && mapGrid[y + 1]?.[x]?.type !== 'street') continue
    const street = createBuilding('street', x, y)
    street.owner = factory.owner || factory.id
    placeBuilding(street, mapGrid, occupancyMap)
    gameState.buildings.push(street)
    factory.budget -= cost
    traffic.tiles.delete(key)
    return street
  }
}
