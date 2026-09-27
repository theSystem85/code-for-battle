import { FORCED_OFFLINE_STORAGE_KEY } from './precachePolicy.js'

const listeners = new Set()

let snapshot = Object.freeze({
  forced: false,
  navigatorOnLine: true,
  probeFailed: false,
  effective: false
})

export function readForcedOffline(storage) {
  try {
    return storage?.getItem(FORCED_OFFLINE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeForcedOffline(storage, forced) {
  if (!storage) return
  try {
    if (forced) storage.setItem(FORCED_OFFLINE_STORAGE_KEY, '1')
    else storage.removeItem(FORCED_OFFLINE_STORAGE_KEY)
  } catch {
    // Private mode and blocked storage still run the in-memory toggle.
  }
}

export function computeEffectiveOffline({
  navigatorOnLine = true,
  forced = false,
  probeFailed = false
} = {}) {
  return forced === true || navigatorOnLine === false || probeFailed === true
}

export function createOfflineSnapshot({
  navigatorOnLine = true,
  forced = false,
  probeFailed = false
} = {}) {
  const effective = computeEffectiveOffline({ navigatorOnLine, forced, probeFailed })
  return Object.freeze({
    forced: forced === true,
    navigatorOnLine: navigatorOnLine !== false,
    probeFailed: probeFailed === true,
    effective
  })
}

export function getOfflineSnapshot() {
  return snapshot
}

export function isEffectivelyOffline() {
  return snapshot.effective === true
}

export function shouldSkipMilestoneVideo(offline = isEffectivelyOffline()) {
  return offline === true
}

export function setOfflineSnapshot(next) {
  snapshot = createOfflineSnapshot(next)
  listeners.forEach(listener => {
    try {
      listener(snapshot)
    } catch {
      // A UI listener must not break the connectivity snapshot.
    }
  })
  return snapshot
}

export function subscribeOfflineSnapshot(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function probeConnectivity(fetchImpl = fetch, timeoutMs = 4000) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null
  try {
    const response = await fetchImpl('/offline-probe.txt', {
      method: 'GET',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    })
    return Boolean(response && response.ok)
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}
