import {
  BATTLESHIP_FIRE_RANGE,
  SUBMARINE_DETECTION_RADIUS,
  SUBMARINE_SURFACE_DURATION,
  SUBMARINE_TORPEDO_RANGE,
  TILE_SIZE
} from '../config.js'
import { gameState } from '../gameState.js'
import { removeUnitOccupancy } from '../units.js'
import { isWaterPassableTile } from '../utils/navalUtils.js'
import { getNavalBatteryWorldPoint } from '../rendering/navalFleetImageRenderer.js'
import {
  clearWaterMineSafely,
  deployWaterMine,
  getWaterMineAtTile,
  updateWaterMines
} from './waterMineSystem.js'

const TRANSPORT_TYPES = new Set(['hovercraft', 'vehicleFerry'])
const AIRCRAFT_SLOT_WEIGHT = Object.freeze({ f22Raptor: 1, f35: 2 })
const CARRIER_APPROACH_MS = 1800
const CARRIER_ROLL_MS = 1800
const CARRIER_LAUNCH_MS = 1700
const BATTLESHIP_FIRE_COOLDOWN = 3400
const SUBMARINE_TORPEDO_COOLDOWN = 2600
const DEPTH_CHARGE_COOLDOWN = 3000
const DEPTH_CHARGE_FUSE_MS = 800
const DEPTH_CHARGE_RADIUS = TILE_SIZE * 1.8

function centerOf(entity) {
  if (entity?.tileX !== undefined) {
    return { x: entity.x + TILE_SIZE / 2, y: entity.y + TILE_SIZE / 2 }
  }
  return {
    x: (entity.x + entity.width / 2) * TILE_SIZE,
    y: (entity.y + entity.height / 2) * TILE_SIZE
  }
}

function setStopped(unit) {
  unit.path = []
  unit.moveTarget = null
  if (unit.movement) {
    unit.movement.velocity = { x: 0, y: 0 }
    unit.movement.targetVelocity = { x: 0, y: 0 }
    unit.movement.currentSpeed = 0
    unit.movement.isMoving = false
  }
}

function findNearestWaterTile(worldX, worldY, mapGrid, radius = 6) {
  const originX = Math.floor(worldX / TILE_SIZE)
  const originY = Math.floor(worldY / TILE_SIZE)
  let best = null
  let bestDistance = Infinity
  for (let y = originY - radius; y <= originY + radius; y++) {
    for (let x = originX - radius; x <= originX + radius; x++) {
      if (!isWaterPassableTile(mapGrid, x, y)) continue
      const distance = Math.hypot(x - originX, y - originY)
      if (distance < bestDistance) {
        best = { x, y }
        bestDistance = distance
      }
    }
  }
  return best
}

function findUnloadTiles(targetTile, count, mapGrid, occupancyMap) {
  const candidates = []
  for (let radius = 0; radius <= 5; radius++) {
    for (let y = targetTile.y - radius; y <= targetTile.y + radius; y++) {
      for (let x = targetTile.x - radius; x <= targetTile.x + radius; x++) {
        if (Math.max(Math.abs(x - targetTile.x), Math.abs(y - targetTile.y)) !== radius) continue
        const tile = mapGrid?.[y]?.[x]
        const passable = tile && (tile.type === 'land' || tile.type === 'street') && !tile.building && !tile.seedCrystal
        if (passable && !(occupancyMap?.[y]?.[x] > 0)) candidates.push({ x, y })
        if (candidates.length >= count) return candidates
      }
    }
  }
  return candidates
}

export function requestTransportLoad(transport, target, mapGrid) {
  if (!TRANSPORT_TYPES.has(transport?.type) || !target || target.isNaval || target.isAirUnit || target.embarkedOnId) return false
  if (transport.owner !== target.owner || target.health <= 0) return false
  transport.embarkedUnitIds = Array.isArray(transport.embarkedUnitIds) ? transport.embarkedUnitIds : []
  if (transport.embarkedUnitIds.length >= transport.transportCapacity) return false
  const waterTile = findNearestWaterTile(target.x + TILE_SIZE / 2, target.y + TILE_SIZE / 2, mapGrid)
  if (!waterTile) return false
  transport.pendingLoadUnitId = target.id
  transport.pendingUnloadTile = null
  transport.moveTarget = waterTile
  transport.path = []
  return true
}

