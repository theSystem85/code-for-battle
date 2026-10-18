import { expect, test } from '@playwright/test'

test.use({ deviceScaleFactor: 2 })

test('[E00073] combat keeps moving and firing, and fractional scrolling aligns terrain with sprites', async({ page }) => {
  const errors = []
  page.on('pageerror', error => {
    errors.push(error.message)
    console.log(`Combat pacing page error: ${error.message}`)
  })
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=11&size=100&players=4&heavyBattle=1&battleUnits=80&benchmarkDurationMs=60000&heavyBattleWarmupMs=0')
  await page.waitForFunction(() => window.gameState?.heavyBattleBenchmark && window.gameInstance?.gameLoop?.running)
  const activity = await page.evaluate(async() => {
    const initial = new Map(window.gameInstance.units.map(unit => [unit.id, { x: unit.x, y: unit.y, health: unit.health }]))
    const observed = { movement: false, firing: false, damage: false, explosion: false }
    const started = performance.now()
    await new Promise((resolve, reject) => {
      function step() {
        try {
          const game = window.gameInstance
          observed.movement ||= game.units.some(unit => {
            const before = initial.get(unit.id)
            return before && Math.hypot(unit.x - before.x, unit.y - before.y) > 1
          })
          observed.firing ||= game.gameLoop.bullets.length > 0
          observed.damage ||= game.units.some(unit => initial.has(unit.id) && unit.health < initial.get(unit.id).health)
          observed.explosion ||= window.gameState.explosions.some(explosion => !explosion.loop)
          if (Object.values(observed).every(Boolean) || performance.now() - started > 30000) resolve()
          else requestAnimationFrame(step)
        } catch (error) {
          reject(error)
        }
      }
      requestAnimationFrame(step)
    })
    return observed
  })
  expect(activity).toEqual({ movement: true, firing: true, damage: true, explosion: true })

  const alignment = await page.evaluate(async() => {
    const { getGameRenderer } = await import('/src/rendering.js')
    const { TILE_SIZE } = await import('/src/config.js')
    const game = window.gameInstance
    game.gameLoop.stop()
    const renderer = getGameRenderer()
    const ctx = game.gameLoop.canvasManager.gameCtx
    const mapGrid = game.gameLoop.mapGrid
    const factory = game.gameLoop.factories[0]
    const unit = game.units.find(candidate => candidate.health > 0 && !candidate.isAirUnit)
    // A stable visible pose isolates camera alignment from simulation motion.
    unit.x = factory.x * TILE_SIZE + TILE_SIZE * 5
    unit.y = factory.y * TILE_SIZE + TILE_SIZE * 5
    unit.tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    unit.tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
    const origin = { x: Math.max(0, factory.x * TILE_SIZE - 64), y: Math.max(0, factory.y * TILE_SIZE - 64) }
    const nativeDraw = ctx.drawImage
    const positions = []
    ctx.drawImage = function(...args) {
      const matrix = this.getTransform()
      const dx = args.length === 9 ? args[5] : args[1]
      const dy = args.length === 9 ? args[6] : args[2]
      positions.push({ x: matrix.a * dx + matrix.c * dy + matrix.e, y: matrix.b * dx + matrix.d * dy + matrix.f })
      return nativeDraw.apply(this, args)
    }
    const capture = (render, scroll) => {
      positions.length = 0
      render(scroll)
      return positions[0] || null
    }
    const renders = {
      terrain: scroll => renderer.mapRenderer.renderTiles(ctx, mapGrid, scroll, Math.floor(origin.x / TILE_SIZE), Math.floor(origin.y / TILE_SIZE), Math.floor(origin.x / TILE_SIZE) + 8, Math.floor(origin.y / TILE_SIZE) + 8, window.gameState, { skipWaterBase: true, skipWaterSot: true }),
      building: scroll => renderer.buildingRenderer.renderBuildingBase(ctx, factory, mapGrid, scroll),
      unit: scroll => renderer.unitRenderer.renderUnitBase(ctx, unit, scroll, ctx.canvas.clientWidth, ctx.canvas.clientHeight, true)
    }
    const result = {}
    try {
      for (const [name, render] of Object.entries(renders)) {
        const before = capture(render, { x: origin.x + 0.1, y: origin.y + 0.2 })
        const after = capture(render, { x: origin.x + 0.6, y: origin.y + 0.95 })
        result[name] = before && after ? { dx: after.x - before.x, dy: after.y - before.y } : null
      }
    } finally {
      ctx.drawImage = nativeDraw
    }
    return { layers: result, dpr: window.gameState.overlayCanvasPixelRatio || 1 }
  })
  for (const layer of Object.values(alignment.layers)) {
    expect(layer).not.toBeNull()
    expect(layer.dx).toBeCloseTo(-0.5 * alignment.dpr, 5)
    expect(layer.dy).toBeCloseTo(-0.75 * alignment.dpr, 5)
  }
  expect(errors).toEqual([])
})
