import {
  TILE_SIZE,
  MINE_HEALTH,
  WATER_MINE_ARM_DELAY,
  WATER_MINE_DAMAGE,
  WATER_MINE_DAMAGE_RADIUS,
  WATER_MINE_TRIGGER_RADIUS
} from '../config.js'
import { gameState } from '../gameState.js'
import { getUniqueId } from '../utils.js'

const waterMineLookup = new Map()

function key(tileX, tileY) {
  return `${tileX},${tileY}`
}

function mineCenter(mine) {
  return {
    x: mine.tileX * TILE_SIZE + TILE_SIZE / 2,
    y: mine.tileY * TILE_SIZE + TILE_SIZE / 2
  }
}

export function createWaterMine(tileX, tileY, owner, now = 0) {
  return {
    id: getUniqueId(),
    tileX,
    tileY,
    owner,
    health: MINE_HEALTH,
    maxHealth: MINE_HEALTH,
    deployTime: now,
    armedAt: now + WATER_MINE_ARM_DELAY,
    active: false,
    waterMine: true
  }
}

export function getWaterMineAtTile(tileX, tileY) {
  return waterMineLookup.get(key(tileX, tileY)) || null
}

export function deployWaterMine(tileX, tileY, owner, mapGrid, now = 0) {
  if (mapGrid?.[tileY]?.[tileX]?.type !== 'water' || getWaterMineAtTile(tileX, tileY)) return null
  const mine = createWaterMine(tileX, tileY, owner, now)
  gameState.waterMines = Array.isArray(gameState.waterMines) ? gameState.waterMines : []
  gameState.waterMines.push(mine)
  waterMineLookup.set(key(tileX, tileY), mine)
  return mine
}

export function removeWaterMine(mine) {
  if (!mine) return false
  const index = gameState.waterMines?.indexOf(mine) ?? -1
  if (index >= 0) gameState.waterMines.splice(index, 1)
  waterMineLookup.delete(key(mine.tileX, mine.tileY))
  return index >= 0
}

export function clearWaterMineSafely(mine) {
  if (!mine) return false
  const center = mineCenter(mine)
  gameState.explosions.push({
    x: center.x,
    y: center.y,
    maxRadius: TILE_SIZE * 0.4,
    startTime: gameState.simulationTime || 0,
    duration: 220,
    underwater: true,
    disarmed: true
  })
  return removeWaterMine(mine)
}

export function isFriendlyWaterMineBlocking(tileX, tileY, owner) {
  const mine = getWaterMineAtTile(tileX, tileY)
  return Boolean(owner && mine?.active && mine.owner === owner)
}

function applyWaterMineDamage(mine, units, now) {
  const center = mineCenter(mine)
  ;(units || []).forEach(unit => {
    if (!unit?.isNaval || unit.health <= 0 || unit.embarkedOnId || (unit.type === 'submarine' && unit.depthState !== 'surfaced')) return
    const unitCenterX = unit.x + TILE_SIZE / 2
    const unitCenterY = unit.y + TILE_SIZE / 2
    const distance = Math.hypot(unitCenterX - center.x, unitCenterY - center.y)
    if (distance > WATER_MINE_DAMAGE_RADIUS) return
    const falloff = Math.max(0.2, 1 - distance / WATER_MINE_DAMAGE_RADIUS)
    if (unit.type === 'navalMineLayer' && unit.waterMineSweepMode) return
    unit.health = Math.max(0, unit.health - WATER_MINE_DAMAGE * falloff)
    unit.lastAttackedTime = now
  })
}

export function detonateWaterMine(mine, units, now = 0) {
  if (!mine || !gameState.waterMines?.includes(mine)) return false
  const center = mineCenter(mine)
  applyWaterMineDamage(mine, units, now)
  gameState.explosions.push({
    x: center.x,
    y: center.y,
    maxRadius: WATER_MINE_DAMAGE_RADIUS,
    startTime: now,
    duration: 650,
    underwater: true
  })
  removeWaterMine(mine)

  ;[...(gameState.waterMines || [])].forEach(other => {
    if (!other.active) return
    if (Math.hypot(other.tileX - mine.tileX, other.tileY - mine.tileY) <= 1.5) {
      detonateWaterMine(other, units, now + 80)
    }
  })
  return true
}

export function updateWaterMines(now, units) {
  ;(gameState.waterMines || []).forEach(mine => {
    if (!mine.active && now >= mine.armedAt) mine.active = true
  })

  for (const mine of [...(gameState.waterMines || [])]) {
    if (!mine.active) continue
    const center = mineCenter(mine)
    const triggeringUnit = (units || []).find(unit => {
      if (!unit?.isNaval || unit.health <= 0 || unit.embarkedOnId || unit.owner === mine.owner) return false
      if (unit.type === 'submarine' && unit.depthState !== 'surfaced') return false
      const unitCenterX = unit.x + TILE_SIZE / 2
      const unitCenterY = unit.y + TILE_SIZE / 2
      return Math.hypot(unitCenterX - center.x, unitCenterY - center.y) <= WATER_MINE_TRIGGER_RADIUS
    })
    if (triggeringUnit) detonateWaterMine(mine, units, now)
  }
}

export function rebuildWaterMineLookup() {
  waterMineLookup.clear()
  ;(gameState.waterMines || []).forEach(mine => waterMineLookup.set(key(mine.tileX, mine.tileY), mine))
}
