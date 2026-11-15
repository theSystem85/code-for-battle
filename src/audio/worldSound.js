import { gameState } from '../gameState.js'
import { isPositionVisibleToPlayer } from '../game/shadowOfWar.js'
import { playPositionalSound } from '../sound.js'

function isHumanOwner(owner) {
  if (!owner) return true
  const human = gameState.humanPlayer || 'player1'
  if (owner === human) return true
  return human === 'player1' && owner === 'player'
}

// Enemy-side effects stay silent in the fog. Friendly effects always play and
// still fall off with distance through playPositionalSound.
export function isEnemyAudibleAt(x, y, owner) {
  if (isHumanOwner(owner)) return true
  if (!gameState.shadowOfWarEnabled) return true
  return isPositionVisibleToPlayer(gameState, gameState.mapGrid, x, y)
}

export function playVisiblePositionalSound(eventName, x, y, volume = 1, owner = null, throttleSeconds = 0) {
  if (!isEnemyAudibleAt(x, y, owner)) return null
  return playPositionalSound(eventName, x, y, volume, throttleSeconds)
}

const lastWeaponSound = new WeakMap()

// gapMs collapses a single shooter's rapid shots without sharing a clock
// across every unit of that type.
export function playWeaponSound(unit, eventName, x, y, volume = 0.5, gapMs = 0) {
  if (gapMs > 0 && unit) {
    const now = performance.now()
    const last = lastWeaponSound.get(unit) || 0
    if (now - last < gapMs) return null
    lastWeaponSound.set(unit, now)
  }
  return playVisiblePositionalSound(eventName, x, y, volume, unit?.owner)
}
