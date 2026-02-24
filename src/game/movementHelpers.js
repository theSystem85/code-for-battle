import { playSound } from '../sound.js'
import { gameState } from '../gameState.js'

export function calculatePositionalAudio(x, y) {
  const canvas = document.getElementById('gameCanvas')
  if (!canvas) {
    return { pan: 0, volumeFactor: 1 }
  }
  const centerX = gameState.scrollOffset.x + canvas.width / 2
  const centerY = gameState.scrollOffset.y + canvas.height / 2
  const dx = x - centerX
  const dy = y - centerY
  const distance = Math.hypot(dx, dy)
  const maxDistance = Math.max(canvas.width, canvas.height) * 0.75
  const volumeFactor = Math.max(0, 1 - distance / maxDistance)
  const pan = Math.max(-1, Math.min(1, dx / maxDistance))
  return { pan, volumeFactor }
}

export function consumeUnitGas(unit, amount) {
  if (!unit || typeof unit.gas !== 'number') {
    return
  }
  if (amount <= 0) {
    return
  }

  const prevGas = unit.gas
  unit.gas = Math.max(0, unit.gas - amount)

  if (prevGas > 0 && unit.gas <= 0 && !unit.outOfGasPlayed) {
    playSound('outOfGas')
    unit.outOfGasPlayed = true
    unit.needsEmergencyFuel = true
    unit.emergencyFuelRequestTime = performance.now()
  }
}

export function normalizeAngle(angle) {
  let result = angle
  while (result > Math.PI) result -= 2 * Math.PI
  while (result < -Math.PI) result += 2 * Math.PI
  return result
}

export function isAirborneUnit(unit) {
  if (!unit) return false
  if (unit.isAirUnit && unit.flightState !== 'grounded') {
    return true
  }
  return (unit.type === 'apache' || unit.type === 'f22Raptor') && unit.flightState !== 'grounded'
}

export function isGroundUnit(unit) {
  if (!unit) return false
  return !isAirborneUnit(unit)
}

export function ownersAreEnemies(ownerA, ownerB) {
  if (!ownerA || !ownerB) {
    return false
  }

  const normalize = owner => {
    if (owner === 'player') return 'player1'
    return owner
  }

  return normalize(ownerA) !== normalize(ownerB)
}
