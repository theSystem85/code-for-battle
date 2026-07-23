import {
  BATTLESHIP_FIRE_RANGE,
  SUBMARINE_DETECTION_RADIUS,
  SUBMARINE_SURFACE_DURATION,
  SUBMARINE_TORPEDO_RANGE,
  TILE_SIZE
} from '../config.js'
import { gameState } from '../gameState.js'
import { removeUnitOccupancy } from '../units.js'
import { addShipWake, getNavalHullDimensions, getNavalRenderLengthTiles, isWaterPassableTile } from '../utils/navalUtils.js'
import { getNavalBatteryWorldPoint } from '../rendering/navalFleetImageRenderer.js'
import {
  clearWaterMineSafely,
  deployWaterMine,
  getWaterMineAtTile,
  updateWaterMines
} from './waterMineSystem.js'

const TRANSPORT_TYPES = new Set(['hovercraft', 'vehicleFerry'])
const AIRCRAFT_SLOT_WEIGHT = Object.freeze({ f22Raptor: 1, f35: 2, apache: 2 })
const CARRIER_APPROACH_MS = 1800
const CARRIER_ROLL_MS = 1800
const CARRIER_LAUNCH_MS = 1700
const CARRIER_TAXI_MS = 1300
const TRANSPORT_TRANSFER_MS = 900
const TRANSPORT_ALIGNMENT_TOLERANCE = 0.035
const BATTLESHIP_FIRE_COOLDOWN = 3400
const SUBMARINE_TORPEDO_COOLDOWN = 2600
const DEPTH_CHARGE_COOLDOWN = 3000
const DEPTH_CHARGE_FUSE_MS = 800
const DEPTH_CHARGE_RADIUS = TILE_SIZE * 1.8

function centerOf(entity) {
  return { x: entity.x + TILE_SIZE / 2, y: entity.y + TILE_SIZE / 2 }
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

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2
  while (angle < -Math.PI) angle += Math.PI * 2
  return angle
}

function smoothStep(progress) {
  const clamped = Math.max(0, Math.min(1, progress))
  return clamped * clamped * (3 - 2 * clamped)
}

function transportRampPoint(transport) {
  const center = centerOf(transport)
  const direction = transport.direction || 0
  const sternOffset = getNavalHullDimensions(transport.type).length / 2
  return {
    x: center.x - Math.cos(direction) * sternOffset - TILE_SIZE / 2,
    y: center.y - Math.sin(direction) * sternOffset - TILE_SIZE / 2
  }
}

function rotateTransportToDirection(transport, desiredDirection) {
  const difference = normalizeAngle(desiredDirection - (transport.direction || 0))
  const desiredVelocity = Math.max(-0.045, Math.min(0.045, difference * 0.18))
  transport.transportAngularVelocity = (transport.transportAngularVelocity || 0) * 0.7 + desiredVelocity * 0.3
  transport.direction = normalizeAngle((transport.direction || 0) + transport.transportAngularVelocity)
  transport.rotation = transport.direction
  if (transport.movement) {
    transport.movement.rotation = transport.direction
    transport.movement.targetRotation = desiredDirection
  }
  if (Math.abs(difference) <= TRANSPORT_ALIGNMENT_TOLERANCE && Math.abs(transport.transportAngularVelocity) < 0.004) {
    transport.direction = desiredDirection
    transport.rotation = desiredDirection
    transport.transportAngularVelocity = 0
    return true
  }
  return false
}

function moveTransportToRendezvous(transport, desiredCenterX, desiredCenterY) {
  const center = centerOf(transport)
  const dx = desiredCenterX - center.x
  const dy = desiredCenterY - center.y
  const distance = Math.hypot(dx, dy)
  if (distance <= 0.35) {
    transport.x = desiredCenterX - TILE_SIZE / 2
    transport.y = desiredCenterY - TILE_SIZE / 2
  } else {
    const step = Math.min(distance, Math.max(0.45, distance * 0.16))
    transport.x += dx / distance * step
    transport.y += dy / distance * step
  }
  transport.tileX = Math.floor((transport.x + TILE_SIZE / 2) / TILE_SIZE)
  transport.tileY = Math.floor((transport.y + TILE_SIZE / 2) / TILE_SIZE)
  return distance <= 0.35
}

