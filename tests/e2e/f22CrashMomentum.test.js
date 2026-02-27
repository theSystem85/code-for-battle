import { test, expect } from '@playwright/test'

test.describe('F22 crash momentum and burning smoke', () => {
  /** @type {string[]} */
  let consoleErrors = []

  test.beforeEach(async({ page }) => {
    consoleErrors = []

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    page.on('pageerror', error => {
      consoleErrors.push(`Page error: ${error.message}`)
    })

    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })
  })

  test('destroyed airborne F22 keeps forward movement and emits burning smoke before impact', async({ page }) => {
    test.setTimeout(120000)

    await page.goto('/?seed=11')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      return Boolean(gs?.gameStarted && !gs.gamePaused && window.cheatSystem && window.gameInstance?.units)
    }, { timeout: 30000 })

    const setupResult = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const humanPlayer = gs.humanPlayer || 'player1'
      const knownUnitIds = new Set(units.map(unit => unit.id))

      gs.cursorX = 24 * 32
      gs.cursorY = 24 * 32
      window.cheatSystem.processCheatCode(`f22Raptor 1 ${humanPlayer}`)

      const f22 = units.find(unit => unit.type === 'f22Raptor' && unit.owner === humanPlayer && !knownUnitIds.has(unit.id))
      if (!f22) return { error: 'Failed to spawn F22' }

      f22.flightState = 'airborne'
      f22.f22State = 'airborne'
      f22.altitude = Math.max(f22.maxAltitude || 0, 120)
      f22.direction = 0
      f22.rotation = 0
      f22.path = []
      f22.moveTarget = null
      f22.flightPlan = {
        x: f22.x + 600,
        y: f22.y,
        stopRadius: 8,
        mode: 'move'
      }
      f22.movement = f22.movement || {}
      f22.movement.velocity = { x: Math.max(f22.airCruiseSpeed || 3.5, 3.5), y: 0 }
      f22.movement.targetVelocity = { x: Math.max(f22.airCruiseSpeed || 3.5, 3.5), y: 0 }
      f22.movement.currentSpeed = Math.max(f22.airCruiseSpeed || 3.5, 3.5)
      f22.movement.isMoving = true

      window.__f22CrashE2E = {
        f22Id: f22.id,
        startX: f22.x,
        xPositions: [],
        sampleTimes: [],
        targetVelocities: [],
        smokeWithFireCount: 0,
        crashStartSeen: false
      }

      f22.health = 0
      return { ok: true }
    })

    expect(setupResult.error || null).toBeNull()

    const result = await page.waitForFunction(() => {
      const tracker = window.__f22CrashE2E
      const gs = window.gameState
      const units = window.gameInstance?.units || []
      if (!tracker || !gs) return false

      const unit = units.find(candidate => candidate.id === tracker.f22Id)
      if (!unit) return false

      if (unit.f22State === 'crashing') {
        tracker.crashStartSeen = true
        tracker.xPositions.push(unit.x)
        tracker.sampleTimes.push(performance.now())
        tracker.targetVelocities.push(unit.movement?.targetVelocity?.x || 0)

        const smokeParticles = Array.isArray(gs.smokeParticles) ? gs.smokeParticles : []
        for (const particle of smokeParticles) {
          if (!particle || !particle.fireIntensity) continue
          if (particle.fireIntensity > 0.05) {
            tracker.smokeWithFireCount += 1
            break
          }
        }
      }

      if (unit.f22State !== 'crashed') return false

      const forwardTravel = unit.x - tracker.startX
      const minTargetVelocityX = tracker.targetVelocities.length > 0
        ? Math.min(...tracker.targetVelocities)
        : 0

      let monotonicForwardSamples = 0
      for (let i = 1; i < tracker.xPositions.length; i++) {
        if (tracker.xPositions[i] > tracker.xPositions[i - 1] + 0.01) {
          monotonicForwardSamples += 1
        }
      }

      return {
        crashStartSeen: tracker.crashStartSeen,
        forwardTravel,
        minTargetVelocityX,
        monotonicForwardSamples,
        totalCrashSamples: tracker.xPositions.length,
        smokeWithFireCount: tracker.smokeWithFireCount,
        lastState: unit.f22State,
        finalAltitude: unit.altitude
      }
    }, { timeout: 90000 })

    const resolved = await result.jsonValue()

    expect(resolved.crashStartSeen).toBe(true)
    expect(resolved.lastState).toBe('crashed')
    expect(resolved.finalAltitude).toBeLessThanOrEqual(0.5)
    expect(resolved.forwardTravel).toBeGreaterThan(120)
    expect(resolved.minTargetVelocityX).toBeGreaterThan(1)
    expect(resolved.totalCrashSamples).toBeGreaterThan(6)
    expect(resolved.monotonicForwardSamples).toBeGreaterThanOrEqual(Math.floor(resolved.totalCrashSamples * 0.65))
    expect(resolved.smokeWithFireCount).toBeGreaterThan(0)

    expect(consoleErrors, `Console errors encountered:\n${consoleErrors.join('\n')}`).toEqual([])
  })
})
