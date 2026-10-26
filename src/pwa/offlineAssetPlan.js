// Shared by the build manifest, the service worker, and the page.
// The Workbox precache stays a small boot shell. Everything else needed
// offline is listed in the versioned offline-assets manifest.

export const OFFLINE_ASSETS_CACHE = 'cfb-offline-assets-v1'
export const OFFLINE_ASSETS_MANIFEST_PATH = '/offline-assets-manifest.json'
export const OFFLINE_ASSETS_MANIFEST_FILE = 'offline-assets-manifest.json'
export const OFFLINE_ASSET_FILL_HEADER = 'x-cfb-offline-fill'
export const OFFLINE_ASSET_REVISION_HEADER = 'x-cfb-asset-revision'
export const OFFLINE_ASSET_CONCURRENCY = 5
export const OFFLINE_ASSET_MAX_ATTEMPTS = 4
export const OFFLINE_ASSET_RETRY_BASE_MS = 400
export const NAVIGATION_NETWORK_TIMEOUT_MS = 3000
export const SPRITE_DERIVATIVE_REVISION_PARAM = 'cfb-content'
export const SPRITE_DERIVATIVE_CACHE = 'cfb-sprite-derivatives-v1'
export const SPRITE_DERIVATIVE_CACHE_MAX_ENTRIES = 96
export const SPRITE_SHEET_LOAD_CONCURRENCY = 2
export const OFFLINE_SPRITE_MINIMUM_TIER = 'coarse'
export const OFFLINE_SPRITE_STORAGE_QUOTA_BYTES = 128 * 1024 * 1024

const BOOT_EXTENSIONS = new Set(['js', 'css', 'html', 'svg', 'ico', 'webmanifest', 'xml', 'woff', 'woff2'])
const BULK_EXTENSIONS = new Set(['png', 'webp', 'gif', 'json', 'mp3', 'ogg', 'wav'])
const EXCLUDED_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'map'])
const BOOT_IMAGE_PREFIXES = ['images/sidebar/']

export function normalizeAssetPath(value) {
  if (!value) return ''
  let path = String(value).replace(/\\/g, '/')
  try {
    if (path.includes('://')) path = new URL(path).pathname
  } catch {
    // Keep a path that is not a URL.
  }
  path = path.split('?')[0].split('#')[0]
  if (!path.startsWith('/')) path = `/${path}`
  path = path.replace(/\/{2,}/g, '/')
  try {
    path = decodeURIComponent(path)
  } catch {
    // Leave a broken escape as-is.
  }
  return path
}

export function toPublicAssetUrl(relativePath) {
  const normalized = normalizeAssetPath(relativePath)
  // encodeURI keeps path separators and "@" (body-atlas@2x.webp). Encoding "@"
  // as %40 makes Vite preview 404 and misses the URL the game actually requests.
  return encodeURI(normalized)
}

function urlFrom(value) {
  try {
    return new URL(String(value), 'https://code-for-battle.local')
  } catch {
    return null
  }
}

export function createImmutableSpriteDerivativeUrl(path, contentIdentity) {
  const identity = String(contentIdentity || '')
  if (!/^[a-z0-9][a-z0-9._-]{7,127}$/i.test(identity)) throw new TypeError('Invalid sprite derivative content identity')
  const url = urlFrom(path)
  if (!url || !isPreparedSpritePath(url.pathname)) throw new TypeError('Invalid sprite derivative path')
  url.searchParams.set(SPRITE_DERIVATIVE_REVISION_PARAM, identity)
  return `${url.pathname}${url.search}${url.hash}`
}

export function isImmutableSpriteDerivativeUrl(value) {
  const url = urlFrom(value)
  if (!url || !isPreparedSpritePath(url.pathname)) return false
  return /^[a-z0-9][a-z0-9._-]{7,127}$/i.test(url.searchParams.get(SPRITE_DERIVATIVE_REVISION_PARAM) || '')
}

function isPreparedSpritePath(pathname) {
  return pathname.startsWith('/images/prepared/') || pathname.startsWith('/images/prepared-map-sprites/')
}

// The caller supplies one entry per representation. Only the minimum usable
// tier and the selected final tier at one density are retained for offline use.
export function selectOfflineSpriteRepresentations(entries, {
  selectedTier = 'final',
  selectedDensity = 1,
  quotaBytes = OFFLINE_SPRITE_STORAGE_QUOTA_BYTES
} = {}) {
  const allowedTiers = new Set([OFFLINE_SPRITE_MINIMUM_TIER, selectedTier])
  const candidates = (entries || []).filter(entry => allowedTiers.has(entry.tier)
    && Number(entry.density) === Number(selectedDensity)
    && isImmutableSpriteDerivativeUrl(entry.url))
    .sort((left, right) => {
      const tierOrder = Number(left.tier !== OFFLINE_SPRITE_MINIMUM_TIER) - Number(right.tier !== OFFLINE_SPRITE_MINIMUM_TIER)
      return tierOrder || String(left.url).localeCompare(String(right.url))
    })
  const coarse = candidates.filter(entry => entry.tier === OFFLINE_SPRITE_MINIMUM_TIER)
  const final = candidates.filter(entry => entry.tier !== OFFLINE_SPRITE_MINIMUM_TIER)
  const bytesOf = list => list.reduce((sum, entry) => sum + Math.max(0, Number(entry.size) || 0), 0)
  const coarseBytes = bytesOf(coarse)
  if (coarseBytes > quotaBytes) {
    return Object.freeze({ assets: Object.freeze([]), bytes: 0, quotaBytes, usable: false, finalIncluded: false })
  }
  const finalBytes = bytesOf(final)
  const finalIncluded = coarseBytes + finalBytes <= quotaBytes
  const selected = finalIncluded ? coarse.concat(final) : coarse
  return Object.freeze({
    assets: Object.freeze(selected),
    bytes: coarseBytes + (finalIncluded ? finalBytes : 0),
    quotaBytes,
    usable: coarse.length > 0,
    finalIncluded
  })
}

