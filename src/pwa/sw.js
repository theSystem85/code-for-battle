/* global self */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { RangeRequestsPlugin } from 'workbox-range-requests'
import { resolveDocumentNavigation } from './navigationFallback.js'
import { NAVIGATION_NETWORK_TIMEOUT_MS, OFFLINE_ASSETS_CACHE } from './offlineAssetPlan.js'
import {
  isAudioAssetPath,
  isBulkAssetPath,
  isNavigationDenylisted,
  isNetlifyDrawerRequest,
  isOfflineAssetFillRequest,
  isRuntimeFontRequest,
  shouldBypassServiceWorkerCache
} from './serviceWorkerCachePolicy.js'

// Injected by vite-plugin-pwa. Hashed revisions mean an update fetches only changed files.
// This list is the boot shell only. Bulk assets are downloaded after activation.
const PRECACHE_MANIFEST = self.__WB_MANIFEST

// directoryIndex and cleanURLs would serve precached index.html for "/".
// Leaving them off lets a navigation hit the network first, so a deploy
// preview can still inject the Netlify Drawer. Offline falls back below.
precacheAndRoute(PRECACHE_MANIFEST, {
  directoryIndex: null,
  cleanURLs: false
})
cleanupOutdatedCaches()

const appShell = createHandlerBoundToURL('/index.html')
const audioCachePlugins = [
  new CacheableResponsePlugin({ statuses: [200] }),
  new RangeRequestsPlugin()
]

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
  clients.forEach(client => {
    client.postMessage(message)
  })
}

async function countPrecacheEntries() {
  const names = await caches.keys()
  const precacheName = names.find(name => name.includes('precache'))
  if (!precacheName) return 0
  const cache = await caches.open(precacheName)
  const keys = await cache.keys()
  return keys.length
}

async function reportPrecacheProgress(total) {
  const started = Date.now()
  let lastPercent = -1
  while (Date.now() - started < 60000) {
    const done = await countPrecacheEntries()
    const complete = total === 0 || done >= total
    const percent = complete ? 100 : (total > 0 ? Math.min(99, Math.round((done / total) * 100)) : 0)
    if (percent !== lastPercent) {
      lastPercent = percent
      await broadcast({ type: 'OFFLINE_PRECACHE', done, total, percent, ready: complete, boot: true })
    }
    if (complete) return
    await delay(250)
  }
}

// A new worker waits until the page asks it to take over. Never skipWaiting on install.
self.addEventListener('install', (event) => {
  event.waitUntil(reportPrecacheProgress(PRECACHE_MANIFEST.length))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async() => {
    const names = await caches.keys()
    await Promise.all(names
      .filter(name => name.startsWith('code-for-battle-cache-')
        || (name.startsWith('cfb-offline-assets-') && name !== OFFLINE_ASSETS_CACHE))
      .map(name => caches.delete(name)))
    await self.clients.claim()
    await broadcast({ type: 'OFFLINE_PRECACHE', percent: 100, ready: true, boot: true })
  })())
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

registerRoute(
  ({ url, request }) => shouldBypassServiceWorkerCache(url, request.method) || isNetlifyDrawerRequest(url),
  new NetworkOnly()
)

// Same-origin navigations try the network for a few seconds so a deploy
// preview can still inject the Netlify Drawer, then fall back to the
// precached shell. /api/ and /.netlify/ never receive the shell.
registerRoute(
  ({ request, url }) => request.mode === 'navigate' && !isNavigationDenylisted(url),
  (context) => resolveDocumentNavigation({
    request: context.request,
    denylisted: false,
    timeoutMs: NAVIGATION_NETWORK_TIMEOUT_MS,
    fetchImpl: (request) => fetch(request),
    shell: () => appShell(context)
  })
)

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: 'cfb-google-fonts-css',
    plugins: [new CacheableResponsePlugin({ statuses: [200] })]
  })
)

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'cfb-google-fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 })
    ]
  })
)

// Fill requests are made by the page's resumable downloader. Leaving them
// unmatched lets the browser perform the page's own network request, which
// the page then stores with a revision. Safari <audio> Range requests are
// answered from that full 200 by RangeRequestsPlugin.
registerRoute(
  ({ url, request }) => request.method === 'GET'
    && url.origin === self.location.origin
    && !isOfflineAssetFillRequest(request)
    && isAudioAssetPath(url),
  new CacheFirst({
    cacheName: OFFLINE_ASSETS_CACHE,
    plugins: audioCachePlugins
  })
)

registerRoute(
  ({ url, request }) => request.method === 'GET'
    && url.origin === self.location.origin
    && request.mode !== 'navigate'
    && !isOfflineAssetFillRequest(request)
    && !shouldBypassServiceWorkerCache(url, request.method)
    && isBulkAssetPath(url)
    && !isAudioAssetPath(url),
  new CacheFirst({
    cacheName: OFFLINE_ASSETS_CACHE,
    plugins: [new CacheableResponsePlugin({ statuses: [200] })]
  })
)

registerRoute(
  ({ url, request }) => request.method === 'GET'
    && url.origin === self.location.origin
    && request.mode !== 'navigate'
    && !isOfflineAssetFillRequest(request)
    && !shouldBypassServiceWorkerCache(url, request.method)
    && !isRuntimeFontRequest(url)
    && !isBulkAssetPath(url),
  new CacheFirst({
    cacheName: 'cfb-runtime',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 })
    ]
  })
)
