import { advanceC5FlightPath, createC5FlightPath } from './c5FlightPath.js'
import { TILE_SIZE, UNIT_GAS_PROPERTIES, UNIT_PROPERTIES, WIND_DIRECTION } from '../config.js'
import { findPathForOwner, removeUnitOccupancy } from '../units.js'
import { hasBlockingBuilding } from '../utils/buildingPassability.js'
import { showNotification } from '../ui/notifications.js'
import { playPositionalSound } from '../sound.js'
import { getBuildingIdentifier } from '../utils.js'
import { C5_LOWER_SLOT_INDICES, getAirstripRunwayPoints, getC5ParkingPosition, releaseAirstripRunwayOperation, releaseC5ParkingSlots, setC5ParkingOccupant, tryClaimAirstripRunwayOperation } from '../utils/airstripUtils.js'
import {
  advanceC5Airdrop, beginC5Airdrop, changeC5GroundOccupancy, destroyC5Cargo, embarkC5Vehicle, evaluateC5Load,
  findC5DropTile, getC5CargoWeight, placeC5Cargo, unloadC5Cargo
} from './c5Cargo.js'

const speed = UNIT_PROPERTIES.c5Galaxy.speed
const turnRate = UNIT_PROPERTIES.c5Galaxy.rotationSpeed
const approachLength = TILE_SIZE * 9
const noseDistance = TILE_SIZE * 1.1
const cruiseAltitude = TILE_SIZE * 4.5
const fuelRate = UNIT_GAS_PROPERTIES.c5Galaxy.consumption / TILE_SIZE
const cargoUnitIndex = new Map()
const airstripIndex = new Map()
const boardingUnits = new Map()

function indexCargoUnits(units) {
  cargoUnitIndex.clear()
  for (const unit of units) cargoUnitIndex.set(unit.id, unit)
  return cargoUnitIndex
}

function moveToward(unit, x, y, step) {
  const dx = x - unit.x
  const dy = y - unit.y
  const distance = Math.hypot(dx, dy)
  if (distance > 0) unit.direction = Math.atan2(dy, dx)
  if (distance <= step) {
    unit.x = x
    unit.y = y
    return true
  }
  unit.x += dx / distance * step
  unit.y += dy / distance * step
  return false
}

function moveToRunwayPoint(unit, point, speed) {
  return moveToward(unit, point.worldX - TILE_SIZE / 2, point.worldY - TILE_SIZE / 2, speed)
}

function tileOf(unit) {
  return { x: Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE), y: Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE) }
}

function terrainAt(mapGrid, x, y) {
  const tile = mapGrid?.[y]?.[x]
  return typeof tile === 'string' ? tile : tile?.type ?? tile?.terrain
}

export function isC5LandingTile(mapGrid, occupancy, x, y) {
  const terrain = terrainAt(mapGrid, x, y)
  const tile = mapGrid?.[y]?.[x]
  return Boolean(terrain && terrain !== 'water' && terrain !== 'cliff' && terrain !== 'rock' &&
    !hasBlockingBuilding(tile) && !tile.seedCrystal && !occupancy?.[y]?.[x])
}

function findHome(galaxy, buildings) {
  return buildings.find(building => building.type === 'airstrip' && !(building.health <= 0) &&
    getBuildingIdentifier(building) === (galaxy.homeAirstripId ?? galaxy.airstripId))
}

export function startC5Mission(galaxy, target, tick, options = {}) {
  const { mapGrid, buildings = [], drop = true } = options
  if (galaxy.health <= 0 || galaxy.c5Mission || !Number.isInteger(target?.x) || !Number.isInteger(target?.y)) return false
  if (mapGrid && (!mapGrid[target.y]?.[target.x] || (drop && terrainAt(mapGrid, target.x, target.y) === 'water'))) return false
  if (drop && !galaxy.embarkedUnitIds?.length) return false
  const home = findHome(galaxy, buildings)
  const returnPoint = home ? getC5ParkingPosition(home) : { x: galaxy.x, y: galaxy.y }
  const targetX = target.x * TILE_SIZE
  const targetY = target.y * TILE_SIZE
  const required = (Math.hypot(galaxy.x - targetX, galaxy.y - targetY) +
    Math.hypot(returnPoint.x - targetX, returnPoint.y - targetY) + (home ? TILE_SIZE * 50 : 0)) * fuelRate
  if (Number.isFinite(galaxy.gas) && galaxy.gas < required) return false
  galaxy.c5Mission = { phase: 'outbound', target: { ...target }, returnPoint, startedTick: tick, drop }
  if (galaxy.flightState === 'grounded') galaxy.flightState = 'taxiOut'
  return true
}

