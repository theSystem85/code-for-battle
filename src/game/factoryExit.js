import { TILE_SIZE } from '../config.js'
import { getBuildingIdentifier } from '../utils.js'

// Preserve the crawl speed, but hand off at the first outside tile beside the door.
const FACTORY_EXIT_MS_PER_TILE = 3800 / Math.hypot(2.3, 2.3)
export const FACTORY_EXIT_DURATION = Math.round(Math.hypot(1.3, 2.3) * FACTORY_EXIT_MS_PER_TILE)
// The next queued vehicle starts once the previous one is about 40% out of the gate.
export const FACTORY_EXIT_STAGGER = Math.round(FACTORY_EXIT_DURATION * 0.4)
// How long a vehicle waits for a blocked exit tile before choosing the next free spot.
export const FACTORY_EXIT_BLOCKED_WAIT = 1000
// Spiral search radius used for blocked exit and rally tiles.
export const FACTORY_EXIT_SEARCH_RADIUS = 6
// The unit fades in while leaving the dark gate so no barrel tip shows inside it.
export const factoryExitVisibility = unit => {
  const state = unit?.factoryExit
  if (!state) return 1
  if (state.phase !== 'moving') return 0
  return Math.min(1, state.elapsed / (state.duration * 0.15))
}
export const canInteractWithUnit = unit => Boolean(unit && !unit.factoryExit)
export const factoryExitEase = progress => progress * progress * (3 - 2 * progress)

export function beginFactoryExit(unit, factory, rallyPoint = null) {
  const startX = (factory.x + 1.3) * TILE_SIZE
  const startY = (factory.y + 0.7) * TILE_SIZE
  unit.factoryExit = {
    factoryId: getBuildingIdentifier(factory), factoryX: factory.x, factoryY: factory.y,
    startX, startY, endX: factory.x * TILE_SIZE,
    endY: (factory.y + 3) * TILE_SIZE,
    elapsed: 0, duration: FACTORY_EXIT_DURATION, phase: 'waiting', waited: 0,
    rallyPoint: rallyPoint ? { x: rallyPoint.x, y: rallyPoint.y } : null
  }
  unit.x = startX
  unit.y = startY
  unit.tileX = Math.floor((startX + TILE_SIZE / 2) / TILE_SIZE)
  unit.tileY = Math.floor((startY + TILE_SIZE / 2) / TILE_SIZE)
  unit.direction = unit.rotation = unit.turretDirection = Math.PI * 3 / 4
  unit.selected = false
  unit.spawnedInFactory = false
  unit.path = []
  unit.moveTarget = null
}

// Reused scratch storage: one indexed preparation per simulation tick, no scans per unit.
const factoriesById = new Map()
const gateLeaders = new Map()
const occupied = new Set()
const claimed = new Set()
const tileKey = (x, y) => y * 65536 + x
const unitTileX = unit => Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
const unitTileY = unit => Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

function isPassable(mapGrid, x, y) {
  const tile = mapGrid[y]?.[x]
  return Boolean(tile && tile.type !== 'water' && tile.type !== 'rock' && !tile.building && !tile.impassable && tile.passable !== false && tile.walkable !== false)
}

const isFree = (mapGrid, occupancyMap, x, y) => isPassable(mapGrid, x, y) && !(occupancyMap?.[y]?.[x] > 0) && !occupied.has(tileKey(x, y)) && !claimed.has(tileKey(x, y))

// Deterministic spiral: rings of growing Chebyshev radius, fixed order within each ring.
function forEachSpiralTile(cx, cy, radius, visit) {
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        if (visit(cx + dx, cy + dy)) return true
      }
    }
  }
  return false
}

export function findNearestFreeTile(mapGrid, occupancyMap, cx, cy, radius = FACTORY_EXIT_SEARCH_RADIUS, accept = null) {
  let found = null
  forEachSpiralTile(cx, cy, radius, (x, y) => {
    if (!isFree(mapGrid, occupancyMap, x, y) || (accept && !accept(x, y))) return false
    found = { x, y }
    return true
  })
  return found
}

