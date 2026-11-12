import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

for (const sourceType of ['ammunitionTruck', 'ammunitionFactory']) {
  for (const reverse of [false, true]) {
    test(`[E00257] mine layer services at ${sourceType} with ${reverse ? 'provider' : 'layer'} selected`, async({ page }) => {
      await prepareRegressionScenario(page, 219)
      const positions = await page.evaluate(({ sourceType, reverse }) => {
        const scenario = window.__regression
        const gs = window.gameState
        const layer = scenario.unit('mineLayer', scenario.human, 24, 24)
        const source = sourceType === 'ammunitionTruck'
          ? scenario.unit(sourceType, scenario.human, 28, 24)
          : scenario.building(sourceType, scenario.human, 28, 24)
        layer.remainingMines = 0
        const selected = reverse ? source : layer
        selected.selected = true
        window.selectedUnitsRef.splice(0, window.selectedUnitsRef.length, selected)
        const target = reverse ? layer : source
        const canvas = document.getElementById('gameCanvas').getBoundingClientRect()
        window.__mineService = { layer, source }
        const isBuilding = target === source && sourceType === 'ammunitionFactory'
        return {
          loader: layer.crew.loader,
          x: canvas.left + (isBuilding ? target.x * 32 + 16 : target.x + 16) - gs.scrollOffset.x,
          y: canvas.top + (isBuilding ? target.y * 32 + 16 : target.y + 16) - gs.scrollOffset.y
        }
      }, { sourceType, reverse })
      expect(positions.loader).toBe(true)
      await page.mouse.move(positions.x, positions.y)
      await expect(page.locator('#gameCanvas')).toHaveClass(/move-into-mode/)
      await page.mouse.click(positions.x, positions.y)
      const command = await page.evaluate(() => {
        const { layer, source } = window.__mineService
        return { path: layer.path.length, truckTarget: source.ammoResupplyTarget?.id === layer.id }
      })
      if (sourceType === 'ammunitionTruck') expect(command.truckTarget).toBe(true)
      else expect(command.path).toBeGreaterThan(0)
      await page.evaluate(() => { window.gameState.gamePaused = false })
      await expect.poll(() => page.evaluate(() => window.__mineService.layer.remainingMines), { timeout: 60000 }).toBeGreaterThan(0)
      const result = await page.evaluate(() => {
        const { layer, source } = window.__mineService
        return { withinCapacity: layer.remainingMines <= layer.mineCapacity, cargo: source.ammoCargo }
      })
      expect(result.withinCapacity).toBe(true)
      if (sourceType === 'ammunitionTruck') expect(result.cargo).toBeLessThan(500)
    })
  }
}
