import { test, expect } from '@playwright/test'

const RUN_BENCHMARK = process.env.PERF_BENCHMARK === '1'
const BENCHMARK_DURATION_MS = Number.parseInt(process.env.PERF_BENCHMARK_DURATION_MS || '8000', 10)
const MOBILE_CPU_THROTTLE = Number.parseFloat(process.env.PERF_MOBILE_CPU_THROTTLE || '8')
const DESKTOP_MIN_FPS = Number.parseFloat(process.env.PERF_DESKTOP_MIN_FPS || '60')
const MOBILE_REGRESSION_MAX_FPS = Number.parseFloat(process.env.PERF_MOBILE_REGRESSION_MAX_FPS || '10')
const MOBILE_FIXED_MIN_FPS = Number.parseFloat(process.env.PERF_MOBILE_FIXED_MIN_FPS || '20')
const EXPECT_MOBILE_REGRESSION = process.env.PERF_EXPECT_MOBILE_REGRESSION === '1'
const ENFORCE_FIXED_BUDGET = process.env.PERF_ENFORCE_FIXED_BUDGET === '1'

function getBenchmarkUrls(baseURL) {
  const rawUrls = process.env.PERF_BENCHMARK_URLS
  if (rawUrls) {
    return rawUrls
      .split(',')
      .map(url => url.trim())
      .filter(Boolean)
  }

  return [baseURL || 'http://localhost:5173']
}

function buildBenchmarkUrl(rawUrl) {
  const url = new URL(rawUrl, 'http://localhost:5173')
  url.searchParams.set('seed', '11')
  url.searchParams.set('size', '128')
  url.searchParams.set('players', '4')
  url.searchParams.set('oreFields', '24')
  return url.toString()
}

async function createProfileContext(browser, profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    userAgent: profile.userAgent
  })

  await context.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    localStorage.setItem('rts-map-water-percent', '35')
    localStorage.setItem('rts-map-rock-percent', '5')
    localStorage.setItem('rts-map-shore-north', 'true')
    localStorage.setItem('rts-map-shore-west', 'true')
    localStorage.setItem('rts-map-shore-east', 'true')
    localStorage.setItem('rts-map-shore-south', 'true')
    localStorage.setItem('rts-map-center-lake', 'true')
    localStorage.setItem('rts-shadow-of-war-enabled', 'false')
    localStorage.setItem('rts-game-speed-multiplier', '1')
  })

  return context
}

async function applyCpuThrottle(context, page, rate) {
  if (!Number.isFinite(rate) || rate <= 1) return null
  const session = await context.newCDPSession(page)
  await session.send('Emulation.setCPUThrottlingRate', { rate })
  return session
}

async function waitForReadyGame(page) {
  await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 45000 })
  await page.waitForFunction(() => Boolean(
    window.gameState?.gameStarted &&
    window.gameInstance?.gameLoop &&
    window.gameInstance?.canvasManager
  ), { timeout: 45000 })
}

async function prepareStressScene(page, profileName) {
  await page.evaluate(async({ profileName }) => {
    const game = window.gameInstance
    const gameState = window.gameState
    const map = game?.mapGrid || gameState?.mapGrid
    const canvas = document.getElementById('gameCanvas')
    if (!game || !gameState || !Array.isArray(map) || !map.length || !canvas) {
      return { ok: false, reason: 'missing-runtime' }
    }

    gameState.frameLimiterEnabled = profileName !== 'desktop'
    gameState.fpsVisible = true
    gameState.gamePaused = false
    gameState.gameStarted = true
    gameState.speedMultiplier = 1

    const mapHeight = map.length
    const mapWidth = map[0]?.length || 0
    const stressMinX = Math.floor(mapWidth * 0.18)
    const stressMaxX = Math.floor(mapWidth * 0.82)
    const stressMinY = Math.floor(mapHeight * 0.18)
    const stressMaxY = Math.floor(mapHeight * 0.82)

    for (let y = stressMinY; y < stressMaxY; y++) {
      for (let x = stressMinX; x < stressMaxX; x++) {
        const tile = map[y]?.[x]
        if (!tile) continue
        tile.building = null
        tile.ore = 0
        tile.seedCrystal = false
        const localX = x - stressMinX
        const localY = y - stressMinY
        if ((localX + localY) % 7 === 0 || (localX % 11 === 0 && localY % 3 !== 0)) {
          tile.type = 'water'
        } else if (localX % 4 === 0 || localY % 5 === 0 || (localX + localY) % 9 === 0) {
          tile.type = 'street'
        } else {
          tile.type = 'land'
        }
      }
    }

    const renderModule = await import('/src/rendering.js').catch(() => null)
    renderModule?.recomputeSOTMask?.(map)
    renderModule?.getMapRenderer?.()?.invalidateAllChunks?.()

    const viewportWidth = canvas.clientWidth || 800
    const viewportHeight = canvas.clientHeight || 600
    const maxScrollX = Math.max(0, mapWidth * 20 - viewportWidth)
    const maxScrollY = Math.max(0, mapHeight * 20 - viewportHeight)
    gameState.scrollOffset.x = Math.min(maxScrollX, Math.max(0, stressMinX * 20))
    gameState.scrollOffset.y = Math.min(maxScrollY, Math.max(0, stressMinY * 20))
    game.gameLoop?.requestRender?.()
    return { ok: true, mapWidth, mapHeight, maxScrollX, maxScrollY }
  }, { profileName })
}

