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
    await page.waitForFunction(() => {
      const glCanvas = document.getElementById('gameCanvasGL')
      return Boolean(glCanvas && (glCanvas.getContext('webgl2') || glCanvas.getContext('webgl')))
    })

    const setup = await page.evaluate((tileSize) => {
      const game = window.gameInstance
      const gameState = window.gameState
      const map = game?.mapGrid || gameState?.mapGrid
      const gameCanvas = document.getElementById('gameCanvas')
      const glCanvas = document.getElementById('gameCanvasGL')
      const gl = glCanvas?.getContext('webgl2') || glCanvas?.getContext('webgl')

      if (!map || !gameState || !gameCanvas || !glCanvas || !gl) {
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
        pixelRatio: window.devicePixelRatio || 1,
        glWidth: glCanvas.width,
        glHeight: glCanvas.height
      }
    }, TILE_SIZE)

    expect(setup.ok, `setup failed: ${setup.reason || 'unknown'}`).toBe(true)

    await page.waitForTimeout(500)

    const sampling = await page.evaluate((tileSize) => {
      const gameState = window.gameState
      const glCanvas = document.getElementById('gameCanvasGL')
      const gl = glCanvas?.getContext('webgl2') || glCanvas?.getContext('webgl')
      if (!gameState || !glCanvas || !gl) return null

      const map = window.gameInstance?.mapGrid || gameState.mapGrid
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
        const x = Math.min(glCanvas.width - 1, Math.max(0, Math.floor(point.x * ratio)))
        const yFromTop = Math.min(glCanvas.height - 1, Math.max(0, Math.floor(point.y * ratio)))
        const y = glCanvas.height - 1 - yFromTop
        const out = new Uint8Array(4)
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
        return Array.from(out)
      }

      const centerNow = readPixel(center)
      const shoreNow = readPixel(shore)
      return { centerNow, shoreNow }
    }, TILE_SIZE)

    expect(sampling).not.toBeNull()

    await page.waitForTimeout(450)

    const centerLater = await page.evaluate((tileSize) => {
      const gameState = window.gameState
      const glCanvas = document.getElementById('gameCanvasGL')
      const gl = glCanvas?.getContext('webgl2') || glCanvas?.getContext('webgl')
      const map = window.gameInstance?.mapGrid || gameState?.mapGrid
      if (!gameState || !glCanvas || !gl || !map) return null

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

      const ratio = window.devicePixelRatio || 1
      const centerX = (selected.x * tileSize - gameState.scrollOffset.x + tileSize * 0.5) * ratio
      const centerY = (selected.y * tileSize - gameState.scrollOffset.y + tileSize * 0.5) * ratio
      const px = Math.min(glCanvas.width - 1, Math.max(0, Math.floor(centerX)))
      const pyTop = Math.min(glCanvas.height - 1, Math.max(0, Math.floor(centerY)))
      const py = glCanvas.height - 1 - pyTop
      const out = new Uint8Array(4)
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
      return Array.from(out)
    }, TILE_SIZE)

    expect(centerLater).not.toBeNull()

    const centerDelta = sampling.centerNow.reduce((sum, value, idx) => sum + Math.abs(value - centerLater[idx]), 0)
    const shoreDelta = sampling.centerNow.reduce((sum, value, idx) => sum + Math.abs(value - sampling.shoreNow[idx]), 0)

    expect(centerDelta).toBeGreaterThan(8)
    expect(shoreDelta).toBeGreaterThan(12)
  })
})
