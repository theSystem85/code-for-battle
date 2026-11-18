import { readFile } from 'node:fs/promises'

const [tracePath, resultPath] = process.argv.slice(2)
if (!tracePath || !resultPath) {
  throw new Error('Usage: node scripts/performance/report-unit-heavy-gaps.mjs TRACE_JSON RESULT_JSON')
}

const [{ traceEvents }, result] = await Promise.all([
  readFile(tracePath, 'utf8').then(JSON.parse),
  readFile(resultPath, 'utf8').then(JSON.parse)
])
const start = traceEvents.find(event => event.name === 'cfb-benchmark-start' && event.cat?.includes('blink.user_timing'))
const end = traceEvents.find(event => event.name === 'cfb-benchmark-end' && event.pid === start?.pid && event.cat?.includes('blink.user_timing'))
const origin = start?.args?.data?.startTime
if (!start || !end || end.ts <= start.ts || !Number.isFinite(origin)) {
  throw new Error('Trace is missing the marked renderer window or its performance clock')
}

const presentations = [...new Set(traceEvents
  .filter(event => event.pid === start.pid && event.name === 'SwapEndToPresentationCompositorFrame' &&
    event.ph === 'e' && event.ts >= start.ts && event.ts < end.ts)
  .map(event => event.ts))].sort((a, b) => a - b)
if (presentations.length < 2) throw new Error('Trace has insufficient presentation feedback')

const trackedNames = [
  'ProxyMain::BeginMainFrame',
  'SkiaOutputSurfaceImplOnGpu::SwapBuffers',
  'CALayerTreeCoordinator::ApplyBackpressure'
]
const spans = traceEvents.filter(event => trackedNames.includes(event.name) && event.ph === 'X' &&
  Number.isFinite(event.dur) && event.ts < end.ts && event.ts + event.dur > start.ts)
const frames = (result.cpuFrames || []).filter(frame => Number.isFinite(frame.t))
const intervals = presentations.slice(1).map((time, index) => ({
  start: presentations[index],
  end: time,
  durationMs: (time - presentations[index]) / 1000,
  precedingIntervalMs: index ? (presentations[index] - presentations[index - 1]) / 1000 : null,
  followingIntervalMs: presentations[index + 2] ? (presentations[index + 2] - time) / 1000 : null
}))

const gaps = intervals.sort((a, b) => b.durationMs - a.durationMs).slice(0, 10).map(interval => {
  const startMs = origin + (interval.start - start.ts) / 1000
  const endMs = origin + (interval.end - start.ts) / 1000
  const gameFrames = frames.filter(frame => frame.t >= startMs && frame.t < endMs)
  const overlaps = Object.fromEntries(trackedNames.map(name => {
    const durations = spans.filter(event => event.name === name)
      .map(event => Math.max(0, Math.min(interval.end, event.ts + event.dur) - Math.max(interval.start, event.ts)) / 1000)
      .filter(duration => duration > 0)
    return [name, { count: durations.length, longestOverlapMs: durations.length ? Math.max(...durations) : null }]
  }))
  return {
    startSeconds: (interval.start - start.ts) / 1_000_000,
    durationMs: interval.durationMs,
    precedingIntervalMs: interval.precedingIntervalMs,
    followingIntervalMs: interval.followingIntervalMs,
    gameFrameCount: gameFrames.length,
    maxUpdateMs: gameFrames.length ? Math.max(...gameFrames.map(frame => frame.updateMs || 0)) : null,
    maxRenderMs: gameFrames.length ? Math.max(...gameFrames.map(frame => frame.renderMs || 0)) : null,
    simulationDeltaMs: gameFrames.reduce((sum, frame) => sum + (frame.simulationDeltaMs || 0), 0),
    overlaps
  }
})

console.log(JSON.stringify({
  rendererPid: start.pid,
  presentCount: presentations.length,
  clockAlignment: 'performance.mark startTime mapped to trace timestamp',
  correlation: 'time overlap only; compositor spans are not matched to game frame IDs',
  missing: ['game scheduler source', 'game frame IDs', 'compositor frame IDs'],
  gaps
}, null, 2))
