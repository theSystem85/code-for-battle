// Delay helpers for "after" rules. A delay is stored as whole seconds.

export const MIN_AFTER_DELAY_SECONDS = 1
export const MAX_AFTER_DELAY_SECONDS = 3600
export const DEFAULT_AFTER_DELAY_SECONDS = 10

export function isValidDelaySeconds(value) {
  return Number.isInteger(value) && value >= MIN_AFTER_DELAY_SECONDS && value <= MAX_AFTER_DELAY_SECONDS
}

export function splitDelay(totalSeconds) {
  const total = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  return { minutes: Math.floor(total / 60), seconds: total % 60 }
}

export function joinDelay(minutes, seconds) {
  return Math.max(0, Math.floor(Number(minutes) || 0)) * 60 + Math.max(0, Math.floor(Number(seconds) || 0))
}

/** "10s", "2m", "1m 30s". */
export function formatDelay(totalSeconds) {
  const { minutes, seconds } = splitDelay(totalSeconds)
  if (minutes === 0) return `${seconds}s`
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
}
