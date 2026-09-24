const CACHE_NAME = 'code-for-battle-cache-v3'
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/styles/base.css',
  '/styles/sidebar.css',
  '/styles/overlays.css',
  '/styles/modals.css',
  '/cursors.css',
  '/site.webmanifest'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
    )).then(() => self.clients.claim())
  )
})

function canCacheResponse(request, response) {
  if (!response || !response.ok) {
    return false
  }

  if (response.status === 206 || request.headers.has('range')) {
    return false
  }

  return response.type === 'basic' || response.type === 'default'
}

function cacheResponse(cacheKey, request, response) {
  if (!canCacheResponse(request, response)) {
    return
  }

  caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, response.clone())).catch(() => {
    // Ignore cache write failures to avoid breaking fetch responses.
  })
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(request.url)
  // Signalling responses are polled and must come from the network.
  // A cache hit can replay an empty lobby or a session that has no answer yet.
  if (requestUrl.origin === self.location.origin && (
    requestUrl.pathname.startsWith('/api/') ||
    requestUrl.pathname.startsWith('/.netlify/functions/')
  )) {
    return
  }

  if (request.mode === 'navigate') {
    const path = requestUrl.pathname
    const isAppShell = path === '/' || path === '/index.html'
    event.respondWith(
      fetch(request).then(response => {
        if (isAppShell) {
          cacheResponse('/index.html', request, response)
        }
        return response
      }).catch(() => caches.match('/index.html'))
    )
    return
  }

  const url = new URL(request.url)

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async(cache) => {
        const cached = await cache.match(request)
        if (cached) {
          return cached
        }

        try {
          const response = await fetch(request)
          cacheResponse(request, request, response)
          return response
        } catch (err) {
          return cached || Promise.reject(err)
        }
      })
    )
  }
})
