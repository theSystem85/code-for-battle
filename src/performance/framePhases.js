// Fixed-cost per-frame phase timings for the performance widget and the heavy-battle benchmark.
// A handful of performance.now() pairs per frame, written into preallocated rings. No per-frame
// objects, sorts, or DOM writes. The widget reads a snapshot at most once per second.

const PHASE_NAMES = Object.freeze([
  'sim',
  'movement',
  'combat',
  'pathfinding',
  'ai',
  'fog',
  'terrain',
  'entities',
  'effects',
  'ui',
  'minimap'
])

export const FRAME_PHASE = Object.freeze(Object.fromEntries(
  PHASE_NAMES.map((name, index) => [name, index])
))

export const FRAME_PHASE_NAMES = PHASE_NAMES

const PHASE_COUNT = PHASE_NAMES.length
const DEFAULT_WINDOW = 600

function defaultNow() {
  return performance.now()
}

function roundMs(value) {
  return Math.round(value * 100) / 100
}

export class FramePhaseTracker {
  constructor({ now = defaultNow, windowSize = DEFAULT_WINDOW } = {}) {
    this.now = now
    this.windowSize = Math.max(1, windowSize)
    this.samples = new Float64Array(PHASE_COUNT * this.windowSize)
    this.frameIntervals = new Float64Array(this.windowSize)
    this.drawCalls = new Float64Array(this.windowSize)
    this.scratch = new Float64Array(this.windowSize)
    this.current = new Float64Array(PHASE_COUNT)
    this.openAt = new Float64Array(PHASE_COUNT)
    this.openMask = new Uint8Array(PHASE_COUNT)
    this.cursor = 0
    this.filled = 0
    this.latestDrawCalls = 0
  }

  begin(phase) {
    if (phase < 0 || phase >= PHASE_COUNT || this.openMask[phase]) return
    this.openAt[phase] = this.now()
    this.openMask[phase] = 1
  }

  end(phase) {
    if (phase < 0 || phase >= PHASE_COUNT || !this.openMask[phase]) return 0
    const delta = Math.max(0, this.now() - this.openAt[phase])
    this.openMask[phase] = 0
    this.current[phase] += delta
    return delta
  }

  add(phase, milliseconds) {
    if (phase < 0 || phase >= PHASE_COUNT) return
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return
    this.current[phase] += milliseconds
  }

  noteDrawCalls(count) {
    this.latestDrawCalls = Number.isFinite(count) && count > 0 ? count : 0
  }

  finishFrame(frameIntervalMs = 0) {
    const base = this.cursor * PHASE_COUNT
    for (let phase = 0; phase < PHASE_COUNT; phase++) {
      if (this.openMask[phase]) this.end(phase)
      this.samples[base + phase] = this.current[phase]
      this.current[phase] = 0
    }
    this.frameIntervals[this.cursor] = Number.isFinite(frameIntervalMs) && frameIntervalMs > 0
      ? frameIntervalMs
      : 0
    this.drawCalls[this.cursor] = this.latestDrawCalls
    this.cursor = (this.cursor + 1) % this.windowSize
    if (this.filled < this.windowSize) this.filled += 1
  }

  reset() {
    this.samples.fill(0)
    this.frameIntervals.fill(0)
    this.drawCalls.fill(0)
    this.current.fill(0)
    this.openAt.fill(0)
    this.openMask.fill(0)
    this.cursor = 0
    this.filled = 0
    this.latestDrawCalls = 0
  }

  percentileFromScratch(count, percentileValue) {
    if (count <= 0) return 0
    this.scratch.subarray(0, count).sort()
    const index = Math.min(count - 1, Math.max(0, Math.ceil(count * percentileValue) - 1))
    return this.scratch[index]
  }

  summarizeColumn(readValue, percentileValue) {
    const count = this.filled
    if (!count) return { samples: 0, averageMs: 0, p95Ms: 0, maxMs: 0 }
    let total = 0
    let max = 0
    for (let index = 0; index < count; index++) {
      const slot = (this.cursor - count + index + this.windowSize) % this.windowSize
      const value = readValue(slot)
      this.scratch[index] = value
      total += value
      if (value > max) max = value
    }
    return {
      samples: count,
      averageMs: roundMs(total / count),
      p95Ms: roundMs(this.percentileFromScratch(count, percentileValue)),
      maxMs: roundMs(max)
    }
  }

  snapshot() {
    const phases = {}
    for (let phase = 0; phase < PHASE_COUNT; phase++) {
      phases[PHASE_NAMES[phase]] = this.summarizeColumn(
        slot => this.samples[slot * PHASE_COUNT + phase],
        0.95
      )
    }
    const frame = this.summarizeColumn(slot => this.frameIntervals[slot], 0.95)
    const draws = this.summarizeColumn(slot => this.drawCalls[slot], 0.95)
    const averageFrame = frame.averageMs
    return {
      samples: this.filled,
      frame: {
        averageMs: frame.averageMs,
        p95Ms: frame.p95Ms,
        maxMs: frame.maxMs,
        fps: averageFrame > 0 ? roundMs(1000 / averageFrame) : 0
      },
      drawCalls: {
        average: draws.averageMs,
        p95: draws.p95Ms,
        max: draws.maxMs
      },
      phases
    }
  }
}

export const framePhases = new FramePhaseTracker()

if (typeof window !== 'undefined') {
  window.__framePhases = framePhases
}