function getBoardingTile(galaxy, vehicle, state) {
  const occupancy = state.occupancyMap
  const grid = state.mapGrid
  const origin = tileOf(galaxy)
  const start = tileOf(vehicle)
  let route
  const tile = findC5DropTile(origin, (x, y) => {
    if (x === start.x && y === start.y) return true
    if (!isC5LandingTile(grid, occupancy, x, y)) return false
    route = findPathForOwner(start, { x, y }, grid, occupancy, vehicle.owner, { strictDestination: true })
    return route?.length > 1
  }, 10, 2)
  return tile && { tile, path: tile.x === start.x && tile.y === start.y ? [] : route.slice(1) }
}

function queueBoarding(galaxy, vehicle, units, state) {
  if (galaxy.flightState !== 'grounded' || vehicle.c5Boarding) return false
  const result = evaluateC5Load(galaxy, vehicle, units)
  if (!result.allowed) {
    if (galaxy.owner === state.humanPlayer) (state.showNotification || showNotification)(result.message)
    return false
  }
  const staging = getBoardingTile(galaxy, vehicle, state)
  if (!staging) return false
  vehicle.target = null
  vehicle.attackTarget = null
  vehicle.guardMode = false
  vehicle.commandQueue = []
  vehicle.currentCommand = null
  vehicle.path = staging.path
  vehicle.moveTarget = { ...staging.tile }
  vehicle.c5Boarding = { galaxyId: galaxy.id, tile: staging.tile, loading: false }
  return true
}

function cancelBoarding(unit, state) {
  if (unit.c5Boarding.loading) placeC5Cargo(unit, unit.c5Boarding.tile, state.occupancyMap)
  unit.c5Boarding = null
  unit.moveTarget = null
  unit.path = []
}

function updateBoarding(unit, galaxy, units, state) {
  const boarding = unit.c5Boarding
  if (unit.health <= 0) return
  if (!galaxy || galaxy.health <= 0 || galaxy.flightState !== 'grounded') {
    cancelBoarding(unit, state)
    return
  }
  if (boardingUnits.get(galaxy.id) !== unit) return
  if (!boarding.loading) {
    const desired = Math.atan2(unit.y - galaxy.y, unit.x - galaxy.x)
    const error = desired - (galaxy.direction || 0)
    const turn = Math.atan2(Math.sin(error), Math.cos(error))
    galaxy.direction = (galaxy.direction || 0) + Math.max(-turnRate, Math.min(turnRate, turn))
    const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
    if (tileX !== boarding.tile.x || tileY !== boarding.tile.y) {
      if (!unit.path?.length) cancelBoarding(unit, state)
      return
    }
    if (Math.abs(turn) > turnRate) return
    removeUnitOccupancy(unit, state.occupancyMap)
    unit.occupancyRemoved = true
    boarding.loading = true
    unit.path = []
  }
  if (!boarding.atNose) {
    const noseX = galaxy.x + Math.cos(galaxy.direction) * noseDistance
    const noseY = galaxy.y + Math.sin(galaxy.direction) * noseDistance
    if (!moveToward(unit, noseX, noseY, 1.2)) return
    boarding.atNose = true
  }
  if (!moveToward(unit, galaxy.x, galaxy.y, 1.2)) return
  const result = embarkC5Vehicle(galaxy, unit, units)
  if (!result.allowed) {
    if (galaxy.owner === state.humanPlayer) (state.showNotification || showNotification)(result.message)
    cancelBoarding(unit, state)
    return
  }
  unit.c5Boarding = null
}

