import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import {
  OFFLINE_ASSETS_CACHE,
  OFFLINE_ASSETS_MANIFEST_FILE,
  classifyOfflinePath,
  toPublicAssetUrl
} from './offlineAssetPlan.js'

function walkFiles(directory, root, out) {
  let names = []
  try {
    names = readdirSync(directory)
  } catch {
    return
  }
  for (const name of names) {
    if (!name || name.startsWith('.')) continue
    const fullPath = resolve(directory, name)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      walkFiles(fullPath, root, out)
      continue
    }
    if (!stat.isFile()) continue
    const rel = relative(root, fullPath).split(sep).join('/')
    out.push({ rel, size: stat.size, fullPath })
  }
}

function revisionOf(filePath) {
  const hash = createHash('md5')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}

export function buildOfflineAssetManifest(distDir) {
  const files = []
  walkFiles(distDir, distDir, files)
  const boot = []
  const assets = []
  for (const file of files) {
    const role = classifyOfflinePath(file.rel)
    if (role !== 'boot' && role !== 'bulk') continue
    const entry = {
      url: toPublicAssetUrl(file.rel),
      revision: revisionOf(file.fullPath),
      size: file.size
    }
    if (role === 'boot') boot.push(entry)
    else assets.push(entry)
  }
  boot.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
  assets.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
  return {
    cache: OFFLINE_ASSETS_CACHE,
    boot,
    assets
  }
}

export function offlineAssetManifestPlugin() {
  let outDir = ''
  return {
    name: 'cfb-offline-asset-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      if (!outDir) return
      const manifest = buildOfflineAssetManifest(outDir)
      const target = resolve(outDir, OFFLINE_ASSETS_MANIFEST_FILE)
      writeFileSync(target, JSON.stringify(manifest))
    }
  }
}
