// rendering/effectsRenderer.js
import { TILE_SIZE } from '../config.js'
import { drawTeslaCoilLightning } from './renderingUtils.js'

// Pre-cached gradient sprites for smoke particles (GPU-friendly)
// These are created once at initialization and reused via drawImage
const SMOKE_SPRITE_CACHE = {
  initialized: false,
  sprites: [], // Array of { canvas, size } for different smoke sizes
  coreSprites: [], // Array of { canvas, size } for core gradients
  explosionSprites: new Map() // Map of size -> canvas for explosion gradients
}

// Smoke sprite sizes to pre-cache (covers typical particle size range)
const SMOKE_SPRITE_SIZES = [4, 6, 8, 10, 12, 16, 20, 24, 32]

/**
 * Initialize pre-cached gradient sprites for smoke and explosions.
 * Called once at startup - moves gradient creation from GPU to a one-time CPU cost.
 */
function initializeSmokeSprites() {
  if (SMOKE_SPRITE_CACHE.initialized) return

  SMOKE_SPRITE_SIZES.forEach(size => {
    // Create main smoke gradient sprite
    const canvas = document.createElement('canvas')
    canvas.width = size * 2
    canvas.height = size * 2
    const ctx = canvas.getContext('2d')

    const gradient = ctx.createRadialGradient(size, size, 0, size, size, size)
    gradient.addColorStop(0, 'rgba(70,70,70,0.7)')
    gradient.addColorStop(0.4, 'rgba(85,85,85,0.5)')
    gradient.addColorStop(0.8, 'rgba(100,100,100,0.3)')
    gradient.addColorStop(1, 'rgba(110,110,110,0)')

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(size, size, size, 0, Math.PI * 2)
    ctx.fill()

    SMOKE_SPRITE_CACHE.sprites.push({ canvas, size })

    // Create core gradient sprite (25% of main size)
    const coreSize = Math.max(1, Math.floor(size * 0.25))
    const coreCanvas = document.createElement('canvas')
    coreCanvas.width = coreSize * 2
    coreCanvas.height = coreSize * 2
    const coreCtx = coreCanvas.getContext('2d')

    const coreGradient = coreCtx.createRadialGradient(coreSize, coreSize, 0, coreSize, coreSize, coreSize)
    coreGradient.addColorStop(0, 'rgba(50,50,50,0.6)')
    coreGradient.addColorStop(1, 'rgba(50,50,50,0)')

    coreCtx.fillStyle = coreGradient
    coreCtx.beginPath()
    coreCtx.arc(coreSize, coreSize, coreSize, 0, Math.PI * 2)
    coreCtx.fill()

    SMOKE_SPRITE_CACHE.coreSprites.push({ canvas: coreCanvas, size: coreSize, originalSize: size })
  })

  SMOKE_SPRITE_CACHE.initialized = true
}

/**
 * Get the closest pre-cached sprite for a given particle size.
 * Uses binary search for efficiency.
 */
function getClosestSmokeSprite(particleSize, isCore = false) {
  const sprites = isCore ? SMOKE_SPRITE_CACHE.coreSprites : SMOKE_SPRITE_CACHE.sprites
  if (!sprites.length) return null

  // Find closest size match
  const targetSize = isCore ? particleSize * 4 : particleSize // Core sprites are stored at originalSize
  let closest = sprites[0]
  let closestDiff = Math.abs((isCore ? closest.originalSize : closest.size) - targetSize)

  for (let i = 1; i < sprites.length; i++) {
    const size = isCore ? sprites[i].originalSize : sprites[i].size
    const diff = Math.abs(size - targetSize)
    if (diff < closestDiff) {
      closest = sprites[i]
      closestDiff = diff
    }
  }

  return closest
}

/**
 * Get or create an explosion gradient sprite for a given radius.
 * Caches dynamically since explosion sizes vary more than smoke.
 */
function getExplosionSprite(radius) {
  const roundedRadius = Math.round(radius / 4) * 4 // Round to nearest 4px for cache efficiency
  if (roundedRadius <= 0) return null

  if (SMOKE_SPRITE_CACHE.explosionSprites.has(roundedRadius)) {
    return SMOKE_SPRITE_CACHE.explosionSprites.get(roundedRadius)
  }

  const canvas = document.createElement('canvas')
  canvas.width = roundedRadius * 2
  canvas.height = roundedRadius * 2
  const ctx = canvas.getContext('2d')

  // Pre-render explosion gradient with full opacity (alpha applied at render time)
  const gradient = ctx.createRadialGradient(roundedRadius, roundedRadius, 0, roundedRadius, roundedRadius, roundedRadius)
  gradient.addColorStop(0, 'rgba(255,150,0,1)')
  gradient.addColorStop(0.4, 'rgba(255,90,0,0.8)')
  gradient.addColorStop(1, 'rgba(255,50,0,0)')

  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(roundedRadius, roundedRadius, roundedRadius, 0, Math.PI * 2)
  ctx.fill()

  SMOKE_SPRITE_CACHE.explosionSprites.set(roundedRadius, canvas)

  // Limit cache size to prevent memory bloat
  if (SMOKE_SPRITE_CACHE.explosionSprites.size > 50) {
    const firstKey = SMOKE_SPRITE_CACHE.explosionSprites.keys().next().value
    SMOKE_SPRITE_CACHE.explosionSprites.delete(firstKey)
  }

  return canvas
}

