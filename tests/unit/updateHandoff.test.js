import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveUpdater } from '../../src/pwa/liveUpdate.js'
import { captureUpdateFrame, stageGameUpdate } from '../../src/pwa/updateHandoff.js'

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
    const updater = createLiveUpdater({ seamlessEnabled: () => true, win: { sessionStorage: storage() }, getGameState: () => state,
      stageUpdate: () => download, prepareReload: saved, reload, activateServiceWorker: async() => {} })
    const pending = updater.applyBreakingUpdate(info)
    expect(state.gamePaused).toBe(false)
    expect(saved).not.toHaveBeenCalled()
    expect(await updater.check()).toBe('busy')
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
    const updater = createLiveUpdater({ seamlessEnabled: () => true, win: { sessionStorage: storage() }, getGameState: () => state, ui,
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
    const updater = createLiveUpdater({ seamlessEnabled: () => true, win: { sessionStorage: storage() }, getGameState: () => state,
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

describe('seamless update opt-in and feedback', () => {
  it('[U07014] defaults to an ordinary saved reload without staging experimental assets', async() => {
    const { setSeamlessUpdateEnabled, isSeamlessUpdateEnabled } = await import('../../src/pwa/seamlessUpdateSettings.js')
    setSeamlessUpdateEnabled(false)
    expect(isSeamlessUpdateEnabled()).toBe(false)
    const stageUpdate = vi.fn()
    const prepareReload = vi.fn()
    const reload = vi.fn()
    const updater = createLiveUpdater({ win: { sessionStorage: storage() }, stageUpdate, prepareReload, reload,
      activateServiceWorker: async() => {} })
    expect(await updater.applyBreakingUpdate(info)).toBe('reload')
    expect(stageUpdate).not.toHaveBeenCalled()
    expect(prepareReload).toHaveBeenCalledOnce()
    expect(reload).toHaveBeenCalledOnce()
    setSeamlessUpdateEnabled(true)
    expect(isSeamlessUpdateEnabled()).toBe(true)
    setSeamlessUpdateEnabled(false)
  })

  it('[U07015] hides the update actions immediately and reports download progress in a top bar', async() => {
    const { createUpdateNoticeUi } = await import('../../src/pwa/liveUpdate.js')
    document.body.innerHTML = '<div id="sidebarFooterVersion"></div>'
    const ui = createUpdateNoticeUi(document)
    ui.showBreaking(info, { multiplayer: false, onReload: vi.fn() })
    expect(document.getElementById('liveUpdateBubble').hidden).toBe(false)
    ui.showDownloading(info)
    expect(document.getElementById('liveUpdateBubble').hidden).toBe(true)
    expect(document.getElementById('liveUpdateStatus')).toBeNull()
    const bar = document.getElementById('liveUpdateProgress')
    expect(bar.hasAttribute('value')).toBe(false)
    ui.showDownloading(info, { done: 2, total: 4 })
    expect(bar.value).toBe(0.5)
    ui.showError(info, new Error('offline'), vi.fn())
    expect(document.getElementById('liveUpdateProgress')).toBeNull()
    expect(document.getElementById('liveUpdateBubble').hidden).toBe(false)
  })
})

describe('update snapshot storage quota', () => {
  const originalToDataURL = globalThis.HTMLCanvasElement.prototype.toDataURL
  const originalGetContext = globalThis.HTMLCanvasElement.prototype.getContext

  afterEach(() => {
    globalThis.HTMLCanvasElement.prototype.toDataURL = originalToDataURL
    globalThis.HTMLCanvasElement.prototype.getContext = originalGetContext
    document.getElementById('gameCanvas')?.remove()
    document.getElementById('gameUpdateFrame')?.remove()
  })

  function installCanvas() {
    globalThis.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} })
    globalThis.HTMLCanvasElement.prototype.toDataURL = function() {
      return `data:image/webp;base64,${'A'.repeat(this.width * 40)}`
    }
    const canvas = document.createElement('canvas')
    canvas.id = 'gameCanvas'
    canvas.width = 30
    canvas.height = 10
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, width: 320, height: 180, top: 0, left: 0, right: 320, bottom: 180 })
    document.body.appendChild(canvas)
  }

  it('[U07056] stores a smaller battlefield snapshot when session storage rejects the full capture', () => {
    installCanvas()
    const stored = []
    const removed = []
    const win = {
      getComputedStyle: () => ({ display: 'block' }),
      sessionStorage: {
        setItem(_key, value) {
          if (value.length > 900) throw new DOMException('quota', 'QuotaExceededError')
          stored.push(value)
        },
        removeItem(key) { removed.push(key) }
      }
    }
    const frame = captureUpdateFrame({ win, doc: document, commit: 'ddddddd' })
    expect(stored).toHaveLength(1)
    expect(removed.length).toBeGreaterThan(0)
    expect(frame.commit).toBe('ddddddd')
    expect(frame.layers[0].width).toBe(320)
    expect(frame.layers[0].height).toBe(180)
    expect(JSON.parse(stored[0]).layers[0].src.length).toBeLessThanOrEqual(900)
    expect(document.getElementById('gameUpdateFrame')).not.toBeNull()
  })

  it('[U07057] rethrows storage failures that are not a quota limit', () => {
    installCanvas()
    const win = {
      getComputedStyle: () => ({ display: 'block' }),
      sessionStorage: {
        setItem() { throw new Error('storage blocked') },
        removeItem() {}
      }
    }
    expect(() => captureUpdateFrame({ win, doc: document, commit: 'ddddddd' })).toThrow('storage blocked')
    expect(document.getElementById('gameUpdateFrame')).toBeNull()
  })
})
