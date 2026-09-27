// Build-time precache rules shared by Vite and the unit tests.
// The Workbox precache is only the boot shell so install can finish and activate
// on a flaky phone. Bulk images, audio, and JSON are listed separately and
// downloaded after activation. Videos stay on the network.

export const PRECACHE_MAX_FILE_BYTES = 12 * 1024 * 1024

export const PRECACHE_GLOB_PATTERNS = Object.freeze([
  '**/*.{js,css,html,svg,ico,webmanifest,xml,woff,woff2}',
  'favicon*.png',
  'apple-touch-icon.png',
  'android-chrome-*.png',
  'images/sidebar/**/*.{png,webp,gif}',
  'offline-assets-manifest.json'
])

export const PRECACHE_GLOB_IGNORES = Object.freeze([
  '**/*.{mp4,webm,mov,m4v}',
  '**/offline-probe.txt',
  'sw.js',
  'workbox-*.js',
  'registerSW.js'
])

export const OFFLINE_PROBE_PATH = '/offline-probe.txt'
export const FORCED_OFFLINE_STORAGE_KEY = 'cfb-forced-offline'
