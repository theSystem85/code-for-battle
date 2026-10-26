import { describe, expect, it, vi } from 'vitest'
import { SpriteResourceBudgetError, SpriteResourceStore } from '../../src/rendering/prepared/spriteResourceStore.js'

const generations = Object.freeze({ asset: 1, map: 2, density: 3 })

function bitmap() {
  return { close: vi.fn() }
}

describe('SpriteResourceStore', () => {
  it('[U06181] deduplicates atlas bytes across views and separates GPU estimates', () => {
    const store = new SpriteResourceStore({ budgets: { resident: 100, 'gpu-estimate': 200 } })
    const image = bitmap()
    const owner = store.registerResource({
      resourceId: 'apache-atlas', value: image, allocations: [
        { byteClass: 'resident', bytes: 80 },
        { byteClass: 'gpu-estimate', bytes: 120 }
      ]
    })
    store.registerView('apache-0', 'apache-atlas', { x: 0 })
    store.registerView('apache-1', 'apache-atlas', { x: 96 })

    expect(store.lookupView('apache-0').value).toBe(image)
    expect(store.lookupView('apache-1').value).toBe(image)
    expect(store.snapshot()).toMatchObject({ nativeBytes: 80, gpuEstimateBytes: 120, resources: 1, views: 2 })
    owner.release()
    expect(store.evict()).toBe(80)
    expect(image.close).toHaveBeenCalledOnce()
    expect(store.lookupView('apache-0')).toBeNull()
  })

  it('[U06182] rolls back every reservation and closes a partially registered value', () => {
    const store = new SpriteResourceStore({ budgets: { resident: 64, staging: 8 } })
    const image = bitmap()

    expect(() => store.registerResource({
      resourceId: 'partial', value: image, allocations: [
        { byteClass: 'resident', bytes: 32 },
        { byteClass: 'staging', bytes: 16 }
      ]
    })).toThrow(SpriteResourceBudgetError)
    expect(store.snapshot()).toMatchObject({ nativeBytes: 0, resources: 0 })
    expect(image.close).toHaveBeenCalledOnce()
  })

  it('[U06183] keeps visible and referenced resources while evicting least-recent unused bytes', () => {
    const store = new SpriteResourceStore()
    const first = store.registerResource({ resourceId: 'first', value: bitmap(), allocations: [{ byteClass: 'resident', bytes: 40 }] })
    const secondImage = bitmap()
    const second = store.registerResource({ resourceId: 'second', value: secondImage, allocations: [{ byteClass: 'resident', bytes: 50 }] })
    first.release()
    second.release()
    store.pin('first')

    expect(store.evict(30)).toBe(50)
    expect(store.lookupView('missing')).toBeNull()
    expect(secondImage.close).toHaveBeenCalledOnce()
    expect(store.snapshot().nativeBytes).toBe(40)
  })

  it('[U06184] atomically replaces tiers and rejects stale publications', () => {
    const store = new SpriteResourceStore()
    store.setCurrentGenerations(generations)
    const coarseImage = bitmap()
    const finalImage = bitmap()
    const coarse = store.registerResource({ resourceId: 'coarse', value: coarseImage, allocations: [{ byteClass: 'resident', bytes: 20 }] })
    const final = store.registerResource({ resourceId: 'final', value: finalImage, allocations: [{ byteClass: 'resident', bytes: 60 }] })
    coarse.release()
    final.release()

    expect(store.publish('tank', { resourceId: 'coarse', tier: 0, revision: 1, generations })).toBe(true)
    expect(store.publish('tank', { resourceId: 'final', tier: 2, revision: 2, generations })).toBe(true)
    expect(store.publish('tank', { resourceId: 'coarse', tier: 0, revision: 1, generations })).toBe(false)
    expect(store.publish('tank', {
      resourceId: 'coarse', tier: 0, revision: 3, generations: { ...generations, density: 2 }
    })).toBe(false)
    expect(store.lookup('tank')).toMatchObject({ resourceId: 'final', tier: 2, value: finalImage })
    expect(store.disposeResource('final')).toBe(false)
    expect(store.remove('tank')).toBe(true)
    expect(store.disposeResource('final')).toBe(true)
    expect(store.lookup('tank')).toBeNull()
  })

  it('[U06185] closes late timeout results and permits failure retries', async() => {
    vi.useFakeTimers()
    const store = new SpriteResourceStore()
    const late = bitmap()
    let finish
    const operation = new Promise(resolve => { finish = resolve })
    const timedOut = store.runJob('decode', { generations, timeoutMs: 10, operation: () => operation })
    const timeoutExpectation = expect(timedOut).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(10)
    await timeoutExpectation
    finish(late)
    await vi.runAllTimersAsync()
    await Promise.resolve()
    expect(late.close).toHaveBeenCalledOnce()

    await expect(store.runJob('retry', { generations, operation: () => Promise.reject(new Error('worker crash')) })).rejects.toThrow('worker crash')
    await expect(store.runJob('retry', { generations, operation: () => Promise.resolve('ok') })).resolves.toBe('ok')
    vi.useRealTimers()
  })

  it('[U06186] cancels superseded density work and closes its eventual result', async() => {
    const store = new SpriteResourceStore()
    const stale = bitmap()
    let finish
    const oldGenerations = { ...generations, density: 2 }
    const pending = store.runJob('sheet', {
      generations: oldGenerations,
      operation: () => new Promise(resolve => { finish = resolve })
    })
    await Promise.resolve()
    const replacement = store.runJob('sheet', { generations, operation: () => Promise.resolve('new') })
    finish(stale)

    await expect(pending).rejects.toThrow('discarded')
    await expect(replacement).resolves.toBe('new')
    expect(stale.close).toHaveBeenCalledOnce()
  })

  it('[U06187] tears down repeated-map resources and deferred jobs deterministically', async() => {
    const stop = vi.fn()
    const store = new SpriteResourceStore()
    const image = bitmap()
    const handle = store.registerResource({ resourceId: 'map-1', value: image, allocations: [{ byteClass: 'transfer', bytes: 16 }] })
    handle.release()
    let finish
    const pending = store.runJob('map-2', {
      generations,
      stop,
      operation: () => new Promise(resolve => { finish = resolve })
    })
    await Promise.resolve()
    store.dispose()
    const late = bitmap()
    finish(late)
    await expect(pending).rejects.toThrow('discarded')

    expect(stop).toHaveBeenCalledWith('store-disposed')
    expect(image.close).toHaveBeenCalledOnce()
    expect(late.close).toHaveBeenCalledOnce()
    expect(store.snapshot()).toMatchObject({ nativeBytes: 0, resources: 0, publications: 0, jobs: 0 })
  })

  it('[U06208] evicts by resident bytes while retaining visible publications', () => {
    const store = new SpriteResourceStore({ budgets: { resident: 70 } })
    store.setCurrentGenerations(generations)
    const visible = store.registerResource({ resourceId: 'visible', value: bitmap(), allocations: [{ byteClass: 'resident', bytes: 40 }] })
    visible.release()
    store.publish('tank', { resourceId: 'visible', revision: 1, generations })
    store.setVisible(['tank'])
    const spareImage = bitmap()
    const spare = store.registerResource({ resourceId: 'spare', value: spareImage, allocations: [{ byteClass: 'resident', bytes: 30 }] })
    spare.release()

    const replacement = store.registerResource({ resourceId: 'replacement', value: bitmap(), allocations: [{ byteClass: 'resident', bytes: 30 }] })
    replacement.release()

    expect(spareImage.close).toHaveBeenCalledOnce()
    expect(store.lookup('tank')?.resourceId).toBe('visible')
    expect(store.snapshot().totals.resident).toBe(70)
  })
})
