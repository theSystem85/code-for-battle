import { expect, test } from '@playwright/test'

test.describe('Airborne render layering', () => {
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

  test('renders airborne units after buildings and grounded units in the live frame pipeline', async({ page }) => {
    test.setTimeout(120000)

    await page.goto('/?seed=11')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      return Boolean(gs?.gameStarted && !gs.gamePaused && window.gameInstance?.units && window.cheatSystem)
    }, { timeout: 30000 })

    const setup = await page.evaluate(() => {
      const renderer = window.gameRenderer || window.renderer || window.gameInstance?.renderer
      const gs = window.gameState
      const units = window.gameInstance?.units || []
      const buildings = gs.buildings || []
      const humanPlayer = gs.humanPlayer || 'player1'
      if (!renderer?.unitRenderer || !renderer?.buildingRenderer || buildings.length === 0) {
        return { error: 'Renderer or buildings unavailable' }
      }

      const targetBuilding = buildings.find(building => building.owner === humanPlayer && building.health > 0)
      if (!targetBuilding) {
        return { error: 'No friendly building found for layering test' }
      }

      const knownUnitIds = new Set(units.map(unit => unit.id))
      gs.cursorX = (targetBuilding.x + 1) * 32
      gs.cursorY = (targetBuilding.y + 1) * 32
      window.cheatSystem.processCheatCode(`tank_v1 1 ${humanPlayer}`)
      window.cheatSystem.processCheatCode(`apache 1 ${humanPlayer}`)

      const spawned = units.filter(unit => !knownUnitIds.has(unit.id))
      const tank = spawned.find(unit => unit.type === 'tank_v1' && unit.owner === humanPlayer)
      const apache = spawned.find(unit => unit.type === 'apache' && unit.owner === humanPlayer)
      if (!tank || !apache) {
        return { error: 'Failed to spawn required units' }
      }

      const worldX = (targetBuilding.x + Math.max(1, (targetBuilding.width || 1) / 2)) * 32
      const worldY = (targetBuilding.y + Math.max(1, (targetBuilding.height || 1) / 2)) * 32

      tank.x = worldX
      tank.y = worldY
      tank.tileX = Math.floor(tank.x / 32)
      tank.tileY = Math.floor(tank.y / 32)
      tank.path = []
      tank.moveTarget = null
      tank.selected = false

      apache.x = worldX
      apache.y = worldY
      apache.tileX = Math.floor(apache.x / 32)
      apache.tileY = Math.floor(apache.y / 32)
      apache.path = []
      apache.moveTarget = null
      apache.flightState = 'airborne'
      apache.altitude = Math.max(apache.maxAltitude || 90, 90)
      apache.selected = false

      const order = []
      const originals = {
        renderBuildingBase: renderer.buildingRenderer.renderBuildingBase.bind(renderer.buildingRenderer),
        renderUnitBase: renderer.unitRenderer.renderUnitBase.bind(renderer.unitRenderer),
        renderUnitOverlay: renderer.unitRenderer.renderUnitOverlay.bind(renderer.unitRenderer)
      }

      renderer.buildingRenderer.renderBuildingBase = function wrappedRenderBuildingBase(ctx, building, mapGrid, scrollOffset) {
        if (building.id === targetBuilding.id) {
          order.push(`building:${building.id}`)
        }
        return originals.renderBuildingBase(ctx, building, mapGrid, scrollOffset)
      }

      renderer.unitRenderer.renderUnitBase = function wrappedRenderUnitBase(ctx, unit, scrollOffset, viewportWidth, viewportHeight) {
        if (unit.id === tank.id || unit.id === apache.id) {
          order.push(`unit-base:${unit.id}`)
        }
        return originals.renderUnitBase(ctx, unit, scrollOffset, viewportWidth, viewportHeight)
      }

      renderer.unitRenderer.renderUnitOverlay = function wrappedRenderUnitOverlay(ctx, unit, scrollOffset, viewportWidth, viewportHeight) {
        if (unit.id === tank.id || unit.id === apache.id) {
          order.push(`unit-overlay:${unit.id}`)
        }
        return originals.renderUnitOverlay(ctx, unit, scrollOffset, viewportWidth, viewportHeight)
      }

      window.__airborneRenderLayering = {
        buildingId: targetBuilding.id,
        tankId: tank.id,
        apacheId: apache.id,
        order
      }

      return {
        ok: true,
        buildingId: targetBuilding.id,
        tankId: tank.id,
        apacheId: apache.id
      }
    })

    expect(setup.error || null).toBeNull()

    const resultHandle = await page.waitForFunction(() => {
      const tracker = window.__airborneRenderLayering
      if (!tracker) return false

      const order = [...tracker.order]
      const buildingIndex = order.indexOf(`building:${tracker.buildingId}`)
      const tankBaseIndex = order.indexOf(`unit-base:${tracker.tankId}`)
      const tankOverlayIndex = order.indexOf(`unit-overlay:${tracker.tankId}`)
      const apacheBaseIndex = order.indexOf(`unit-base:${tracker.apacheId}`)
      const apacheOverlayIndex = order.indexOf(`unit-overlay:${tracker.apacheId}`)

      if ([buildingIndex, tankBaseIndex, tankOverlayIndex, apacheBaseIndex, apacheOverlayIndex].some(index => index === -1)) {
        return false
      }

      return {
        order,
        buildingIndex,
        tankBaseIndex,
        tankOverlayIndex,
        apacheBaseIndex,
        apacheOverlayIndex,
        airborneDrawnLast: apacheBaseIndex > buildingIndex && apacheBaseIndex > tankBaseIndex && apacheBaseIndex > tankOverlayIndex,
        airborneOverlayAfterBase: apacheOverlayIndex > apacheBaseIndex
      }
    }, { timeout: 30000 })

    const result = await resultHandle.jsonValue()

    expect(result.airborneDrawnLast, `Unexpected render order: ${result.order.join(' -> ')}`).toBe(true)
    expect(result.airborneOverlayAfterBase, `Unexpected render order: ${result.order.join(' -> ')}`).toBe(true)
    expect(consoleErrors, `Console errors encountered:\n${consoleErrors.join('\n')}`).toEqual([])
  })
})