// Only hand off outside the footprint with room for an ordinary next move.
// At most eight neighbour checks per waiting exit, never per render or moving unit.
function canNavigateFrom(factory, mapGrid, occupancyMap, x, y) {
  if (x >= factory.x && x < factory.x + 3 && y >= factory.y && y < factory.y + 3) return false
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= factory.x && nx < factory.x + 3 && ny >= factory.y && ny < factory.y + 3) continue
      if (!isFree(mapGrid, occupancyMap, nx, ny)) continue
      if (dx && dy && (!isFree(mapGrid, occupancyMap, x + dx, y) || !isFree(mapGrid, occupancyMap, x, y + dy))) continue
      return true
    }
  }
  return false
}

const isIdleFriendly = (unit, owner) => unit.owner === owner && unit.health > 0 && !unit.factoryExit && !unit.isAirUnit && !unit.isNaval &&
  !unit.target && !unit.moveTarget && !(unit.path?.length) && !unit.harvesting && !unit.embarkedOnId

// Move idle friendly units off a tile toward the nearest free neighbour tile.
function nudgeIdleBlockers(units, owner, x, y, mapGrid, occupancyMap, findPath) {
  let blocked = false
  for (const other of units) {
    if (other.factoryExit || other.health <= 0 || other.isAirUnit || other.embarkedOnId) continue
    if (unitTileX(other) !== x || unitTileY(other) !== y) continue
    if (!isIdleFriendly(other, owner) || !findPath) { blocked = true; continue }
    const spot = findNearestFreeTile(mapGrid, occupancyMap, x, y, 3)
    if (!spot) { blocked = true; continue }
    const path = findPath({ x, y }, spot, mapGrid, occupancyMap)
    if (!(path?.length > 1)) { blocked = true; continue }
    claimed.add(tileKey(spot.x, spot.y))
    other.path = path.slice(1)
    other.moveTarget = { x: spot.x, y: spot.y }
    other.nudgedByFactoryExit = true
  }
  return blocked
}

// Rally tiles that are occupied or already targeted resolve to the nearest free reachable tile.
function resolveRallyTarget(unit, target, units, mapGrid, occupancyMap, findPath) {
  const key = tileKey(target.x, target.y)
  let taken = !isPassable(mapGrid, target.x, target.y) || claimed.has(key)
  if (!taken) {
    for (const other of units) {
      if (other === unit || other.health <= 0 || other.isAirUnit || other.factoryExit) continue
      if ((unitTileX(other) === target.x && unitTileY(other) === target.y) ||
        (other.moveTarget && other.moveTarget.x === target.x && other.moveTarget.y === target.y)) { taken = true; break }
    }
  }
  if (!taken) return { target, path: findPath({ x: unit.tileX, y: unit.tileY }, target, mapGrid, occupancyMap) }
  const reserved = new Set()
  for (const other of units) {
    if (other === unit || other.health <= 0 || other.isAirUnit || other.factoryExit) continue
    reserved.add(tileKey(unitTileX(other), unitTileY(other)))
    if (other.moveTarget) reserved.add(tileKey(other.moveTarget.x, other.moveTarget.y))
  }
  let result = null
  findNearestFreeTile(mapGrid, occupancyMap, target.x, target.y, FACTORY_EXIT_SEARCH_RADIUS, (x, y) => {
    if (reserved.has(tileKey(x, y))) return false
    const path = findPath({ x: unit.tileX, y: unit.tileY }, { x, y }, mapGrid, occupancyMap)
    if (!(path?.length > 1)) return false
    result = { target: { x, y }, path }
    return true
  })
  return result || { target, path: findPath({ x: unit.tileX, y: unit.tileY }, target, mapGrid, occupancyMap) }
}

function finishExit(unit, state, units, mapGrid, occupancyMap, findPath, onComplete) {
  unit.x = state.endX
  unit.y = state.endY
  unit.tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  unit.tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
  delete unit.factoryExit
  unit.spawnedInFactory = false
  unit.holdInFactory = false
  if (occupancyMap?.[unit.tileY]?.[unit.tileX] !== undefined) occupancyMap[unit.tileY][unit.tileX]++
  // AI and harvesters may already have a pending order. Resume it from the exit.
  const target = state.rallyPoint || unit.moveTarget
  if (target && findPath) {
    const resolved = resolveRallyTarget(unit, target, units, mapGrid, occupancyMap, findPath)
    unit.path = resolved.path?.length > 1 ? resolved.path.slice(1) : []
    unit.moveTarget = { x: resolved.target.x, y: resolved.target.y }
    claimed.add(tileKey(resolved.target.x, resolved.target.y))
  }
  onComplete?.(unit, state)
}