export function requestTransportUnload(transport, tileX, tileY, mapGrid) {
  if (!TRANSPORT_TYPES.has(transport?.type) || !transport.embarkedUnitIds?.length) return false
  const waterTile = findNearestWaterTile(tileX * TILE_SIZE, tileY * TILE_SIZE, mapGrid)
  if (!waterTile) return false
  transport.pendingLoadUnitId = null
  transport.pendingUnloadTile = { x: tileX, y: tileY, approach: waterTile }
  transport.moveTarget = waterTile
  transport.path = []
  return true
}

function updateTransport(transport, units, mapGrid, occupancyMap) {
  transport.embarkedUnitIds = (transport.embarkedUnitIds || []).filter(id => units.some(unit => unit.id === id && unit.health > 0))
  transport.embarkedUnitIds.forEach(id => {
    const cargo = units.find(unit => unit.id === id)
    if (!cargo) return
    cargo.x = transport.x
    cargo.y = transport.y
    cargo.tileX = transport.tileX
    cargo.tileY = transport.tileY
    cargo.embarkedOnId = transport.id
    cargo.selected = false
    setStopped(cargo)
  })

  if (transport.health <= 0) {
    transport.embarkedUnitIds.forEach(id => {
      const cargo = units.find(unit => unit.id === id)
      if (cargo) cargo.health = 0
    })
    return
  }

  if (transport.pendingLoadUnitId) {
    const target = units.find(unit => unit.id === transport.pendingLoadUnitId && unit.health > 0)
    if (!target) {
      transport.pendingLoadUnitId = null
      return
    }
    const distance = Math.hypot(target.x - transport.x, target.y - transport.y)
    if (distance <= TILE_SIZE * 2.6 && transport.embarkedUnitIds.length < transport.transportCapacity) {
      removeUnitOccupancy(target, occupancyMap, { ignoreFlightState: true })
      target.embarkedOnId = transport.id
      target.selected = false
      transport.embarkedUnitIds.push(target.id)
      transport.pendingLoadUnitId = null
    }
  }

  const unload = transport.pendingUnloadTile
  if (unload) {
    const approachDistance = Math.hypot(transport.tileX - unload.approach.x, transport.tileY - unload.approach.y)
    if (approachDistance <= 1.5) {
      const tiles = findUnloadTiles(unload, transport.embarkedUnitIds.length, mapGrid, occupancyMap)
      transport.embarkedUnitIds.slice(0, tiles.length).forEach((id, index) => {
        const cargo = units.find(unit => unit.id === id)
        const tile = tiles[index]
        if (!cargo || !tile) return
        cargo.embarkedOnId = null
        cargo.x = tile.x * TILE_SIZE
        cargo.y = tile.y * TILE_SIZE
        cargo.tileX = Math.floor((cargo.x + TILE_SIZE / 2) / TILE_SIZE)
        cargo.tileY = Math.floor((cargo.y + TILE_SIZE / 2) / TILE_SIZE)
        if (occupancyMap?.[cargo.tileY]) occupancyMap[cargo.tileY][cargo.tileX] = (occupancyMap[cargo.tileY][cargo.tileX] || 0) + 1
      })
      transport.embarkedUnitIds.splice(0, tiles.length)
      transport.pendingUnloadTile = null
    }
  }
}

function carrierBasis(carrier) {
  const direction = carrier.direction || 0
  return {
    center: centerOf(carrier),
    forward: { x: Math.cos(direction), y: Math.sin(direction) },
    right: { x: -Math.sin(direction), y: Math.cos(direction) }
  }
}

function carrierPoint(carrier, forwardTiles, rightTiles = 0) {
  const basis = carrierBasis(carrier)
  return {
    x: basis.center.x + basis.forward.x * forwardTiles * TILE_SIZE + basis.right.x * rightTiles * TILE_SIZE - TILE_SIZE / 2,
    y: basis.center.y + basis.forward.y * forwardTiles * TILE_SIZE + basis.right.y * rightTiles * TILE_SIZE - TILE_SIZE / 2
  }
}

