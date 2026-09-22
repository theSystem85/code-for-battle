// Prepared chimney / damage smoke.
//
// The previous renderer built two to four Canvas2D radial gradients and filled a
// circle for every particle on every frame. Those paints do not batch: each
// gradient is a unique shader, and the cost scales with puff area and DPR.
//
// A WebGL instanced pass can draw the puffs in one call, but smoke has to stay
// above buildings on the 2D entity canvas. Blitting a WebGL framebuffer back
// onto that canvas measured slower than the gradients (headless Chrome,
// SwiftShader: about 6.9ms vs 0.9ms) because the copy reads the frame back.
//
// This path prepares three fixed sprites once (smoke+core, flame, shade) and
// samples them with drawImage at each puff's continuous radius. The browser
// uploads each sprite once and textures the quads on the GPU. Age still changes
// the radius every frame; the source image is never rebuilt or bucketed.
import { TILE_SIZE } from '../config.js'
import { RENDER_BYTE_BUDGET_OWNERS, renderDiagnostics } from '../performance/renderDiagnostics.js'

export const SMOKE_SPRITE_SIZE = 128

const SPRITE_BYTES = SMOKE_SPRITE_SIZE * SMOKE_SPRITE_SIZE * 4 * 3

function bakeSprite(draw) {
  const canvas = document.createElement('canvas')
  canvas.width = SMOKE_SPRITE_SIZE
  canvas.height = SMOKE_SPRITE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  draw(ctx, SMOKE_SPRITE_SIZE)
  return canvas
}

function fillCircle(ctx, size) {
  const center = size / 2
  ctx.beginPath()
  ctx.arc(center, center, center, 0, Math.PI * 2)
  ctx.fill()
}

export function createSmokeSprites() {
  const smoke = bakeSprite((ctx, size) => {
    const center = size / 2
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center)
    gradient.addColorStop(0, 'rgba(70,70,70,0.7)')
    gradient.addColorStop(0.4, 'rgba(85,85,85,0.5)')
    gradient.addColorStop(0.8, 'rgba(100,100,100,0.3)')
    gradient.addColorStop(1, 'rgba(110,110,110,0)')
    ctx.fillStyle = gradient
    fillCircle(ctx, size)

    // Core alpha is a constant 0.4 of the puff alpha, so it can live in the sprite.
    ctx.globalAlpha = 0.4
    const coreRadius = center * 0.25
    const core = ctx.createRadialGradient(center, center, 0, center, center, coreRadius)
    core.addColorStop(0, 'rgba(50,50,50,0.6)')
    core.addColorStop(1, 'rgba(50,50,50,0)')
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(center, center, coreRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  })

  const flame = bakeSprite((ctx, size) => {
    const center = size / 2
    const gradient = ctx.createRadialGradient(center, center, center * 0.08, center, center, center)
    gradient.addColorStop(0, 'rgba(255,250,214,0.48)')
    gradient.addColorStop(0.42, 'rgba(255,171,58,0.58)')
    gradient.addColorStop(0.78, 'rgba(255,86,20,0.40)')
    gradient.addColorStop(1, 'rgba(120,18,4,0)')
    ctx.fillStyle = gradient
    fillCircle(ctx, size)
  })

  const shade = bakeSprite((ctx, size) => {
    const center = size / 2
    const gradient = ctx.createRadialGradient(center, center, center * 0.1, center, center, center * 0.95)
    gradient.addColorStop(0, 'rgba(20,20,20,1)')
    gradient.addColorStop(0.7, 'rgba(16,16,16,0.55)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    fillCircle(ctx, size)
  })

  if (!smoke || !flame || !shade) return null
  return { smoke, flame, shade }
}

export class PreparedSmokeBatch {
  constructor() {
    this.sprites = null
    this.failed = false
    this.backend = 'procedural'
    this.presentCount = 0
    this.lastDrawCount = 0
    this.reportedBytes = false
  }

  ensure() {
    if (this.sprites) return true
    if (this.failed) return false
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      this.failed = true
      return false
    }
    try {
      this.sprites = createSmokeSprites()
    } catch {
      this.sprites = null
    }
    if (!this.sprites) {
      this.failed = true
      return false
    }
    this.backend = 'prepared-sprite'
    if (!this.reportedBytes) {
      this.reportedBytes = true
      renderDiagnostics.setByteUsage(RENDER_BYTE_BUDGET_OWNERS.EFFECTS, SPRITE_BYTES)
    }
    return true
  }

  /**
   * Draw visible puffs. Returns false only when the caller should use the
   * procedural gradient fallback. Off-screen puffs are skipped and still count
   * as handled.
   */
  render(ctx, particles, scrollX, scrollY, viewWidth, viewHeight, visibilityMap) {
    if (!particles || particles.length === 0) return false
    if (!this.ensure()) return false

    const smoke = this.sprites.smoke
    const flame = this.sprites.flame
    const shadeSprite = this.sprites.shade
    const cull = viewWidth > 0 && viewHeight > 0
    let draws = 0

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      if (!p || !p.size || p.size <= 0) continue

      const screenX = p.x - scrollX
      const screenY = p.y - scrollY
      const radius = p.size < 1 ? 1 : p.size
      let fire = p.fireIntensity || 0
      if (fire < 0) fire = 0
      else if (fire > 1) fire = 1
      let extent = radius
      let flameRadius = 0
      if (fire > 0.01) {
        flameRadius = radius * (0.5 + fire * 0.65)
        if (flameRadius > extent) extent = flameRadius
      }

      if (
        cull &&
        (screenX + extent < 0 ||
          screenY + extent < 0 ||
          screenX - extent > viewWidth ||
          screenY - extent > viewHeight)
      ) {
        continue
      }

      if (visibilityMap) {
        const tileX = Math.floor(p.x / TILE_SIZE)
        const tileY = Math.floor(p.y / TILE_SIZE)
        if (tileY < 0 || tileY >= visibilityMap.length) continue
        const row = visibilityMap[tileY]
        if (!row || tileX < 0 || tileX >= row.length) continue
        const cell = row[tileX]
        if (!cell || !cell.visible) continue
      }

      const alpha = p.alpha > 0 ? p.alpha : 0
      if (flameRadius > 0) {
        const flameDiameter = flameRadius * 2
        ctx.globalAlpha = alpha * fire
        ctx.drawImage(flame, screenX - flameRadius, screenY - flameRadius, flameDiameter, flameDiameter)
        draws += 1
      }

      const diameter = radius * 2
      ctx.globalAlpha = alpha
      ctx.drawImage(smoke, screenX - radius, screenY - radius, diameter, diameter)
      draws += 1

      let shade = p.smokeShade || 0
      if (shade > 0.01) {
        if (shade > 1) shade = 1
        ctx.globalAlpha = Math.min(0.8, alpha * (0.25 + shade * 0.55))
        ctx.drawImage(shadeSprite, screenX - radius, screenY - radius, diameter, diameter)
        draws += 1
      }
    }

    ctx.globalAlpha = 1
    this.lastDrawCount = draws
    this.presentCount += 1
    return true
  }
}
