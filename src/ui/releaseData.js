export const RELEASE_CATEGORIES = ['features', 'improvements', 'bugfixes']

export function compareVersions(a = '', b = '') {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] || 0) - (right[i] || 0)
    if (diff) return diff
  }
  return 0
}

export function buildUnreleasedRelease(files, version) {
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

export function getReleaseDigest(fromVersion, toVersion, entries) {
  const digest = { fromVersion, toVersion, features: [], improvements: [], bugfixes: [] }
  entries.filter(entry => (!fromVersion || compareVersions(entry.version, fromVersion) > 0) && compareVersions(entry.version, toVersion) <= 0)
    .sort((a, b) => compareVersions(a.version, b.version))
    .forEach(entry => {
      for (const category of RELEASE_CATEGORIES) digest[category].push(...(entry[category] || []))
    })
  return digest
}

// Live dev builds commonly share a version. Compare the actual entries per
// version, preserving duplicate counts, instead of relying only on semver.
export function getReleaseDelta(previous = [], next = [], { fromVersion, toVersion, fallback = true } = {}) {
  const digest = { fromVersion, toVersion, features: [], improvements: [], bugfixes: [] }
  const previousByVersion = new Map(previous.map(entry => [entry.version, entry]))
  const ordered = [...next].sort((a, b) => compareVersions(a.version, b.version))
  for (const entry of ordered) {
    const before = previousByVersion.get(entry.version)
    for (const category of RELEASE_CATEGORIES) {
      const remaining = new Map()
      for (const text of before?.[category] || []) remaining.set(text, (remaining.get(text) || 0) + 1)
      for (const text of entry[category] || []) {
        const count = remaining.get(text) || 0
        if (count) remaining.set(text, count - 1)
        else digest[category].push(text)
      }
    }
  }
  if (!fallback || RELEASE_CATEGORIES.some(category => digest[category].length)) return digest
  const current = ordered.filter(entry => compareVersions(entry.version, toVersion) === 0)
  for (const entry of current) {
    for (const category of RELEASE_CATEGORIES) digest[category].push(...(entry[category] || []))
  }
  return digest
}
