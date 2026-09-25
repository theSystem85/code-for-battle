import fs from 'fs'
import path from 'path'

import { chromium } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173'
const OUT = process.env.LANDING_VERIFY_DIR || '/tmp/landing-verify'

const VIEWS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'phone', width: 390, height: 844 }
]

async function shoot(page, file) {
  await page.screenshot({ path: file, type: 'png', animations: 'disabled' })
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
      await shoot(page, path.join(OUT, `${locale}-${view.name}-top.png`))
      await page.evaluate(() => window.scrollTo(0, Math.round(document.documentElement.scrollHeight * 0.45)))
      await page.waitForTimeout(200)
      const shift = await page.locator('.landing-backdrop__shift').evaluate(node => node.style.transform)
      if (!shift.includes('translate3d')) throw new Error(`Parallax missing on ${locale} ${view.name}: ${shift}`)
      await shoot(page, path.join(OUT, `${locale}-${view.name}-scrolled.png`))
      await context.close()
      console.log(locale, view.name, shift)
    }
  }

  const reduced = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce'
  })
  const page = await reduced.newPage()
  await page.goto(`${BASE}/en/landing`, { waitUntil: 'networkidle' })
  await page.evaluate(() => window.scrollTo(0, 800))
  await page.waitForTimeout(200)
  const shift = await page.locator('.landing-backdrop__shift').evaluate(node => node.style.transform)
  if (shift) throw new Error(`Reduced motion still parallaxed: ${shift}`)
  await shoot(page, path.join(OUT, 'en-desktop-reduced-motion.png'))
  console.log('reduced motion ok')
  await browser.close()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