async function collectBenchmarkStats(page, durationMs) {
  return page.evaluate(async(durationMs) => {
    const averageInPage = (values) => {
      if (!values.length) return 0
      return values.reduce((sum, value) => sum + value, 0) / values.length
    }
    const percentileInPage = (values, percentileValue) => {
      if (!values.length) return 0
      const sorted = [...values].sort((a, b) => a - b)
      const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1))
      return sorted[index]
    }
    const loop = window.gameInstance?.gameLoop
    const gameState = window.gameState
    const canvas = document.getElementById('gameCanvas')
    const fpsDisplay = loop?.fpsDisplay
    const originalBreakdown = fpsDisplay?.reportFrameBreakdown?.bind(fpsDisplay)
    const originalDrawImage = window.CanvasRenderingContext2D.prototype.drawImage
    const frameIntervals = []
    const breakdowns = []
    const drawImageSamples = []
    let drawImageCount = 0
    let lastFrameTime = null
    let sweepDirection = 1

    if (fpsDisplay && originalBreakdown) {
      fpsDisplay.reportFrameBreakdown = (breakdown = {}) => {
        breakdowns.push({
          updateMs: Number.isFinite(breakdown.updateMs) ? breakdown.updateMs : 0,
          renderMs: Number.isFinite(breakdown.renderMs) ? breakdown.renderMs : 0,
          idleMs: Number.isFinite(breakdown.idleMs) ? breakdown.idleMs : 0
        })
        return originalBreakdown(breakdown)
      }
    }

    window.CanvasRenderingContext2D.prototype.drawImage = function wrappedDrawImage(...args) {
      drawImageCount += 1
      return originalDrawImage.apply(this, args)
    }

    const startTime = performance.now()
    let lastDrawSampleTime = startTime

    await new Promise(resolve => {
      function step(timestamp) {
        if (lastFrameTime !== null) {
          frameIntervals.push(timestamp - lastFrameTime)
        }
        lastFrameTime = timestamp

        if (gameState && canvas) {
          const mapWidthPx = (gameState.mapTilesX || 128) * 20
          const mapHeightPx = (gameState.mapTilesY || 128) * 20
          const maxScrollX = Math.max(0, mapWidthPx - (canvas.clientWidth || 800))
          const maxScrollY = Math.max(0, mapHeightPx - (canvas.clientHeight || 600))
          gameState.scrollOffset.x += sweepDirection * 9
          gameState.scrollOffset.y += sweepDirection * 5
          if (gameState.scrollOffset.x >= maxScrollX || gameState.scrollOffset.y >= maxScrollY) {
            sweepDirection = -1
          } else if (gameState.scrollOffset.x <= 0 || gameState.scrollOffset.y <= 0) {
            sweepDirection = 1
          }
          gameState.scrollOffset.x = Math.max(0, Math.min(maxScrollX, gameState.scrollOffset.x))
          gameState.scrollOffset.y = Math.max(0, Math.min(maxScrollY, gameState.scrollOffset.y))
          window.gameInstance?.gameLoop?.requestRender?.()
        }

        if (timestamp - lastDrawSampleTime >= 1000) {
          drawImageSamples.push(drawImageCount)
          drawImageCount = 0
          lastDrawSampleTime = timestamp
        }

        if (timestamp - startTime >= durationMs) {
          resolve()
        } else {
          requestAnimationFrame(step)
        }
      }
      requestAnimationFrame(step)
    })

    if (fpsDisplay && originalBreakdown) {
      fpsDisplay.reportFrameBreakdown = originalBreakdown
    }
    window.CanvasRenderingContext2D.prototype.drawImage = originalDrawImage

    const totalTime = performance.now() - startTime
    const effectiveFps = frameIntervals.length > 0 ? (frameIntervals.length * 1000) / totalTime : 0
    const reportedFps = Number.isFinite(gameState?.fpsCounter?.fps) ? gameState.fpsCounter.fps : 0
    const updateSamples = breakdowns.map(sample => sample.updateMs)
    const renderSamples = breakdowns.map(sample => sample.renderMs)
    const idleSamples = breakdowns.map(sample => sample.idleMs)
    const heap = performance.memory?.usedJSHeapSize || null
    const renderingModule = await import('/src/rendering.js').catch(() => null)
    const mapRenderer = renderingModule?.getMapRenderer?.()
    const textureManager = renderingModule?.getTextureManager?.()

    return {
      durationMs: totalTime,
      frameCount: frameIntervals.length,
      effectiveFps,
      reportedFps,
      avgFrameMs: averageInPage(frameIntervals),
      p95FrameMs: percentileInPage(frameIntervals, 95),
      maxFrameMs: Math.max(0, ...frameIntervals),
      avgUpdateMs: averageInPage(updateSamples),
      avgRenderMs: averageInPage(renderSamples),
      avgIdleMs: averageInPage(idleSamples),
      avgDrawImagesPerSecond: averageInPage(drawImageSamples),
      maxDrawImagesPerSecond: Math.max(0, ...drawImageSamples),
      heapMb: Number.isFinite(heap) ? heap / (1024 * 1024) : null,
      rendererDiagnostics: {
        canUseOffscreen: Boolean(mapRenderer?.canUseOffscreen),
        chunkCacheSize: mapRenderer?.chunkCache?.size || 0,
        integratedMode: Boolean(textureManager?.integratedSpriteSheetMode),
        defaultStreetTiles: textureManager?.defaultStreetTagBuckets?.street?.length || 0,
        canvasWidth: canvas?.width || 0,
        canvasHeight: canvas?.height || 0,
        canvasClientWidth: canvas?.clientWidth || 0,
        canvasClientHeight: canvas?.clientHeight || 0,
        devicePixelRatio: window.devicePixelRatio || 1
      },
      overlayText: document.getElementById('fpsDisplay')?.innerText || ''
    }
  }, durationMs)
}

