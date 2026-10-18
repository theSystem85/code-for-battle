import { describe, expect, it, vi } from 'vitest'
import {
  announceAppliedUpdate,
  classifyBuildChange,
  createLiveUpdater,
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
  css: { 'html:0': '/assets/main-AAAAAAAA.css', 'html:1': '/assets/sidebar-BBBBBBBB.css' }
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

describe('dev live update', () => {
  it('[U05211] classifies CSS-only and JS deploys', () => {
    expect(classifyBuildChange(base, { ...base })).toBe('none')
    expect(classifyBuildChange(base, { ...base, commit: 'bbbbbbb', css: { ...base.css, 'html:1': '/assets/sidebar-CCCCCCCC.css' } })).toBe('css')
    expect(classifyBuildChange(base, { ...base, commit: 'bbbbbbb' })).toBe('css')
    expect(classifyBuildChange(base, { ...base, commit: 'bbbbbbb', jsSignature: 'js-2' })).toBe('js')
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

  it('[U05213] hot-swaps CSS without reloading and updates the version label', async() => {
    document.head.innerHTML = '<link rel="stylesheet" href="/assets/sidebar-BBBBBBBB.css">'
    document.body.innerHTML = '<span id="appVersion">0.62.2 (aaaaaaa)</span>'
    const next = { ...base, version: '0.62.3', commit: 'bbbbbbb', css: { ...base.css, 'html:1': '/assets/sidebar-CCCCCCCC.css' } }
    const reload = vi.fn()
    const prepareReload = vi.fn()
    const notify = vi.fn()
    const updater = createLiveUpdater({ win: { sessionStorage: memoryStorage() }, doc: document, fetchImpl: fakeFetch([base, next]), reload, prepareReload, notify, running: { version: '0.62.2', commit: 'aaaaaaa' } })
    expect(await updater.check()).toBe('baseline')
    const result = updater.check()
    await vi.waitFor(() => expect(document.head.querySelector('link[data-live-update]')).toBeTruthy())
    document.head.querySelector('link[data-live-update]').dispatchEvent(new Event('load'))
    expect(await result).toBe('css')
    expect(reload).not.toHaveBeenCalled()
    expect(prepareReload).not.toHaveBeenCalled()
    expect(document.getElementById('appVersion').textContent).toBe('0.62.3 (bbbbbbb)')
    expect(updater.getBaseline().commit).toBe('bbbbbbb')
  })

  it('[U05214] saves the game, activates the new worker and reloads once on a JS deploy', async() => {
    const storage = memoryStorage()
    const order = []
    const updater = createLiveUpdater({
      win: { sessionStorage: storage },
      doc: document,
      fetchImpl: fakeFetch([base, { ...base, commit: 'bbbbbbb', jsSignature: 'js-2' }]),
      getGameState: () => ({ multiplayerSession: { isRemote: false, status: 'idle' }, partyStates: [] }),
      prepareReload: async() => { order.push('save') },
      activateServiceWorker: async() => { order.push('sw') },
      reload: () => order.push('reload'),
      running: { version: '0.62.2', commit: 'aaaaaaa' }
    })
    await updater.check()
    expect(await updater.check()).toBe('reload')
    expect(order).toEqual(['save', 'sw', 'reload'])
    expect(storage.getItem(UPDATE_RELOAD_GUARD)).toBe('1')
    expect(JSON.parse(storage.getItem(LIVE_UPDATE_APPLIED_KEY)).commit).toBe('bbbbbbb')
    // The same commit never triggers a second reload.
    expect(await updater.check()).toBe('stuck')
  })

  it('[U05215] defers a JS reload during a multiplayer match and reloads when the first poll already sees a new deploy', async() => {
    const reload = vi.fn()
    const mp = createLiveUpdater({
      win: { sessionStorage: memoryStorage() },
      fetchImpl: fakeFetch([base, { ...base, commit: 'bbbbbbb', jsSignature: 'js-2' }]),
      getGameState: () => ({ multiplayerSession: { isRemote: true } }),
      reload,
      activateServiceWorker: async() => {},
      running: { commit: 'aaaaaaa' }
    })
    await mp.check()
    expect(await mp.check()).toBe('deferred')
    expect(reload).not.toHaveBeenCalled()

    const early = createLiveUpdater({ win: { sessionStorage: memoryStorage() }, fetchImpl: fakeFetch([{ ...base, commit: 'ccccccc' }]), reload, activateServiceWorker: async() => {}, running: { commit: 'aaaaaaa' } })
    expect(await early.check()).toBe('reload')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('[U05216] detects multiplayer sessions without flagging a plain single-player game', () => {
    expect(isMultiplayerActive({ multiplayerSession: { isRemote: false, status: 'idle' }, humanPlayer: 'player1', partyStates: [{ partyId: 'player1', aiActive: false, lastConnectedAt: null }] })).toBe(false)
    expect(isMultiplayerActive({ multiplayerSession: { isRemote: false, status: 'disconnected' }, partyStates: [] })).toBe(false)
    expect(isMultiplayerActive({ multiplayerSession: { status: 'connected' } })).toBe(true)
    expect(isMultiplayerActive({ multiplayerSession: {}, humanPlayer: 'player1', partyStates: [{ partyId: 'player2', aiActive: false, lastConnectedAt: 1 }] })).toBe(true)
  })

  it('[U05217] announces the applied update after the reload and keeps build-info out of every cache', () => {
    const storage = memoryStorage()
    storage.setItem(LIVE_UPDATE_APPLIED_KEY, JSON.stringify({ version: '0.62.3', commit: 'bbbbbbb' }))
    const notify = vi.fn()
    expect(announceAppliedUpdate({ win: { sessionStorage: storage }, notify, running: { commit: 'bbbbbbb' } })).toBe(true)
    expect(notify.mock.calls[0][0]).toContain('restored')
    expect(storage.getItem(LIVE_UPDATE_APPLIED_KEY)).toBe(null)
    expect(BUILD_INFO_PATH).toBe('/build-info.json')
    expect(shouldBypassServiceWorkerCache('https://x.test/build-info.json?t=1')).toBe(true)
    expect(classifyOfflinePath('build-info.json')).toBe('exclude')
  })
})
