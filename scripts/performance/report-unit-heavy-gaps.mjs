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
  'CALayerTreeCoordinator::ApplyBackpressure',
  'IOSurfaceImageBacking::WaitForCommandsToBeScheduled::Dawn',
  'RasterDecoderImpl::DoRasterCHROMIUM'
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

function assetsDuring(startMs, endMs, gameFrames) {
  const { textureUploads, spriteRequests } = result.assetTrace || {}
  if (!textureUploads || !spriteRequests) return undefined
  const previousFrame = frames.findLast(frame => frame.t < startMs)
  const lastFrame = gameFrames.at(-1)
  const firstBytes = previousFrame?.terrainUploadBytes
  const lastBytes = lastFrame?.terrainUploadBytes
  const overlaps = event => event.startMs < endMs && event.endMs >= startMs
  return {
    textureUploads: textureUploads.filter(overlaps).length,
    spriteRequests: spriteRequests.filter(overlaps).length,
    chunkMisses: gameFrames.reduce((sum, frame) => sum + (frame.chunkMisses ?? 0), 0),
    chunksEvicted: gameFrames.reduce((sum, frame) => sum + (frame.chunksEvicted ?? 0), 0),
    chunksWarmed: gameFrames.reduce((sum, frame) => sum + (frame.chunksWarmed ?? 0), 0),
    terrainUploadBytes: Number.isFinite(firstBytes) && Number.isFinite(lastBytes) && lastBytes >= firstBytes
      ? lastBytes - firstBytes : null
  }
}

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
  const mainFrames = spans.filter(event => event.pid === start.pid && event.tid === start.tid &&
    event.name === 'ProxyMain::BeginMainFrame' && event.ts < interval.end && event.ts + event.dur > interval.start)
    .map(event => ({
      beginFrameId: event.args?.begin_frame_id ?? null,
      mainFrameId: Number.isSafeInteger(event.args?.main_frame_pipeline?.main_frame_id) ? event.args.main_frame_pipeline.main_frame_id : null,
      gameReports: gameFrames.filter(frame => {
        const timestamp = start.ts + (frame.t - origin) * 1000
        return timestamp >= event.ts && timestamp < event.ts + event.dur
      }).length
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
    schedulerSources: [...new Set(gameFrames.map(frame => frame.schedulerSource).filter(Boolean))],
    maxSchedulerDelayMs: gameFrames.some(frame => Number.isFinite(frame.schedulerDelayMs)) ? Math.max(...gameFrames.map(frame => frame.schedulerDelayMs).filter(Number.isFinite)) : null,
    mainFrames,
    assets: assetsDuring(startMs, endMs, gameFrames),
    overlaps
  }
})

const endClockMs = origin + (end.ts - start.ts) / 1000
console.log(JSON.stringify({
  rendererPid: start.pid,
  presentCount: presentations.length,
  clockAlignment: 'performance.mark startTime mapped to trace timestamp',
  correlation: 'time overlap only; compositor spans are not matched to game frame IDs',
  missing: ['shared game-to-compositor frame IDs'],
  captureAssets: assetsDuring(origin, endClockMs, frames.filter(frame => frame.t >= origin && frame.t < endClockMs)),
  gaps
}, null, 2))
