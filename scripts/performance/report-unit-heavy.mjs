import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FRAME_DEADLINE_MS, percentile } from './benchmarkMetrics.js'

const [beforeDir, afterDir] = process.argv.slice(2)
if (!beforeDir || !afterDir) throw new Error('Usage: node scripts/performance/report-unit-heavy.mjs BEFORE_DIR AFTER_DIR')
const captures = await Promise.all([beforeDir, afterDir].map(async dir =>
  JSON.parse(await readFile(join(dir, 'result.json'), 'utf8'))))
const [before, after] = captures
const a = before.summary
const b = after.summary
const backend = summary => summary.backend?.backend || summary.backend
if (a.startUnits !== b.startUnits || a.routeLaps !== b.routeLaps || a.browserDpr !== b.browserDpr ||
    String(a.canvas) !== String(b.canvas) || backend(a) !== backend(b) || before.profileEnabled !== after.profileEnabled) {
  throw new Error('Capture settings differ. Compare like-for-like runs.')
}

const value = number => Number.isFinite(number) ? number.toFixed(2) : 'Unavailable'
const row = (label, read) => {
  const [first, second] = captures.map(read)
  const change = first && Number.isFinite(second) ? ((second / first - 1) * 100).toFixed(2) + '%' : '—'
  return `| ${label} | ${value(first)} | ${value(second)} | ${change} |`
}
const avg = key => capture => capture.summary[key]
const sample = (key, unit = 1) => capture => {
  const values = capture.samples.map(frame => frame[key] / unit).filter(Number.isFinite)
  return values.length ? percentile(values, 0.95) : NaN
}

console.log(`Both captures used headed Chrome ${before.browser}, hardware ${before.gpu.devices[0].deviceString}, ${backend(a)} terrain, DPR ${a.browserDpr}, and a ${a.canvas[2]}×${a.canvas[3]} CSS-pixel viewport. The route covered ${a.routeLaps.toFixed(2)} laps from a ${a.startUnits}-unit save. V8 sampling was ${before.profileEnabled ? 'enabled' : 'disabled'} for both runs. Minimum FPS is the worst trailing one-second callback count.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
${[
  row('Average FPS', avg('averageFps')),
  row('Minimum FPS (1 s)', avg('minimumOneSecondFps')),
  row('Frame p95 (ms)', avg('p95Ms')),
  row('Frame p99 (ms)', avg('p99Ms')),
  row('Frame max (ms)', avg('maxMs')),
  row('Intervals above 1000/60 ms', capture => capture.intervals.filter(ms => ms > FRAME_DEADLINE_MS).length),
  row('Mean CPU update (ms)', avg('averageUpdateMs')),
  row('Mean CPU render (ms)', avg('averageRenderMs')),
  row('Terrain GPU p95 (ms)', sample('gpu')),
  row('JS heap p95 (MiB)', sample('heap', 1048576)),
  row('Long tasks', capture => capture.longTasks.length),
  row('Save readiness (ms)', avg('preparationMs')),
  row('Surviving units', avg('endUnits'))
].join('\n')}

Browser page errors were ${a.errors.length} before and ${b.errors.length} after. Raw deadline counts include callback timestamp jitter. These are browser callback measurements for this fixture. Physical presented-frame acceptance needs separate evidence.`)
