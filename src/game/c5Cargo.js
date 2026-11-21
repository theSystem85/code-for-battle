import { C5_MAX_PAYLOAD_TONS, TILE_SIZE, UNIT_PROPERTIES } from '../config.js'

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
  if (!vehicle || UNIT_PROPERTIES[vehicle.type]?.airliftable !== true) {
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
  }
  vehicle.embarkedOnId = galaxy.id
  vehicle.hidden = true
  return result
}

export function findC5DropTile(target, isPassable, maxRadius = 8) {
  for (let radius = 0; radius <= maxRadius; radius++) for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
    if (radius && Math.max(Math.abs(x), Math.abs(y)) !== radius) continue
    if (isPassable(target.x + x, target.y + y)) return { x: target.x + x, y: target.y + y }
  }
  return null
}

export function beginC5Airdrop(galaxy, target, tick) {
  galaxy.dropQueueState = { target: { x: target.x, y: target.y }, queuedUnitIds: [...(galaxy.embarkedUnitIds || [])], nextDropTick: tick, descending: [] }
}

export function advanceC5Airdrop(galaxy, tick, units, isPassable, notify = () => {}) {
  const state = galaxy.dropQueueState
  if (!state) return []
  const landed = []
  for (let index = state.descending.length - 1; index >= 0; index--) {
    const drop = state.descending[index]
    if (tick < drop.landTick) continue
    const unit = lookup(units, drop.unitId)
    if (unit) {
      unit.x = drop.tile.x * TILE_SIZE
      unit.y = drop.tile.y * TILE_SIZE
      unit.tileX = drop.tile.x
      unit.tileY = drop.tile.y
      unit.hidden = false
      unit.invulnerable = false
      unit.embarkedOnId = null
      landed.push(unit)
    }
    state.descending.splice(index, 1)
  }
  if (state.queuedUnitIds.length && tick >= state.nextDropTick) {
    const tile = findC5DropTile(state.target, (x, y) => isPassable(x, y) && !state.descending.some(drop => drop.tile.x === x && drop.tile.y === y))
    if (!tile) notify('No clear land tile for airdrop; vehicle remains aboard')
    else {
      const unitId = state.queuedUnitIds.shift()
      const unit = lookup(units, unitId)
      state.descending.push({ unitId, tile, startTick: tick, landTick: tick + C5_DROP_DESCENT_TICKS })
      galaxy.embarkedUnitIds = galaxy.embarkedUnitIds.filter(id => id !== unitId)
      galaxy.embarkedUnitTypes = galaxy.embarkedUnitIds.map(id => lookup(units, id)?.type).filter(Boolean)
      if (unit) unit.invulnerable = true
      state.nextDropTick = tick + C5_DROP_INTERVAL_TICKS
    }
  }
  if (!state.queuedUnitIds.length && !state.descending.length) galaxy.dropQueueState = null
  return landed
}

export function destroyC5Cargo(galaxy, units) {
  const ids = new Set([...(galaxy.embarkedUnitIds || []), ...(galaxy.dropQueueState?.queuedUnitIds || [])])
  ids.forEach(id => { const unit = lookup(units, id); if (unit) unit.health = 0 })
  galaxy.embarkedUnitIds = []
  galaxy.embarkedUnitTypes = []
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
