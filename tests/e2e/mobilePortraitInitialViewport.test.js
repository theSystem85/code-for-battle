import fs from 'node:fs'
import path from 'node:path'
import { devices, expect, test } from '@playwright/test'

const screenshotDir = process.env.PORTRAIT_SCREENSHOT_DIR || '/opt/cursor/artifacts/screenshots'

function iphoneUse(deviceName, width, height) {
  const device = { ...devices[deviceName], viewport: { width, height } }
  delete device.defaultBrowserType
  return device
}

async function markTutorialComplete(page) {
  await page.addInitScript(() => {
    const settings = JSON.stringify({ showTutorial: false, speechEnabled: false })
    const progress = JSON.stringify({ completed: true, stepIndex: 0 })
    localStorage.setItem('rts_tutorial_settings', settings)
    localStorage.setItem('rts_tutorial_progress', progress)
    localStorage.setItem('tutorial-settings', settings)
    localStorage.setItem('tutorial-progress', progress)
  })
}

async function readPortraitMetrics(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#gameCanvas')
    const bar = document.querySelector('#mobileBuildMenuContainer')
    const canvasBox = canvas ? canvas.getBoundingClientRect() : null
    const barBox = bar ? bar.getBoundingClientRect() : null
    const tutorial = document.querySelector('#tutorialOverlay')
    const rootStyle = window.getComputedStyle(document.documentElement)
    const bodyStyle = window.getComputedStyle(document.body)
    return {
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      clientHeight: document.documentElement.clientHeight,
      bodyHeight: document.body.clientHeight,
      appHeight: rootStyle.getPropertyValue('--app-height'),
      bodyCssHeight: bodyStyle.height,
      rootPosition: rootStyle.position,
      rootTop: rootStyle.top,
      rootBottom: rootStyle.bottom,
      rootOverflow: rootStyle.overflow,
      rootOverscroll: rootStyle.overscrollBehavior,
      canvasHeight: canvasBox?.height ?? null,
      canvasBottom: canvasBox?.bottom ?? null,
      canvasPosition: canvas ? window.getComputedStyle(canvas).position : null,
      canvasStyleHeight: canvas?.style.height ?? null,
      canvasLeft: canvasBox?.left ?? null,
      barHidden: bar?.getAttribute('aria-hidden') ?? null,
      barBottom: barBox?.bottom ?? null,
      barTop: barBox?.top ?? null,
      barHeight: barBox?.height ?? null,
      barPosition: bar ? window.getComputedStyle(bar).position : null,
      rootBorderHeight: document.documentElement.getBoundingClientRect().height,
      sidebarHeight: document.querySelector('#sidebar')?.getBoundingClientRect().height ?? null,
      gapBelowBar: barBox ? window.innerHeight - barBox.bottom : null,
      gapBelowBarInRoot: barBox
        ? document.documentElement.getBoundingClientRect().bottom - barBox.bottom
        : null,
      portrait: document.body.classList.contains('mobile-portrait'),
      classes: document.body.className,
      tutorialHidden: !tutorial || tutorial.hidden || tutorial.getAttribute('aria-hidden') === 'true'
    }
  })
}

function expectFilledPortrait(metrics) {
  expect(metrics.portrait).toBe(true)
  expect(metrics.tutorialHidden).toBe(true)
  expect(metrics.rootPosition).toBe('fixed')
  expect(Number.parseFloat(metrics.rootTop)).toBe(0)
  expect(Number.parseFloat(metrics.rootBottom)).toBe(0)
  expect(metrics.rootOverflow).toBe('hidden')
  expect(metrics.rootOverscroll).toBe('none')
  expect(metrics.barPosition).toBe('absolute')
  expect(metrics.canvasPosition).toBe('absolute')
  expect(metrics.canvasLeft).toBeLessThanOrEqual(1)
  expect(metrics.canvasHeight).toBeGreaterThanOrEqual(metrics.innerHeight - 2)
  expect(metrics.canvasBottom).toBeGreaterThanOrEqual(metrics.innerHeight - 2)
  expect(Math.abs(metrics.gapBelowBar)).toBeLessThanOrEqual(3)
  expect(Math.abs(metrics.gapBelowBarInRoot)).toBeLessThanOrEqual(3)
  expect(Math.abs(metrics.gapBelowBar - metrics.barHeight)).toBeGreaterThan(8)
  expect(metrics.barTop).toBeLessThan(metrics.innerHeight - 40)
}

async function openPortraitGame(page) {
  await page.goto('/?seed=11')
  await page.waitForFunction(() => Boolean(window.gameState?.gameStarted), null, { timeout: 90000 })
  await page.evaluate(() => {
    window.tutorialSystem?.stop?.()
    window.tutorialSystem?.hideUI?.()
  })
  await page.waitForTimeout(800)
  const metrics = await readPortraitMetrics(page)
  expect(metrics, JSON.stringify(metrics)).toMatchObject({
    portrait: true,
    barHidden: 'false'
  })
  expect(metrics.canvasHeight, JSON.stringify(metrics)).toBeGreaterThanOrEqual(metrics.innerHeight - 2)
  expect(Math.abs(metrics.gapBelowBar), JSON.stringify(metrics)).toBeLessThanOrEqual(3)
}

async function shoot(page, filename) {
  fs.mkdirSync(screenshotDir, { recursive: true })
  const filePath = path.join(screenshotDir, filename)
  await page.screenshot({ path: filePath, fullPage: false })
  return filePath
}

