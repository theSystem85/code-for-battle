import { devices, expect, test } from '@playwright/test'

const iphone = { ...devices['iPhone 13'] }
delete iphone.defaultBrowserType
test.use({ ...iphone, viewport: { width: 390, height: 844 }, storageState: undefined })

test('[E00129] portrait PWA money and power bars fill the status bar above the home indicator', async({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'standalone', { get: () => true })
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=11')
  await page.waitForFunction(() => Boolean(window.gameState?.gameStarted))
  // Chromium reports no safe area, so simulate the iPhone's 34px home indicator inset.
  await page.addStyleTag({ content: 'body.is-touch{--safe-area-bottom:34px !important;}' })
  await expect(page.locator('body')).toHaveClass(/pwa-standalone/)
  await expect(page.locator('body')).toHaveClass(/mobile-portrait/)

  const boxes = await page.evaluate(() => {
    const box = id => {
      const rect = document.getElementById(id).getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, height: rect.height }
    }
    return {
      bar: box('mobileStatusBar'),
      money: box('mobileMoneyTrack'),
      energy: box('mobileEnergyTrack'),
      moneyText: box('mobileMoneyValue'),
      energyText: box('mobileEnergyValue')
    }
  })

  expect(boxes.bar.height).toBeCloseTo(34, 0)
  for (const track of [boxes.money, boxes.energy]) {
    // 3px top padding, 13px kept free for the home indicator, the rest is bar.
    expect(track.top - boxes.bar.top).toBeCloseTo(3, 0)
    expect(boxes.bar.bottom - track.bottom).toBeCloseTo(13, 0)
    expect(track.height).toBeCloseTo(18, 0)
  }
  for (const [text, track] of [[boxes.moneyText, boxes.money], [boxes.energyText, boxes.energy]]) {
    expect((text.top + text.bottom) / 2).toBeCloseTo((track.top + track.bottom) / 2, 0)
  }
})
