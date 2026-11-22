import { C5_MAX_PAYLOAD_TONS, TILE_SIZE, UNIT_PROPERTIES } from '../config.js'
import { addFixedOccupancy, addMovableOccupancy } from './occupancyTags.js'

export const C5_DROP_RADIUS = 3
export const C5_DROP_INTERVAL_TICKS = 30
export const C5_DROP_DESCENT_TICKS = 90

const lookup = (units, id) => units instanceof Map ? units.get(id) : Array.isArray(units) ? units.find(unit => unit.id === id) : units?.[id]

export function getC5CargoWeight(galaxy, units) {
  return (galaxy.embarkedUnitIds || []).reduce((sum, id) => {
    const unit = lookup(units, id)
    return sum + Number(unit?.weight ?? UNIT_PROPERTIES[unit?.type]?.weight ?? 0)
  }, 0)
}

export function evaluateC5Load(galaxy, vehicle, units) {
  const loaded = getC5CargoWeight(galaxy, units)
  const weight = Number(vehicle?.weight ?? UNIT_PROPERTIES[vehicle?.type]?.weight ?? 0)
  const free = C5_MAX_PAYLOAD_TONS - loaded
  if (!vehicle || UNIT_PROPERTIES[vehicle.type]?.airliftable !== true ||
    vehicle.health <= 0 || galaxy.owner !== vehicle.owner || vehicle.factoryExit ||
    vehicle.embarkedOnId || vehicle.c5Drop || vehicle.transportTransfer ||
    vehicle.embarkedUnitIds?.length || vehicle.towedWreck) {
    return { allowed: false, loaded, free, weight, message: 'Cannot be airlifted' }
  }
  if (weight > free) return { allowed: false, loaded, free, weight, message: `Too heavy: needs ${weight} t, ${free} t free (${loaded}/${C5_MAX_PAYLOAD_TONS} t)` }
  return { allowed: true, loaded, free, weight, message: '' }
}

export function embarkC5Vehicle(galaxy, vehicle, units) {
  galaxy.embarkedUnitIds ||= []
  galaxy.embarkedUnitTypes ||= []
  const result = evaluateC5Load(galaxy, vehicle, units)
  if (!result.allowed) return result
  if (!galaxy.embarkedUnitIds.includes(vehicle.id)) {
    galaxy.embarkedUnitIds.push(vehicle.id)
    galaxy.embarkedUnitTypes.push(vehicle.type)
    galaxy.cargoWeight = result.loaded + result.weight
  }
  vehicle.embarkedOnId = galaxy.id
  vehicle.hidden = true
  vehicle.selected = false
  vehicle.path = []
  vehicle.moveTarget = null
  vehicle.target = null
  return result
}

export function findC5DropTile(target, isPassable, maxRadius = C5_DROP_RADIUS, minRadius = 0) {
  for (let radius = minRadius; radius <= maxRadius; radius++) {
    for (let y = -radius; y <= radius; y++) {
      const tileY = target.y + y
      if (Math.abs(y) === radius) {
        for (let x = target.x - radius; x <= target.x + radius; x++) {
          if (isPassable(x, tileY)) return { x, y: tileY }
        }
      } else {
        if (isPassable(target.x - radius, tileY)) return { x: target.x - radius, y: tileY }
        if (isPassable(target.x + radius, tileY)) return { x: target.x + radius, y: tileY }
      }
    }
  }
  return null
}

export function changeC5GroundOccupancy(unit, occupancy, amount) {
  const centerX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  const centerY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
  for (let y = centerY - 1; y <= centerY + 1; y++) {
    for (let x = centerX - 1; x <= centerX + 1; x++) {
      if (occupancy?.[y]?.[x] !== undefined) occupancy[y][x] = addFixedOccupancy(occupancy[y][x], amount)
    }
  }
  unit.c5GroundOccupancy = amount > 0
  unit.occupancyRemoved = true
}

export function placeC5Cargo(unit, tile, occupancy) {
  unit.x = tile.x * TILE_SIZE
  unit.y = tile.y * TILE_SIZE
  unit.tileX = tile.x
  unit.tileY = tile.y
  unit.embarkedOnId = null
  unit.hidden = false
  if (occupancy?.[tile.y]?.[tile.x] !== undefined) {
    occupancy[tile.y][tile.x] = addMovableOccupancy(occupancy[tile.y][tile.x], 1)
    unit.occupancyRemoved = false
  }
}

