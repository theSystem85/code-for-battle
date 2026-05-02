import { test, expect } from '@playwright/test'

const RUN_BENCHMARK = process.env.PERF_BENCHMARK === '1'
const BENCHMARK_DURATION_MS = Number.parseInt(process.env.PERF_BENCHMARK_DURATION_MS || '8000', 10)
const MOBILE_CPU_THROTTLE = Number.parseFloat(process.env.PERF_MOBILE_CPU_THROTTLE || '8')
const DESKTOP_MIN_FPS = Number.parseFloat(process.env.PERF_DESKTOP_MIN_FPS || '60')
const MOBILE_REGRESSION_MAX_FPS = Number.parseFloat(process.env.PERF_MOBILE_REGRESSION_MAX_FPS || '10')
const MOBILE_FIXED_MIN_FPS = Number.parseFloat(process.env.PERF_MOBILE_FIXED_MIN_FPS || '20')
const EXPECT_MOBILE_REGRESSION = process.env.PERF_EXPECT_MOBILE_REGRESSION === '1'
const ENFORCE_FIXED_BUDGET = process.env.PERF_ENFORCE_FIXED_BUDGET === '1'
const FULL_MAP_SCROLL = process.env.PERF_FULL_MAP_SCROLL !== '0'
const SCROLL_MIN_FPS = Number.parseFloat(process.env.PERF_SCROLL_MIN_FPS || '60')
const SCROLL_WINDOW_MS = Number.parseInt(process.env.PERF_SCROLL_WINDOW_MS || '1000', 10)
const SCROLL_PIXELS_PER_FRAME = Number.parseFloat(process.env.PERF_SCROLL_PIXELS_PER_FRAME || '96')

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
    localStorage.setItem('rts_graphics_settings', JSON.stringify({
      useProceduralWaterRendering: true,
      waterEffectTone: 0.35,
      waterEffectSaturation: 0.4,
      mobileCanvasPixelRatioCap: 1
    }))
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
    const tileSize = 32
    const maxScrollX = Math.max(0, mapWidth * tileSize - viewportWidth)
    const maxScrollY = Math.max(0, mapHeight * tileSize - viewportHeight)
    gameState.scrollOffset.x = Math.min(maxScrollX, Math.max(0, stressMinX * tileSize))
    gameState.scrollOffset.y = Math.min(maxScrollY, Math.max(0, stressMinY * tileSize))
    game.gameLoop?.requestRender?.()
    return { ok: true, mapWidth, mapHeight, maxScrollX, maxScrollY }
  }, { profileName })
}

