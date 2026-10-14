import { devices, expect, test } from '@playwright/test'

async function ready(page) {
  await page.waitForFunction(() => window.gameState?.gameStarted && window.tutorialSystem)
}

async function expectDockHidden(page) {
  const dock = page.locator('#tutorialDock')
  await expect(dock).toBeHidden()
  expect(await dock.boundingBox()).toBeNull()
  await page.evaluate(() => {
    document.dispatchEvent(new Event('mobile-landscape-layout-changed'))
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('orientationchange'))
    // A late animation event must not restore a disabled tutorial.
    document.querySelector('.tutorial-card').dispatchEvent(new Event('animationend'))
  })
  await expect(dock).toBeHidden()
}

for (const phone of [false, true]) {
  test.describe(`tutorial dock on ${phone ? 'iPhone portrait' : 'desktop'}`, () => {
    test.use(phone ? {
      viewport: devices['iPhone 13'].viewport,
      screen: devices['iPhone 13'].screen,
      userAgent: devices['iPhone 13'].userAgent,
      deviceScaleFactor: devices['iPhone 13'].deviceScaleFactor,
      isMobile: true,
      hasTouch: true
    } : {})

    for (const path of ['skip', 'settings', 'completion']) {
      test(`${path} hides the dock across layout changes and reload`, async({ page }) => {
        await page.addInitScript(() => {
          if (!sessionStorage.getItem('tutorial-toggle-seeded')) {
            localStorage.setItem('rts_tutorial_settings', JSON.stringify({ showTutorial: true, speechEnabled: false }))
            localStorage.removeItem('rts_tutorial_progress')
            sessionStorage.setItem('tutorial-toggle-seeded', 'true')
          }
        })
        await page.goto('/?seed=41&size=64&players=2&oreFields=8')
        await ready(page)
        const minimize = page.locator('[data-tutorial-action="minimize"]')
        await expect(minimize).toBeVisible()
        for (const method of ['hideUI', 'stop']) {
          await page.evaluate(method => window.tutorialSystem[method](), method)
          await expectDockHidden(page)
          await expect(page.locator('#tutorialOverlay')).toBeHidden()
          await page.evaluate(() => window.tutorialSystem.start({ reset: true }))
          await expect(minimize).toBeVisible()
        }
        await minimize.click()
        const dock = page.locator('#tutorialDock')
        await expect(dock).toBeVisible()
        await expect(dock).not.toHaveAttribute('title')
        if (phone) {
          await expect(page.locator('body')).toHaveClass(/mobile-portrait/)
          await expect(page.locator('body')).toHaveClass(/sidebar-condensed/)
          const button = await dock.boundingBox()
          const sidebar = await page.locator('#sidebar').boundingBox()
          expect(button.x).toBeLessThan(30)
          expect(button.y).toBeLessThan(60)
          expect(sidebar).not.toBeNull()
          expect(button.x + button.width <= sidebar.x || sidebar.x + sidebar.width <= button.x ||
            button.y + button.height <= sidebar.y || sidebar.y + sidebar.height <= button.y).toBe(true)
        }
        await dock.click()
        await expectDockHidden(page)
        await expect(minimize).toBeVisible()
        if (path === 'skip') {
          await page.locator('[data-tutorial-action="skip"]').click()
        } else if (path === 'settings') {
          await minimize.click()
          await expect(dock).toBeVisible()
          await page.evaluate(() => {
            const checkbox = document.getElementById('tutorialShowOnStartup')
            checkbox.checked = false
            checkbox.dispatchEvent(new Event('change', { bubbles: true }))
          })
        } else {
          // Advance through the real Skip step controls, including final completion.
          const skipStep = page.locator('[data-tutorial-action="skip-step"]')
          const count = await page.evaluate(() => window.tutorialSystem.steps.length)
          for (let index = 0; index < count; index += 1) await skipStep.click()
        }
        await expectDockHidden(page)
        await expect(page.locator('#tutorialOverlay')).toBeHidden()
        // Wait for the actual persisted setting/progress, not legacy localStorage.
        await expect.poll(() => page.evaluate(async path => {
          const { getStoredItem, flushGameStorageWrites } = await import('/src/storage/indexedDbStorage.js')
          await flushGameStorageWrites()
          const key = path === 'completion' ? 'rts_tutorial_progress' : 'rts_tutorial_settings'
          const value = JSON.parse(getStoredItem(key))
          return path === 'completion' ? value.completed : !value.showTutorial
        }, path)).toBe(true)
        await page.reload()
        await ready(page)
        await expectDockHidden(page)
        await expect(page.locator('#tutorialOverlay')).toBeHidden()
      })
    }
  })
}
