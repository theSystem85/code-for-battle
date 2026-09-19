import { PROFILER_SPANS } from './profilerIds.js'

export const FUNCTION_TIMINGS_STORAGE_KEY = 'codeForBattle.functionTimingsEnabled'

const DEFAULT_FRAME_WINDOW = 300
const DEFAULT_CALL_WINDOW = 512
const DEFAULT_MAX_DEPTH = 64
const DEFAULT_MAX_LEGACY_SPANS = 128
const SLOW_FRAME_MS = 1000 / 75
const LEGACY_ID_START = 1000

function defaultNow() {
  return performance.now()
}

function getDefaultStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function readPreference(storage) {
  if (!storage) return false
  try {
    return storage.getItem(FUNCTION_TIMINGS_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function percentile(values, percentileValue) {
  if (!values.length) return 0
  values.sort((left, right) => left - right)
  const index = Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1)
  return values[index]
}

function ringValues(buffer, count) {
  const length = Math.min(count, buffer.length)
  const values = new Array(length)
  for (let index = 0; index < length; index++) values[index] = buffer[index]
  return values
}

function sumRing(buffer, count) {
  const length = Math.min(count, buffer.length)
  let total = 0
  for (let index = 0; index < length; index++) total += buffer[index]
  return total
}

function maxRing(buffer, count) {
  const length = Math.min(count, buffer.length)
  let maximum = 0
  for (let index = 0; index < length; index++) maximum = Math.max(maximum, buffer[index])
  return maximum
}

function createEntry(definition, frameWindow, callWindow) {
  return {
    id: definition.id,
    name: definition.name,
    calls: 0,
    callCount: 0,
    callCursor: 0,
    callSelf: new Float64Array(callWindow),
    callInclusive: new Float64Array(callWindow),
    currentSelf: 0,
    currentInclusive: 0,
    currentCalls: 0,
    frameCount: 0,
    frameCursor: 0,
    frameSelf: new Float64Array(frameWindow),
    frameInclusive: new Float64Array(frameWindow),
    frameIntervals: new Float64Array(frameWindow),
    frameCalls: new Uint32Array(frameWindow),
    slowFrames: new Uint8Array(frameWindow),
    slowOverlap: new Uint8Array(frameWindow)
  }
}

export class RenderProfiler {
  constructor({
    now = defaultNow,
    storage = getDefaultStorage(),
    frameWindow = DEFAULT_FRAME_WINDOW,
    callWindow = DEFAULT_CALL_WINDOW,
    maxDepth = DEFAULT_MAX_DEPTH,
    maxLegacySpans = DEFAULT_MAX_LEGACY_SPANS
  } = {}) {
    this.now = now
    this.storage = storage
    this.frameWindow = Math.max(1, frameWindow)
    this.callWindow = Math.max(1, callWindow)
    this.maxDepth = Math.max(1, maxDepth)
    this.maxLegacySpans = Math.max(0, maxLegacySpans)
    this.enabled = readPreference(storage)
    this.definitions = new Map(PROFILER_SPANS.map(definition => [definition.id, definition]))
    this.legacyIds = new Map()
    this.nextLegacyId = LEGACY_ID_START
    this.entries = new Map()
    this.listeners = new Set()
    this.stackIds = null
    this.stackStartedAt = null
    this.stackChildMs = null
    this.depth = 0
    this.overflowDepth = 0
    this.frameActive = false
    this.frameIntervalMs = 0
    this.lastFrameTimestamp = null
    this.completedFrames = 0
    this.frameIntervals = null
    if (this.enabled) this.allocateTimingState()
  }

  allocateTimingState() {
    if (this.stackIds) return
    this.stackIds = new Uint16Array(this.maxDepth)
    this.stackStartedAt = new Float64Array(this.maxDepth)
    this.stackChildMs = new Float64Array(this.maxDepth)
    this.frameIntervals = new Float64Array(this.frameWindow)
  }

  isEnabled() {
    return this.enabled
  }

  setEnabled(enabled, { persist = true } = {}) {
    const nextEnabled = Boolean(enabled)
    if (nextEnabled === this.enabled) return this.enabled
    this.enabled = nextEnabled
    this.depth = 0
    this.overflowDepth = 0
    this.frameActive = false
    this.frameIntervalMs = 0
    this.lastFrameTimestamp = null
    for (const entry of this.entries.values()) {
      entry.currentSelf = 0
      entry.currentInclusive = 0
      entry.currentCalls = 0
    }
    if (nextEnabled) this.allocateTimingState()
    if (persist && this.storage) {
      try {
        this.storage.setItem(FUNCTION_TIMINGS_STORAGE_KEY, String(nextEnabled))
      } catch {
        // Storage can be unavailable in private browsing or restricted embeds.
      }
    }
    for (const listener of this.listeners) listener(nextEnabled)
    return this.enabled
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {}
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  clearListenersForTests() {
    this.listeners.clear()
  }

  registerSpan(id, name) {
    if (!Number.isInteger(id) || id <= 0) throw new TypeError('Profiler span id must be a positive integer')
    const current = this.definitions.get(id)
    if (current && current.name !== name) throw new Error(`Profiler span id ${id} is already registered as ${current.name}`)
    if (!current) this.definitions.set(id, Object.freeze({ id, name: String(name) }))
    return id
  }

  registerLegacySpan(name) {
    const normalizedName = String(name || 'anonymous')
    const existing = this.legacyIds.get(normalizedName)
    if (existing) return existing
    if (this.legacyIds.size >= this.maxLegacySpans) return null
    const id = this.nextLegacyId++
    this.legacyIds.set(normalizedName, id)
    this.registerSpan(id, normalizedName)
    return id
  }

  getDefinitions() {
    return [...this.definitions.values()].sort((left, right) => left.id - right.id)
  }

  getEntry(id) {
    let entry = this.entries.get(id)
    if (entry) return entry
    const definition = this.definitions.get(id)
    if (!definition) return null
    entry = createEntry(definition, this.frameWindow, this.callWindow)
    this.entries.set(id, entry)
    return entry
  }

  beginFrame(timestamp) {
    if (!this.enabled) return false
    this.allocateTimingState()
    const numericTimestamp = Number.isFinite(timestamp) ? timestamp : null
    this.frameIntervalMs = numericTimestamp !== null && this.lastFrameTimestamp !== null
      ? Math.max(0, numericTimestamp - this.lastFrameTimestamp)
      : 0
    if (numericTimestamp !== null) this.lastFrameTimestamp = numericTimestamp
    this.frameActive = true
    return true
  }

  recordFrameTiming(frameIntervalMs) {
    if (!this.enabled || !this.frameActive || !Number.isFinite(frameIntervalMs)) return
    this.frameIntervalMs = Math.max(0, frameIntervalMs)
  }

  endFrame() {
    if (!this.enabled || !this.frameActive) return
    const frameIndex = this.completedFrames % this.frameWindow
    this.frameIntervals[frameIndex] = this.frameIntervalMs
    const slow = this.frameIntervalMs > SLOW_FRAME_MS
    for (const entry of this.entries.values()) {
      const entryFrameIndex = entry.frameCursor
      entry.frameSelf[entryFrameIndex] = entry.currentSelf
      entry.frameInclusive[entryFrameIndex] = entry.currentInclusive
      entry.frameIntervals[entryFrameIndex] = this.frameIntervalMs
      entry.frameCalls[entryFrameIndex] = entry.currentCalls
      entry.slowFrames[entryFrameIndex] = slow ? 1 : 0
      entry.slowOverlap[entryFrameIndex] = slow && entry.currentSelf > 0 ? 1 : 0
      entry.currentSelf = 0
      entry.currentInclusive = 0
      entry.currentCalls = 0
      entry.frameCount = Math.min(this.frameWindow, entry.frameCount + 1)
      entry.frameCursor = (entryFrameIndex + 1) % this.frameWindow
    }
    this.completedFrames++
    this.frameActive = false
  }

  startSpan(id) {
    if (!this.enabled) return -1
    if (this.overflowDepth > 0 || this.depth >= this.maxDepth) {
      this.overflowDepth++
      return -2
    }
    if (!this.definitions.has(id)) return -1
    const token = this.depth
    this.stackIds[token] = id
    this.stackChildMs[token] = 0
    this.stackStartedAt[token] = this.now()
    this.depth++
    return token
  }

  endSpan(token) {
    if (!this.enabled || token === -1) return 0
    if (token === -2) {
      if (this.overflowDepth > 0) this.overflowDepth--
      return 0
    }
    if (token !== this.depth - 1) return 0
    const endedAt = this.now()
    const inclusiveMs = Math.max(0, endedAt - this.stackStartedAt[token])
    const selfMs = Math.max(0, inclusiveMs - this.stackChildMs[token])
    const id = this.stackIds[token]
    this.depth--
    if (this.depth > 0) this.stackChildMs[this.depth - 1] += inclusiveMs

    const entry = this.getEntry(id)
    if (!entry) return inclusiveMs
    entry.calls++
    entry.currentInclusive += inclusiveMs
    entry.currentSelf += selfMs
    entry.currentCalls++
    const callIndex = entry.callCursor
    entry.callSelf[callIndex] = selfMs
    entry.callInclusive[callIndex] = inclusiveMs
    entry.callCursor = (callIndex + 1) % this.callWindow
    entry.callCount = Math.min(this.callWindow, entry.callCount + 1)
    return inclusiveMs
  }

  reset() {
    this.entries.clear()
    this.depth = 0
    this.overflowDepth = 0
    this.frameActive = false
    this.frameIntervalMs = 0
    this.lastFrameTimestamp = null
    this.completedFrames = 0
    if (this.frameIntervals) this.frameIntervals.fill(0)
  }

  getSnapshot({ sortBy = 'selfTotalMs', limit = 30 } = {}) {
    const frameCount = Math.min(this.completedFrames, this.frameWindow)
    const intervalTotal = this.frameIntervals ? sumRing(this.frameIntervals, frameCount) : 0
    const rows = []

    for (const entry of this.entries.values()) {
      const populatedFrames = Math.min(entry.frameCount, frameCount)
      const selfFrameTotal = sumRing(entry.frameSelf, populatedFrames)
      const inclusiveFrameTotal = sumRing(entry.frameInclusive, populatedFrames)
      const entryIntervalTotal = sumRing(entry.frameIntervals, populatedFrames)
      const durationSeconds = entryIntervalTotal > 0 ? entryIntervalTotal / 1000 : 0
      const callsInFrames = sumRing(entry.frameCalls, populatedFrames)
      const callSelf = ringValues(entry.callSelf, entry.callCount)
      const callInclusive = ringValues(entry.callInclusive, entry.callCount)
      const frameSelf = ringValues(entry.frameSelf, populatedFrames)
      const slowFrames = sumRing(entry.slowFrames, populatedFrames)
      const overlapFrames = sumRing(entry.slowOverlap, populatedFrames)
      const denominatorFrames = Math.max(1, populatedFrames)
      const selfMsPerFrame = selfFrameTotal / denominatorFrames

      rows.push({
        id: entry.id,
        name: entry.name,
        calls: entry.calls,
        selfTotalMs: round(selfFrameTotal),
        inclusiveTotalMs: round(inclusiveFrameTotal),
        selfMsPerSecond: round(durationSeconds > 0 ? selfFrameTotal / durationSeconds : 0),
        selfMsPerFrame: round(selfMsPerFrame),
        inclusiveMsPerFrame: round(inclusiveFrameTotal / denominatorFrames),
        callsPerFrame: round(callsInFrames / denominatorFrames),
        meanSelfMsPerCall: round(callsInFrames > 0 ? selfFrameTotal / callsInFrames : 0),
        callSelfMs: {
          p95: round(percentile([...callSelf], 0.95)),
          p99: round(percentile([...callSelf], 0.99)),
          max: round(maxRing(entry.callSelf, entry.callCount))
        },
        callInclusiveMs: {
          p95: round(percentile([...callInclusive], 0.95)),
          p99: round(percentile([...callInclusive], 0.99)),
          max: round(maxRing(entry.callInclusive, entry.callCount))
        },
        frameSelfMs: {
          p95: round(percentile([...frameSelf], 0.95)),
          p99: round(percentile([...frameSelf], 0.99)),
          max: round(maxRing(entry.frameSelf, populatedFrames))
        },
        cpuBudgetPercent: round((selfMsPerFrame / SLOW_FRAME_MS) * 100, 2),
        slowFrameCorrelation: {
          overlapFrames,
          slowFrames,
          rate: round(slowFrames > 0 ? overlapFrames / slowFrames : 0)
        }
      })
    }

    rows.sort((left, right) => {
      if (sortBy === 'name') return left.name.localeCompare(right.name)
      return (right[sortBy] || 0) - (left[sortBy] || 0)
    })
    return {
      enabled: this.enabled,
      window: { frames: frameCount, milliseconds: round(intervalTotal), callSamplesPerSpan: this.callWindow },
      slowFrameThresholdMs: round(SLOW_FRAME_MS),
      rows: rows.slice(0, Math.max(0, limit))
    }
  }

  exportReport() {
    return {
      ...this.getSnapshot({ limit: this.definitions.size }),
      definitions: this.getDefinitions()
    }
  }

  getDebugState() {
    return {
      allocated: Boolean(this.stackIds),
      entryCount: this.entries.size,
      depth: this.depth,
      completedFrames: this.completedFrames
    }
  }
}

export function measureProfilerOverhead({ iterations = 20000, spansPerFrame = 3 } = {}) {
  const safeIterations = Math.max(1, Math.floor(iterations))
  const safeSpansPerFrame = Math.max(1, Math.floor(spansPerFrame))
  const measure = (enabled) => {
    const profiler = new RenderProfiler({ storage: null, frameWindow: 1, callWindow: 1 })
    profiler.setEnabled(enabled, { persist: false })
    const startedAt = performance.now()
    for (let index = 0; index < safeIterations; index++) {
      profiler.beginFrame(index * 16)
      for (let span = 0; span < safeSpansPerFrame; span++) {
        const token = profiler.startSpan(PROFILER_SPANS[span % PROFILER_SPANS.length].id)
        profiler.endSpan(token)
      }
      profiler.recordFrameTiming(16)
      profiler.endFrame()
    }
    return performance.now() - startedAt
  }
  const disabledTotalMs = measure(false)
  const enabledTotalMs = measure(true)
  const enabledAddedMsPerFrame = Math.max(0, enabledTotalMs - disabledTotalMs) / safeIterations
  return {
    iterations: safeIterations,
    spansPerFrame: safeSpansPerFrame,
    disabledTotalMs: round(disabledTotalMs),
    enabledTotalMs: round(enabledTotalMs),
    enabledAddedMsPerFrame: round(enabledAddedMsPerFrame, 6),
    budgetMsPerFrame: 0.25,
    withinBudget: enabledAddedMsPerFrame <= 0.25
  }
}

export const renderProfiler = new RenderProfiler()
