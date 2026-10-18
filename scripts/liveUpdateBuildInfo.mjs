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
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

export const BUILD_INFO_FILE = 'build-info.json'

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
      const key = id.replace(options.root || '', '')
      parts.push(`${output.name}::${key}::${normalizeModuleCode(module.code, options)}`)
    }
  }
  parts.sort()
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32)
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

export function isLiveUpdateBuild(env = process.env) {
  if (env.CFB_LIVE_UPDATE === '1') return true
  if (env.CFB_LIVE_UPDATE === '0') return false
  // Netlify: only the dev branch deploy, never production or deploy previews.
  return env.CONTEXT === 'branch-deploy' && env.BRANCH === 'dev'
}

export function liveUpdateBuildInfoPlugin({ root, version, enabled }) {
  return {
    name: 'cfb-live-update-build-info',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      if (!bundle['index.html']) return
      const commitInfo = readCommitInfo(root)
      const info = {
        version,
        commit: commitInfo.commit || 'unknown',
        message: commitInfo.message || '',
        builtAt: new Date().toISOString(),
        liveUpdate: Boolean(enabled),
        jsSignature: computeJsSignature(bundle, { version, root }),
        css: collectStylesheets(bundle, root)
      }
      this.emitFile({ type: 'asset', fileName: BUILD_INFO_FILE, source: `${JSON.stringify(info, null, 2)}\n` })
    }
  }
}
