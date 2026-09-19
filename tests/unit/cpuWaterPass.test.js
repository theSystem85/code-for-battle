import { describe, expect, it, vi } from 'vitest'
import { CpuWaterPass } from '../../src/rendering/prepared/cpuWaterPass.js'

function createContext() {
  const state = [{ alpha: 1, fillStyle: '' }]
  return {
    calls: [],
    globalAlpha: 1,
    fillStyle: '',
    imageSmoothingEnabled: true,
    save() {
      state.push({ alpha: this.globalAlpha, fillStyle: this.fillStyle })
      this.calls.push(['save'])
    },
    restore() {
      const restored = state.pop()
      this.globalAlpha = restored.alpha
      this.fillStyle = restored.fillStyle
      this.calls.push(['restore'])
    },
    fillRect(x, y, width, height) {
      this.calls.push(['fillRect', x, y, width, height, this.fillStyle, this.globalAlpha])
    },
    beginPath() { this.calls.push(['beginPath']) },
    moveTo(x, y) { this.calls.push(['moveTo', x, y]) },
    lineTo(x, y) { this.calls.push(['lineTo', x, y]) },
    closePath() { this.calls.push(['closePath']) },
    clip() { this.calls.push(['clip']) }
  }
}

const profiler = {
  startSpan: vi.fn(() => -1),
  endSpan: vi.fn(),
  isEnabled: vi.fn(() => false)
}

const diagnostics = {
  addCounter: vi.fn()
}

describe('CpuWaterPass', () => {
  it('retains visible runs, palette, coefficients and buffers on animation-only frames', () => {
    const map = [
      [{ type: 'water' }, { type: 'land' }, { type: 'street' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'water' }]
    ]
    const sotMask = [
      [null, { type: 'water', orientation: 'top-left' }, { type: 'water', orientation: 'top-right' }],
      [null, null, null]
    ]
    const pass = new CpuWaterPass({ now: () => 123, profiler, diagnostics })
    const firstContext = createContext()
    pass.render(firstContext, {
      mapGrid: map,
      sotMask,
      topologyRevision: 4,
      scrollOffset: { x: 0, y: 0 },
      startX: 0,
      startY: 0,
      endX: 3,
      endY: 2,
      time: 1000
    })
    const first = pass.getStatus()
    const runBuffer = first.runBuffer
    const sotBuffer = first.sotBuffer
    const palette = first.palette
    const coefficients = first.coefficients
    const firstCalls = firstContext.calls.map(call => [...call])

    const secondContext = createContext()
    pass.render(secondContext, {
      mapGrid: map,
      sotMask,
      topologyRevision: 4,
      scrollOffset: { x: 3, y: 2 },
      startX: 0,
      startY: 0,
      endX: 3,
      endY: 2,
      time: 2000
    })
    const second = pass.getStatus()

    expect(second.runBuffer).toBe(runBuffer)
    expect(second.sotBuffer).toBe(sotBuffer)
    expect(second.palette).toBe(palette)
    expect(second.coefficients).toBe(coefficients)
    expect(second.stats.visibleRunBuilds).toBe(1)
    expect(second.stats.paletteBuilds).toBe(1)
    expect(second.stats.sampledTime).toBe(2000)
    expect(secondContext.calls).not.toEqual(firstCalls)
    expect(second.sotCount).toBe(1)
  })

  it('rebuilds retained coverage on tile-boundary camera changes and topology revisions', () => {
    const map = [[
      { type: 'water' },
      { type: 'land' },
      { type: 'water' },
      { type: 'water' }
    ]]
    const pass = new CpuWaterPass({ profiler, diagnostics })
    const runs = pass.runs

    pass.render(createContext(), {
      mapGrid: map,
      sotMask: [[]],
      topologyRevision: 1,
      scrollOffset: { x: 0, y: 0 },
      startX: 0,
      startY: 0,
      endX: 2,
      endY: 1,
      time: 0
    })
    pass.render(createContext(), {
      mapGrid: map,
      sotMask: [[]],
      topologyRevision: 1,
      scrollOffset: { x: 20, y: 0 },
      startX: 1,
      startY: 0,
      endX: 4,
      endY: 1,
      time: 500
    })
    map[0][1].type = 'water'
    pass.render(createContext(), {
      mapGrid: map,
      sotMask: [[]],
      topologyRevision: 2,
      scrollOffset: { x: 20, y: 0 },
      startX: 1,
      startY: 0,
      endX: 4,
      endY: 1,
      time: 1000
    })

    const status = pass.getStatus()
    expect(status.runBuffer).toBe(runs)
    expect(status.stats.visibleRunBuilds).toBe(3)
    expect(status.stats.topologyBuilds).toBe(2)
    expect(status.runCount).toBe(1)
  })

  it.each([
    [0, { x: 0, y: 0 }],
    [777, { x: 7, y: 11 }],
    [2100, { x: 20, y: 0 }]
  ])('preserves water phase and edge/SOT coverage at time %s', (time, scrollOffset) => {
    const map = [
      [{ type: 'water' }, { type: 'land' }],
      [{ type: 'water' }, { type: 'water' }]
    ]
    const sotMask = [
      [null, { type: 'water', orientation: 'top-left' }],
      [null, null]
    ]
    const pass = new CpuWaterPass({ profiler, diagnostics })
    const context = createContext()

    pass.render(context, {
      mapGrid: map,
      sotMask,
      topologyRevision: 9,
      scrollOffset,
      startX: 0,
      startY: 0,
      endX: 2,
      endY: 2,
      time
    })

    const status = pass.getStatus()
    expect(status.sampledTime).toBeUndefined()
    expect(status.stats.sampledTime).toBe(time)
    expect(status.runCount).toBe(2)
    expect(status.sotCount).toBe(1)
    expect(context.calls.some(call => call[0] === 'clip')).toBe(true)
    expect(context.calls.filter(call => call[0] === 'fillRect')).toHaveLength(44)
  })
})