function clearGuardState(unit) {
  unit.guardMode = false
  unit.guardTarget = null
  unit.guardTargets = null
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
  if (!best && Array.isArray(mapGrid)) {
    for (let y = 0; y < mapGrid.length; y++) {
      for (let x = 0; x < (mapGrid[y]?.length || 0); x++) {
        if (!isWaterPassableTile(mapGrid, x, y)) continue
        const distance = Math.hypot(x - originX, y - originY)
        if (distance < bestDistance) {
          best = { x, y }
          bestDistance = distance
        }
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

const COAST_DIRECTIONS = Object.freeze([
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
])

function findTransportRendezvous(transport, worldX, worldY, count, mapGrid, occupancyMap) {
  const sternOffset = getNavalHullDimensions(transport.type).length / 2
  let best = null
  for (let shoreY = 0; shoreY < (mapGrid?.length || 0); shoreY++) {
    for (let shoreX = 0; shoreX < (mapGrid[shoreY]?.length || 0); shoreX++) {
      const shoreTile = mapGrid[shoreY][shoreX]
      if (!shoreTile || (shoreTile.type !== 'land' && shoreTile.type !== 'street') || shoreTile.building || shoreTile.seedCrystal) continue
      for (const outward of COAST_DIRECTIONS) {
        const waterX = shoreX + outward.x
        const waterY = shoreY + outward.y
        if (!isWaterPassableTile(mapGrid, waterX, waterY)) continue
        const contactX = (shoreX + 0.5 + outward.x * 0.5) * TILE_SIZE
        const contactY = (shoreY + 0.5 + outward.y * 0.5) * TILE_SIZE
        const desiredCenterX = contactX + outward.x * sternOffset
        const desiredCenterY = contactY + outward.y * sternOffset
        const navigationTile = {
          x: Math.floor(desiredCenterX / TILE_SIZE),
          y: Math.floor(desiredCenterY / TILE_SIZE)
        }
        if (!isWaterPassableTile(mapGrid, navigationTile.x, navigationTile.y)) continue
        const cargoSlots = findUnloadTiles({ x: shoreX, y: shoreY }, count, mapGrid, occupancyMap)
        if (cargoSlots.length < count) continue
        const transportCenter = centerOf(transport)
        const score = Math.hypot(contactX - worldX, contactY - worldY) +
          Math.hypot(desiredCenterX - transportCenter.x, desiredCenterY - transportCenter.y) * 0.25
        if (!best || score < best.score) {
          best = {
            shoreTile: { x: shoreX, y: shoreY },
            contactX,
            contactY,
            desiredCenterX,
            desiredCenterY,
            desiredDirection: Math.atan2(outward.y, outward.x),
            navigationTile,
            cargoSlots,
            score
          }
        }
      }
    }
  }
  return best
}

function isTransportableGroundUnit(target, owner) {
  return Boolean(
    target &&
    !target.isBuilding &&
    !target.isNaval &&
    !target.isAirUnit &&
    target.type !== 'apache' &&
    target.type !== 'f22Raptor' &&
    target.type !== 'f35' &&
    !target.embarkedOnId &&
    target.owner === owner &&
    target.health > 0
  )
}

export function requestTransportLoadGroup(transport, targets, mapGrid, occupancyMap = gameState.occupancyMap) {
  if (!TRANSPORT_TYPES.has(transport?.type) || transport.transportOperation || !Array.isArray(targets)) return false
  transport.embarkedUnitIds = Array.isArray(transport.embarkedUnitIds) ? transport.embarkedUnitIds : []
  const existingPendingIds = Array.isArray(transport.pendingLoadUnitIds)
    ? transport.pendingLoadUnitIds
    : (transport.pendingLoadUnitId ? [transport.pendingLoadUnitId] : [])
  const availableCapacity = Math.max(0, transport.transportCapacity - transport.embarkedUnitIds.length - existingPendingIds.length)
  if (availableCapacity <= 0) return false
  const candidates = targets
    .filter(target => isTransportableGroundUnit(target, transport.owner) && !existingPendingIds.includes(target.id))
    .slice(0, availableCapacity)
  if (candidates.length === 0) return false
  const averageX = candidates.reduce((sum, target) => sum + target.x + TILE_SIZE / 2, 0) / candidates.length
  const averageY = candidates.reduce((sum, target) => sum + target.y + TILE_SIZE / 2, 0) / candidates.length
  const rendezvous = findTransportRendezvous(transport, averageX, averageY, candidates.length, mapGrid, occupancyMap)
  if (!rendezvous) return false
  candidates.forEach((target, index) => {
    const cargoSlot = rendezvous.cargoSlots[index]
    target.moveTarget = { ...cargoSlot }
    target.path = []
    target.target = null
    clearGuardState(target)
  })
  transport.pendingLoadUnitIds = [...existingPendingIds, ...candidates.map(target => target.id)]
  transport.pendingLoadUnitId = transport.pendingLoadUnitIds[0] || null
  transport.pendingLoadRendezvous = {
    ...rendezvous,
    cargoSlots: candidates.reduce((slots, target, index) => {
      slots[target.id] = rendezvous.cargoSlots[index]
      return slots
    }, {})
  }
  transport.pendingUnloadTile = null
  transport.moveTarget = { ...rendezvous.navigationTile }
  transport.path = []
  clearGuardState(transport)
  return true
}

export function requestTransportLoad(transport, target, mapGrid, occupancyMap = gameState.occupancyMap) {
  return requestTransportLoadGroup(transport, [target], mapGrid, occupancyMap)
}

export function requestTransportUnload(transport, tileX, tileY, mapGrid) {
  if (!TRANSPORT_TYPES.has(transport?.type) || transport.transportOperation || !transport.embarkedUnitIds?.length) return false
  const destinationTile = mapGrid?.[tileY]?.[tileX]
  const validLandDestination = destinationTile &&
    (destinationTile.type === 'land' || destinationTile.type === 'street') &&
    !destinationTile.building &&
    !destinationTile.seedCrystal
  if (!validLandDestination) return false
  const waterTile = findNearestWaterTile(tileX * TILE_SIZE, tileY * TILE_SIZE, mapGrid)
  if (!waterTile) return false
  transport.pendingLoadUnitId = null
  transport.pendingLoadUnitIds = []
  transport.pendingUnloadTile = { x: tileX, y: tileY, approach: waterTile }
  transport.moveTarget = waterTile
  transport.path = []
  clearGuardState(transport)
  return true
}

function completeTransportOperation(transport) {
  transport.pendingLoadRendezvous = null
  transport.transportOperation = null
  transport.transportAngularVelocity = 0
  setStopped(transport)
}

function startTransportAlignment(transport, operation) {
  setStopped(transport)
  transport.transportOperation = {
    phase: 'aligning',
    nextIndex: 0,
    ...operation
  }
}

function updateTransportOperation(transport, units, mapGrid, occupancyMap, now) {
  const operation = transport.transportOperation
  if (!operation) return
  setStopped(transport)

  if (operation.phase === 'aligning') {
    const positionAligned = moveTransportToRendezvous(transport, operation.desiredCenterX, operation.desiredCenterY)
    const rotationAligned = rotateTransportToDirection(transport, operation.desiredDirection)
    if (positionAligned && rotationAligned) {
      operation.phase = 'transferring'
      operation.transferStartedAt = now
    }
    return
  }

  if (operation.kind === 'load') {
    const cargoIds = operation.cargoIds.filter(id => transport.pendingLoadUnitIds?.includes(id))
    const cargo = units.find(unit => unit.id === cargoIds[0] && isTransportableGroundUnit(unit, transport.owner))
    if (!cargo) {
      units.forEach(unit => {
        if (operation.cargoIds.includes(unit.id)) unit.transportBoardingLocked = false
      })
      transport.pendingLoadUnitIds = (transport.pendingLoadUnitIds || []).filter(id => !operation.cargoIds.includes(id))
      transport.pendingLoadUnitId = transport.pendingLoadUnitIds[0] || null
      completeTransportOperation(transport)
      return
    }
    if (!cargo.transportTransfer) {
      removeUnitOccupancy(cargo, occupancyMap, { ignoreFlightState: true })
      cargo.transportTransfer = {
        kind: 'load',
        phase: 'facing',
        transportId: transport.id,
        startedAt: null,
        startX: cargo.x,
        startY: cargo.y
      }
      setStopped(cargo)
      cargo.target = null
      cargo.selected = false
    }
    const ramp = transportRampPoint(transport)
    if (cargo.transportTransfer.phase === 'facing') {
      const cargoCenterX = cargo.x + TILE_SIZE / 2
      const cargoCenterY = cargo.y + TILE_SIZE / 2
      const desiredDirection = Math.atan2(ramp.y + TILE_SIZE / 2 - cargoCenterY, ramp.x + TILE_SIZE / 2 - cargoCenterX)
      const difference = normalizeAngle(desiredDirection - (cargo.direction || 0))
      const rotationStep = Math.max(-0.12, Math.min(0.12, difference))
      cargo.direction = normalizeAngle((cargo.direction || 0) + rotationStep)
      cargo.rotation = cargo.direction
      if (cargo.movement) {
        cargo.movement.rotation = cargo.direction
        cargo.movement.targetRotation = desiredDirection
      }
      if (Math.abs(difference) > 0.035) return
      cargo.direction = desiredDirection
      cargo.rotation = desiredDirection
      cargo.transportTransfer.phase = 'moving'
      cargo.transportTransfer.startedAt = now
    }
    const progress = smoothStep((now - cargo.transportTransfer.startedAt) / TRANSPORT_TRANSFER_MS)
    cargo.x = cargo.transportTransfer.startX + (ramp.x - cargo.transportTransfer.startX) * progress
    cargo.y = cargo.transportTransfer.startY + (ramp.y - cargo.transportTransfer.startY) * progress
    cargo.tileX = Math.floor((cargo.x + TILE_SIZE / 2) / TILE_SIZE)
    cargo.tileY = Math.floor((cargo.y + TILE_SIZE / 2) / TILE_SIZE)
    if (progress < 1) return

    cargo.transportTransfer = null
    cargo.transportBoardingLocked = false
    cargo.embarkedOnId = transport.id
    if (!transport.embarkedUnitIds.includes(cargo.id)) transport.embarkedUnitIds.push(cargo.id)
    transport.pendingLoadUnitIds = (transport.pendingLoadUnitIds || []).filter(id => id !== cargo.id)
    transport.pendingLoadUnitId = transport.pendingLoadUnitIds[0] || null
    transport.embarkedUnitTypes = transport.embarkedUnitIds
      .map(id => units.find(unit => unit.id === id)?.type)
      .filter(Boolean)
    if (!transport.pendingLoadUnitIds.length || transport.embarkedUnitIds.length >= transport.transportCapacity) {
      completeTransportOperation(transport)
    }
    return
  }

  const unload = transport.pendingUnloadTile
  if (!unload) {
    completeTransportOperation(transport)
    return
  }
  if (!Array.isArray(operation.transferTiles) || operation.transferTiles.length === 0) {
    operation.transferTiles = findUnloadTiles(unload.approach, transport.embarkedUnitIds.length, mapGrid, occupancyMap)
  }
  const tile = operation.transferTiles[operation.nextIndex]
  if (!tile) return

  let cargo = operation.activeCargoId
    ? units.find(unit => unit.id === operation.activeCargoId)
    : null
  if (!cargo) {
    const cargoId = transport.embarkedUnitIds[0]
    cargo = units.find(unit => unit.id === cargoId)
    if (!cargo) {
      transport.embarkedUnitIds = transport.embarkedUnitIds.filter(id => id !== cargoId)
      if (transport.embarkedUnitIds.length === 0) {
        transport.pendingUnloadTile = null
        completeTransportOperation(transport)
      }
      return
    }
    const ramp = transportRampPoint(transport)
    operation.activeCargoId = cargo.id
    transport.embarkedUnitIds = transport.embarkedUnitIds.filter(id => id !== cargo.id)
    cargo.embarkedOnId = null
    cargo.transportTransfer = {
      kind: 'unload',
      transportId: transport.id,
      startedAt: now,
      startX: ramp.x,
      startY: ramp.y
    }
    cargo.x = ramp.x
    cargo.y = ramp.y
    cargo.selected = false
    setStopped(cargo)
  }

  const progress = smoothStep((now - cargo.transportTransfer.startedAt) / TRANSPORT_TRANSFER_MS)
  const destinationX = tile.x * TILE_SIZE
  const destinationY = tile.y * TILE_SIZE
  cargo.x = cargo.transportTransfer.startX + (destinationX - cargo.transportTransfer.startX) * progress
  cargo.y = cargo.transportTransfer.startY + (destinationY - cargo.transportTransfer.startY) * progress
  cargo.tileX = Math.floor((cargo.x + TILE_SIZE / 2) / TILE_SIZE)
  cargo.tileY = Math.floor((cargo.y + TILE_SIZE / 2) / TILE_SIZE)
  if (progress < 1) return

  cargo.transportTransfer = null
  cargo.x = destinationX
  cargo.y = destinationY
  cargo.tileX = Math.floor((cargo.x + TILE_SIZE / 2) / TILE_SIZE)
  cargo.tileY = Math.floor((cargo.y + TILE_SIZE / 2) / TILE_SIZE)
  cargo.moveTarget = { x: unload.x, y: unload.y }
  cargo.path = []
  cargo.target = null
  clearGuardState(cargo)
  if (occupancyMap?.[cargo.tileY]) occupancyMap[cargo.tileY][cargo.tileX] = (occupancyMap[cargo.tileY][cargo.tileX] || 0) + 1
  operation.activeCargoId = null
  operation.nextIndex++
  transport.embarkedUnitTypes = transport.embarkedUnitIds
    .map(id => units.find(unit => unit.id === id)?.type)
    .filter(Boolean)
  if (transport.embarkedUnitIds.length === 0) {
    transport.pendingUnloadTile = null
    completeTransportOperation(transport)
  }
}

function updateTransport(transport, units, mapGrid, occupancyMap, now) {
  transport.embarkedUnitIds = (transport.embarkedUnitIds || []).filter(id => units.some(unit => unit.id === id && unit.health > 0))
  transport.embarkedUnitIds.forEach(id => {
    const cargo = units.find(unit => unit.id === id)
    if (!cargo || cargo.transportTransfer) return
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
    units.forEach(cargo => {
      if (cargo.transportTransfer?.transportId === transport.id) cargo.health = 0
    })
    return
  }

  if (transport.transportOperation) {
    updateTransportOperation(transport, units, mapGrid, occupancyMap, now)
    return
  }

  const pendingIds = Array.isArray(transport.pendingLoadUnitIds)
    ? transport.pendingLoadUnitIds
    : (transport.pendingLoadUnitId ? [transport.pendingLoadUnitId] : [])
  transport.pendingLoadUnitIds = pendingIds
    .filter(id => units.some(unit => unit.id === id && isTransportableGroundUnit(unit, transport.owner)))
    .slice(0, Math.max(0, transport.transportCapacity - transport.embarkedUnitIds.length))
  transport.pendingLoadUnitId = transport.pendingLoadUnitIds[0] || null
  transport.embarkedUnitTypes = transport.embarkedUnitIds
    .map(id => units.find(unit => unit.id === id)?.type)
    .filter(Boolean)

  if (transport.pendingLoadUnitIds.length > 0) {
    const readyCargo = transport.pendingLoadUnitIds
      .map(id => units.find(unit => unit.id === id && isTransportableGroundUnit(unit, transport.owner)))
      .filter(Boolean)
    const rendezvous = transport.pendingLoadRendezvous
    const allReady = readyCargo.length > 0 && readyCargo.every(cargo => {
      const slot = rendezvous?.cargoSlots?.[cargo.id]
      if (!slot) return false
      return Math.hypot(
        cargo.x + TILE_SIZE / 2 - (slot.x + 0.5) * TILE_SIZE,
        cargo.y + TILE_SIZE / 2 - (slot.y + 0.5) * TILE_SIZE
      ) <= TILE_SIZE * 0.7
    })
    const atRendezvous = rendezvous && Math.hypot(
      transport.x + TILE_SIZE / 2 - rendezvous.desiredCenterX,
      transport.y + TILE_SIZE / 2 - rendezvous.desiredCenterY
    ) <= TILE_SIZE * 0.8
    if (allReady && atRendezvous) {
      readyCargo.forEach(cargo => {
        cargo.transportBoardingLocked = true
        setStopped(cargo)
      })
      startTransportAlignment(transport, {
        kind: 'load',
        cargoIds: readyCargo.map(cargo => cargo.id),
        desiredCenterX: rendezvous.desiredCenterX,
        desiredCenterY: rendezvous.desiredCenterY,
        desiredDirection: rendezvous.desiredDirection
      })
      return
    }
  }

  const unload = transport.pendingUnloadTile
  if (unload) {
    const approachDistance = Math.hypot(transport.tileX - unload.approach.x, transport.tileY - unload.approach.y)
    if (approachDistance <= 1.5) {
      const shoreX = (unload.x + 0.5) * TILE_SIZE
      const shoreY = (unload.y + 0.5) * TILE_SIZE
      const center = centerOf(transport)
      startTransportAlignment(transport, {
        kind: 'unload',
        desiredCenterX: center.x,
        desiredCenterY: center.y,
        desiredDirection: Math.atan2(center.y - shoreY, center.x - shoreX)
      })
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
    { forward: -1.25, right: 0.55 },
    { forward: -0.25, right: 0.55 },
    { forward: 0.75, right: 0.55 },
    { forward: 1.7, right: 0.55 }
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
  if (aircraft.carrierId || aircraft.carrierOperation) return false
  if (carrierUsedSlots(carrier, units, aircraft.id) + weight > carrier.deckSlotCapacity) return false
  clearGuardState(aircraft)
  aircraft.target = null
  aircraft.carrierOperation = {
    state: 'approach',
    startedAt: now,
    carrierId: carrier.id,
    startX: aircraft.x,
    startY: aircraft.y,
    startDirection: aircraft.direction || aircraft.rotation || 0,
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
    state: aircraft.type === 'f22Raptor' ? 'launch_taxi' : 'launch',
    startedAt: now,
    carrierId: aircraft.carrierId,
    destination,
    startX: aircraft.x,
    startY: aircraft.y
  }
  aircraft.flightState = 'takingOff'
  return true
}

function assignCarrierSlot(aircraft, carrier, units) {
  if (Number.isInteger(aircraft.carrierDeckSlotIndex)) return aircraft.carrierDeckSlotIndex
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
  return slotIndex
}

function parkAircraftOnCarrier(aircraft, carrier, units) {
  carrier.carrierAircraftIds = Array.isArray(carrier.carrierAircraftIds) ? carrier.carrierAircraftIds : []
  if (!carrier.carrierAircraftIds.includes(aircraft.id)) carrier.carrierAircraftIds.push(aircraft.id)
  assignCarrierSlot(aircraft, carrier, units)
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
    const rawProgress = Math.min(1, (now - operation.startedAt) / CARRIER_APPROACH_MS)
    const progress = smoothStep(rawProgress)
    const target = aircraft.type === 'f35' || aircraft.type === 'apache'
      ? carrierPoint(carrier, 0.25, 0.65)
      : carrierPoint(carrier, -2.45, 0.05)
    aircraft.x = operation.startX + (target.x - operation.startX) * progress
    aircraft.y = operation.startY + (target.y - operation.startY) * progress
    const headingDifference = normalizeAngle((carrier.direction || 0) - (operation.startDirection ?? aircraft.direction ?? 0))
    aircraft.direction = normalizeAngle((operation.startDirection ?? aircraft.direction ?? 0) + headingDifference * progress)
    aircraft.rotation = aircraft.direction
    aircraft.altitude = aircraft.type === 'f35' || aircraft.type === 'apache'
      ? Math.max(0, operation.startAltitude * (1 - progress))
      : Math.max(TILE_SIZE * 0.8, operation.startAltitude * (1 - progress))
    aircraft.flightState = 'landing'
    if (rawProgress >= 1) {
      if (aircraft.type === 'f35' || aircraft.type === 'apache') parkAircraftOnCarrier(aircraft, carrier, units)
      else aircraft.carrierOperation = { ...operation, state: 'landing_roll', startedAt: now }
    }
  } else if (operation.state === 'landing_roll') {
    const rawProgress = Math.min(1, (now - operation.startedAt) / CARRIER_ROLL_MS)
    const progress = smoothStep(rawProgress)
    const start = carrierPoint(carrier, -2.45, 0.05)
    const end = carrierPoint(carrier, 1.75, 0.05)
    aircraft.x = start.x + (end.x - start.x) * progress
    aircraft.y = start.y + (end.y - start.y) * progress
    aircraft.altitude = Math.max(0, TILE_SIZE * 0.8 * (1 - progress))
    aircraft.direction = carrier.direction || 0
    aircraft.rotation = aircraft.direction
    if (rawProgress >= 1) {
      assignCarrierSlot(aircraft, carrier, units)
      aircraft.carrierOperation = {
        ...operation,
        state: 'landing_taxi',
        startedAt: now,
        startX: end.x,
        startY: end.y
      }
    }
  } else if (operation.state === 'landing_taxi') {
    const rawProgress = Math.min(1, (now - operation.startedAt) / CARRIER_TAXI_MS)
    const progress = smoothStep(rawProgress)
    const end = carrierSlotPoint(carrier, aircraft.carrierDeckSlotIndex || 0)
    aircraft.x = operation.startX + (end.x - operation.startX) * progress
    aircraft.y = operation.startY + (end.y - operation.startY) * progress
    aircraft.altitude = 0
    aircraft.direction = carrier.direction || 0
    aircraft.rotation = aircraft.direction
    if (rawProgress >= 1) parkAircraftOnCarrier(aircraft, carrier, units)
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
  } else if (operation.state === 'launch_taxi') {
    const rawProgress = Math.min(1, (now - operation.startedAt) / CARRIER_TAXI_MS)
    const progress = smoothStep(rawProgress)
    const end = carrierPoint(carrier, -1.75, 0.05)
    aircraft.x = operation.startX + (end.x - operation.startX) * progress
    aircraft.y = operation.startY + (end.y - operation.startY) * progress
    aircraft.altitude = 0
    aircraft.direction = carrier.direction || 0
    aircraft.rotation = aircraft.direction
    if (rawProgress >= 1) {
      aircraft.carrierOperation = {
        ...operation,
        state: 'launch',
        startedAt: now,
        startX: end.x,
        startY: end.y
      }
    }
  } else if (operation.state === 'launch') {
    const rawProgress = Math.min(1, (now - operation.startedAt) / CARRIER_LAUNCH_MS)
    const progress = smoothStep(rawProgress)
    const verticalLaunch = aircraft.type === 'f35' || aircraft.type === 'apache'
    const start = verticalLaunch
      ? carrierSlotPoint(carrier, aircraft.carrierDeckSlotIndex || 0)
      : carrierPoint(carrier, -1.75, 0.05)
    const end = verticalLaunch ? start : carrierPoint(carrier, 3.2, 0.05)
    aircraft.x = start.x + (end.x - start.x) * progress
    aircraft.y = start.y + (end.y - start.y) * progress
    aircraft.altitude = TILE_SIZE * 4.5 * smoothStep(rawProgress)
    aircraft.direction = carrier.direction || 0
    aircraft.rotation = aircraft.direction
    aircraft.flightState = 'takingOff'
    if (rawProgress >= 1) {
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
    if (TRANSPORT_TYPES.has(unit.type)) {
      updateTransport(unit, units, mapGrid, state.occupancyMap, now)
      if (unit.transportOperation?.phase === 'aligning') addShipWake(unit, state, now)
    }
    else if (unit.type === 'aircraftCarrier') updateCarrier(unit, units, now, delta)
    else if (unit.type === 'battleship') updateBattleship(unit, units, bullets, now)
    else if (unit.type === 'submarine') updateSubmarine(unit, units, bullets, now)
    else if (unit.type === 'navalMineLayer') updateNavalMineLayer(unit, mapGrid, now)
  })
  updateDepthCharges(units, now)
}

export function tryHandleFleetCommand(commandableUnits, worldX, worldY, units, mapGrid) {
  const clickedUnit = (units || [])
    .map(unit => {
      const interactionRadius = unit.isNaval
        ? TILE_SIZE * Math.max(0.8, getNavalRenderLengthTiles(unit.type) / 2)
        : TILE_SIZE * 0.8
      return {
        unit,
        score: Math.hypot(worldX - centerOf(unit).x, worldY - centerOf(unit).y) / interactionRadius
      }
    })
    .filter(({ unit, score }) => unit.health > 0 && !unit.embarkedOnId && score <= 1)
    .sort((a, b) => a.score - b.score)[0]?.unit
  const selectedGroundUnits = commandableUnits.filter(unit => isTransportableGroundUnit(unit, unit.owner))
  if (TRANSPORT_TYPES.has(clickedUnit?.type) && selectedGroundUnits.length) {
    if (requestTransportLoadGroup(clickedUnit, selectedGroundUnits, mapGrid)) return true
  }
  const transports = commandableUnits.filter(unit => TRANSPORT_TYPES.has(unit.type))
  if (transports.length && clickedUnit && transports.some(transport => requestTransportLoad(transport, clickedUnit, mapGrid))) return true
  const clickedTileX = Math.floor(worldX / TILE_SIZE)
  const clickedTileY = Math.floor(worldY / TILE_SIZE)
  const clickedSelectedTransportHull = clickedUnit && transports.includes(clickedUnit)
  if (transports.length && (!clickedUnit || clickedSelectedTransportHull) &&
    transports.some(transport => requestTransportUnload(transport, clickedTileX, clickedTileY, mapGrid))) return true

  const carrier = clickedUnit?.type === 'aircraftCarrier' ? clickedUnit : null
  const aircraft = commandableUnits.filter(unit => AIRCRAFT_SLOT_WEIGHT[unit.type])
  if (carrier && aircraft.length > 0) {
    let landingRequested = false
    aircraft.forEach(unit => {
      if (requestCarrierLanding(unit, carrier, units)) landingRequested = true
    })
    if (landingRequested) return true
  }

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
