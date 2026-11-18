import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const url = process.env.BENCHMARK_URL || 'http://127.0.0.1:4192'
const fixture = process.env.BENCHMARK_FIXTURE
const output = process.env.BENCHMARK_OUTPUT
const ticks = Number(process.env.BENCHMARK_FIXED_TICKS || 150)
const countSpatial = process.env.BENCHMARK_COUNT_SPATIAL === '1'
if (!fixture || !output || !Number.isSafeInteger(ticks) || ticks < 1 || ticks > 1000) {
  throw new Error('Set BENCHMARK_FIXTURE, BENCHMARK_OUTPUT and a valid BENCHMARK_FIXED_TICKS (1–1000)')
}
await mkdir(output, { recursive: true })
const fixtureSha256 = createHash('sha256').update(await readFile(fixture)).digest('hex')
const browser = await chromium.launch({ channel: 'chrome', headless: false, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] })
try {
  const session = await browser.newBrowserCDPSession()
  const { gpu } = await session.send('SystemInfo.getInfo')
  const adapter = gpu.devices[0]
  if (!/Apple|NVIDIA|AMD|Intel|Adreno|Mali/i.test(JSON.stringify(adapter)) ||
      /swiftshader|llvmpipe|software|basic render|lavapipe/i.test(JSON.stringify(adapter)) ||
      gpu.featureStatus.rasterization !== 'enabled') throw new Error('Hardware rasterization was not verified')

  const page = await browser.newPage({ viewport: null })
  await page.bringToFront()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${url}/?seed=11&size=200&players=4&oreFields=24&tutorial=0`)
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop?.allAssetsLoaded &&
    document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden') &&
    performance.getEntriesByName('startup:idle-settings-and-save:duration').length > 0, null, { timeout: 120000 })
  await page.evaluate(async() => {
    const { GameLoop } = await import('/src/game/gameLoop.js')
    window.gameInstance.gameLoop.stop()
    GameLoop.prototype.scheduleNextFrame = function() {}
  })
  await page.locator('#importSaveInput').setInputFiles(fixture)
  await page.waitForFunction(() => window.gameInstance?.units?.length >= 400 &&
    document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'), null, { timeout: 120000 })
  const result = await page.evaluate(async({ count, countSpatial }) => {
    const { updateGame } = await import('/src/updateGame.js')
    const { advanceSimulationTime, getFixedSimulationStepMs } = await import('/src/game/time.js')
    const { QuadtreeNode, SpatialQuadtree } = await import('/src/game/spatialQuadtree.js')
    const { gameLoop, units } = window.gameInstance
    const state = window.gameState
    gameLoop.stop()
    if (document.querySelector('.tutorial-overlay') || window.tutorialSystem) throw new Error('Tutorial active')
    if (document.visibilityState !== 'visible' || !document.hasFocus()) throw new Error('Page not foregrounded')
    let randomState = 123456789
    const originalRandom = Math.random
    Math.random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0
      return randomState / 4294967296
    }
    const digestState = () => JSON.stringify({
      simulationTime: state.simulationTime,
      units: units.map(unit => [unit.id, unit.type, unit.owner, unit.x, unit.y, unit.health]),
      bullets: gameLoop.bullets.map(bullet => [bullet.x, bullet.y, bullet.type])
    })
    const initialState = digestState()
    const timings = []
    const spatial = { rebuilds: 0, groundQueries: 0, airQueries: 0, visitedNodes: 0, candidateUnits: 0, returnedUnits: 0 }
    if (countSpatial) {
      const rebuild = SpatialQuadtree.prototype.rebuild
      SpatialQuadtree.prototype.rebuild = function(...args) {
        spatial.rebuilds++
        return rebuild.apply(this, args)
      }
      for (const [method, counter] of [['queryNearbyGround', 'groundQueries'], ['queryNearbyAir', 'airQueries']]) {
        const original = SpatialQuadtree.prototype[method]
        SpatialQuadtree.prototype[method] = function(...args) {
          spatial[counter]++
          const result = original.apply(this, args)
          spatial.returnedUnits += result.length
          return result
        }
      }
      const query = QuadtreeNode.prototype.queryCircleInto
      QuadtreeNode.prototype.queryCircleInto = function(x, y, radiusSq, ...args) {
        spatial.visitedNodes++
        if (this.boundary.intersectsCircle(x, y, radiusSq)) spatial.candidateUnits += this.unitCount
        return query.call(this, x, y, radiusSq, ...args)
      }
    }
    const step = getFixedSimulationStepMs(state)
    try {
      for (let index = 0; index < count; index++) {
        const start = performance.now()
        advanceSimulationTime(step, state)
        updateGame(step, gameLoop.mapGrid, gameLoop.factories, units, gameLoop.bullets, state)
        timings.push(performance.now() - start)
      }
    } finally {
      Math.random = originalRandom
    }
    return { initialState, finalState: digestState(), timings, step, spatial, unitCount: units.length, visible: document.visibilityState, focused: document.hasFocus() }
  }, { count: ticks, countSpatial })
  const hash = value => createHash('sha256').update(value).digest('hex')
  const sorted = [...result.timings].sort((a, b) => a - b)
  const percentile = p => sorted[Math.ceil(sorted.length * p) - 1]
  const summary = {
    fixtureSha256, browser: await browser.version(), adapter, ticks, stepMs: result.step,
    initialStateHash: hash(result.initialState), finalStateHash: hash(result.finalState),
    meanTickMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50TickMs: percentile(0.5), p95TickMs: percentile(0.95), p99TickMs: percentile(0.99),
    maxTickMs: sorted.at(-1), endUnits: result.unitCount, visible: result.visible, focused: result.focused, countSpatial, spatial: result.spatial, errors
  }
  await writeFile(join(output, 'result.json'), JSON.stringify({ summary, timings: result.timings }, null, 2))
  console.log(JSON.stringify(summary))
} finally {
  await browser.close()
}
