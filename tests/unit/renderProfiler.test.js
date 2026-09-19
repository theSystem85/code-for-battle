import { describe, expect, it, vi } from 'vitest'
import { PROFILER_SPAN_IDS } from '../../src/performance/profilerIds.js'
import {
  FUNCTION_TIMINGS_STORAGE_KEY,
  RenderProfiler
} from '../../src/performance/renderProfiler.js'

function createStorage(initialValue = null) {
  const values = new Map()
  if (initialValue !== null) values.set(FUNCTION_TIMINGS_STORAGE_KEY, initialValue)
  return {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value))
  }
}

describe('RenderProfiler', () => {
  it('does no clock work or detailed allocation while disabled', () => {
    const now = vi.fn(() => 1)
    const profiler = new RenderProfiler({ now, storage: createStorage('false') })

    expect(profiler.startSpan(PROFILER_SPAN_IDS.UPDATE)).toBe(-1)
    profiler.endSpan(-1)
    profiler.beginFrame(10)
    profiler.endFrame()

    expect(now).not.toHaveBeenCalled()
    expect(profiler.getDebugState()).toMatchObject({ allocated: false, entryCount: 0, completedFrames: 0 })
  })

  it('accounts nested spans as additive self time and inclusive parent time', () => {
    let now = 0
    const profiler = new RenderProfiler({ now: () => now, storage: null, frameWindow: 4 })
    profiler.setEnabled(true, { persist: false })
    profiler.beginFrame(0)
    const parent = profiler.startSpan(PROFILER_SPAN_IDS.UPDATE)
    now += 2
    const child = profiler.startSpan(PROFILER_SPAN_IDS.RENDER)
    now += 3
    profiler.endSpan(child)
    now += 5
    profiler.endSpan(parent)
    profiler.recordFrameTiming(20)
    profiler.endFrame()

    const rows = profiler.getSnapshot().rows
    const update = rows.find(row => row.id === PROFILER_SPAN_IDS.UPDATE)
    const render = rows.find(row => row.id === PROFILER_SPAN_IDS.RENDER)
    expect(update).toMatchObject({ selfTotalMs: 7, inclusiveTotalMs: 10, calls: 1 })
    expect(render).toMatchObject({ selfTotalMs: 3, inclusiveTotalMs: 3, calls: 1 })
    expect(update.slowFrameCorrelation).toMatchObject({ overlapFrames: 1, slowFrames: 1, rate: 1 })
  })

  it('handles recursion without double-counting child time', () => {
    let now = 0
    const profiler = new RenderProfiler({ now: () => now, storage: null })
    profiler.setEnabled(true, { persist: false })
    profiler.beginFrame(0)
    const outer = profiler.startSpan(PROFILER_SPAN_IDS.UPDATE)
    now += 1
    const inner = profiler.startSpan(PROFILER_SPAN_IDS.UPDATE)
    now += 2
    profiler.endSpan(inner)
    now += 3
    profiler.endSpan(outer)
    profiler.recordFrameTiming(10)
    profiler.endFrame()

    const update = profiler.getSnapshot().rows.find(row => row.id === PROFILER_SPAN_IDS.UPDATE)
    expect(update).toMatchObject({ calls: 2, selfTotalMs: 6, inclusiveTotalMs: 8 })
  })

  it('bounds nesting, call samples, and frame samples', () => {
    let now = 0
    const profiler = new RenderProfiler({ now: () => now, storage: null, maxDepth: 2, frameWindow: 3, callWindow: 2 })
    profiler.setEnabled(true, { persist: false })

    for (let duration = 1; duration <= 5; duration++) {
      profiler.beginFrame(duration * 20)
      const first = profiler.startSpan(PROFILER_SPAN_IDS.UPDATE)
      const second = profiler.startSpan(PROFILER_SPAN_IDS.RENDER)
      const overflow = profiler.startSpan(PROFILER_SPAN_IDS.HUD)
      expect(overflow).toBe(-2)
      now += duration
      profiler.endSpan(overflow)
      profiler.endSpan(second)
      profiler.endSpan(first)
      profiler.recordFrameTiming(20)
      profiler.endFrame()
    }

    const snapshot = profiler.getSnapshot()
    const render = snapshot.rows.find(row => row.id === PROFILER_SPAN_IDS.RENDER)
    expect(snapshot.window.frames).toBe(3)
    expect(render.calls).toBe(5)
    expect(render.selfTotalMs).toBe(12)
    expect(render.callSelfMs).toMatchObject({ p95: 5, p99: 5, max: 5 })
    expect(profiler.getDebugState().depth).toBe(0)
    expect(snapshot.rows.some(row => row.id === PROFILER_SPAN_IDS.HUD)).toBe(false)
  })

  it('sorts by aggregate self cost and exports registered definitions', () => {
    let now = 0
    const profiler = new RenderProfiler({ now: () => now, storage: null })
    profiler.setEnabled(true, { persist: false })
    profiler.beginFrame(20)
    const update = profiler.startSpan(PROFILER_SPAN_IDS.UPDATE)
    now += 2
    profiler.endSpan(update)
    const render = profiler.startSpan(PROFILER_SPAN_IDS.RENDER)
    now += 5
    profiler.endSpan(render)
    profiler.recordFrameTiming(20)
    profiler.endFrame()

    expect(profiler.getSnapshot().rows.map(row => row.name)).toEqual(['RENDER', 'UPDATE'])
    expect(profiler.exportReport().definitions).toContainEqual({ id: PROFILER_SPAN_IDS.FRAME, name: 'FRAME' })
  })

  it('persists only the enabled preference', () => {
    const storage = createStorage('true')
    const profiler = new RenderProfiler({ storage })
    expect(profiler.isEnabled()).toBe(true)

    profiler.setEnabled(false)

    expect(storage.setItem).toHaveBeenCalledWith(FUNCTION_TIMINGS_STORAGE_KEY, 'false')
    expect(storage.setItem).toHaveBeenCalledTimes(1)
  })
})
