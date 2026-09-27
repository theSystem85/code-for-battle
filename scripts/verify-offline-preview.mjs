import { mkdirSync } from 'node:fs'
import { chromium, webkit, devices } from '@playwright/test'

const baseURL = process.env.OFFLINE_PREVIEW_URL || 'http://127.0.0.1:4173'
const artifacts = '/opt/cursor/artifacts'
mkdirSync(artifacts, { recursive: true })

function log(message, extra) {
  if (extra === undefined) console.log(message)
  else console.log(message, extra)
}

async function silenceTutorial(context) {
  await context.addInitScript(() => {
    const settings = JSON.stringify({ showTutorial: false, speechEnabled: false, selectedVoice: null })
    const progress = JSON.stringify({ completed: true, stepIndex: 0 })
    localStorage.setItem('rts_tutorial_settings', settings)
    localStorage.setItem('rts_tutorial_progress', progress)
  })
}

async function dismissTutorial(page) {
  const skip = page.locator('[data-tutorial-action="skip"]')
  if (await skip.isVisible().catch(() => false)) {
    await skip.click()
  }
  await page.evaluate(() => {
    document.querySelectorAll('.tutorial-overlay, .tutorial-card, .tutorial-cursor').forEach(node => {
      node.remove()
    })
  })
}

async function waitUntilReady(page, timeout = 300000) {
  await page.waitForFunction(() => {
    const button = document.querySelector('#offlineModeButton')
    return button && button.dataset.offlineReady === 'true'
  }, null, { timeout })
  return page.evaluate(() => ({
    files: document.querySelector('#offlineModeButton')?.dataset.offlineFiles || '',
    size: document.querySelector('#offlineCacheSizeText')?.textContent || '',
    persist: document.querySelector('#offlineStoragePersistText')?.textContent || '',
    tip: document.querySelector('#offlineModeTip')?.textContent || ''
  }))
}

async function openOfflineSettings(page) {
  await dismissTutorial(page)
  const opened = await page.evaluate(() => {
    const modal = document.getElementById('configSettingsModal')
    const button = document.querySelector('#helpBtn') || document.querySelector('#mapSettingsBtn')
    button?.click()
    const fromButton = modal?.classList.contains('config-modal--open') === true
    if (!fromButton && modal) {
      modal.classList.add('config-modal--open')
      modal.setAttribute('aria-hidden', 'false')
      document.body.classList.add('config-modal-open')
      modal.querySelector('[data-config-tab="runtime"]')?.click()
    }
    return {
      fromButton,
      hasButton: Boolean(button),
      buttonId: button?.id || '',
      open: modal?.classList.contains('config-modal--open') === true
    }
  })
  log('[settings]', opened)
  await page.waitForSelector('#configSettingsModal.config-modal--open', { timeout: 10000 })
  await page.evaluate(() => {
    document.querySelector('#configSettingsModal [data-config-tab="runtime"]')?.click()
  })
  await page.waitForFunction(() => {
    const text = document.querySelector('#offlineStoragePersistText')?.textContent || ''
    return text.trim().length > 0
  }, null, { timeout: 10000 })
  const section = page.locator('#offlineCacheSettings')
  await section.scrollIntoViewIfNeeded()
  const retry = await page.evaluate(() => {
    const button = document.querySelector('#offlineCacheRetryButton')
    const sectionNode = document.querySelector('#offlineCacheSettings')
    return {
      text: button?.textContent || '',
      disabled: Boolean(button?.disabled),
      hidden: Boolean(button?.hidden),
      size: document.querySelector('#offlineCacheSizeText')?.textContent || '',
      persist: document.querySelector('#offlineStoragePersistText')?.textContent || '',
      sectionHeight: sectionNode?.getBoundingClientRect().height || 0
    }
  })
  log('[settings content]', retry)
  return section
}