export class EffectsRenderer {
  constructor() {
    // Initialize sprite cache on first renderer creation
    initializeSmokeSprites()
  }
  renderBullets(ctx, bullets, scrollOffset) {
    // Draw bullets with improved appearance
    const now = performance.now()

    bullets.forEach(bullet => {
      const x = bullet.x - scrollOffset.x
      const y = bullet.y - scrollOffset.y

      // Draw dissipating trail
      if (bullet.trail && bullet.trail.length > 1) {
        ctx.save()
        ctx.strokeStyle = 'rgba(200,200,200,0.4)'
        ctx.lineWidth = 1
        ctx.beginPath()
        bullet.trail.forEach((p, idx) => {
          const px = p.x - scrollOffset.x
          const py = p.y - scrollOffset.y
          if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
        })
        ctx.stroke()
        ctx.restore()
      }

      // Different rendering for different projectile types
      if (bullet.homing || bullet.ballistic) {
        // Check if this is an Apache rocket - render as tank bullet with trail
        if (bullet.originType === 'apacheRocket') {
          // Apache rockets: tank bullet style with trail
          const bulletLength = 6
          const bulletWidth = 2

          // Calculate bullet direction
          let angle = 0
          if (bullet.vx !== undefined && bullet.vy !== undefined) {
            angle = Math.atan2(bullet.vy, bullet.vx)
          } else if (bullet.dx !== undefined && bullet.dy !== undefined) {
            angle = Math.atan2(bullet.dy, bullet.dx)
          }

          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(angle)

          // Draw bullet shape with copper color
          ctx.fillStyle = '#B87333' // Copper color
          ctx.beginPath()
          ctx.ellipse(0, 0, bulletLength / 2, bulletWidth / 2, 0, 0, 2 * Math.PI)
          ctx.fill()

          // Add a darker tip for the bullet
          ctx.fillStyle = '#8B4513' // Darker copper/bronze
          ctx.beginPath()
          ctx.ellipse(bulletLength / 4, 0, bulletLength / 4, bulletWidth / 4, 0, 0, 2 * Math.PI)
          ctx.fill()

          ctx.restore()
        } else {
          // Regular rockets - small body with flame
          let angle = 0
          if (bullet.vx !== undefined && bullet.vy !== undefined) {
            angle = Math.atan2(bullet.vy, bullet.vx)
          } else if (bullet.dx !== undefined && bullet.dy !== undefined) {
            angle = Math.atan2(bullet.dy, bullet.dx)
          }

          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(angle)

          // Rocket body
          ctx.fillStyle = '#CCCCCC'
          ctx.fillRect(-4, -1.5, 6, 3)

          // Rocket nose
          ctx.fillStyle = '#888888'
          ctx.beginPath()
          ctx.moveTo(2, -1.5)
          ctx.lineTo(4, 0)
          ctx.lineTo(2, 1.5)
          ctx.closePath()
          ctx.fill()

          // Flame with slight flicker
          const flicker = Math.sin(now / 80 + bullet.id) * 1.2
          ctx.fillStyle = '#FF4500'
          ctx.beginPath()
          ctx.moveTo(-4, -1)
          ctx.lineTo(-4 - 4 - flicker, 0)
          ctx.lineTo(-4, 1)
          ctx.closePath()
          ctx.fill()

          ctx.restore()
        }
      } else {
        // Tank bullets - smaller, copper-colored, bullet-shaped
        const bulletLength = 6
        const bulletWidth = 2

        // Calculate bullet direction if it has velocity
        let angle = 0
        if (bullet.vx !== undefined && bullet.vy !== undefined) {
          angle = Math.atan2(bullet.vy, bullet.vx)
        }

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(angle)

        // Draw bullet shape with copper color
        ctx.fillStyle = '#B87333' // Copper color
        ctx.beginPath()

        // Draw bullet as an elongated oval/capsule shape
        ctx.ellipse(0, 0, bulletLength / 2, bulletWidth / 2, 0, 0, 2 * Math.PI)
        ctx.fill()

        // Add a darker tip for the bullet
        ctx.fillStyle = '#8B4513' // Darker copper/bronze
        ctx.beginPath()
        ctx.ellipse(bulletLength / 4, 0, bulletLength / 4, bulletWidth / 4, 0, 0, 2 * Math.PI)
        ctx.fill()

        ctx.restore()
      }
    })
  }

