import { TILE_SIZE } from '../config.js'

export const CRYSTAL_GLOW_COLORS = Object.freeze({
  ore: '#55cfff',
  seedCrystal: '#ff5555'
})

export function getCrystalGlowStyle(type, density = 1) {
  const normalizedDensity = Math.max(1, Math.min(5, Number.isFinite(density) ? Math.floor(density) : 1))
  return {
    color: CRYSTAL_GLOW_COLORS[type] || CRYSTAL_GLOW_COLORS.ore,
    width: TILE_SIZE * (0.72 + normalizedDensity * 0.11),
    height: TILE_SIZE * (0.3 + normalizedDensity * 0.045),
    alpha: 0.2 + normalizedDensity * 0.025,
    density: normalizedDensity
  }
}

export function getCrystalSparkleAlpha(tileX, tileY, timeMs) {
  const hash = ((tileX * 73856093) ^ (tileY * 19349663)) >>> 0
  const cycle = 5200 + (hash % 4800)
  const localTime = (timeMs + (hash % cycle)) % cycle
  if (localTime >= 140) return 0
  return Math.sin((localTime / 140) * Math.PI)
}

export class CrystalGlowRenderer {
  constructor() {
    this.spriteCache = new Map()
  }

  getSprite(type, density, createCanvas) {
    const style = getCrystalGlowStyle(type, density)
    const key = `${type}:${style.density}`
    if (this.spriteCache.has(key)) return this.spriteCache.get(key)
    const canvas = createCanvas(Math.ceil(style.width), Math.ceil(style.height))
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width / 2)
    gradient.addColorStop(0, style.color)
    gradient.addColorStop(0.42, style.color)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    this.spriteCache.set(key, canvas)
    return canvas
  }

  draw(ctx, type, density, tileX, tileY, screenX, screenY, timeMs, createCanvas) {
    const style = getCrystalGlowStyle(type, density)
    const sprite = this.getSprite(type, style.density, createCanvas)
    const pulse = 0.88 + Math.sin(timeMs * 0.002 + tileX * 0.7 + tileY * 0.43) * 0.12
    const x = screenX + (TILE_SIZE - style.width) / 2
    const y = screenY + TILE_SIZE * 0.58 - style.height / 2
    ctx.globalAlpha = style.alpha * pulse
    ctx.drawImage(sprite, x, y, style.width, style.height)
    const sparkle = getCrystalSparkleAlpha(tileX, tileY, timeMs)
    if (sparkle > 0) {
      const size = TILE_SIZE * (0.12 + style.density * 0.012)
      ctx.globalAlpha = 0.75 * sparkle
      ctx.drawImage(sprite, screenX + TILE_SIZE * 0.62, screenY + TILE_SIZE * 0.52, size, size * 0.55)
    }
    ctx.globalAlpha = 1
  }
}
