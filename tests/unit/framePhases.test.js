import { describe, expect, it } from 'vitest'
import { FRAME_PHASE, FramePhaseTracker } from '../../src/performance/framePhases.js'

describe('frame phase tracker', () => {
  it('records average and p95 without allocating per frame', () => {
    let clock = 0
    const tracker = new FramePhaseTracker({
      now: () => clock,
      windowSize: 8
    })

    for (let frame = 1; frame <= 5; frame++) {
      clock = frame * 10
      tracker.begin(FRAME_PHASE.sim)
      clock += frame
      tracker.end(FRAME_PHASE.sim)
      tracker.noteDrawCalls(frame * 2)
      tracker.finishFrame(10 + frame)
    }

    const snapshot = tracker.snapshot()
    expect(snapshot.samples).toBe(5)
    expect(snapshot.phases.sim.averageMs).toBe(3)
    expect(snapshot.phases.sim.p95Ms).toBe(5)
    expect(snapshot.phases.sim.maxMs).toBe(5)
    expect(snapshot.frame.averageMs).toBe(13)
    expect(snapshot.frame.fps).toBeCloseTo(1000 / 13, 1)
    expect(snapshot.drawCalls.average).toBe(6)
    expect(tracker.samples).toBeInstanceOf(Float64Array)
  })

  it('accumulates split spans and closes a span left open at frame end', () => {
    let clock = 0
    const tracker = new FramePhaseTracker({ now: () => clock, windowSize: 4 })
    tracker.begin(FRAME_PHASE.entities)
    clock = 2
    tracker.end(FRAME_PHASE.entities)
    tracker.begin(FRAME_PHASE.entities)
    clock = 5
    tracker.finishFrame(16)

    const snapshot = tracker.snapshot()
    expect(snapshot.phases.entities.averageMs).toBe(5)
    expect(tracker.openMask[FRAME_PHASE.entities]).toBe(0)
  })

  it('resets the ring', () => {
    let clock = 0
    const tracker = new FramePhaseTracker({ now: () => clock, windowSize: 4 })
    tracker.begin(FRAME_PHASE.effects)
    clock = 4
    tracker.end(FRAME_PHASE.effects)
    tracker.finishFrame(20)
    tracker.reset()
    expect(tracker.snapshot().samples).toBe(0)
    expect(tracker.snapshot().phases.effects.averageMs).toBe(0)
  })
})
