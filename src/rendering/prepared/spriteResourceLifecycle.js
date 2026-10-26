import { SpriteResourceStore } from './spriteResourceStore.js'

// One native-byte owner per prepared-rendering lifecycle. The prepared sprite
// registry, the integrated map-sprite pages (TextureManager), explosion sheet
// preparation and the worker/scheduler adapters all charge their bytes here,
// so overlap between them is visible in one set of totals and peaks.
export const SPRITE_RESOURCE_LIFECYCLE_BUDGETS = Object.freeze({
  reserved: 32 * 1024 * 1024,
  staging: 64 * 1024 * 1024,
  transfer: 64 * 1024 * 1024,
  resident: 512 * 1024 * 1024,
  'gpu-estimate': 512 * 1024 * 1024
})

const DEFAULT_GENERATIONS = Object.freeze({ asset: 0, map: 0, density: 0 })

let lifecycleStore = null
let lifecycleRevision = 0
const teardownHooks = new Set()

/** Returns the live store, creating a new one after the previous lifecycle was disposed. */
export function getSpriteResourceLifecycleStore() {
  if (!lifecycleStore || lifecycleStore.disposed) {
    lifecycleStore = new SpriteResourceStore({ budgets: SPRITE_RESOURCE_LIFECYCLE_BUDGETS })
    lifecycleRevision++
  }
  return lifecycleStore
}

export function getSpriteResourceLifecycleRevision() {
  return lifecycleRevision
}

/** Generations a non-registry participant publishes with: the lifecycle's
 * current generations, so its publications are never rejected as stale. */
export function getSpriteResourceLifecycleGenerations(store = getSpriteResourceLifecycleStore()) {
  return store.currentGenerations || DEFAULT_GENERATIONS
}

/** Participants release their own publications/resources before the store closes. */
export function onSpriteResourceLifecycleTeardown(hook) {
  if (typeof hook !== 'function') throw new TypeError('Teardown hook must be a function')
  teardownHooks.add(hook)
  return () => teardownHooks.delete(hook)
}

export function disposeSpriteResourceLifecycle() {
  const store = lifecycleStore
  lifecycleStore = null
  for (const hook of [...teardownHooks]) {
    try {
      hook(store)
    } catch (error) {
      console.warn('Sprite resource teardown hook failed', error)
    }
  }
  store?.dispose()
}
