import { TILE_SIZE } from '../config.js'

export const BATTLESHIP_TURRET_NAMES = Object.freeze([
  'foreOuter',
  'foreInner',
  'aftInner',
  'aftOuter'
])

export const BATTLESHIP_TURRET_LAYOUT = Object.freeze({
  foreOuter: Object.freeze({ longitudinal: 1.6, directionOffset: 0 }),
  foreInner: Object.freeze({ longitudinal: 0.95, directionOffset: 0 }),
  aftInner: Object.freeze({ longitudinal: -1.8, directionOffset: Math.PI }),
  aftOuter: Object.freeze({ longitudinal: -2.42, directionOffset: Math.PI })
})

function createTurretState(ship, name, source = null) {
  const layout = BATTLESHIP_TURRET_LAYOUT[name]
  return {
    targetId: source?.targetId || null,
    lastShotTime: Number.isFinite(source?.lastShotTime) ? source.lastShotTime : 0,
    direction: Number.isFinite(source?.direction)
      ? source.direction
      : (ship.direction || 0) + layout.directionOffset,
    enabled: source?.enabled !== false
  }
}

export function createBattleshipTurrets(ship) {
  return Object.fromEntries(BATTLESHIP_TURRET_NAMES.map(name => [name, createTurretState(ship, name)]))
}

export function ensureBattleshipTurrets(ship) {
  if (ship?.type !== 'battleship') return null

  const existing = ship.batteries || {}
  const legacyFore = existing.fore || null
  const legacyAft = existing.aft || null
  ship.batteries = Object.fromEntries(BATTLESHIP_TURRET_NAMES.map(name => {
    const legacy = name.startsWith('fore') ? legacyFore : legacyAft
    return [name, createTurretState(ship, name, existing[name] || legacy)]
  }))

  ship.turretDamageOrder = Array.from(new Set(ship.turretDamageOrder || []))
    .filter(name => BATTLESHIP_TURRET_NAMES.includes(name) && ship.batteries[name].enabled === false)

  if (!BATTLESHIP_TURRET_NAMES.includes(ship.selectedTurret)) {
    ship.selectedTurret = null
  }
  delete ship.selectedBattery
  return ship.batteries
}

export function getBattleshipTurretLocalPoint(name) {
  const layout = BATTLESHIP_TURRET_LAYOUT[name]
  if (!layout) return null
  return { x: 0, y: layout.longitudinal * TILE_SIZE }
}

export function getBattleshipTurretWorldPoint(ship, name) {
  const layout = BATTLESHIP_TURRET_LAYOUT[name]
  if (!ship || !layout) return null
  const direction = Number.isFinite(ship.direction) ? ship.direction : (ship.rotation || 0)
  const centerX = ship.x + TILE_SIZE / 2
  const centerY = ship.y + TILE_SIZE / 2
  return {
    x: centerX + Math.cos(direction) * TILE_SIZE * layout.longitudinal,
    y: centerY + Math.sin(direction) * TILE_SIZE * layout.longitudinal
  }
}

export function selectBattleshipTurret(ship, worldX, worldY) {
  if (ship?.type !== 'battleship') return null
  ensureBattleshipTurrets(ship)

  let nearestName = null
  let nearestDistance = Infinity
  BATTLESHIP_TURRET_NAMES.forEach(name => {
    if (ship.batteries[name].enabled === false) return
    const point = getBattleshipTurretWorldPoint(ship, name)
    const distance = Math.hypot(worldX - point.x, worldY - point.y)
    if (distance < nearestDistance) {
      nearestName = name
      nearestDistance = distance
    }
  })

  ship.selectedTurret = nearestDistance <= TILE_SIZE * 0.55 ? nearestName : null
  return ship.selectedTurret
}