  renderSmoke(ctx, gameState, scrollOffset) {
    if (!gameState?.smokeParticles || gameState.smokeParticles.length === 0) return

    const visibilityMap = gameState?.visibilityMap
    const shadowEnabled = Boolean(gameState?.shadowOfWarEnabled && visibilityMap && visibilityMap.length)

    // Get canvas dimensions for view frustum culling
    const canvasWidth = ctx.canvas.width
    const canvasHeight = ctx.canvas.height
    const padding = 64 // Extra padding for particles near edges

    // Pre-calculate view bounds for frustum culling (screen space)
    const viewLeft = -padding
    const viewRight = canvasWidth + padding
    const viewTop = -padding
    const viewBottom = canvasHeight + padding

    const particles = gameState.smokeParticles
    const len = particles.length

    for (let i = 0; i < len; i++) {
      const p = particles[i]
      if (!p || !p.size || p.size <= 0) continue

      // Calculate screen position FIRST for early frustum culling
      const screenX = p.x - scrollOffset.x
      const screenY = p.y - scrollOffset.y

      // View frustum culling - skip particles outside visible area
      if (screenX < viewLeft || screenX > viewRight || screenY < viewTop || screenY > viewBottom) {
        continue
      }

      // Shadow of War visibility check (only if enabled)
      if (shadowEnabled) {
        const tileX = Math.floor(p.x / TILE_SIZE)
        const tileY = Math.floor(p.y / TILE_SIZE)

        if (tileY < 0 || tileY >= visibilityMap.length) continue
        const row = visibilityMap[tileY]
        if (!row || tileX < 0 || tileX >= row.length) continue
        const cell = row[tileX]
        if (!cell || !cell.visible) continue
      }

      const safeSize = Math.max(1, p.size)
      const fireIntensity = Math.max(0, Math.min(1, p.fireIntensity || 0))

      // Use pre-cached sprite instead of creating gradient per frame
      const sprite = getClosestSmokeSprite(safeSize)
      if (sprite) {
        if (fireIntensity > 0.01) {
          const flameRadius = safeSize * (0.5 + fireIntensity * 0.65)
          const flameGradient = ctx.createRadialGradient(
            screenX,
            screenY,
            flameRadius * 0.08,
            screenX,
            screenY,
            flameRadius
          )
          flameGradient.addColorStop(0, `rgba(255, 250, 214, ${0.18 + fireIntensity * 0.3})`)
          flameGradient.addColorStop(0.42, `rgba(255, 171, 58, ${0.2 + fireIntensity * 0.38})`)
          flameGradient.addColorStop(0.78, `rgba(255, 86, 20, ${0.12 + fireIntensity * 0.28})`)
          flameGradient.addColorStop(1, 'rgba(120, 18, 4, 0)')
          ctx.fillStyle = flameGradient
          ctx.beginPath()
          ctx.arc(screenX, screenY, flameRadius, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.globalAlpha = p.alpha
        // Scale sprite to match actual particle size
        const scale = safeSize / sprite.size
        const drawSize = sprite.canvas.width * scale
        ctx.drawImage(
          sprite.canvas,
          screenX - drawSize / 2,
          screenY - drawSize / 2,
          drawSize,
          drawSize
        )

        // Draw core sprite with reduced alpha
        const coreSprite = getClosestSmokeSprite(safeSize, true)
        if (coreSprite) {
          ctx.globalAlpha = p.alpha * 0.4
          const coreScale = (safeSize * 0.25) / coreSprite.size
          const coreDrawSize = coreSprite.canvas.width * coreScale
          ctx.drawImage(
            coreSprite.canvas,
            screenX - coreDrawSize / 2,
            screenY - coreDrawSize / 2,
            coreDrawSize,
            coreDrawSize
          )
        }
      }
    }

    // Reset global alpha
    ctx.globalAlpha = 1
  }

  renderDust(ctx, gameState, scrollOffset) {
    if (gameState?.dustParticles && gameState.dustParticles.length > 0) {
      gameState.dustParticles.forEach(p => {
        ctx.save()
        ctx.globalAlpha = p.alpha
        const x = p.x - scrollOffset.x
        const y = p.y - scrollOffset.y
        const size = p.currentSize || p.size

        ctx.fillStyle = p.color || '#D2B48C'
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })
    }
  }

  renderExplosions(ctx, gameState, scrollOffset) {
    if (!gameState?.explosions || gameState.explosions.length === 0) return

    const currentTime = performance.now()
    const visibilityMap = gameState?.visibilityMap
    const shadowEnabled = Boolean(gameState?.shadowOfWarEnabled && visibilityMap && visibilityMap.length)

    // Get canvas dimensions for view frustum culling
    const canvasWidth = ctx.canvas.width
    const canvasHeight = ctx.canvas.height
    const padding = 128 // Larger padding for explosions

    const explosions = gameState.explosions
    const len = explosions.length

    for (let i = 0; i < len; i++) {
      const exp = explosions[i]
      if (!exp) continue

      const centerX = exp.x - scrollOffset.x
      const centerY = exp.y - scrollOffset.y

      // View frustum culling
      if (centerX < -padding || centerX > canvasWidth + padding ||
          centerY < -padding || centerY > canvasHeight + padding) {
        continue
      }

      // Shadow of War visibility check
      if (shadowEnabled) {
        const tileX = Math.floor(exp.x / TILE_SIZE)
        const tileY = Math.floor(exp.y / TILE_SIZE)

        if (tileY < 0 || tileY >= visibilityMap.length) continue
        const row = visibilityMap[tileY]
        if (!row || tileX < 0 || tileX >= row.length) continue
        const cell = row[tileX]
        if (!cell || !cell.visible) continue
      }

      const safeDuration = Number.isFinite(exp.duration) && exp.duration > 0 ? exp.duration : 1
      const rawProgress = (currentTime - exp.startTime) / safeDuration
      const progress = Math.min(Math.max(rawProgress, 0), 1)
      const maxRadius = Number.isFinite(exp.maxRadius) && exp.maxRadius > 0 ? exp.maxRadius : TILE_SIZE * 2
      const currentRadius = maxRadius * progress
      const alpha = Math.max(0, 1 - progress)

      if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || !Number.isFinite(currentRadius) || currentRadius <= 0) {
        continue
      }

      // Use pre-cached explosion sprite with alpha
      const sprite = getExplosionSprite(currentRadius)
      if (sprite) {
        ctx.globalAlpha = alpha
        ctx.drawImage(
          sprite,
          centerX - currentRadius,
          centerY - currentRadius,
          currentRadius * 2,
          currentRadius * 2
        )
        ctx.globalAlpha = 1
      }

      // Draw stroke ring (lightweight operation)
      ctx.strokeStyle = `rgba(255,165,0,${alpha})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(centerX, centerY, currentRadius, 0, 2 * Math.PI)
      ctx.stroke()
    }
  }

  renderDustParticles(ctx, gameState, scrollOffset) {
    // Draw dust particles from Mine Sweeper
    if (gameState?.dustParticles && gameState?.dustParticles.length > 0) {
      const currentTime = performance.now()

      // Clean up expired particles
      gameState.dustParticles = gameState.dustParticles.filter(dust => {
        const age = currentTime - dust.startTime
        return age < dust.lifetime
      })

      // Render active particles
      gameState.dustParticles.forEach(dust => {
        if (!dust) return

        const age = currentTime - dust.startTime
        const progress = age / dust.lifetime
        const alpha = Math.max(0, 1 - progress)

        const screenX = dust.x - scrollOffset.x
        const screenY = dust.y - scrollOffset.y

        // Particle expands and fades
        const currentSize = dust.size * (1 + progress * 0.5)

        ctx.save()
        ctx.globalAlpha = alpha * 0.4
        ctx.fillStyle = dust.color || '#D2B48C'
        ctx.beginPath()
        ctx.arc(screenX, screenY, currentSize, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })
    }
  }

  renderTeslaLightning(ctx, units, scrollOffset) {
    // Render Tesla Coil Lightning Effects ON TOP
    if (units && units.length > 0) {
      const now = performance.now()
      for (const unit of units) {
        if (unit.teslaCoilHit && now - unit.teslaCoilHit.impactTime < 400) {
          // Draw the lightning bolt for a short time after impact
          drawTeslaCoilLightning(
            ctx,
            unit.teslaCoilHit.fromX - scrollOffset.x,
            unit.teslaCoilHit.fromY - scrollOffset.y,
            unit.teslaCoilHit.toX - scrollOffset.x,
            unit.teslaCoilHit.toY - scrollOffset.y,
            TILE_SIZE
          )
        }
      }
    }
  }

  render(ctx, bullets, gameState, units, scrollOffset) {
    this.renderBullets(ctx, bullets, scrollOffset)
    this.renderSmoke(ctx, gameState, scrollOffset)
    this.renderDust(ctx, gameState, scrollOffset)
    this.renderDustParticles(ctx, gameState, scrollOffset)
    this.renderExplosions(ctx, gameState, scrollOffset)
    this.renderTeslaLightning(ctx, units, scrollOffset)

    // Debug: log smoke particle count periodically
    if (gameState?.smokeParticles?.length > 0 && gameState.frameCount % 100 === 0) {
      // Removed debug logging
    }
  }
}