export function beginC5Airdrop(galaxy, target, tick) {
  galaxy.dropQueueState = { target: { ...target }, queuedUnitIds: [...(galaxy.embarkedUnitIds || [])], nextDropTick: tick }
}

export function advanceC5Airdrop(galaxy, tick, units, isPassable, notify = () => {}, wind = null) {
  const state = galaxy.dropQueueState
  if (!state || tick < state.nextDropTick) return
  const unit = lookup(units, state.queuedUnitIds.shift())
  let tile
  if (unit?.health > 0) {
    tile = findC5DropTile(state.target, isPassable)
    if (tile) {
      placeC5Cargo(unit, tile)
      unit.altitude = galaxy.altitude || TILE_SIZE * 4.5
      unit.c5Drop = {
        tile, target: state.target, startTick: tick, landTick: tick + C5_DROP_DESCENT_TICKS,
        altitude: galaxy.altitude || TILE_SIZE * 4.5, windX: wind?.x || 0, windY: wind?.y || 0
      }
      const manifestIndex = galaxy.embarkedUnitIds.indexOf(unit.id)
      galaxy.embarkedUnitIds.splice(manifestIndex, 1)
      galaxy.embarkedUnitTypes.splice(manifestIndex, 1)
      galaxy.cargoWeight = getC5CargoWeight(galaxy, units)
    } else {
      notify('No clear land tile for airdrop. Remaining vehicles stay aboard.')
      state.queuedUnitIds.length = 0
    }
  }
  state.nextDropTick = tick + C5_DROP_INTERVAL_TICKS
  if (!state.queuedUnitIds.length) galaxy.dropQueueState = null
  return tile
}

export function destroyC5Cargo(galaxy, units, findWreckTile) {
  for (const id of galaxy.embarkedUnitIds || []) {
    const unit = lookup(units, id)
    if (!unit) continue
    const tile = findWreckTile?.(unit) || {
      x: Math.floor((galaxy.x + TILE_SIZE / 2) / TILE_SIZE),
      y: Math.floor((galaxy.y + TILE_SIZE / 2) / TILE_SIZE)
    }
    placeC5Cargo(unit, tile)
    unit.c5CargoDestroyed = true
    unit.health = 0
  }
  galaxy.embarkedUnitIds = []
  galaxy.embarkedUnitTypes = []
  galaxy.cargoWeight = 0
  galaxy.dropQueueState = null
}

export function unloadC5Cargo(galaxy, units, findTile) {
  if (galaxy.flightState !== 'grounded') return []
  const unloaded = []
  for (const id of [...(galaxy.embarkedUnitIds || [])]) {
    const unit = lookup(units, id); const tile = unit && findTile(unit)
    if (!tile) continue
    Object.assign(unit, { x: tile.x, y: tile.y, tileX: Math.floor((tile.x + TILE_SIZE / 2) / TILE_SIZE), tileY: Math.floor((tile.y + TILE_SIZE / 2) / TILE_SIZE), hidden: false, embarkedOnId: null })
    unloaded.push(unit); galaxy.embarkedUnitIds = galaxy.embarkedUnitIds.filter(unitId => unitId !== id)
  }
  galaxy.embarkedUnitTypes = galaxy.embarkedUnitIds.map(id => lookup(units, id)?.type).filter(Boolean)
  galaxy.cargoWeight = getC5CargoWeight(galaxy, units)
  return unloaded
}

export function advanceC5FlightAnimation(galaxy) {
  const step = Math.max(1, (galaxy.maxAltitude || 144) / 90)
  if (galaxy.flightState === 'takingOff') {
    galaxy.altitude = Math.min(galaxy.maxAltitude || 144, (galaxy.altitude || 0) + step)
    if (galaxy.altitude >= (galaxy.maxAltitude || 144)) galaxy.flightState = 'airborne'
  } else if (galaxy.flightState === 'landing') {
    galaxy.altitude = Math.max(0, (galaxy.altitude || 0) - step)
    if (galaxy.altitude === 0) galaxy.flightState = 'grounded'
  }
  galaxy.shadow ||= {}
  galaxy.shadow.offset = (galaxy.altitude || 0) * 0.25
  galaxy.shadow.scale = 1 + (galaxy.altitude || 0) / Math.max(1, galaxy.maxAltitude || 144) * 0.35
  return galaxy.flightState
}
