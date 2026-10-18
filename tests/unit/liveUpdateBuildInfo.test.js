import { describe, expect, it } from 'vitest'
import { collectStylesheets, computeJsSignature, isLiveUpdateBuild, normalizeModuleCode } from '../../scripts/liveUpdateBuildInfo.mjs'

function bundleWith({ code, digest = '', version = '0.62.2', cssName = 'sidebar-BBBBBBBB.css' }) {
  return {
    'index.html': { type: 'asset', source: `<link rel="stylesheet" crossorigin href="/assets/main-AAAAAAAA.css"><link rel="stylesheet" href="/assets/${cssName}">` },
    'assets/main-12345678.js': {
      type: 'chunk',
      name: 'main',
      facadeModuleId: '/repo/index.html',
      viteMetadata: { importedCss: new Set([`assets/${cssName}`]) },
      modules: {
        '/repo/src/game.js': { code },
        '/repo/src/ui/releaseDigest.js': { code: `const u = Object.assign({${digest}"../../features/0.62.1.json": __vite_glob_0_0})` },
        '/repo/features/unreleased/bugfixes/x.json': { code: 'const x = { description: "new entry" }' },
        '/repo/src/version.json': { code: 'const v = { commit: "abc1234" }' },
        '/repo/src/version.js': { code: `const APP_VERSION = "${version}"; import("./lazy-ABCDEFGH.js")` }
      }
    }
  }
}

describe('live update build info', () => {
  it('[U05218] keeps the JS signature for stylesheet, release-note and version-only changes', () => {
    const a = computeJsSignature(bundleWith({ code: 'run()' }), { version: '0.62.2' })
    const b = computeJsSignature(bundleWith({ code: 'run()', version: '0.63.0', digest: '"../../features/unreleased/features/y.json": __vite_glob_1_0,', cssName: 'sidebar-CCCCCCCC.css' }), { version: '0.63.0' })
    expect(b).toBe(a)
    expect(computeJsSignature(bundleWith({ code: 'run(); runMore()' }), { version: '0.62.2' })).not.toBe(a)
    expect(normalizeModuleCode('import("./lazy-ABCDEFGH.js")')).toBe('import("./lazy-<hash>.js")')
  })

  it('[U05219] maps every stylesheet to a stable key and enables live updates only on the dev branch deploy', () => {
    expect(collectStylesheets(bundleWith({ code: '' }), '/repo')).toEqual({
      'html:0': '/assets/main-AAAAAAAA.css',
      'html:1': '/assets/sidebar-BBBBBBBB.css',
      'chunk:index.html:0': '/assets/sidebar-BBBBBBBB.css'
    })
    expect(isLiveUpdateBuild({ CONTEXT: 'branch-deploy', BRANCH: 'dev' })).toBe(true)
    expect(isLiveUpdateBuild({ CONTEXT: 'production', BRANCH: 'main' })).toBe(false)
    expect(isLiveUpdateBuild({ CONTEXT: 'deploy-preview', BRANCH: 'dev' })).toBe(false)
    expect(isLiveUpdateBuild({ CFB_LIVE_UPDATE: '1' })).toBe(true)
    expect(isLiveUpdateBuild({ CFB_LIVE_UPDATE: '0', CONTEXT: 'branch-deploy', BRANCH: 'dev' })).toBe(false)
  })
})
