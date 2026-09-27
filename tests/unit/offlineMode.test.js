import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  PRECACHE_GLOB_IGNORES,
  PRECACHE_GLOB_PATTERNS,
  PRECACHE_MAX_FILE_BYTES
} from '../../src/pwa/precachePolicy.js'
import {
  computeEffectiveOffline,
  createOfflineSnapshot,
  probeConnectivity,
  readForcedOffline,
  setOfflineSnapshot,
  shouldSkipMilestoneVideo,
  writeForcedOffline
} from '../../src/pwa/offlineState.js'
import {
  cachedResponseSize,
  formatCachedByteSize,
  formatOfflineCacheTooltip,
  resolveOfflineCacheBytes,
  sumCachedResponseBytes
} from '../../src/pwa/offlineCacheSize.js'
import { isNetlifyDrawerRequest, shouldBypassServiceWorkerCache } from '../../src/pwa/serviceWorkerCachePolicy.js'
import { applyOfflineModeDom, offlineStringsForTest, placeFloatingTip } from '../../src/pwa/offlineController.js'
import {
  applyOfflineCacheSettings,
  applyOfflineClearDialog,
  clearOfflineAppCache,
  createOfflineLongPress,
  formatOfflineSettingsSize,
  isAppOfflineCacheName,
  offlineClearCopy
} from '../../src/pwa/offlineCacheClear.js'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null
    },
    setItem(key, value) {
      data[key] = String(value)
    },
    removeItem(key) {
      delete data[key]
    }
  }
}

function responseWith({ contentLength, body }) {
  const headers = contentLength == null ? {} : { 'content-length': String(contentLength) }
  return new Response(body, { headers })
}

function cacheStorageFrom(cachesByName) {
  return {
    async keys() {
      return Object.keys(cachesByName)
    },
    async open(name) {
      const entries = cachesByName[name] || []
      return {
        async keys() {
          return entries.map(entry => entry.request)
        },
        async match(request) {
          const found = entries.find(entry => entry.request === request)
          return found ? found.response : undefined
        }
      }
    }
  }
}

describe('offline mode state', () => {
  it('treats forced offline, a dropped line, or a failed probe as offline', () => {
    expect(computeEffectiveOffline({ navigatorOnLine: true, forced: false, probeFailed: false })).toBe(false)
    expect(computeEffectiveOffline({ navigatorOnLine: false, forced: false, probeFailed: false })).toBe(true)
    expect(computeEffectiveOffline({ navigatorOnLine: true, forced: true, probeFailed: false })).toBe(true)
    expect(computeEffectiveOffline({ navigatorOnLine: true, forced: false, probeFailed: true })).toBe(true)
  })

  it('persists the forced-offline toggle in storage', () => {
    const storage = memoryStorage()
    expect(readForcedOffline(storage)).toBe(false)
    writeForcedOffline(storage, true)
    expect(readForcedOffline(storage)).toBe(true)
    expect(storage.getItem('cfb-forced-offline')).toBe('1')
    writeForcedOffline(storage, false)
    expect(readForcedOffline(storage)).toBe(false)
    expect(readForcedOffline(null)).toBe(false)
  })

  it('publishes one effective snapshot and skips milestone video while offline', () => {
    const snapshot = setOfflineSnapshot({ navigatorOnLine: true, forced: true, probeFailed: false })
    expect(snapshot).toEqual(createOfflineSnapshot({ navigatorOnLine: true, forced: true, probeFailed: false }))
    expect(shouldSkipMilestoneVideo()).toBe(true)
    setOfflineSnapshot({ navigatorOnLine: true, forced: false, probeFailed: false })
    expect(shouldSkipMilestoneVideo(false)).toBe(false)
    expect(shouldSkipMilestoneVideo(true)).toBe(true)
  })

  it('counts a failed connectivity probe and a successful one', async() => {
    await expect(probeConnectivity(async() => {
      throw new Error('offline')
    })).resolves.toBe(false)
    await expect(probeConnectivity(async() => ({ ok: true }))).resolves.toBe(true)
    await expect(probeConnectivity(async() => ({ ok: false }))).resolves.toBe(false)
  })
})

