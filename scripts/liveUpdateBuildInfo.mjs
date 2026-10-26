// Vite plugin: writes dist/build-info.json, which the dev live-update client
// (src/pwa/liveUpdate.js) polls to tell a CSS-only deploy (hot-swap the
// stylesheets) from a deploy that changed JavaScript (save, reload, restore).
//
// jsSignature hashes the rendered code of every JS module except data that
// changes on almost every PR without changing behaviour: the release-note JSON
// files under features/, src/version.json (commit hash and message) and the
// version string itself. Hashed chunk and asset file names are replaced by
// stable tokens, so a stylesheet change alone keeps the signature.
import { Buffer } from 'node:buffer'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { buildUnreleasedRelease, mergeReleaseEntries } from '../src/ui/releaseData.js'

export const BUILD_INFO_FILE = 'build-info.json'
// Format of build-info.json itself.
export const UPDATE_MANIFEST_VERSION = 1
export const LIVE_MODULES = {
  'update-notice': 'src/pwa/swappable/updateNotice.js'
}
const UPDATE_TRAILER = /^Live-Update:\s*(safe|breaking)\b\s*(.*)$/im

// The coding agent records its safe-vs-breaking decision as a commit trailer,
// e.g. "Live-Update: breaking (changes unit AI)". Without one, the client
// decides from the JS signature and the state schema version.
export function readUpdateDecision(commitBody = '') {
  const match = String(commitBody || '').match(UPDATE_TRAILER)
  if (!match) return { kind: 'auto', reason: '' }
  return { kind: match[1].toLowerCase(), reason: match[2].trim().replace(/^[(-]\s*|\)$/g, '') }
}

function readHeadCommitBody(root) {
  try {
    return execSync('git log -1 --format=%B', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
  } catch {
    return ''
  }
}

const EXCLUDED_MODULE = /[\\/](?:features[\\/][^?]*\.json|src[\\/]version\.json)(?:\?.*)?$/
const GLOB_ENTRY = /["'](?:\.\.\/)+features\/[^"']+\.json["']\s*:\s*[\w$]+\s*,?/g
const HASHED_NAME = /([\w.-]+?)-[\w-]{8}\.(js|css)\b/g

export function normalizeModuleCode(code, { version = '' } = {}) {
  let out = String(code || '')
  if (version) out = out.split(version).join('<version>')
  out = out.replace(GLOB_ENTRY, '')
  out = out.replace(HASHED_NAME, (_match, name, ext) => `${name}-<hash>.${ext}`)
  return out
}

export function computeJsSignature(bundle, options = {}) {
  const parts = []
  for (const output of Object.values(bundle)) {
    if (output.type !== 'chunk') continue
    for (const [id, module] of Object.entries(output.modules || {})) {
      if (EXCLUDED_MODULE.test(id)) continue
      if (options.excludeModules?.some(moduleId => id.replace(/\\/g, '/').endsWith(moduleId))) continue
      const key = id.replace(options.root || '', '')
      parts.push(`${output.name}::${key}::${normalizeModuleCode(module.code, options)}`)
    }
  }
  parts.sort()
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32)
}

export function collectLiveModules(bundle, root = '') {
  const modules = {}
  for (const [key, moduleId] of Object.entries(LIVE_MODULES)) {
    const normalizedId = resolve(root, moduleId).replace(/\\/g, '/')
    const chunk = Object.values(bundle).find(output => output.type === 'chunk'
      && output.facadeModuleId?.replace(/\\/g, '/') === normalizedId)
    const source = chunk?.modules?.[normalizedId]?.code
    if (!chunk || source === undefined) continue
    modules[key] = {
      url: `/${chunk.fileName}`,
      signature: createHash('sha256').update(normalizeModuleCode(source)).digest('hex').slice(0, 16)
    }
  }
  return modules
}

