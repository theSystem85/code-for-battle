import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  announceAppliedUpdate,
  classifyBuildChange,
  createLiveUpdater,
  createUpdateNoticeUi,
  isMultiplayerActive,
  LIVE_UPDATE_APPLIED_KEY,
  planStylesheetSwaps,
  swapStylesheets
} from '../../src/pwa/liveUpdate.js'
import { BUILD_INFO_PATH, shouldBypassServiceWorkerCache } from '../../src/pwa/serviceWorkerCachePolicy.js'
import { classifyOfflinePath } from '../../src/pwa/offlineAssetPlan.js'
import { UPDATE_RELOAD_GUARD } from '../../src/pwa/startupUpdate.js'

const base = {
  version: '0.62.2',
  commit: 'aaaaaaa',
  jsSignature: 'js-1',
  css: { 'html:0': '/assets/main-AAAAAAAA.css', 'html:1': '/assets/sidebar-BBBBBBBB.css' },
  releases: [{ version: '0.62.2', features: ['Existing feature'], improvements: [], bugfixes: [] }]
}

function memoryStorage() {
  const map = new Map()
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  }
}

function fakeFetch(sequence) {
  const queue = [...sequence]
  return vi.fn(async() => {
    const next = queue.length > 1 ? queue.shift() : queue[0]
    return { ok: true, json: async() => next }
  })
}

function fakeUi() {
  return { showSafe: vi.fn(), showBreaking: vi.fn(), showApplied: vi.fn(), showDeferred: vi.fn() }
}

