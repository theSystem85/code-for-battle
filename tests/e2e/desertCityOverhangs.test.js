import { test, expect } from '@playwright/test'

test('[E00223] desert cities use large ground footprints and preserve passable upper tiles through SSE export', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  const result = await page.evaluate(async() => {
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const { buildingData } = await import('/src/data/buildingData.js')
    const metadata = await (await fetch('/images/map/sprite_sheets/dtv4_city_sand.json')).json()
    const manager = new TextureManager()
    await manager.setIntegratedSpriteSheetConfig({ enabled: true, sheets: [{ sheetPath: metadata.sheetPath, metadata }], biomeTag: 'sand' })
    const groups = manager.integratedDecorationPools.sand.multi
    const map = Array.from({ length: 96 }, () => Array.from({ length: 96 }, () => ({ type: 'land', biome: 'sand' })))
    const layout = manager.getDecorationLayout(map)
    return { count: groups.length, factory: [buildingData.vehicleFactory.width, buildingData.vehicleFactory.height],
      minFootprint: groups.every(group => group.width >= 2 && group.height >= 2),
      towerFootprint: groups.filter(group => group.tagSet.has('skyscraper')).every(group => group.width >= 3 && group.height >= 3),
      towers: groups.filter(group => group.tagSet.has('skyscraper')).length,
      upperPassable: Object.values(metadata.tiles).filter(tile => tile.tags.includes('overhang')).every(tile => tile.tags.includes('passable') && !tile.tags.includes('impassable')),
      hasCities: layout.placements.some(placement => placement.group.cityVisual),
      prepared: groups.every(group => group.cityVisual.sprite?.density >= 1),
      native: metadata.extension.imports.every(item => item.bbox.width === item.renderRect.width && item.bbox.height === item.renderRect.height) }
  })
  expect(result).toMatchObject({ count: 20, factory: [3, 3], minFootprint: true, towerFootprint: true, towers: 8, upperPassable: true, hasCities: true, prepared: true, native: true })
  await page.locator('#sseSheetSelect').selectOption('images/map/sprite_sheets/dtv4_city_sand.webp')
  await page.waitForFunction(() => window.__SSE__.getState().targetSheetPath === 'images/map/sprite_sheets/dtv4_city_sand.webp')
  const exported = await page.evaluate(async() => {
    const { json } = await window.__SSE__.exportSheet({ lossless: false, quality: 85 })
    const upper = Object.values(json.tiles).filter(tile => tile.tags.includes('overhang'))
    return { layoutVersion: json.layoutVersion, count: json.extension.imports.length, upper: upper.length,
      validUpper: upper.every(tile => tile.tags.includes('passable') && !tile.tags.includes('impassable')) }
  })
  expect(exported).toMatchObject({ layoutVersion: 5, count: 20, validUpper: true })
  expect(exported.upper).toBeGreaterThan(30)
  const extraction = await page.evaluate(async() => {
    const sse = window.__SSE__
    await sse.newSheet({ name: 'desert-extraction-check', tileSize: 64, cols: 16, rows: 1 })
    await sse.setSizeRatio(1)
    await sse.loadSourceImage(await (await fetch('/images/map/sprite_sheets/sources/cities_sand_tall.webp')).blob())
    const sprites = await sse.extractAll({ alphaCutoff: 16, gap: 0, minArea: 1000 })
    return { count: sprites.length, native: sse.getState().sprites.every(sprite => sprite.bbox.width === sprite.renderRect.width && sprite.bbox.height === sprite.renderRect.height), rows: sse.getState().rows }
  })
  expect(extraction.count).toBe(20)
  expect(extraction.native).toBe(true)
  expect(extraction.rows).toBeGreaterThan(1)
})

