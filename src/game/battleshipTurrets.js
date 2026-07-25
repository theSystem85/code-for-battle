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

const BATTLESHIP_TURRET_LOCAL_POINTS = Object.freeze(Object.fromEntries(
  BATTLESHIP_TURRET_NAMES.map(name => [name, Object.freeze({
    x: 0,
    y: BATTLESHIP_TURRET_LAYOUT[name].longitudinal * TILE_SIZE
  })])
))
const hydratedBatteryStates = new WeakMap()

export const BATTLESHIP_TOWER_RADIUS = TILE_SIZE * 0.55

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2
  while (angle < -Math.PI) angle += Math.PI * 2
  return angle
}

function createTurretState(ship, name, source = null) {
  const layout = BATTLESHIP_TURRET_LAYOUT[name]
  return {
    targetId: source?.targetId || null,
    lastShotTime: Number.isFinite(source?.lastShotTime) ? source.lastShotTime : 0,
    direction: Number.isFinite(source?.direction)
      ? source.direction
      : (ship.direction || 0) + layout.directionOffset,
    enabled: source?.enabled !== false,
    salvoStartedAt: Number.isFinite(source?.salvoStartedAt) ? source.salvoStartedAt : null,
    scheduledAt: Number.isFinite(source?.scheduledAt) ? source.scheduledAt : null,
    nextBarrelIndex: Number.isInteger(source?.nextBarrelIndex) ? source.nextBarrelIndex : 0,
    reloadUntil: Number.isFinite(source?.reloadUntil) ? source.reloadUntil : 0,
    barrelRecoilStartTimes: Array.from({ length: 2 }, (_, index) =>
      Number.isFinite(source?.barrelRecoilStartTimes?.[index]) ? source.barrelRecoilStartTimes[index] : null),
    muzzleFlashStartTimes: Array.from({ length: 2 }, (_, index) =>
      Number.isFinite(source?.muzzleFlashStartTimes?.[index]) ? source.muzzleFlashStartTimes[index] : null)
  }
}

export function createBattleshipTurrets(ship) {
  const batteries = Object.fromEntries(BATTLESHIP_TURRET_NAMES.map(name => [name, createTurretState(ship, name)]))
  if (ship && typeof ship === 'object') hydratedBatteryStates.set(ship, batteries)
  return batteries
}

export function ensureBattleshipTurrets(ship) {
  if (ship?.type !== 'battleship') return null
  if (hydratedBatteryStates.get(ship) === ship.batteries) return ship.batteries

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
  hydratedBatteryStates.set(ship, ship.batteries)
  return ship.batteries
}

export function clearBattleshipFireControl(ship) {
  if (ship?.type !== 'battleship') return false
  ensureBattleshipTurrets(ship)

  const hadFireControl = Boolean(
    ship.target ||
    ship.lastHullTargetId ||
    BATTLESHIP_TURRET_NAMES.some(name => {
      const turret = ship.batteries[name]
      return turret.targetId || (turret.scheduledAt !== null && turret.nextBarrelIndex < 2)
    })
  )

  ship.target = null
  ship.lastHullTargetId = null
  ship.broadsideStartedAt = null
  ship.remoteFireCommandActive = false
  BATTLESHIP_TURRET_NAMES.forEach(name => {
    const turret = ship.batteries[name]
    turret.targetId = null
    turret.salvoStartedAt = null
    turret.scheduledAt = null
    turret.nextBarrelIndex = 0
  })

  return hadFireControl
}

export function getBattleshipTurretLocalPoint(name) {
  return BATTLESHIP_TURRET_LOCAL_POINTS[name] || null
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

export function getBattleshipTurretBlockedArc(ship, name) {
  const layout = BATTLESHIP_TURRET_LAYOUT[name]
  if (!ship || !layout) return null
  const hullDirection = Number.isFinite(ship.direction) ? ship.direction : (ship.rotation || 0)
  return {
    centerAngle: normalizeAngle(hullDirection + (layout.longitudinal >= 0 ? Math.PI : 0)),
    halfAngle: Math.asin(Math.min(0.92, BATTLESHIP_TOWER_RADIUS / (Math.abs(layout.longitudinal) * TILE_SIZE)))
  }
}

export function isBattleshipTurretAngleBlocked(ship, name, worldAngle) {
  const blockedArc = getBattleshipTurretBlockedArc(ship, name)
  return Boolean(blockedArc && Math.abs(normalizeAngle(worldAngle - blockedArc.centerAngle)) <= blockedArc.halfAngle)
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