export function offlineSpritePolicyManifest() {
  return Object.freeze({
    minimumTier: OFFLINE_SPRITE_MINIMUM_TIER,
    selectedFinalTierOnly: true,
    selectedDensityOnly: true,
    automaticDerivativeDownload: false,
    quotaBytes: OFFLINE_SPRITE_STORAGE_QUOTA_BYTES
  })
}

export async function loadSpriteSheetsWithOverlap(items, load, {
  concurrency = SPRITE_SHEET_LOAD_CONCURRENCY,
  shouldLoad = () => true
} = {}) {
  if (typeof load !== 'function') throw new TypeError('Sprite sheet loader is required')
  const queue = (items || []).filter(shouldLoad)
  const results = new Array(queue.length)
  let cursor = 0
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency) || 1, queue.length || 1))
  async function worker() {
    while (cursor < queue.length) {
      const index = cursor
      cursor += 1
      results[index] = await load(queue[index], index)
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

/** Selects the active coarse/final representations before any request starts,
 * then caches only that bounded set and removes stale derivative entries. */
export async function cacheSelectedOfflineSpriteRepresentations(entries, {
  cache,
  load,
  selectedTier = 'final',
  selectedDensity = 1,
  quotaBytes = OFFLINE_SPRITE_STORAGE_QUOTA_BYTES,
  concurrency = SPRITE_SHEET_LOAD_CONCURRENCY,
  waitForDownloadSlot = async() => {}
} = {}) {
  if (!cache?.put || !cache?.keys || !cache?.delete) throw new TypeError('A writable derivative cache is required')
  const plan = selectOfflineSpriteRepresentations(entries, { selectedTier, selectedDensity, quotaBytes })
  await loadSpriteSheetsWithOverlap(plan.assets, async entry => {
    await waitForDownloadSlot(entry)
    const response = await load(entry)
    await cache.put(entry.url, response)
    return entry.url
  }, { concurrency })
  const selectedUrls = new Set(plan.assets.map(entry => entry.url))
  for (const request of await cache.keys()) {
    const url = typeof request === 'string' ? request : request.url
    if (isImmutableSpriteDerivativeUrl(url) && !selectedUrls.has(url)) await cache.delete(request)
  }
  return plan
}

function extensionOf(path) {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

function fileNameOf(path) {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function isBootShellImagePath(value) {
  const relative = normalizeAssetPath(value).slice(1)
  if (BOOT_IMAGE_PREFIXES.some(prefix => relative.startsWith(prefix))) return true
  if (relative.includes('/')) return false
  return /^(?:favicon.*|apple-touch-icon|android-chrome-.*)\.png$/i.test(relative)
}

export function classifyOfflinePath(relativePath) {
  const path = normalizeAssetPath(relativePath)
  const relative = path.slice(1)
  const name = fileNameOf(path)
  const extension = extensionOf(path)

  if (!relative || relative.endsWith('/')) return 'exclude'
  if (relative === 'offline-probe.txt') return 'exclude'
  if (relative === 'build-info.json') return 'exclude'
  if (name === 'sw.js' || name === 'registerSW.js' || /^workbox-.*\.js$/i.test(name)) return 'exclude'
  if (name === OFFLINE_ASSETS_MANIFEST_FILE) return 'exclude'
  if (EXCLUDED_EXTENSIONS.has(extension)) return 'exclude'
  if (relative.startsWith('api/') || relative.startsWith('.netlify/')) return 'exclude'

  if (BOOT_EXTENSIONS.has(extension)) return 'boot'
  if (isBootShellImagePath(path) && (extension === 'png' || extension === 'webp' || extension === 'gif')) return 'boot'
  // Prepared variants and source unit imagery are fetched on demand at the active DPR.
  if (((relative.startsWith('images/prepared/') || relative.startsWith('images/prepared-map-sprites/')) && extension !== 'json') || relative.startsWith('images/map/units/')) return 'exclude'
  if (BULK_EXTENSIONS.has(extension)) return 'bulk'
  return 'exclude'
}

export function contentTypeForAssetUrl(url) {
  const extension = extensionOf(normalizeAssetPath(url))
  switch (extension) {
    case 'mp3': return 'audio/mpeg'
    case 'ogg': return 'audio/ogg'
    case 'wav': return 'audio/wav'
    case 'png': return 'image/png'
    case 'webp': return 'image/webp'
    case 'gif': return 'image/gif'
    case 'json': return 'application/json'
    case 'js': return 'text/javascript'
    case 'css': return 'text/css'
    case 'html': return 'text/html'
    case 'svg': return 'image/svg+xml'
    default: return 'application/octet-stream'
  }
}
