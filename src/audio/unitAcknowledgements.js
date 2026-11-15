import { ACK_THROTTLE_MS, claimAckSlot, resetAcknowledgementThrottle } from './acknowledgementClock.js'
import { playPositionalSound, playSound } from '../sound.js'

const GROUND = new Set(['tank', 'tank_v1', 'tank-v2', 'tank-v3', 'lightTank', 'rocketTank', 'howitzer'])
const SUPPORT = new Set(['ambulance', 'tankerTruck', 'ammunitionTruck', 'recoveryTank', 'mineLayer', 'mineSweeper', 'harvester'])
const NAVAL = new Set(['destroyer', 'battleship', 'submarine', 'hovercraft', 'aircraftCarrier', 'supplyShip', 'vehicleFerry', 'navalMineLayer'])
const AIR = new Set(['apache', 'f22Raptor', 'f35'])

const KEYS = {
  ground: { select: 'ackSelectGround', move: 'ackMoveGround', attack: 'ackAttackGround' },
  support: { select: 'ackSupportSelect', move: 'ackSupportMove', attack: 'ackAttackGround' },
  naval: { select: 'ackNavalSelect', move: 'ackNavalMove', attack: 'ackNavalAttack' },
  air: { select: 'ackAirSelect', move: 'ackAirMove', attack: 'ackAirAttack' }
}

export { ACK_THROTTLE_MS, resetAcknowledgementThrottle }

export function acknowledgementClass(unit) {
  const type = unit?.type
  if (!type || unit.health <= 0 || unit.isBuilding) return null
  if (AIR.has(type)) return 'air'
  if (NAVAL.has(type) || unit.isNaval === true) return 'naval'
  if (SUPPORT.has(type)) return 'support'
  if (GROUND.has(type)) return 'ground'
  return null
}

export function acknowledgementKeyFor(units, action) {
  const list = Array.isArray(units) ? units : (units ? [units] : [])
  const counts = { ground: 0, support: 0, naval: 0, air: 0 }
  let firstClass = null
  for (let i = 0; i < list.length; i++) {
    const cls = acknowledgementClass(list[i])
    if (!cls) continue
    counts[cls]++
    if (!firstClass) firstClass = cls
  }
  let best = null
  let bestCount = 0
  const order = firstClass ? [firstClass, 'ground', 'air', 'naval', 'support'] : ['ground', 'air', 'naval', 'support']
  for (let i = 0; i < order.length; i++) {
    const cls = order[i]
    if (counts[cls] > bestCount) {
      best = cls
      bestCount = counts[cls]
    }
  }
  if (!best) return null
  return KEYS[best][action] || null
}

// One voice line for a whole selection. Returns 'played', 'throttled', or
// 'unclassified' so callers can keep the legacy yes-sir cue for unknown types.
export function playUnitAcknowledgement(units, action, { volume = 0.85, now = Date.now() } = {}) {
  const key = acknowledgementKeyFor(units, action)
  if (!key) return 'unclassified'
  if (!claimAckSlot(now)) return 'throttled'
  playSound(key, volume)
  return 'played'
}

export function playSelectionSound(units) {
  if (playUnitAcknowledgement(units, 'select') === 'unclassified') {
    playSound('unitSelection')
  }
}

export function playMoveOrderSound(units, x, y, volume = 0.5) {
  const key = acknowledgementKeyFor(units, 'move')
  const positional = Number.isFinite(x) && Number.isFinite(y)
  if (!key) {
    if (positional) playPositionalSound('movement', x, y, volume)
    else playSound('movement', volume)
    return 'fallback'
  }
  if (!claimAckSlot(Date.now())) return 'throttled'
  if (positional) playPositionalSound(key, x, y, volume)
  else playSound(key, volume)
  return 'played'
}

export function playAttackOrderSound(units, volume = 1) {
  const key = acknowledgementKeyFor(units, 'attack')
  if (!key) {
    playSound('attacking', volume)
    return 'fallback'
  }
  if (!claimAckSlot(Date.now())) return 'throttled'
  playSound(key, volume)
  return 'played'
}

export function playRetreatAcknowledgement() {
  if (!claimAckSlot(Date.now())) return 'throttled'
  playSound('retreatCall', 0.7)
  return 'played'
}
