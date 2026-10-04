import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  PRECACHE_GLOB_IGNORES,
  PRECACHE_GLOB_PATTERNS,
  PRECACHE_MAX_FILE_BYTES
} from '../../src/pwa/precachePolicy.js'
import { audioCrossOriginForUrl, configureAudioElement } from '../../src/pwa/audioElementPolicy.js'
import {
  classifyOfflinePath,
  OFFLINE_ASSET_REVISION_HEADER,
  OFFLINE_ASSETS_CACHE,
  toPublicAssetUrl
} from '../../src/pwa/offlineAssetPlan.js'
import { buildOfflineAssetManifest } from '../../src/pwa/offlineAssetManifestPlugin.js'
import {
  cleanupStaleOfflineAssets,
  downloadOfflineAssets,
  isOfflinePlayReady,
  measureOfflineReadiness
} from '../../src/pwa/offlineAssetDownload.js'
import { isNavigationDenylisted, resolveDocumentNavigation } from '../../src/pwa/navigationFallback.js'
import { formatPersistentStorageStatus, isStandaloneDisplayMode, requestPersistentStorage } from '../../src/pwa/persistentStorage.js'
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
  formatIncompleteOfflineWarning,
  formatOfflineCacheError,
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
    const actionsStart = html.indexOf('id="actions"')
    const minimapAt = html.indexOf('id="minimap"')
    const buttonAt = html.indexOf('id="offlineModeButton"')
    expect(html.match(/id="offlineModeButton"/g)).toHaveLength(1)
    expect(html).not.toContain('offlineSidebarStatus')
    expect(minimapAt).toBeGreaterThan(sidebarStart)
    expect(minimapAt).toBeLessThan(actionsStart)
    expect(buttonAt).toBeGreaterThan(actionsStart)
    expect(buttonAt).toBeLessThan(scrollStart)
    expect(html.slice(clusterStart, clusterEnd)).not.toContain('offlineModeButton')
    expect(html).not.toMatch(/id="offlineModeButton"[^>]*\stitle=/)
    expect(html).not.toMatch(/id="multiplayerOfflineShield"[^>]*\stitle=/)

    const buttonCss = readFileSync(path.join(process.cwd(), 'styles/overlays.css'), 'utf8')
    expect(buttonCss).toMatch(/#sidebar > \.sidebar-status-row\s*\{[^}]*margin:\s*0 0 4px/)
    const rowAt = html.indexOf('id="sidebarStatusRow"')
    const musicAt = html.indexOf('id="musicControl"')
    expect(rowAt).toBeGreaterThan(actionsStart)
    expect(musicAt).toBeGreaterThan(rowAt)
    expect(buttonAt).toBeGreaterThan(musicAt)
    expect(html.match(/id="musicControl"/g)).toHaveLength(1)
    expect(html.slice(actionsStart, rowAt)).not.toContain('id="musicControl"')
    expect(buttonCss).toMatch(/\.sidebar-status-row > \.offline-mode-button\s*\{[^}]*margin-left:\s*auto/)
    expect(buttonCss).toContain('font-size: 11px')
    expect(buttonCss).toContain('padding: 3px 8px')
    expect(buttonCss).not.toContain('margin: 12px 0 8px')

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
    expect(PRECACHE_GLOB_PATTERNS.join(' ')).not.toContain('mp3')
    expect(PRECACHE_GLOB_PATTERNS.join(' ')).toContain('offline-assets-manifest.json')
    expect(PRECACHE_GLOB_PATTERNS.join(' ')).toContain('images/sidebar')
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
    expect(netlify).toMatch(/for = "\/offline-assets-manifest\.json"[\s\S]*Cache-Control = "no-cache"/)
    expect(netlify).toMatch(/for = "\/assets\/\*"[\s\S]*immutable/)
    const worker = readFileSync(path.join(process.cwd(), 'src/pwa/sw.js'), 'utf8')
    expect(worker).toContain('self.__WB_MANIFEST')
    expect(worker).toContain("event.data.type === 'SKIP_WAITING'")
    expect(worker).toContain('self.skipWaiting()')
    expect(worker).toContain('createHandlerBoundToURL')
    expect(worker).toContain('RangeRequestsPlugin')
    expect(worker).toContain('new CacheableResponsePlugin({ statuses: [200] })')
    expect(worker).toContain('OFFLINE_ASSETS_CACHE')
    expect(OFFLINE_ASSETS_CACHE).toBe('cfb-offline-assets-v1')
    expect(worker).toContain('isNavigationDenylisted')
    expect(worker).toContain('NAVIGATION_NETWORK_TIMEOUT_MS')
    const installHandler = worker.slice(worker.indexOf("addEventListener('install'"), worker.indexOf("addEventListener('activate'"))
    expect(installHandler).not.toContain('skipWaiting')
    expect(worker).toMatch(/addEventListener\('install', \(event\) => \{\s*event\.waitUntil\(reportPrecacheProgress/)
    expect(worker).toContain('audioCachePlugins')
    expect(installHandler).toContain('reportPrecacheProgress')
  })
})

