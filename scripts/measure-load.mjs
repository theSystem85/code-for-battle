import { chromium } from '@playwright/test'

const url = process.argv[2] || 'http://localhost:4173/'
const dpr = Number(process.argv[3] || 1)
if (!Number.isFinite(dpr) || dpr <= 0) throw new Error('DPR must be positive')
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ deviceScaleFactor: dpr, serviceWorkers: 'block' })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  let requests = 0
  let transferredBytes = 0
  const prepared = { '1x': 0, '2x': 0, '3x': 0 }
  cdp.on('Network.requestWillBeSent', ({ request }) => {
    requests++
    const match = request.url.match(/\/images\/prepared\/.*@(1|2|3)x\.webp/)
    if (match) prepared[`${match[1]}x`]++
  })
  cdp.on('Network.loadingFinished', event => { transferredBytes += event.encodedDataLength })
  const start = performance.now()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden') && window.gameState?.gameStarted, null, { timeout: 120000 })
  console.log(JSON.stringify({ url, dpr, timeToPlayableMs: Math.round(performance.now() - start), requests, transferredBytes, prepared, serviceWorkers: 'blocked (cold page assets)' }, null, 2))
} finally {
  await browser.close()
}