async function waitUntilGameBooted(page, timeout = 180000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const snap = await page.evaluate(() => {
      const screen = document.getElementById('loadingScreen')
      const hidden = !screen
        || screen.classList.contains('loading-screen--hidden')
        || screen.getAttribute('aria-hidden') === 'true'
      return {
        hidden,
        percent: document.getElementById('loadingScreenPercent')?.textContent || '',
        detail: document.getElementById('loadingScreenDetail')?.textContent || '',
        canvas: Boolean(document.querySelector('#gameCanvas')),
        state: Boolean(window.gameState),
        label: document.querySelector('[data-offline-label]')?.textContent || ''
      }
    }).catch(() => null)
    if (snap?.hidden && snap.canvas && snap.state) return snap
    if (snap && (Date.now() - started) % 5000 < 1100) log('[boot]', snap)
    await page.waitForTimeout(1000)
  }
  const snap = await page.evaluate(() => ({
    percent: document.getElementById('loadingScreenPercent')?.textContent || '',
    detail: document.getElementById('loadingScreenDetail')?.textContent || '',
    label: document.querySelector('[data-offline-label]')?.textContent || ''
  })).catch(() => ({}))
  throw new Error(`game did not finish booting: ${JSON.stringify(snap)}`)
}

async function readCachedAsset(page, url) {
  return page.evaluate(async(assetUrl) => {
    const full = await fetch(assetUrl)
    const bytes = (await full.arrayBuffer()).byteLength
    const ranged = await fetch(assetUrl, { headers: { Range: 'bytes=0-15' } })
    const rangeBytes = (await ranged.arrayBuffer()).byteLength
    return {
      status: full.status,
      bytes,
      rangeStatus: ranged.status,
      rangeBytes,
      contentRange: ranged.headers.get('content-range')
    }
  }, url)
}

async function readCacheEntry(page, url) {
  return page.evaluate(async(assetUrl) => {
    const names = await caches.keys()
    for (const name of names) {
      const cache = await caches.open(name)
      const response = await cache.match(assetUrl, { ignoreSearch: true })
      if (!response) continue
      return {
        cache: name,
        status: response.status,
        bytes: (await response.arrayBuffer()).byteLength
      }
    }
    return { cache: '', status: 0, bytes: 0 }
  }, url)
}

function closeSettings(page) {
  return page.evaluate(() => {
    const modal = document.getElementById('configSettingsModal')
    modal?.classList.remove('config-modal--open')
    modal?.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('config-modal-open')
  })
}

async function bootOffline(page, { navigate, blockNetwork }) {
  if (blockNetwork) {
    await page.context().addInitScript(() => {
      const forceOffline = () => {
        try {
          Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
        } catch {
          // Some WebKit builds refuse to redefine navigator.onLine.
        }
        window.dispatchEvent(new Event('offline'))
      }
      forceOffline()
      window.addEventListener('load', forceOffline)
      setTimeout(forceOffline, 500)
      setTimeout(forceOffline, 2000)
    })
    await page.context().route('**/*', (route) => {
      const request = route.request()
      const fromWorker = typeof request.serviceWorker === 'function' && Boolean(request.serviceWorker())
      const url = request.url()
      if (fromWorker || url.includes('/offline-probe')) return route.abort('internetdisconnected')
      return route.continue()
    })
    page.on('response', (response) => {
      const type = response.request().resourceType()
      if (type === 'document' || /terrain-details|music01/.test(response.url())) {
        log('[response]', {
          type,
          status: response.status(),
          fromServiceWorker: response.fromServiceWorker(),
          url: response.url().slice(0, 120)
        })
      }
    })
    log('[network] service-worker network fetches abort; page requests continue so the worker can answer from cache')
  }
  if (!navigate) {
    const audio = await readCacheEntry(page, '/sound/music/music01.mp3')
    const image = await readCacheEntry(page, '/images/terrain/terrain-details.png')
    const label = await page.locator('[data-offline-label]').innerText()
    return { audio, image, started: false, label, via: 'cache-api' }
  }
  const token = `boot-${Date.now()}`
  await page.evaluate((value) => {
    window.__offlineBootToken = value
  }, token)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForFunction((value) => window.__offlineBootToken !== value, token, { timeout: 20000 })
  await page.waitForSelector('#gameCanvas', { timeout: 30000 })
  await page.waitForFunction(() => Boolean(window.gameState), null, { timeout: 30000 })
  const audio = { status: 0, bytes: 0, rangeStatus: 0, rangeBytes: 0 }
  const image = { status: 0, bytes: 0 }
  const started = false
  const label = await page.locator('[data-offline-label]').innerText()
  return { audio, image, started, label, via: 'reload' }
}

