import { devices, expect, test } from '@playwright/test'

const iphone = { ...devices['iPhone 13'] }
delete iphone.defaultBrowserType
test.use({ ...iphone, viewport: { width: 390, height: 844 } })

function overlaps(a, b) {
  if (!a || !b || b.width < 1 || b.height < 1) return false
  return a.x < b.x + b.width - 1
    && a.x + a.width > b.x + 1
    && a.y < b.y + b.height - 1
    && a.y + a.height > b.y + 1
}

test('[E00260] portrait condensed milestone video uses half the screen width', async({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('rts_tutorial_settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('rts_tutorial_progress', JSON.stringify({ completed: true, stepIndex: 0, version: 2 }))
  })
  await page.goto('/?seed=11')
  await page.waitForFunction(() => Boolean(window.gameState?.gameStarted))
  await expect(page.locator('#loadingScreen')).toBeHidden({ timeout: 60000 })
  await expect(page.locator('body')).toHaveClass(/mobile-portrait/)
  await expect(page.locator('body')).toHaveClass(/sidebar-condensed/)
  await expect(page.locator('body')).not.toHaveClass(/sidebar-collapsed/)
  await expect(page.locator('#mobileBuildMenuContainer')).toBeVisible()
  await expect(page.locator('#mobilePortraitActions')).toBeVisible()

  const playback = await page.evaluate(async() => {
    const offline = await import('/src/pwa/offlineState.js')
    offline.setOfflineSnapshot({ navigatorOnLine: true, forced: false, probeFailed: false })
    const { playSyncedVideoAudio, videoOverlay } = await import('/src/ui/videoOverlay.js')
    const video = videoOverlay.overlayElement.querySelector('video')
    let played = false
    try {
      await playSyncedVideoAudio('first_tank', { title: 'First tank' })
      played = !video.error && video.readyState >= 2
    } catch {
      played = false
    }
    if (!videoOverlay.overlayElement.classList.contains('native-video')) {
      videoOverlay.updateVideoPlacement()
    }
    videoOverlay.overlayElement.classList.add('show')
    const rect = videoOverlay.overlayElement.getBoundingClientRect()
    const read = selector => {
      const element = document.querySelector(selector)
      if (!element) return null
      const style = globalThis.getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') return null
      const box = element.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) return null
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    }
    return {
      played,
      readyState: video.readyState,
      error: video.error ? video.error.code : 0,
      overlay: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      build: read('#mobileBuildMenuContainer'),
      actions: read('#mobilePortraitActions'),
      badge: read('#notificationHistoryBadge'),
      width: window.innerWidth,
      height: window.innerHeight
    }
  })

  testInfo.annotations.push({
    type: 'milestone-playback',
    description: `played=${playback.played} readyState=${playback.readyState} error=${playback.error}`
  })

  expect(playback.overlay.width).toBeCloseTo(playback.width / 2, 0)
  expect(playback.overlay.height).toBeCloseTo(playback.overlay.width * 120 / 160, 0)
  expect(playback.overlay.x).toBeCloseTo((playback.width - playback.overlay.width) / 2, 0)
  expect(playback.overlay.y).toBeGreaterThanOrEqual(12)
  expect(playback.overlay.y + playback.overlay.height).toBeLessThan(playback.actions.y)
  expect(overlaps(playback.overlay, playback.build)).toBe(false)
  expect(overlaps(playback.overlay, playback.actions)).toBe(false)
  if (playback.badge) expect(overlaps(playback.overlay, playback.badge)).toBe(false)

  await page.screenshot({
    path: testInfo.outputPath('portrait-milestone-half-width.png'),
    fullPage: false
  })
})
