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
      const [fleetModule, remoteModule, configModule, performanceModule, movementCollisionModule] = await Promise.all([
        import('/src/game/navalFleetSystem.js'),
        import('/src/game/remoteControl.js'),
        import('/src/config.js'),
        import('/src/performance/performanceMonitor.js'),
        import('/src/game/movementCollision.js')
      ])
      const { updateNavalFleet } = fleetModule
      const { handleNavalRemoteControl } = remoteModule
      const { TILE_SIZE, UNIT_PROPERTIES } = configModule
      const { performanceMonitor } = performanceModule
      const { checkUnitCollision, resolveNavalShoreOverlap } = movementCollisionModule
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
      const coastMap = Array.from({ length: 64 }, () =>
        Array.from({ length: 64 }, (_, x) => ({ type: x < 20 ? 'land' : 'water' })))
      const shoreTransports = Array.from({ length: 24 }, (_, index) => {
        const type = index % 2 === 0 ? 'vehicleFerry' : 'hovercraft'
        const cargoCount = type === 'vehicleFerry' ? 10 : 4
        const cargoIds = Array.from({ length: cargoCount }, (_, cargoIndex) => `perf-cargo-${index}-${cargoIndex}`)
        return {
          id: `perf-shore-${index}`,
          type,
          owner: 'player1',
          isNaval: true,
          health: UNIT_PROPERTIES[type].health,
          x: 20 * TILE_SIZE,
          y: (2 + index * 2) * TILE_SIZE,
          direction: Math.PI,
          transportCapacity: cargoCount,
          embarkedUnitIds: [],
          pendingLoadRendezvous: {
            desiredCenterX: 20.5 * TILE_SIZE,
            desiredCenterY: (2.5 + index * 2) * TILE_SIZE,
            cargoSlots: Object.fromEntries(cargoIds.map((id, cargoIndex) => [id, {
              x: 17 - (cargoIndex % 4),
              y: 2 + index * 2 + Math.floor(cargoIndex / 4)
            }]))
          },
          pendingLoadUnitIds: cargoIds,
          movement: {
            velocity: { x: 0, y: 0 },
            targetVelocity: { x: 0, y: 0 },
            currentSpeed: 0,
            isMoving: false
          }
        }
      })
      const shoreCargo = shoreTransports.flatMap((transport, transportIndex) =>
        transport.pendingLoadUnitIds.map((id, cargoIndex) => ({
          id,
          type: 'tank_v1',
          owner: 'player1',
          health: 100,
          x: (2 + cargoIndex % 4) * TILE_SIZE,
          y: (2 + transportIndex * 2 + Math.floor(cargoIndex / 4)) * TILE_SIZE,
          tileX: 2 + cargoIndex % 4,
          tileY: 2 + transportIndex * 2 + Math.floor(cargoIndex / 4),
          pendingTransportId: transport.id,
          path: [],
          moveTarget: null
        })))
      const fleetUnits = [...units, ...shoreTransports, ...shoreCargo]
      const state = { occupancyMap: [], depthCharges: [], waterMines: [], explosions: [] }
      const heapStartBytes = performance.memory?.usedJSHeapSize || null
      const fpsDisplay = window.gameInstance.gameLoop.fpsDisplay
      const originalReportFrameBreakdown = fpsDisplay.reportFrameBreakdown.bind(fpsDisplay)
      const boardingState = shoreTransports.map(transport => ({
        transport,
        pendingLoadUnitIds: transport.pendingLoadUnitIds,
        pendingLoadRendezvous: transport.pendingLoadRendezvous
      }))

      const setBoardingActive = active => {
        boardingState.forEach(entry => {
          entry.transport.pendingLoadUnitIds = active ? entry.pendingLoadUnitIds : []
          entry.transport.pendingLoadUnitId = active ? entry.pendingLoadUnitIds[0] : null
          entry.transport.pendingLoadRendezvous = active ? entry.pendingLoadRendezvous : null
        })
        shoreCargo.forEach(cargo => {
          cargo.pendingTransportId = active
            ? boardingState.find(entry => entry.pendingLoadUnitIds.includes(cargo.id))?.transport.id || null
            : null
        })
      }

      const samplePhase = async(active, phaseDurationMs) => {
        setBoardingActive(active)
        const frameIntervals = []
        let workloadTotalMs = 0
        let workloadMaxMs = 0
        let workloadSamples = 0
        let gameUpdateTotalMs = 0
        let gameRenderTotalMs = 0
        let gameFrameSamples = 0
        let shoreCollisions = 0
        let previousFrameAt = performance.now()
        const startedAt = previousFrameAt
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
            updateNavalFleet(fleetUnits, [], coastMap, state, now, 16)
            remoteShips.forEach(ship => handleNavalRemoteControl(ship, inputs, [], remoteShips, map, now))
            shoreTransports.forEach(transport => {
              if (checkUnitCollision(transport, coastMap, [], shoreTransports).collided) shoreCollisions++
              resolveNavalShoreOverlap(transport, coastMap)
            })
            window.gameInstance.gameLoop.requestRender()
            const workloadMs = performance.now() - workloadStartedAt
            workloadTotalMs += workloadMs
            workloadMaxMs = Math.max(workloadMaxMs, workloadMs)
            workloadSamples++
            if (now - startedAt >= phaseDurationMs) resolve()
            else requestAnimationFrame(frame)
          }
          requestAnimationFrame(frame)
        })

        const monitor = performanceMonitor.stop()
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
          shoreCollisions,
          timingMs: monitor?.timingMs || null
        }
      }

      const phaseDurationMs = Math.max(1500, durationMs / 2)
      const baseline = await samplePhase(false, phaseDurationMs)
      const activeBoarding = await samplePhase(true, phaseDurationMs)

      fpsDisplay.reportFrameBreakdown = originalReportFrameBreakdown
      const heapEndBytes = performance.memory?.usedJSHeapSize || null
      return {
        baseline,
        activeBoarding,
        heapStartMb: Number.isFinite(heapStartBytes) ? heapStartBytes / (1024 * 1024) : null,
        heapEndMb: Number.isFinite(heapEndBytes) ? heapEndBytes / (1024 * 1024) : null,
        heapDeltaMb: Number.isFinite(heapStartBytes) && Number.isFinite(heapEndBytes)
          ? (heapEndBytes - heapStartBytes) / (1024 * 1024)
          : null,
        carrierCount,
        aircraftCount: carrierCount * aircraftPerCarrier,
        remoteShipCount: remoteShips.length,
        shoreTransportCount: shoreTransports.length,
        shoreCargoCount: shoreCargo.length
      }
    }, SAMPLE_DURATION_MS)

    console.log(`CARRIER_NAVAL_PERF_RESULT ${JSON.stringify(result)}`)
    await testInfo.attach('carrier-naval-control-performance.json', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json'
    })

    expect(result.activeBoarding.fps).toBeGreaterThanOrEqual(50)
    expect(result.activeBoarding.fps).toBeGreaterThanOrEqual(result.baseline.fps * 0.8)
    expect(result.activeBoarding.averageWorkloadMs).toBeLessThan(4)
    expect(result.activeBoarding.averageGameUpdateMs).toBeLessThan(8)
    expect(result.activeBoarding.averageGameRenderMs).toBeLessThan(8)
    expect(result.activeBoarding.shoreCollisions).toBe(0)
    if (Number.isFinite(result.heapDeltaMb)) expect(result.heapDeltaMb).toBeLessThan(16)
  })
})
