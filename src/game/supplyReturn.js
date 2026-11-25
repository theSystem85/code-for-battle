import { TILE_SIZE } from '../config.js'
import { findPath } from '../units.js'
import { getNavalPathOptions, getShipyardServiceWaterTiles, hasShipyardServiceDependency, isNavalUnitInShipyardServiceArea } from '../utils/navalUtils.js'
import { getServiceRadiusPixels } from '../utils/serviceRadius.js'
import { normalizeServiceOwner, supplyReturnTrips } from './serviceUnitIndex.js'
import { stopUnitMovement } from './unifiedMovement.js'

const groundSupplies = {
  ambulance: { building: 'hospital', cargo: 'medics', capacity: 'maxMedics', fallbackCapacity: 10, task: 'healingTarget' },
  tankerTruck: { building: 'gasStation', cargo: 'supplyGas', capacity: 'maxSupplyGas', task: 'refuelTarget' },
  ammunitionTruck: { building: 'ammunitionFactory', cargo: 'ammoCargo', capacity: 'maxAmmoCargo', task: 'ammoResupplyTarget' }
}
const shipSupplies = [
  { cargo: 'supplyFuel', capacity: 'maxSupplyFuel', service: 'fuel' },
  { cargo: 'supplyAmmo', capacity: 'maxSupplyAmmo', service: 'ammunition' },
  { cargo: 'supplyRepairTools', capacity: 'maxSupplyRepairTools', service: 'health' },
  { cargo: 'supplyCrew', capacity: 'maxSupplyCrew', service: 'crew' }
]
const PATH_RETRY_MS = 1000
const PATH_ATTEMPTS_PER_RETRY = 2

function inGroundServiceArea(unit, building) {
  const dx = unit.x + TILE_SIZE / 2 - (building.x + building.width / 2) * TILE_SIZE
  const dy = unit.y + TILE_SIZE / 2 - (building.y + building.height / 2) * TILE_SIZE
  return Math.hypot(dx, dy) <= getServiceRadiusPixels(building)
}

function getGroundServiceTiles(building, mapGrid) {
  const radius = getServiceRadiusPixels(building) / TILE_SIZE - 0.5
  const centerX = building.x + (building.width - 1) / 2
  const centerY = building.y + (building.height - 1) / 2
  const tiles = []
  for (let y = Math.max(0, Math.ceil(centerY - radius)); y <= Math.min(mapGrid.length - 1, centerY + radius); y++) {
    for (let x = Math.max(0, Math.ceil(centerX - radius)); x <= centerX + radius; x++) {
      const tile = mapGrid[y]?.[x]
      if (!tile || tile.building || tile.seedCrystal || tile.type === 'water' || tile.type === 'rock') continue
      if (Math.hypot(x - centerX, y - centerY) <= radius) tiles.push({ x, y })
    }
  }
  return tiles
}

function isUsableBuilding(building, owner) {
  return building.health > 0 && !building.isBeingSold && !building.destroyed &&
    building.constructionFinished !== false && normalizeServiceOwner(building.owner) === owner
}

function capacity(unit, supply) {
  return unit[supply.capacity] || supply.fallbackCapacity || 0
}

function beginReturn(unit, trip, building, spec, destination, path) {
  trip.building = building
  trip.destination = destination
  unit.target = null
  if (spec) unit[spec.task] = null
  if (unit.type === 'tankerTruck') {
    unit.emergencyTarget = null
    unit.emergencyMode = false
    unit.emergencyStartTime = null
    unit.refuelTimer = 0
  }
  if (unit.type === 'ambulance') unit.healingTimer = 0
  if (unit.type === 'ammunitionTruck') unit.ammoResupplyTimer = 0
  stopUnitMovement(unit)
  unit.moveTarget = destination
  if (path) {
    unit.path = path.slice(1)
    unit.pathComputedWithOccupancy = true
  }
}

