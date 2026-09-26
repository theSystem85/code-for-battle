export const LONG_PRESS_MS = 500
export const LONG_PRESS_MOVE_CANCEL_PX = 12

export function createLongPressTracker(options = {}) {
  const holdMs = Number.isFinite(options.holdMs) ? options.holdMs : LONG_PRESS_MS
  const moveCancelPx = Number.isFinite(options.moveCancelPx) ? options.moveCancelPx : LONG_PRESS_MOVE_CANCEL_PX
  let state = null

  return {
    isTracking() {
      return Boolean(state) && !state.fired && !state.cancelled
    },
    pointerDown(point, time) {
      state = {
        x: point.x,
        y: point.y,
        time,
        fired: false,
        cancelled: false
      }
      return { action: 'track' }
    },
    pointerMove(point, time) {
      if (!state || state.fired || state.cancelled) return { action: 'idle' }
      const distance = Math.hypot(point.x - state.x, point.y - state.y)
      if (distance > moveCancelPx && time - state.time < holdMs) {
        state.cancelled = true
        return { action: 'cancel', reason: 'move' }
      }
      return { action: 'track' }
    },
    poll(time) {
      if (!state || state.cancelled) return { action: 'idle' }
      if (state.fired) return { action: 'fired', x: state.x, y: state.y }
      if (time - state.time >= holdMs) {
        state.fired = true
        return { action: 'fire', x: state.x, y: state.y }
      }
      return { action: 'track' }
    },
    pointerUp(point, time) {
      if (!state) return { action: 'idle' }
      const snapshot = state
      state = null
      if (snapshot.cancelled) return { action: 'cancelled' }
      if (snapshot.fired || time - snapshot.time >= holdMs) {
        return { action: 'release', x: point.x, y: point.y, originX: snapshot.x, originY: snapshot.y }
      }
      return { action: 'short', x: point.x, y: point.y, originX: snapshot.x, originY: snapshot.y }
    },
    cancel() {
      state = null
    }
  }
}
