// rendering/effectsRenderer.js
import { TILE_SIZE } from '../config.js'
import { drawTeslaCoilLightning, getCanvasLogicalSize } from './renderingUtils.js'
import { getSimulationTime } from '../game/time.js'
import { renderSpriteSheetAnimation } from './spriteSheetAnimation.js'
import { renderProfiler } from '../performance/renderProfiler.js'
import { PROFILER_SPAN_IDS } from '../performance/profilerIds.js'

export const BOW_WAKE_INNER_ANGLE_RADIANS = 70 * (Math.PI / 180)

function isCircleOutsideViewport(x, y, radius, width, height) {
  if (width <= 0 || height <= 0) return false
  return x + radius < 0 || y + radius < 0 || x - radius > width || y - radius > height
}

export class EffectsRenderer {
  constructor() {
    this.blackBlendAnimations = []
    this.alphaBlendAnimations = []
  }
  renderBullets(ctx, bullets, scrollOffset) {
    // Draw bullets with improved appearance
    const now = performance.now()
    const { width: canvasWidth, height: canvasHeight } = getCanvasLogicalSize(ctx.canvas)

    bullets.forEach(bullet => {
      const x = bullet.x - scrollOffset.x
      const y = bullet.y - scrollOffset.y
      const isUnderwaterTorpedo = bullet.projectileType === 'torpedo' || bullet.originType === 'torpedo'
      let minX = x
      let maxX = x
      let minY = y
      let maxY = y
      for (const point of bullet.trail || []) {
        const pointX = point.x - scrollOffset.x
        const pointY = point.y - scrollOffset.y
        minX = Math.min(minX, pointX)
        maxX = Math.max(maxX, pointX)
        minY = Math.min(minY, pointY)
        maxY = Math.max(maxY, pointY)
      }
      const padding = 12
      if (canvasWidth > 0 && canvasHeight > 0 && (
        maxX + padding < 0 ||
        maxY + padding < 0 ||
        minX - padding > canvasWidth ||
        minY - padding > canvasHeight
      )) {
        return
      }

      ctx.save()
      if (isUnderwaterTorpedo) ctx.globalAlpha *= 0.5

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
      ctx.restore()
    })
  }