// Stable keys for every stylesheet the page can load: the <link> tags of
// index.html by position and the CSS that Vite attaches to each JS chunk.
export function collectStylesheets(bundle, root = '') {
  const css = {}
  const html = bundle['index.html']
  const source = html && typeof html.source === 'string' ? html.source : (html?.source ? Buffer.from(html.source).toString('utf8') : '')
  const links = [...source.matchAll(/<link\b[^>]*\bhref="([^"]+\.css)"[^>]*>/g)].map(match => match[1])
  links.filter(href => href.startsWith('/assets/')).forEach((href, index) => { css[`html:${index}`] = href })
  for (const output of Object.values(bundle)) {
    if (output.type !== 'chunk') continue
    const imported = [...(output.viteMetadata?.importedCss || [])].sort()
    const owner = output.facadeModuleId
      ? output.facadeModuleId.replace(root, '').replace(/\\/g, '/').replace(/^\//, '')
      : output.name
    imported.forEach((fileName, index) => {
      const key = `chunk:${owner}:${index}`
      if (!css[key]) css[key] = `/${fileName}`
    })
  }
  return css
}

function readCommitInfo(root) {
  try {
    return JSON.parse(readFileSync(resolve(root, 'src/version.json'), 'utf8'))
  } catch {
    return {}
  }
}

export function readReleaseEntries(root, version) {
  const featureRoot = resolve(root, 'features')
  const released = readdirSync(featureRoot, { withFileTypes: true })
    .filter(item => item.isFile() && item.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(item => JSON.parse(readFileSync(resolve(featureRoot, item.name), 'utf8')))
  const unreleased = {}
  for (const category of ['features', 'improvements', 'bugfixes']) {
    const directory = resolve(featureRoot, 'unreleased', category)
    let files = []
    try { files = readdirSync(directory, { withFileTypes: true }) } catch { /* Category may be empty in a release commit. */ }
    for (const item of files.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!item.isFile() || !item.name.endsWith('.json')) continue
      const key = `features/unreleased/${category}/${item.name}`
      unreleased[key] = JSON.parse(readFileSync(resolve(directory, item.name), 'utf8'))
    }
  }
  return mergeReleaseEntries(released, buildUnreleasedRelease(unreleased, version))
}

export function isLiveUpdateBuild(env = process.env) {
  if (env.CFB_LIVE_UPDATE === '1') return true
  if (env.CFB_LIVE_UPDATE === '0') return false
  // Netlify: only the dev branch deploy, never production or deploy previews.
  return env.CONTEXT === 'branch-deploy' && env.BRANCH === 'dev'
}

export function liveUpdateBuildInfoPlugin({ root, version, enabled, stateSchemaVersion }) {
  return {
    name: 'cfb-live-update-build-info',
    apply: 'build',
    enforce: 'post',
    buildStart() {
      if (!enabled) return
      for (const [key, moduleId] of Object.entries(LIVE_MODULES)) {
        this.emitFile({ type: 'chunk', id: resolve(root, moduleId), name: `live-${key}` })
      }
    },
    generateBundle(_options, bundle) {
      if (!bundle['index.html']) return
      if (enabled) {
        const migrationSource = readFileSync(resolve(root, 'src/gameStateMigrations.js'), 'utf8')
        const missing = []
        for (let target = 2; target <= stateSchemaVersion; target += 1) {
          if (!new RegExp(`migrations\\s*\\[\\s*${target}\\s*\\]\\s*=`).test(migrationSource)) missing.push(target)
        }
        if (missing.length) {
          this.warn(`GAME_STATE_SCHEMA_VERSION ${stateSchemaVersion} has no migration(s) targeting version(s): ${missing.join(', ')}`)
        }
      }
      const commitInfo = readCommitInfo(root)
      const info = {
        manifestVersion: UPDATE_MANIFEST_VERSION,
        version,
        commit: commitInfo.commit || 'unknown',
        message: commitInfo.message || '',
        builtAt: new Date().toISOString(),
        liveUpdate: Boolean(enabled),
        stateSchemaVersion,
        update: readUpdateDecision(readHeadCommitBody(root)),
        releases: readReleaseEntries(root, version),
        jsSignature: computeJsSignature(bundle, { version, root }),
        coreJsSignature: computeJsSignature(bundle, { version, root, excludeModules: Object.values(LIVE_MODULES) }),
        modules: collectLiveModules(bundle, root),
        css: collectStylesheets(bundle, root)
      }
      this.emitFile({ type: 'asset', fileName: BUILD_INFO_FILE, source: `${JSON.stringify(info, null, 2)}\n` })
    }
  }
}