function carrierSlotPoint(carrier, index) {
  const slots = [
    { forward: -1.25, right: -0.55 },
    { forward: -0.25, right: -0.55 },
    { forward: 0.75, right: -0.55 },
    { forward: 1.7, right: -0.55 }
  ]
  const slot = slots[index] || slots[0]
  return carrierPoint(carrier, slot.forward, slot.right)
}

function carrierUsedSlots(carrier, units, ignoredAircraftId = null) {
  return (units || []).reduce((total, aircraft) => {
    if (aircraft.id === ignoredAircraftId) return total
    const assignedCarrierId = aircraft.carrierOperation?.carrierId || aircraft.carrierId
    if (assignedCarrierId !== carrier.id) return total
    return total + (AIRCRAFT_SLOT_WEIGHT[aircraft.type] || 0)
  }, 0)
}

export function requestCarrierLanding(aircraft, carrier, units, now = gameState.simulationTime || 0) {
  const weight = AIRCRAFT_SLOT_WEIGHT[aircraft?.type]
  if (!weight || carrier?.type !== 'aircraftCarrier' || aircraft.owner !== carrier.owner) return false
  if (carrierUsedSlots(carrier, units, aircraft.id) + weight > carrier.deckSlotCapacity) return false
  aircraft.carrierOperation = {
    state: 'approach',
    startedAt: now,
    carrierId: carrier.id,
    startX: aircraft.x,
    startY: aircraft.y,
    startAltitude: aircraft.altitude || TILE_SIZE * 4
  }
  aircraft.target = null
  aircraft.path = []
  aircraft.moveTarget = null
  return true
}

export function requestCarrierLaunch(aircraft, destination = null, now = gameState.simulationTime || 0) {
  if (!aircraft?.carrierId || !AIRCRAFT_SLOT_WEIGHT[aircraft.type]) return false
  aircraft.carrierOperation = {
    state: 'launch',
    startedAt: now,
    carrierId: aircraft.carrierId,
    destination
  }
  aircraft.flightState = 'takingOff'
  return true
}

function parkAircraftOnCarrier(aircraft, carrier, units) {
  carrier.carrierAircraftIds = Array.isArray(carrier.carrierAircraftIds) ? carrier.carrierAircraftIds : []
  if (!carrier.carrierAircraftIds.includes(aircraft.id)) carrier.carrierAircraftIds.push(aircraft.id)
  const occupiedSlots = new Set()
  units.forEach(unit => {
    if (unit.id === aircraft.id || unit.carrierId !== carrier.id || !Number.isInteger(unit.carrierDeckSlotIndex)) return
    const weight = AIRCRAFT_SLOT_WEIGHT[unit.type] || 1
    for (let offset = 0; offset < weight; offset++) occupiedSlots.add(unit.carrierDeckSlotIndex + offset)
  })
  const aircraftWeight = AIRCRAFT_SLOT_WEIGHT[aircraft.type] || 1
  let slotIndex = 0
  while (
    slotIndex < carrier.deckSlotCapacity &&
    Array.from({ length: aircraftWeight }, (_, offset) => slotIndex + offset)
      .some(slot => slot >= carrier.deckSlotCapacity || occupiedSlots.has(slot))
  ) slotIndex++
  aircraft.carrierId = carrier.id
  aircraft.carrierDeckSlotIndex = slotIndex
  aircraft.carrierOperation = { state: 'parked', carrierId: carrier.id }
  aircraft.flightState = 'grounded'
  aircraft.f22State = aircraft.type === 'f22Raptor' ? 'parked' : aircraft.f22State
  aircraft.altitude = 0
  aircraft.groundedOccupancyApplied = false
  setStopped(aircraft)
}

