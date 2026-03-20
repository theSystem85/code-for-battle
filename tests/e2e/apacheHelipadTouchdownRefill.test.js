import { test, expect } from '@playwright/test'

test.describe('Apache helipad touchdown refill gating', () => {
  test('does not refill on touchdown and only starts rearming after a settled landing stop', async({ page }) => {
    test.setTimeout(120000)

    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto('/?seed=11')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.gameState?.gameStarted && window.cheatSystem && window.gameInstance?.units), { timeout: 30000 })

    const setup = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const buildings = gs.buildings
      const humanPlayer = gs.humanPlayer || 'player1'
      const knownBuildingIds = new Set(buildings.map(building => building.id))
      const knownUnitIds = new Set(units.map(unit => unit.id))

      gs.cursorX = 24 * 32
      gs.cursorY = 24 * 32
      window.cheatSystem.processCheatCode(`build helipad ${humanPlayer}`)

      const helipad = buildings.find(building => building.type === 'helipad' && building.owner === humanPlayer && !knownBuildingIds.has(building.id))
      if (!helipad) return { error: 'Failed to spawn helipad' }

      const padCenterX = (helipad.x + helipad.width / 2) * 32
      const padCenterY = (helipad.y + helipad.height / 2) * 32
      gs.cursorX = padCenterX
      gs.cursorY = padCenterY
      window.cheatSystem.processCheatCode(`apache 1 ${humanPlayer}`)

      const apache = units.find(unit => unit.type === 'apache' && unit.owner === humanPlayer && !knownUnitIds.has(unit.id))
      if (!apache) return { error: 'Failed to spawn apache' }

      helipad.ammo = helipad.maxAmmo || 250
      helipad.fuel = helipad.maxFuel || 5000

      apache.x = padCenterX - 16
      apache.y = padCenterY - 16
      apache.tileX = Math.floor(apache.x / 32)
      apache.tileY = Math.floor(apache.y / 32)
      apache.flightState = 'airborne'
      apache.altitude = 25
      apache.manualFlightState = 'land'
      apache.helipadLandingRequested = true
      apache.helipadTargetId = helipad.id
      apache.landedHelipadId = null
      apache.rocketAmmo = 0
      apache.gas = 0
      apache.canFire = false
      apache.movement = {
        ...(apache.movement || {}),
        isMoving: true,
        currentSpeed: 1,
        velocity: { x: 0, y: 0 }
      }

      return { apacheId: apache.id, helipadId: helipad.id }
    })

    expect(setup.error || null).toBeNull()

    await page.waitForTimeout(250)

    const midLanding = await page.evaluate(({ apacheId, helipadId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      const helipad = window.gameState.buildings.find(building => building.id === helipadId)
      if (!apache || !helipad) return null
      return {
        flightState: apache.flightState,
        landedHelipadId: apache.landedHelipadId,
        rocketAmmo: apache.rocketAmmo,
        gas: apache.gas,
        helipadAmmo: helipad.ammo,
        helipadFuel: helipad.fuel
      }
    }, setup)

    expect(midLanding).not.toBeNull()
    expect(midLanding.landedHelipadId).toBeNull()
    expect(midLanding.rocketAmmo).toBe(0)
    expect(midLanding.gas).toBe(0)

    await page.evaluate(({ apacheId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      if (!apache) return
      apache.flightState = 'grounded'
      apache.altitude = 0
      apache.movement.isMoving = false
      apache.movement.currentSpeed = 0
      apache.movement.velocity = { x: 0, y: 0 }
    }, setup)

    await page.waitForFunction(({ apacheId, helipadId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      const helipad = window.gameState.buildings.find(building => building.id === helipadId)
      return Boolean(apache && helipad && apache.landedHelipadId === helipadId && apache.rocketAmmo > 0 && apache.gas > 0 && helipad.ammo < helipad.maxAmmo)
    }, setup, { timeout: 10000 })

    const settled = await page.evaluate(({ apacheId, helipadId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      const helipad = window.gameState.buildings.find(building => building.id === helipadId)
      return {
        landedHelipadId: apache?.landedHelipadId,
        rocketAmmo: apache?.rocketAmmo,
        gas: apache?.gas,
        helipadAmmo: helipad?.ammo,
        helipadFuel: helipad?.fuel
      }
    }, setup)

    expect(settled.landedHelipadId).toBe(setup.helipadId)
    expect(settled.rocketAmmo).toBeGreaterThan(0)
    expect(settled.gas).toBeGreaterThan(0)
  })
})
