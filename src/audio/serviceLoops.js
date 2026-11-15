import { getSharedAudioContext, playPositionalSound } from '../sound.js'

let requested = false
let requestX = 0
let requestY = 0
let active = false
let handle = null
let token = 0

export function openRefuelPumpFrame() {
  requested = false
}

export function requestRefuelPump(x, y) {
  requested = true
  if (Number.isFinite(x)) requestX = x
  if (Number.isFinite(y)) requestY = y
}

function stopHandle(entry) {
  if (!entry?.source) return
  const context = getSharedAudioContext()
  const gain = entry.gainNode?.gain
  const now = context && context.state !== 'suspended' ? context.currentTime : null
  if (gain && now !== null && typeof gain.cancelScheduledValues === 'function') {
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(0, now + 0.2)
    try { entry.source.stop(now + 0.2) } catch { /* already stopped */ }
    return
  }
  try { entry.source.stop() } catch { /* already stopped */ }
}

export function closeRefuelPumpFrame() {
  if (!requested) {
    if (active) {
      active = false
      token++
      stopHandle(handle)
      handle = null
    }
    return
  }
  if (active && handle) return
  if (active) return
  active = true
  const myToken = ++token
  const x = requestX
  const y = requestY
  Promise.resolve(playPositionalSound('refuelPumpLoop', x, y, 0.35, 0, false, { playLoop: true })).then(next => {
    if (myToken !== token || !active) {
      stopHandle(next)
      return
    }
    handle = next
  }).catch(() => {
    if (myToken === token) active = false
  })
}

export function resetRefuelPumpForTests() {
  active = false
  requested = false
  token++
  stopHandle(handle)
  handle = null
}
