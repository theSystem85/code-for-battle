import { OFFLINE_ASSET_FILL_HEADER } from './offlineAssetPlan.js'
import { OFFLINE_PROBE_PATH } from './precachePolicy.js'

export const BUILD_INFO_PATH = '/build-info.json'
const VIDEO_EXTENSION = /\.(?:mp4|webm|mov|m4v)$/i
const AUDIO_EXTENSION = /\.(?:mp3|ogg|wav)$/i
const BULK_EXTENSION = /\.(?:png|webp|gif|json|mp3|ogg|wav)$/i

function pathnameOf(url) {
  if (typeof url === 'string') {
    try {
      return new URL(url, 'https://code-for-battle.local').pathname
    } catch {
      return url
    }
  }
  if (url && typeof url.pathname === 'string') return url.pathname
  return ''
}

export function shouldBypassServiceWorkerCache(url, method = 'GET') {
  const verb = String(method || 'GET').toUpperCase()
  if (verb !== 'GET') return true
  const pathname = pathnameOf(url)
  if (pathname.startsWith('/api/') || pathname.startsWith('/.netlify/')) return true
  if (pathname === OFFLINE_PROBE_PATH) return true
  // Polled by the dev live update (src/pwa/liveUpdate.js); must never be cached.
  if (pathname === '/game-update-manifest.json') return true
  if (pathname === BUILD_INFO_PATH) return true
  if (VIDEO_EXTENSION.test(pathname)) return true
  return false
}

export function isNetlifyDrawerRequest(url) {
  let parsed
  try {
    parsed = typeof url === 'string' ? new URL(url, 'https://code-for-battle.local') : url
  } catch {
    return false
  }
  if (!parsed) return false
  const host = String(parsed.hostname || '')
  const path = `${parsed.pathname || ''}${parsed.search || ''}`
  if (host === 'app.netlify.com') return true
  if (/netlify-drawer|netlify-cdp|collaborator/i.test(path)) return true
  if (host.includes('netlify') && /drawer|\/netlify\.js/i.test(path)) return true
  return false
}

export function isNavigationDenylisted(url) {
  const pathname = pathnameOf(url)
  return pathname.startsWith('/api/') || pathname.startsWith('/.netlify/')
}

export function isAudioAssetPath(url) {
  return AUDIO_EXTENSION.test(pathnameOf(url))
}

// Sprite sheet images and metadata (and their index.json) keep their file
// names across deploys. Serving them cache-first would keep an old index or
// old tags forever, so the service worker fetches them network-first and only
// falls back to a cached copy while offline.
export const MAP_DATA_CACHE = 'cfb-map-data-v1'
export function isNetworkFirstMapDataPath(url) {
  const pathname = pathnameOf(url)
  return pathname.startsWith('/images/map/sprite_sheets/') && /\.(?:json|webp|png)$/i.test(pathname)
}

export function isBulkAssetPath(url) {
  return BULK_EXTENSION.test(pathnameOf(url))
}

export function isOfflineAssetFillRequest(request) {
  const headers = request?.headers
  if (!headers || typeof headers.get !== 'function') return false
  return headers.get(OFFLINE_ASSET_FILL_HEADER) === '1'
}

export function isRuntimeFontRequest(url) {
  let parsed
  try {
    parsed = typeof url === 'string' ? new URL(url, 'https://code-for-battle.local') : url
  } catch {
    return false
  }
  if (!parsed) return false
  if (parsed.origin === 'https://fonts.googleapis.com') return true
  if (parsed.origin === 'https://fonts.gstatic.com') return true
  return false
}
