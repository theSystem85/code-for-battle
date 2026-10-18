import { migrateLiveState } from '../gameStateMigrations.js'
import {
  getLiveModule,
  replaceLiveModule,
  restoreLiveModule,
  validateLiveModule
} from './liveModuleRegistry.js'

let activeScheduler = null
const NO_LIVE_SWAP = Object.freeze({ status: 'none', count: 0 })

export function createLiveSwapScheduler({
  importModule = url => import(/* @vite-ignore */ url),
  migrate = migrateLiveState,
  onFailure = () => {}
} = {}) {
  let pending = null
  let fallback = onFailure

  async function stage(previous, next) {
    const before = previous?.modules || {}
    const after = next?.modules || {}
    const changed = Object.keys(after).filter(key => before[key]?.signature !== after[key]?.signature)
    if (!changed.length) throw new Error('Safe JavaScript update has no changed swappable modules')
    const loaded = await Promise.all(changed.map(async key => {
      validateLiveModule(key, getLiveModule(key))
      const candidate = await importModule(after[key].url)
      validateLiveModule(key, candidate)
      return { key, candidate }
    }))
    pending = { loaded, fromVersion: previous.stateSchemaVersion, toVersion: next.stateSchemaVersion, info: next }
    return changed
  }

  // Called once between animation frames, before any simulation tick starts.
  // It is intentionally synchronous: imports finish during stage(), so no tick
  // can observe a partially swapped registry.
  function applyAtSafePoint(state) {
    if (!pending) return NO_LIVE_SWAP
    const swap = pending
    pending = null
    const applied = []
    try {
      const migrated = migrate(state, swap.fromVersion, swap.toVersion)
      if (migrated !== state) throw new Error('Live migrations must preserve the root state object')
      for (const item of swap.loaded) {
        const previous = getLiveModule(item.key)
        const handover = previous.hotDispose?.()
        replaceLiveModule(item.key, item.candidate)
        applied.push({ key: item.key, previous, handover })
        item.candidate.hotAccept?.(handover)
      }
      return { status: 'applied', count: applied.length }
    } catch (error) {
      for (const item of applied.reverse()) {
        restoreLiveModule(item.key, item.previous)
        item.previous.hotAccept?.(item.handover)
      }
      fallback(swap.info, error)
      return { status: 'failed', count: 0, error }
    }
  }

  return {
    stage,
    applyAtSafePoint,
    hasPending: () => Boolean(pending),
    setFallback(handler) { fallback = handler }
  }
}

export function setActiveLiveSwapScheduler(scheduler) {
  activeScheduler = scheduler
}

export function applyLiveSwapAtSafePoint(state) {
  return activeScheduler?.applyAtSafePoint(state) || NO_LIVE_SWAP
}
