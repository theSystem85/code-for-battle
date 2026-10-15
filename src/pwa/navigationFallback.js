import { NAVIGATION_NETWORK_TIMEOUT_MS } from './offlineAssetPlan.js'
import { isNavigationDenylisted } from './serviceWorkerCachePolicy.js'

export { NAVIGATION_NETWORK_TIMEOUT_MS, isNavigationDenylisted }

function delay(ms, scheduler) {
  const wait = scheduler || ((timeout, resolve) => setTimeout(resolve, timeout))
  return new Promise(resolve => {
    wait(ms, resolve)
  })
}

export async function resolveDocumentNavigation({
  request,
  denylisted = false,
  timeoutMs = NAVIGATION_NETWORK_TIMEOUT_MS,
  fetchImpl,
  shell,
  scheduler
} = {}) {
  if (denylisted) return fetchImpl(request)

  let timedOut = false
  const network = Promise.resolve().then(() => fetchImpl(request)).then(response => {
    if (timedOut) return response
    if (!response || !response.ok) {
      const error = new Error('navigation-failed')
      error.response = response
      throw error
    }
    return response
  })
  network.catch(() => {
    // The timeout winner must not leave the network promise unhandled.
  })

  const timeout = delay(timeoutMs, scheduler).then(() => {
    timedOut = true
    throw new Error('navigation-timeout')
  })

  try {
    return await Promise.race([network, timeout])
  } catch {
    return shell()
  }
}

// Editor documents must never fall back to the game boot shell.
export function getNavigationShellPath(url) {
  const { pathname } = new URL(url, 'https://code-for-battle.local')
  return /^\/sse(?:\/|\.html)?$/.test(pathname) ? '/sse.html' : '/index.html'
}
