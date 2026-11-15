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

async function openPortraitGame(page) {
  await page.addInitScript(() => {
    localStorage.setItem('rts_tutorial_settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('rts_tutorial_progress', JSON.stringify({ completed: true, stepIndex: 0, version: 2 }))
  })
  await page.goto('/?seed=11')
  await page.waitForFunction(() => Boolean(window.gameState?.gameStarted))
  await expect(page.locator('#loadingScreen')).toBeHidden({ timeout: 60000 })
}

async function showMilestoneClip(page) {
  return page.evaluate(async() => {
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
    videoOverlay.updateVideoPlacement()
    videoOverlay.overlayElement.classList.add('native-video', 'show')
    const read = selector => {
      const element = document.querySelector(selector)
      if (!element) return null
      const style = globalThis.getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') return null
      const box = element.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) return null
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    }
    const radar = document.getElementById('mobileMinimapOverlay')
    radar.classList.add('visible')
    const radarBox = radar.getBoundingClientRect()
    const rect = videoOverlay.overlayElement.getBoundingClientRect()
    radar.classList.remove('visible')
    return {
      played,
      readyState: video.readyState,
      error: video.error ? video.error.code : 0,
      overlay: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      radar: { x: radarBox.x, y: radarBox.y, width: radarBox.width, height: radarBox.height },
      build: read('#mobileBuildMenuContainer'),
      actions: read('#mobilePortraitActions'),
      badge: read('#notificationHistoryBadge'),
      width: window.innerWidth,
      height: window.innerHeight,
      acquire: videoOverlay.overlayElement.classList.contains('signal-acquire'),
      release: videoOverlay.overlayElement.classList.contains('signal-release')
    }
  })
}

function expectRadarMatch(playback) {
  expect(playback.overlay.width).toBeCloseTo(playback.radar.width, 0)
  expect(playback.overlay.height).toBeCloseTo(playback.radar.height, 0)
  expect(playback.overlay.width).toBeCloseTo(250, 0)
  expect(playback.overlay.height).toBeCloseTo(150, 0)
  expect(playback.overlay.width / playback.overlay.height).toBeCloseTo(5 / 3, 1)
  expect(playback.overlay.x + playback.overlay.width).toBeCloseTo(playback.radar.x + playback.radar.width, 0)
  expect(playback.overlay.y + playback.overlay.height).toBeCloseTo(playback.radar.y + playback.radar.height, 0)
  expect(playback.overlay.x + playback.overlay.width).toBeCloseTo(playback.width, 0)
  expect(playback.overlay.x + playback.overlay.width / 2).toBeGreaterThan(playback.width / 2)
  expect(playback.overlay.y + playback.overlay.height / 2).toBeGreaterThan(playback.height / 2)
}

test('[E00260] portrait condensed milestone video sits on the bottom-right radar', async({ page }, testInfo) => {
  await openPortraitGame(page)
  await expect(page.locator('body')).toHaveClass(/mobile-portrait/)
  await expect(page.locator('body')).toHaveClass(/sidebar-condensed/)
  await expect(page.locator('body')).not.toHaveClass(/sidebar-collapsed/)
  await expect(page.locator('#mobileBuildMenuContainer')).toBeVisible()
  await expect(page.locator('#mobilePortraitActions')).toBeVisible()
  await page.addStyleTag({
    content: '#video-overlay.native-video.show{outline:3px solid #39f7c2;background:rgba(0,24,18,0.88);}' +
      '#video-overlay.signal-acquire .milestone-video,' +
      '#video-overlay.signal-acquire .signal-slice,' +
      '#video-overlay.signal-acquire .signal-scan{animation-play-state:paused;animation-delay:-70ms;}'
  })

  const playback = await showMilestoneClip(page)
  testInfo.annotations.push({
    type: 'milestone-playback',
    description: `played=${playback.played} readyState=${playback.readyState} error=${playback.error} ` +
      `overlay=${playback.overlay.width}x${playback.overlay.height}@${Math.round(playback.overlay.x)},${Math.round(playback.overlay.y)}`
  })

  expectRadarMatch(playback)
  expect(playback.overlay.y + playback.overlay.height).toBeLessThan(playback.actions.y)
  expect(overlaps(playback.overlay, playback.build)).toBe(false)
  expect(overlaps(playback.overlay, playback.actions)).toBe(false)
  if (playback.badge) expect(overlaps(playback.overlay, playback.badge)).toBe(false)

  await page.evaluate(() => {
    document.getElementById('video-overlay').classList.add('signal-acquire')
  })
  await page.screenshot({
    path: '/opt/cursor/artifacts/portrait-milestone-radar-condensed-glitch.png',
    fullPage: false
  })
  await page.evaluate(() => {
    const overlay = document.getElementById('video-overlay')
    overlay.classList.remove('signal-acquire')
  })
  await page.screenshot({
    path: testInfo.outputPath('portrait-milestone-radar.png'),
    fullPage: false
  })
  await page.screenshot({
    path: '/opt/cursor/artifacts/portrait-milestone-radar-condensed.png',
    fullPage: false
  })
})

test('[E00261] portrait collapsed milestone video uses the collapsed radar anchor', async({ page }, testInfo) => {
  await openPortraitGame(page)
  await page.evaluate(() => {
    document.body.classList.remove('sidebar-condensed')
    document.body.classList.add('sidebar-collapsed')
  })
  await expect(page.locator('body')).toHaveClass(/sidebar-collapsed/)
  await page.addStyleTag({
    content: '#video-overlay.native-video.show{outline:3px solid #39f7c2;background:rgba(0,24,18,0.88);}' +
      '#video-overlay.signal-acquire .milestone-video,' +
      '#video-overlay.signal-acquire .signal-slice,' +
      '#video-overlay.signal-acquire .signal-scan{animation-play-state:paused;animation-delay:-70ms;}'
  })
  const playback = await showMilestoneClip(page)
  expectRadarMatch(playback)
  if (playback.actions) {
    expect(playback.overlay.y + playback.overlay.height).toBeLessThanOrEqual(playback.actions.y + 1)
  }
  await page.evaluate(() => {
    document.getElementById('video-overlay').classList.add('signal-acquire')
  })
  await page.screenshot({
    path: '/opt/cursor/artifacts/portrait-milestone-radar-collapsed-glitch.png',
    fullPage: false
  })
  await page.evaluate(() => {
    document.getElementById('video-overlay')?.classList.remove('signal-acquire')
  })
  await page.screenshot({
    path: testInfo.outputPath('portrait-milestone-radar-collapsed.png'),
    fullPage: false
  })
  await page.screenshot({
    path: '/opt/cursor/artifacts/portrait-milestone-radar-collapsed.png',
    fullPage: false
  })
})