function updateCarrierAircraft(aircraft, carrier, units, now, delta) {
  const operation = aircraft.carrierOperation
  if (!operation) return
  if (operation.state === 'approach') {
    const progress = Math.min(1, (now - operation.startedAt) / CARRIER_APPROACH_MS)
    const target = aircraft.type === 'f35'
      ? carrierPoint(carrier, 0.25, 0.65)
      : carrierPoint(carrier, -2.45, 0.05)
    aircraft.x = operation.startX + (target.x - operation.startX) * progress
    aircraft.y = operation.startY + (target.y - operation.startY) * progress
    aircraft.altitude = aircraft.type === 'f35'
      ? Math.max(0, operation.startAltitude * (1 - progress))
      : Math.max(TILE_SIZE * 0.8, operation.startAltitude * (1 - progress))
    aircraft.flightState = 'landing'
    if (progress >= 1) {
      if (aircraft.type === 'f35') parkAircraftOnCarrier(aircraft, carrier, units)
      else aircraft.carrierOperation = { ...operation, state: 'landing_roll', startedAt: now }
    }
  } else if (operation.state === 'landing_roll') {
    const progress = Math.min(1, (now - operation.startedAt) / CARRIER_ROLL_MS)
    const start = carrierPoint(carrier, -2.45, 0.05)
    const end = carrierPoint(carrier, 1.75, 0.05)
    aircraft.x = start.x + (end.x - start.x) * progress
    aircraft.y = start.y + (end.y - start.y) * progress
    aircraft.altitude = Math.max(0, TILE_SIZE * 0.8 * (1 - progress))
    if (progress >= 1) parkAircraftOnCarrier(aircraft, carrier, units)
  } else if (operation.state === 'parked') {
    const point = carrierSlotPoint(carrier, aircraft.carrierDeckSlotIndex || 0)
    aircraft.x = point.x
    aircraft.y = point.y
    aircraft.direction = carrier.direction
    aircraft.rotation = carrier.direction
    aircraft.tileX = Math.floor((aircraft.x + TILE_SIZE / 2) / TILE_SIZE)
    aircraft.tileY = Math.floor((aircraft.y + TILE_SIZE / 2) / TILE_SIZE)
    setStopped(aircraft)
    if (typeof aircraft.maxGas === 'number' && aircraft.gas < aircraft.maxGas && carrier.carrierFuel > 0) {
      const amount = Math.min(carrier.carrierFuel, aircraft.maxGas - aircraft.gas, delta * 0.45)
      aircraft.gas += amount
      carrier.carrierFuel -= amount
    }
    if (typeof aircraft.maxRocketAmmo === 'number' && aircraft.rocketAmmo < aircraft.maxRocketAmmo && carrier.carrierAmmo > 0) {
      const amount = Math.min(carrier.carrierAmmo, aircraft.maxRocketAmmo - aircraft.rocketAmmo, delta / 1400)
      aircraft.rocketAmmo += amount
      carrier.carrierAmmo -= amount
    }
  } else if (operation.state === 'launch') {
    const progress = Math.min(1, (now - operation.startedAt) / CARRIER_LAUNCH_MS)
    const verticalLaunch = aircraft.type === 'f35'
    const start = verticalLaunch
      ? carrierSlotPoint(carrier, aircraft.carrierDeckSlotIndex || 0)
      : carrierPoint(carrier, -1.75, 0.05)
    const end = verticalLaunch ? start : carrierPoint(carrier, 3.2, 0.05)
    aircraft.x = start.x + (end.x - start.x) * progress
    aircraft.y = start.y + (end.y - start.y) * progress
    aircraft.altitude = TILE_SIZE * 4.5 * progress
    aircraft.flightState = 'takingOff'
    if (progress >= 1) {
      carrier.carrierAircraftIds = (carrier.carrierAircraftIds || []).filter(id => id !== aircraft.id)
      const destination = operation.destination
      aircraft.carrierOperation = null
      aircraft.carrierId = null
      aircraft.carrierDeckSlotIndex = null
      aircraft.flightState = 'airborne'
      aircraft.f22State = aircraft.type === 'f22Raptor' ? 'airborne' : aircraft.f22State
      aircraft.groundedOccupancyApplied = false
      if (destination) aircraft.moveTarget = destination
    }
  }
}

