// Run against a local Vite server in foreground Chrome on a hardware GPU.
import { chromium } from 'playwright'
import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const output = process.env.BENCHMARK_OUTPUT || 'tmp/unit-heavy'
const url = process.env.BENCHMARK_URL || 'http://127.0.0.1:4176'
const label = 'CPU benchmark'
const fixture = process.env.BENCHMARK_FIXTURE || join(output, 'fixture.cfb')
const profileEnabled = process.env.BENCHMARK_PROFILE === '1'
const battleOnly = process.env.BENCHMARK_BATTLE_ONLY === '1'
const importThroughUi = process.env.BENCHMARK_IMPORT_SAVE === '1'
const traceEnabled = process.env.BENCHMARK_COMPOSITOR_TRACE === '1'
const countStandbyClears = process.env.BENCHMARK_COUNT_STANDBY_CLEARS === '1'
const impactDraw = process.env.BENCHMARK_IMPACT_DRAW ?? null
const holdMinimap = process.env.BENCHMARK_HOLD_MINIMAP === '1'
const holdForeground = process.env.BENCHMARK_HOLD_FOREGROUND || '0'
const backendChoice = process.env.BENCHMARK_BACKEND || 'auto'
const staticGroundTiming = process.env.BENCHMARK_STATIC_GROUND_TIMING !== '0'
const omitWebGpuTerrainTiming = process.env.BENCHMARK_WEBGPU_TERRAIN_TIMING === '0'
const battleDuration = Number(process.env.BENCHMARK_BATTLE_DURATION_MS || 60000)
const unitsPerParty = Number(process.env.BENCHMARK_UNITS_PER_PARTY || 100)
if (!['auto', 'webgpu', 'webgl'].includes(backendChoice)) {
  throw new Error('BENCHMARK_BACKEND must be auto, webgpu or webgl')
}
if (impactDraw !== null && (!battleOnly || !['0', '1'].includes(impactDraw))) {
  throw new Error('BENCHMARK_IMPACT_DRAW requires a stationary battle and must be 0 or 1')
}
if (!['0', '1', 'images', 'inventory', 'canvas', 'html-canvas', 'offscreen', 'shadow-size', 'stacks', 'unit-images', 'bitmap-shadows', 'html-shadows', 'transparent-shadows', 'tiny-shadows', 'crop-shadows'].includes(holdForeground)) {
  throw new Error('Invalid BENCHMARK_HOLD_FOREGROUND mode')
}
if (!Number.isSafeInteger(battleDuration) || battleDuration < 10000) {
  throw new Error('BENCHMARK_BATTLE_DURATION_MS must be an integer of at least 10000')
}
if (!Number.isSafeInteger(unitsPerParty) || unitsPerParty < 100 || unitsPerParty > 500) {
  throw new Error('BENCHMARK_UNITS_PER_PARTY must be an integer from 100 to 500')
}
await mkdir(output, { recursive: true })

async function saveCompositorTrace(session, traceComplete) {
  await session.send('Tracing.end')
  const { stream } = await traceComplete
  const file = await open(join(output, 'compositor.json'), 'w')
  try {
    let eof = false
    while (!eof) {
      const part = await session.send('IO.read', { handle: stream, size: 1024 * 1024 })
      await file.writeFile(part.base64Encoded ? Buffer.from(part.data, 'base64') : part.data)
      eof = part.eof
    }
  } finally {
    await file.close()
    await session.send('IO.close', { handle: stream })
  }
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  ignoreDefaultArgs: ['--enable-unsafe-swiftshader']
})

