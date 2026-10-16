// Event-driven hold timer. No simulation/render-loop work or canvas rasterization.
export function createMapLongPressController({ duration, open, progress = () => {}, timers = globalThis }) {
  let press = null
  let timer = 0
  let feedback = 0
  let consumed = false
  function cancel() {
    timers.clearTimeout(timer)
    timers.clearTimeout(feedback)
    press = null
    progress(null)
  }
  return {
    down(point) {
      cancel()
      consumed = false
      press = point
      feedback = timers.setTimeout(() => { if (press) progress(press, duration() - 200) }, 200)
      timer = timers.setTimeout(() => {
        const origin = press
        if (!origin) return
        cancel()
        consumed = open(origin) !== false
      }, duration())
    },
    move(point) {
      if (press && Math.hypot(point.x - press.x, point.y - press.y) > (press.touch ? 12 : 8)) cancel()
    },
    up() {
      cancel()
      const result = consumed
      consumed = false
      return result
    },
    cancel,
    isTracking: () => Boolean(press)
  }
}
