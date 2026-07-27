import {
  BATTLESHIP_FIRE_RANGE,
  SUBMARINE_DETECTION_RADIUS,
  SUBMARINE_SURFACE_DURATION,
  SUBMARINE_TORPEDO_RANGE,
  TILE_SIZE
} from '../config.js'
import { gameState } from '../gameState.js'
import { removeUnitOccupancy } from '../units.js'
import { getBuildingIdentifier } from '../utils.js'
import { gameRandom } from '../utils/gameRandom.js'
import { addShipWake, getNavalHullDimensions, getNavalRenderLengthTiles, isWaterPassableTile } from '../utils/navalUtils.js'
import {
  BATTLESHIP_TURRET_NAMES,
  ensureBattleshipTurrets,
  getBattleshipTurretWorldPoint,
  isBattleshipTurretAngleBlocked,
  selectBattleshipTurret
} from './battleshipTurrets.js'
import {
  canBattleshipTargetEntity,
  canSubmarineTargetEntity
} from './navalTargeting.js'
import { spawnDestructionExplosion } from './spriteSheetEffects.js'
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
const CARRIER_F22_APPROACH_TILES = -14
const CARRIER_F22_DECK_ENTRY_ALTITUDE = TILE_SIZE * 0.8
const CARRIER_RUNWAY_REAR_TILES = -3
const CARRIER_RUNWAY_FRONT_TILES = 3.2
const TRANSPORT_TRANSFER_MS = 900
const TRANSPORT_ALIGNMENT_TOLERANCE = 0.035
// Half the former rounds-per-minute rate (previously one shot per 2.6s).
export const SUBMARINE_TORPEDO_COOLDOWN = 5200
const BATTLESHIP_BARREL_DELAY = 300
const BATTLESHIP_TURRET_DELAY = 1000
const BATTLESHIP_RELOAD_DURATION = 8000
const BATTLESHIP_AIM_TOLERANCE = 0.045
const BATTLESHIP_BROADSIDE_TOLERANCE = 0.055
const DEPTH_CHARGE_COOLDOWN = 3000
const DEPTH_CHARGE_FUSE_MS = 800
const DEPTH_CHARGE_RADIUS = TILE_SIZE * 1.8
const fleetTargetsById = new Map()

function centerOf(entity) {
  if (entity?.tileX === undefined && Number.isFinite(entity?.width) && Number.isFinite(entity?.height)) {
    return {
      x: (entity.x + entity.width / 2) * TILE_SIZE,
      y: (entity.y + entity.height / 2) * TILE_SIZE
    }
  }
  return { x: entity.x + TILE_SIZE / 2, y: entity.y + TILE_SIZE / 2 }
}

function isSubmarineYardTarget(target) {
  return target?.type === 'constructionYard' || target?.type === 'shipyard'
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

function rotateTowards(current, target, maxStep) {
  const difference = normalizeAngle(target - current)
  if (Math.abs(difference) <= maxStep) return target
  return normalizeAngle(current + Math.sign(difference) * maxStep)
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
  const cargoCount = transport?.embarkedUnitIds?.length || 0
  if (!TRANSPORT_TYPES.has(transport?.type) || transport.transportOperation || (cargoCount === 0 && transport.type !== 'vehicleFerry')) return false
  const destinationTile = mapGrid?.[tileY]?.[tileX]
  const validLandDestination = destinationTile &&
    (destinationTile.type === 'land' || destinationTile.type === 'street') &&
    !destinationTile.building &&
    !destinationTile.seedCrystal
  if (!validLandDestination) return false
  const rendezvous = findTransportRendezvous(transport, (tileX + 0.5) * TILE_SIZE, (tileY + 0.5) * TILE_SIZE, cargoCount, mapGrid, gameState.occupancyMap)
  if (!rendezvous) return false
  transport.pendingLoadUnitId = null
  transport.pendingLoadUnitIds = []
  transport.pendingUnloadTile = { x: tileX, y: tileY, approach: rendezvous.navigationTile, rendezvous }
  transport.moveTarget = { ...rendezvous.navigationTile }
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
    phase: 'turning_offshore',
    nextIndex: 0,
    ...operation
  }
}