export function applyC5Order(action, payload, owner, units, state) {
  const galaxy = units.find(unit => unit.id === payload?.galaxyId && unit.type === 'c5Galaxy' &&
    unit.owner === owner && unit.health > 0)
  if (!galaxy) return false
  if (action === 'load') {
    const ids = new Set(Array.isArray(payload.unitIds) ? payload.unitIds : [payload.unitId])
    let accepted = false
    for (const vehicle of units) {
      if (ids.has(vehicle.id) && queueBoarding(galaxy, vehicle, units, state)) accepted = true
    }
    return accepted
  }
  const target = payload.target
  const mapGrid = state.mapGrid
  const occupancy = state.occupancyMap
  if (action === 'move' || action === 'airdrop') {
    const accepted = startC5Mission(galaxy, target, state.frameCount || 0, {
      mapGrid, buildings: state.buildings, drop: action === 'airdrop'
    })
    if (!accepted && owner === state.humanPlayer) (state.showNotification || showNotification)(action === 'airdrop'
      ? 'Choose a land tile. An airdrop needs cargo, fuel, and an available Galaxy.'
      : 'Galaxy unavailable or insufficient fuel for a round trip.')
    return accepted
  }
  if (action !== 'unload' || galaxy.flightState !== 'grounded' ||
    !isC5LandingTile(mapGrid, occupancy, target?.x, target?.y)) return false

  let cancelled = false
  for (const unit of units) {
    if (unit.c5Boarding?.galaxyId !== galaxy.id) continue
    cancelBoarding(unit, state)
    const current = tileOf(unit)
    unit.path = findPathForOwner(current, target, mapGrid, occupancy, unit.owner)?.slice(1) || []
    cancelled = true
  }
  const origin = tileOf(galaxy)
  const used = new Set()
  const unloaded = unloadC5Cargo(galaxy, units, () => {
    const tile = findC5DropTile(origin, (x, y) => {
      const key = y * mapGrid[0].length + x
      return !used.has(key) && isC5LandingTile(mapGrid, occupancy, x, y)
    }, 10, 2)
    if (!tile) return null
    used.add(tile.y * mapGrid[0].length + tile.x)
    return { x: tile.x * TILE_SIZE, y: tile.y * TILE_SIZE }
  })
  for (const unit of unloaded) {
    const current = tileOf(unit)
    placeC5Cargo(unit, current, occupancy)
    unit.path = findPathForOwner(current, target, mapGrid, occupancy, unit.owner)?.slice(1) || []
  }
  return cancelled || unloaded.length > 0
}

function smoothstep(progress) {
  const t = Math.max(0, Math.min(1, progress))
  return t * t * (3 - 2 * t)
}

function finishOutbound(galaxy, mission, grid, tick) {
  if (mission.drop !== false && terrainAt(grid, mission.target.x, mission.target.y) !== 'water') {
    beginC5Airdrop(galaxy, mission.target, tick)
    mission.phase = 'dropping'
  } else {
    mission.phase = 'return'
  }
  mission.path = null
}

function followOutbound(galaxy, mission) {
  mission.path ??= createC5FlightPath(galaxy, mission.target.x * TILE_SIZE, mission.target.y * TILE_SIZE)
  return advanceC5FlightPath(galaxy, mission.path, speed)
}

