import { test, expect } from '@playwright/test'

const RUN_PERF = process.env.PERF_DESTROYER_COMBAT === '1'

test.describe('Destroyer combat tracking performance', () => {
  test.skip(!RUN_PERF, 'Set PERF_DESTROYER_COMBAT=1 to run this opt-in performance benchmark.')

  test('tracks 120 active Destroyer targets without exceeding the frame budget', async({ page }, testInfo) => {
    await page.goto('/')
    const result = await page.evaluate(async() => {
      const [{ updateUnitMovement }, { TILE_SIZE }] = await Promise.all([
        import('/src/game/unitMovement.js'),
        import('/src/config.js')
      ])
      const size = 80
      const mapGrid = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({ type: 'water' })))
      const occupancyMap = Array.from({ length: size }, () => Array(size).fill(0))
      const units = Array.from({ length: 120 }, (_, index) => {
        const tileX = 5 + (index % 20) * 3
        const tileY = 5 + Math.floor(index / 20) * 5
        return {
          id: `perf-destroyer-${index}`,
          type: 'destroyer',
          owner: index % 2 ? 'player1' : 'player2',
          isNaval: true,
          health: 250,
          maxHealth: 250,
          x: tileX * TILE_SIZE,
          y: tileY * TILE_SIZE,
          tileX,
          tileY,
          direction: 0,
          turretDirection: 0,
          rotationSpeed: 0.024,
          turretRotationSpeed: 0.024,
          path: [],
          movement: {},
          target: {
            id: `perf-target-${index}`,
            owner: index % 2 ? 'player2' : 'player1',
            health: 250,
            x: tileX * TILE_SIZE,
            y: (tileY + 8) * TILE_SIZE,
            tileX,
            tileY: tileY + 8
          }
        }
      })
      const state = { occupancyMap, buildings: [], units, mapGrid, humanPlayer: 'player1' }
      const heapStartBytes = performance.memory?.usedJSHeapSize || null
      let movementCpuMs = 0
      const frameStart = performance.now()
      for (let frame = 0; frame < 240; frame++) {
        const startedAt = performance.now()
        updateUnitMovement(units, mapGrid, occupancyMap, state, frame * (1000 / 60))
        movementCpuMs += performance.now() - startedAt
        await new Promise(resolve => requestAnimationFrame(resolve))
      }
      const elapsedMs = performance.now() - frameStart
      const heapEndBytes = performance.memory?.usedJSHeapSize || null
      return {
        fps: 240000 / elapsedMs,
        movementCpuMs,
        averageMovementCpuMs: movementCpuMs / 240,
        heapDeltaBytes: heapStartBytes === null || heapEndBytes === null ? null : heapEndBytes - heapStartBytes
      }
    })

    await testInfo.attach('destroyer-combat-performance.json', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json'
    })
    console.log(`Destroyer combat performance: ${JSON.stringify(result)}`)
    expect(result.fps).toBeGreaterThan(50)
    expect(result.averageMovementCpuMs).toBeLessThan(16.67)
  })
})
