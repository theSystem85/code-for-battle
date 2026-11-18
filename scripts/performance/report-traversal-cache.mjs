import { readFile } from 'node:fs/promises'

const [tracePath, resultPath] = process.argv.slice(2)
if (!tracePath || !resultPath) throw new Error('Usage: node scripts/performance/report-traversal-cache.mjs TRACE_JSON RESULT_JSON')
const [{ traceEvents }, result] = await Promise.all([
  readFile(tracePath, 'utf8').then(JSON.parse),
  readFile(resultPath, 'utf8').then(JSON.parse)
])
const start = traceEvents.find(event => event.name === 'cfb-benchmark-start' && event.cat?.includes('blink.user_timing'))
const end = traceEvents.find(event => event.name === 'cfb-benchmark-end' && event.pid === start?.pid && event.cat?.includes('blink.user_timing'))
const origin = start?.args?.data?.startTime
if (!start || !end || end.ts <= start.ts || !Number.isFinite(origin)) throw new Error('Missing marked renderer window')
const frames = [...new Set(traceEvents.filter(event => event.pid === start.pid && event.ph === 'e' &&
  event.name === 'SwapEndToPresentationCompositorFrame' && event.ts >= start.ts && event.ts < end.ts)
  .map(event => event.ts))].sort((a, b) => a - b)
if (frames.length < 2) throw new Error('Insufficient presentation feedback')
const samples = result.samples.filter(sample => Number.isFinite(sample.t) && sample.chunks)
const gaps = frames.slice(1).map((time, index) => ({ start: frames[index], end: time }))
  .sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, 10)
  .map(gap => {
    const startTime = origin + (gap.start - start.ts) / 1000
    const preceding = samples.filter(sample => sample.t <= startTime).at(-1)
    const ageMs = preceding ? startTime - preceding.t : null
    const sample = ageMs !== null && ageMs <= 1000 ? preceding : null
    const backpressure = traceEvents.filter(event => event.name === 'CALayerTreeCoordinator::ApplyBackpressure' &&
      event.ph === 'X' && event.ts < gap.end && event.ts + event.dur > gap.start)
      .map(event => Math.max(0, Math.min(gap.end, event.ts + event.dur) - Math.max(gap.start, event.ts)) / 1000)
    return {
      startSeconds: (gap.start - start.ts) / 1_000_000,
      durationMs: (gap.end - gap.start) / 1000,
      sampleAgeMs: sample ? ageMs : null,
      chunks: sample?.chunks || null,
      backpressureMaxOverlapMs: backpressure.length ? Math.max(...backpressure) : null
    }
  })
console.log(JSON.stringify({ correlation: 'nearest preceding sample within one second; temporal overlap does not establish causality', gaps }, null, 2))
