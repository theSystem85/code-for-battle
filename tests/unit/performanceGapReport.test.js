import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

describe('presentation gap report', () => {
  const directories = []
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  })

  function run(events, frames = []) {
    const directory = mkdtempSync(join(tmpdir(), 'cfb-gap-report-'))
    directories.push(directory)
    const trace = join(directory, 'trace.json')
    const result = join(directory, 'result.json')
    writeFileSync(trace, JSON.stringify({ traceEvents: events }))
    writeFileSync(result, JSON.stringify({ cpuFrames: frames }))
    return execFileSync(process.execPath, ['scripts/performance/report-unit-heavy-gaps.mjs', trace, result], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  }

  const start = { name: 'cfb-benchmark-start', cat: 'blink.user_timing', pid: 1, ts: 1000000, args: { data: { startTime: 100 } } }
  const end = { name: 'cfb-benchmark-end', cat: 'blink.user_timing', pid: 1, ts: 4000000 }
  const feedback = (pid, ts) => ({ name: 'SwapEndToPresentationCompositorFrame', ph: 'e', pid, ts })

  it('[U07211] deduplicates feedback and aligns game frames to the marked renderer', () => {
    const events = [start, end, feedback(1, 1500000), feedback(1, 1500000), feedback(2, 1700000), feedback(1, 2500000),
      { name: 'CALayerTreeCoordinator::ApplyBackpressure', ph: 'X', ts: 1600000, dur: 500000 }]
    const report = JSON.parse(run(events, [{ t: 700, updateMs: 20, renderMs: 3, simulationDeltaMs: 50 }]))
    expect(report.presentCount).toBe(2)
    expect(report.gaps[0].durationMs).toBe(1000)
    expect(report.gaps[0].gameFrameCount).toBe(1)
    expect(report.gaps[0].overlaps['CALayerTreeCoordinator::ApplyBackpressure'].longestOverlapMs).toBe(500)
    expect(report.gaps[0].overlaps['ProxyMain::BeginMainFrame'].longestOverlapMs).toBeNull()
  })

  it('[U07212] rejects missing marks and insufficient presentation data', () => {
    expect(() => run([start])).toThrow()
    expect(() => run([start, end, feedback(1, 1500000)])).toThrow()
  })
})