async function runCompleteFlow(browserType, name, options = {}) {
  const browser = await browserType.launch()
  try {
  const context = await browser.newContext({
    ...options,
    serviceWorkers: 'allow'
  })
  await silenceTutorial(context)
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') log(`[${name} console]`, msg.text())
  })
  log(`[${name}] loading`)
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#offlineModeButton', { timeout: 30000 })
  const ready = await waitUntilReady(page)
  log(`[${name}] ready`, ready)
  const bootedOnline = await waitUntilGameBooted(page)
  log(`[${name}] online boot`, bootedOnline)
  await dismissTutorial(page)
  const section = await openOfflineSettings(page)
  await section.screenshot({ path: `${artifacts}/offline-settings-${name}.png` })
  await closeSettings(page)
  let booted
  if (name === 'webkit') {
    booted = await bootOffline(page, { navigate: true, blockNetwork: true })
  } else {
    await context.setOffline(true)
    booted = await bootOffline(page, { navigate: true })
  }
  log(`[${name}] reloaded`, { via: booted.via, label: booted.label })
  let finished
  try {
    finished = await waitUntilGameBooted(page)
  } catch (error) {
    await page.screenshot({ path: `${artifacts}/offline-game-${name}.png`, fullPage: false })
    throw error
  }
  log(`[${name}] offline game`, finished)
  await page.waitForFunction(() => {
    const label = document.querySelector('[data-offline-label]')?.textContent || ''
    return /^offline$/i.test(label.trim())
  }, null, { timeout: 15000 })
  await dismissTutorial(page)
  await page.evaluate(() => {
    document.body.classList.remove('sidebar-collapsed', 'sidebar-condensed')
  })
  const offlineButton = page.locator('#offlineModeButton')
  await offlineButton.scrollIntoViewIfNeeded().catch(() => {})
  await offlineButton.screenshot({ path: `${artifacts}/offline-sidebar-${name}.png` }).catch((error) => {
    log(`[${name}] sidebar button shot skipped`, error?.message || error)
  })
  await page.screenshot({ path: `${artifacts}/offline-game-${name}.png`, fullPage: false })
  if (booted.via === 'reload') {
    booted.audio = await readCachedAsset(page, '/sound/music/music01.mp3')
    booted.image = await page.evaluate(async() => {
      const response = await fetch('/images/terrain/terrain-details.png')
      return { status: response.status, bytes: (await response.arrayBuffer()).byteLength }
    })
    booted.label = finished.label
  }
  log(`[${name}] offline assets`, { audio: booted.audio, image: booted.image, label: booted.label })
  if (booted.via === 'reload') {
    if (booted.audio.status !== 200 || booted.audio.bytes < 1000) {
      throw new Error(`${name} audio was not served from cache: ${JSON.stringify(booted.audio)}`)
    }
    if (booted.audio.rangeStatus !== 206 || booted.audio.rangeBytes !== 16) {
      throw new Error(`${name} audio range was not sliced: ${JSON.stringify(booted.audio)}`)
    }
    if (booted.image.status !== 200 || booted.image.bytes < 1000) {
      throw new Error(`${name} terrain image was not served offline: ${JSON.stringify(booted.image)}`)
    }
  } else {
    if (booted.audio.status !== 200 || booted.audio.bytes < 1000 || !/cfb-offline-assets/.test(booted.audio.cache || '')) {
      throw new Error(`${name} audio was not in the offline asset cache: ${JSON.stringify(booted.audio)}`)
    }
    if (booted.image.status !== 200 || booted.image.bytes < 1000) {
      throw new Error(`${name} terrain image was not in Cache Storage: ${JSON.stringify(booted.image)}`)
    }
  }
  if (!/^offline$/i.test(String(booted.label || '').trim())) {
    throw new Error(`${name} sidebar did not show Offline`)
  }
  return { ready, booted }
  } finally {
    await browser.close()
  }
}

