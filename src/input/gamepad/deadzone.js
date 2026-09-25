export const STICK_DEADZONE = 0.18
export const TRIGGER_THRESHOLD = 0.4
export const BIND_THRESHOLD = 0.65

export function applyDeadzone(value, deadzone = STICK_DEADZONE) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || deadzone >= 1) return 0
  const magnitude = Math.abs(numeric)
  if (magnitude <= deadzone) return 0
  const scaled = (magnitude - deadzone) / (1 - deadzone)
  const clamped = scaled > 1 ? 1 : scaled
  return numeric < 0 ? -clamped : clamped
}

export function axisMagnitude(value, deadzone = STICK_DEADZONE) {
  return Math.abs(applyDeadzone(value, deadzone))
}
