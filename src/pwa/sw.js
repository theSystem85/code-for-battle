/* global self */
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { isNetlifyDrawerRequest, isRuntimeFontRequest, shouldBypassServiceWorkerCache } from './serviceWorkerCachePolicy.js'

// Injected by vite-plugin-pwa. Hashed revisions mean an update fetches only changed files.
const PRECACHE_MANIFEST = self.__WB_MANIFEST

// directoryIndex and cleanURLs would serve precached index.html for "/".
// Leaving them off lets a navigation hit the network first, so a deploy
// preview can still inject the Netlify Drawer. Offline falls back below.
precacheAndRoute(PRECACHE_MANIFEST, {
  directoryIndex: null,
  cleanURLs: false
})
cleanupOutdatedCaches()

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
  while (Date.now() - started < 180000) {
    const done = await countPrecacheEntries()
    const complete = total === 0 || done >= total
    const percent = complete ? 100 : (total > 0 ? Math.min(99, Math.round((done / total) * 100)) : 0)
    if (percent !== lastPercent) {
      lastPercent = percent
      await broadcast({ type: 'OFFLINE_PRECACHE', done, total, percent, ready: complete })
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
      .filter(name => name.startsWith('code-for-battle-cache-'))
      .map(name => caches.delete(name)))
    await self.clients.claim()
    await broadcast({ type: 'OFFLINE_PRECACHE', percent: 100, ready: true })
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

async function precachedAppShell() {
  const index = await caches.match('/index.html', { ignoreSearch: true })
  if (index) return index
  return caches.match('/', { ignoreSearch: true })
}

// Navigation stays on the network and is not stored, so a deploy preview's
// injected Netlify Drawer never lands in Cache Storage. Offline falls back
// to the precached app shell.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  async({ event }) => {
    try {
      const response = await fetch(event.request)
      if (response && response.ok) return response
    } catch {
      // Offline or a failed probe. The precached shell still starts the game.
    }
    const cached = await precachedAppShell()
    if (cached) return cached
    return Response.error()
  }
)

registerRoute(
  ({ url, request }) => request.method === 'GET'
    && url.origin === self.location.origin
    && request.mode !== 'navigate'
    && !shouldBypassServiceWorkerCache(url, request.method)
    && !isRuntimeFontRequest(url),
  new CacheFirst({
    cacheName: 'cfb-runtime',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 })
    ]
  })
)