// AI logistics already send these units to service buildings before they run dry.
export function updateSupplyReturns(units, state, mapGrid, occupancyMap) {
  const now = state.simulationTime || 0
  const localOwner = normalizeServiceOwner(state.humanPlayer)
  let pathAttemptsRemaining = PATH_ATTEMPTS_PER_RETRY
  for (const unit of units) {
    const spec = groundSupplies[unit.type]
    const isShip = unit.type === 'supplyShip'
    if ((!spec && !isShip) || unit.health <= 0 || unit.factoryExit || unit.embarkedOnId) continue
    const owner = normalizeServiceOwner(unit.owner)
    if (owner !== localOwner && !state.partyStates?.some(party => party.partyId === owner && party.aiActive === false)) continue

    let trip = supplyReturnTrips.get(unit)
    const explicitMove = unit.moveTarget && unit.moveTarget !== trip?.destination
    const onDelivery = spec && (unit[spec.task] || unit.emergencyTarget)
    if (unit.remoteControlActive || unit.kamikazeMode || unit.isRetreating || unit.transportOperation ||
        (explicitMove && (!onDelivery || trip?.building))) {
      if (trip) supplyReturnTrips.delete(unit)
      continue
    }
    if (trip?.building) {
      const stillAvailable = isUsableBuilding(trip.building, owner)
      if (stillAvailable && isShip && !unit.path?.length && now >= trip.retryAt) {
        trip.retryAt = now + PATH_RETRY_MS
        trip.supplies = trip.supplies.filter(supply => hasShipyardServiceDependency(trip.building, state.buildings, supply.service))
      }
      const refilled = trip.supplies.every(supply => unit[supply.cargo] >= capacity(unit, supply))
      if (stillAvailable && !refilled && unit.path?.length) continue
      if (stillAvailable && !refilled && (isShip
        ? isNavalUnitInShipyardServiceArea(unit, trip.building, mapGrid)
        : inGroundServiceArea(unit, trip.building))) continue
      if (unit.moveTarget === trip.destination) {
        unit.moveTarget = null
        stopUnitMovement(unit)
      }
      trip.building = null
      trip.destination = null
      if (refilled) {
        supplyReturnTrips.delete(unit)
        continue
      }
    }

    if (spec ? unit[spec.cargo] !== 0 || capacity(unit, spec) <= 0
      : !shipSupplies.some(supply => unit[supply.cargo] === 0 && capacity(unit, supply) > 0)) continue
    if (unit.gas === 0 || pathAttemptsRemaining === 0 || now < (trip?.retryAt || 0)) continue

    if (!trip) {
      trip = { candidateIndex: 0 }
      supplyReturnTrips.set(unit, trip)
    }
    trip.retryAt = now + PATH_RETRY_MS
    const buildings = state.buildings || []
    const supplyType = spec?.building || 'shipyard'
    const start = {
      x: Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE),
      y: Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE),
      owner: unit.owner,
      type: unit.type
    }
    const candidates = []
    for (const building of buildings) {
      if (building.type !== supplyType || !isUsableBuilding(building, owner)) continue
      const supplies = spec ? [spec] : shipSupplies.filter(supply =>
        capacity(unit, supply) > 0 && hasShipyardServiceDependency(building, buildings, supply.service)
      )
      if (!supplies.some(supply => unit[supply.cargo] === 0)) continue
      const inArea = isShip
        ? isNavalUnitInShipyardServiceArea(unit, building, mapGrid)
        : inGroundServiceArea(unit, building)
      if (inArea) {
        trip.supplies = supplies
        beginReturn(unit, trip, building, spec, null, null)
        break
      }
      const tiles = isShip ? getShipyardServiceWaterTiles(building, mapGrid) : getGroundServiceTiles(building, mapGrid)
      for (const tile of tiles) {
        if (occupancyMap?.[tile.y]?.[tile.x]) continue
        candidates.push({ tile, building, supplies, distance: Math.hypot(start.x - tile.x, start.y - tile.y) })
      }
    }
    if (trip.building || candidates.length === 0) continue

    candidates.sort((a, b) => a.distance - b.distance)
    const options = isShip ? { ...getNavalPathOptions(unit), strictDestination: true } : { unitOwner: unit.owner }
    const attempts = Math.min(pathAttemptsRemaining, candidates.length)
    for (let attempt = 0; attempt < attempts; attempt++) {
      pathAttemptsRemaining--
      const candidate = candidates[trip.candidateIndex++ % candidates.length]
      const path = findPath(start, candidate.tile, mapGrid, occupancyMap, undefined, options)
      const endpoint = path.at(-1)
      if (path.length <= 1 || endpoint.x !== candidate.tile.x || endpoint.y !== candidate.tile.y) continue
      trip.supplies = candidate.supplies
      beginReturn(unit, trip, candidate.building, spec, candidate.tile, path)
      trip.candidateIndex = 0
      break
    }
  }
}