function updateCarrier(carrier, units, now, delta) {
  carrier.carrierAircraftIds = (carrier.carrierAircraftIds || []).filter(id => units.some(unit => unit.id === id && unit.health > 0))
  if (carrier.health <= 0) {
    units.forEach(aircraft => {
      const assignedCarrierId = aircraft.carrierOperation?.carrierId || aircraft.carrierId
      if (assignedCarrierId === carrier.id) aircraft.health = 0
    })
    return
  }
  units.forEach(aircraft => {
    const operationCarrierId = aircraft.carrierOperation?.carrierId || aircraft.carrierId
    if (operationCarrierId === carrier.id) updateCarrierAircraft(aircraft, carrier, units, now, delta)
  })
}

export function setBattleshipTarget(ship, target) {
  if (ship?.type !== 'battleship' || !target || target.health <= 0) return false
  if (target.type === 'submarine' && target.depthState !== 'surfaced') return false
  ship.batteries = ship.batteries || { fore: {}, aft: {} }
  if (ship.selectedBattery === 'fore' || ship.selectedBattery === 'aft') {
    ship.batteries[ship.selectedBattery].targetId = target.id
  } else {
    ship.batteries.fore.targetId = target.id
    ship.batteries.aft.targetId = target.id
    ship.target = target
  }
  return true
}

export function selectBattleshipBattery(ship, worldX, worldY) {
  if (ship?.type !== 'battleship') return null
  const center = centerOf(ship)
  const dx = worldX - center.x
  const dy = worldY - center.y
  const longitudinal = dx * Math.cos(ship.direction || 0) + dy * Math.sin(ship.direction || 0)
  ship.selectedBattery = Math.abs(longitudinal) < TILE_SIZE * 0.6 ? null : (longitudinal > 0 ? 'fore' : 'aft')
  return ship.selectedBattery
}

function resolveTarget(id, units) {
  return units.find(unit => unit.id === id) || (gameState.buildings || []).find(building => building.id === id)
}

function fireBattleshipBattery(ship, batteryName, target, bullets, now) {
  const battery = ship.batteries[batteryName]
  if (!battery || now - (battery.lastShotTime || 0) < BATTLESHIP_FIRE_COOLDOWN || ship.ammunition < 2) return
  const spawn = getNavalBatteryWorldPoint(ship, batteryName)
  const targetCenter = centerOf(target)
  const distance = Math.hypot(targetCenter.x - spawn.x, targetCenter.y - spawn.y)
  if (distance > BATTLESHIP_FIRE_RANGE) return
  battery.direction = Math.atan2(targetCenter.y - spawn.y, targetCenter.x - spawn.x)
  for (const lateral of [-4, 4]) {
    bullets.push({
      id: `${ship.id}-${batteryName}-${now}-${lateral}`,
      x: spawn.x + Math.cos(battery.direction + Math.PI / 2) * lateral,
      y: spawn.y + Math.sin(battery.direction + Math.PI / 2) * lateral,
      startX: spawn.x,
      startY: spawn.y,
      dx: targetCenter.x - spawn.x,
      dy: targetCenter.y - spawn.y,
      targetPosition: targetCenter,
      target,
      shooter: ship,
      baseDamage: 78,
      active: true,
      speed: 7,
      projectileType: 'shell',
      parabolic: true,
      flightDuration: Math.max(650, distance / 0.42),
      arcHeight: Math.max(45, distance * 0.12),
      explosionRadius: TILE_SIZE * 1.35,
      startTime: now,
      skipCollisionChecks: true
    })
  }
  ship.ammunition -= 2
  battery.lastShotTime = now
  ship.muzzleFlashStartTime = now
}

function updateBattleship(ship, units, bullets, now) {
  if (ship.target?.health > 0 && ship.lastHullTargetId !== ship.target.id) {
    ship.batteries.fore.targetId = ship.target.id
    ship.batteries.aft.targetId = ship.target.id
    ship.lastHullTargetId = ship.target.id
  }
  for (const batteryName of ['fore', 'aft']) {
    const target = resolveTarget(ship.batteries?.[batteryName]?.targetId, units)
    if (!target || target.health <= 0 || (target.type === 'submarine' && target.depthState !== 'surfaced')) {
      if (ship.batteries?.[batteryName]) ship.batteries[batteryName].targetId = null
      continue
    }
    fireBattleshipBattery(ship, batteryName, target, bullets, now)
  }
}

