import { expect, test } from '@playwright/test'

const RUN_PERF = process.env.PERF_CARRIER_NAVAL === '1'
const SAMPLE_DURATION_MS = Number.parseInt(process.env.PERF_CARRIER_NAVAL_DURATION_MS || '5000', 10)

test.describe('Carrier air operations and naval direct-control performance', () => {
  test.skip(!RUN_PERF, 'Set PERF_CARRIER_NAVAL=1 to run this opt-in performance benchmark.')

  test('keeps tick cost, frame rate, and heap stable under concurrent carrier approaches', async({ page, baseURL }, testInfo) => {
    testInfo.setTimeout(120000)
    await page.goto(`${baseURL || 'http://localhost:5173'}?seed=27&size=64&players=2&oreFields=8&monitor=1`)
    await page.waitForFunction(() => Boolean(window.gameInstance?.gameLoop && window.gameState?.gameStarted), null, { timeout: 45000 })
    await page.evaluate(() => {
      const closeButton = document.getElementById('benchmarkModalCloseBtn') ||
        document.getElementById('benchmarkModalCloseFooterBtn')
      closeButton?.click()
      window.gameInstance.gameLoop.requestRender()
    })

    const result = await page.evaluate(async durationMs => {
      const [fleetModule, remoteModule, configModule, performanceModule] = await Promise.all([
        import('/src/game/navalFleetSystem.js'),
        import('/src/game/remoteControl.js'),
        import('/src/config.js'),
        import('/src/performance/performanceMonitor.js')
      ])
      const { updateNavalFleet } = fleetModule
      const { handleNavalRemoteControl } = remoteModule
      const { TILE_SIZE, UNIT_PROPERTIES } = configModule
      const { performanceMonitor } = performanceModule
      const carrierCount = 12
      const aircraftPerCarrier = 4
      const units = []

      for (let carrierIndex = 0; carrierIndex < carrierCount; carrierIndex++) {
        const carrierX = (18 + (carrierIndex % 4) * 10) * TILE_SIZE
        const carrierY = (12 + Math.floor(carrierIndex / 4) * 14) * TILE_SIZE
        const carrier = {
          id: `perf-carrier-${carrierIndex}`,
          type: 'aircraftCarrier',
          owner: 'player1',
          isNaval: true,
          health: UNIT_PROPERTIES.aircraftCarrier.health,
          x: carrierX,
          y: carrierY,
          direction: 0,
          deckSlotCapacity: 4,
          carrierAircraftIds: [],
          carrierFuel: 24000,
          carrierAmmo: 64,
          path: [],
          moveTarget: null,
          movement: {
            velocity: { x: 0, y: 0 },
            targetVelocity: { x: 0, y: 0 },
            currentSpeed: 0,
            isMoving: false
          }
        }
        units.push(carrier)

        for (let aircraftIndex = 0; aircraftIndex < aircraftPerCarrier; aircraftIndex++) {
          const id = `perf-f22-${carrierIndex}-${aircraftIndex}`
          carrier.carrierAircraftIds.push(id)
          units.push({
            id,
            type: 'f22Raptor',
            owner: 'player1',
            health: 80,
            x: carrierX - TILE_SIZE * (20 + aircraftIndex),
            y: carrierY + aircraftIndex * TILE_SIZE * 0.4,
            tileX: 0,
            tileY: 0,
            direction: 0,
            altitude: TILE_SIZE * 4,
            maxAltitude: TILE_SIZE * 4,
            flightState: 'airborne',
            homeCarrierId: carrier.id,
            carrierId: carrier.id,
            carrierDeckSlotIndex: aircraftIndex,
            carrierOperation: {
              state: 'carrier_rendezvous',
              carrierId: carrier.id,
              startedAt: 0,
              startAltitude: TILE_SIZE * 4
            },
            rocketAmmo: 8,
            maxRocketAmmo: 8,
            path: [],
            moveTarget: null,
            movement: {
              velocity: { x: 0, y: 0 },
              targetVelocity: { x: 0, y: 0 },
              currentSpeed: 0,
              isMoving: false
            }
          })
        }
      }

      const remoteShipTypes = [
        'destroyer', 'supplyShip', 'hovercraft', 'vehicleFerry',
        'aircraftCarrier', 'navalMineLayer', 'battleship', 'submarine'
      ]
      const remoteShips = remoteShipTypes.map((type, index) => ({
        id: `perf-remote-${type}`,
        type,
        owner: 'player1',
        isNaval: true,
        health: UNIT_PROPERTIES[type].health,
        x: (8 + index) * TILE_SIZE,
        y: 8 * TILE_SIZE,
        direction: 0,
        speed: UNIT_PROPERTIES[type].speed,
        speedModifier: 1,
        rotationSpeed: UNIT_PROPERTIES[type].rotationSpeed,
        path: [],
        moveTarget: null,
        movement: {
          velocity: { x: 0, y: 0 },
          targetVelocity: { x: 0, y: 0 },
          currentSpeed: 0,
          rotation: 0,
          targetRotation: 0,
          isMoving: false
        }
      }))
      const inputs = {
        forwardIntensity: 1,
        backwardIntensity: 0,
        turnLeftIntensity: 0,
        turnRightIntensity: 0.35,
        fireIntensity: 0
      }
      const map = Array.from({ length: 64 }, () => Array.from({ length: 64 }, () => ({ type: 'water' })))
      const state = { occupancyMap: [], depthCharges: [], waterMines: [], explosions: [] }
      const frameIntervals = []
      let workloadTotalMs = 0
      let workloadMaxMs = 0
      let workloadSamples = 0
      let gameUpdateTotalMs = 0
      let gameRenderTotalMs = 0
      let gameFrameSamples = 0
      let previousFrameAt = performance.now()
      const startedAt = previousFrameAt
      const heapStartBytes = performance.memory?.usedJSHeapSize || null
      const fpsDisplay = window.gameInstance.gameLoop.fpsDisplay
      const originalReportFrameBreakdown = fpsDisplay.reportFrameBreakdown.bind(fpsDisplay)
      fpsDisplay.reportFrameBreakdown = breakdown => {
        gameUpdateTotalMs += Number.isFinite(breakdown?.updateMs) ? breakdown.updateMs : 0
        gameRenderTotalMs += Number.isFinite(breakdown?.renderMs) ? breakdown.renderMs : 0
        gameFrameSamples++
        return originalReportFrameBreakdown(breakdown)
      }
      performanceMonitor.start()

      await new Promise(resolve => {
        const frame = now => {
          frameIntervals.push(now - previousFrameAt)
          previousFrameAt = now
          const workloadStartedAt = performance.now()
          updateNavalFleet(units, [], map, state, now, 16)
          remoteShips.forEach(ship => handleNavalRemoteControl(ship, inputs, [], remoteShips, map, now))
          window.gameInstance.gameLoop.requestRender()
          const workloadMs = performance.now() - workloadStartedAt
          workloadTotalMs += workloadMs
          workloadMaxMs = Math.max(workloadMaxMs, workloadMs)
          workloadSamples++
          if (now - startedAt >= durationMs) resolve()
          else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      })

      fpsDisplay.reportFrameBreakdown = originalReportFrameBreakdown
      const monitor = performanceMonitor.stop()
      const heapEndBytes = performance.memory?.usedJSHeapSize || null
      const usableIntervals = frameIntervals.filter(interval => interval > 0 && interval < 250)
      const elapsedMs = usableIntervals.reduce((sum, interval) => sum + interval, 0)
      return {
        fps: elapsedMs > 0 ? usableIntervals.length * 1000 / elapsedMs : 0,
        frameCount: usableIntervals.length,
        maxFrameMs: usableIntervals.length ? Math.max(...usableIntervals) : 0,
        averageWorkloadMs: workloadSamples ? workloadTotalMs / workloadSamples : 0,
        maxWorkloadMs: workloadMaxMs,
        averageGameUpdateMs: gameFrameSamples ? gameUpdateTotalMs / gameFrameSamples : 0,
        averageGameRenderMs: gameFrameSamples ? gameRenderTotalMs / gameFrameSamples : 0,
        gameFrameSamples,
        heapStartMb: Number.isFinite(heapStartBytes) ? heapStartBytes / (1024 * 1024) : null,
        heapEndMb: Number.isFinite(heapEndBytes) ? heapEndBytes / (1024 * 1024) : null,
        heapDeltaMb: Number.isFinite(heapStartBytes) && Number.isFinite(heapEndBytes)
          ? (heapEndBytes - heapStartBytes) / (1024 * 1024)
          : null,
        timingMs: monitor?.timingMs || null,
        carrierCount,
        aircraftCount: carrierCount * aircraftPerCarrier,
        remoteShipCount: remoteShips.length
      }
    }, SAMPLE_DURATION_MS)

    console.log(`CARRIER_NAVAL_PERF_RESULT ${JSON.stringify(result)}`)
    await testInfo.attach('carrier-naval-control-performance.json', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json'
    })

    expect(result.fps).toBeGreaterThanOrEqual(50)
    expect(result.averageWorkloadMs).toBeLessThan(4)
    expect(result.averageGameUpdateMs).toBeLessThan(8)
    expect(result.averageGameRenderMs).toBeLessThan(8)
    if (Number.isFinite(result.heapDeltaMb)) expect(result.heapDeltaMb).toBeLessThan(16)
  })
})
