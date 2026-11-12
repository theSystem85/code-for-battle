// Coarse, incremental danger from mobile units. One cell covers several tiles.
// Stamps are added and removed per unit, so a refresh only rewrites units that
// moved to another cell or whose health or crew changed. Callers must keep the
// refresh on the 5 second CPU-headroom cadence. There is no per-frame rebuild.

import { HOWITZER_FIRE_RANGE, TANK_FIRE_RANGE } from '../config.js'
import { isCrippledCrew, shouldRunStrategyEvaluation, unitOffencePerSecond } from '../ai/groundAssaultStrategy.js'

export const DYNAMIC_DANGER_CELL = 4
const MOBILE_THREAT_TYPES = new Set([
  'tank',
  'tank_v1',
  'tank-v2',
  'tank-v3',
  'lightTank',
  'rocketTank',
  'howitzer',
  'apache',
  'f22Raptor',
  'f35',
  'destroyer'
])

export function mobileThreatRangeTiles(unit) {
  if (!unit) return 0
  if (unit.type === 'howitzer') return HOWITZER_FIRE_RANGE
  if (unit.type === 'rocketTank') return Math.ceil(TANK_FIRE_RANGE * 1.5)
  if (unit.type === 'f22Raptor') return 16
  if (unit.type === 'f35') return 14
  if (unit.type === 'apache') return Math.max(6, Math.ceil(TANK_FIRE_RANGE * 0.8))
  if (unit.type === 'destroyer') return 18
  return TANK_FIRE_RANGE
}

export function createDynamicDangerState(mapWidth, mapHeight, cellSize = DYNAMIC_DANGER_CELL) {
  const cellsX = Math.max(1, Math.ceil(mapWidth / cellSize))
  const cellsY = Math.max(1, Math.ceil(mapHeight / cellSize))
  return {
    cellSize,
    mapWidth,
    mapHeight,
    cellsX,
    cellsY,
    values: new Float64Array(cellsX * cellsY),
    stamps: new Map(),
    updates: 0,
    restamps: 0
  }
}

export function dynamicDangerAt(state, tileX, tileY) {
  if (!state?.values || !Number.isFinite(tileX) || !Number.isFinite(tileY)) return 0
  const cx = Math.floor(tileX / state.cellSize)
  const cy = Math.floor(tileY / state.cellSize)
  if (cx < 0 || cy < 0 || cx >= state.cellsX || cy >= state.cellsY) return 0
  return state.values[cy * state.cellsX + cx] || 0
}

export function combinedDangerAt(staticMap, dynamicState, tileX, tileY) {
  const row = staticMap?.[tileY]
  const staticDanger = row && Number.isFinite(row[tileX]) ? row[tileX] : 0
  return staticDanger + dynamicDangerAt(dynamicState, tileX, tileY)
}

function threatSignature(unit, cellSize) {
  const cx = Math.floor((unit.tileX || 0) / cellSize)
  const cy = Math.floor((unit.tileY || 0) / cellSize)
  const healthBucket = Math.round((unit.health || 0) / 10)
  const crippled = isCrippledCrew(unit) ? 1 : 0
  return `${unit.type}:${cx}:${cy}:${healthBucket}:${crippled}`
}

function stampFor(unit, state) {
  const amount = unitOffencePerSecond(unit)
  if (amount <= 0 || !Number.isFinite(unit.tileX) || !Number.isFinite(unit.tileY)) {
    return { cells: [], amount: 0 }
  }
  const range = mobileThreatRangeTiles(unit)
  const { cellSize, cellsX, cellsY } = state
  const minCx = Math.max(0, Math.floor((unit.tileX - range) / cellSize))
  const maxCx = Math.min(cellsX - 1, Math.floor((unit.tileX + range) / cellSize))
  const minCy = Math.max(0, Math.floor((unit.tileY - range) / cellSize))
  const maxCy = Math.min(cellsY - 1, Math.floor((unit.tileY + range) / cellSize))
  const cells = []
  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const centerX = cx * cellSize + cellSize / 2
      const centerY = cy * cellSize + cellSize / 2
      if (Math.hypot(centerX - unit.tileX, centerY - unit.tileY) <= range + cellSize * 0.5) {
        cells.push(cy * cellsX + cx)
      }
    }
  }
  return { cells, amount }
}

