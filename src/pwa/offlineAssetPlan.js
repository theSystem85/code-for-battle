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
  if (name === 'sw.js' || name === 'registerSW.js' || /^workbox-.*\.js$/i.test(name)) return 'exclude'
  if (name === OFFLINE_ASSETS_MANIFEST_FILE) return 'exclude'
  if (EXCLUDED_EXTENSIONS.has(extension)) return 'exclude'
  if (relative.startsWith('api/') || relative.startsWith('.netlify/')) return 'exclude'

  if (BOOT_EXTENSIONS.has(extension)) return 'boot'
  if (isBootShellImagePath(path) && (extension === 'png' || extension === 'webp' || extension === 'gif')) return 'boot'
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