function updateFlight(galaxy, home, grid, occupancy, tick) {
  const mission = galaxy.c5Mission
  if (!mission) return
  const runway = home && (home.runwayPoints ?? getAirstripRunwayPoints(home))
  const maxAltitude = galaxy.maxAltitude || cruiseAltitude
  const thresholdX = runway ? runway.runwayStart.worldX - TILE_SIZE / 2 : mission.returnPoint?.x ?? galaxy.x
  const thresholdY = runway ? runway.runwayStart.worldY - TILE_SIZE / 2 : mission.returnPoint?.y ?? galaxy.y
  switch (galaxy.flightState) {
    case 'taxiOut':
      if (home && !tryClaimAirstripRunwayOperation(home, galaxy.id, 'takeoff')) break
      if (galaxy.c5GroundOccupancy) changeC5GroundOccupancy(galaxy, occupancy, -1)
      if (home && home.f22OccupiedSlotUnitIds?.[0] === galaxy.id) {
        for (const index of C5_LOWER_SLOT_INDICES) home.f22OccupiedSlotUnitIds[index] = null
      }
      if (!runway || moveToRunwayPoint(galaxy, runway.runwayStart, speed * 0.3)) {
        if (runway) galaxy.direction = 0
        galaxy.flightState = 'takeoffRoll'
      }
      break
    case 'takeoffRoll':
      if (!runway || moveToRunwayPoint(galaxy, runway.runwayExit, speed * 0.8)) galaxy.flightState = 'climb'
      break
    case 'climb': {
      if (!mission.path) {
        const dx = mission.target.x * TILE_SIZE - galaxy.x
        const dy = mission.target.y * TILE_SIZE - galaxy.y
        if (Math.hypot(dx, dy) < approachLength) {
          const heading = galaxy.direction || 0
          const error = Math.atan2(dy, dx) - heading
          const turn = Math.atan2(Math.sin(error), Math.cos(error))
          const lead = heading + Math.max(-Math.PI / 3, Math.min(Math.PI / 3, turn))
          mission.path = createC5FlightPath(galaxy, galaxy.x + Math.cos(lead) * approachLength,
            galaxy.y + Math.sin(lead) * approachLength, lead)
          mission.climbLead = true
        }
      }
      const arrived = followOutbound(galaxy, mission)
      const path = mission.path
      const climbDistance = Math.min(approachLength, path.lengths.at(-1))
      galaxy.altitude = maxAltitude * smoothstep(climbDistance ? path.traveled / climbDistance : 1)
      if (galaxy.altitude >= maxAltitude) {
        if (home) releaseAirstripRunwayOperation(home, galaxy.id)
        if (!mission.climbLead || arrived) galaxy.flightState = 'airborne'
      }
      if (arrived && mission.climbLead) {
        mission.path = null
        mission.climbLead = false
      } else if (arrived) finishOutbound(galaxy, mission, grid, tick)
      break
    }
    case 'airborne':
      if (mission.phase === 'outbound') {
        if (followOutbound(galaxy, mission)) finishOutbound(galaxy, mission, grid, tick)
      } else if (mission.phase === 'dropping') {
        // Continue flying around the drop point until the last vehicle releases.
        galaxy.direction = (galaxy.direction || 0) + turnRate
        galaxy.x += Math.cos(galaxy.direction) * speed
        galaxy.y += Math.sin(galaxy.direction) * speed
        if (!galaxy.dropQueueState) mission.phase = 'return'
      } else if (mission.phase === 'return') {
        const approachX = thresholdX - approachLength
        if (!mission.path) {
          // Set up the eastbound approach outside the runway. A second leg
          // avoids reversing along the same line when returning from the east.
          mission.returnDetour = galaxy.x >= approachX && Math.abs(galaxy.y - thresholdY) < TILE_SIZE * 4
          const detourX = approachX - TILE_SIZE * 5
          const detourY = thresholdY + (galaxy.y > thresholdY ? -1 : 1) * TILE_SIZE * 5
          mission.path = mission.returnDetour
            ? createC5FlightPath(galaxy, detourX, detourY, Math.atan2(thresholdY - detourY, approachX - detourX))
            : createC5FlightPath(galaxy, approachX, thresholdY, 0)
        }
        if (advanceC5FlightPath(galaxy, mission.path, speed)) {
          if (mission.returnDetour) {
            mission.returnDetour = false
            mission.path = createC5FlightPath(galaxy, approachX, thresholdY, 0)
          } else {
            mission.path = null
            if (!home || tryClaimAirstripRunwayOperation(home, galaxy.id, 'landing')) {
              mission.approachReady = true
              galaxy.flightState = 'approach'
            }
          }
        }
      }
      break
    case 'approach': {
      if (!mission.approachReady && galaxy.x > thresholdX) {
        galaxy.flightState = 'airborne'
        mission.phase = 'return'
        break
      }
      const arrived = moveToward(galaxy, thresholdX, thresholdY, speed)
      galaxy.altitude = maxAltitude * smoothstep((thresholdX - galaxy.x) / approachLength)
      if (arrived) galaxy.flightState = 'touchdown'
      break
    }
    case 'touchdown':
      if (!runway || moveToRunwayPoint(galaxy, runway.runwayExit, speed * 0.55)) galaxy.flightState = 'taxiIn'
      break
    case 'taxiIn': {
      const point = home && (mission.parkingPoint ??= getC5ParkingPosition(home))
      if (point && !moveToward(galaxy, point.x, point.y, speed * 0.4)) break
      galaxy.flightState = 'grounded'
      changeC5GroundOccupancy(galaxy, occupancy, 1)
      if (home) {
        releaseAirstripRunwayOperation(home, galaxy.id)
        setC5ParkingOccupant(home, galaxy.id)
      }
      galaxy.c5Mission = null
      break
    }
  }
}