async function collectBenchmarkStats(page, durationMs) {
  return page.evaluate(async({ durationMs, fullMapScroll, scrollWindowMs, scrollPixelsPerFrame }) => {
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
    const sampleVisibleWater = () => {
      const gameState = window.gameState
      const canvas = document.getElementById('gameCanvas')
      const ctx = canvas?.getContext?.('2d')
      const glCanvas = document.getElementById('gameCanvasGL')
      const map = window.gameInstance?.mapGrid || gameState?.mapGrid
      if (!canvas || !ctx || !Array.isArray(map) || !map.length) {
        return { sampled: false, reason: 'missing-runtime' }
      }

      const tileSize = 32
      const ratio = canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : (window.devicePixelRatio || 1)
      const startX = Math.max(0, Math.floor((gameState.scrollOffset?.x || 0) / tileSize))
      const startY = Math.max(0, Math.floor((gameState.scrollOffset?.y || 0) / tileSize))
      const endX = Math.min(map[0]?.length || 0, startX + Math.ceil((canvas.clientWidth || 800) / tileSize))
      const endY = Math.min(map.length, startY + Math.ceil((canvas.clientHeight || 600) / tileSize))

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          if (map[y]?.[x]?.type !== 'water') continue
          const screenX = Math.round((x * tileSize - (gameState.scrollOffset?.x || 0) + tileSize / 2) * ratio)
          const screenY = Math.round((y * tileSize - (gameState.scrollOffset?.y || 0) + tileSize / 2) * ratio)
          if (screenX < 0 || screenY < 0 || screenX >= canvas.width || screenY >= canvas.height) continue
          const [r, g, b, a] = ctx.getImageData(screenX, screenY, 1, 1).data
          if (a > 16 && (r + g + b) > 20) {
            return {
              sampled: true,
              source: '2d',
              tileX: x,
              tileY: y,
              rgba: [r, g, b, a],
              visible: true
            }
          }

          const gl = glCanvas?.getContext?.('webgl2') || glCanvas?.getContext?.('webgl')
          if (gl) {
            const glRatio = glCanvas.clientWidth > 0 ? glCanvas.width / glCanvas.clientWidth : ratio
            const glX = Math.round((x * tileSize - (gameState.scrollOffset?.x || 0) + tileSize / 2) * glRatio)
            const glY = Math.round(glCanvas.height - ((y * tileSize - (gameState.scrollOffset?.y || 0) + tileSize / 2) * glRatio) - 1)
            const pixel = new Uint8Array(4)
            if (glX >= 0 && glY >= 0 && glX < glCanvas.width && glY < glCanvas.height) {
              gl.readPixels(glX, glY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
              return {
                sampled: true,
                source: 'webgl',
                tileX: x,
                tileY: y,
                rgba: Array.from(pixel),
                visible: pixel[3] > 16 && (pixel[0] + pixel[1] + pixel[2]) > 20
              }
            }
          }

          return {
            sampled: true,
            source: '2d',
            tileX: x,
            tileY: y,
            rgba: [r, g, b, a],
            visible: false
          }
        }
      }

      return { sampled: false, reason: 'no-visible-water' }
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
    const scrollWindowSamples = []
    let drawImageCount = 0
    let lastFrameTime = null
    let sweepDirection = 1
    let scrollRoute = []
    let scrollRouteIndex = 1
    let scrollCompleted = false
    let scrollDistancePx = 0
    let scrollWindowStartTime = null
    let scrollWindowFrameCount = 0
    let scrollWindowMaxFrameMs = 0

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
    let maxRunTimeMs = durationMs

    if (gameState && canvas && fullMapScroll) {
      const tileSize = 32
      const mapWidthPx = (gameState.mapTilesX || 128) * tileSize
      const mapHeightPx = (gameState.mapTilesY || 128) * tileSize
      const viewportWidth = canvas.clientWidth || 800
      const viewportHeight = canvas.clientHeight || 600
      const maxScrollX = Math.max(0, mapWidthPx - viewportWidth)
      const maxScrollY = Math.max(0, mapHeightPx - viewportHeight)
      const bandStep = Math.max(1, Math.floor(viewportHeight * 0.72))
      let y = 0
      let rightward = true
      scrollRoute = [{ x: 0, y: 0 }]

      while (y < maxScrollY) {
        scrollRoute.push({ x: rightward ? maxScrollX : 0, y })
        y = Math.min(maxScrollY, y + bandStep)
        scrollRoute.push({ x: rightward ? maxScrollX : 0, y })
        rightward = !rightward
      }
      scrollRoute.push({ x: rightward ? maxScrollX : 0, y: maxScrollY })

      for (let index = 1; index < scrollRoute.length; index++) {
        scrollDistancePx += Math.hypot(
          scrollRoute[index].x - scrollRoute[index - 1].x,
          scrollRoute[index].y - scrollRoute[index - 1].y
        )
      }

      gameState.scrollOffset.x = scrollRoute[0].x
      gameState.scrollOffset.y = scrollRoute[0].y
      maxRunTimeMs = Math.max(
        durationMs,
        Math.ceil((scrollDistancePx / Math.max(1, scrollPixelsPerFrame)) * 1000) + 5000
      )
    }

    await new Promise(resolve => {
      const recordScrollWindow = (timestamp, interval) => {
        if (!fullMapScroll || interval <= 0) return
        if (scrollWindowStartTime === null) {
          scrollWindowStartTime = timestamp - interval
        }
        scrollWindowFrameCount += 1
        scrollWindowMaxFrameMs = Math.max(scrollWindowMaxFrameMs, interval)
        const elapsed = timestamp - scrollWindowStartTime
        if (elapsed >= scrollWindowMs) {
          const fps = (scrollWindowFrameCount * 1000) / elapsed
          scrollWindowSamples.push({
            startMs: scrollWindowStartTime - startTime,
            durationMs: elapsed,
            fps,
            roundedFps: Math.round(fps),
            frameCount: scrollWindowFrameCount,
            maxFrameMs: scrollWindowMaxFrameMs,
            scrollX: gameState?.scrollOffset?.x || 0,
            scrollY: gameState?.scrollOffset?.y || 0,
            routeIndex: scrollRouteIndex
          })
          scrollWindowStartTime = timestamp
          scrollWindowFrameCount = 0
          scrollWindowMaxFrameMs = 0
        }
      }

      const moveAlongRoute = () => {
        if (!gameState || !canvas) return
        if (!fullMapScroll) {
          const tileSize = 32
          const mapWidthPx = (gameState.mapTilesX || 128) * tileSize
          const mapHeightPx = (gameState.mapTilesY || 128) * tileSize
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
          return
        }

        if (scrollCompleted || !scrollRoute.length) return
        const target = scrollRoute[scrollRouteIndex]
        if (!target) {
          scrollCompleted = true
          return
        }
        const dx = target.x - gameState.scrollOffset.x
        const dy = target.y - gameState.scrollOffset.y
        const distance = Math.hypot(dx, dy)
        if (distance <= scrollPixelsPerFrame) {
          gameState.scrollOffset.x = target.x
          gameState.scrollOffset.y = target.y
          scrollRouteIndex += 1
          if (scrollRouteIndex >= scrollRoute.length) {
            scrollCompleted = true
          }
          return
        }
        const ratio = scrollPixelsPerFrame / distance
        gameState.scrollOffset.x += dx * ratio
        gameState.scrollOffset.y += dy * ratio
      }

      function step(timestamp) {
        if (lastFrameTime !== null) {
          const interval = timestamp - lastFrameTime
          frameIntervals.push(interval)
          recordScrollWindow(timestamp, interval)
        }
        lastFrameTime = timestamp

        moveAlongRoute()
        window.gameInstance?.gameLoop?.requestRender?.()

        if (timestamp - lastDrawSampleTime >= 1000) {
          drawImageSamples.push(drawImageCount)
          drawImageCount = 0
          lastDrawSampleTime = timestamp
        }

        if (
          (fullMapScroll && scrollCompleted && timestamp - startTime >= Math.min(durationMs, 1000)) ||
          (!fullMapScroll && timestamp - startTime >= durationMs) ||
          timestamp - startTime >= maxRunTimeMs
        ) {
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
      scrollCompleted,
      scrollRoutePoints: scrollRoute.length,
      scrollRouteIndex,
      scrollDistancePx,
      minScrollWindowFps: scrollWindowSamples.length
        ? Math.min(...scrollWindowSamples.map(sample => sample.fps))
        : null,
      minRoundedScrollWindowFps: scrollWindowSamples.length
        ? Math.min(...scrollWindowSamples.map(sample => sample.roundedFps))
        : null,
      scrollWindowSamples,
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
        devicePixelRatio: window.devicePixelRatio || 1,
        canvasPixelRatio: window.gameState?.canvasPixelRatio || null,
        rawCanvasPixelRatio: window.gameState?.rawCanvasPixelRatio || null,
        chunkStats: mapRenderer?.getLastFrameChunkStats?.() || null,
        gpuTerrain: window.gameState?.renderStats?.gpuTerrain || null
      },
      waterSample: sampleVisibleWater(),
      overlayText: document.getElementById('fpsDisplay')?.innerText || ''
    }
  }, { durationMs, fullMapScroll: FULL_MAP_SCROLL, scrollWindowMs: SCROLL_WINDOW_MS, scrollPixelsPerFrame: SCROLL_PIXELS_PER_FRAME })
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
        const pageErrors = []
        page.on('pageerror', error => pageErrors.push(error.message))
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
            pageErrors,
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
        if (FULL_MAP_SCROLL) {
          expect(result.scrollCompleted, `${result.url} throttled mobile full-map scroll route completed`).toBe(true)
          expect(
            result.minRoundedScrollWindowFps,
            `${result.url} throttled mobile lowest full-map scrolling FPS window`
          ).toBeGreaterThanOrEqual(SCROLL_MIN_FPS)
        }
        expect(result.pageErrors, `${result.url} throttled mobile page errors while scrolling`).toHaveLength(0)
        expect(result.waterSample?.visible, `${result.url} throttled mobile visible water sample`).toBe(true)
      }
    }
  })
})