export function updateFactoryExits(units, buildings, mapGrid, occupancyMap, delta, paused = false, findPath = null, onComplete = null) {
  if (paused) return
  let hasExits = false
  for (const unit of units) if (unit.factoryExit) { hasExits = true; break }
  if (!hasExits) return
  factoriesById.clear()
  gateLeaders.clear()
  occupied.clear()
  claimed.clear()
  for (const building of buildings) if (building.type === 'vehicleFactory') factoriesById.set(getBuildingIdentifier(building), building)
  for (const unit of units) {
    if (unit.health <= 0 || unit.isAirUnit || unit.embarkedOnId) continue
    if (unit.factoryExit?.phase === 'moving') claimed.add(tileKey(Math.floor((unit.factoryExit.endX + TILE_SIZE / 2) / TILE_SIZE), Math.floor((unit.factoryExit.endY + TILE_SIZE / 2) / TILE_SIZE)))
    if (!unit.factoryExit) occupied.add(tileKey(Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE), Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)))
  }
  for (const unit of units) {
    const state = unit.factoryExit
    if (!state) continue
    const factory = factoriesById.get(state.factoryId)
    if (!factory || factory.health <= 0 || factory.isBeingSold || factory.destroyed) {
      finishExit(unit, state, units, mapGrid, occupancyMap, findPath, onComplete)
      continue
    }
    const leader = gateLeaders.get(state.factoryId)
    gateLeaders.set(state.factoryId, state)
    if (state.phase === 'waiting') {
      if (leader && (leader.phase === 'waiting' || leader.elapsed < FACTORY_EXIT_STAGGER)) continue
      let x = Math.floor((state.endX + TILE_SIZE / 2) / TILE_SIZE)
      let y = Math.floor((state.endY + TILE_SIZE / 2) / TILE_SIZE)
      if (!mapGrid[y]?.[x]) {
        x = Math.max(0, Math.min(mapGrid[0].length - 1, x))
        y = Math.max(0, Math.min(mapGrid.length - 1, y))
        // A corner factory can have neither a western nor a southern outside tile.
        if (x >= factory.x && x < factory.x + 3 && y >= factory.y && y < factory.y + 3) {
          x = factory.x + 3 < mapGrid[0].length ? factory.x + 3 : factory.x - 1
        }
        state.endX = x * TILE_SIZE
        state.endY = y * TILE_SIZE
      }
      if (!isFree(mapGrid, occupancyMap, x, y) || !canNavigateFrom(factory, mapGrid, occupancyMap, x, y)) {
        // Push idle friendly vehicles aside; otherwise take the next free spot after a short wait.
        if (occupied.has(tileKey(x, y)) && isPassable(mapGrid, x, y)) nudgeIdleBlockers(units, unit.owner, x, y, mapGrid, occupancyMap, findPath)
        state.waited = (state.waited || 0) + Math.max(0, delta)
        if (state.waited < FACTORY_EXIT_BLOCKED_WAIT) continue
        const spot = findNearestFreeTile(mapGrid, occupancyMap, x, y, 2,
          (tx, ty) => canNavigateFrom(factory, mapGrid, occupancyMap, tx, ty) && (tx < factory.x || ty >= factory.y + 3))
        if (!spot) continue
        x = spot.x
        y = spot.y
        state.endX = x * TILE_SIZE
        state.endY = y * TILE_SIZE
      }
      state.duration = Math.max(1, Math.round(Math.hypot(state.endX - state.startX, state.endY - state.startY) / TILE_SIZE * FACTORY_EXIT_MS_PER_TILE))
      claimed.add(tileKey(x, y))
      state.phase = 'moving'
    }
    state.elapsed = Math.min(state.duration, state.elapsed + Math.max(0, delta))
    const eased = factoryExitEase(state.elapsed / state.duration)
    unit.x = state.startX + (state.endX - state.startX) * eased
    unit.y = state.startY + (state.endY - state.startY) * eased
    unit.tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    unit.tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
    if (state.elapsed >= state.duration) finishExit(unit, state, units, mapGrid, occupancyMap, findPath, onComplete)
  }
}
