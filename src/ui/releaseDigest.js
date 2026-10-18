import { APP_VERSION } from '../version.js'

const RELEASE_CATEGORIES = ['features', 'improvements', 'bugfixes']
const releasedFiles = Object.values(import.meta.glob('../../features/*.json', { eager: true, import: 'default' }))
const unreleasedFiles = import.meta.glob('../../features/unreleased/*/*.json', { eager: true, import: 'default' })

// Unreleased entries (one file per change under features/unreleased/<category>/)
// belong to the build's computed APP_VERSION until `npm run release` folds them
// into features/<version>.json.
export function buildUnreleasedRelease(files, version = APP_VERSION) {
  const release = { version, features: [], improvements: [], bugfixes: [] }
  for (const path of Object.keys(files).sort()) {
    const category = path.split('/').at(-2)
    const description = files[path]?.description
    if (RELEASE_CATEGORIES.includes(category) && typeof description === 'string' && description.trim()) {
      release[category].push(description.trim())
    }
  }
  return RELEASE_CATEGORIES.some(category => release[category].length) ? release : null
}

export function mergeReleaseEntries(released, unreleased) {
  if (!unreleased) return released
  const existing = released.find(entry => compareVersions(entry.version, unreleased.version) === 0)
  if (!existing) return [...released, unreleased]
  return released.map(entry => entry === existing
    ? Object.fromEntries([['version', entry.version], ...RELEASE_CATEGORIES.map(category => [category, [...(entry[category] || []), ...unreleased[category]]])])
    : entry)
}

const releases = mergeReleaseEntries(releasedFiles, buildUnreleasedRelease(unreleasedFiles))
export const LAST_VERSION_KEY = 'cfb-last-loaded-version'
export const LAST_DURATION_KEY = 'cfb-last-boot-duration-ms'
const PREVIOUS_VERSION_KEY = 'cfb-release-digest-from-version'

export function readBootStorage(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

export function writeBootStorage(key, value) {
  try { localStorage.setItem(key, String(value)) } catch { /* Private browsing can deny storage. */ }
}

export function compareVersions(a, b) {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] || 0) - (right[i] || 0)
    if (diff) return diff
  }
  return 0
}

export function getReleaseDigest(fromVersion, toVersion = APP_VERSION, entries = releases) {
  const digest = { fromVersion, toVersion, features: [], improvements: [], bugfixes: [] }
  entries.filter(entry => (!fromVersion || compareVersions(entry.version, fromVersion) > 0) && compareVersions(entry.version, toVersion) <= 0)
    .sort((a, b) => compareVersions(a.version, b.version))
    .forEach(entry => {
      for (const category of ['features', 'improvements', 'bugfixes']) {
        for (const description of entry[category] || []) digest[category].push(description)
      }
    })
  return digest
}

export function getBootReleaseDigest() {
  const previous = readBootStorage(LAST_VERSION_KEY)
  return previous && compareVersions(APP_VERSION, previous) > 0 ? getReleaseDigest(previous) : null
}

export function getManualReleaseDigest() {
  return getBootReleaseDigest() || getReleaseDigest(readBootStorage(PREVIOUS_VERSION_KEY))
}

export function completeBoot(duration, digest) {
  writeBootStorage(LAST_DURATION_KEY, Math.max(1, Math.round(duration)))
  if (digest) writeBootStorage(PREVIOUS_VERSION_KEY, digest.fromVersion)
  writeBootStorage(LAST_VERSION_KEY, APP_VERSION)
}

export function getLoadingHighlights(digest) {
  return digest.features.length ? digest.features : [...digest.improvements, ...digest.bugfixes]
}

export function getHighlightIndex(elapsed, duration, count) {
  return count ? Math.min(count - 1, Math.floor(Math.max(0, elapsed) / Math.max(1, duration) * count)) : -1
}

// Both surfaces use this component. Compact mode shows one line at a time.
export function createReleaseDigest(digest, { compact = false } = {}) {
  const root = document.createElement('section')
  root.className = compact ? 'release-digest release-digest--compact' : 'release-digest'
  const heading = document.createElement('h3')
  heading.textContent = digest.fromVersion ? `Update v${digest.fromVersion} → v${digest.toVersion}` : `What’s new through v${digest.toVersion}`
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
      row.title = row.textContent
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
