// Build-time version computation shared by vite.config.js, vitest.config.js
// and scripts/release.mjs.
//
// package.json holds the last released version. Every change adds one small
// JSON file under features/unreleased/<category>/ instead of editing a shared
// version number, so parallel branches never conflict on the version.
// The displayed version is package.json plus the unreleased entries:
// any breaking entry bumps major, any feature bumps minor, any improvement or
// bugfix bumps patch. `npm run release` folds the entries into
// features/<version>.json and writes that version into package.json.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export const CATEGORIES = Object.freeze(['features', 'improvements', 'bugfixes'])
export const RELEASES_DIR = 'features'
export const UNRELEASED_DIR = join('features', 'unreleased')
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

export function parseVersion(version) {
  const match = SEMVER.exec(String(version || '').trim())
  if (!match) throw new Error(`Invalid release version "${version}" (expected MAJOR.MINOR.PATCH)`)
  return match.slice(1, 4).map(Number)
}

// entries: [{ category, breaking }]
export function bumpVersion(baseVersion, entries = []) {
  const [major, minor, patch] = parseVersion(baseVersion)
  if (!entries.length) return `${major}.${minor}.${patch}`
  if (entries.some(entry => entry.breaking === true)) return `${major + 1}.0.0`
  if (entries.some(entry => entry.category === 'features')) return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

export function validateEntry(data, file = 'entry') {
  const errors = []
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(`${file}: must be a JSON object`)
    return errors
  }
  if (typeof data.description !== 'string' || !data.description.trim()) {
    errors.push(`${file}: "description" must be a non-empty string`)
  }
  if ('breaking' in data && typeof data.breaking !== 'boolean') {
    errors.push(`${file}: "breaking" must be true or false when present`)
  }
  const extra = Object.keys(data).filter(key => key !== 'description' && key !== 'breaking')
  if (extra.length) errors.push(`${file}: unknown keys ${extra.join(', ')}`)
  return errors
}

export function readUnreleasedEntries(root) {
  const entries = []
  const errors = []
  for (const category of CATEGORIES) {
    const dir = join(root, UNRELEASED_DIR, category)
    if (!existsSync(dir)) continue
    const files = readdirSync(dir).filter(name => name.endsWith('.json')).sort()
    for (const name of files) {
      const file = join(dir, name)
      const rel = relative(root, file)
      let data
      try {
        data = JSON.parse(readFileSync(file, 'utf8'))
      } catch (error) {
        errors.push(`${rel}: invalid JSON (${error.message})`)
        continue
      }
      const entryErrors = validateEntry(data, rel)
      if (entryErrors.length) {
        errors.push(...entryErrors)
        continue
      }
      entries.push({ category, file: rel, description: data.description.trim(), breaking: data.breaking === true })
    }
  }
  return { entries, errors }
}

export function readBaseVersion(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  parseVersion(pkg.version)
  return pkg.version
}

export function computeAppVersion(root) {
  const baseVersion = readBaseVersion(root)
  const { entries, errors } = readUnreleasedEntries(root)
  if (errors.length) throw new Error(`Invalid unreleased release-note entries:\n${errors.join('\n')}`)
  return { baseVersion, version: bumpVersion(baseVersion, entries), entries }
}

// Netlify deploy previews show only their pull request label, for example
// PR758, with no version number. Production, the dev branch deploy and local
// builds show the plain version. The label is display-only; release digests
// and the service worker compare the plain APP_VERSION.
export function computeVersionLabel(version, env = {}) {
  const reviewId = String(env.REVIEW_ID || '').trim()
  if (env.CONTEXT === 'deploy-preview' && /^\d+$/.test(reviewId)) return `PR${reviewId}`
  return version
}

export function versionDefines(root, env = process.env) {
  const { version } = computeAppVersion(root)
  return {
    __APP_VERSION__: JSON.stringify(version),
    __APP_VERSION_LABEL__: JSON.stringify(computeVersionLabel(version, env))
  }
}