describe('offline cache size', () => {
  it('formats megabytes and the ready and preparing tooltips', () => {
    expect(formatCachedByteSize(42.3 * 1024 * 1024)).toBe('42.3 MB')
    expect(formatOfflineCacheTooltip({
      ready: true,
      bytes: 42.3 * 1024 * 1024
    })).toBe('Offline ready, 42.3 MB cached')
    expect(formatOfflineCacheTooltip({ ready: false, percent: 40.2 })).toBe('Preparing offline cache… 40%')
  })

  it('sums Content-Length and falls back to the blob size', async() => {
    const headerResponse = responseWith({ contentLength: 1000, body: 'short' })
    const blobResponse = responseWith({ body: 'abcdef' })
    expect(await cachedResponseSize(headerResponse)).toBe(1000)
    expect(await cachedResponseSize(blobResponse)).toBe(6)

    const summed = await sumCachedResponseBytes(cacheStorageFrom({
      'workbox-precache-v2': [
        { request: '/app.js', response: headerResponse },
        { request: '/sound.mp3', response: blobResponse }
      ]
    }))
    expect(summed).toEqual({ bytes: 1006, entries: 2 })
  })

  it('reports an empty cache as zero and uses the storage estimate only when Cache Storage cannot be read', async() => {
    const empty = await resolveOfflineCacheBytes({
      cacheStorage: cacheStorageFrom({}),
      estimate: async() => ({ usage: 4096 })
    })
    expect(empty).toMatchObject({ bytes: 0, source: 'cache', entries: 0 })

    const failed = await resolveOfflineCacheBytes({
      cacheStorage: {
        async keys() {
          throw new Error('denied')
        }
      },
      estimate: async() => ({ usage: 2048 })
    })
    expect(failed).toMatchObject({ bytes: 2048, source: 'estimate' })

    const none = await resolveOfflineCacheBytes({
      cacheStorage: null,
      estimate: async() => {
        throw new Error('no estimate')
      }
    })
    expect(none).toEqual({ bytes: 0, source: 'none', entries: 0 })
  })
})

