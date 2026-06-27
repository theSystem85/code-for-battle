// rendering/renderingUtils.js
import { TILE_SIZE } from '../config.js'
import { gameRandom } from '../utils/gameRandom.js'

// Get device pixel ratio for high-DPI rendering
export const getDevicePixelRatio = () => {
  return (typeof window !== 'undefined' && window.devicePixelRatio) || 1
}

export function getCanvasPixelRatio(canvas, fallback = getDevicePixelRatio()) {
  if (!canvas) {
    return fallback || 1
  }

  const bounds = typeof canvas.getBoundingClientRect === 'function'
    ? canvas.getBoundingClientRect()
    : null
  const logicalWidth = bounds?.width || canvas.clientWidth || 0
  if (logicalWidth > 0 && canvas.width > 0) {
    return canvas.width / logicalWidth
  }

  return fallback || 1
}

export function getCanvasLogicalSize(canvas) {
  if (!canvas) {
    return { width: 0, height: 0, pixelRatio: 1 }
  }

  const bounds = typeof canvas.getBoundingClientRect === 'function'
    ? canvas.getBoundingClientRect()
    : null
  const pixelRatio = getCanvasPixelRatio(canvas)
  return {
    width: bounds?.width || canvas.clientWidth || (canvas.width / pixelRatio) || canvas.width || 0,
    height: bounds?.height || canvas.clientHeight || (canvas.height / pixelRatio) || canvas.height || 0,
    pixelRatio
  }
}

// Tesla Coil Lightning Rendering
export function drawTeslaCoilLightning(gameCtx, fromX, fromY, toX, toY, scatterRadius = TILE_SIZE, colorStops = [
  { color: 'rgba(255,255,128,0.95)', pos: 0 },
  { color: 'rgba(0,200,255,0.7)', pos: 0.5 },
  { color: 'rgba(255,255,255,1)', pos: 1 }
], boltWidth = 5) {
  // Draw a jagged, glowing lightning bolt with some randomness
  const numSegments = 12
  const points = [{ x: fromX, y: fromY }]
  for (let i = 1; i < numSegments; i++) {
    const t = i / numSegments
    const x = fromX + (toX - fromX) * t + (gameRandom() - 0.5) * 18
    const y = fromY + (toY - fromY) * t + (gameRandom() - 0.5) * 18
    points.push({ x, y })
  }
  points.push({ x: toX, y: toY })

  // Glow effect (keep shadow for glow only)
  for (let glow = 18; glow > 0; glow -= 6) {
    gameCtx.save()
    gameCtx.strokeStyle = 'rgba(255,255,128,0.18)' // Increased alpha for visibility
    gameCtx.shadowColor = '#fff'
    gameCtx.shadowBlur = glow
    gameCtx.lineWidth = boltWidth + glow
    gameCtx.beginPath()
    gameCtx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      gameCtx.lineTo(points[i].x, points[i].y)
    }
    gameCtx.stroke()
    gameCtx.restore()
  }

  // Main bolt (NO shadow, solid gradient)
  gameCtx.save()
  const grad = gameCtx.createLinearGradient(fromX, fromY, toX, toY)
  colorStops.forEach(stop => grad.addColorStop(stop.pos, stop.color))
  gameCtx.strokeStyle = grad
  gameCtx.shadowBlur = 0
  gameCtx.lineWidth = boltWidth
  gameCtx.beginPath()
  gameCtx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    gameCtx.lineTo(points[i].x, points[i].y)
  }
  gameCtx.stroke()
  gameCtx.restore()

  // Impact scatter
  for (let i = 0; i < 4; i++) {
    const angle = gameRandom() * Math.PI * 2
    const r = scatterRadius * (0.5 + gameRandom() * 0.5)
    const ex = toX + Math.cos(angle) * r
    const ey = toY + Math.sin(angle) * r
    gameCtx.save()
    gameCtx.strokeStyle = 'rgba(0,200,255,0.7)'
    gameCtx.lineWidth = 2
    gameCtx.beginPath()
    gameCtx.moveTo(toX, toY)
    gameCtx.lineTo(ex, ey)
    gameCtx.stroke()
    gameCtx.restore()
  }
}
