import { describe, expect, it, vi } from 'vitest'
import { createLiveSwapScheduler } from '../../src/pwa/liveSwapScheduler.js'
import { getLiveModule } from '../../src/pwa/liveModuleRegistry.js'

const oldManifest = {
  stateSchemaVersion: 1,
  modules: { 'update-notice': { url: '/assets/old.js', signature: 'old' } }
}

describe('live module swap scheduler', () => {
  it('[U05320] stages imports and atomically accepts them at the safe point after migration', async() => {
    const order = []
    const candidate = {
      hotSwappable: true,
      hotAccept: state => order.push(`accept:${state}`),
      safeUpdateText: () => 'new'
    }
    const scheduler = createLiveSwapScheduler({
      importModule: async url => {
        order.push(`import:${url}`)
        return candidate
      },
      migrate: (state, from, to) => {
        order.push(`migrate:${from}-${to}`)
        state.migrated = true
        return state
      }
    })
    const next = { stateSchemaVersion: 2, modules: { 'update-notice': { url: '/assets/new.js', signature: 'new' } } }
    await expect(scheduler.stage(oldManifest, next)).resolves.toEqual(['update-notice'])
    expect(getLiveModule('update-notice')).not.toBe(candidate)
    const state = {}
    expect(scheduler.applyAtSafePoint(state)).toEqual({ status: 'applied', count: 1 })
    expect(state.migrated).toBe(true)
    expect(getLiveModule('update-notice')).toBe(candidate)
    expect(order).toEqual(['import:/assets/new.js', 'migrate:1-2', 'accept:null'])
  })

  it('[U05321] rejects non-swappable modules during staging so the updater can fall back to reload', async() => {
    const scheduler = createLiveSwapScheduler({ importModule: async() => ({}) })
    const next = { stateSchemaVersion: 1, modules: { 'update-notice': { url: '/assets/bad.js', signature: 'bad' } } }
    await expect(scheduler.stage(oldManifest, next)).rejects.toThrow('not hot-swappable')
    expect(scheduler.hasPending()).toBe(false)
  })

  it('[U05322] rolls the registry back and requests the reload fallback when acceptance fails', async() => {
    const previous = getLiveModule('update-notice')
    const fallback = vi.fn()
    const error = new Error('accept failed')
    const candidate = { hotSwappable: true, hotAccept: () => { throw error } }
    const scheduler = createLiveSwapScheduler({ importModule: async() => candidate, onFailure: fallback })
    const next = { commit: 'bbbbbbb', stateSchemaVersion: 1, modules: { 'update-notice': { url: '/assets/bad.js', signature: 'bad-2' } } }
    await scheduler.stage(oldManifest, next)
    const result = scheduler.applyAtSafePoint({ schemaVersion: 1, gameState: {} })
    expect(result.status).toBe('failed')
    expect(result.error).toBe(error)
    expect(getLiveModule('update-notice')).toBe(previous)
    expect(fallback).toHaveBeenCalledWith(next, error)
  })
})
