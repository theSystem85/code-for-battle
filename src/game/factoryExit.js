import { TILE_SIZE } from '../config.js'
import { getBuildingIdentifier } from '../utils.js'

export const FACTORY_EXIT_DURATION = 1200
export const FACTORY_EXIT_STAGGER = 500
export const canInteractWithUnit = unit => Boolean(unit && !unit.factoryExit)
export const factoryExitEase = progress => progress * progress * (3 - 2 * progress)

export function beginFactoryExit(unit, factory, rallyPoint = null) {
  const startX = (factory.x + 1.3) * TILE_SIZE
  const startY = (factory.y + 0.7) * TILE_SIZE
  unit.factoryExit = {
    factoryId: getBuildingIdentifier(factory), factoryX: factory.x, factoryY: factory.y,
    startX, startY, endX: (factory.x - 1) * TILE_SIZE,
    endY: (factory.y + 3) * TILE_SIZE,
    elapsed: 0, duration: FACTORY_EXIT_DURATION, phase: 'waiting',
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
const tileKey = (x, y) => y * 65536 + x

function finishExit(unit, state, mapGrid, occupancyMap, findPath, onComplete) {
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
    const path = findPath({ x: unit.tileX, y: unit.tileY }, target, mapGrid, occupancyMap)
    unit.path = path?.length > 1 ? path.slice(1) : []
    unit.moveTarget = { x: target.x, y: target.y }
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
  for (const building of buildings) if (building.type === 'vehicleFactory') factoriesById.set(getBuildingIdentifier(building), building)
  for (const unit of units) {
    if (unit.health <= 0 || unit.isAirUnit || unit.embarkedOnId) continue
    if (!unit.factoryExit) occupied.add(tileKey(Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE), Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)))
  }
  for (const unit of units) {
    const state = unit.factoryExit
    if (!state) continue
    const factory = factoriesById.get(state.factoryId)
    if (!factory || factory.health <= 0 || factory.isBeingSold || factory.destroyed) {
      finishExit(unit, state, mapGrid, occupancyMap, findPath, onComplete)
      continue
    }
    const leader = gateLeaders.get(state.factoryId)
    gateLeaders.set(state.factoryId, state)
    if (state.phase === 'waiting') {
      if (leader && (leader.phase === 'waiting' || leader.elapsed < FACTORY_EXIT_STAGGER)) continue
      // Reserve a distinct point farther along the same diagonal for a following vehicle.
      if (leader && state.endX === leader.endX && state.endY === leader.endY) {
        state.endX -= TILE_SIZE
        state.endY += TILE_SIZE
      }
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
      const tile = mapGrid[y]?.[x]
      if (!tile || tile.type === 'water' || tile.type === 'rock' || tile.building || tile.impassable || tile.passable === false || tile.walkable === false || occupancyMap?.[y]?.[x] > 0 || occupied.has(tileKey(x, y))) continue
      state.phase = 'moving'
    }
    state.elapsed = Math.min(state.duration, state.elapsed + Math.max(0, delta))
    const eased = factoryExitEase(state.elapsed / state.duration)
    unit.x = state.startX + (state.endX - state.startX) * eased
    unit.y = state.startY + (state.endY - state.startY) * eased
    unit.tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    unit.tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
    if (state.elapsed >= state.duration) finishExit(unit, state, mapGrid, occupancyMap, findPath, onComplete)
  }
}