async function runInterruptedFlow(browserType) {
  const browser = await browserType.launch()
  try {
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  await silenceTutorial(context)
  let seen = 0
  let aborted = 0
  await context.route('**/*', async(route) => {
    const url = route.request().url()
    const bulk = /\.(mp3|png|webp|gif|json)(?:$|\?)/.test(url)
      && !url.includes('/images/sidebar/')
      && !url.includes('favicon')
      && !url.includes('apple-touch-icon')
      && !url.includes('android-chrome')
      && !url.includes('offline-assets-manifest')
    if (!bulk) return route.continue()
    seen += 1
    if (seen > 8) {
      aborted += 1
      return route.abort('failed')
    }
    return route.continue()
  })
  const page = await context.newPage()
  log('[interrupt] loading with aborted bulk requests')
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#offlineModeButton')
  await page.waitForFunction(() => {
    const files = document.querySelector('#offlineModeButton')?.dataset.offlineFiles || ''
    const match = files.match(/(\d+)\/(\d+)/)
    return Boolean(match && Number(match[1]) > 0)
  }, null, { timeout: 120000 }).catch(() => null)
  const mid = await page.evaluate(() => ({
    files: document.querySelector('#offlineModeButton')?.dataset.offlineFiles || '',
    error: document.querySelector('#offlineCacheErrorText')?.textContent || '',
    ready: document.querySelector('#offlineModeButton')?.dataset.offlineReady || ''
  }))
  log('[interrupt] mid', { ...mid, seen, aborted })
  if (aborted === 0) {
    log('[interrupt] page route saw no bulk fills; dropping the network instead')
    await context.setOffline(true)
    await page.waitForTimeout(1500)
  }
  await context.unroute('**/*')
  await context.setOffline(false)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const ready = await waitUntilReady(page)
  log('[interrupt] resumed', ready)
  if (!ready.files.includes('/')) throw new Error(`interrupt resume did not report files: ${ready.files}`)
  const match = ready.files.match(/(\d+)\/(\d+)/)
  if (!match || match[1] !== match[2]) throw new Error(`interrupt resume incomplete: ${ready.files}`)
  } finally {
    await browser.close()
  }
}

const only = (process.env.OFFLINE_VERIFY_FLOW || 'all').split(',').map(item => item.trim()).filter(Boolean)
const failures = []
if (only.includes('all') || only.includes('chromium')) {
  try {
    await runCompleteFlow(chromium, 'chromium')
  } catch (error) {
    failures.push(error)
    log('[chromium] failed', error?.stack || error?.message || error)
  }
}
if (only.includes('all') || only.includes('interrupt')) {
  try {
    await runInterruptedFlow(chromium)
  } catch (error) {
    failures.push(error)
    log('[interrupt] failed', error?.stack || error?.message || error)
  }
}
if (only.includes('all') || only.includes('webkit')) {
  try {
    await runCompleteFlow(webkit, 'webkit', { ...devices['iPhone 13'] })
  } catch (error) {
    failures.push(error)
    log('[webkit] failed', error?.stack || error?.message || error)
  }
}

if (failures.length) {
  process.exitCode = 1
}