test.describe('Mobile FPS regression benchmark', () => {
  test.skip(!RUN_BENCHMARK, 'Set PERF_BENCHMARK=1 to run this opt-in performance benchmark.')

  test('compares desktop throughput with throttled mobile rendering', async({ browser, baseURL }, testInfo) => {
    testInfo.setTimeout(Math.max(300000, BENCHMARK_DURATION_MS * 12))

    const profiles = [
      {
        name: 'desktop',
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        userAgent: undefined,
        cpuThrottle: 1
      },
      {
        name: 'mobile',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        cpuThrottle: MOBILE_CPU_THROTTLE
      }
    ]

    const results = []
    for (const rawUrl of getBenchmarkUrls(baseURL)) {
      for (const profile of profiles) {
        const context = await createProfileContext(browser, profile)
        const page = await context.newPage()
        let cdpSession = null
        try {
          await page.goto(buildBenchmarkUrl(rawUrl), { waitUntil: 'domcontentloaded', timeout: 60000 })
          await waitForReadyGame(page)
          await prepareStressScene(page, profile.name)
          await page.waitForTimeout(750)
          cdpSession = await applyCpuThrottle(context, page, profile.cpuThrottle)
          const stats = await collectBenchmarkStats(page, BENCHMARK_DURATION_MS)
          results.push({
            url: rawUrl,
            profile: profile.name,
            cpuThrottle: profile.cpuThrottle,
            deviceScaleFactor: profile.deviceScaleFactor,
            viewport: profile.viewport,
            ...stats
          })
        } finally {
          if (cdpSession) {
            await cdpSession.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {})
          }
          await context.close()
        }
      }
    }

    console.log(`PERF_BENCHMARK_RESULTS ${JSON.stringify(results, null, 2)}`)
    await testInfo.attach('mobile-fps-regression-benchmark.json', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json'
    })

    const desktopResults = results.filter(result => result.profile === 'desktop')
    const mobileResults = results.filter(result => result.profile === 'mobile')

    for (const result of desktopResults) {
      const desktopFps = Math.max(result.effectiveFps, result.reportedFps)
      expect(desktopFps, `${result.url} desktop uncapped/game-loop FPS`).toBeGreaterThan(DESKTOP_MIN_FPS)
    }

    if (EXPECT_MOBILE_REGRESSION) {
      for (const result of mobileResults) {
        expect(result.effectiveFps, `${result.url} throttled mobile should replicate the regression`).toBeLessThan(MOBILE_REGRESSION_MAX_FPS)
      }
    }

    if (ENFORCE_FIXED_BUDGET) {
      for (const result of mobileResults) {
        const mobileFps = Math.max(result.effectiveFps, result.reportedFps)
        expect(mobileFps, `${result.url} throttled mobile fixed-performance floor`).toBeGreaterThan(MOBILE_FIXED_MIN_FPS)
      }
    }
  })
})
