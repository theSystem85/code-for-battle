import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })

test('[E00272] draws land and the building footprint on the first frame after a Retina canvas reset', async({ page }) => {
  await page.route('**/retina-canvas-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><canvas id="gameCanvas"></canvas>'
  }))
  await page.goto('/retina-canvas-fixture')
  const result = await page.evaluate(async() => {
    const { getGameRenderer, renderGame } = await import('/src/rendering.js')
    const { publishCanvasViewport } = await import('/src/rendering/prepared/canvasViewportRegistry.js')
    const { gameState } = await import('/src/gameState.js')
    const { TILE_SIZE } = await import('/src/config.js')
    const renderer = getGameRenderer()
    const canvas = document.getElementById('gameCanvas')
    const density = 2
    const logicalWidth = 428
    const logicalHeight = 926
    canvas.width = logicalWidth * density
    canvas.height = logicalHeight * density
    publishCanvasViewport(canvas, { logicalWidth, logicalHeight, density })
    const ctx = canvas.getContext('2d')
    ctx.setTransform(density, 0, 0, density, 0, 0)

    const buildingArt = document.createElement('canvas')
    buildingArt.width = buildingArt.height = TILE_SIZE * 2 * density
    const art = buildingArt.getContext('2d')
    art.fillStyle = '#00ffff'
    art.fillRect(0, 0, buildingArt.width, buildingArt.height)
    renderer.buildingRenderer.setPreparedSpriteRegistry({
      get: key => key === 'building:powerPlant:base' ? { image: buildingArt } : null
    })
    renderer.textureManager.loadingStarted = true
    const grid = Array.from({ length: 40 }, () => Array.from({ length: 24 }, () => ({ type: 'land' })))
    const building = {
      type: 'powerPlant', owner: gameState.humanPlayer, isBuilding: true, health: 100, maxHealth: 100,
      x: 7, y: 14, width: 2, height: 2, constructionFinished: true
    }
    const scroll = { x: 48, y: 160 }
    const left = building.x * TILE_SIZE - scroll.x
    const top = building.y * TILE_SIZE - scroll.y
    const right = left + building.width * TILE_SIZE
    const bottom = top + building.height * TILE_SIZE

    // Assigning the same backing width clears the transform without an event.
    canvas.width = logicalWidth * density
    const transformBefore = ctx.getTransform().a
    renderGame(ctx, canvas, grid, [], [], [], [building], scroll, false, null, null, gameState)
    const sample = (x, y) => Array.from(ctx.getImageData(x * density, y * density, 1, 1).data)
    return {
      transformBefore,
      transformAfter: ctx.getTransform().a,
      building: [sample(left + 1, top + 1), sample(right - 1, bottom - 1)],
      land: [sample(left - 1, top + 1), sample(right + 1, bottom - 1), sample(420, 910)]
    }
  })

  expect(result.transformBefore).toBe(1)
  expect(result.transformAfter).toBe(2)
  expect(result.building).toEqual([[0, 255, 255, 255], [0, 255, 255, 255]])
  for (const pixel of result.land) {
    expect(pixel[3]).toBe(255)
    expect(pixel.slice(0, 3).some(channel => channel > 0)).toBe(true)
    expect(pixel).not.toEqual([0, 255, 255, 255])
  }
})
