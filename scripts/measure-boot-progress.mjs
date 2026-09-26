import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const baseURL = process.env.BOOT_MEASURE_URL || 'http://127.0.0.1:5173'
const backend = process.env.BOOT_MEASURE_BACKEND || 'auto'
const outDir = process.env.BOOT_MEASURE_OUT || '/tmp/boot-progress'
const label = process.env.BOOT_MEASURE_LABEL || 'before'

fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--mute-audio',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,UseSkiaRenderer',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist'
  ]
})

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  serviceWorkers: 'block'
})
const page = await context.newPage()
const client = await context.newCDPSession(page)
await client.send('Network.setCacheDisabled', { cacheDisabled: true })
await client.send('Network.clearBrowserCache')

await page.addInitScript((choice) => {
  window.__RECORD_BOOT_TIMING = true
  window.__bootMeasure = { choice, samples: [] }
  const open = indexedDB.open('code-for-battle-storage', 1)
  open.onupgradeneeded = () => {
    const db = open.result
    if (!db.objectStoreNames.contains('keyValue')) {
      db.createObjectStore('keyValue', { keyPath: 'key' })
    }
  }
  open.onsuccess = () => {
    const db = open.result
    const tx = db.transaction('keyValue', 'readwrite')
    const value = JSON.stringify({
      rendererBackendChoice: choice,
      rendererBackend: choice === 'auto' ? 'webgl' : choice
    })
    tx.objectStore('keyValue').put({ key: 'rts_graphics_settings', value })
  }
}, backend)

const samples = []
const pageErrors = []
const captureShots = process.env.BOOT_MEASURE_SHOTS === '1'
const shotPercents = new Set()
let stopped = false
const startedAt = Date.now()
page.on('pageerror', error => pageErrors.push(String(error)))
page.on('console', message => {
  if (message.type() === 'error') pageErrors.push(message.text())
})

async function sampleLoop() {
  while (!stopped) {
    const point = await page.evaluate(() => {
      const track = document.getElementById('loadingScreenTrack')
      const percent = document.getElementById('loadingScreenPercent')
      const detail = document.getElementById('loadingScreenDetail')
      const root = document.getElementById('loadingScreen')
      const hidden = root?.classList.contains('loading-screen--hidden') === true
      const now = performance.now()
      return {
        now,
        hidden,
        phase: root?.dataset?.phase || null,
        aria: track?.getAttribute('aria-valuenow') || null,
        text: percent?.textContent || null,
        detail: detail?.textContent || null,
        timing: window.__bootTiming || null,
        spriteSamples: window.__bootSpriteSamples || null,
        backend: window.gameInstance?.renderer?.webgpuRenderer?.status || null,
        activeBackend: window.__rendererBackend || null
      }
    }).catch(() => null)
    if (point) {
      const percent = point.aria == null ? null : Number(point.aria)
      if (captureShots && !point.hidden && percent != null) {
        for (const target of [12, 35, 55, 75]) {
          if (percent >= target && !shotPercents.has(target)) {
            shotPercents.add(target)
            const shot = path.join(outDir, `${label}-${backend}-${target}.png`)
            await page.screenshot({ path: shot }).catch(() => {})
            break
          }
        }
      }
      samples.push({
        wallMs: Date.now() - startedAt,
        perfMs: point.now,
        hidden: point.hidden,
        phase: point.phase,
        percent: point.aria == null ? null : Number(point.aria),
        text: point.text,
        detail: point.detail,
        gpuStatus: point.backend
      })
      if (point.hidden && point.gpuStatus && point.gpuStatus !== 'initializing' && point.gpuStatus !== 'idle') {
        stopped = true
        break
      }
    }
    await new Promise(resolve => setTimeout(resolve, 40))
  }
}

const cacheBust = `cold=${Date.now()}-${label}-${backend}`
const navigation = page.goto(`${baseURL}/?${cacheBust}`, { waitUntil: 'commit', timeout: 120000 })
const sampling = sampleLoop()
await navigation
await Promise.race([
  sampling,
  page.waitForFunction(() => document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'), { timeout: 120000 })
    .then(async() => {
      await page.waitForFunction(() => {
        const status = window.gameInstance?.renderer?.webgpuRenderer?.status
        return !navigator.gpu || status === 'ready' || status === 'failed' || status == null
      }, { timeout: 15000 }).catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 200))
      stopped = true
    })
])
stopped = true
await sampling.catch(() => {})

const summary = await page.evaluate(() => ({
  spriteSamples: window.__bootSpriteSamples || null,
  timing: window.__bootTiming || null,
  gpu: {
    webgpuStatus: window.gameInstance?.renderer?.webgpuRenderer?.status || null,
    webgpuFailure: window.gameInstance?.renderer?.webgpuRenderer?.failureReason || null,
    hasWebGL: Boolean(window.gameInstance?.renderer?.gpuRenderer),
    hasGpu: Boolean(navigator.gpu)
  },
  graphics: window.gameState ? {
    // populated later if exposed
  } : null
})).catch(() => null)

const report = {
  label,
  backendRequested: backend,
  sampleCount: samples.length,
  samples,
  summary
}
const file = path.join(outDir, `${label}-${backend}.json`)
fs.writeFileSync(file, JSON.stringify(report, null, 2))

const visible = samples.filter(sample => sample.percent != null)
const first = visible[0]
const last = samples[samples.length - 1]
const plateau = []
let run = null
for (const sample of visible) {
  if (!run || run.percent !== sample.percent) {
    if (run) plateau.push(run)
    run = { percent: sample.percent, start: sample.wallMs, end: sample.wallMs, detail: sample.detail, phase: sample.phase }
  } else {
    run.end = sample.wallMs
    run.detail = sample.detail
    run.phase = sample.phase
  }
}
if (run) plateau.push(run)
plateau.sort((a, b) => (b.end - b.start) - (a.end - a.start))

console.log(JSON.stringify({
  file,
  durationMs: last ? last.wallMs : null,
  firstPercent: first?.percent ?? null,
  hiddenAt: samples.find(sample => sample.hidden)?.wallMs ?? null,
  longestPlateaus: plateau.slice(0, 8).map(item => ({
    percent: item.percent,
    ms: item.end - item.start,
    phase: item.phase,
    detail: item.detail
  })),
  gpu: summary?.gpu || null,
  timingMarks: summary?.timing?.marks?.length || 0,
  pageErrors: pageErrors.slice(0, 8)
}, null, 2))

await browser.close()