function updateDescendingCargo(unit, mapGrid, occupancy, tick) {
  const drop = unit.c5Drop
  if (unit.health <= 0 || tick >= drop.landTick) {
    const tile = isC5LandingTile(mapGrid, occupancy, drop.tile.x, drop.tile.y)
      ? drop.tile : findC5DropTile(drop.target, (x, y) => isC5LandingTile(mapGrid, occupancy, x, y)) ||
        (isC5LandingTile(mapGrid, null, drop.tile.x, drop.tile.y) ? drop.tile : null)
    if (tile) {
      placeC5Cargo(unit, tile, occupancy)
      unit.c5Drop = null
      unit.altitude = 0
    } else if (unit.health <= 0) {
      unit.c5Drop = null
      unit.altitude = 0
    }
    return
  }
  const remaining = Math.max(0, (drop.landTick - tick) / (drop.landTick - drop.startTick))
  unit.altitude = drop.altitude * remaining
  unit.x = drop.tile.x * TILE_SIZE - (drop.windX || 0) * remaining * 12
  unit.y = drop.tile.y * TILE_SIZE - (drop.windY || 0) * remaining * 12
}

export function playC5TransitionSound(unit, previousFlightState, wasDescending = false) {
  if (unit.c5Drop && !wasDescending) {
    playPositionalSound('c5CargoRelease', unit.x, unit.y, 0.45, 0, true)
  }
  if (unit.type !== 'c5Galaxy' || unit.flightState === previousFlightState) return
  if (unit.flightState === 'takeoffRoll') playPositionalSound('c5Takeoff', unit.x, unit.y, 0.55, 0, true)
  if (unit.flightState === 'touchdown') playPositionalSound('c5Touchdown', unit.x, unit.y, 0.48, 0, true)
}

