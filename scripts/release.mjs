#!/usr/bin/env node
// npm run release            fold unreleased entries into a release, bump, commit, tag
// npm run release -- --dry-run   print the next version and changelog only
// npm run release:tag        (re)create the vX.Y.Z tag on the release commit of the
//                            current branch, used on main after the dev -> main
//                            rebase-merge rewrote the commit ids
//
// Nothing is pushed. Pushing the release branch, merging into main and pushing
// the tag happen only after Patrick approves (see AGENTS.md, Deployment).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATEGORIES, RELEASES_DIR, computeAppVersion, readBaseVersion } from './versioning.mjs'

// CFB_RELEASE_ROOT lets the unit tests run the script against a scratch repo.
const ROOT = process.env.CFB_RELEASE_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..')

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim()
}

function fail(message) {
  console.error(`release: ${message}`)
  process.exit(1)
}

export function buildReleaseFile(version, entries) {
  const release = { version }
  for (const category of CATEGORIES) {
    release[category] = entries.filter(entry => entry.category === category).map(entry => entry.description)
  }
  return release
}

export function formatChangelog(version, baseVersion, entries) {
  const lines = [`v${baseVersion} -> v${version}`]
  for (const category of CATEGORIES) {
    const items = entries.filter(entry => entry.category === category)
    lines.push('', `${category} (${items.length}):`)
    for (const item of items) lines.push(`  - ${item.breaking ? '[BREAKING] ' : ''}${item.description}`)
  }
  return lines.join('\n')
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}

function setPackageVersion(version) {
  const pkgPath = join(ROOT, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.version = version
  writeJson(pkgPath, pkg)
  const lockPath = join(ROOT, 'package-lock.json')
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    lock.version = version
    if (lock.packages && lock.packages['']) lock.packages[''].version = version
    writeJson(lockPath, lock)
  }
}

function release({ dryRun, allowDirty }) {
  const { baseVersion, version, entries } = computeAppVersion(ROOT)
  if (!entries.length) fail(`no unreleased entries under features/unreleased/; v${baseVersion} is current`)
  const releasePath = join(ROOT, RELEASES_DIR, `${version}.json`)
  if (existsSync(releasePath)) fail(`${RELEASES_DIR}/${version}.json already exists`)
  console.log(formatChangelog(version, baseVersion, entries))
  if (dryRun) return
  if (!allowDirty && git(['status', '--porcelain'])) fail('working tree is not clean (commit or stash first, or pass --allow-dirty)')
  if (git(['tag', '--list', `v${version}`])) fail(`tag v${version} already exists`)

  writeJson(releasePath, buildReleaseFile(version, entries))
  for (const entry of entries) unlinkSync(join(ROOT, entry.file))
  setPackageVersion(version)

  git(['add', '--all', '--', RELEASES_DIR, 'package.json', 'package-lock.json'])
  const counts = CATEGORIES.map(category => `${entries.filter(entry => entry.category === category).length} ${category}`).join(', ')
  git(['commit', '-m', `chore(release): ${version}`, '-m', `Fold ${entries.length} unreleased entries (${counts}) into ${RELEASES_DIR}/${version}.json.`])
  git(['tag', '-a', `v${version}`, '-m', `v${version}`])
  console.log(`\nCreated commit "chore(release): ${version}" and local tag v${version}. Nothing was pushed.`)
  console.log('After the dev -> main rebase-merge, run `npm run release:tag` on the updated main, then push the tag.')
}

function retag() {
  const version = readBaseVersion(ROOT)
  const subject = `chore(release): ${version}`
  const commit = git(['log', '--format=%H', '--fixed-strings', `--grep=${subject}`, '-n', '1', 'HEAD'])
  if (!commit) fail(`no "${subject}" commit on the current branch`)
  const existing = git(['tag', '--list', `v${version}`])
  if (existing) {
    const tagged = git(['rev-list', '-n', '1', `v${version}`])
    if (tagged === commit) {
      console.log(`v${version} already points at ${commit.slice(0, 8)}`)
      return
    }
    git(['tag', '-d', `v${version}`])
  }
  git(['tag', '-a', `v${version}`, '-m', `v${version}`, commit])
  console.log(`Tagged ${commit.slice(0, 8)} as v${version}. Push it with: git push origin v${version}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2))
  if (args.has('--tag')) retag()
  else release({ dryRun: args.has('--dry-run'), allowDirty: args.has('--allow-dirty') })
}
