import { isOfflineAssetFillRequest, shouldBypassServiceWorkerCache } from './serviceWorkerCachePolicy.js'

// Cache mode is not navigation intent: app-triggered navigations can also
// use no-cache/reload, especially in installed mobile browsers.
export async function matchStagedUpdate(request, { clientId, clients, cacheStorage, origin }) {
  const url = new URL(request.url)
  if (url.origin !== origin || request.method !== 'GET'
    || isOfflineAssetFillRequest(request) || shouldBypassServiceWorkerCache(url, request.method)) return null
  const client = request.mode !== 'navigate' && clientId ? await clients.get(clientId) : null
  const commit = (request.mode === 'navigate' ? url : new URL(client?.url || origin)).searchParams.get('cfb-update')
  if (!commit || !/^[a-f0-9]{7,40}$/.test(commit)) return null
  const cache = await cacheStorage.open(`cfb-update-${commit}`)
  return (await cache.match(url.pathname === '/' ? '/index.html' : url.pathname)) || null
}
