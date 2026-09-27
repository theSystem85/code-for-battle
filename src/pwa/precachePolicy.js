// Build-time precache rules shared by Vite and the unit tests.
// Videos stay on the network. Narrator MP3s under /video stay in the precache.

export const PRECACHE_MAX_FILE_BYTES = 12 * 1024 * 1024

export const PRECACHE_GLOB_PATTERNS = Object.freeze([
  '**/*.{js,css,html,svg,ico,png,webp,gif,json,webmanifest,xml,mp3,ogg,wav,woff,woff2}'
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
