import { APP_VERSION } from '../version.js'
import {
  buildUnreleasedRelease, compareVersions, getReleaseDigest as buildReleaseDigest,
  mergeReleaseEntries, getReleaseDelta, RELEASE_CATEGORIES
} from './releaseData.js'

export { buildUnreleasedRelease, compareVersions, getReleaseDelta, mergeReleaseEntries, RELEASE_CATEGORIES } from './releaseData.js'

const releasedFiles = Object.values(import.meta.glob('../../features/*.json', { eager: true, import: 'default' }))
const unreleasedFiles = import.meta.glob('../../features/unreleased/*/*.json', { eager: true, import: 'default' })

// Unreleased entries (one file per change under features/unreleased/<category>/)
// belong to the build's computed APP_VERSION until `npm run release` folds them
// into features/<version>.json.
const releases = mergeReleaseEntries(releasedFiles, buildUnreleasedRelease(unreleasedFiles, APP_VERSION))
export const releaseEntries = releases
export const LAST_VERSION_KEY = 'cfb-last-loaded-version'
export const LAST_DURATION_KEY = 'cfb-last-boot-duration-ms'
export const DURATION_HISTORY_KEY = 'cfb-boot-duration-history-ms'
export const LAST_RELEASES_KEY = 'cfb-last-loaded-releases'
const PREVIOUS_DIGEST_KEY = 'cfb-last-update-digest'
const PREVIOUS_VERSION_KEY = 'cfb-release-digest-from-version'

export function readBootStorage(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

export function writeBootStorage(key, value) {
  try { localStorage.setItem(key, String(value)) } catch { /* Private browsing can deny storage. */ }
}

export function getReleaseDigest(fromVersion, toVersion = APP_VERSION, entries = releases) {
  return buildReleaseDigest(fromVersion, toVersion, entries)
}

function readJson(key) {
  try { return JSON.parse(readBootStorage(key)) } catch { return null }
}

// Flatten versions so releasing previously seen unreleased notes does not show
// them again merely because their version bucket changed.
function flattenNotes(entries) {
  return [{ version: '0.0.0', ...Object.fromEntries(RELEASE_CATEGORIES.map(category =>
    [category, entries.flatMap(entry => entry[category] || [])])) }]
}

export function getBootReleaseDigest(entries = releases, version = APP_VERSION) {
  const previous = readBootStorage(LAST_VERSION_KEY)
  if (!previous || compareVersions(version, previous) < 0) return null
  const snapshot = readJson(LAST_RELEASES_KEY)
  if (Array.isArray(snapshot) && snapshot.every(entry => entry && RELEASE_CATEGORIES.every(category =>
    Array.isArray(entry[category]) && entry[category].every(text => typeof text === 'string')))) {
    const digest = getReleaseDelta(flattenNotes(snapshot), flattenNotes(entries), {
      fromVersion: previous, toVersion: version, fallback: false
    })
    return RELEASE_CATEGORIES.some(category => digest[category].length) ? digest : null
  }
  // Older clients have no snapshot; include the current version's notes once
  // even when its version number has not changed.
  if (compareVersions(version, previous) === 0) {
    return getReleaseDelta([], entries.filter(entry => entry.version === version), {
      fromVersion: previous, toVersion: version, fallback: false
    })
  }
  return buildReleaseDigest(previous, version, entries)
}

export function getManualReleaseDigest() {
  return getBootReleaseDigest() || readJson(PREVIOUS_DIGEST_KEY) || getReleaseDigest(readBootStorage(PREVIOUS_VERSION_KEY))
}

export function completeBoot(duration, digest, entries = releases, version = APP_VERSION) {
  const measured = Math.max(1, Math.round(duration))
  let history = []
  try {
    const stored = JSON.parse(readBootStorage(DURATION_HISTORY_KEY) || '[]')
    if (Array.isArray(stored)) history = stored.filter(value => Number.isFinite(value) && value > 0)
  } catch { /* Ignore malformed data left by an older build. */ }
  history = [...history.slice(-4), measured]
  const average = Math.round(history.reduce((sum, value) => sum + value, 0) / history.length)
  writeBootStorage(DURATION_HISTORY_KEY, JSON.stringify(history))
  writeBootStorage(LAST_DURATION_KEY, average)
  if (digest) {
    writeBootStorage(PREVIOUS_VERSION_KEY, digest.fromVersion)
    writeBootStorage(PREVIOUS_DIGEST_KEY, JSON.stringify(digest))
  }
  writeBootStorage(LAST_RELEASES_KEY, JSON.stringify(entries))
  writeBootStorage(LAST_VERSION_KEY, version)
}

export function getLoadingHighlights(digest) {
  return digest.features.length ? digest.features : [...digest.improvements, ...digest.bugfixes]
}

export function getHighlightIndex(elapsed, duration, count) {
  return count ? Math.min(count - 1, Math.floor(Math.max(0, elapsed) / Math.max(1, duration) * count)) : -1
}

// Both surfaces use this component. Compact mode shows one line at a time.
export function createReleaseDigest(digest, { compact = false, headingText = '' } = {}) {
  const root = document.createElement('section')
  root.className = compact ? 'release-digest release-digest--compact' : 'release-digest'
  const heading = document.createElement('h3')
  heading.textContent = headingText || (digest.fromVersion ? `Update v${digest.fromVersion} → v${digest.toVersion}` : `What’s new through v${digest.toVersion}`)
  root.appendChild(heading)
  const summary = document.createElement('p')
  summary.textContent = `${digest.features.length} new features · ${digest.improvements.length} improvements · ${digest.bugfixes.length} bugfixes`
  root.appendChild(summary)
  if (compact) {
    const row = document.createElement('p')
    row.className = 'release-digest__highlight'
    row.setAttribute('aria-live', 'polite')
    root.appendChild(row)
    let lastIndex = -1
    const highlights = getLoadingHighlights(digest)
    return { root, update(index) {
      if (index === lastIndex) return
      lastIndex = index
      row.textContent = highlights[index] || 'Preparing the updated game'
    } }
  }
  for (const category of ['features', 'improvements', 'bugfixes']) {
    const title = document.createElement('h4')
    title.textContent = { features: 'New features', improvements: 'Improvements', bugfixes: 'Bugfixes' }[category]
    root.appendChild(title)
    const list = document.createElement('ul')
    for (const text of digest[category]) {
      const item = document.createElement('li')
      item.textContent = text
      list.appendChild(item)
    }
    if (!list.childElementCount) {
      const item = document.createElement('li')
      item.textContent = 'None in this update.'
      list.appendChild(item)
    }
    root.appendChild(list)
  }
  return { root }
}
