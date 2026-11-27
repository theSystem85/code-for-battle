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

export function appendReleaseNote(release, category, description, todoIds) {
  const index = release[category].push(description) - 1
  if (todoIds?.length) {
    release.todoIds ??= {}
    release.todoIds[category] ??= {}
    release.todoIds[category][index] = todoIds
  }
}

export function buildUnreleasedRelease(files, version) {
  const release = { version, features: [], improvements: [], bugfixes: [] }
  for (const path of Object.keys(files).sort()) {
    const category = path.split('/').at(-2)
    const description = files[path]?.description
    if (RELEASE_CATEGORIES.includes(category) && typeof description === 'string' && description.trim()) {
      appendReleaseNote(release, category, description.trim(), files[path].todoIds)
    }
  }
  return RELEASE_CATEGORIES.some(category => release[category].length) ? release : null
}

export function mergeReleaseEntries(released, unreleased) {
  if (!unreleased) return released
  const existing = released.find(entry => compareVersions(entry.version, unreleased.version) === 0)
  if (!existing) return [...released, unreleased]
  const combined = { version: existing.version, features: [], improvements: [], bugfixes: [] }
  for (const source of [existing, unreleased]) {
    for (const category of RELEASE_CATEGORIES) {
      for (const [index, description] of (source[category] || []).entries()) {
        appendReleaseNote(combined, category, description, source.todoIds?.[category]?.[index])
      }
    }
  }
  return released.map(entry => entry === existing ? combined : entry)
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

// Unreleased notes can carry forward under a different build version or be
// folded into a release. Match note counts across versions within each category.
export function getReleaseDelta(previous, next, { fromVersion, toVersion } = {}) {
  const digest = { fromVersion, toVersion, features: [], improvements: [], bugfixes: [] }
  if (!Array.isArray(previous) || !Array.isArray(next)) return digest

  const ordered = next.filter(entry => !toVersion || compareVersions(entry.version, toVersion) <= 0)
    .sort((a, b) => compareVersions(a.version, b.version))
  for (const category of RELEASE_CATEGORIES) {
    const remaining = new Map()
    for (const entry of previous) {
      for (const text of entry[category] || []) remaining.set(text, (remaining.get(text) || 0) + 1)
    }
    for (const entry of ordered) {
      for (const text of entry[category] || []) {
        const count = remaining.get(text) || 0
        if (count) remaining.set(text, count - 1)
        else digest[category].push(text)
      }
    }
  }
  return digest
}