describe('offline mode UI', () => {
  it('uses the exact English multiplayer hint and German copy', () => {
    const english = offlineStringsForTest('en')
    const german = offlineStringsForTest('de')
    expect(english.multiplayerHint).toBe('Multiplayer is not available in offline mode!')
    expect(english.readyExample).toBe('Offline ready, 42.3 MB cached')
    expect(english.preparingExample).toBe('Preparing offline cache… 40%')
    expect(english.updateLabel).toBe('Update available – reload')
    expect(german.multiplayerHint).toBe('Mehrspieler ist im Offlinemodus nicht verfügbar!')
    expect(german.offlineLabel).toBe('Offline')
    expect(german.updateLabel).toBe('Update verfügbar – neu laden')
  })

  it('reflects effective offline on the button and locks multiplayer with the hint', () => {
    document.body.innerHTML = `
      <div id="sidebar">
        <button id="offlineModeButton" type="button" aria-pressed="false" title="native" aria-describedby="offlineModeTip">
          <span data-offline-label>Online</span>
        </button>
      </div>
      <div id="offlineModeTip" role="tooltip" hidden></div>
      <div id="multiplayerOfflineTip" role="tooltip" hidden></div>
      <div id="multiplayerSettings">
        <div id="multiplayerOfflineShield" hidden title="native"></div>
        <button id="multiplayerToggle" type="button" aria-expanded="true" title="native">Multiplayer</button>
        <div id="multiplayerContent" class="is-open">
          <button id="joinInviteLinkBtn" type="button" title="native">Join</button>
          <input id="playerCount" title="native" />
        </div>
      </div>
      <div id="offlineUpdatePrompt" hidden>
        <button id="offlineUpdateReload" type="button" data-offline-update-label></button>
      </div>`

    const elements = {
      button: document.getElementById('offlineModeButton'),
      tip: document.getElementById('offlineModeTip'),
      multiplayerHint: document.getElementById('multiplayerOfflineTip'),
      multiplayer: document.getElementById('multiplayerSettings'),
      shield: document.getElementById('multiplayerOfflineShield'),
      updatePrompt: document.getElementById('offlineUpdatePrompt')
    }
    const copy = offlineStringsForTest('en')
    applyOfflineModeDom(elements, {
      ...copy,
      effective: true,
      forced: true,
      cacheReady: true,
      tooltip: 'Offline ready, 42.3 MB cached',
      updateAvailable: true
    })

    expect(elements.button.getAttribute('aria-pressed')).toBe('true')
    expect(elements.button.hidden).toBe(false)
    expect(elements.button.classList.contains('offline-mode-button--offline')).toBe(true)
    expect(elements.button.hasAttribute('title')).toBe(false)
    expect(elements.button.getAttribute('aria-describedby')).toBe('offlineModeTip')
    expect(elements.tip.textContent).toBe('Offline ready, 42.3 MB cached')
    expect(elements.button.querySelector('[data-offline-label]').textContent).toBe('Offline')
    expect(document.querySelectorAll('#offlineModeButton')).toHaveLength(1)
    expect(elements.multiplayer.classList.contains('multiplayer-settings--offline')).toBe(true)
    expect(elements.shield.hidden).toBe(false)
    expect(elements.shield.hasAttribute('title')).toBe(false)
    expect(elements.shield.getAttribute('aria-describedby')).toBe('multiplayerOfflineTip')
    expect(elements.multiplayerHint.textContent).toBe('Multiplayer is not available in offline mode!')
    expect(document.getElementById('multiplayerToggle').disabled).toBe(true)
    expect(document.getElementById('multiplayerToggle').hasAttribute('title')).toBe(false)
    expect(document.getElementById('multiplayerToggle').getAttribute('aria-describedby')).toBe('multiplayerOfflineTip')
    expect(document.getElementById('joinInviteLinkBtn').disabled).toBe(true)
    expect(document.getElementById('joinInviteLinkBtn').hasAttribute('title')).toBe(false)
    expect(document.getElementById('playerCount').hasAttribute('title')).toBe(false)
    expect(document.getElementById('multiplayerContent').classList.contains('is-open')).toBe(false)
    expect(elements.updatePrompt.hidden).toBe(false)
    expect(elements.updatePrompt.querySelector('[data-offline-update-label]').textContent)
      .toBe('Update available – reload')

    applyOfflineModeDom(elements, {
      ...copy,
      effective: false,
      forced: false,
      cacheReady: false,
      percent: 10,
      tooltip: 'Preparing offline cache… 10%',
      updateAvailable: false
    })
    expect(elements.button.getAttribute('aria-pressed')).toBe('false')
    expect(elements.button.hidden).toBe(false)
    expect(elements.button.querySelector('[data-offline-label]').textContent).toBe('Online')
    expect(elements.tip.textContent).toBe('Preparing offline cache… 10%')
    expect(elements.shield.hidden).toBe(true)
    expect(elements.shield.hasAttribute('title')).toBe(false)
    expect(document.getElementById('multiplayerToggle').disabled).toBe(false)
    expect(document.getElementById('joinInviteLinkBtn').disabled).toBe(false)
    expect(document.getElementById('multiplayerToggle').getAttribute('title')).toBe('native')
    expect(document.getElementById('joinInviteLinkBtn').getAttribute('title')).toBe('native')
    expect(elements.updatePrompt.hidden).toBe(true)
  })
})