try {
  const browserSession = await browser.newBrowserCDPSession()
  const { gpu } = await browserSession.send('SystemInfo.getInfo')
  const adapter = gpu.devices[0]
  if (!/Apple|NVIDIA|AMD|Intel|Adreno|Mali/i.test(JSON.stringify(adapter)) ||
      /swiftshader|llvmpipe|software|basic render|lavapipe/i.test(JSON.stringify(adapter)) ||
      gpu.featureStatus.rasterization !== 'enabled') {
    throw new Error('Headed Chrome hardware rasterization was not verified')
  }

  const context = await browser.newContext({ viewport: null })
  await context.addInitScript(({ backendChoice, staticGroundTiming, countStandbyClears }) => {
    window.__CFB_TERRAIN_GPU_TIMING__ = staticGroundTiming
    if (countStandbyClears && window.WebGL2RenderingContext) {
      window.benchmarkStandbyClears = 0
      const prototype = window.WebGL2RenderingContext.prototype
      const clear = prototype.clear
      prototype.clear = function(mask) {
        if (this.canvas.id === 'gameCanvasGL') window.benchmarkStandbyClears++
        return clear.call(this, mask)
      }
    }
    if (backendChoice !== 'auto') {
      localStorage.setItem('rts_graphics_settings', JSON.stringify({ rendererBackendChoice: backendChoice }))
    }
  }, { backendChoice, staticGroundTiming, countStandbyClears })
  const page = await context.newPage()
  await page.bringToFront()
  const errors = []
  const workers = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('worker', worker => {
    const url = new URL(worker.url())
    workers.push(url.protocol === 'data:' ? 'data:' : url.pathname)
  })
  const cadence = await page.evaluate(async() => {
    return new Promise(resolve => {
      let first
      let count = 0
      function sample(now) {
        first ??= now
        if (now - first >= 3000) resolve(1000 * count / (now - first))
        else {
          count++
          requestAnimationFrame(sample)
        }
      }
      requestAnimationFrame(sample)
    })
  })

  console.log(JSON.stringify({ adapter, cadence, browser: await browser.version() }))
  await page.goto(`${url}/?seed=11&size=200&players=4&oreFields=24&tutorial=0`)
  const waitReady = () => page.waitForFunction(() =>
    window.gameState?.gameStarted && window.gameInstance?.gameLoop?.allAssetsLoaded &&
    window.gameInstance.renderer.textureManager.allTexturesLoaded &&
    document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'),
  null, { timeout: 120000 })
  await waitReady()

  if (process.env.BENCHMARK_CREATE_FIXTURE === '1') {
    const save = await page.evaluate(async({ label, unitsPerParty }) => {
      const { factories, mapGrid, units } = await import('/src/main.js')
      const { createUnit, initializeOccupancyMap } = await import('/src/units.js')
      const { saveGame } = await import('/src/saveGame.js')
      const { getStoredItem } = await import('/src/storage/indexedDbStorage.js')
      const state = window.gameState
      state.gamePaused = true
      const types = ['tank-v2', 'tank-v3', 'howitzer', 'rocketTank', 'apache', 'ambulance', 'tankerTruck', 'recoveryTank']
      const occupied = new Set(units.map(unit => unit.tileY * 200 + unit.tileX))
      const centers = [[90, 90], [110, 90], [90, 110], [110, 110]]
      factories.forEach((factory, index) => {
        const [centerX, centerY] = centers[index]
        const candidates = []
        for (let y = 1; y < 199; y++) {
          for (let x = 1; x < 199; x++) {
            const tile = mapGrid[y][x]
            if (tile.type !== 'rock' && tile.type !== 'water' && !tile.building && !tile.seedCrystal) {
              candidates.push({ x, y, distance: (x - centerX) ** 2 + (y - centerY) ** 2 })
            }
          }
        }
        candidates.sort((a, b) => a.distance - b.distance)
        let count = 0
        for (const { x, y } of candidates) {
          const key = y * 200 + x
          if (occupied.has(key)) continue
          occupied.add(key)
          const unit = createUnit(factory, types[count % types.length], x, y)
          units.push(unit)
          if (++count === unitsPerParty) break
        }
      })
      state.occupancyMap = initializeOccupancyMap(units, mapGrid)
      saveGame(label)
      return getStoredItem(`rts_save_${label}`)
    }, { label, unitsPerParty })
    await writeFile(fixture, save)
  }

  if (importThroughUi) {
    await page.waitForFunction(() =>
      performance.getEntriesByName('startup:idle-settings-and-save:duration').length > 0,
    null, { timeout: 120000, polling: 100 })
  }
  const loadStart = Date.now()
  if (importThroughUi) {
    await page.locator('#importSaveInput').setInputFiles(fixture)
    await page.waitForFunction(() => window.gameInstance?.units?.length >= 400, null, { timeout: 120000 })
  } else {
    const save = await readFile(fixture, 'utf8')
    await page.evaluate(async({ save, label }) => {
      const { setStoredItem } = await import('/src/storage/indexedDbStorage.js')
      const { loadGame } = await import('/src/saveGame.js')
      const key = `rts_save_${label}`
      window.gameState.gamePaused = true
      setStoredItem(key, save)
      await loadGame(key)
    }, { save, label })
  }
  await waitReady()
  const preparationMs = Date.now() - loadStart

  const pageSession = await context.newCDPSession(page)
  await pageSession.send('Performance.enable')
  const before = (await pageSession.send('Performance.getMetrics')).metrics
  if (profileEnabled) {
    await pageSession.send('Profiler.enable')
    await pageSession.send('Profiler.setSamplingInterval', { interval: 1000 })
    await pageSession.send('Profiler.start')
  }

  let traceComplete
  if (traceEnabled) {
    traceComplete = new Promise(resolve => browserSession.once('Tracing.tracingComplete', resolve))
    await browserSession.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      traceConfig: { includedCategories: ['benchmark', 'blink.user_timing', 'cc', 'viz', 'gpu', 'renderer.scheduler'] }
    })
  }
  const result = await page.evaluate(async({ battleOnly, battleDuration, omitWebGpuTerrainTiming, traceEnabled, countStandbyClears, impactDraw, holdMinimap, holdForeground }) => {
    const state = window.gameState
    const { gameLoop, renderer, units } = window.gameInstance
    const foreground = gameLoop.canvasManager.getGameContext()
    const drawMethods = holdForeground !== '1' ? ['drawImage'] : ['clearRect', 'fillRect', 'strokeRect', 'fill', 'stroke', 'drawImage', 'fillText', 'strokeText', 'putImageData']
    let foregroundDraws = 0
    const imageSources = {}
    const sourceStacks = []
    const seenSources = new WeakSet()
    const shadowBitmaps = new Map()
    let suppressedDraws = 0
    let substitutedDraws = 0
    if (holdForeground !== '0') {
      for (const method of drawMethods) {
        const original = foreground[method]
        foreground[method] = function(...args) {
          foregroundDraws++
          if (holdForeground === 'inventory') {
            const source = args[0]
            const key = source?.currentSrc || source?.src || source?.constructor?.name || 'unknown'
            imageSources[key] = (imageSources[key] || 0) + 1
            return original.apply(this, args)
          }
          if (holdForeground === 'stacks') {
            const source = args[0]
            if (source instanceof OffscreenCanvas && !seenSources.has(source) && sourceStacks.length < 30) {
              seenSources.add(source)
              const pixels = source.getContext('2d').getImageData(0, 0, source.width, source.height).data
              let minX = source.width, minY = source.height, maxX = -1, maxY = -1
              for (let y = 0; y < source.height; y++) {
                for (let x = 0; x < source.width; x++) {
                  if (pixels[(y * source.width + x) * 4 + 3] === 0) continue
                  minX = Math.min(minX, x)
                  minY = Math.min(minY, y)
                  maxX = Math.max(maxX, x)
                  maxY = Math.max(maxY, y)
                }
              }
              sourceStacks.push({ width: source.width, height: source.height, alphaBounds: { minX, minY, maxX, maxY }, stack: new Error().stack })
            }
            return original.apply(this, args)
          }
          if (holdForeground === 'bitmap-shadows') {
            const source = args[0]
            if (source instanceof OffscreenCanvas && source.width === 276 && source.height === 276) {
              if (!shadowBitmaps.has(source)) {
                const pending = createImageBitmap(source).then(bitmap => {
                  shadowBitmaps.set(source, bitmap)
                  return bitmap
                })
                shadowBitmaps.set(source, pending)
              }
              const bitmap = shadowBitmaps.get(source)
              if (!(bitmap instanceof Promise)) {
                args[0] = bitmap
                substitutedDraws++
              }
            }
            return original.apply(this, args)
          }
          if (holdForeground === 'crop-shadows') {
            const source = args[0]
            if (source instanceof OffscreenCanvas && source.width === 276 && source.height === 276 && args.length === 3) {
              substitutedDraws++
              return original.call(this, source, 108, 98, 70, 62, args[1] + 108, args[2] + 98, 70, 62)
            }
            return original.apply(this, args)
          }
          if (holdForeground === 'html-shadows' || holdForeground === 'transparent-shadows' || holdForeground === 'tiny-shadows') {
            const source = args[0]
            if (source instanceof OffscreenCanvas && source.width === 276 && source.height === 276) {
              if (!shadowBitmaps.has(source)) {
                const copy = document.createElement('canvas')
                copy.width = holdForeground === 'tiny-shadows' ? 1 : source.width
                copy.height = holdForeground === 'tiny-shadows' ? 1 : source.height
                if (holdForeground === 'html-shadows') copy.getContext('2d').drawImage(source, 0, 0)
                shadowBitmaps.set(source, copy)
              }
              args[0] = shadowBitmaps.get(source)
              substitutedDraws++
            }
            return original.apply(this, args)
          }
          if (holdForeground === 'unit-images') {
            const url = args[0]?.currentSrc || args[0]?.src || ''
            if (!url.includes('/prepared/unit/') && !url.includes('/prepared/aircraft/') && !(args[0] instanceof ImageBitmap)) return original.apply(this, args)
          }
          if (holdForeground === 'canvas' && !(args[0] instanceof HTMLCanvasElement) && !(args[0] instanceof OffscreenCanvas)) {
            return original.apply(this, args)
          }
          if (holdForeground === 'html-canvas' && !(args[0] instanceof HTMLCanvasElement)) return original.apply(this, args)
          if (holdForeground === 'offscreen' && !(args[0] instanceof OffscreenCanvas)) return original.apply(this, args)
          if (holdForeground === 'shadow-size' && (!(args[0] instanceof OffscreenCanvas) || args[0].width !== 276 || args[0].height !== 276)) return original.apply(this, args)
          suppressedDraws++
        }
      }
    }
    const renderMinimap = gameLoop.renderMinimapIfDue
    let minimapCalls = 0
    gameLoop.renderMinimapIfDue = function(...args) {
      minimapCalls++
      if (!holdMinimap) return renderMinimap.apply(this, args)
      return 0
    }
    if (countStandbyClears && !(window.WebGL2RenderingContext &&
      window.gameInstance.canvasManager.getGameGlContext() instanceof window.WebGL2RenderingContext)) {
      throw new Error('The standby clear probe requires a WebGL 2 terrain canvas')
    }
    if (omitWebGpuTerrainTiming) renderer.webgpuRenderer.getTimestampWrites = () => undefined
    const canvas = document.getElementById('gameCanvas')
    const selected = units.filter(unit => unit.owner === state.humanPlayer && unit.type.startsWith('tank'))
    selected.forEach(unit => { unit.selected = true })
    if (battleOnly) {
      window.selectedUnitsRef?.splice(0, window.selectedUnitsRef.length, ...selected)
      // Keep the match running without shielding combat units or suppressing hits.
      for (const base of new Set([...gameLoop.factories, ...state.buildings])) {
        if (base.type !== 'constructionYard') continue
        let health = base.health
        Object.defineProperty(base, 'health', {
          configurable: true,
          enumerable: true,
          get: () => health,
          set: value => { health = Math.max(1, value) }
        })
        Object.defineProperty(base, 'isBeingSold', { configurable: true, get: () => false, set() {} })
      }
    }
    const startUnits = units.length
    if (startUnits < 400 || !selected.length || !state.frameLimiterEnabled) {
      throw new Error(`Unexpected fixture or frame limiter: ${startUnits} units, ${selected.length} selected`)
    }

    const width = gameLoop.mapGrid[0].length * 32 - canvas.clientWidth
    const height = gameLoop.mapGrid.length * 32 - canvas.clientHeight
    const rows = Math.ceil(height / (canvas.clientHeight * 0.8))
    const route = []
    // Start on the loaded battle, then traverse the full map in alternating rows.
    route.push([width / 2, height / 2])
    for (let row = 0; row <= rows; row++) {
      route.push([row % 2 ? width : 0, height * row / rows])
      route.push([row % 2 ? 0 : width, height * row / rows])
    }
    route.push(route[0])
    const lengths = route.slice(1).map(([x, y], index) => Math.hypot(x - route[index][0], y - route[index][1]))
    const distance = lengths.reduce((sum, value) => sum + value, 0)
    const speed = battleOnly ? 0 : 3600
    const duration = battleOnly ? battleDuration : Math.max(60000, 2 * distance / speed * 1000)
    const intervals = []
    const cpuFrames = []
    const samples = []
    const longTasks = []
    const observer = new PerformanceObserver(list => {
      for (const { startTime, duration } of list.getEntries()) longTasks.push({ startTime, duration })
    })
    observer.observe({ type: 'longtask' })
    let desiredX = route[0][0]
    let desiredY = route[0][1]
    const render = renderer.renderGame
    renderer.renderGame = function(...args) {
      state.scrollOffset.x = desiredX
      state.scrollOffset.y = desiredY
      return render.apply(this, args)
    }
    const display = gameLoop.fpsDisplay
    const report = display.reportFrameBreakdown
    let lastSample = -Infinity
    let maxBullets = 0
    let maxVisibleApacheRockets = 0
    let maxVisibleImpacts = 0
    const isOnScreen = entity => entity.x >= desiredX && entity.x < desiredX + canvas.clientWidth &&
      entity.y >= desiredY && entity.y < desiredY + canvas.clientHeight
    display.reportFrameBreakdown = function(frame) {
      const now = performance.now()
      cpuFrames.push({ t: now, ...frame })
      maxBullets = Math.max(maxBullets, gameLoop.bullets.length)
      if (battleOnly) {
        let rockets = 0
        let impacts = 0
        for (const bullet of gameLoop.bullets) {
          if (bullet.originType === 'apacheRocket' && isOnScreen(bullet)) rockets++
        }
        for (const explosion of state.explosions) {
          if (explosion.type !== 'spriteSheet' && isOnScreen(explosion)) impacts++
        }
        maxVisibleApacheRockets = Math.max(maxVisibleApacheRockets, rockets)
        maxVisibleImpacts = Math.max(maxVisibleImpacts, impacts)
      }
      if (now - lastSample >= 1000) {
        lastSample = now
        samples.push({
          t: now,
          units: units.length,
          buildings: state.buildings.length,
          bullets: gameLoop.bullets.length,
          gpu: state.renderStats?.gpuTiming?.milliseconds,
          staticGroundDraws: state.renderStats?.gpuStaticGround?.drawCalls,
          staticGroundGpu: state.renderStats?.gpuStaticGround?.gpuMilliseconds,
          backend: state.renderStats?.gpuTerrain?.backend,
          heap: performance.memory?.usedJSHeapSize,
          visible: document.visibilityState,
          focused: document.hasFocus()
        })
      }
      return report.call(this, frame)
    }

    const impact = renderer.effectsRenderer.impactVfx
    const renderImpact = impact.render
    let activeImpactFrames = 0
    if (impactDraw !== null) {
      impact.render = function(ctx, gameState, scroll, now, width, height) {
        if (now < this.activeUntil) activeImpactFrames++
        if (impactDraw === '1') return renderImpact.call(this, ctx, gameState, scroll, now, width, height)
      }
    }

    let start
    let previous
    if (countStandbyClears) window.benchmarkStandbyClears = 0
    window.__framePhases?.reset()
    state.gamePaused = false
    gameLoop.resumeFromPause()
    try {
      if (holdForeground === 'bitmap-shadows') {
        await new Promise(resolve => setTimeout(resolve, 4000))
        for (const [source, pending] of shadowBitmaps) shadowBitmaps.set(source, await pending)
        if (!shadowBitmaps.size) throw new Error('No matching shadow canvases were prepared')
      }
      await new Promise(resolve => {
        function frame(now) {
          if (start === undefined && traceEnabled) performance.mark('cfb-benchmark-start')
          start ??= now
          if (previous !== undefined) intervals.push(now - previous)
          previous = now
          const elapsed = now - start
          if (!battleOnly) {
            let remaining = (elapsed * speed / 1000) % distance
            let segment = 0
            while (remaining > lengths[segment]) remaining -= lengths[segment++]
            const [x, y] = route[segment]
            const [nextX, nextY] = route[segment + 1]
            const fraction = remaining / lengths[segment]
            desiredX = x + (nextX - x) * fraction
            desiredY = y + (nextY - y) * fraction
          }
          if (elapsed < duration) requestAnimationFrame(frame)
          else {
            if (traceEnabled) performance.mark('cfb-benchmark-end')
            resolve()
          }
        }
        requestAnimationFrame(frame)
      })
    } finally {
      observer.disconnect()
      renderer.renderGame = render
      display.reportFrameBreakdown = report
      gameLoop.renderMinimapIfDue = renderMinimap
      if (holdForeground !== '0') {
        for (const method of drawMethods) delete foreground[method]
      }
      if (impactDraw !== null) delete impact.render
    }
    if (document.querySelector('.tutorial-overlay') || window.tutorialSystem) {
      throw new Error('The tutorial=0 startup flag did not suppress tutorial initialization')
    }
    if (battleOnly && (state.gameOver || state.localPlayerDefeated || maxBullets === 0 || state.gamePaused)) {
      throw new Error('Stationary benchmark did not sustain active combat')
    }
    if (impactDraw !== null && (activeImpactFrames === 0 || maxVisibleApacheRockets === 0 || maxVisibleImpacts === 0)) {
      throw new Error('The impact probe did not observe Apache volleys and active impacts')
    }
    return {
      startUnits, endUnits: units.length, maxBullets, maxVisibleApacheRockets, maxVisibleImpacts, minimapCalls, foregroundDraws, suppressedDraws, substitutedDraws, shadowBitmapCount: shadowBitmaps.size, imageSources, sourceStacks,
      selected: selected.length, duration, distance, speed,
      intervals, cpuFrames, samples, longTasks, backend: state.renderStats?.gpuTerrain?.backend,
      framePhases: window.__framePhases?.snapshot(),
      activeImpactFrames: impactDraw === null ? undefined : activeImpactFrames,
      standbyClears: window.benchmarkStandbyClears,
      browserDpr: devicePixelRatio, canvas: [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight]
    }
  }, { battleOnly, battleDuration, omitWebGpuTerrainTiming, traceEnabled, countStandbyClears, impactDraw, holdMinimap, holdForeground })
  if (traceComplete) await saveCompositorTrace(browserSession, traceComplete)
  if (backendChoice !== 'auto' && result.backend !== backendChoice) {
    throw new Error(`Requested ${backendChoice}, but benchmark rendered on ${result.backend}`)
  }
  if (profileEnabled) {
    const { profile } = await pageSession.send('Profiler.stop')
    await writeFile(join(output, 'cpu.cpuprofile'), JSON.stringify(profile))
  }
  const after = (await pageSession.send('Performance.getMetrics')).metrics
  const cdpMetrics = Object.fromEntries(after.map(({ name, value }) => [name, {
    before: before.find(metric => metric.name === name)?.value,
    after: value
  }]))
  const { intervals, cpuFrames } = result
  const sorted = intervals.slice().sort((a, b) => a - b)
  const percent = fraction => sorted[Math.ceil(fraction * sorted.length) - 1]
  let left = 0
  let elapsed = 0
  let windowStart = 0
  let minimumOneSecondFps = Infinity
  for (const [right, interval] of intervals.entries()) {
    elapsed += interval
    while (elapsed - windowStart - intervals[left] >= 1000) windowStart += intervals[left++]
    if (elapsed >= 1000) minimumOneSecondFps = Math.min(minimumOneSecondFps, right - left + 1)
  }
  const average = key => cpuFrames.reduce((sum, frame) => sum + frame[key], 0) / cpuFrames.length
  const summary = {
    cadence, preparationMs, tutorialDisabled: true, scene: battleOnly ? 'stationary battle' : 'fast scrolling',
    averageFps: intervals.length * 1000 / elapsed,
    maxVisibleApacheRockets: result.maxVisibleApacheRockets,
    maxVisibleImpacts: result.maxVisibleImpacts,
    minimumOneSecondFps,
    slowestFrameFps: 1000 / percent(1),
    p95Ms: percent(0.95), p99Ms: percent(0.99), maxMs: percent(1),
    intervalsOver60Budget: intervals.filter(ms => ms > 1000 / 60).length,
    averageUpdateMs: average('updateMs'), averageRenderMs: average('renderMs'),
    startUnits: result.startUnits, endUnits: result.endUnits, maxBullets: result.maxBullets,
    selected: result.selected, routeLaps: result.duration * result.speed / 1000 / result.distance,
    backend: result.backend, browserDpr: result.browserDpr, canvas: result.canvas,
    errors
  }
  await writeFile(join(output, 'result.json'), JSON.stringify({
    summary, gpu, browser: await browser.version(), profileEnabled, traceEnabled, backendChoice, importThroughUi,
    staticGroundTiming, omitWebGpuTerrainTiming, impactDraw, holdMinimap, holdForeground, workers, cdpMetrics, ...result
  }))
  console.log(JSON.stringify(summary, null, 2))
} finally {
  await browser.close()
}
