import { describe, expect, it, vi } from 'vitest'
import { createIdleAssetQueue, IDLE_ASSET_PRIORITIES } from '../../src/utils/idleAssetQueue.js'
import { createSpriteStreamingScheduler } from '../../src/utils/spriteStreamingScheduler.js'

const idle = () => ({ didTimeout: false, timeRemaining: () => 10 })

describe('sprite streaming scheduler', () => {
  it('[U06188] prioritizes demand, reserves bytes and bounds completion settlement', async() => {
    const turns = []
    const releases = new Map()
    const started = []
    const queue = createIdleAssetQueue(id => {
      started.push(id)
      return new Promise(resolve => releases.set(id, resolve))
    }, { concurrency: 2, maxReservedBytes: 20, maxCompletionsPerTurn: 1, schedule: callback => turns.push(callback) })
    queue.request('optional', { priority: IDLE_ASSET_PRIORITIES.OPTIONAL, bytes: 10 })
    queue.request('refine', { priority: IDLE_ASSET_PRIORITIES.VISIBLE_REFINEMENT, bytes: 10 })
    queue.request('coarse', { priority: IDLE_ASSET_PRIORITIES.VISIBLE_COARSE, bytes: 15 })
    turns.shift()(idle())
    await Promise.resolve()
    expect(started).toEqual(['coarse'])
    expect(queue.getStats().reservedBytes).toBe(15)
    releases.get('coarse')()
    await new Promise(resolve => setTimeout(resolve, 0))
    turns.shift()(idle())
    await Promise.resolve()
    expect(started).toEqual(['coarse', 'refine', 'optional'])
  })

  it('[U06189] bounds queued work while allowing urgent demand to displace optional work', async() => {
    const turns = []
    const queue = createIdleAssetQueue(() => Promise.resolve(), { maxQueued: 1, schedule: callback => turns.push(callback) })
    const optional = queue.request('optional')
    const urgent = queue.request('urgent', true)
    await expect(optional).rejects.toMatchObject({ name: 'AbortError' })
    turns.shift()(idle())
    await expect(urgent).resolves.toBeUndefined()
  })

  it('[U06190] cancels stale generations and retries failures a controlled number of times', async() => {
    const turns = []
    const load = vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValue('ready')
    const queue = createIdleAssetQueue(load, { maxRetries: 1, retryDelayTurns: 1, schedule: callback => turns.push(callback) })
    const stale = queue.request('old', { generations: { asset: 1, map: 1, density: 1 } })
    queue.cancelGeneration({ asset: 1, map: 1, density: 1 }, 'reversal')
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' })
    const retried = queue.request('new')
    for (let index = 0; index < 6; index++) {
      if (turns.length) turns.shift()(idle())
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    await expect(retried).resolves.toBe('ready')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('[U06191] pauses refinements during movement and resumes after settled hysteresis', () => {
    let time = 0
    const queue = { request: vi.fn(() => Promise.resolve()), cancelGeneration: vi.fn(), cancel: vi.fn() }
    const scheduler = createSpriteStreamingScheduler(queue, { now: () => time, settledDwellMs: 200 })
    const generations = { asset: 1, map: 2, density: 3 }
    scheduler.update({ revision: 1, capturedAt: 0, moving: true, generations, visibleCoarse: ['a'], visibleRefinement: ['sharp'], optional: ['rotation'] })
    expect(queue.request).toHaveBeenCalledTimes(1)
    time = 100
    scheduler.update({ revision: 2, capturedAt: time, moving: false, generations, visibleCoarse: ['a'], visibleRefinement: ['sharp'] })
    expect(scheduler.getState().optionalPaused).toBe(true)
    time = 301
    scheduler.update({ revision: 3, capturedAt: time, moving: false, generations, visibleCoarse: ['a'], visibleRefinement: ['sharp'], optional: ['rotation'] })
    expect(queue.request.mock.calls.map(call => call[0])).toEqual(['a', 'a', 'a', 'sharp', 'rotation'])
    expect(scheduler.getState().optionalPaused).toBe(false)
  })

  it('[U06192] bounds obsolete demand and preserves explicitly critical pre-readiness requests', () => {
    const queue = { request: vi.fn(() => Promise.resolve()), cancelGeneration: vi.fn(), cancel: vi.fn() }
    const scheduler = createSpriteStreamingScheduler(queue, { maxObsolete: 1 })
    const generations = { asset: 1, map: 1, density: 1 }
    scheduler.requestCritical('boot', { bytes: 12, generations })
    scheduler.update({ revision: 1, generations, visibleCoarse: ['a', 'b'] })
    scheduler.update({ revision: 2, generations, visibleCoarse: ['c'] })
    expect(queue.cancel).toHaveBeenCalledTimes(1)
    expect(queue.cancel).not.toHaveBeenCalledWith('boot', expect.anything(), expect.anything())
    expect(scheduler.getState().obsoleteCount).toBe(1)
  })
})