function memoryAssetCache() {
  const entries = new Map()
  const keyOf = (request) => {
    const raw = typeof request === 'string' ? request : (request?.url || '')
    return raw.split('?')[0]
  }
  return {
    async put(request, response) {
      entries.set(keyOf(request), response)
    },
    async match(request) {
      return entries.get(keyOf(request)) || null
    },
    async delete(request) {
      return entries.delete(keyOf(request))
    },
    async keys() {
      return [...entries.keys()].map(url => ({ url }))
    }
  }
}

function asset(url, revision = 'rev-1', size = 4) {
  return { url, revision, size }
}

describe('offline asset split', () => {
  it('keeps the boot shell small and moves audio, atlases, and json out of the precache', () => {
    expect(classifyOfflinePath('index.html')).toBe('boot')
    expect(classifyOfflinePath('assets/main-abc.js')).toBe('boot')
    expect(classifyOfflinePath('assets/main-abc.css')).toBe('boot')
    expect(classifyOfflinePath('site.webmanifest')).toBe('boot')
    expect(classifyOfflinePath('favicon-32x32.png')).toBe('boot')
    expect(classifyOfflinePath('images/sidebar/tank.webp')).toBe('boot')
    expect(classifyOfflinePath('cursors/default.svg')).toBe('boot')
    expect(classifyOfflinePath('icons/wrench.svg')).toBe('boot')
    expect(classifyOfflinePath('images/terrain/terrain-details.png')).toBe('bulk')
    expect(classifyOfflinePath('images/prepared/sprite-manifest.json')).toBe('bulk')
    expect(classifyOfflinePath('sound/music/music01.mp3')).toBe('bulk')
    expect(classifyOfflinePath('video/narration.mp3')).toBe('bulk')
    expect(classifyOfflinePath('mine_explosion.mp3')).toBe('bulk')
    expect(classifyOfflinePath('video/first_tank.mp4')).toBe('exclude')
    expect(classifyOfflinePath('offline-probe.txt')).toBe('exclude')
    expect(classifyOfflinePath('sw.js')).toBe('exclude')
    expect(classifyOfflinePath('offline-assets-manifest.json')).toBe('exclude')
    expect(toPublicAssetUrl('images/prepared/aircraft/apache/body-atlas@2x.webp'))
      .toBe('/images/prepared/aircraft/apache/body-atlas@2x.webp')
  })

  it('writes a revisioned manifest that separates boot files from bulk assets', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'cfb-offline-'))
    try {
      mkdirSync(path.join(root, 'images/sidebar'), { recursive: true })
      mkdirSync(path.join(root, 'images/terrain'), { recursive: true })
      mkdirSync(path.join(root, 'sound'), { recursive: true })
      writeFileSync(path.join(root, 'index.html'), '<html></html>')
      writeFileSync(path.join(root, 'app.js'), 'console.log(1)')
      writeFileSync(path.join(root, 'images/sidebar/tank.webp'), 'sidebar')
      writeFileSync(path.join(root, 'images/terrain/terrain-details.png'), 'terrain')
      writeFileSync(path.join(root, 'sound/shot.mp3'), 'audio')
      writeFileSync(path.join(root, 'clip.mp4'), 'video')
      writeFileSync(path.join(root, 'offline-probe.txt'), 'ok')
      const manifest = buildOfflineAssetManifest(root)
      expect(manifest.cache).toBe(OFFLINE_ASSETS_CACHE)
      expect(manifest.boot.map(entry => entry.url).sort()).toEqual(['/app.js', '/images/sidebar/tank.webp', '/index.html'])
      expect(manifest.assets.map(entry => entry.url)).toEqual(['/images/terrain/terrain-details.png', '/sound/shot.mp3'])
      expect(manifest.assets[0].revision).toMatch(/^[a-f0-9]{32}$/)
      expect(manifest.assets[0].size).toBeGreaterThan(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('resumable offline asset download', () => {
  it('skips cached revisions, retries with backoff, and cleans stale entries', async() => {
    const cache = memoryAssetCache()
    await cache.put('/old.webp', new Response('old', {
      status: 200,
      headers: { [OFFLINE_ASSET_REVISION_HEADER]: 'gone', 'content-length': '3' }
    }))
    const attempts = []
    const summary = await downloadOfflineAssets({
      assets: [asset('/keep.mp3', 'aaa', 2), asset('/flaky.png', 'bbb', 2)],
      cache,
      concurrency: 1,
      maxAttempts: 3,
      sleep: async() => {},
      fetchImpl: async(url) => {
        attempts.push(url)
        if (url === '/flaky.png' && attempts.filter(item => item === url).length < 2) {
          throw new Error('network dropped')
        }
        return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } })
      }
    })
    expect(summary.complete).toBe(true)
    expect(summary.failures).toEqual([])
    expect(attempts.filter(url => url === '/flaky.png')).toHaveLength(2)
    expect(await cache.match('/old.webp')).toBeNull()
    const kept = await cache.match('/flaky.png')
    expect(kept.headers.get(OFFLINE_ASSET_REVISION_HEADER)).toBe('bbb')

    const second = []
    const again = await downloadOfflineAssets({
      assets: [asset('/keep.mp3', 'aaa', 2), asset('/flaky.png', 'bbb', 2)],
      cache,
      fetchImpl: async(url) => {
        second.push(url)
        return new Response('nope', { status: 500 })
      }
    })
    expect(second).toEqual([])
    expect(again.complete).toBe(true)
    expect(again.done).toBe(2)
  })

  it('pauses when offline and resumes the files that were not stored', async() => {
    const cache = memoryAssetCache()
    let allow = true
    let fetches = 0
    const paused = await downloadOfflineAssets({
      assets: [asset('/a.mp3'), asset('/b.mp3'), asset('/c.mp3')],
      cache,
      concurrency: 1,
      sleep: async() => {},
      shouldContinue: () => allow,
      fetchImpl: async() => {
        fetches += 1
        if (fetches === 1) allow = false
        return new Response('abcd', { status: 200 })
      }
    })
    expect(paused.paused).toBe(true)
    expect(paused.done).toBe(1)
    expect(paused.complete).toBe(false)

    const resumed = await downloadOfflineAssets({
      assets: [asset('/a.mp3'), asset('/b.mp3'), asset('/c.mp3')],
      cache,
      concurrency: 2,
      sleep: async() => {},
      fetchImpl: async() => new Response('abcd', { status: 200 })
    })
    expect(resumed.complete).toBe(true)
    expect(resumed.done).toBe(3)
    expect(fetches).toBe(1)
  })

  it('limits concurrency and does not retry a missing file forever', async() => {
    let active = 0
    let maxActive = 0
    const calls = []
    const cache = memoryAssetCache()
    const summary = await downloadOfflineAssets({
      assets: Array.from({ length: 8 }, (_, index) => asset(`/file-${index}.webp`, 'r', 1)),
      cache,
      concurrency: 4,
      maxAttempts: 2,
      sleep: async() => {},
      fetchImpl: async(url) => {
        calls.push(url)
        if (url === '/file-0.webp') return new Response('missing', { status: 404 })
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setTimeout(resolve, 15))
        active -= 1
        return new Response('x', { status: 200 })
      }
    })
    expect(maxActive).toBeLessThanOrEqual(4)
    expect(maxActive).toBeGreaterThan(1)
    expect(calls.filter(url => url === '/file-0.webp')).toHaveLength(1)
    expect(summary.complete).toBe(false)
    expect(summary.failures).toEqual([{ url: '/file-0.webp', message: 'HTTP 404' }])
    expect(summary.done).toBe(7)
  })

  it('counts cached bytes against the expected list and ignores a storage estimate', async() => {
    const bulk = memoryAssetCache()
    await downloadOfflineAssets({
      assets: [asset('/sound/a.mp3', 'hash', 8)],
      cache: bulk,
      fetchImpl: async() => new Response('12345678', { status: 200, headers: { 'content-type': 'audio/mpeg' } })
    })
    const precache = memoryAssetCache()
    await precache.put('/index.html', new Response('shell', {
      status: 200,
      headers: { 'content-length': '5' }
    }))
    const manifest = {
      cache: OFFLINE_ASSETS_CACHE,
      boot: [{ url: '/index.html', revision: 'boot', size: 5 }],
      assets: [asset('/sound/a.mp3', 'hash', 8)]
    }
    const measured = await measureOfflineReadiness({
      async keys() {
        return ['workbox-precache-v2', OFFLINE_ASSETS_CACHE]
      },
      async open(name) {
        return name.includes('precache') ? precache : bulk
      }
    }, manifest)
    expect(measured).toMatchObject({ done: 2, total: 2, bytes: 13 })
    expect(isOfflinePlayReady({ controlled: true, done: measured.done, total: measured.total, failures: [] })).toBe(true)
    expect(isOfflinePlayReady({ controlled: false, done: 2, total: 2, failures: [] })).toBe(false)
    expect(isOfflinePlayReady({ controlled: true, done: 1, total: 2, failures: [] })).toBe(false)
    const removed = await cleanupStaleOfflineAssets(bulk, [])
    expect(removed).toEqual(['/sound/a.mp3'])
  })
})

