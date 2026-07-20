// rendering/mineRenderer.js - Render mine indicators and overlays
import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { getCanvasLogicalSize } from './renderingUtils.js'

/**
 * Render skull indicators for deployed mines
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {object} scrollOffset - Current scroll offset {x, y}
 */
export function renderMineIndicators(ctx, scrollOffset) {
  const mines = [
    ...(gameState.mines || []),
    ...(gameState.waterMines || [])
  ]
  if (mines.length === 0) {
    return
  }

  ctx.save()
  const { width: viewportWidth, height: viewportHeight } = getCanvasLogicalSize(ctx.canvas)

  mines.forEach(mine => {
    const screenX = mine.tileX * TILE_SIZE - scrollOffset.x + TILE_SIZE / 2
    const screenY = mine.tileY * TILE_SIZE - scrollOffset.y + TILE_SIZE / 2

    // Only render if on screen
    if (screenX < -TILE_SIZE || screenY < -TILE_SIZE ||
        screenX > viewportWidth + TILE_SIZE || screenY > viewportHeight + TILE_SIZE) {
      return
    }

    if (mine.waterMine) {
      const size = TILE_SIZE * 0.5
      ctx.globalAlpha = mine.active ? 0.45 : 0.25
      ctx.strokeStyle = '#9FE7FF'
      ctx.fillStyle = '#12394A'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(screenX, screenY, size * 0.34, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(screenX - size * 0.55, screenY)
      ctx.lineTo(screenX + size * 0.55, screenY)
      ctx.moveTo(screenX, screenY - size * 0.55)
      ctx.lineTo(screenX, screenY + size * 0.55)
      ctx.stroke()
      return
    }

    // Draw skull indicator (light gray, 70% transparency = 30% opacity)
    ctx.globalAlpha = 0.3
    ctx.fillStyle = '#CCCCCC'
    ctx.strokeStyle = '#888888'
    ctx.lineWidth = 1

    // Simple skull shape using basic geometry
    const size = TILE_SIZE * 0.6

    // Skull circle (head)
    ctx.beginPath()
    ctx.arc(screenX, screenY - size * 0.1, size * 0.35, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // Eye sockets
    ctx.fillStyle = '#222222'
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.arc(screenX - size * 0.15, screenY - size * 0.15, size * 0.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(screenX + size * 0.15, screenY - size * 0.15, size * 0.1, 0, Math.PI * 2)
    ctx.fill()

    // Nose triangle
    ctx.beginPath()
    ctx.moveTo(screenX, screenY)
    ctx.lineTo(screenX - size * 0.08, screenY + size * 0.1)
    ctx.lineTo(screenX + size * 0.08, screenY + size * 0.1)
    ctx.closePath()
    ctx.fill()

    // Teeth (simple rectangles)
    ctx.fillStyle = '#222222'
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(
        screenX + i * size * 0.12 - size * 0.05,
        screenY + size * 0.18,
        size * 0.08,
        size * 0.12
      )
    }

    // If mine is not yet armed, show a subtle pulsing indicator
    if (!mine.active) {
      const now = performance.now()
      const pulse = Math.sin(now / 200) * 0.3 + 0.7
      ctx.globalAlpha = pulse * 0.5
      ctx.strokeStyle = '#FFFF00'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(screenX, screenY, size * 0.5, 0, Math.PI * 2)
      ctx.stroke()
    }
  })

  ctx.restore()
}

/**
 * Render preview overlay for mine deployment area (checkerboard pattern)
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {object} area - Area bounds {startX, startY, endX, endY} in tile coordinates
 * @param {object} scrollOffset - Current scroll offset {x, y}
 */
export function renderMineDeploymentPreview(ctx, area, scrollOffset) {
  if (!area) return

  ctx.save()
  ctx.globalAlpha = 0.3
  ctx.fillStyle = '#FFFF00'

  const minX = Math.min(area.startX, area.endX)
  const maxX = Math.max(area.startX, area.endX)
  const minY = Math.min(area.startY, area.endY)
  const maxY = Math.max(area.startY, area.endY)

  // Draw checkerboard pattern
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Checkerboard: deploy on tiles where (x + y) is even
      if ((x + y) % 2 === 0) {
        const screenX = x * TILE_SIZE - scrollOffset.x
        const screenY = y * TILE_SIZE - scrollOffset.y
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE)
      }
    }
  }

  ctx.restore()
}

/**
 * Render preview overlay for mine sweeper sweep area
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {object} area - Area bounds {startX, startY, endX, endY} in tile coordinates
 * @param {object} scrollOffset - Current scroll offset {x, y}
 */
export function renderSweepAreaPreview(ctx, area, scrollOffset) {
  if (!area) return

  ctx.save()
  ctx.globalAlpha = 0.3
  ctx.fillStyle = '#FF8800' // Orange

  const minX = Math.min(area.startX, area.endX)
  const maxX = Math.max(area.startX, area.endX)
  const minY = Math.min(area.startY, area.endY)
  const maxY = Math.max(area.startY, area.endY)

  // Fill entire rectangular area
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const screenX = x * TILE_SIZE - scrollOffset.x
      const screenY = y * TILE_SIZE - scrollOffset.y
      ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE)
    }
  }

  ctx.restore()
}

/**
 * Render preview overlay for freeform sweep (Ctrl+paint)
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {Set} paintedTiles - Set of painted tile coordinates as "x,y" strings
 * @param {object} scrollOffset - Current scroll offset {x, y}
 */
export function renderFreeformSweepPreview(ctx, paintedTiles, scrollOffset) {
  if (!paintedTiles || paintedTiles.size === 0) return

  ctx.save()
  ctx.globalAlpha = 0.3
  ctx.fillStyle = '#FF8800' // Orange

  paintedTiles.forEach(tileKey => {
    const [x, y] = tileKey.split(',').map(Number)
    const screenX = x * TILE_SIZE - scrollOffset.x
    const screenY = y * TILE_SIZE - scrollOffset.y
    ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE)
  })

  ctx.restore()
}