export function isSubmarineDetectedForOwner(submarine, owner, now = gameState.simulationTime || 0) {
  return Boolean(submarine?.detectedByOwners?.[owner] > now)
}

function startDepthTransition(submarine, state, now) {
  submarine.depthState = state
  submarine.depthTransitionStartedAt = now
  submarine.depthTransitionProgress = 0
  setStopped(submarine)
}

function updateSubmarine(submarine, units, bullets, now) {
  submarine.detectedByOwners = submarine.detectedByOwners || {}
  Object.keys(submarine.detectedByOwners).forEach(owner => {
    if (submarine.detectedByOwners[owner] <= now) delete submarine.detectedByOwners[owner]
  })

  units.forEach(observer => {
    if (!observer || observer.owner === submarine.owner || observer.health <= 0 || observer.embarkedOnId) return
    const distance = Math.hypot(observer.x - submarine.x, observer.y - submarine.y)
    if (distance <= SUBMARINE_DETECTION_RADIUS) submarine.detectedByOwners[observer.owner] = now + 750
  })

  if (submarine.depthState === 'surfacing' || submarine.depthState === 'submerging') {
    submarine.depthTransitionProgress = Math.min(1, (now - submarine.depthTransitionStartedAt) / SUBMARINE_SURFACE_DURATION)
    if (submarine.depthTransitionProgress >= 1) {
      submarine.depthState = submarine.depthState === 'surfacing' ? 'surfaced' : 'submerged'
      submarine.depthTransitionProgress = submarine.depthState === 'surfaced' ? 1 : 0
    }
  }

  const target = submarine.target
  const validTarget = target?.isNaval && target.health > 0 && target.owner !== submarine.owner
  if (!validTarget) {
    submarine.target = null
    if (submarine.depthState === 'surfaced' && now - (submarine.lastTorpedoTime || 0) > 4500) startDepthTransition(submarine, 'submerging', now)
    return
  }
  if (submarine.depthState === 'submerged') {
    startDepthTransition(submarine, 'surfacing', now)
    return
  }
  if (submarine.depthState !== 'surfaced') return

  const start = centerOf(submarine)
  const destination = centerOf(target)
  const distance = Math.hypot(destination.x - start.x, destination.y - start.y)
  if (distance > SUBMARINE_TORPEDO_RANGE || now - (submarine.lastTorpedoTime || 0) < SUBMARINE_TORPEDO_COOLDOWN || submarine.ammunition <= 0) return
  const angle = Math.atan2(destination.y - start.y, destination.x - start.x)
  bullets.push({
    id: `${submarine.id}-torpedo-${now}`,
    x: start.x,
    y: start.y,
    vx: Math.cos(angle) * 3.2,
    vy: Math.sin(angle) * 3.2,
    speed: 3.2,
    baseDamage: 95,
    active: true,
    shooter: submarine,
    homing: true,
    target,
    targetPosition: destination,
    startTime: now,
    projectileType: 'torpedo',
    originType: 'torpedo',
    navalOnly: true,
    strictTarget: true
  })
  submarine.ammunition--
  submarine.lastTorpedoTime = now
}

function updateDepthCharges(units, now) {
  gameState.depthCharges = Array.isArray(gameState.depthCharges) ? gameState.depthCharges : []
  for (const destroyer of units.filter(unit => unit?.type === 'destroyer' && unit.health > 0)) {
    const detected = units.find(unit => unit?.type === 'submarine' && unit.owner !== destroyer.owner && unit.health > 0 && unit.depthState === 'submerged' && isSubmarineDetectedForOwner(unit, destroyer.owner, now) && Math.hypot(unit.x - destroyer.x, unit.y - destroyer.y) <= SUBMARINE_DETECTION_RADIUS)
    if (!detected || now - (destroyer.lastDepthChargeTime || 0) < DEPTH_CHARGE_COOLDOWN) continue
    const targetCenter = centerOf(detected)
    gameState.depthCharges.push({
      id: `${destroyer.id}-depth-${now}`,
      owner: destroyer.owner,
      targetId: detected.id,
      x: targetCenter.x,
      y: targetCenter.y,
      createdAt: now,
      detonateAt: now + DEPTH_CHARGE_FUSE_MS
    })
    destroyer.lastDepthChargeTime = now
  }

  gameState.depthCharges = gameState.depthCharges.filter(charge => {
    if (now < charge.detonateAt) return true
    const target = units.find(unit => unit.id === charge.targetId && unit.health > 0)
    if (target && Math.hypot(centerOf(target).x - charge.x, centerOf(target).y - charge.y) <= DEPTH_CHARGE_RADIUS) {
      target.health = Math.max(0, target.health - 110)
    }
    gameState.explosions.push({ x: charge.x, y: charge.y, maxRadius: DEPTH_CHARGE_RADIUS, startTime: now, duration: 520, underwater: true })
    return false
  })
}

