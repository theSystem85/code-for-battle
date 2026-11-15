export const ACK_THROTTLE_MS = 900

let lastAckAt = 0

export function claimAckSlot(now) {
  if (now - lastAckAt < ACK_THROTTLE_MS) return false
  lastAckAt = now
  return true
}

export function resetAcknowledgementThrottle() {
  lastAckAt = 0
}
