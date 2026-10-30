import { TILE_SIZE } from '../config.js'

export const CRYSTAL_GLOW_COLORS = Object.freeze({
  ore: '#55cfff',
  seedCrystal: '#ff5555'
})

export function getCrystalGlowStyle(type, density = 1) {
  const normalizedDensity = Math.max(1, Math.min(5, Number.isFinite(density) ? Math.floor(density) : 1))
  return {
    color: CRYSTAL_GLOW_COLORS[type] || CRYSTAL_GLOW_COLORS.ore,
    width: TILE_SIZE * (1.02 + normalizedDensity * 0.12),
    height: TILE_SIZE * (0.38 + normalizedDensity * 0.045),
    alpha: 0.48 + normalizedDensity * 0.03,
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
    this.sparkleCache = new Map()
  }

  getSprite(type, density, createCanvas) {
    const style = getCrystalGlowStyle(type, density)
    const key = `${type}:${style.density}`
    if (this.spriteCache.has(key)) return this.spriteCache.get(key)
    const canvas = createCanvas(Math.ceil(style.width), Math.ceil(style.height))
    const ctx = canvas.getContext('2d')
    // Build the gradient in circular coordinates and squash the finished mask.
    // A radial gradient created directly on a short canvas stays opaque at its
    // top/bottom edges because its radius is based on the much larger width.
    const squash = canvas.height / canvas.width
    ctx.scale(1, squash)
    const centerY = canvas.height / (2 * squash)
    const gradient = ctx.createRadialGradient(canvas.width / 2, centerY, 0, canvas.width / 2, centerY, canvas.width / 2)
    gradient.addColorStop(0, style.color)
    gradient.addColorStop(0.18, style.color)
    gradient.addColorStop(0.52, `${style.color}b8`)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height / squash)
    this.spriteCache.set(key, canvas)
    return canvas
  }

  getSparkle(type, createCanvas) {
    if (this.sparkleCache.has(type)) return this.sparkleCache.get(type)
    const canvas = createCanvas(16, 16)
    const ctx = canvas.getContext('2d')
    const color = CRYSTAL_GLOW_COLORS[type] || CRYSTAL_GLOW_COLORS.ore
    const gradient = ctx.createRadialGradient(8, 8, 0, 8, 8, 8)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(0.22, color)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 16, 16)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(7, 1, 2, 14)
    ctx.fillRect(1, 7, 14, 2)
    this.sparkleCache.set(type, canvas)
    return canvas
  }

  draw(ctx, type, density, tileX, tileY, screenX, screenY, timeMs, createCanvas) {
    const style = getCrystalGlowStyle(type, density)
    const sprite = this.getSprite(type, style.density, createCanvas)
    const pulse = 0.86 + Math.sin(timeMs * 0.0018 + tileX * 0.7 + tileY * 0.43) * 0.14
    const x = screenX + (TILE_SIZE - style.width) / 2
    const y = screenY + TILE_SIZE * 0.77 - style.height / 2
    const previousComposite = ctx.globalCompositeOperation
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = style.alpha * pulse
    ctx.drawImage(sprite, x, y, style.width, style.height)
    const sparkle = getCrystalSparkleAlpha(tileX, tileY, timeMs)
    if (sparkle > 0) {
      const sparkleSprite = this.getSparkle(type, createCanvas)
      const size = TILE_SIZE * (0.17 + style.density * 0.012)
      ctx.globalAlpha = 0.9 * sparkle
      ctx.drawImage(sparkleSprite, screenX + TILE_SIZE * 0.7 - size / 2, screenY + TILE_SIZE * 0.68 - size / 2, size, size)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = previousComposite
  }
}
