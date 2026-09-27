import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
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
import { applyOfflineModeDom, offlineStringsForTest } from '../../src/pwa/offlineController.js'

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

  it('falls back to navigator.storage.estimate when the cache is empty or unreadable', async() => {
    const empty = await resolveOfflineCacheBytes({
      cacheStorage: cacheStorageFrom({}),
      estimate: async() => ({ usage: 4096 })
    })
    expect(empty).toMatchObject({ bytes: 4096, source: 'estimate' })

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
      <button id="offlineModeButton" type="button" aria-pressed="false">
        <span data-offline-label>Online</span>
        <span id="offlineModeTip"></span>
      </button>
      <div id="offlineSidebarStatus" hidden><span data-offline-sidebar-label></span></div>
      <div id="multiplayerSettings">
        <div id="multiplayerOfflineShield" hidden>
          <span data-offline-multiplayer-hint></span>
        </div>
        <button id="multiplayerToggle" type="button" aria-expanded="true">Multiplayer</button>
        <div id="multiplayerContent" class="is-open">
          <button id="joinInviteLinkBtn" type="button">Join</button>
          <input id="playerCount" />
        </div>
      </div>
      <div id="offlineUpdatePrompt" hidden>
        <button id="offlineUpdateReload" type="button" data-offline-update-label></button>
      </div>`

    const elements = {
      button: document.getElementById('offlineModeButton'),
      sidebar: document.getElementById('offlineSidebarStatus'),
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
    expect(elements.button.classList.contains('offline-mode-button--offline')).toBe(true)
    expect(elements.button.title).toBe('Offline ready, 42.3 MB cached')
    expect(elements.button.querySelector('[data-offline-label]').textContent).toBe('Offline')
    expect(elements.sidebar.hidden).toBe(false)
    expect(elements.multiplayer.classList.contains('multiplayer-settings--offline')).toBe(true)
    expect(elements.shield.hidden).toBe(false)
    expect(elements.shield.title).toBe('Multiplayer is not available in offline mode!')
    expect(elements.shield.querySelector('[data-offline-multiplayer-hint]').textContent)
      .toBe('Multiplayer is not available in offline mode!')
    expect(document.getElementById('multiplayerToggle').disabled).toBe(true)
    expect(document.getElementById('joinInviteLinkBtn').disabled).toBe(true)
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
    expect(elements.sidebar.hidden).toBe(true)
    expect(elements.shield.hidden).toBe(true)
    expect(document.getElementById('multiplayerToggle').disabled).toBe(false)
    expect(document.getElementById('joinInviteLinkBtn').disabled).toBe(false)
    expect(elements.updatePrompt.hidden).toBe(true)
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
