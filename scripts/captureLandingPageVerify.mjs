import fs from 'fs'
import path from 'path'

import { chromium } from '@playwright/test'
import sharp from 'sharp'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173'
const OUT = process.env.LANDING_VERIFY_DIR || '/tmp/landing-verify'

const VIEWS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'phone', width: 390, height: 844 }
]

const STOPS = [
  { name: 'top', ratio: 0 },
  { name: 'mid', ratio: 0.45 },
  { name: 'bottom', ratio: 1 }
]

function isBodyGap(r, g, b) {
  return r === 6 && g === 12 && b === 26
}

async function sampleTop(png) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  const samples = []
  for (const y of [0, 8, 24]) {
    const i = (y * info.width + Math.floor(info.width * 0.2)) * info.channels
    samples.push({ y, r: data[i], g: data[i + 1], b: data[i + 2] })
  }
  return samples
}

async function shoot(page, file) {
  const png = await page.screenshot({ type: 'png', animations: 'disabled' })
  await sharp(png).png().toFile(file)
  const samples = await sampleTop(png)
  if (samples.some(pixel => isBodyGap(pixel.r, pixel.g, pixel.b))) {
    throw new Error(`Dark band above the header in ${path.basename(file)}: ${JSON.stringify(samples)}`)
  }
}

async function scrollToRatio(page, ratio) {
  await page.evaluate(async (targetRatio) => {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    const top = Math.round(max * targetRatio)
    window.scrollTo({ top, behavior: 'instant' })
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }, ratio)
  const layout = await page.evaluate(() => {
    const header = document.querySelector('.landing-bar').getBoundingClientRect()
    const shift = document.querySelector('.landing-backdrop__shift').getBoundingClientRect()
    return {
      headerTop: header.top,
      shiftTop: shift.top,
      shiftBottom: shift.bottom,
      viewH: window.innerHeight,
      transform: document.querySelector('.landing-backdrop__shift').style.transform
    }
  })
  if (layout.headerTop > 0.5) {
    throw new Error(`Header left the top (${layout.headerTop})`)
  }
  if (layout.shiftTop >= 0 || layout.shiftBottom <= layout.viewH) {
    throw new Error(`Backdrop does not overscan the viewport: ${JSON.stringify(layout)}`)
  }
  return layout
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  for (const locale of ['en', 'de']) {
    for (const view of VIEWS) {
      const context = await browser.newContext({
        viewport: { width: view.width, height: view.height },
        deviceScaleFactor: 1
      })
      const page = await context.newPage()
      await page.goto(`${BASE}/${locale}/landing`, { waitUntil: 'networkidle', timeout: 60000 })
      await page.waitForSelector('h1')
      const title = await page.locator('h1').innerText()
      if (!title.toLowerCase().includes('code for battle')) throw new Error(`Missing title on ${locale} ${view.name}: ${title}`)
      const body = await page.locator('body').innerText()
      if (locale === 'de' && !body.includes('Galerie')) throw new Error('German landing did not render')
      if (locale === 'en' && !body.includes('Gallery')) throw new Error('English landing did not render')
      const behavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)
      if (behavior !== 'auto') throw new Error(`Expected instant scrolling, got ${behavior}`)
      for (const stop of STOPS) {
        const layout = await scrollToRatio(page, stop.ratio)
        if (stop.ratio > 0 && !layout.transform.includes('translate3d')) {
          throw new Error(`Parallax missing on ${locale} ${view.name} ${stop.name}: ${layout.transform}`)
        }
        await shoot(page, path.join(OUT, `${locale}-${view.name}-${stop.name}.png`))
        console.log(locale, view.name, stop.name, layout.transform, 'shift', Math.round(layout.shiftTop))
      }
      await context.close()
    }
  }

  const reduced = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce'
  })
  const page = await reduced.newPage()
  await page.goto(`${BASE}/en/landing`, { waitUntil: 'networkidle' })
  const layout = await scrollToRatio(page, 0.7)
  if (layout.transform) throw new Error(`Reduced motion still parallaxed: ${layout.transform}`)
  await shoot(page, path.join(OUT, 'en-desktop-reduced-motion.png'))
  console.log('reduced motion ok')
  await browser.close()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