describe('offline navigation and storage', () => {
  it('serves the network document and falls back to the shell after the timeout', async() => {
    expect(isNavigationDenylisted('/api/signalling')).toBe(true)
    expect(isNavigationDenylisted('/.netlify/functions/api')).toBe(true)
    expect(isNavigationDenylisted('/')).toBe(false)

    let shellCalls = 0
    const online = await resolveDocumentNavigation({
      request: new Request('https://game/'),
      timeoutMs: 50,
      fetchImpl: async() => new Response('network', { status: 200 }),
      shell: async() => {
        shellCalls += 1
        return new Response('shell')
      }
    })
    expect(await online.text()).toBe('network')
    expect(shellCalls).toBe(0)

    const offline = await resolveDocumentNavigation({
      request: new Request('https://game/'),
      timeoutMs: 20,
      fetchImpl: () => new Promise(() => {}),
      shell: async() => new Response('shell')
    })
    expect(await offline.text()).toBe('shell')

    const denied = await resolveDocumentNavigation({
      request: new Request('https://game/api/x'),
      denylisted: true,
      timeoutMs: 20,
      fetchImpl: async() => new Response('api', { status: 200 }),
      shell: async() => new Response('shell')
    })
    expect(await denied.text()).toBe('api')
  })

  it('requests persistent storage for an installed app and formats the result', async() => {
    expect(isStandaloneDisplayMode({
      matchMedia: () => ({ matches: true }),
      navigator: {}
    })).toBe(true)
    expect(isStandaloneDisplayMode({
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true }
    })).toBe(true)

    const calls = []
    const granted = await requestPersistentStorage({
      async persisted() {
        return false
      },
      async persist() {
        calls.push('persist')
        return true
      }
    }, { standalone: true })
    expect(granted).toMatchObject({ supported: true, persisted: true, called: true })
    expect(calls).toEqual(['persist'])

    const skipped = await requestPersistentStorage({
      async persisted() {
        return false
      },
      async persist() {
        calls.push('again')
        return true
      }
    }, { standalone: false })
    expect(skipped).toMatchObject({ supported: true, persisted: false, called: false })
    expect(calls).toEqual(['persist'])
    expect(formatPersistentStorageStatus(granted, {
      persistent: 'Storage: persistent',
      temporary: 'Storage: not persistent',
      unavailable: 'Storage: persistence unavailable'
    })).toBe('Storage: persistent')
    expect(formatPersistentStorageStatus({ supported: false, persisted: false }, {
      unavailable: 'Storage: persistence unavailable'
    })).toBe('Storage: persistence unavailable')
    expect(formatPersistentStorageStatus(null, {})).toBe('')

    const hung = await requestPersistentStorage({
      persisted() {
        return new Promise(() => {})
      },
      persist() {
        return new Promise(() => {})
      }
    }, { standalone: true, timeoutMs: 20 })
    expect(hung).toMatchObject({ supported: true, persisted: false, called: true })
    expect(hung.error).toMatch(/timed out/)
  })

  it('keeps Retry download visible and disables it until a download fails', () => {
    const retry = {
      hidden: true,
      disabled: false,
      textContent: '',
      setAttribute(name, value) {
        this[name] = value
      }
    }
    applyOfflineCacheSettings({ retry }, { showRetry: false, retryLabel: 'Retry download' })
    expect(retry.hidden).toBe(false)
    expect(retry.disabled).toBe(true)
    expect(retry.textContent).toBe('Retry download')
    applyOfflineCacheSettings({ retry }, { showRetry: true, retryLabel: 'Retry download' })
    expect(retry.disabled).toBe(false)
    expect(retry['aria-disabled']).toBe('false')
  })

  it('leaves same-origin audio non-CORS so Safari can play a cached 200', () => {
    expect(audioCrossOriginForUrl('/sound/music/music01.mp3', 'https://game.example')).toBeNull()
    expect(audioCrossOriginForUrl('https://cdn.example/music.mp3', 'https://game.example')).toBe('anonymous')
    const audio = document.createElement('audio')
    configureAudioElement(audio, '/sound/music/music01.mp3', 'https://game.example')
    expect(audio.getAttribute('crossorigin')).toBeNull()
    configureAudioElement(audio, 'https://cdn.example/music.mp3', 'https://game.example')
    expect(audio.crossOrigin).toBe('anonymous')
    expect(formatIncompleteOfflineWarning(
      'Offline files are incomplete ({done}/{total}). The game may not load until the download finishes.',
      119,
      486
    )).toContain('119/486')
    expect(formatOfflineCacheError('Could not cache {url}: {message}', {
      url: '/sound/a.mp3',
      message: 'HTTP 404'
    }, 2)).toBe('Could not cache /sound/a.mp3: HTTP 404 (+2)')
    expect(formatOfflineCacheTooltip({
      ready: true,
      bytes: 27.1 * 1024 * 1024,
      done: 486,
      total: 486
    })).toBe('Offline ready, 27.1 MB · 486/486 files')
    expect(formatOfflineCacheTooltip({
      ready: false,
      bytes: 8.2 * 1024 * 1024,
      done: 119,
      total: 486
    })).toBe('Preparing offline cache… 8.2 MB · 119/486 files')
  })
})