export function updateC5GalaxySystem(units, mapGrid, gameState, tick) {
  const occupancy = gameState.occupancyMap
  const buildings = gameState.buildings || []
  let unitsById
  let occupiedDrops
  let airstripsById
  // At simulation frequency. Build lookup tables only while boarding or releasing cargo.
  boardingUnits.clear()
  for (const unit of units) {
    if (unit.health > 0 && unit.c5Boarding) {
      const id = unit.c5Boarding.galaxyId
      if (!boardingUnits.has(id) || unit.c5Boarding.loading) boardingUnits.set(id, unit)
    }
    if (unit.c5Drop) updateDescendingCargo(unit, mapGrid, occupancy, tick)
    if (unit.type === 'c5Galaxy' && unit.dropQueueState?.descending?.length) {
      unitsById ??= indexCargoUnits(units)
      for (const oldDrop of unit.dropQueueState.descending) {
        const cargo = unitsById.get(oldDrop.unitId)
        if (!cargo || cargo.c5Drop) continue
        placeC5Cargo(cargo, oldDrop.tile)
        cargo.invulnerable = false
        cargo.c5Drop = { ...oldDrop, target: unit.dropQueueState.target, altitude: unit.altitude || cruiseAltitude }
      }
      delete unit.dropQueueState.descending
    }
  }
  for (const galaxy of units) {
    if (galaxy.c5Boarding) {
      unitsById ??= indexCargoUnits(units)
      updateBoarding(galaxy, unitsById.get(galaxy.c5Boarding.galaxyId), unitsById, gameState)
    }
    if (galaxy.type !== 'c5Galaxy') continue
    if (!Number.isFinite(galaxy.cargoWeight)) {
      if (!galaxy.embarkedUnitIds?.length) galaxy.cargoWeight = 0
      else {
        unitsById ??= indexCargoUnits(units)
        galaxy.cargoWeight = getC5CargoWeight(galaxy, unitsById)
      }
    }
    if (!galaxy.c5Mission && galaxy.health > 0) continue
    if (!airstripsById) {
      airstripIndex.clear()
      airstripsById = airstripIndex
      for (const building of buildings) {
        if (building.type === 'airstrip' && !(building.health <= 0)) airstripsById.set(getBuildingIdentifier(building), building)
      }
    }
    const home = airstripsById.get(galaxy.homeAirstripId ?? galaxy.airstripId)
    if (galaxy.health <= 0) {
      if (galaxy.c5GroundOccupancy) changeC5GroundOccupancy(galaxy, occupancy, -1)
      if (galaxy.embarkedUnitIds?.length) {
        unitsById ??= indexCargoUnits(units)
        const origin = tileOf(galaxy)
        const wreckTiles = new Set()
        destroyC5Cargo(galaxy, unitsById, () => {
          const tile = findC5DropTile(origin, (x, y) =>
            isC5LandingTile(mapGrid, occupancy, x, y) && !wreckTiles.has(y * mapGrid[0].length + x), Math.max(mapGrid.length, mapGrid[0]?.length || 0))
          if (tile) wreckTiles.add(tile.y * mapGrid[0].length + tile.x)
          return tile
        })
      }
      if (home) {
        releaseAirstripRunwayOperation(home, galaxy.id)
        releaseC5ParkingSlots(home, galaxy.id)
      }
      continue
    }
    const previousX = galaxy.x
    const previousY = galaxy.y
    const previousFlightState = galaxy.flightState
    updateFlight(galaxy, home, mapGrid, occupancy, tick)
    playC5TransitionSound(galaxy, previousFlightState)
    galaxy.tileX = Math.floor((galaxy.x + TILE_SIZE / 2) / TILE_SIZE)
    galaxy.tileY = Math.floor((galaxy.y + TILE_SIZE / 2) / TILE_SIZE)
    if (Number.isFinite(galaxy.gas)) {
      galaxy.gas = Math.max(0, galaxy.gas - Math.hypot(galaxy.x - previousX, galaxy.y - previousY) * fuelRate)
      if (galaxy.flightState === 'grounded' && home) galaxy.gas = galaxy.maxGas
    }
    if (galaxy.dropQueueState && tick >= galaxy.dropQueueState.nextDropTick) {
      unitsById ??= indexCargoUnits(units)
      occupiedDrops ??= new Set(units.filter(unit => unit.c5Drop).map(unit => unit.c5Drop.tile.y * mapGrid[0].length + unit.c5Drop.tile.x))
      const released = advanceC5Airdrop(galaxy, tick, unitsById, (x, y) =>
        isC5LandingTile(mapGrid, occupancy, x, y) && !occupiedDrops.has(y * mapGrid[0].length + x),
      message => {
        if (galaxy.owner === gameState.humanPlayer) (gameState.showNotification || showNotification)(message)
      }, WIND_DIRECTION)
      if (released) {
        occupiedDrops.add(released.y * mapGrid[0].length + released.x)
        playPositionalSound('c5CargoRelease', galaxy.x, galaxy.y, 0.45, 0, true)
      }
    }
  }
}
