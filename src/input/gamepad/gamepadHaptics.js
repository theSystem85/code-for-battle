import { getHapticSettings } from './gamepadProfiles.js'
import { getGamepadStore } from './gamepadStore.js'

const EFFECTS = {
  menu: { duration: 28, strong: 0.15, weak: 0.35 },
  fire: { duration: 70, strong: 0.45, weak: 0.7 },
  damage: { duration: 120, strong: 0.85, weak: 0.4 }
}

function effectFor(kind) {
  return EFFECTS[kind] || EFFECTS.menu
}

export function pulseGamepadHaptic(gamepad, kind, intensity) {
  if (!gamepad || !(intensity > 0)) return false
  const effect = effectFor(kind)
  const strong = effect.strong * intensity
  const weak = effect.weak * intensity
  const actuator = gamepad.vibrationActuator
  if (actuator && typeof actuator.playEffect === 'function') {
    try {
      const result = actuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: effect.duration,
        weakMagnitude: weak > 1 ? 1 : weak,
        strongMagnitude: strong > 1 ? 1 : strong
      })
      if (result && typeof result.catch === 'function') result.catch(() => {})
      return true
    } catch {
      return false
    }
  }
  const haptic = gamepad.hapticActuators && gamepad.hapticActuators[0]
  if (haptic && typeof haptic.pulse === 'function') {
    try {
      const magnitude = strong > weak ? strong : weak
      const result = haptic.pulse(magnitude > 1 ? 1 : magnitude, effect.duration)
      if (result && typeof result.catch === 'function') result.catch(() => {})
      return true
    } catch {
      return false
    }
  }
  return false
}

export function pulseGamepad(gamepad, kind, settings = null) {
  const resolved = settings || getHapticSettings(getGamepadStore())
  if (!resolved || resolved.enabled === false || !(resolved.intensity > 0)) return false
  return pulseGamepadHaptic(gamepad, kind, resolved.intensity)
}

export function pulseGamepadIndex(index, kind) {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return false
  const pads = navigator.getGamepads()
  return pulseGamepad(pads && pads[index], kind)
}
