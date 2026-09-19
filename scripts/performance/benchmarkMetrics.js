export const FRAME_DEADLINE_MS = 1000 / 75

function sorted(values) {
  return [...values].filter(Number.isFinite).sort((left, right) => left - right)
}

export function percentile(values, percentileValue) {
  const ordered = sorted(values)
  if (!ordered.length) return 0
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * percentileValue) - 1))
  return ordered[index]
}

export function summarizeFrameIntervals(intervals, deadlineMs = FRAME_DEADLINE_MS) {
  const usable = intervals.filter(value => Number.isFinite(value) && value > 0)
  const totalMs = usable.reduce((sum, value) => sum + value, 0)
  const missed = usable.filter(value => value > deadlineMs)
  return {
    frameCount: usable.length,
    durationMs: totalMs,
    fps: totalMs > 0 ? usable.length * 1000 / totalMs : 0,
    meanFrameMs: usable.length ? totalMs / usable.length : 0,
    p95FrameMs: percentile(usable, 0.95),
    p99FrameMs: percentile(usable, 0.99),
    maxFrameMs: usable.length ? Math.max(...usable) : 0,
    deadlineMs,
    missedDeadlineFrames: missed.length,
    missedDeadlineRatio: usable.length ? missed.length / usable.length : 0,
    passed75Fps: usable.length > 0 && missed.length === 0
  }
}

export function createTimedRoute({ width, height, viewportWidth, viewportHeight, laps = 1 } = {}) {
  const maxX = Math.max(0, width - viewportWidth)
  const maxY = Math.max(0, height - viewportHeight)
  const bandStep = Math.max(1, Math.floor(viewportHeight * 0.72))
  const base = [{ x: 0, y: 0 }]
  let y = 0
  let rightward = true
  while (y < maxY) {
    base.push({ x: rightward ? maxX : 0, y })
    y = Math.min(maxY, y + bandStep)
    base.push({ x: rightward ? maxX : 0, y })
    rightward = !rightward
  }
  base.push({ x: rightward ? maxX : 0, y: maxY })

  const route = [base[0]]
  for (let lap = 0; lap < Math.max(1, Math.floor(laps)); lap++) {
    route.push(...(lap % 2 === 0 ? base.slice(1) : [...base].reverse().slice(1)))
  }
  return route
}

export function routeDistance(route) {
  let distance = 0
  for (let index = 1; index < route.length; index++) {
    distance += Math.hypot(route[index].x - route[index - 1].x, route[index].y - route[index - 1].y)
  }
  return distance
}

export function classifyRefreshCapability({ refreshRateHz, observedFrameRate, backend = 'unknown', headless = false } = {}) {
  const refreshKnown = Number.isFinite(refreshRateHz) && refreshRateHz > 0
  const backendLabel = backend === 'software' || backend === 'cpu' ? 'software-fallback' : backend
  const backendEligible = !['unknown', 'software-fallback', 'cpu'].includes(backendLabel)
  const displayEligible = refreshKnown && refreshRateHz >= 75 && !headless && backendEligible
  return {
    backend: backendLabel,
    refreshRateHz: refreshKnown ? refreshRateHz : null,
    observedFrameRate: Number.isFinite(observedFrameRate) ? observedFrameRate : null,
    displayEligible,
    certification: displayEligible ? 'eligible-for-physical-certification' : 'diagnostic-only',
    reason: displayEligible
      ? null
      : headless
        ? 'headless-run-cannot-certify-presented-fps'
        : !backendEligible
          ? 'software-or-unknown-backend'
          : !refreshKnown
          ? 'refresh-rate-unavailable'
          : 'display-refresh-below-75hz'
  }
}
