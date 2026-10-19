import { test, expect } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

for (const density of [1, 3]) {
  test.describe(`factory handoff at DPR ${density}`, () => {
    test.use({ deviceScaleFactor: density })
    test('[E00205] hands a produced vehicle to normal navigation at the first clear tile', async({ page }) => {
      await prepareRegressionScenario(page, 211)
      const result = await page.evaluate(async() => {
        const { productionQueue } = await import('/src/productionQueue.js')
        const { updateFactoryExits, canInteractWithUnit } = await import('/src/game/factoryExit.js')
        const { findPath } = await import('/src/units.js')
        const gs = window.gameState
        const r = window.__regression
        const factory = r.building('vehicleFactory', r.human, 25, 24)
        factory.constructionFinished = true
        const item = { type: 'lightTank', button: document.createElement('button'), factoryId: factory.id, rallyPoint: { x: 23, y: 30 } }
        productionQueue.unitItems = [item]
        productionQueue.currentUnit = item
        productionQueue.completeCurrentUnitProduction()
        const units = window.gameInstance.units
        const unit = units.find(u => u.factoryExit?.factoryId === factory.id)
        if (!unit) throw new Error('Produced unit did not start a factory exit')
        const duration = unit.factoryExit.duration
        const start = { x: unit.x, y: unit.y }
        updateFactoryExits(units, gs.buildings, gs.mapGrid, gs.occupancyMap, duration - 1, false, findPath)
        const before = { exiting: Boolean(unit.factoryExit), interactive: canInteractWithUnit(unit) }
        updateFactoryExits(units, gs.buildings, gs.mapGrid, gs.occupancyMap, 1, false, findPath)
        const registry = window.gameInstance.renderer.buildingRenderer.preparedSpriteRegistry
        window.gameInstance.gameLoop.requestRender()
        return { duration, start, before, exiting: Boolean(unit.factoryExit), interactive: canInteractWithUnit(unit),
          tile: { x: unit.tileX, y: unit.tileY }, blocked: Boolean(gs.mapGrid[unit.tileY][unit.tileX].building),
          path: unit.path, target: unit.moveTarget, interior: Boolean(registry?.get('factoryExit:interior')),
          shadow: Boolean(registry?.get('factoryExit:shadow')) }
      })
      expect(result.duration).toBeLessThan(3800)
      expect(result.before).toEqual({ exiting: true, interactive: false })
      expect(result.exiting).toBe(false)
      expect(result.interactive).toBe(true)
      expect(result.tile).toEqual({ x: 25, y: 27 })
      expect(result.blocked).toBe(false)
      expect(result.target).toEqual({ x: 23, y: 30 })
      expect(result.path.length).toBeGreaterThan(0)
      expect(result.interior).toBe(false)
      expect(result.shadow).toBe(false)
    })
  })
}