test.describe('iPhone portrait initial layout 390x844', () => {
  test.use(iphoneUse('iPhone 13', 390, 844))

  test('fills the screen on first portrait load without rotating', async({ page }) => {
    await markTutorialComplete(page)
    await openPortraitGame(page)
    const metrics = await readPortraitMetrics(page)
    expect(metrics.innerWidth).toBe(390)
    expect(metrics.innerHeight).toBe(844)
    expectFilledPortrait(metrics)
    await shoot(page, 'portrait-initial-390x844.png')
  })
})

test.describe('iPhone portrait initial layout 430x932', () => {
  test.use(iphoneUse('iPhone 14 Pro Max', 430, 932))

  test('fills the screen on first portrait load without rotating', async({ page }) => {
    await markTutorialComplete(page)
    await openPortraitGame(page)
    const metrics = await readPortraitMetrics(page)
    expect(metrics.innerWidth).toBe(430)
    expect(metrics.innerHeight).toBe(932)
    expectFilledPortrait(metrics)
    await shoot(page, 'portrait-initial-430x932.png')
  })
})

test.describe('iPhone portrait cold load with the tutorial still open', () => {
  test.use(iphoneUse('iPhone 13', 390, 844))

  test('fills the screen on first portrait load before the tutorial is completed', async({ page }) => {
    await page.goto('/?seed=11', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => Boolean(window.gameState?.gameStarted), null, { timeout: 90000 })
    await page.waitForTimeout(800)
    const metrics = await readPortraitMetrics(page)
    expect(metrics.innerWidth).toBe(390)
    expect(metrics.innerHeight).toBe(844)
    expect(metrics.portrait).toBe(true)
    expect(metrics.barHidden).toBe('false')
    expect(metrics.barPosition).toBe('absolute')
    expect(metrics.canvasPosition).toBe('absolute')
    expect(metrics.canvasLeft).toBeLessThanOrEqual(1)
    expect(metrics.canvasHeight).toBeGreaterThanOrEqual(metrics.innerHeight - 2)
    expect(Math.abs(metrics.gapBelowBar)).toBeLessThanOrEqual(3)
    expect(Math.abs(metrics.gapBelowBar - metrics.barHeight)).toBeGreaterThan(8)
    await shoot(page, 'portrait-initial-tutorial-open-390x844.png')
  })
})

test.describe('portrait viewport growth', () => {
  test.use(iphoneUse('iPhone 13', 390, 844))

  test('fills the screen after the viewport grows from a short first height', async({ page }) => {
    await markTutorialComplete(page)
    await page.setViewportSize({ width: 390, height: 640 })
    await openPortraitGame(page)
    const collapsed = await readPortraitMetrics(page)
    expect(collapsed.innerHeight).toBe(640)
    expectFilledPortrait(collapsed)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForFunction(() => {
      const bar = document.querySelector('#mobileBuildMenuContainer')
      const canvas = document.querySelector('#gameCanvas')
      if (!bar || !canvas) return false
      const height = window.innerHeight
      return height >= 844
        && canvas.getBoundingClientRect().height >= height - 2
        && Math.abs(height - bar.getBoundingClientRect().bottom) <= 3
    }, null, { timeout: 10000 })

    const grown = await readPortraitMetrics(page)
    expect(grown.innerHeight).toBe(844)
    expectFilledPortrait(grown)
    await shoot(page, 'portrait-after-viewport-grow-390x844.png')
  })

  test('fills after a toolbar-sized viewport growth with no bar-height gap', async({ page }) => {
    await markTutorialComplete(page)
    await page.setViewportSize({ width: 390, height: 748 })
    await openPortraitGame(page)
    const collapsed = await readPortraitMetrics(page)
    expect(collapsed.innerHeight).toBe(748)
    expectFilledPortrait(collapsed)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForFunction(() => {
      const bar = document.querySelector('#mobileBuildMenuContainer')
      const canvas = document.querySelector('#gameCanvas')
      if (!bar || !canvas) return false
      const height = window.innerHeight
      const barBox = bar.getBoundingClientRect()
      return height >= 844
        && canvas.getBoundingClientRect().height >= height - 2
        && Math.abs(height - barBox.bottom) <= 3
        && Math.abs((height - barBox.bottom) - barBox.height) > 8
    }, null, { timeout: 10000 })

    const grown = await readPortraitMetrics(page)
    expect(grown.innerHeight).toBe(844)
    expectFilledPortrait(grown)
    await shoot(page, 'portrait-after-toolbar-grow-390x844.png')
  })
})

const CRIOS_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1'

test.describe('Chrome iOS portrait layout', () => {
  test.use({
    ...iphoneUse('iPhone 13', 390, 844),
    userAgent: CRIOS_USER_AGENT
  })

  test('pins the root with fixed inset and follows a ResizeObserver growth', async({ page }) => {
    await markTutorialComplete(page)
    await openPortraitGame(page)
    const initial = await readPortraitMetrics(page)
    expect(initial.innerWidth).toBe(390)
    expect(initial.innerHeight).toBe(844)
    expectFilledPortrait(initial)
    await shoot(page, 'crios-portrait-initial-390x844.png')

    await page.evaluate(() => {
      const root = document.documentElement
      root.style.bottom = 'auto'
      root.style.height = '920px'
    })
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#gameCanvas')
      return Boolean(canvas) && canvas.getBoundingClientRect().height >= 918
    }, null, { timeout: 10000 })

    const grown = await readPortraitMetrics(page)
    expect(grown.canvasHeight).toBeGreaterThanOrEqual(918)
    expect(grown.rootPosition).toBe('fixed')
    expect(grown.barPosition).toBe('absolute')
    await shoot(page, 'crios-portrait-resize-observer-390x844.png')
  })
})