function updateNavalMineLayer(unit, mapGrid, now) {
  const pending = unit.pendingWaterMineTile
  if (pending) {
    const mine = getWaterMineAtTile(pending.x, pending.y)
    const distance = Math.hypot(unit.tileX - pending.x, unit.tileY - pending.y)
    if (distance <= 1.2) {
      if (unit.waterMineSweepMode && mine) {
        clearWaterMineSafely(mine)
      } else if (!mine && unit.remainingWaterMines > 0) {
        if (deployWaterMine(pending.x, pending.y, unit.owner, mapGrid, now)) unit.remainingWaterMines--
      }
      unit.pendingWaterMineTile = null
      unit.waterMineSweepMode = false
    }
  }
}

export function requestWaterMineAction(unit, tileX, tileY, mapGrid) {
  if (unit?.type !== 'navalMineLayer' || mapGrid?.[tileY]?.[tileX]?.type !== 'water') return false
  const existing = getWaterMineAtTile(tileX, tileY)
  unit.waterMineSweepMode = Boolean(existing)
  unit.pendingWaterMineTile = { x: tileX, y: tileY }
  unit.moveTarget = { x: tileX, y: tileY }
  unit.path = []
  return true
}

export function updateNavalFleet(units, bullets, mapGrid, state, now, delta) {
  updateWaterMines(now, units)
  ;(units || []).forEach(unit => {
    if (TRANSPORT_TYPES.has(unit.type)) updateTransport(unit, units, mapGrid, state.occupancyMap)
    else if (unit.type === 'aircraftCarrier') updateCarrier(unit, units, now, delta)
    else if (unit.type === 'battleship') updateBattleship(unit, units, bullets, now)
    else if (unit.type === 'submarine') updateSubmarine(unit, units, bullets, now)
    else if (unit.type === 'navalMineLayer') updateNavalMineLayer(unit, mapGrid, now)
  })
  updateDepthCharges(units, now)
}

export function tryHandleFleetCommand(commandableUnits, worldX, worldY, units, mapGrid) {
  const clickedUnit = (units || []).find(unit => unit.health > 0 && !unit.embarkedOnId && Math.hypot(worldX - centerOf(unit).x, worldY - centerOf(unit).y) <= TILE_SIZE * 0.8)
  const transports = commandableUnits.filter(unit => TRANSPORT_TYPES.has(unit.type))
  if (transports.length && clickedUnit && transports.some(transport => requestTransportLoad(transport, clickedUnit, mapGrid))) return true
  if (!clickedUnit && transports.length && transports.some(transport => requestTransportUnload(transport, Math.floor(worldX / TILE_SIZE), Math.floor(worldY / TILE_SIZE), mapGrid))) return true

  const carrier = clickedUnit?.type === 'aircraftCarrier' ? clickedUnit : null
  const aircraft = commandableUnits.filter(unit => AIRCRAFT_SLOT_WEIGHT[unit.type])
  if (carrier && aircraft.some(unit => requestCarrierLanding(unit, carrier, units))) return true

  const parkedAircraft = aircraft.filter(unit => unit.carrierId)
  if (parkedAircraft.length) {
    const destination = { x: Math.floor(worldX / TILE_SIZE), y: Math.floor(worldY / TILE_SIZE) }
    parkedAircraft.forEach(unit => {
      if (clickedUnit && clickedUnit.owner !== unit.owner) unit.target = clickedUnit
      requestCarrierLaunch(unit, destination)
    })
    return true
  }
  return false
}
