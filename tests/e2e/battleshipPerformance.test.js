import { expect, test } from '@playwright/test'

const RUN_BATTLESHIP_PERF = process.env.PERF_BATTLESHIP_RENDER === '1'
const CPU_THROTTLE = Number.parseFloat(process.env.PERF_BATTLESHIP_CPU_THROTTLE || '6')
const SAMPLE_DURATION_MS = Number.parseInt(process.env.PERF_BATTLESHIP_DURATION_MS || '3000', 10)

async function sampleAnimationFrames(page, durationMs) {
  return page.evaluate(duration => new Promise(resolve => {
    const intervals = []
    let previous = performance.now()
    const startedAt = previous

    const record = now => {
      intervals.push(now - previous)
      previous = now
      if (now - startedAt >= duration) {
        const usable = intervals.filter(interval => interval > 0 && interval < 250)
        const elapsed = usable.reduce((sum, interval) => sum + interval, 0)
        resolve({
          fps: elapsed > 0 ? usable.length * 1000 / elapsed : 0,
          maxFrameMs: usable.length ? Math.max(...usable) : 0,
          frameCount: usable.length
        })
        return
      }
      requestAnimationFrame(record)
    }

    requestAnimationFrame(record)
  }), durationMs)
}

test.describe('Battleship render performance', () => {
  test.skip(!RUN_BATTLESHIP_PERF, 'Set PERF_BATTLESHIP_RENDER=1 to run the battleship render benchmark.')

  test('keeps selected layered battleships near the baseline frame rate', async({ page, context, baseURL }) => {
    await page.goto(`${baseURL || 'http://localhost:5173'}?seed=17&size=64&players=2&oreFields=8`)
    await page.waitForFunction(() => Boolean(window.gameInstance?.gameLoop && window.gameState?.gameStarted), null, { timeout: 45000 })

    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })

    try {
      const baseline = await sampleAnimationFrames(page, SAMPLE_DURATION_MS)
      await page.evaluate(async() => {
        const [{ TILE_SIZE, UNIT_PROPERTIES }, { createBattleshipTurrets }, mainModule] = await Promise.all([
          import('/src/config.js'),
          import('/src/game/battleshipTurrets.js'),
          import('/src/main.js')
        ])
        const units = mainModule.units
        const gameState = window.gameState
        const canvas = document.getElementById('gameCanvas')
        const viewportWidth = canvas.clientWidth || 1000
        const viewportHeight = canvas.clientHeight || 700
        const centerWorldX = (gameState.scrollOffset?.x || 0) + viewportWidth / 2
        const centerWorldY = (gameState.scrollOffset?.y || 0) + viewportHeight / 2
        const properties = UNIT_PROPERTIES.battleship

        window.selectedUnitsRef.length = 0
        for (let index = 0; index < 1; index++) {
          const ship = {
            id: `perf-battleship-${index}`,
            type: 'battleship',
            owner: gameState.humanPlayer,
            isNaval: true,
            selected: true,
            x: centerWorldX - TILE_SIZE / 2 + (index - 1.5) * TILE_SIZE * 2,
            y: centerWorldY - TILE_SIZE / 2 + (index % 2 ? TILE_SIZE * 2 : -TILE_SIZE * 2),
            tileX: Math.floor(centerWorldX / TILE_SIZE),
            tileY: Math.floor(centerWorldY / TILE_SIZE),
            health: properties.health,
            maxHealth: properties.health,
            ammunition: 100,
            maxAmmunition: 100,
            direction: 0,
            path: [],
            movement: {
              velocity: { x: 0, y: 0 },
              targetVelocity: { x: 0, y: 0 },
              currentSpeed: 0,
              isMoving: false
            },
            turretDamageOrder: []
          }
          ship.batteries = createBattleshipTurrets(ship)
          units.push(ship)
          window.selectedUnitsRef.push(ship)
        }
        window.gameInstance.gameLoop.requestRender()
      })
      await page.waitForTimeout(500)

      const selectedBattleships = await sampleAnimationFrames(page, SAMPLE_DURATION_MS)
      const result = { baseline, selectedBattleships, cpuThrottle: CPU_THROTTLE }
      console.log(`BATTLESHIP_PERF_RESULT ${JSON.stringify(result)}`)

      expect(selectedBattleships.frameCount).toBeGreaterThan(0)
      expect(
        selectedBattleships.fps,
        `Selected battleship FPS regressed from ${baseline.fps.toFixed(1)} to ${selectedBattleships.fps.toFixed(1)}`
      ).toBeGreaterThanOrEqual(baseline.fps * 0.8)
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    }
  })
})
