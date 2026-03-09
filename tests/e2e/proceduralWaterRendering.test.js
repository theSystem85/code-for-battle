import { test, expect } from '@playwright/test'

const TILE_SIZE = 20

test.describe('Procedural WebGL water rendering', () => {
  test('animates water and applies shoreline blending without tile textures', async({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebGL rendering checks run on Chromium only')

    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto('/?seed=9')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    const setup = await page.evaluate((tileSize) => {
      const game = window.gameInstance
      const gameState = window.gameState
      const map = game?.mapGrid || gameState?.mapGrid
      const gameCanvas = document.getElementById('gameCanvas')
      const glCanvas = document.getElementById('gameCanvasGL')
      const gl = glCanvas?.getContext('webgl2') || glCanvas?.getContext('webgl')

      if (!map || !gameState || !gameCanvas) {
        return { ok: false, reason: 'missing-runtime' }
      }

      const isWater = (x, y) => map?.[y]?.[x]?.type === 'water'
      let target = null

      for (let y = 1; y < map.length - 1 && !target; y++) {
        for (let x = 1; x < map[0].length - 1 && !target; x++) {
          if (!isWater(x, y)) continue
          const neighbors = [
            { dir: 'top', x, y: y - 1 },
            { dir: 'right', x: x + 1, y },
            { dir: 'bottom', x, y: y + 1 },
            { dir: 'left', x: x - 1, y }
          ]
          const shoreNeighbor = neighbors.find(n => !isWater(n.x, n.y))
          if (shoreNeighbor) {
            target = { x, y, shoreDir: shoreNeighbor.dir }
          }
        }
      }

      if (!target) {
        return { ok: false, reason: 'no-water-shore-found' }
      }

      const cssWidth = gameCanvas.clientWidth || gameCanvas.width
      const cssHeight = gameCanvas.clientHeight || gameCanvas.height
      const mapPixelWidth = map[0].length * tileSize
      const mapPixelHeight = map.length * tileSize

      gameState.scrollOffset.x = Math.max(0, Math.min(target.x * tileSize - (cssWidth / 2), mapPixelWidth - cssWidth))
      gameState.scrollOffset.y = Math.max(0, Math.min(target.y * tileSize - (cssHeight / 2), mapPixelHeight - cssHeight))
      game?.gameLoop?.requestRender?.()

      return {
        ok: true,
        target,
        backend: gl ? 'webgl' : '2d'
      }
    }, TILE_SIZE)

    expect(setup.ok, `setup failed: ${setup.reason || 'unknown'}`).toBe(true)

    await page.waitForTimeout(500)

    const sampling = await page.evaluate((tileSize) => {
      const game = window.gameInstance
      const gameState = window.gameState
      const map = game?.mapGrid || gameState?.mapGrid
      const canvas = document.getElementById('gameCanvas')
      const ctx = canvas?.getContext('2d')
      const glCanvas = document.getElementById('gameCanvasGL')
      const gl = glCanvas?.getContext('webgl2') || glCanvas?.getContext('webgl')
      if (!gameState || !map || !canvas || !ctx) return null

      const isWater = (x, y) => map?.[y]?.[x]?.type === 'water'
      let selected = null
      for (let y = 1; y < map.length - 1 && !selected; y++) {
        for (let x = 1; x < map[0].length - 1 && !selected; x++) {
          if (!isWater(x, y)) continue
          const neighbors = [
            { dir: 'top', x, y: y - 1 },
            { dir: 'right', x: x + 1, y },
            { dir: 'bottom', x, y: y + 1 },
            { dir: 'left', x: x - 1, y }
          ]
          const shore = neighbors.find(n => !isWater(n.x, n.y))
          if (shore) selected = { x, y, shoreDir: shore.dir }
        }
      }
      if (!selected) return null

      const ratio = window.devicePixelRatio || 1
      const tileOriginX = selected.x * tileSize - gameState.scrollOffset.x
      const tileOriginY = selected.y * tileSize - gameState.scrollOffset.y

      const center = { x: tileOriginX + tileSize * 0.5, y: tileOriginY + tileSize * 0.5 }
      const shoreLocal = {
        top: { x: tileSize * 0.5, y: tileSize * 0.12 },
        right: { x: tileSize * 0.88, y: tileSize * 0.5 },
        bottom: { x: tileSize * 0.5, y: tileSize * 0.88 },
        left: { x: tileSize * 0.12, y: tileSize * 0.5 }
      }[selected.shoreDir]
      const shore = { x: tileOriginX + shoreLocal.x, y: tileOriginY + shoreLocal.y }

      const readPixel = (point) => {
        const x = Math.max(0, Math.floor(point.x * ratio))
        const yFromTop = Math.max(0, Math.floor(point.y * ratio))
        if (glCanvas && gl) {
          const px = Math.min(glCanvas.width - 1, x)
          const py = glCanvas.height - 1 - Math.min(glCanvas.height - 1, yFromTop)
          const out = new Uint8Array(4)
          gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
          return Array.from(out)
        }

        if (x >= canvas.width || yFromTop >= canvas.height) return null
        return Array.from(ctx.getImageData(x, yFromTop, 1, 1).data)
      }

      const centerNow = readPixel(center)
      const shoreNow = readPixel(shore)
      return { centerNow, shoreNow }
    }, TILE_SIZE)

    expect(sampling).not.toBeNull()

    await page.waitForTimeout(450)

    const centerLater = await page.evaluate(async(tileSize) => {
      const game = window.gameInstance
      const gameState = window.gameState
      const map = game?.mapGrid || gameState?.mapGrid
      const canvas = document.getElementById('gameCanvas')
      const ctx = canvas?.getContext('2d')
      const glCanvas = document.getElementById('gameCanvasGL')
      const gl = glCanvas?.getContext('webgl2') || glCanvas?.getContext('webgl')
      if (!gameState || !map || !canvas || !ctx) return null

      const isWater = (x, y) => map?.[y]?.[x]?.type === 'water'
      let selected = null
      for (let y = 1; y < map.length - 1 && !selected; y++) {
        for (let x = 1; x < map[0].length - 1 && !selected; x++) {
          if (!isWater(x, y)) continue
          const neighbors = [
            { x, y: y - 1 },
            { x: x + 1, y },
            { x, y: y + 1 },
            { x: x - 1, y }
          ]
          if (neighbors.some(n => !isWater(n.x, n.y))) {
            selected = { x, y }
          }
        }
      }
      if (!selected) return null

      game?.gameLoop?.requestRender?.()
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

      const ratio = window.devicePixelRatio || 1
      const x = Math.max(0, Math.floor((selected.x * tileSize - gameState.scrollOffset.x + tileSize * 0.5) * ratio))
      const yTop = Math.max(0, Math.floor((selected.y * tileSize - gameState.scrollOffset.y + tileSize * 0.5) * ratio))

      if (glCanvas && gl) {
        const px = Math.min(glCanvas.width - 1, x)
        const py = glCanvas.height - 1 - Math.min(glCanvas.height - 1, yTop)
        const out = new Uint8Array(4)
        gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
        return Array.from(out)
      }

      if (x >= canvas.width || yTop >= canvas.height) return null
      return Array.from(ctx.getImageData(x, yTop, 1, 1).data)
    }, TILE_SIZE)

    expect(centerLater).not.toBeNull()

    const parallaxCheck = await page.evaluate((tileSize) => {
      const game = window.gameInstance
      const gameState = window.gameState
      const canvas = document.getElementById('gameCanvas')
      const ctx = canvas?.getContext('2d')
      const glCanvas = document.getElementById('gameCanvasGL')
      const gl = glCanvas?.getContext('webgl2') || glCanvas?.getContext('webgl')
      const map = game?.mapGrid || gameState?.mapGrid
      if (!game || !gameState || !map || !canvas || !ctx) return null

      const isWater = (x, y) => map?.[y]?.[x]?.type === 'water'
      let target = null
      for (let y = 2; y < map.length - 2 && !target; y++) {
        for (let x = 2; x < map[0].length - 2 && !target; x++) {
          if (isWater(x, y) && isWater(x + 1, y) && isWater(x, y + 1)) {
            target = { x, y }
          }
        }
      }
      if (!target) return null

      const ratio = window.devicePixelRatio || 1
      const readAtWorld = () => {
        const x = Math.max(0, Math.floor((target.x * tileSize - gameState.scrollOffset.x + tileSize * 0.5) * ratio))
        const yTop = Math.max(0, Math.floor((target.y * tileSize - gameState.scrollOffset.y + tileSize * 0.5) * ratio))
        if (glCanvas && gl) {
          const px = Math.min(glCanvas.width - 1, x)
          const py = glCanvas.height - 1 - Math.min(glCanvas.height - 1, yTop)
          const out = new Uint8Array(4)
          gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
          return Array.from(out)
        }

        if (x >= canvas.width || yTop >= canvas.height) return null
        return Array.from(ctx.getImageData(x, yTop, 1, 1).data)
      }

      const before = readAtWorld()
      gameState.scrollOffset.x = Math.max(0, gameState.scrollOffset.x + tileSize)
      game?.gameLoop?.requestRender?.()
      return new Promise(resolve => {
        requestAnimationFrame(() => {
          const after = readAtWorld()
          resolve({ before, after })
        })
      })
    }, TILE_SIZE)

    expect(parallaxCheck).not.toBeNull()

    const zoomConfigCheck = await page.evaluate(async(tileSize) => {
      const configModule = await import('/src/config.js')
      const renderingModule = await import('/src/rendering.js')
      const game = window.gameInstance
      const gameState = window.gameState
      const canvas = document.getElementById('gameCanvas')
      const ctx = canvas?.getContext('2d')
      const glCanvas = document.getElementById('gameCanvasGL')
      const gl = glCanvas?.getContext('webgl2') || glCanvas?.getContext('webgl')
      const map = game?.mapGrid || gameState?.mapGrid
      if (!configModule || !game || !gameState || !map || !canvas || !ctx) return null

      const defaultZoom = configModule.WATER_EFFECT_ZOOM
      const isWater = (x, y) => map?.[y]?.[x]?.type === 'water'
      let target = null
      for (let y = 2; y < map.length - 2 && !target; y++) {
        for (let x = 2; x < map[0].length - 2 && !target; x++) {
          if (isWater(x, y)) {
            target = { x, y }
          }
        }
      }
      if (!target) return null

      const ratio = window.devicePixelRatio || 1
      const readAt = () => {
        const x = Math.max(0, Math.floor((target.x * tileSize - gameState.scrollOffset.x + tileSize * 0.5) * ratio))
        const yTop = Math.max(0, Math.floor((target.y * tileSize - gameState.scrollOffset.y + tileSize * 0.5) * ratio))
        if (glCanvas && gl) {
          const px = Math.min(glCanvas.width - 1, x)
          const py = glCanvas.height - 1 - Math.min(glCanvas.height - 1, yTop)
          const out = new Uint8Array(4)
          gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
          return Array.from(out)
        }

        if (x >= canvas.width || yTop >= canvas.height) return null
        return Array.from(ctx.getImageData(x, yTop, 1, 1).data)
      }

      const before = readAt()
      const updatedZoom = configModule.setWaterEffectZoom(1)
      renderingModule.getMapRenderer?.()?.invalidateAllChunks?.()
      game?.gameLoop?.requestRender?.()

      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const after = readAt()

      const restoredZoom = configModule.setWaterEffectZoom(defaultZoom)
      renderingModule.getMapRenderer?.()?.invalidateAllChunks?.()
      game?.gameLoop?.requestRender?.()

      return { before, after, defaultZoom, updatedZoom, restoredZoom }
    }, TILE_SIZE)

    expect(zoomConfigCheck).not.toBeNull()

    const sotContinuity = await page.evaluate((tileSize) => {
      const game = window.gameInstance
      const gameState = window.gameState
      const map = game?.mapGrid || gameState?.mapGrid
      const canvas = document.getElementById('gameCanvas')
      const ctx = canvas?.getContext('2d')
      if (!game || !gameState || !map || !ctx || !canvas) return null

      gameState.useIntegratedSpriteSheetMode = true
      game?.gameLoop?.requestRender?.()

      const isWater = (x, y) => map?.[y]?.[x]?.type === 'water'
      let target = null
      for (let y = 1; y < map.length - 1 && !target; y++) {
        for (let x = 1; x < map[0].length - 1 && !target; x++) {
          const land = map?.[y]?.[x]
          if (!land || (land.type !== 'land' && land.type !== 'street')) continue

          if (isWater(x, y - 1) && isWater(x - 1, y)) {
            target = { x, y, orientation: 'top-left', waterX: x - 1, waterY: y - 1 }
          } else if (isWater(x + 1, y) && isWater(x, y - 1)) {
            target = { x, y, orientation: 'top-right', waterX: x + 1, waterY: y - 1 }
          } else if (isWater(x - 1, y) && isWater(x, y + 1)) {
            target = { x, y, orientation: 'bottom-left', waterX: x - 1, waterY: y + 1 }
          } else if (isWater(x + 1, y) && isWater(x, y + 1)) {
            target = { x, y, orientation: 'bottom-right', waterX: x + 1, waterY: y + 1 }
          }
        }
      }
      if (!target) return null

      const cssWidth = canvas.clientWidth || canvas.width
      const cssHeight = canvas.clientHeight || canvas.height
      const mapPixelWidth = map[0].length * tileSize
      const mapPixelHeight = map.length * tileSize
      gameState.scrollOffset.x = Math.max(0, Math.min(target.x * tileSize - (cssWidth / 2), mapPixelWidth - cssWidth))
      gameState.scrollOffset.y = Math.max(0, Math.min(target.y * tileSize - (cssHeight / 2), mapPixelHeight - cssHeight))
      game?.gameLoop?.requestRender?.()

      const ratio = window.devicePixelRatio || 1
      const read = (worldX, worldY) => {
        const x = Math.floor((worldX - gameState.scrollOffset.x) * ratio)
        const y = Math.floor((worldY - gameState.scrollOffset.y) * ratio)
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null
        return Array.from(ctx.getImageData(x, y, 1, 1).data)
      }

      const cornerOffset = {
        'top-left': { x: 2, y: 2 },
        'top-right': { x: tileSize - 2, y: 2 },
        'bottom-left': { x: 2, y: tileSize - 2 },
        'bottom-right': { x: tileSize - 2, y: tileSize - 2 }
      }[target.orientation]

      const sotPixel = read(target.x * tileSize + cornerOffset.x, target.y * tileSize + cornerOffset.y)
      const waterPixel = read(target.waterX * tileSize + tileSize * 0.5, target.waterY * tileSize + tileSize * 0.5)
      gameState.useIntegratedSpriteSheetMode = false
      game?.gameLoop?.requestRender?.()
      if (!sotPixel || !waterPixel) return null
      return { sotPixel, waterPixel }
    }, TILE_SIZE)

    expect(sotContinuity).not.toBeNull()

    const activeSotContinuity = await page.evaluate((tileSize) => {
      const game = window.gameInstance
      const gameState = window.gameState
      const map = game?.mapGrid || gameState?.mapGrid
      const canvas = document.getElementById('gameCanvas')
      const ctx = canvas?.getContext('2d')
      const glCanvas = document.getElementById('gameCanvasGL')
      const gl = glCanvas?.getContext('webgl2') || glCanvas?.getContext('webgl')
      if (!game || !gameState || !map || !canvas || !ctx) return null

      const isWater = (x, y) => map?.[y]?.[x]?.type === 'water'
      let target = null
      for (let y = 1; y < map.length - 1 && !target; y++) {
        for (let x = 1; x < map[0].length - 1 && !target; x++) {
          const land = map?.[y]?.[x]
          if (!land || (land.type !== 'land' && land.type !== 'street')) continue

          if (isWater(x, y - 1) && isWater(x - 1, y)) {
            target = { x, y, orientation: 'top-left', waterX: x - 1, waterY: y - 1 }
          } else if (isWater(x + 1, y) && isWater(x, y - 1)) {
            target = { x, y, orientation: 'top-right', waterX: x + 1, waterY: y - 1 }
          } else if (isWater(x - 1, y) && isWater(x, y + 1)) {
            target = { x, y, orientation: 'bottom-left', waterX: x - 1, waterY: y + 1 }
          } else if (isWater(x + 1, y) && isWater(x, y + 1)) {
            target = { x, y, orientation: 'bottom-right', waterX: x + 1, waterY: y + 1 }
          }
        }
      }
      if (!target) return null

      const cssWidth = (glCanvas?.clientWidth || gameCanvasWidth(canvas, glCanvas))
      const cssHeight = (glCanvas?.clientHeight || gameCanvasHeight(canvas, glCanvas))
      const mapPixelWidth = map[0].length * tileSize
      const mapPixelHeight = map.length * tileSize
      gameState.scrollOffset.x = Math.max(0, Math.min(target.x * tileSize - (cssWidth / 2), mapPixelWidth - cssWidth))
      gameState.scrollOffset.y = Math.max(0, Math.min(target.y * tileSize - (cssHeight / 2), mapPixelHeight - cssHeight))
      game?.gameLoop?.requestRender?.()

      const ratio = window.devicePixelRatio || 1
      const read = (worldX, worldY) => {
        const x = Math.floor((worldX - gameState.scrollOffset.x) * ratio)
        const yTop = Math.floor((worldY - gameState.scrollOffset.y) * ratio)
        if (x < 0 || yTop < 0) return null
        if (glCanvas && gl) {
          if (x >= glCanvas.width || yTop >= glCanvas.height) return null
          const out = new Uint8Array(4)
          gl.readPixels(x, glCanvas.height - 1 - yTop, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
          return Array.from(out)
        }

        if (x >= canvas.width || yTop >= canvas.height) return null
        return Array.from(ctx.getImageData(x, yTop, 1, 1).data)
      }

      const cornerOffset = {
        'top-left': { x: 2, y: 2 },
        'top-right': { x: tileSize - 2, y: 2 },
        'bottom-left': { x: 2, y: tileSize - 2 },
        'bottom-right': { x: tileSize - 2, y: tileSize - 2 }
      }[target.orientation]

      const sotPixel = read(target.x * tileSize + cornerOffset.x, target.y * tileSize + cornerOffset.y)
      const waterPixel = read(target.waterX * tileSize + tileSize * 0.5, target.waterY * tileSize + tileSize * 0.5)
      if (!sotPixel || !waterPixel) return null
      return { sotPixel, waterPixel }

      function gameCanvasWidth(baseCanvas, gpuCanvas) {
        if (gpuCanvas) return gpuCanvas.width / (window.devicePixelRatio || 1)
        return baseCanvas.clientWidth || baseCanvas.width / (window.devicePixelRatio || 1)
      }

      function gameCanvasHeight(baseCanvas, gpuCanvas) {
        if (gpuCanvas) return gpuCanvas.height / (window.devicePixelRatio || 1)
        return baseCanvas.clientHeight || baseCanvas.height / (window.devicePixelRatio || 1)
      }
    }, TILE_SIZE)

    expect(activeSotContinuity).not.toBeNull()

    const centerDelta = sampling.centerNow.reduce((sum, value, idx) => sum + Math.abs(value - centerLater[idx]), 0)
    const shoreDelta = sampling.centerNow.reduce((sum, value, idx) => sum + Math.abs(value - sampling.shoreNow[idx]), 0)

    const parallaxDelta = parallaxCheck.before.reduce((sum, value, idx) => sum + Math.abs(value - parallaxCheck.after[idx]), 0)
    const zoomDelta = zoomConfigCheck.before.reduce((sum, value, idx) => sum + Math.abs(value - zoomConfigCheck.after[idx]), 0)
    const sotDelta = sotContinuity.sotPixel.reduce((sum, value, idx) => sum + Math.abs(value - sotContinuity.waterPixel[idx]), 0)
    const activeSotDelta = activeSotContinuity.sotPixel.reduce((sum, value, idx) => sum + Math.abs(value - activeSotContinuity.waterPixel[idx]), 0)

    expect(zoomConfigCheck.defaultZoom).toBeGreaterThan(1)
    expect(zoomConfigCheck.updatedZoom).toBe(1)
    expect(zoomConfigCheck.restoredZoom).toBe(zoomConfigCheck.defaultZoom)
    expect(activeSotDelta).toBeLessThan(140)
    expect(sotDelta).toBeLessThan(140)

    if (setup.backend === 'webgl') {
      expect(centerDelta).toBeGreaterThan(8)
      expect(shoreDelta).toBeGreaterThan(8)
      expect(parallaxDelta).toBeLessThan(18)
      expect(zoomDelta).toBeGreaterThan(10)
    }
  })
})