test('[E00224] a moving unit can pass behind a tower, keeps its HUD above the image and accepts click and drag selection', async({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => Boolean(window.gameInstance?.renderer))
  const setup = await page.evaluate(async() => {
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const { UnitRenderer } = await import('/src/rendering/unitRenderer.js')
    const { renderCityOverhangs } = await import('/src/rendering/cityOverhangs.js')
    const { prepareCityBuildings, getCityBuildings, getAttackableCityAtWorld, applyCityDamage, isUnitUnderCityOverhang } = await import('/src/game/cityBuildings.js')
    const { buildOccupancyMap, findPath, updateUnitOccupancy } = await import('/src/units.js')
    const { gameState } = await import('/src/gameState.js')
    const { MouseHandler } = await import('/src/input/mouseHandler.js')
    const { SelectionManager } = await import('/src/input/selectionManager.js')
    const { handleLeftMouseDown, updateSelectionRectangle, handleLeftMouseUp } = await import('/src/input/mouseSelection.js')
    const metadata = await (await fetch('/images/map/sprite_sheets/dtv4_city_sand.json')).json()
    const manager = new TextureManager()
    await manager.setIntegratedSpriteSheetConfig({ enabled: true, sheets: [{ sheetPath: metadata.sheetPath, metadata }], biomeTag: 'sand' })
    const group = manager.integratedDecorationPools.sand.multi.find(group => group.tagSet.has('skyscraper') && group.cityVisual.rows >= 7)
    if (!group) throw new Error('Expected a genuinely tall generated skyscraper')
    const map = Array.from({ length: 24 }, () => Array.from({ length: 32 }, () => ({ type: 'land', biome: 'sand' })))
    const bx = 7, by = 12
    const placement = { group, anchorX: bx, anchorY: by, biome: 'sand' }
    const layout = { width: 32, height: 24, cells: new Array(32 * 24).fill(null), placements: [placement], cityStreets: [] }
    for (let y = 0; y < group.height; y++) for (let x = 0; x < group.width; x++) layout.cells[(by + y) * 32 + bx + x] = { ...placement, offsetX: x, offsetY: y }
    manager.getDecorationLayout = () => layout
    prepareCityBuildings(map, layout)
    Object.assign(gameState, { mapGrid: map, humanPlayer: 'player1', buildings: [], selectedUnits: [], unitWrecks: [], scrollOffset: { x: 0, y: 0 }, sellMode: false, repairMode: false, shadowOfWarEnabled: false, selectionHudMode: 'legacy', altKeyDown: false, ctrlKeyDown: false })
    const occupancy = buildOccupancyMap([], map, manager)
    gameState.occupancyMap = occupancy
    const waypoints = findPath({ x: bx - 2, y: by - 1 }, { x: bx + group.width + 2, y: by - 1 }, map, occupancy)
    // Movement follows the segments between the pathfinder's smoothed waypoints.
    const path = [waypoints[0]]
    for (let i = 1; i < waypoints.length; i++) {
      const start = waypoints[i - 1], end = waypoints[i]
      const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y))
      for (let step = 1; step <= steps; step++) path.push({ x: Math.round(start.x + (end.x - start.x) * step / steps), y: Math.round(start.y + (end.y - start.y) * step / steps) })
    }
    const sprite = group.cityVisual.sprite
    const spriteCtx = sprite.image.getContext('2d')
    const hiddenPoint = path.find(point => {
      if (point.x < bx || point.x >= bx + group.width) return false
      const x = Math.floor(((point.x - bx) * 32 + 16 - group.cityVisual.offsetX) * sprite.density)
      const y = Math.floor(((point.y - by) * 32 + 16 - group.cityVisual.offsetY) * sprite.density)
      return spriteCtx.getImageData(x, y, 1, 1).data[3] > 240
    })
    if (!hiddenPoint) throw new Error('The route must cross opaque upper-floor pixels')
    const unit = { id: 'behind-tower', owner: 'player1', type: 'tank_v1', health: 100, maxHealth: 100, x: path[0].x * 32, y: path[0].y * 32, tileX: path[0].x, tileY: path[0].y, selected: false, level: 0, crew: {} }
    occupancy[unit.tileY][unit.tileX]++
    let traversed = 0
    for (const point of path) {
      const oldX = unit.tileX, oldY = unit.tileY
      unit.x = point.x * 32
      unit.y = point.y * 32
      unit.tileX = Math.floor((unit.x + 16) / 32)
      unit.tileY = Math.floor((unit.y + 16) / 32)
      updateUnitOccupancy(unit, oldX, oldY, occupancy)
      traversed++
      if (point === hiddenPoint) break
    }
    const canvas = document.createElement('canvas')
    canvas.id = 'tall-city-fixture'
    canvas.width = 640
    canvas.height = 480
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:480px;z-index:99999;display:block'
    document.body.appendChild(canvas)
    const ctx = canvas.getContext('2d'), unitRenderer = new UnitRenderer()
    const centerX = unit.x + 16, centerY = unit.y + 16
    const pixel = () => [...ctx.getImageData(centerX, centerY, 1, 1).data]
    const clear = () => { ctx.fillStyle = '#30343a'; ctx.fillRect(0, 0, 640, 480) }
    clear()
    renderCityOverhangs(ctx, map, { x: 0, y: 0 }, 640, 480, gameState)
    const baseline = pixel()
    const redraw = () => {
      clear()
      ctx.fillStyle = '#ff00ff'
      ctx.fillRect(unit.x + 6, unit.y + 6, 20, 20)
      renderCityOverhangs(ctx, map, { x: 0, y: 0 }, 640, 480, gameState)
      unitRenderer.renderUnitOverlay(ctx, unit, { x: 0, y: 0 }, 640, 480, true)
    }
    clear()
    ctx.fillStyle = '#ff00ff'
    ctx.fillRect(unit.x + 6, unit.y + 6, 20, 20)
    renderCityOverhangs(ctx, map, { x: 0, y: 0 }, 640, 480, gameState)
    const covered = pixel()
    const beforeHud = ctx.getImageData(centerX - 14, unit.y - 10, 28, 4).data
    unitRenderer.renderUnitOverlay(ctx, unit, { x: 0, y: 0 }, 640, 480, true)
    const afterHud = ctx.getImageData(centerX - 14, unit.y - 10, 28, 4).data
    let hudPixels = 0
    for (let i = 0; i < beforeHud.length; i += 4) if (Math.abs(beforeHud[i] - afterHud[i]) + Math.abs(beforeHud[i + 1] - afterHud[i + 1]) + Math.abs(beforeHud[i + 2] - afterHud[i + 2]) > 50) hudPixels++
    const handler = new MouseHandler(), selection = new SelectionManager(), selected = []
    gameState.selectedUnits = selected
    const cursor = { updateCustomCursor() {}, setIsOverEnemy() {}, setIsOverFriendlyUnit() {} }
    const coordinates = event => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top } }
    canvas.addEventListener('mousedown', event => { const p = coordinates(event); handleLeftMouseDown(handler, event, p.x, p.y, canvas, selected, cursor) })
    canvas.addEventListener('mousemove', event => { if (event.buttons === 1) { const p = coordinates(event); updateSelectionRectangle(handler, p.x, p.y, cursor) } })
    canvas.addEventListener('mouseup', event => { handleLeftMouseUp(handler, event, [unit], [], map, selected, selection, {}, cursor); redraw() })
    window.tallCityFixture = { unit, selected, redraw, clearSelection() { unit.selected = false; selected.length = 0; selection.lastClickedUnit = null; redraw() }, destroy() { const building = getCityBuildings(map)[0]; applyCityDamage(building, building.maxHealth, map, gameState); redraw(); return { pixel: pixel(), occluded: isUnitUnderCityOverhang(map, unit) } } }
    return { centerX, centerY, baseline, covered, hudPixels, traversed, path: path.length,
      overheadWalkable: occupancy[hiddenPoint.y][hiddenPoint.x] === 1,
      baseBlocked: occupancy[by][bx] === 1,
      roofIsNotAttackTarget: getAttackableCityAtWorld(map, centerX, centerY) === null,
      occluded: isUnitUnderCityOverhang(map, unit) }
  })
  expect(setup.traversed).toBeGreaterThan(2)
  expect(setup.path).toBeGreaterThan(6)
  expect(setup.overheadWalkable).toBe(true)
  expect(setup.baseBlocked).toBe(true)
  expect(setup.roofIsNotAttackTarget).toBe(true)
  expect(setup.occluded).toBe(true)
  expect(setup.hudPixels).toBeGreaterThan(30)
  expect(Math.max(...setup.baseline.slice(0, 3).map((value, index) => Math.abs(value - setup.covered[index])))).toBeLessThan(8)
  await page.mouse.click(setup.centerX, setup.centerY)
  expect(await page.evaluate(() => window.tallCityFixture.selected.map(unit => unit.id))).toEqual(['behind-tower'])
  await page.evaluate(() => window.tallCityFixture.clearSelection())
  await page.mouse.move(setup.centerX - 24, setup.centerY - 24)
  await page.mouse.down()
  await page.mouse.move(setup.centerX + 24, setup.centerY + 24, { steps: 8 })
  await page.mouse.up()
  expect(await page.evaluate(() => window.tallCityFixture.selected.map(unit => unit.id))).toEqual(['behind-tower'])
  const destroyed = await page.evaluate(() => { window.tallCityFixture.clearSelection(); return window.tallCityFixture.destroy() })
  expect(destroyed.occluded).toBe(false)
  expect(destroyed.pixel.slice(0, 3)).toEqual([255, 0, 255])
})