describe('offline cache clear', () => {
  it('deletes only this app caches and unregisters the service worker', async() => {
    const deleted = []
    const storage = {
      removed: [],
      getItem() {
        return 'saved-game'
      },
      removeItem(key) {
        this.removed.push(key)
      }
    }
    const result = await clearOfflineAppCache({
      cacheStorage: {
        async keys() {
          return ['workbox-precache-v2-http://game/', 'cfb-runtime', 'cfb-google-fonts', 'code-for-battle-cache-v3', 'other-app']
        },
        async delete(name) {
          deleted.push(name)
          return true
        }
      },
      serviceWorker: {
        async getRegistrations() {
          return [{ scope: 'http://game/', async unregister() { return true } }]
        }
      }
    })

    expect(deleted).toEqual([
      'workbox-precache-v2-http://game/',
      'cfb-runtime',
      'cfb-google-fonts',
      'code-for-battle-cache-v3'
    ])
    expect(result.unregistered).toEqual(['http://game/'])
    expect(isAppOfflineCacheName('other-app')).toBe(false)
    expect(storage.removed).toEqual([])
    expect(storage.getItem()).toBe('saved-game')

    const source = readFileSync(path.join(process.cwd(), 'src/pwa/offlineCacheClear.js'), 'utf8')
    expect(source).not.toMatch(/localStorage|indexedDB|deleteDatabase|window\.confirm/)
  })

  it('confirms before clearing, warns while offline, then shows an empty cache and a reload', () => {
    const english = offlineClearCopy('en')
    const german = offlineClearCopy('de')
    expect(english.action).toBe('Clear offline cache')
    expect(english.confirmOfflineWarning).toBe('You are offline. Clearing the cache makes the game unavailable offline until the next visit with a connection.')
    expect(german.confirmOfflineWarning).toBe('Du bist offline. Wenn du den Cache leerst, ist das Spiel offline nicht verfügbar, bis du es das nächste Mal mit Verbindung öffnest.')
    expect(german.action).toBe('Offline-Cache leeren')
    expect(formatOfflineSettingsSize({
      bytes: 26.8 * 1024 * 1024,
      ready: true,
      copy: english
    })).toBe('Cached: 26.8 MB')
    expect(formatOfflineSettingsSize({
      bytes: 0,
      ready: true,
      cleared: true,
      copy: english
    })).toBe('Not cached (0.0 MB)')

    document.body.innerHTML = `
      <h3 data-offline-clear-title></h3>
      <p data-offline-clear-hint></p>
      <p id="offlineCacheSizeText"></p>
      <button id="offlineClearCacheButton" type="button"></button>
      <div id="offlineClearDialog" hidden>
        <h2 id="offlineClearDialogTitle"></h2>
        <p id="offlineClearDialogBody"></p>
        <p id="offlineClearDialogWarning" hidden></p>
        <button id="offlineClearCancel" type="button"></button>
        <button id="offlineClearConfirm" type="button"></button>
        <button id="offlineClearReload" type="button" hidden></button>
      </div>`
    const settings = {
      sectionTitle: document.querySelector('[data-offline-clear-title]'),
      hint: document.querySelector('[data-offline-clear-hint]'),
      size: document.getElementById('offlineCacheSizeText'),
      clearButton: document.getElementById('offlineClearCacheButton')
    }
    applyOfflineCacheSettings(settings, {
      ...english,
      sizeText: 'Cached: 26.8 MB'
    })
    expect(settings.sectionTitle.textContent).toBe('Offline')
    expect(settings.clearButton.textContent).toBe('Clear offline cache')
    expect(settings.size.textContent).toBe('Cached: 26.8 MB')

    const dialog = {
      dialog: document.getElementById('offlineClearDialog'),
      title: document.getElementById('offlineClearDialogTitle'),
      body: document.getElementById('offlineClearDialogBody'),
      warning: document.getElementById('offlineClearDialogWarning'),
      confirm: document.getElementById('offlineClearConfirm'),
      cancel: document.getElementById('offlineClearCancel'),
      reload: document.getElementById('offlineClearReload')
    }
    applyOfflineClearDialog(dialog, { ...english, phase: 'confirm', offline: true, clearing: false })
    expect(dialog.dialog.hidden).toBe(false)
    expect(dialog.title.textContent).toBe('Clear offline cache?')
    expect(dialog.body.textContent).toContain('Saved games, settings, and other game data stay')
    expect(dialog.warning.hidden).toBe(false)
    expect(dialog.warning.textContent).toBe(english.confirmOfflineWarning)
    expect(dialog.confirm.hidden).toBe(false)
    expect(dialog.reload.hidden).toBe(true)

    applyOfflineClearDialog(dialog, { ...english, phase: 'confirm', offline: false, clearing: false })
    expect(dialog.warning.hidden).toBe(true)

    applyOfflineClearDialog(dialog, {
      ...english,
      phase: 'cleared',
      offline: true,
      clearing: false,
      clearedBody: english.clearedBody.replaceAll('{size}', '0.0 MB')
    })
    expect(dialog.title.textContent).toBe('Offline cache cleared')
    expect(dialog.body.textContent).toContain('0.0 MB')
    expect(dialog.body.textContent).toContain('next time it loads while online')
    expect(dialog.confirm.hidden).toBe(true)
    expect(dialog.reload.hidden).toBe(false)
    expect(dialog.reload.textContent).toBe('Reload')
    expect(dialog.cancel.textContent).toBe('Close')
    expect(dialog.warning.textContent).toBe(english.clearedOfflineWarning)
  })

  it('opens the confirm dialog on a long press and leaves a short press as a click', () => {
    vi.useFakeTimers()
    try {
      let opened = 0
      const press = createOfflineLongPress(() => {
        opened += 1
      }, { delay: 650 })
      press.pointerDown({ button: 0, clientX: 0, clientY: 0 })
      press.pointerUp()
      expect(press.consumeClick()).toBe(false)
      expect(opened).toBe(0)

      press.pointerDown({ button: 0, clientX: 2, clientY: 2 })
      vi.advanceTimersByTime(650)
      expect(opened).toBe(1)
      expect(press.consumeClick()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('places portrait toasts below the offline pill', () => {
    const css = readFileSync(path.join(process.cwd(), 'styles/notificationHistory.css'), 'utf8')
    expect(css).toMatch(/body\.mobile-portrait \.notification\s*\{[^}]*top:\s*calc\(var\(--safe-area-top\)\s*\*\s*2\s*\+\s*72px\)/)
  })
})

describe('offline sidebar toggle', () => {
  it('keeps a single sidebar toggle and floats its tooltip outside the sidebar', () => {
    const html = readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')
    const sidebarStart = html.indexOf('id="sidebar"')
    const scrollStart = html.indexOf('id="sidebarScroll"')
    const clusterStart = html.indexOf('id="hudStatusCluster"')
    const clusterEnd = html.indexOf('id="gamepadCursor"')
    expect(html.match(/id="offlineModeButton"/g)).toHaveLength(1)
    expect(html).not.toContain('offlineSidebarStatus')
    expect(html.slice(sidebarStart, scrollStart)).toContain('id="offlineModeButton"')
    expect(html.slice(clusterStart, clusterEnd)).not.toContain('offlineModeButton')
    expect(html).not.toMatch(/id="offlineModeButton"[^>]*\stitle=/)
    expect(html).not.toMatch(/id="multiplayerOfflineShield"[^>]*\stitle=/)

    document.body.innerHTML = `
      <button id="offlineModeButton" type="button">Online</button>
      <div id="offlineModeTip" hidden>Offline ready, 26.8 MB cached</div>`
    const button = document.getElementById('offlineModeButton')
    const tip = document.getElementById('offlineModeTip')
    button.getBoundingClientRect = () => ({ left: 16, top: 20, right: 120, bottom: 52, width: 104, height: 32 })
    tip.getBoundingClientRect = () => ({ left: 0, top: 0, right: 220, bottom: 28, width: 220, height: 28 })
    placeFloatingTip(button, tip)
    expect(tip.hidden).toBe(false)
    expect(tip.style.position).toBe('fixed')
    expect(tip.style.top).toBe('60px')
    expect(button.hasAttribute('title')).toBe(false)
  })
})

describe('offline precache policy', () => {
  it('keeps videos and the connectivity probe out of the precache and off the cache', () => {
    expect(PRECACHE_MAX_FILE_BYTES).toBeGreaterThanOrEqual(4 * 1024 * 1024)
    expect(PRECACHE_GLOB_PATTERNS.join(' ')).toContain('mp3')
    expect(PRECACHE_GLOB_IGNORES.join(' ')).toContain('mp4')
    expect(PRECACHE_GLOB_IGNORES.join(' ')).toContain('offline-probe.txt')
    expect(shouldBypassServiceWorkerCache('/.netlify/functions/api', 'GET')).toBe(true)
    expect(shouldBypassServiceWorkerCache('/offline-probe.txt', 'GET')).toBe(true)
    expect(shouldBypassServiceWorkerCache('/api/signalling/offer', 'POST')).toBe(true)
    expect(isNetlifyDrawerRequest('https://app.netlify.com/drawer.js')).toBe(true)
    expect(isNetlifyDrawerRequest('https://netlify-cdp-loader.netlify.app/netlify.js')).toBe(true)
    expect(isNetlifyDrawerRequest('/images/sidebar/tank.webp')).toBe(false)

    const netlify = readFileSync(path.join(process.cwd(), 'netlify.toml'), 'utf8')
    expect(netlify).toMatch(/for = "\/sw\.js"[\s\S]*Cache-Control = "no-cache"/)
    expect(netlify).toMatch(/for = "\/assets\/\*"[\s\S]*immutable/)
    const worker = readFileSync(path.join(process.cwd(), 'src/pwa/sw.js'), 'utf8')
    expect(worker).toContain('self.__WB_MANIFEST')
    expect(worker).toContain("event.data.type === 'SKIP_WAITING'")
    expect(worker).toContain('self.skipWaiting()')
    expect(worker).toMatch(/addEventListener\('install', \(event\) => \{\s*event\.waitUntil\(reportPrecacheProgress/)
  })
})
