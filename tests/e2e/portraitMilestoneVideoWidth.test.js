import { devices, expect, test } from '@playwright/test'

const iphone = { ...devices['iPhone 13'] }
delete iphone.defaultBrowserType
test.use({ ...iphone, viewport: { width: 390, height: 844 } })

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

test('[E00260] condensed portrait milestone slides in below the safe area before playback', async({ page }) => {
  await page.route('**/milestone-entrance-test', route => route.fulfill({
    contentType: 'text/html',
    body: '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body class="mobile-portrait sidebar-condensed" style="--safe-area-top:50px;--safe-area-left:8px;--z-hud-float:30"></body>'
  }))
  await page.goto('/milestone-entrance-test')

  const result = await page.evaluate(async() => {
    const offline = await import('/src/pwa/offlineState.js')
    offline.setOfflineSnapshot({ navigatorOnLine: true, forced: false, probeFailed: false })
    const { videoOverlay: overlay } = await import('/src/ui/videoOverlay.js')
    const element = overlay.overlayElement
    const video = element.querySelector('video')
    let played = false
    let acquired = false
    // Drive the media events directly so the test works without HEVC support.
    Object.defineProperty(video, 'src', { configurable: true, writable: true, value: '' })
    video.load = () => video.dispatchEvent(new Event('canplay'))
    video.play = async() => {
      played = true
      video.dispatchEvent(new Event('playing'))
      acquired = element.classList.contains('signal-acquire')
    }
    const playback = overlay.playMilestoneVideo('test-entrance.mp4')
    while (!element.classList.contains('entering') && overlay.isPlaying) {
      await new Promise(resolve => requestAnimationFrame(resolve))
    }
    const [animation] = element.getAnimations()
    animation.pause()
    animation.currentTime = 0
    const from = element.getBoundingClientRect()
    animation.currentTime = 200
    const midway = element.getBoundingClientRect()
    const playedDuringSlide = played
    animation.finish()
    await playback
    const final = element.getBoundingClientRect()
    overlay.stopCurrentVideo(true)
    return {
      fromRight: from.right,
      midwayLeft: midway.left,
      playedDuringSlide,
      played,
      acquired,
      final: { x: final.x, y: final.y, width: final.width, height: final.height }
    }
  })
  expect(result.fromRight).toBeCloseTo(0)
  expect(result.midwayLeft).toBeGreaterThan(-242)
  expect(result.midwayLeft).toBeLessThan(8)
  expect(result.playedDuringSlide).toBe(false)
  expect(result.played).toBe(true)
  expect(result.acquired).toBe(true)
  expect(result.final).toEqual({ x: 8, y: 62, width: 250, height: 150 })
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
  await page.evaluate(() => {
    document.getElementById('video-overlay')?.classList.remove('signal-acquire')
  })
  await page.screenshot({
    path: testInfo.outputPath('portrait-milestone-radar-collapsed.png'),
    fullPage: false
  })
})