function applyStamp(state, cells, amount, sign) {
  const values = state.values
  for (let index = 0; index < cells.length; index++) {
    values[cells[index]] += amount * sign
    if (values[cells[index]] < 1e-9) values[cells[index]] = 0
  }
}

export function updateDynamicDangerMap(state, units, partyId) {
  const seen = new Set()
  let restamps = 0
  for (const unit of units || []) {
    if (!unit || unit.health <= 0 || unit.owner === partyId || !unit.id) continue
    if (!MOBILE_THREAT_TYPES.has(unit.type)) continue
    seen.add(unit.id)
    const signature = threatSignature(unit, state.cellSize)
    const previous = state.stamps.get(unit.id)
    if (previous && previous.signature === signature) continue
    if (previous) applyStamp(state, previous.cells, previous.amount, -1)
    const next = stampFor(unit, state)
    if (next.amount > 0 && next.cells.length) applyStamp(state, next.cells, next.amount, 1)
    state.stamps.set(unit.id, { signature, cells: next.cells, amount: next.amount })
    restamps++
  }
  for (const [id, previous] of state.stamps) {
    if (seen.has(id)) continue
    applyStamp(state, previous.cells, previous.amount, -1)
    state.stamps.delete(id)
    restamps++
  }
  state.updates += 1
  state.restamps = restamps
  return { restamps, updates: state.updates }
}

function ensureState(existing, mapWidth, mapHeight) {
  if (existing && existing.mapWidth === mapWidth && existing.mapHeight === mapHeight && existing.cellSize === DYNAMIC_DANGER_CELL) {
    return existing
  }
  return createDynamicDangerState(mapWidth, mapHeight)
}

export function refreshDynamicDangerMaps(gameState, units, mapGrid, now, headroomMs) {
  if (!gameState || !mapGrid?.length || !mapGrid[0]?.length) return { ran: false, restamps: 0 }
  if (!shouldRunStrategyEvaluation(gameState.dynamicDangerUpdatedAt, now, headroomMs)) {
    return { ran: false, restamps: 0, updates: gameState.dynamicDangerRevision || 0 }
  }
  const mapWidth = mapGrid[0].length
  const mapHeight = mapGrid.length
  const playerCount = Math.min(4, gameState.playerCount || 2)
  if (!gameState.dynamicDangerMaps) gameState.dynamicDangerMaps = {}
  let restamps = 0
  for (let index = 1; index <= playerCount; index++) {
    const partyId = `player${index}`
    const state = ensureState(gameState.dynamicDangerMaps[partyId], mapWidth, mapHeight)
    gameState.dynamicDangerMaps[partyId] = state
    restamps += updateDynamicDangerMap(state, units, partyId).restamps
  }
  gameState.dynamicDangerUpdatedAt = now
  gameState.dynamicDangerRevision = (gameState.dynamicDangerRevision || 0) + 1
  return { ran: true, restamps, updates: gameState.dynamicDangerRevision }
}

export function cycleDangerOverlay(partyIds, index, layer) {
  const ids = (partyIds || []).filter(Boolean)
  if (!ids.length) return { index: -1, layer: 'off', partyId: null, label: 'OFF' }
  const current = Number.isInteger(index) ? index : -1
  const showing = current >= 0 && current < ids.length && (layer === 'static' || layer === 'dynamic')
  if (!showing) {
    return { index: 0, layer: 'static', partyId: ids[0], label: `${ids[0]} static` }
  }
  if (layer === 'static' && current + 1 < ids.length) {
    return { index: current + 1, layer: 'static', partyId: ids[current + 1], label: `${ids[current + 1]} static` }
  }
  if (layer === 'static') {
    return { index: 0, layer: 'dynamic', partyId: ids[0], label: `${ids[0]} dynamic` }
  }
  if (current + 1 < ids.length) {
    return { index: current + 1, layer: 'dynamic', partyId: ids[current + 1], label: `${ids[current + 1]} dynamic` }
  }
  return { index: -1, layer: 'off', partyId: null, label: 'OFF' }
}