  renderSmoke(ctx, gameState, scrollOffset) {
    if (!gameState?.smokeParticles || gameState.smokeParticles.length === 0) return

    const visibilityMap = gameState?.visibilityMap
    const shadowEnabled = Boolean(gameState?.shadowOfWarEnabled && visibilityMap && visibilityMap.length)

    // Get canvas dimensions for view frustum culling
    const { width: canvasWidth, height: canvasHeight } = getCanvasLogicalSize(ctx.canvas)
    const particles = gameState.smokeParticles
    const len = particles.length

    for (let i = 0; i < len; i++) {
      const p = particles[i]
      if (!p || !p.size || p.size <= 0) continue

      // Calculate screen position FIRST for early frustum culling
      const screenX = p.x - scrollOffset.x
      const screenY = p.y - scrollOffset.y

      const safeSize = Math.max(1, p.size)
      const fireIntensity = Math.max(0, Math.min(1, p.fireIntensity || 0))
      const cullRadius = Math.max(safeSize, safeSize * (0.5 + fireIntensity * 0.65))
      if (isCircleOutsideViewport(screenX, screenY, cullRadius, canvasWidth, canvasHeight)) {
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

      const smokeShade = Math.max(0, Math.min(1, p.smokeShade || 0))

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

      // Smoke and its core grow continuously with age. Drawing their radial
      // functions at the exact current radius avoids both raster resizing and
      // forbidden age buckets while preserving the prior color stops.
      ctx.globalAlpha = p.alpha
      const smokeGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, safeSize)
      smokeGradient.addColorStop(0, 'rgba(70,70,70,0.7)')
      smokeGradient.addColorStop(0.4, 'rgba(85,85,85,0.5)')
      smokeGradient.addColorStop(0.8, 'rgba(100,100,100,0.3)')
      smokeGradient.addColorStop(1, 'rgba(110,110,110,0)')
      ctx.fillStyle = smokeGradient
      ctx.beginPath()
      ctx.arc(screenX, screenY, safeSize, 0, Math.PI * 2)
      ctx.fill()

      const coreRadius = Math.max(1, safeSize * 0.25)
      const coreGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, coreRadius)
      coreGradient.addColorStop(0, 'rgba(50,50,50,0.6)')
      coreGradient.addColorStop(1, 'rgba(50,50,50,0)')
      ctx.globalAlpha = p.alpha * 0.4
      ctx.fillStyle = coreGradient
      ctx.beginPath()
      ctx.arc(screenX, screenY, coreRadius, 0, Math.PI * 2)
      ctx.fill()

      if (smokeShade > 0.01) {
        const darkAlpha = Math.min(0.8, p.alpha * (0.25 + smokeShade * 0.55))
        const shadeGradient = ctx.createRadialGradient(
          screenX,
          screenY,
          safeSize * 0.1,
          screenX,
          screenY,
          safeSize * 0.95
        )
        shadeGradient.addColorStop(0, `rgba(20, 20, 20, ${darkAlpha})`)
        shadeGradient.addColorStop(0.7, `rgba(16, 16, 16, ${darkAlpha * 0.55})`)
        shadeGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.globalAlpha = 1
        ctx.fillStyle = shadeGradient
        ctx.beginPath()
        ctx.arc(screenX, screenY, safeSize, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Reset global alpha
    ctx.globalAlpha = 1
  }

  renderDust(ctx, gameState, scrollOffset) {
    if (gameState?.dustParticles && gameState.dustParticles.length > 0) {
      const { width: canvasWidth, height: canvasHeight } = getCanvasLogicalSize(ctx.canvas)
      gameState.dustParticles.forEach(p => {
        const x = p.x - scrollOffset.x
        const y = p.y - scrollOffset.y
        const size = p.currentSize || p.size
        if (isCircleOutsideViewport(x, y, size, canvasWidth, canvasHeight)) return
        ctx.save()
        ctx.globalAlpha = p.alpha

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

    const currentTime = getSimulationTime(gameState)
    const visibilityMap = gameState?.visibilityMap
    const shadowEnabled = Boolean(gameState?.shadowOfWarEnabled && visibilityMap && visibilityMap.length)

    // Get canvas dimensions for view frustum culling
    const { width: canvasWidth, height: canvasHeight } = getCanvasLogicalSize(ctx.canvas)
    const explosions = gameState.explosions
    const len = explosions.length
    const blackBlendAnimations = this.blackBlendAnimations
    const alphaBlendAnimations = this.alphaBlendAnimations
    blackBlendAnimations.length = 0
    alphaBlendAnimations.length = 0

    for (let i = 0; i < len; i++) {
      const exp = explosions[i]
      if (!exp) continue

      const centerX = exp.x - scrollOffset.x
      const centerY = exp.y - scrollOffset.y
      const maxRadius = exp.type === 'spriteSheet'
        ? TILE_SIZE * Math.max(1, exp.scale || 1)
        : (Number.isFinite(exp.maxRadius) && exp.maxRadius > 0 ? exp.maxRadius : TILE_SIZE * 2)

      if (
        exp.type !== 'spriteSheet' &&
        isCircleOutsideViewport(centerX, centerY, maxRadius, canvasWidth, canvasHeight)
      ) {
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

      if (exp.type === 'spriteSheet') {
        if ((exp.blendMode || 'black') === 'black') blackBlendAnimations.push(exp)
        else alphaBlendAnimations.push(exp)
        continue
      }

      const safeDuration = Number.isFinite(exp.duration) && exp.duration > 0 ? exp.duration : 1
      const rawProgress = (currentTime - exp.startTime) / safeDuration
      const progress = Math.min(Math.max(rawProgress, 0), 1)
      const easedProgress = 1 - (1 - progress) * (1 - progress)
      const currentRadius = maxRadius * easedProgress
      const fade = Math.max(0, 1 - progress)
      const flare = 0.65 + 0.35 * (1 - progress)
      const alpha = fade * flare

      if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || !Number.isFinite(currentRadius) || currentRadius <= 0) {
        continue
      }

      // These radii are continuous functions of age. Render exact procedural
      // gradients so no growing raster is resized or discretized into frames.
      const plumeRadius = currentRadius
      const coreRadius = plumeRadius * (0.45 + 0.2 * fade)
      const plumeGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, plumeRadius)
      plumeGradient.addColorStop(0, 'rgba(255,150,0,1)')
      plumeGradient.addColorStop(0.4, 'rgba(255,90,0,0.8)')
      plumeGradient.addColorStop(1, 'rgba(255,50,0,0)')
      ctx.globalAlpha = alpha * 0.9
      ctx.fillStyle = plumeGradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, plumeRadius, 0, Math.PI * 2)
      ctx.fill()

      const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius)
      coreGradient.addColorStop(0, 'rgba(255,255,235,1)')
      coreGradient.addColorStop(0.2, 'rgba(255,230,140,0.95)')
      coreGradient.addColorStop(0.55, 'rgba(255,150,40,0.55)')
      coreGradient.addColorStop(1, 'rgba(255,120,0,0)')
      ctx.globalAlpha = Math.min(1, 0.25 + fade * 1.15)
      ctx.fillStyle = coreGradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1

      // Draw an energetic shockwave ring with time-varying jitter
      const shockwaveRadius = plumeRadius * (0.92 + 0.12 * progress)
      const jitterSeed = (exp.x * 0.13 + exp.y * 0.09 + exp.startTime * 0.001) % (Math.PI * 2)
      const jitter = Math.sin(progress * 34 + jitterSeed) * 0.08 + 1
      ctx.strokeStyle = `rgba(255,200,110,${alpha * 0.75})`
      ctx.lineWidth = 1.2 + 1.8 * fade
      ctx.beginPath()
      ctx.arc(centerX, centerY, shockwaveRadius * jitter, 0, 2 * Math.PI)
      ctx.stroke()

      // Faint embers at low count keep the effect fancy without heavy particle systems
      if (fade > 0.2) {
        const emberCount = Math.min(4, Math.max(1, Math.floor(maxRadius / TILE_SIZE)))
        ctx.fillStyle = `rgba(255,215,120,${alpha * 0.5})`
        for (let e = 0; e < emberCount; e++) {
          const angle = jitterSeed + e * 2.11
          const drift = plumeRadius * (0.45 + e * 0.12 + progress * 0.25)
          const emberX = centerX + Math.cos(angle) * drift
          const emberY = centerY + Math.sin(angle) * drift
          const emberRadius = Math.max(0.8, 2.4 * fade - e * 0.35)
          ctx.beginPath()
          ctx.arc(emberX, emberY, emberRadius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    if (blackBlendAnimations.length > 0 || alphaBlendAnimations.length > 0) {
      const previousOperation = ctx.globalCompositeOperation
      const previousAlpha = ctx.globalAlpha
      const previousSmoothing = ctx.imageSmoothingEnabled

      if (blackBlendAnimations.length > 0) {
        ctx.globalCompositeOperation = 'lighter'
        ctx.imageSmoothingEnabled = false
        for (let i = 0; i < blackBlendAnimations.length; i++) {
          renderSpriteSheetAnimation(ctx, blackBlendAnimations[i], scrollOffset, currentTime)
        }
      }

      if (alphaBlendAnimations.length > 0) {
        ctx.globalCompositeOperation = 'source-over'
        ctx.imageSmoothingEnabled = false
        for (let i = 0; i < alphaBlendAnimations.length; i++) {
          renderSpriteSheetAnimation(ctx, alphaBlendAnimations[i], scrollOffset, currentTime)
        }
      }

      ctx.imageSmoothingEnabled = previousSmoothing
      ctx.globalCompositeOperation = previousOperation
      ctx.globalAlpha = previousAlpha
    }
  }

  renderDustParticles(ctx, gameState, scrollOffset) {
    // Draw dust particles from Mine Sweeper
    if (gameState?.dustParticles && gameState?.dustParticles.length > 0) {
      const currentTime = performance.now()
      const { width: canvasWidth, height: canvasHeight } = getCanvasLogicalSize(ctx.canvas)
      const particles = gameState.dustParticles
      let writeIndex = 0
      for (let readIndex = 0; readIndex < particles.length; readIndex++) {
        const dust = particles[readIndex]
        if (!dust) continue
        const age = currentTime - dust.startTime
        if (age >= dust.lifetime) continue
        particles[writeIndex++] = dust
        const progress = age / dust.lifetime
        const alpha = Math.max(0, 1 - progress)

        const screenX = dust.x - scrollOffset.x
        const screenY = dust.y - scrollOffset.y

        // Particle expands and fades
        const currentSize = dust.size * (1 + progress * 0.5)
        if (isCircleOutsideViewport(screenX, screenY, currentSize, canvasWidth, canvasHeight)) continue

        ctx.save()
        ctx.globalAlpha = alpha * 0.4
        ctx.fillStyle = dust.color || '#D2B48C'
        ctx.beginPath()
        ctx.arc(screenX, screenY, currentSize, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      particles.length = writeIndex
    }
  }

  renderTeslaLightning(ctx, units, scrollOffset, gameState) {
    // Render Tesla Coil Lightning Effects ON TOP
    if (units && units.length > 0) {
      const now = Number.isFinite(gameState?.simulationTime) ? getSimulationTime(gameState) : performance.now()
      const { width: canvasWidth, height: canvasHeight } = getCanvasLogicalSize(ctx.canvas)
      for (const unit of units) {
        if (unit.teslaCoilHit && now - unit.teslaCoilHit.impactTime < 400) {
          const fromX = unit.teslaCoilHit.fromX - scrollOffset.x
          const fromY = unit.teslaCoilHit.fromY - scrollOffset.y
          const toX = unit.teslaCoilHit.toX - scrollOffset.x
          const toY = unit.teslaCoilHit.toY - scrollOffset.y
          const padding = TILE_SIZE
          if (
            canvasWidth > 0 &&
            canvasHeight > 0 &&
            (
              Math.max(fromX, toX) + padding < 0 ||
              Math.max(fromY, toY) + padding < 0 ||
              Math.min(fromX, toX) - padding > canvasWidth ||
              Math.min(fromY, toY) - padding > canvasHeight
            )
          ) {
            continue
          }
          // Draw the lightning bolt for a short time after impact
          drawTeslaCoilLightning(
            ctx,
            fromX,
            fromY,
            toX,
            toY,
            TILE_SIZE
          )
        }
      }
    }
  }

  renderShipWakes(ctx, gameState, scrollOffset) {
    const wakes = gameState?.shipWakes
    if (!Array.isArray(wakes) || wakes.length === 0) return
    const span = renderProfiler.startSpan(PROFILER_SPAN_IDS.EFFECTS)
    try {
      const now = Number.isFinite(gameState?.simulationTime) ? getSimulationTime(gameState) : performance.now()
      const { width: canvasWidth, height: canvasHeight } = getCanvasLogicalSize(ctx.canvas)
      ctx.save()
      let writeIndex = 0
      for (let readIndex = 0; readIndex < wakes.length; readIndex++) {
        const wake = wakes[readIndex]
        if (now - wake.createdAt >= wake.duration) continue
        wakes[writeIndex++] = wake
        const age = Math.max(0, now - wake.createdAt)
        const alpha = Math.max(0, 1 - age / wake.duration)
        const progress = age / wake.duration
        const screenX = wake.x - scrollOffset.x
        const screenY = wake.y - scrollOffset.y
        if (wake.kind === 'turn') {
          const radius = wake.size * (0.45 + progress * 1.05)
          if (isCircleOutsideViewport(screenX, screenY, radius + 3, canvasWidth, canvasHeight)) continue
          ctx.save()
          ctx.translate(screenX, screenY)
          ctx.strokeStyle = `rgba(205, 240, 255, ${0.45 * alpha})`
          ctx.lineWidth = 0.8 + alpha * 1.4
          ctx.beginPath()
          ctx.arc(0, 0, radius, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
          continue
        }
        const isBowWake = wake.kind === 'bow'
        const length = wake.size * (isBowWake ? 0.65 + progress * 1.2 : 0.8 + progress * 1.8)
        const halfWidth = isBowWake
          ? length * Math.tan(BOW_WAKE_INNER_ANGLE_RADIANS / 2)
          : wake.size * (0.18 + progress * 0.75)
        if (isCircleOutsideViewport(screenX, screenY, Math.hypot(length, halfWidth) + 3, canvasWidth, canvasHeight)) continue
        ctx.save()
        ctx.translate(screenX, screenY)
        ctx.rotate(wake.direction || 0)
        ctx.strokeStyle = `rgba(205, 240, 255, ${0.5 * alpha})`
        ctx.lineWidth = (isBowWake ? 0.8 : 1.4) + alpha
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(-length * 0.48, -halfWidth * 0.35, -length, -halfWidth)
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(-length * 0.48, halfWidth * 0.35, -length, halfWidth)
        ctx.stroke()
        ctx.restore()
      }
      wakes.length = writeIndex
      ctx.restore()
    } finally {
      renderProfiler.endSpan(span)
    }
  }

  renderDepthCharges(ctx, gameState, scrollOffset) {
    const charges = gameState?.depthCharges
    if (!Array.isArray(charges) || charges.length === 0) return
    const span = renderProfiler.startSpan(PROFILER_SPAN_IDS.EFFECTS)
    try {
      const now = Number.isFinite(gameState?.simulationTime) ? getSimulationTime(gameState) : performance.now()
      const { width: canvasWidth, height: canvasHeight } = getCanvasLogicalSize(ctx.canvas)
      ctx.save()
      charges.forEach(charge => {
        const progress = Math.max(0, Math.min(1, (now - charge.createdAt) / Math.max(1, charge.detonateAt - charge.createdAt)))
        const x = charge.x - scrollOffset.x
        const y = charge.y - scrollOffset.y
        const cullRadius = TILE_SIZE * 0.8
        if (isCircleOutsideViewport(x, y, cullRadius, canvasWidth, canvasHeight)) return
        ctx.strokeStyle = `rgba(170, 225, 255, ${0.8 - progress * 0.35})`
        ctx.fillStyle = 'rgba(20, 45, 65, 0.85)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(x, y, TILE_SIZE * (0.16 + progress * 0.12), 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        for (let i = 0; i < 3; i++) {
          ctx.beginPath()
          ctx.arc(x + (i - 1) * 4, y - progress * TILE_SIZE * (0.35 + i * 0.08), 1.5 + i * 0.4, 0, Math.PI * 2)
          ctx.stroke()
        }
      })
      ctx.restore()
    } finally {
      renderProfiler.endSpan(span)
    }
  }

  render(ctx, bullets, gameState, units, scrollOffset) {
    const span = renderProfiler.startSpan(PROFILER_SPAN_IDS.EFFECTS)
    try {
      this.renderBullets(ctx, bullets, scrollOffset)
      this.renderSmoke(ctx, gameState, scrollOffset)
      this.renderDust(ctx, gameState, scrollOffset)
      this.renderDustParticles(ctx, gameState, scrollOffset)
      this.renderExplosions(ctx, gameState, scrollOffset)
      this.renderTeslaLightning(ctx, units, scrollOffset, gameState)
    } finally {
      renderProfiler.endSpan(span)
    }
  }
}
