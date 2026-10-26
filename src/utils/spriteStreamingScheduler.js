import { IDLE_ASSET_PRIORITIES } from './idleAssetQueue.js'

const EMPTY = Object.freeze([])

// Camera integration supplies one coalesced list per class. This module never
// walks entities and reuses its demand maps between snapshots.
export function createSpriteStreamingScheduler(queue, { now = () => performance.now(), settledDwellMs = 240, movingDwellMs = 80, maxDemand = 512, maxObsolete = 128 } = {}) {
  if (!queue?.request || !queue?.cancelGeneration) throw new TypeError('Sprite scheduler requires an idle asset queue')
  const desired = new Map()
  const nextDesired = new Map()
  const obsolete = []
  let currentGenerations = null
  let moving = false
  let lastMotionAt = Number.NEGATIVE_INFINITY
  let revision = -1
  let onError = () => {}
  const optionalAllowed = timestamp => !moving && timestamp - lastMotionAt >= settledDwellMs
  const addDemand = (items, priority, generations, timestamp) => {
    if (priority >= IDLE_ASSET_PRIORITIES.VISIBLE_REFINEMENT && !optionalAllowed(timestamp)) return
    for (let index = 0; index < items.length && nextDesired.size < maxDemand; index++) {
      const item = items[index]
      const id = typeof item === 'string' ? item : item.id
      if (!id || nextDesired.has(id)) continue
      nextDesired.set(id, priority)
      queue.request(id, { priority, bytes: typeof item === 'string' ? 0 : item.bytes ?? 0, generations })
        .catch(error => { if (error?.name !== 'AbortError') onError(error, id) })
    }
  }
  return {
    setErrorHandler(handler) { onError = typeof handler === 'function' ? handler : () => {} },
    update({ capturedAt = now(), revision: nextRevision, moving: nextMoving = false, generations, visibleCoarse = EMPTY, lookahead = EMPTY, visibleRefinement = EMPTY, optional = EMPTY }) {
      if (!Number.isSafeInteger(nextRevision) || nextRevision <= revision) return false
      revision = nextRevision
      if (nextMoving) lastMotionAt = capturedAt
      else if (moving) lastMotionAt = Math.max(lastMotionAt, capturedAt - movingDwellMs)
      moving = Boolean(nextMoving)
      if (currentGenerations && (currentGenerations.asset !== generations.asset || currentGenerations.map !== generations.map || currentGenerations.density !== generations.density)) {
        queue.cancelGeneration(currentGenerations, 'Camera generation superseded')
        desired.clear()
      }
      currentGenerations = generations
      nextDesired.clear()
      addDemand(visibleCoarse, IDLE_ASSET_PRIORITIES.VISIBLE_COARSE, generations, capturedAt)
      addDemand(lookahead, IDLE_ASSET_PRIORITIES.LOOKAHEAD, generations, capturedAt)
      addDemand(visibleRefinement, IDLE_ASSET_PRIORITIES.VISIBLE_REFINEMENT, generations, capturedAt)
      addDemand(optional, IDLE_ASSET_PRIORITIES.OPTIONAL, generations, capturedAt)
      obsolete.length = 0
      for (const id of desired.keys()) if (!nextDesired.has(id) && obsolete.length < maxObsolete) obsolete.push(id)
      for (const id of obsolete) queue.cancel?.(id, generations, 'Camera demand superseded')
      desired.clear()
      for (const [id, priority] of nextDesired) desired.set(id, priority)
      return true
    },
    requestCritical(id, { bytes = 0, generations = currentGenerations } = {}) {
      return queue.request(id, { priority: IDLE_ASSET_PRIORITIES.VISIBLE_COARSE, bytes, generations })
    },
    getState: () => Object.freeze({ revision, moving, optionalPaused: !optionalAllowed(now()), demandCount: desired.size, obsoleteCount: obsolete.length })
  }
}
