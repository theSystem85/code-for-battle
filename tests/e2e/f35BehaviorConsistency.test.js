import { test, expect } from '@playwright/test'

test.describe('F35 behavior consistency', () => {
  test('enforces airborne-only bombing, no move autoland, slot reservation, and bomb no-trail', async({ page }) => {
    test.setTimeout(180000)

    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto('/?seed=21')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.gameState?.gameStarted && window.cheatSystem && window.gameInstance?.units), { timeout: 30000 })

    const setup = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const buildings = gs.buildings
      const humanPlayer = gs.humanPlayer || 'player1'
      const knownUnitIds = new Set(units.map(u => u.id))
      const knownBuildingIds = new Set(buildings.map(b => b.id))

      gs.cursorX = 18 * 32
      gs.cursorY = 18 * 32
      window.cheatSystem.processCheatCode(`build airstrip ${humanPlayer}`)
      const airstrip = buildings.find(b => b.type === 'airstrip' && b.owner === humanPlayer && !knownBuildingIds.has(b.id))
      if (!airstrip) return { error: 'missing airstrip' }

      gs.cursorX = 32 * 32
      gs.cursorY = 16 * 32
      window.cheatSystem.processCheatCode('build powerPlant player2')
      const target = buildings.find(b => b.type === 'powerPlant' && !knownBuildingIds.has(b.id))
      if (!target) return { error: 'missing target' }
      target.health = 200

      gs.cursorX = (airstrip.x + 1) * 32
      gs.cursorY = (airstrip.y + 1) * 32
      window.cheatSystem.processCheatCode(`f35 3 ${humanPlayer}`)
      const f35s = units.filter(u => u.type === 'f35' && u.owner === humanPlayer && !knownUnitIds.has(u.id))
      if (f35s.length < 3) return { error: 'missing f35s' }

      const [grounded, moveJet, attackJet] = f35s
      grounded.flightState = 'grounded'
      grounded.altitude = 0
      grounded.manualFlightState = 'auto'
      grounded.target = target
      grounded.rocketAmmo = 1
      grounded.canFire = true

      moveJet.flightState = 'airborne'
      moveJet.altitude = Math.max(48, (moveJet.maxAltitude || 64) * 0.8)
      moveJet.commandIntent = 'move'
      moveJet.helipadLandingRequested = false
      moveJet.groundLandingRequested = false
      moveJet.flightPlan = {
        x: (35 * 32) + 16,
        y: (22 * 32) + 16,
        stopRadius: 10,
        mode: 'manual',
        destinationTile: { x: 35, y: 22 }
      }

      attackJet.flightState = 'airborne'
      attackJet.altitude = Math.max(56, (attackJet.maxAltitude || 64) * 0.9)
      attackJet.commandIntent = 'attack'
      attackJet.target = target
      attackJet.rocketAmmo = 1
      attackJet.canFire = true

      return {
        groundedId: grounded.id,
        moveId: moveJet.id,
        attackId: attackJet.id,
        targetId: target.id,
        airstripId: airstrip.id
      }
    })

    expect(setup.error || '').toBe('')

    await page.waitForTimeout(4500)

    const mid = await page.evaluate(({ groundedId, moveId, airstripId }) => {
      const units = window.gameInstance.units
      const bullets = window.gameInstance.bullets || []
      const buildings = window.gameState.buildings || []
      const grounded = units.find(u => u.id === groundedId)
      const moveJet = units.find(u => u.id === moveId)
      const strip = buildings.find(b => b.id === airstripId)

      const f35Bombs = bullets.filter(b => b && b.originType === 'f35Bomb')

      return {
        groundedAmmo: grounded?.rocketAmmo,
        groundedState: grounded?.flightState,
        moveState: moveJet?.flightState,
        moveManual: moveJet?.manualFlightState,
        moveIntent: moveJet?.commandIntent,
        hasBomb: f35Bombs.length > 0,
        bombNoTrail: f35Bombs.every(b => b.noTrail === true && (!Array.isArray(b.trail) || b.trail.length <= 1)),
        reserved: Array.isArray(strip?.f22ReservedSlotUnitIds) ? strip.f22ReservedSlotUnitIds.filter(Boolean).length : 0
      }
    }, setup)

    expect(mid.groundedState).toBe('grounded')
    expect(mid.groundedAmmo).toBe(1)
    expect(mid.moveState).toBe('airborne')
    expect(mid.moveManual).not.toBe('land')
    expect(mid.moveIntent).toBe('move')
    expect(mid.hasBomb).toBeTruthy()
    expect(mid.bombNoTrail).toBeTruthy()

    await page.evaluate(({ moveId, attackId, airstripId }) => {
      const units = window.gameInstance.units
      const buildings = window.gameState.buildings || []
      const moveJet = units.find(u => u.id === moveId)
      const attackJet = units.find(u => u.id === attackId)
      const strip = buildings.find(b => b.id === airstripId)

      if (moveJet) {
        moveJet.target = null
        moveJet.rocketAmmo = 0
        moveJet.commandIntent = 'returnToBase'
      }
      if (attackJet) {
        attackJet.target = null
        attackJet.rocketAmmo = 0
        attackJet.commandIntent = 'returnToBase'
      }
      if (strip && Array.isArray(strip.f22ReservedSlotUnitIds)) {
        strip.f22ReservedSlotUnitIds.fill(null)
      }
    }, setup)

    await page.waitForTimeout(5000)

    const slots = await page.evaluate(({ moveId, attackId, airstripId }) => {
      const units = window.gameInstance.units
      const buildings = window.gameState.buildings || []
      const moveJet = units.find(u => u.id === moveId)
      const attackJet = units.find(u => u.id === attackId)
      const strip = buildings.find(b => b.id === airstripId)
      return {
        slotA: moveJet?.airstripParkingSlotIndex,
        slotB: attackJet?.airstripParkingSlotIndex,
        reservedA: strip?.f22ReservedSlotUnitIds?.[moveJet?.airstripParkingSlotIndex],
        reservedB: strip?.f22ReservedSlotUnitIds?.[attackJet?.airstripParkingSlotIndex]
      }
    }, setup)

    expect(Number.isInteger(slots.slotA)).toBeTruthy()
    expect(Number.isInteger(slots.slotB)).toBeTruthy()
    expect(slots.slotA).not.toBe(slots.slotB)
    expect(slots.reservedA).toBeTruthy()
    expect(slots.reservedB).toBeTruthy()
  })
})
