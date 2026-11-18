import { readFile } from 'node:fs/promises'
import { summarizeFrameIntervals } from './benchmarkMetrics.js'

const tracePath = process.argv[2]
if (!tracePath) throw new Error('Usage: node scripts/performance/report-unit-heavy-presentation.mjs TRACE_JSON')

const { traceEvents } = JSON.parse(await readFile(tracePath, 'utf8'))
const hasMark = (event, label) => event.name === label && event.cat?.includes('blink.user_timing')
const start = traceEvents.find(event => hasMark(event, 'cfb-benchmark-start'))
const end = traceEvents.find(event => event.pid === start?.pid && hasMark(event, 'cfb-benchmark-end'))
if (!start || !end || end.ts <= start.ts) throw new Error('Trace is missing the game renderer measurement window')

const events = traceEvents.filter(event => event.ts >= start.ts && event.ts < end.ts)
const feedback = events.filter(event => event.pid === start.pid && event.ph === 'e' &&
  event.name === 'SwapEndToPresentationCompositorFrame')
// Chrome can record multiple compositor reporters for one presentation.
const frames = [...new Set(feedback.map(event => event.ts))].sort((a, b) => a - b)
if (frames.length < 2) throw new Error('Chrome recorded too few presentation feedback timestamps to calculate cadence')

const microsecondsPerSecond = 1_000_000
const durationSeconds = (end.ts - start.ts) / microsecondsPerSecond
const intervals = frames.slice(1).map((time, index) => (time - frames[index]) / 1000)
const { p95FrameMs, p99FrameMs, maxFrameMs, missedDeadlineFrames } = summarizeFrameIntervals(intervals)
let firstInWindow = 0
let minimumOneSecondFps = Infinity
// Count the frames in [time - 1 s, time) just before each feedback event and at capture end.
for (const [index, time] of [...frames, end.ts].entries()) {
  if (time - start.ts < microsecondsPerSecond) continue
  while (frames[firstInWindow] < time - microsecondsPerSecond) firstInWindow++
  minimumOneSecondFps = Math.min(minimumOneSecondFps, index - firstInWindow)
}

function spanTiming(name) {
  const durations = events.filter(event => event.name === name && event.ph === 'X').map(event => event.dur / 1000)
  return {
    count: durations.length,
    maxMs: durations.length ? Math.max(...durations) : null,
    totalMs: durations.reduce((sum, value) => sum + value, 0)
  }
}

console.log(JSON.stringify({
  durationSeconds, presentedFrames: frames.length,
  averagePresentedFps: frames.length / durationSeconds,
  minimumOneSecondFps, p95FrameMs, p99FrameMs, maxFrameMs, missedDeadlineFrames,
  swap: spanTiming('SkiaOutputSurfaceImplOnGpu::SwapBuffers'),
  backpressure: spanTiming('CALayerTreeCoordinator::ApplyBackpressure'),
  raster: spanTiming('RasterDecoderImpl::DoRasterCHROMIUM')
}, null, 2))