function updateTransportOperation(transport, units, mapGrid, occupancyMap, now) {
  const operation = transport.transportOperation
  if (!operation) return
  setStopped(transport)

  if (operation.phase === 'turning_offshore') {
    // Turn while safely offshore; only reverse toward land once the complete
    // long hull is aligned, preventing the bow from sweeping through coast.
    if (rotateTransportToDirection(transport, operation.desiredDirection)) operation.phase = 'reversing_to_shore'
    return
  }

  if (operation.phase === 'reversing_to_shore') {
    if (moveTransportToRendezvous(transport, operation.desiredCenterX, operation.desiredCenterY)) {
      operation.phase = operation.prepareOnly ? 'prepared' : 'transferring'
      operation.transferStartedAt = now
    }
    return
  }

  if (operation.phase === 'prepared') {
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
      const rendezvous = unload.rendezvous || findTransportRendezvous(transport, (unload.x + 0.5) * TILE_SIZE, (unload.y + 0.5) * TILE_SIZE, transport.embarkedUnitIds.length, mapGrid, occupancyMap)
      if (!rendezvous) return
      startTransportAlignment(transport, {
        kind: 'unload',
        prepareOnly: transport.embarkedUnitIds.length === 0,
        desiredCenterX: rendezvous.desiredCenterX,
        desiredCenterY: rendezvous.desiredCenterY,
        desiredDirection: rendezvous.desiredDirection
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

function syncAircraftTile(aircraft) {
  aircraft.tileX = Math.floor((aircraft.x + TILE_SIZE / 2) / TILE_SIZE)
  aircraft.tileY = Math.floor((aircraft.y + TILE_SIZE / 2) / TILE_SIZE)
}

function carrierIsStationary(carrier) {
  const velocity = carrier?.movement?.velocity || { x: 0, y: 0 }
  return !carrier?.moveTarget && (!carrier?.path || carrier.path.length === 0) &&
    Math.hypot(velocity.x || 0, velocity.y || 0) <= 0.02 &&
    (carrier?.movement?.currentSpeed || 0) <= 0.02
}

function moveAircraftWithHeading(aircraft, target, delta, speedScale = 1) {
  const centerX = aircraft.x + TILE_SIZE / 2
  const centerY = aircraft.y + TILE_SIZE / 2
  const targetCenterX = target.x + TILE_SIZE / 2
  const targetCenterY = target.y + TILE_SIZE / 2
  const dx = targetCenterX - centerX
  const dy = targetCenterY - centerY
  const distance = Math.hypot(dx, dy)
  if (distance <= TILE_SIZE * 0.12) {
    aircraft.x = target.x
    aircraft.y = target.y
    syncAircraftTile(aircraft)
    return true
  }

  const desiredDirection = Math.atan2(dy, dx)
  const currentDirection = aircraft.direction || aircraft.rotation || 0
  const difference = normalizeAngle(desiredDirection - currentDirection)
  const turnStep = Math.max(-0.075, Math.min(0.075, difference))
  aircraft.direction = normalizeAngle(currentDirection + turnStep)
  aircraft.rotation = aircraft.direction
  const forwardThrottle = Math.max(0.12, Math.cos(Math.abs(difference)))
  const maxStep = Math.max(0.35, Math.min(TILE_SIZE * 0.22, delta * 0.12 * speedScale))
  const step = Math.min(distance, maxStep * forwardThrottle)
  aircraft.x += Math.cos(aircraft.direction) * step
  aircraft.y += Math.sin(aircraft.direction) * step
  syncAircraftTile(aircraft)
  return false
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
  assignCarrierSlot(aircraft, carrier, units)
  clearGuardState(aircraft)
  aircraft.target = null
  aircraft.flightPlan = null
  aircraft.f22AssignedDestination = null
  aircraft.helipadLandingRequested = false
  setStopped(aircraft)
  aircraft.homeCarrierId = carrier.id
  aircraft.carrierOperation = {
    state: 'carrier_rendezvous',
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
  const isCarrierStrikeLaunch = Boolean(aircraft.pendingCarrierStrikeTargetId)
  aircraft.carrierStrikeActive = isCarrierStrikeLaunch
  if (!isCarrierStrikeLaunch) {
    aircraft.pendingCarrierStrikeTargetId = null
    aircraft.carrierStrikeNeedsFullService = false
  }
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
  if (operation.state === 'carrier_rendezvous') {
    aircraft.flightState = 'airborne'
    aircraft.altitude = operation.startAltitude
    const isFixedWing = aircraft.type === 'f22Raptor'
    const target = isFixedWing
      ? carrierPoint(carrier, CARRIER_F22_APPROACH_TILES, 0.05)
      : carrierSlotPoint(carrier, aircraft.carrierDeckSlotIndex || 0)
    const reached = moveAircraftWithHeading(aircraft, target, delta, isFixedWing ? 1.35 : 1)
    if (isFixedWing) {
      if (carrierIsStationary(carrier) && reached) {
        aircraft.carrierOperation = { ...operation, state: 'approach', startedAt: now }
      }
    } else if (reached) {
      aircraft.carrierOperation = {
        ...operation,
        state: 'vertical_landing',
        startedAt: now,
        startAltitude: aircraft.altitude
      }
    }
  } else if (operation.state === 'approach') {
    aircraft.flightState = 'airborne'
    if (!carrierIsStationary(carrier)) {
      aircraft.carrierOperation = { ...operation, state: 'carrier_rendezvous', startedAt: now }
      return
    }
    const approachStart = carrierPoint(carrier, CARRIER_F22_APPROACH_TILES, 0.05)
    const runwayRear = carrierPoint(carrier, CARRIER_RUNWAY_REAR_TILES, 0.05)
    const reachedRunway = moveAircraftWithHeading(aircraft, runwayRear, delta, 1.15)
    const approachLength = Math.max(TILE_SIZE, Math.hypot(runwayRear.x - approachStart.x, runwayRear.y - approachStart.y))
    const remainingDistance = Math.hypot(runwayRear.x - aircraft.x, runwayRear.y - aircraft.y)
    const approachProgress = 1 - Math.min(1, remainingDistance / approachLength)
    const altitudeProgress = smoothStep(approachProgress)
    aircraft.altitude = CARRIER_F22_DECK_ENTRY_ALTITUDE +
      (operation.startAltitude - CARRIER_F22_DECK_ENTRY_ALTITUDE) * (1 - altitudeProgress)
    if (reachedRunway) {
      aircraft.x = runwayRear.x
      aircraft.y = runwayRear.y
      aircraft.altitude = CARRIER_F22_DECK_ENTRY_ALTITUDE
      aircraft.direction = carrier.direction || 0
      aircraft.rotation = aircraft.direction
      aircraft.carrierOperation = {
        ...operation,
        state: 'landing_roll',
        startedAt: now
      }
    }
  } else if (operation.state === 'vertical_landing') {
    const rawProgress = Math.min(1, (now - operation.startedAt) / CARRIER_APPROACH_MS)
    const progress = smoothStep(rawProgress)
    const slot = carrierSlotPoint(carrier, aircraft.carrierDeckSlotIndex || 0)
    aircraft.x = slot.x
    aircraft.y = slot.y
    aircraft.altitude = Math.max(0, operation.startAltitude * (1 - progress))
    aircraft.direction = carrier.direction || 0
    aircraft.rotation = aircraft.direction
    aircraft.flightState = 'landing'
    syncAircraftTile(aircraft)
    if (rawProgress >= 1) parkAircraftOnCarrier(aircraft, carrier, units)
  } else if (operation.state === 'landing_roll') {
    const rawProgress = Math.min(1, (now - operation.startedAt) / CARRIER_ROLL_MS)
    const progress = smoothStep(rawProgress)
    const start = carrierPoint(carrier, CARRIER_RUNWAY_REAR_TILES, 0.05)
    const end = carrierPoint(carrier, 1.75, 0.05)
    aircraft.x = start.x + (end.x - start.x) * progress
    aircraft.y = start.y + (end.y - start.y) * progress
    aircraft.altitude = Math.max(0, CARRIER_F22_DECK_ENTRY_ALTITUDE * (1 - progress))
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
    const end = carrierSlotPoint(carrier, aircraft.carrierDeckSlotIndex || 0)
    aircraft.altitude = 0
    aircraft.flightState = 'grounded'
    if (moveAircraftWithHeading(aircraft, end, delta, 0.55)) parkAircraftOnCarrier(aircraft, carrier, units)
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
    const end = carrierPoint(carrier, CARRIER_RUNWAY_REAR_TILES, 0.05)
    aircraft.altitude = 0
    if (moveAircraftWithHeading(aircraft, end, delta, 0.6)) {
      aircraft.direction = carrier.direction || 0
      aircraft.rotation = aircraft.direction
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
      : carrierPoint(carrier, CARRIER_RUNWAY_REAR_TILES, 0.05)
    const end = verticalLaunch ? start : carrierPoint(carrier, CARRIER_RUNWAY_FRONT_TILES, 0.05)
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
      aircraft.manualFlightState = 'auto'
      aircraft.groundedOccupancyApplied = false
      if (destination) {
        aircraft.moveTarget = destination
        if (aircraft.type === 'f22Raptor') {
          aircraft.f22AssignedDestination = {
            x: (destination.x + 0.5) * TILE_SIZE,
            y: (destination.y + 0.5) * TILE_SIZE,
            destinationTile: { ...destination },
            stopRadius: TILE_SIZE * 0.4,
            mode: 'manual',
            followTargetId: null
          }
          aircraft.helipadLandingRequested = false
          aircraft.helipadTargetId = null
        }
      }
    }
  }
}

function carrierTargetKey(target) {
  if (!target) return null
  if (target.isBuilding || target.width || target.height) return getBuildingIdentifier(target)
  return target.id || null
}

function resolveCarrierStrikeTarget(targetId, units) {
  return (units || []).find(unit => unit.id === targetId && unit.health > 0) ||
    (gameState.buildings || []).find(building => getBuildingIdentifier(building) === targetId && building.health > 0) ||
    null
}

function carrierTargetCenter(target) {
  if (target.tileX !== undefined) return centerOf(target)
  return {
    x: (target.x + (target.width || 1) / 2) * TILE_SIZE,
    y: (target.y + (target.height || 1) / 2) * TILE_SIZE
  }
}

function assignCarrierStrikeAircraft(aircraft, target) {
  const targetCenter = carrierTargetCenter(target)
  const destinationTile = {
    x: Math.floor(targetCenter.x / TILE_SIZE),
    y: Math.floor(targetCenter.y / TILE_SIZE)
  }
  aircraft.target = target
  aircraft.allowedToAttack = true
  aircraft.helipadLandingRequested = false
  aircraft.commandIntent = 'attack'
  aircraft.moveTarget = destinationTile
  if (aircraft.type === 'f22Raptor') {
    aircraft.f22AssignedDestination = {
      x: targetCenter.x,
      y: targetCenter.y,
      stopRadius: TILE_SIZE * 0.6,
      mode: 'combat',
      destinationTile,
      followTargetId: target.id || null
    }
    aircraft.flightPlan = { ...aircraft.f22AssignedDestination }
    aircraft.f22State = 'airborne'
  } else {
    aircraft.flightPlan = {
      x: targetCenter.x,
      y: targetCenter.y,
      stopRadius: TILE_SIZE * 0.5,
      mode: 'combat',
      destinationTile,
      followTargetId: target.id || null
    }
    if (aircraft.type === 'f35') aircraft.attackQueue = [target]
  }
}

function updateCarrierStrikeMission(carrier, units, now) {
  const targetIds = (carrier.carrierStrikeTargetIds || [])
    .filter(targetId => resolveCarrierStrikeTarget(targetId, units))
  carrier.carrierStrikeTargetIds = targetIds
  const target = targetIds.length > 0 ? resolveCarrierStrikeTarget(targetIds[0], units) : null

  if (target) {
    setStopped(carrier)
    carrier.target = null
    carrier.navalAngularVelocity = 0
    carrier.isRotating = false
  }

  units.forEach(aircraft => {
    if (aircraft.homeCarrierId !== carrier.id || aircraft.health <= 0 || !aircraft.carrierStrikeActive) return
    if (aircraft.carrierOperation && aircraft.carrierOperation.state !== 'parked') return

    const ammo = typeof aircraft.rocketAmmo === 'number' ? aircraft.rocketAmmo : 0
    const maxAmmo = typeof aircraft.maxRocketAmmo === 'number' ? aircraft.maxRocketAmmo : ammo
    const isParked = aircraft.carrierId === carrier.id && aircraft.carrierOperation?.state === 'parked'

    if (isParked) {
      if (ammo > 0) {
        aircraft.apacheAmmoEmpty = false
        aircraft.canFire = true
      }
      const readyAfterService = !aircraft.carrierStrikeNeedsFullService || ammo >= maxAmmo
      if (target && ammo > 0 && readyAfterService) {
        aircraft.pendingCarrierStrikeTargetId = carrierTargetKey(target)
        aircraft.carrierStrikeNeedsFullService = false
        requestCarrierLaunch(aircraft, null, now)
      } else if (!target) {
        aircraft.carrierStrikeActive = false
        aircraft.pendingCarrierStrikeTargetId = null
      }
      return
    }

    if (aircraft.carrierId || aircraft.carrierOperation) return
    if (!target || ammo <= 0) {
      aircraft.target = null
      aircraft.flightPlan = null
      aircraft.f22AssignedDestination = null
      aircraft.pendingCarrierStrikeTargetId = null
      if (ammo <= 0) aircraft.carrierStrikeNeedsFullService = true
      requestCarrierLanding(aircraft, carrier, units, now)
      return
    }

    const assignedTarget = resolveCarrierStrikeTarget(aircraft.pendingCarrierStrikeTargetId, units) || target
    assignCarrierStrikeAircraft(aircraft, assignedTarget)
  })
}

export function commandCarrierStrike(carrier, target, units, append = false, now = gameState.simulationTime || 0) {
  const targetId = carrierTargetKey(target)
  if (carrier?.type !== 'aircraftCarrier' || !targetId || target.health <= 0) return false
  const targetIds = append ? [...(carrier.carrierStrikeTargetIds || [])] : []
  if (!targetIds.includes(targetId)) targetIds.push(targetId)
  carrier.carrierStrikeTargetIds = targetIds
  setStopped(carrier)
  carrier.target = null
  carrier.navalAngularVelocity = 0
  carrier.isRotating = false
  ;(units || []).forEach(aircraft => {
    const assignedCarrierId = aircraft.carrierOperation?.carrierId || aircraft.carrierId
    if (assignedCarrierId === carrier.id) {
      aircraft.homeCarrierId = carrier.id
      aircraft.carrierStrikeActive = true
    }
  })
  updateCarrierStrikeMission(carrier, units, now)
  return true
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
  updateCarrierStrikeMission(carrier, units, now)
}

export function setBattleshipTarget(ship, target) {
  if (ship?.type !== 'battleship' || !target || target.health <= 0) return false
  if (!canBattleshipTargetEntity(target)) return false
  ensureBattleshipTurrets(ship)
  if (BATTLESHIP_TURRET_NAMES.includes(ship.selectedTurret) && ship.batteries[ship.selectedTurret].enabled !== false) {
    ship.batteries[ship.selectedTurret].targetId = target.id
  } else {
    BATTLESHIP_TURRET_NAMES.forEach(name => {
      ship.batteries[name].targetId = target.id
    })
    ship.target = target
    ship.lastHullTargetId = target.id
  }
  return true
}

export function selectBattleshipBattery(ship, worldX, worldY) {
  return selectBattleshipTurret(ship, worldX, worldY)
}

function resolveTarget(id, units, targetLookup = null) {
  if (id === undefined || id === null) return undefined
  if (targetLookup) return targetLookup.get(id)
  return units.find(unit => unit.id === id) ||
    (gameState.buildings || []).find(building => building.id === id) ||
    (gameState.factories || []).find(building => building.id === id)
}

function hasEntityId(id) {
  return id !== undefined && id !== null
}

function hasBattleshipAssignedTarget(ship) {
  if (hasEntityId(ship.target?.id) || hasEntityId(ship.lastHullTargetId)) return true
  for (const name of BATTLESHIP_TURRET_NAMES) {
    if (hasEntityId(ship.batteries?.[name]?.targetId)) return true
  }
  return false
}

function createFleetTargetLookup(units) {
  fleetTargetsById.clear()
  for (const entity of (units || [])) {
    if (entity?.id !== undefined && entity?.id !== null) fleetTargetsById.set(entity.id, entity)
  }
  for (const entity of (gameState.buildings || [])) {
    if (entity?.id !== undefined && entity?.id !== null) fleetTargetsById.set(entity.id, entity)
  }
  for (const entity of (gameState.factories || [])) {
    if (entity?.id !== undefined && entity?.id !== null) fleetTargetsById.set(entity.id, entity)
  }
  return fleetTargetsById
}

function getBattleshipTargetSolution(ship, turretName, target) {
  const spawn = getBattleshipTurretWorldPoint(ship, turretName)
  const targetCenter = centerOf(target)
  const direction = Math.atan2(targetCenter.y - spawn.y, targetCenter.x - spawn.x)
  return {
    spawn,
    targetCenter,
    direction,
    distance: Math.hypot(targetCenter.x - spawn.x, targetCenter.y - spawn.y)
  }
}

function turnBattleshipForBroadside(ship, target) {
  if (!target) return true
  const shipCenter = centerOf(ship)
  const targetCenter = centerOf(target)
  const targetBearing = Math.atan2(targetCenter.y - shipCenter.y, targetCenter.x - shipCenter.x)
  const candidates = [targetBearing - Math.PI / 2, targetBearing + Math.PI / 2]
  const currentDirection = Number.isFinite(ship.direction) ? ship.direction : 0
  const desiredDirection = candidates.reduce((best, candidate) =>
    Math.abs(normalizeAngle(candidate - currentDirection)) < Math.abs(normalizeAngle(best - currentDirection))
      ? candidate
      : best)
  setStopped(ship)
  ship.navalAngularVelocity = 0
  ship.isRotating = true
  ship.direction = rotateTowards(currentDirection, desiredDirection, ship.rotationSpeed || 0.014)
  const aligned = Math.abs(normalizeAngle(desiredDirection - ship.direction)) <= BATTLESHIP_BROADSIDE_TOLERANCE
  if (aligned) {
    ship.direction = normalizeAngle(desiredDirection)
    ship.isRotating = false
  }
  return aligned
}

function hasBattleshipHullControlOverride(ship) {
  const velocity = ship.movement?.velocity
  return Boolean(
    ship.remoteControlActive ||
    ship.moveTarget ||
    ship.path?.length ||
    ship.movement?.isMoving ||
    Math.hypot(velocity?.x || 0, velocity?.y || 0) > 0.02
  )
}

function fireBattleshipBarrel(ship, turretName, target, barrelIndex, bullets, now) {
  const turret = ship.batteries[turretName]
  if (!turret || turret.enabled === false || ship.ammunition < 1) return false
  const solution = getBattleshipTargetSolution(ship, turretName, target)
  if (solution.distance > BATTLESHIP_FIRE_RANGE ||
      isBattleshipTurretAngleBlocked(ship, turretName, solution.direction) ||
      Math.abs(normalizeAngle(solution.direction - turret.direction)) > BATTLESHIP_AIM_TOLERANCE) return false

  const lateral = barrelIndex === 0 ? -4 : 4
  const muzzleX = solution.spawn.x + Math.cos(turret.direction + Math.PI / 2) * lateral + Math.cos(turret.direction) * TILE_SIZE * 0.72
  const muzzleY = solution.spawn.y + Math.sin(turret.direction + Math.PI / 2) * lateral + Math.sin(turret.direction) * TILE_SIZE * 0.72
  bullets.push({
    id: `${ship.id}-${turretName}-${barrelIndex}-${now}`,
    x: muzzleX,
    y: muzzleY,
    startX: muzzleX,
    startY: muzzleY,
    dx: solution.targetCenter.x - muzzleX,
    dy: solution.targetCenter.y - muzzleY,
    targetPosition: solution.targetCenter,
    target,
    shooter: ship,
    baseDamage: 78,
    active: true,
    speed: 7,
    projectileType: 'shell',
    parabolic: true,
    flightDuration: Math.max(650, solution.distance / 0.42),
    arcHeight: Math.max(45, solution.distance * 0.12),
    explosionRadius: TILE_SIZE * 1.35,
    startTime: now,
    skipCollisionChecks: true
  })
  ship.ammunition--
  turret.barrelRecoilStartTimes[barrelIndex] = now
  turret.muzzleFlashStartTimes[barrelIndex] = now
  if (barrelIndex === 1) turret.lastShotTime = now
  return true
}

function clearBattleshipTurretSalvo(turret) {
  turret.salvoStartedAt = null
  turret.scheduledAt = null
  turret.nextBarrelIndex = 0
}

function beginBattleshipBroadside(ship, targetEntries, now) {
  ship.broadsideStartedAt = now
  ship.broadsideReloadUntil = now + BATTLESHIP_RELOAD_DURATION
  targetEntries.forEach(({ turretName }, index) => {
    const turret = ship.batteries[turretName]
    turret.salvoStartedAt = now
    turret.scheduledAt = now + index * BATTLESHIP_TURRET_DELAY
    turret.nextBarrelIndex = 0
    turret.reloadUntil = ship.broadsideReloadUntil
  })
}

function updateBattleshipBroadside(ship, targetEntries, bullets, now) {
  if (now >= (ship.broadsideReloadUntil || 0)) {
    BATTLESHIP_TURRET_NAMES.forEach(name => {
      const turret = ship.batteries[name]
      if (turret.scheduledAt !== null && turret.nextBarrelIndex < 2) clearBattleshipTurretSalvo(turret)
    })
  }

  const hasPendingSalvo = BATTLESHIP_TURRET_NAMES.some(name => {
    const turret = ship.batteries[name]
    return turret.scheduledAt !== null && turret.nextBarrelIndex < 2
  })
  if (!hasPendingSalvo && now >= (ship.broadsideReloadUntil || 0) && targetEntries.length > 0) {
    beginBattleshipBroadside(ship, targetEntries, now)
  }

  targetEntries.forEach(({ turretName, target }) => {
    const turret = ship.batteries[turretName]
    if (turret.scheduledAt === null || turret.nextBarrelIndex >= 2) return
    const fireAt = turret.scheduledAt + turret.nextBarrelIndex * BATTLESHIP_BARREL_DELAY
    if (now < fireAt) return
    if (!fireBattleshipBarrel(ship, turretName, target, turret.nextBarrelIndex, bullets, now)) return
    turret.nextBarrelIndex++
    if (turret.nextBarrelIndex >= 2) clearBattleshipTurretSalvo(turret)
  })
}

function getDisabledTurretCountForHealth(ship) {
  const healthRatio = Math.max(0, ship.health) / Math.max(1, ship.maxHealth || ship.health || 1)
  if (healthRatio < 0.2) return 4
  if (healthRatio < 0.4) return 3
  if (healthRatio < 0.6) return 2
  if (healthRatio < 0.8) return 1
  return 0
}

function updateBattleshipTurretDamage(ship, state, now) {
  const desiredDisabledCount = getDisabledTurretCountForHealth(ship)

  while (ship.turretDamageOrder.length < desiredDisabledCount) {
    const candidates = BATTLESHIP_TURRET_NAMES.filter(name => ship.batteries[name].enabled !== false)
    if (!candidates.length) break
    const selectedIndex = Math.floor(gameRandom() * candidates.length)
    const turretName = candidates[selectedIndex]
    ship.batteries[turretName].enabled = false
    clearBattleshipTurretSalvo(ship.batteries[turretName])
    ship.turretDamageOrder.push(turretName)
    if (ship.selectedTurret === turretName) ship.selectedTurret = null
    const point = getBattleshipTurretWorldPoint(ship, turretName)
    spawnDestructionExplosion(state, point.x, point.y, { startTime: now, duration: 720, scale: 0.58 })
  }

  while (ship.turretDamageOrder.length > desiredDisabledCount) {
    const turretName = ship.turretDamageOrder.pop()
    if (ship.batteries[turretName]) ship.batteries[turretName].enabled = true
  }
}

function updateBattleship(ship, units, bullets, state, now, targetLookup) {
  ensureBattleshipTurrets(ship)
  updateBattleshipTurretDamage(ship, state, now)
  if (ship.target?.health > 0 && ship.lastHullTargetId !== ship.target.id) {
    BATTLESHIP_TURRET_NAMES.forEach(name => {
      ship.batteries[name].targetId = ship.target.id
    })
    ship.lastHullTargetId = ship.target.id
  }
  const hullTarget = resolveTarget(ship.lastHullTargetId, units, targetLookup)
  const hullControlOverride = hasBattleshipHullControlOverride(ship)
  const broadsideAligned = !hullControlOverride && hullTarget?.health > 0 && canBattleshipTargetEntity(hullTarget)
    ? turnBattleshipForBroadside(ship, hullTarget)
    : true

  const targetEntries = []
  for (const turretName of BATTLESHIP_TURRET_NAMES) {
    const turret = ship.batteries[turretName]
    const target = resolveTarget(ship.batteries[turretName].targetId, units, targetLookup)
    if (!target || target.health <= 0 || !canBattleshipTargetEntity(target)) {
      turret.targetId = null
      clearBattleshipTurretSalvo(turret)
      continue
    }
    const solution = getBattleshipTargetSolution(ship, turretName, target)
    turret.direction = rotateTowards(
      Number.isFinite(turret.direction) ? turret.direction : ship.direction,
      solution.direction,
      ship.turretRotationSpeed || 0.018
    )
    if (turret.enabled !== false && solution.distance <= BATTLESHIP_FIRE_RANGE &&
        !isBattleshipTurretAngleBlocked(ship, turretName, solution.direction)) {
      targetEntries.push({ turretName, target })
    }
  }
  if (broadsideAligned) updateBattleshipBroadside(ship, targetEntries, bullets, now)
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
  const validTarget = canSubmarineTargetEntity(submarine, target)
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
    navalOnly: !isSubmarineYardTarget(target),
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
  let fleetTargetLookup = null
  ;(units || []).forEach(unit => {
    if (TRANSPORT_TYPES.has(unit.type)) {
      updateTransport(unit, units, mapGrid, state.occupancyMap, now)
      if (['turning_offshore', 'reversing_to_shore'].includes(unit.transportOperation?.phase)) addShipWake(unit, state, now)
    }
    else if (unit.type === 'aircraftCarrier') updateCarrier(unit, units, now, delta)
    else if (unit.type === 'battleship') {
      if (hasBattleshipAssignedTarget(unit)) fleetTargetLookup ||= createFleetTargetLookup(units)
      updateBattleship(unit, units, bullets, state, now, fleetTargetLookup)
    }
    else if (unit.type === 'submarine') updateSubmarine(unit, units, bullets, now)
    else if (unit.type === 'navalMineLayer') updateNavalMineLayer(unit, mapGrid, now)
  })
  updateDepthCharges(units, now)
}

export function tryHandleFleetCommand(commandableUnits, worldX, worldY, units, mapGrid, options = {}) {
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

  if (options.boardingOnly) return false

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
