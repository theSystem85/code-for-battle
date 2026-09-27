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
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
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
  const opened = await page.evaluate(() => {
    const modal = document.getElementById('configSettingsModal')
    const button = document.querySelector('#mapSettingsBtn') || document.querySelector('#helpBtn')
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
  if (!opened.open) {
    await page.keyboard.press('i')
  }
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
  return section
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

async function bootOffline(page, { navigate }) {
  if (!navigate) {
    // Playwright's WebKit build hangs or crashes on navigation while
    // context.setOffline(true). The live page still flips to Offline and
    // the Cache API still holds the bytes. Chromium covers the reload.
    await page.waitForFunction(() => {
      return /offline/i.test(document.querySelector('[data-offline-label]')?.textContent || '')
    }, null, { timeout: 10000 })
    const audio = await readCacheEntry(page, '/sound/music/music01.mp3')
    const image = await readCacheEntry(page, '/images/terrain/terrain-details.png')
    const label = await page.locator('[data-offline-label]').innerText()
    return { audio, image, started: false, label, via: 'cache-api' }
  }
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('#gameCanvas', { timeout: 30000 })
  await page.waitForFunction(() => Boolean(window.gameState), null, { timeout: 30000 })
  const audio = await readCachedAsset(page, '/sound/music/music01.mp3')
  const image = await page.evaluate(async() => {
    const response = await fetch('/images/terrain/terrain-details.png')
    return { status: response.status, bytes: (await response.arrayBuffer()).byteLength }
  })
  let started = false
  try {
    await page.locator('#pauseBtn').click({ timeout: 5000 })
    await page.waitForFunction(() => window.gameState && window.gameState.gameStarted === true, null, { timeout: 20000 })
    const first = await page.evaluate(() => window.gameState.gameTime)
    await page.waitForTimeout(400)
    const second = await page.evaluate(() => window.gameState.gameTime)
    started = second > first
  } catch (error) {
    log('match start skipped', error?.message || error)
  }
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
  const section = await openOfflineSettings(page)
  await section.screenshot({ path: `${artifacts}/offline-settings-${name}.png` })
  await closeSettings(page)
  await context.setOffline(true)
  const booted = await bootOffline(page, { navigate: name !== 'webkit' })
  log(`[${name}] offline boot`, booted)
  await page.screenshot({ path: `${artifacts}/offline-game-${name}.png`, fullPage: false })
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
  if (!/offline/i.test(booted.label)) {
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
