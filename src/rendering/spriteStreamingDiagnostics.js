import { SPRITE_TIER_NAMES } from './spriteStreamingGeometry.js'
import { PROFILER_SPAN_IDS } from '../performance/profilerIds.js'

export const SPRITE_STREAMING_STAGES = Object.freeze([
  'sheet-load', 'sheet-decode', 'sheet-key', 'sheet-cutout', 'sheet-catalog',
  'rotation-generation', 'queue-wait', 'bitmap-creation', 'bitmap-publication',
  'chunk-rebuild', 'chunk-upload'
])

export const SPRITE_STREAMING_STAGE_SPAN_IDS = Object.freeze([
  PROFILER_SPAN_IDS.SPRITE_SHEET_LOAD,
  PROFILER_SPAN_IDS.SPRITE_SHEET_DECODE,
  PROFILER_SPAN_IDS.SPRITE_SHEET_KEY,
  PROFILER_SPAN_IDS.SPRITE_SHEET_CUTOUT,
  PROFILER_SPAN_IDS.SPRITE_SHEET_CATALOG,
  PROFILER_SPAN_IDS.SPRITE_ROTATION_GENERATE,
  PROFILER_SPAN_IDS.SPRITE_QUEUE_WAIT,
  PROFILER_SPAN_IDS.SPRITE_BITMAP_CREATE,
  PROFILER_SPAN_IDS.SPRITE_BITMAP_PUBLISH,
  PROFILER_SPAN_IDS.CHUNK_REBUILD,
  PROFILER_SPAN_IDS.WEBGL_UPLOAD
])

export const SPRITE_STREAMING_BYTE_CLASSES = Object.freeze(['reserved', 'staging', 'transfer', 'resident', 'gpu-estimate'])

const DEFAULT_GENERATION_SLOTS = 8

export class SpriteStreamingDiagnostics {
  constructor({ enabled = () => false, generationSlots = DEFAULT_GENERATION_SLOTS } = {}) {
    if (!Number.isInteger(generationSlots) || generationSlots <= 0) throw new RangeError('Invalid diagnostic generation slots')
    this.enabled = enabled
    this.generationSlots = generationSlots
    this.slotGenerations = new Float64Array(generationSlots)
    this.slotGenerations.fill(-1)
    const cells = generationSlots * SPRITE_TIER_NAMES.length
    this.stageCounts = new Uint32Array(cells * SPRITE_STREAMING_STAGES.length)
    this.stageDurations = new Float64Array(cells * SPRITE_STREAMING_STAGES.length)
    this.byteTotals = new Float64Array(cells * SPRITE_STREAMING_BYTE_CLASSES.length)
    this.bytePeaks = new Float64Array(cells * SPRITE_STREAMING_BYTE_CLASSES.length)
  }

  getCell(generation, tier) {
    if (!Number.isSafeInteger(generation) || generation < 0 || !Number.isInteger(tier) || tier < 0 || tier >= SPRITE_TIER_NAMES.length) return -1
    const slot = generation % this.generationSlots
    if (this.slotGenerations[slot] !== generation) {
      const cellStart = slot * SPRITE_TIER_NAMES.length
      const cellEnd = cellStart + SPRITE_TIER_NAMES.length
      this.stageCounts.fill(0, cellStart * SPRITE_STREAMING_STAGES.length, cellEnd * SPRITE_STREAMING_STAGES.length)
      this.stageDurations.fill(0, cellStart * SPRITE_STREAMING_STAGES.length, cellEnd * SPRITE_STREAMING_STAGES.length)
      this.byteTotals.fill(0, cellStart * SPRITE_STREAMING_BYTE_CLASSES.length, cellEnd * SPRITE_STREAMING_BYTE_CLASSES.length)
      this.bytePeaks.fill(0, cellStart * SPRITE_STREAMING_BYTE_CLASSES.length, cellEnd * SPRITE_STREAMING_BYTE_CLASSES.length)
      this.slotGenerations[slot] = generation
    }
    return slot * SPRITE_TIER_NAMES.length + tier
  }

  recordStage(stageIndex, generation, tier, durationMs = 0) {
    if (!this.enabled()) return false
    const cell = this.getCell(generation, tier)
    if (cell < 0 || !Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= SPRITE_STREAMING_STAGES.length) return false
    const index = cell * SPRITE_STREAMING_STAGES.length + stageIndex
    this.stageCounts[index]++
    if (Number.isFinite(durationMs) && durationMs > 0) this.stageDurations[index] += durationMs
    return true
  }

  recordBytes(byteClassIndex, generation, tier, deltaBytes) {
    if (!this.enabled()) return false
    const cell = this.getCell(generation, tier)
    if (cell < 0 || !Number.isInteger(byteClassIndex) || byteClassIndex < 0 || byteClassIndex >= SPRITE_STREAMING_BYTE_CLASSES.length || !Number.isFinite(deltaBytes)) return false
    const index = cell * SPRITE_STREAMING_BYTE_CLASSES.length + byteClassIndex
    this.byteTotals[index] = Math.max(0, this.byteTotals[index] + deltaBytes)
    this.bytePeaks[index] = Math.max(this.bytePeaks[index], this.byteTotals[index])
    return true
  }

  snapshot() {
    const rows = []
    for (let slot = 0; slot < this.generationSlots; slot++) {
      const generation = this.slotGenerations[slot]
      if (generation < 0) continue
      for (let tier = 0; tier < SPRITE_TIER_NAMES.length; tier++) {
        const cell = slot * SPRITE_TIER_NAMES.length + tier
        rows.push(Object.freeze({
          generation,
          tier,
          stageCounts: Array.from(this.stageCounts.subarray(cell * SPRITE_STREAMING_STAGES.length, (cell + 1) * SPRITE_STREAMING_STAGES.length)),
          stageDurationMs: Array.from(this.stageDurations.subarray(cell * SPRITE_STREAMING_STAGES.length, (cell + 1) * SPRITE_STREAMING_STAGES.length)),
          bytes: Array.from(this.byteTotals.subarray(cell * SPRITE_STREAMING_BYTE_CLASSES.length, (cell + 1) * SPRITE_STREAMING_BYTE_CLASSES.length)),
          peakBytes: Array.from(this.bytePeaks.subarray(cell * SPRITE_STREAMING_BYTE_CLASSES.length, (cell + 1) * SPRITE_STREAMING_BYTE_CLASSES.length))
        }))
      }
    }
    return Object.freeze({ schemaVersion: 1, stages: SPRITE_STREAMING_STAGES, byteClasses: SPRITE_STREAMING_BYTE_CLASSES, rows: Object.freeze(rows) })
  }
}
