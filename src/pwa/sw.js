/* global self */
import { APP_VERSION } from '../version.js'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precache, getCacheKeyForURL, matchPrecache } from 'workbox-precaching'
import { Route, Router } from 'workbox-routing'
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { RangeRequestsPlugin } from 'workbox-range-requests'
import { getNavigationShellPath, resolveDocumentNavigation } from './navigationFallback.js'
import {
  NAVIGATION_NETWORK_TIMEOUT_MS,
  OFFLINE_ASSETS_CACHE,
  SPRITE_DERIVATIVE_CACHE,
  SPRITE_DERIVATIVE_CACHE_MAX_ENTRIES,
  isImmutableSpriteDerivativeUrl
} from './offlineAssetPlan.js'
import {
  isAudioAssetPath,
  isBulkAssetPath,
  isNavigationDenylisted,
  isNetlifyDrawerRequest,
  isNetworkFirstMapDataPath,
  isOfflineAssetFillRequest,
  MAP_DATA_CACHE,
  isRuntimeFontRequest,
  shouldBypassServiceWorkerCache
} from './serviceWorkerCachePolicy.js'

// Resolve a complete update snapshot per browsing client. Ordinary requests
// continue through the same Workbox routes below.
const router = new Router()
const registerRoute = (match, handler) => router.registerRoute(new Route(match, handler))
self.addEventListener('fetch', event => {
  event.respondWith((async() => {
    const request = event.request
    const url = new URL(request.url)
    const navigation = request.mode === 'navigate'
    const client = !navigation && event.clientId ? await self.clients.get(event.clientId) : null
    const commit = (navigation ? url : new URL(client?.url || self.location.origin)).searchParams.get('cfb-update')
    if (url.origin === self.location.origin && request.method === 'GET'
      && !isOfflineAssetFillRequest(request) && !shouldBypassServiceWorkerCache(url, request.method)
      && commit && /^[a-f0-9]{7,40}$/.test(commit)) {
      if (navigation && (request.cache === 'reload' || request.cache === 'no-cache')) {
        url.searchParams.delete('cfb-update')
        return Response.redirect(url.href)
      }
      const cache = await caches.open(`cfb-update-${commit}`)
      const staged = await cache.match(url.pathname === '/' ? '/index.html' : url.pathname)
      if (staged) return staged
    }
    return router.handleRequest({ request, event }) || fetch(request)
  })())
})

// Injected by vite-plugin-pwa. Hashed revisions mean an update fetches only changed files.
// This list is the boot shell only. Bulk assets are downloaded after activation.
const PRECACHE_MANIFEST = self.__WB_MANIFEST

// directoryIndex and cleanURLs would serve precached index.html for "/".
// Leaving them off lets a navigation hit the network first, so a deploy
// preview can still inject the Netlify Drawer. Offline falls back below.
precache(PRECACHE_MANIFEST)
registerRoute(
  ({ url }) => Boolean(getCacheKeyForURL(url.href)),
  ({ request }) => matchPrecache(request)
)
cleanupOutdatedCaches()

const appShell = createHandlerBoundToURL('/index.html')
const sseShell = createHandlerBoundToURL('/sse.html')
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
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    const protectedUpdates = new Set(clients.map(client => new URL(client.url).searchParams.get('cfb-update')))
    // Keep the newest staged snapshot and snapshots still used by open tabs.
    const updates = names.filter(name => name.startsWith('cfb-update-'))
    const newestUpdate = updates[updates.length - 1]
    await Promise.all(updates.filter(name => name !== newestUpdate
      && !protectedUpdates.has(name.slice('cfb-update-'.length))).map(name => caches.delete(name)))
    await Promise.all(names
      .filter(name => name.startsWith('code-for-battle-cache-')
        || (name.startsWith('cfb-offline-assets-') && name !== OFFLINE_ASSETS_CACHE)
        || (name.startsWith('cfb-sprite-derivatives-') && name !== SPRITE_DERIVATIVE_CACHE))
      .map(name => caches.delete(name)))
    await self.clients.claim()
    await broadcast({ type: 'OFFLINE_PRECACHE', percent: 100, ready: true, boot: true })
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_APP_VERSION') {
    event.ports?.[0]?.postMessage({ version: APP_VERSION })
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

registerRoute(
  ({ url, request }) => request.method === 'GET'
    && url.origin === self.location.origin
    && request.mode !== 'navigate'
    && !isOfflineAssetFillRequest(request)
    && isImmutableSpriteDerivativeUrl(url),
  new CacheFirst({
    cacheName: SPRITE_DERIVATIVE_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: SPRITE_DERIVATIVE_CACHE_MAX_ENTRIES, purgeOnQuotaError: true })
    ]
  })
)

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
    shell: () => getNavigationShellPath(context.request.url) === '/sse.html' ? sseShell(context) : appShell(context)
  })
)

// Sprite sheets keep their names across deploys: network first, so a new
// deploy's index.json, tags and images are used immediately. Offline, fall
// back to this cache or to the downloaded offline-assets copy.
registerRoute(
  ({ url, request }) => request.method === 'GET'
    && url.origin === self.location.origin
    && request.mode !== 'navigate'
    && !isOfflineAssetFillRequest(request)
    && isNetworkFirstMapDataPath(url),
  new NetworkFirst({
    cacheName: MAP_DATA_CACHE,
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      { handlerDidError: async({ request }) => (await caches.match(request, { ignoreSearch: true })) || undefined }
    ]
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
