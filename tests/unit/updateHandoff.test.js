import { describe, expect, it, vi } from 'vitest'
import { createLiveUpdater } from '../../src/pwa/liveUpdate.js'
import { stageGameUpdate } from '../../src/pwa/updateHandoff.js'

const info = { commit: 'bbbbbbb', version: '1.0.1' }
const storage = () => {
  const values = new Map()
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}

describe('background game update handoff', () => {
  it('[U06998] keeps simulation running through download, rejects duplicate clicks, and saves only after pausing', async() => {
    const state = { gameStarted: true, gamePaused: false }
    let finishDownload
    const download = new Promise(resolve => { finishDownload = resolve })
    const saved = vi.fn(async() => { expect(state.gamePaused).toBe(true) })
    const reload = vi.fn()
    const updater = createLiveUpdater({ win: { sessionStorage: storage() }, getGameState: () => state,
      stageUpdate: () => download, prepareReload: saved, reload, activateServiceWorker: async() => {} })
    const pending = updater.applyBreakingUpdate(info)
    expect(state.gamePaused).toBe(false)
    expect(saved).not.toHaveBeenCalled()
    expect(await updater.applyBreakingUpdate(info)).toBe('busy')
    finishDownload()
    expect(await pending).toBe('reload')
    expect(saved).toHaveBeenCalledOnce()
    expect(reload).toHaveBeenCalledWith(info)
  })

  it.each(['download', 'save'])('[U06999] keeps the existing game recoverable when %s fails and permits a retry', async phase => {
    const state = { gameStarted: true, gamePaused: false }
    const reload = vi.fn()
    const fail = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined)
    const ui = { showError: vi.fn() }
    const updater = createLiveUpdater({ win: { sessionStorage: storage() }, getGameState: () => state, ui,
      stageUpdate: phase === 'download' ? fail : async() => {},
      prepareReload: phase === 'save' ? fail : async() => {}, reload, activateServiceWorker: async() => {} })
    expect(await updater.applyBreakingUpdate(info)).toBe('failed')
    expect(state.gamePaused).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(ui.showError).toHaveBeenCalledOnce()
    expect(await updater.applyBreakingUpdate(info)).toBe('reload')
  })

  it('[U07000] defers if a human joins during download without pausing or saving', async() => {
    const state = { gameStarted: true, gamePaused: false }
    const saved = vi.fn()
    const updater = createLiveUpdater({ win: { sessionStorage: storage() }, getGameState: () => state,
      stageUpdate: async() => { state.multiplayerSession = { status: 'connected' } }, prepareReload: saved })
    expect(await updater.applyBreakingUpdate(info)).toBe('deferred')
    expect(state.gamePaused).toBe(false)
    expect(saved).not.toHaveBeenCalled()
  })

  it('[U07001] stores every manifest file in an isolated cache before reporting ready', async() => {
    const entries = new Map()
    const cache = { match: async key => entries.get(key)?.clone(), keys: async() => [], put: async(key, value) => entries.set(key, value) }
    const open = vi.fn(async() => cache)
    const assets = [{ url: '/index.html', revision: 'one' }, { url: '/images/prepared/tank.webp', revision: 'two' }]
    const fetchImpl = vi.fn(async url => {
      if (url === '/game-update-manifest.json') return { ok: true, json: async() => ({ ...info, assets }) }
      if (url === '/build-info.json') return { ok: true, json: async() => info }
      return new Response('downloaded', { status: 200 })
    })
    expect(await stageGameUpdate(info, { win: { caches: { open, keys: async() => [] }, navigator: { serviceWorker: { controller: {} } } }, fetchImpl })).toBe('cfb-update-bbbbbbb')
    expect(open).toHaveBeenCalledWith('cfb-update-bbbbbbb')
    expect([...entries.keys()]).toEqual(assets.map(asset => asset.url))
  })

  it('[U07002] rejects a manifest from a different deploy before downloading or pausing', async() => {
    const open = vi.fn()
    await expect(stageGameUpdate(info, { win: { caches: { open, keys: async() => [] }, navigator: { serviceWorker: { controller: {} } } },
      fetchImpl: async() => ({ ok: true, json: async() => ({ commit: 'ccccccc', assets: [{}] }) }) })).rejects.toThrow('deploy changed')
    expect(open).not.toHaveBeenCalled()
  })
})