describe('dev live update', () => {
  it('[U05300] prevents browsers and Netlify edge nodes from caching the mutable build manifest', () => {
    const netlify = readFileSync('netlify.toml', 'utf8')
    const manifestHeaders = netlify.match(/\[\[headers\]\]\s+for = "\/build-info\.json"[\s\S]*?(?=\n\[\[|$)/)?.[0] || ''
    expect(manifestHeaders).toContain('Cache-Control = "no-store, no-cache, must-revalidate, max-age=0"')
    expect(manifestHeaders).toContain('CDN-Cache-Control = "no-store"')
  })

  it('[U05211] classifies safe and breaking deploys, including the commit trailer and the state schema', () => {
    expect(classifyBuildChange(base, { ...base })).toBe('none')
    expect(classifyBuildChange(base, { ...base, commit: 'bbbbbbb', css: { ...base.css, 'html:1': '/assets/sidebar-CCCCCCCC.css' } })).toBe('safe')
    expect(classifyBuildChange(base, { ...base, commit: 'bbbbbbb' })).toBe('safe')
    expect(classifyBuildChange(base, { ...base, commit: 'bbbbbbb', jsSignature: 'js-2' })).toBe('breaking')
    expect(classifyBuildChange(base, { ...base, commit: 'bbbbbbb', update: { kind: 'breaking', reason: 'x' } })).toBe('breaking')
    expect(classifyBuildChange(base, { ...base, commit: 'bbbbbbb', update: { kind: 'safe' }, jsSignature: 'js-2' })).toBe('breaking')
    expect(classifyBuildChange(
      { ...base, coreJsSignature: 'core', modules: { 'update-notice': { signature: 'a' } } },
      { ...base, commit: 'bbbbbbb', jsSignature: 'js-2', coreJsSignature: 'core', update: { kind: 'safe' }, modules: { 'update-notice': { signature: 'b' } } }
    )).toBe('hot')
    expect(classifyBuildChange(base, { ...base, commit: 'bbbbbbb', stateSchemaVersion: 2 }, 1)).toBe('breaking')
    expect(classifyBuildChange(base, { ...base, commit: 'bbbbbbb', stateSchemaVersion: 1 }, 1)).toBe('safe')
    expect(planStylesheetSwaps(base, { ...base, css: { ...base.css, 'html:1': '/assets/sidebar-CCCCCCCC.css' } }))
      .toEqual(new Map([['/assets/sidebar-BBBBBBBB.css', '/assets/sidebar-CCCCCCCC.css']]))
  })

  it('[U05212] swaps a changed stylesheet in place and removes the old link only after the new one loaded', async() => {
    document.head.innerHTML = '<link rel="stylesheet" href="/assets/main-AAAAAAAA.css"><link rel="stylesheet" href="/assets/sidebar-BBBBBBBB.css">'
    const pending = swapStylesheets(document, new Map([['/assets/sidebar-BBBBBBBB.css', '/assets/sidebar-CCCCCCCC.css']]))
    const fresh = document.head.querySelector('link[data-live-update]')
    expect(fresh.getAttribute('href')).toBe('/assets/sidebar-CCCCCCCC.css')
    expect(document.head.querySelectorAll('link').length).toBe(3)
    fresh.dispatchEvent(new Event('load'))
    await expect(pending).resolves.toBe(1)
    expect([...document.head.querySelectorAll('link')].map(link => link.getAttribute('href')))
      .toEqual(['/assets/main-AAAAAAAA.css', '/assets/sidebar-CCCCCCCC.css'])
  })

  it('[U05213] applies a safe update live, without a reload, and tells the player', async() => {
    document.head.innerHTML = '<link rel="stylesheet" href="/assets/sidebar-BBBBBBBB.css">'
    document.body.innerHTML = '<span id="appVersion">0.62.2 (aaaaaaa)</span>'
    const next = { ...base, version: '0.62.3', commit: 'bbbbbbb', css: { ...base.css, 'html:1': '/assets/sidebar-CCCCCCCC.css' }, releases: [...base.releases, { version: '0.62.3', features: [], improvements: ['Faster update'], bugfixes: [] }] }
    const reload = vi.fn()
    const prepareReload = vi.fn()
    const ui = fakeUi()
    const updater = createLiveUpdater({ seamlessEnabled: () => true, win: { sessionStorage: memoryStorage() }, doc: document, fetchImpl: fakeFetch([base, next]), reload, prepareReload, ui, running: { version: '0.62.2', commit: 'aaaaaaa' } })
    expect(await updater.check()).toBe('baseline')
    const result = updater.check()
    await vi.waitFor(() => expect(document.head.querySelector('link[data-live-update]')).toBeTruthy())
    document.head.querySelector('link[data-live-update]').dispatchEvent(new Event('load'))
    expect(await result).toBe('safe')
    expect(reload).not.toHaveBeenCalled()
    expect(prepareReload).not.toHaveBeenCalled()
    expect(ui.showSafe).toHaveBeenCalledWith(next, 1, 0, expect.objectContaining({ improvements: ['Faster update'] }))
    expect(document.getElementById('appVersion').textContent).toBe('0.62.3 (bbbbbbb)')
    expect(updater.getBaseline().commit).toBe('bbbbbbb')
  })

  it('[U05214] never reloads a breaking update on its own: it asks, then saves, activates the worker and reloads once', async() => {
    const storage = memoryStorage()
    const order = []
    const ui = fakeUi()
    const next = { ...base, commit: 'bbbbbbb', jsSignature: 'js-2' }
    const updater = createLiveUpdater({ seamlessEnabled: () => true,
      win: { sessionStorage: storage },
      doc: document,
      fetchImpl: fakeFetch([base, next]),
      getGameState: () => ({ multiplayerSession: { isRemote: false, status: 'idle' }, partyStates: [] }),
      ui,
      stageUpdate: async() => { order.push('download') },
      prepareReload: async() => { order.push('save') },
      activateServiceWorker: async() => { order.push('sw') },
      reload: () => order.push('reload'),
      running: { version: '0.62.2', commit: 'aaaaaaa' }
    })
    await updater.check()
    expect(await updater.check()).toBe('breaking')
    expect(await updater.check()).toBe('breaking')
    expect(order).toEqual([])
    expect(ui.showBreaking).toHaveBeenCalledTimes(1)
    const [, options] = ui.showBreaking.mock.calls[0]
    expect(options.multiplayer).toBe(false)
    options.onReload()
    await vi.waitFor(() => expect(order).toEqual(['download', 'sw', 'save', 'reload']))
    expect(storage.getItem(UPDATE_RELOAD_GUARD)).toBe('1')
    expect(JSON.parse(storage.getItem(LIVE_UPDATE_APPLIED_KEY)).commit).toBe('bbbbbbb')
    // The same commit never triggers a second reload.
    expect(await updater.applyBreakingUpdate(next)).toBe('stuck')
  })

  it('[U05215] holds every update while other humans are connected over the network and offers one when the first poll already sees a new deploy', async() => {
    const reload = vi.fn()
    const ui = fakeUi()
    const mp = createLiveUpdater({ seamlessEnabled: () => true,
      win: { sessionStorage: memoryStorage() },
      fetchImpl: fakeFetch([base, { ...base, commit: 'bbbbbbb', jsSignature: 'js-2' }]),
      getGameState: () => ({ multiplayerSession: { isRemote: true } }),
      ui,
      reload,
      activateServiceWorker: async() => {},
      running: { commit: 'aaaaaaa' }
    })
    await mp.check()
    expect(await mp.check()).toBe('deferred')
    expect(await mp.check()).toBe('deferred')
    expect(ui.showDeferred).toHaveBeenCalledTimes(1)
    expect(ui.showDeferred.mock.calls[0][1]).toBe('breaking')
    expect(ui.showBreaking).not.toHaveBeenCalled()
    expect(await mp.applyBreakingUpdate({ ...base, commit: 'bbbbbbb' })).toBe('deferred')
    expect(reload).not.toHaveBeenCalled()

    const earlyUi = fakeUi()
    const early = createLiveUpdater({ seamlessEnabled: () => true, win: { sessionStorage: memoryStorage() }, fetchImpl: fakeFetch([{ ...base, commit: 'ccccccc' }]), ui: earlyUi, reload, activateServiceWorker: async() => {}, running: { commit: 'aaaaaaa' } })
    expect(await early.check()).toBe('breaking')
    expect(reload).not.toHaveBeenCalled()
    expect(earlyUi.showBreaking).toHaveBeenCalledTimes(1)
  })

  it('[U05216] only treats network matches with other humans as multiplayer, never a local game against AI', () => {
    expect(isMultiplayerActive({ multiplayerSession: { isRemote: false, status: 'idle' }, humanPlayer: 'player1', partyStates: [{ partyId: 'player1', aiActive: false, lastConnectedAt: null }] })).toBe(false)
    expect(isMultiplayerActive({ multiplayerSession: { isRemote: false, status: 'disconnected' }, partyStates: [] })).toBe(false)
    // A local game against AI with an open invite (nobody joined yet) stays in scope.
    expect(isMultiplayerActive({ multiplayerSession: { isRemote: false, status: 'pending', localRole: 'host' }, humanPlayer: 'player1', partyStates: [{ partyId: 'player2', aiActive: true, lastConnectedAt: null }] })).toBe(false)
    expect(isMultiplayerActive({ multiplayerSession: { status: 'connected' } })).toBe(true)
    expect(isMultiplayerActive({ multiplayerSession: { isRemote: true } })).toBe(true)
    expect(isMultiplayerActive({ multiplayerSession: {}, humanPlayer: 'player1', partyStates: [{ partyId: 'player2', aiActive: false, lastConnectedAt: 1 }] })).toBe(true)
  })

  it('[U05217] renders the notice bubble and sidebar line, announces the restore and keeps build-info out of every cache', () => {
    document.body.innerHTML = '<div id="sidebarFooterVersion"><div class="sidebar-version__row"><span id="appVersion">x</span></div></div>'
    const noticeUi = createUpdateNoticeUi(document)
    const onReload = vi.fn()
    const digest = { fromVersion: '0.62.3', toVersion: '0.63.0', features: ['Feature A'], improvements: ['Improvement B'], bugfixes: ['Bugfix C'] }
    noticeUi.showBreaking({ version: '0.63.0', commit: 'bbbbbbb' }, { multiplayer: false, onReload, digest })
    const bubble = document.getElementById('liveUpdateBubble')
    expect(bubble.dataset.kind).toBe('breaking')
    expect(bubble.textContent).toContain('needs a reload')
    expect([...bubble.querySelectorAll('h4')].map(element => element.textContent)).toEqual(['New features', 'Improvements', 'Bugfixes'])
    expect([...bubble.querySelectorAll('li')].map(element => element.textContent)).toEqual(['Feature A', 'Improvement B', 'Bugfix C'])
    expect(document.getElementById('liveUpdateStatus').textContent).toContain('needs a reload')
    bubble.querySelector('.live-update-bubble__button--primary').click()
    expect(onReload).toHaveBeenCalledTimes(1)
    noticeUi.showSafe({ version: '0.63.0', commit: 'ccccccc' }, 1, 0, digest)
    expect(bubble.dataset.kind).toBe('safe')
    expect(bubble.textContent).toContain('No reload needed')
    noticeUi.showDeferred({ version: '0.63.0', commit: 'ddddddd' }, 'breaking', digest)
    expect(bubble.querySelectorAll('.live-update-bubble__changes li')).toHaveLength(3)
    noticeUi.showApplied({ version: '0.63.0', commit: 'eeeeeee' }, digest)
    expect(bubble.querySelectorAll('.live-update-bubble__changes li')).toHaveLength(3)

    const storage = memoryStorage()
    storage.setItem(LIVE_UPDATE_APPLIED_KEY, JSON.stringify({ version: '0.62.3', commit: 'bbbbbbb', previousVersion: '0.62.2', previousReleases: base.releases }))
    const ui = fakeUi()
    const running = { version: '0.62.3', commit: 'bbbbbbb', releases: [...base.releases, { version: '0.62.3', features: ['Restored feature'], improvements: [], bugfixes: [] }] }
    expect(announceAppliedUpdate({ win: { sessionStorage: storage }, ui, running })).toBe(true)
    expect(ui.showApplied).toHaveBeenCalledWith(expect.objectContaining({ version: '0.62.3', commit: 'bbbbbbb' }), expect.objectContaining({ features: ['Restored feature'] }))
    expect(storage.getItem(LIVE_UPDATE_APPLIED_KEY)).toBe(null)
    expect(BUILD_INFO_PATH).toBe('/build-info.json')
    expect(shouldBypassServiceWorkerCache('https://x.test/build-info.json?t=1')).toBe(true)
    expect(classifyOfflinePath('build-info.json')).toBe('exclude')
  })
})
