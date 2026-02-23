// rendering/buildingRenderer.js
import { TILE_SIZE, TURRET_RECOIL_DISTANCE, RECOIL_DURATION, MUZZLE_FLASH_DURATION, MUZZLE_FLASH_SIZE, ATTACK_TARGET_INDICATOR_SIZE, ATTACK_TARGET_BOUNCE_SPEED, PARTY_COLORS, WIND_DIRECTION, BUILDING_SELL_DURATION, VIEW_FRUSTUM_MARGIN } from '../config.js'
import { getBuildingImage } from '../buildingImageMap.js'
import { gameState } from '../gameState.js'
import { selectedUnits } from '../inputHandler.js'
import { renderTurretWithImages, turretImagesAvailable } from './turretImageRenderer.js'
import { getServiceRadiusPixels, isServiceBuilding } from '../utils/serviceRadius.js'
import { recordBuildingCompleted } from '../ai-api/transitionCollector.js'
import { ROCKET_TURRET_IMAGE_COORDS_SIZE, ROCKET_TURRET_MUZZLE_OFFSETS } from '../game/turretMuzzleConfig.js'

export class BuildingRenderer {
  constructor() {
    // Cache for the wrench icon
    this.wrenchIcon = null
    this.loadWrenchIcon()
  }

  getConcreteWallImageKey(building, mapGrid) {
    const x = building.x
    const y = building.y

    const left = x > 0 && mapGrid[y][x - 1].building && mapGrid[y][x - 1].building.type === 'concreteWall'
    const right = x < mapGrid[0].length - 1 && mapGrid[y][x + 1].building && mapGrid[y][x + 1].building.type === 'concreteWall'
    const up = y > 0 && mapGrid[y - 1][x].building && mapGrid[y - 1][x].building.type === 'concreteWall'
    const down = y < mapGrid.length - 1 && mapGrid[y + 1][x].building && mapGrid[y + 1][x].building.type === 'concreteWall'

    const horizontal = left || right
    const vertical = up || down

    if ((horizontal && vertical) || (!left && !right && !up && !down)) {
      return 'concreteWallCross'
    } else if (horizontal) {
      return 'concreteWallHorizontal'
    } else {
      return 'concreteWallVertical'
    }
  }

  loadWrenchIcon() {
    this.wrenchIcon = new Image()
    this.wrenchIcon.src = '/cursors/repair.svg'
    this.wrenchIcon.onerror = () => {
      window.logger.warn('Failed to load repair cursor icon for repair animation')
      this.wrenchIcon = null
    }
  }

  renderBuildingBase(ctx, building, mapGrid, scrollOffset) {
    const screenX = building.x * TILE_SIZE - scrollOffset.x
    const screenY = building.y * TILE_SIZE - scrollOffset.y
    const width = building.width * TILE_SIZE
    const height = building.height * TILE_SIZE

    let imageKey = building.type
    if (building.type === 'concreteWall') {
      imageKey = this.getConcreteWallImageKey(building, mapGrid)
    }

    // Try to get the building image synchronously first
    const img = getBuildingImage(imageKey)

    if (img) {
      const now = performance.now()

      if (building.isBeingSold) {
        const progress = Math.min((now - building.sellStartTime) / BUILDING_SELL_DURATION, 1)
        const heightProgress = 1 - progress
        this.drawBuildingUnderConstruction(ctx, img, screenX, screenY, width, height, heightProgress, 1)
        return
      }

      const elapsed = now - (building.constructionStartTime || 0)

      if (!building.constructionFinished) {
        // Calculate progress for construction animation
        const heightProgress = Math.min(elapsed / 3000, 1)
        const colorProgress = elapsed > 3000 ? Math.min((elapsed - 3000) / 2000, 1) : 0

        // Mark as finished after animation completes
        if (elapsed >= 5000) {
          building.constructionFinished = true
          if (!building.aiApiCompletionRecorded && gameState.gameStarted && !gameState.mapEditMode) {
            recordBuildingCompleted({
              building,
              tick: gameState.frameCount,
              timeSeconds: gameState.gameTime
            })
            building.aiApiCompletionRecorded = true
          }
        }

        this.drawBuildingUnderConstruction(
          ctx,
          img,
          screenX,
          screenY,
          width,
          height,
          heightProgress,
          colorProgress
        )
      } else {
        if (building.type === 'artilleryTurret') {
          const centerX = screenX + width / 2
          const centerY = screenY + height / 2
          ctx.save()
          ctx.translate(centerX, centerY)
          ctx.rotate((building.turretDirection || 0) + Math.PI * 3 / 4)
          ctx.drawImage(img, -width / 2, -height / 2, width, height)
          // Big muzzle flash when firing
          if (building.muzzleFlashStartTime && now - building.muzzleFlashStartTime <= MUZZLE_FLASH_DURATION) {
            const progress = (now - building.muzzleFlashStartTime) / MUZZLE_FLASH_DURATION
            const alpha = 1 - progress
            const size = 24 * (1 - progress * 0.5)
            const fx = 7 - width / 2
            const fy = 13 - height / 2
            ctx.save()
            ctx.globalAlpha = alpha
            const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, size)
            grad.addColorStop(0, '#FFF')
            grad.addColorStop(0.3, '#FF0')
            grad.addColorStop(1, 'rgba(255,165,0,0)')
            ctx.fillStyle = grad
            ctx.beginPath()
            ctx.arc(fx, fy, size, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }
          ctx.restore()
        } else if (building.type === 'teslaCoil') {
          this.drawTeslaCoilImage(ctx, img, building, screenX, screenY, width, height)
        } else {
          this.drawBuildingImageNatural(ctx, img, screenX, screenY, width, height)
        }
      }
    } else {
      // No image available, use fallback
      this.drawFallbackBuilding(ctx, building, screenX, screenY, width, height)
    }

    this.renderTurret(ctx, building, screenX, screenY, width, height)
    this.renderServiceRadius(ctx, building, screenX, screenY, width, height)
    this.renderSelection(ctx, building, screenX, screenY, width, height)
    if (building.type !== 'concreteWall') {
      this.renderOwnerIndicator(ctx, building, screenX, screenY)
    }
    this.renderRepairAnimation(ctx, building, screenX, screenY, width, height)
    this.renderPendingRepairCountdown(ctx, building, screenX, screenY, width, height)
  }

  renderBuildingOverlays(ctx, building, scrollOffset) {
    if (building.isBeingSold) {
      return
    }
    const screenX = building.x * TILE_SIZE - scrollOffset.x
    const screenY = building.y * TILE_SIZE - scrollOffset.y
    const width = building.width * TILE_SIZE
    const height = building.height * TILE_SIZE

    this.renderHealthBar(ctx, building, screenX, screenY, width)
    this.renderHelipadFuel(ctx, building, screenX, screenY, width, height)
    this.renderHelipadAmmo(ctx, building, screenX, screenY, width, height)
    this.renderTurretAmmo(ctx, building, screenX, screenY, width, height)
    this.renderAttackTargetIndicator(ctx, building, screenX, screenY, width, height)
    this.renderFactoryProductionProgress(ctx, building, screenX, screenY, width, height)
    this.renderWorkshopRestoration(ctx, building, screenX, screenY, width, height)
    this.renderHospitalHealing(ctx, building, screenX, screenY, width, height)
    this.renderPlayerAlias(ctx, building, screenX, screenY, width, height)
    this.renderFactoryBudget(ctx, building, screenX, screenY, width, height)
    this.renderFactoryPowerStatus(ctx, building, screenX, screenY, width, height)
  }

  drawBuildingImageNatural(ctx, img, screenX, screenY, maxWidth, maxHeight) {
    // Save canvas state to isolate our rendering
    ctx.save()

    // Don't reset transforms - use the existing canvas state to maintain proper coordinate system
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Draw the image to fill the entire building grid space
    // This ensures buildings appear at the correct size and position
    ctx.drawImage(img, screenX, screenY, maxWidth, maxHeight)

    // Restore canvas state
    ctx.restore()
  }

  drawTeslaCoilImage(ctx, img, building, screenX, screenY, maxWidth, maxHeight) {
    const SOURCE_HEIGHT = 192
    const CHARGE_CLIP_START = 51
    const CHARGE_DURATION = 400

    ctx.save()

    let clipY = CHARGE_CLIP_START
    if (building.teslaState === 'charging') {
      const progress = Math.min((performance.now() - (building.teslaChargeStartTime || 0)) / CHARGE_DURATION, 1)
      clipY = CHARGE_CLIP_START * (1 - progress)
    } else if (building.teslaState === 'firing') {
      clipY = 0
    }

    const sourceHeight = SOURCE_HEIGHT - clipY
    const destHeight = maxHeight * (sourceHeight / SOURCE_HEIGHT)
    const destY = screenY + maxHeight - destHeight

    ctx.drawImage(img, 0, clipY, SOURCE_HEIGHT, sourceHeight, screenX, destY, maxWidth, destHeight)
    ctx.restore()
  }

  drawBuildingUnderConstruction(
    ctx,
    img,
    screenX,
    screenY,
    maxWidth,
    maxHeight,
    heightProgress,
    colorProgress
  ) {
    ctx.save()

    // Apply grayscale filter that decreases as colorProgress increases
    const grayscale = 100 - colorProgress * 100
    ctx.filter = `grayscale(${grayscale}%)`

    // Clip the image from bottom to top according to heightProgress
    const clipHeight = maxHeight * heightProgress
    ctx.beginPath()
    ctx.rect(screenX, screenY + maxHeight - clipHeight, maxWidth, clipHeight)
    ctx.clip()

    ctx.drawImage(img, screenX, screenY, maxWidth, maxHeight)

    ctx.restore()
  }

  drawFallbackBuilding(ctx, building, screenX, screenY, width, height) {
    // Fallback to the old rectangle rendering if no image is available
    ctx.fillStyle = '#777'
    ctx.fillRect(screenX, screenY, width, height)

    // Draw building outline
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.strokeRect(screenX, screenY, width, height)

    // Draw building type identifier as text
    ctx.fillStyle = '#fff'
    ctx.font = '10px "Rajdhani", "Arial Narrow", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(building.type, screenX + width / 2, screenY + height / 2)
  }

  renderTurret(ctx, building, screenX, screenY, width, height) {
    // Draw turret for defensive buildings
    if (building.type === 'rocketTurret' || building.type.startsWith('turretGun') || building.type === 'teslaCoil' || building.type === 'artilleryTurret') {
      const centerX = screenX + width / 2
      const centerY = screenY + height / 2

      // For Tesla Coil, draw range indicator if selected
      if (building.type === 'teslaCoil') {
        // Draw range indicator if selected
        if (building.selected) {
          ctx.save()
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.25)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(centerX, centerY, building.fireRange * TILE_SIZE, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
      }

      // For Artillery Turret, draw range indicator if selected (similar to Tesla Coil but red)
      if (building.type === 'artilleryTurret') {
        // Draw range indicator if selected
        if (building.selected) {
          ctx.save()
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.25)'
          ctx.lineWidth = 2
          const maxRange = building.fireRange * TILE_SIZE
          const minRange = (building.minFireRange || 0) * TILE_SIZE
          ctx.beginPath()
          ctx.arc(centerX, centerY, maxRange, 0, Math.PI * 2)
          ctx.stroke()
          if (minRange > 0) {
            ctx.setLineDash([6, 6])
            ctx.beginPath()
            ctx.arc(centerX, centerY, minRange, 0, Math.PI * 2)
            ctx.stroke()
            ctx.setLineDash([])
          }
          ctx.restore()
        }
      }
      // For turret guns, try image-based rendering first
      else if (building.type.startsWith('turretGun')) {
        // Try to render with images first (for turretGunV1) if the toggle is enabled
        if (gameState.useTurretImages && turretImagesAvailable(building.type)) {
          const rendered = renderTurretWithImages(ctx, building, screenX, screenY, width, height)
          if (rendered) {
            return // Successfully rendered with images, skip fallback rendering
          }
        }

        // Fallback to original drawing method
        const now = performance.now()

        // Calculate recoil offset
        let recoilOffset = 0
        if (building.recoilStartTime && now - building.recoilStartTime <= RECOIL_DURATION) {
          const progress = (now - building.recoilStartTime) / RECOIL_DURATION
          // Use a smooth easing function for recoil
          const easedProgress = 1 - Math.pow(1 - progress, 3)
          recoilOffset = TURRET_RECOIL_DISTANCE * (1 - easedProgress)
        }

        // Draw turret with rotation
        ctx.save()
        ctx.translate(centerX, centerY)
        ctx.rotate(building.turretDirection || 0)

        // Apply recoil offset (move turret backwards)
        ctx.translate(-recoilOffset, 0)

        // Draw the turret barrel with different styles based on turret type
        if (building.type === 'turretGunV1') {
          // V1 - Basic turret
          ctx.strokeStyle = '#00F'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.lineTo(TILE_SIZE * 0.7, 0)
          ctx.stroke()
        } else if (building.type === 'turretGunV2') {
          // V2 - Advanced targeting turret
          ctx.strokeStyle = '#0FF'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.lineTo(TILE_SIZE * 0.8, 0)
          ctx.stroke()

          // Add targeting reticle
          ctx.strokeStyle = '#0FF'
          ctx.beginPath()
          ctx.arc(TILE_SIZE * 0.4, 0, 4, 0, Math.PI * 2)
          ctx.stroke()
        } else if (building.type === 'turretGunV3') {
          // V3 - Heavy burst fire turret
          ctx.strokeStyle = '#FF0'
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.lineTo(TILE_SIZE * 0.9, 0)
          ctx.stroke()

          // Draw double barrel
          ctx.strokeStyle = '#FF0'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(TILE_SIZE * 0.3, -3)
          ctx.lineTo(TILE_SIZE * 0.9, -3)
          ctx.moveTo(TILE_SIZE * 0.3, 3)
          ctx.lineTo(TILE_SIZE * 0.9, 3)
          ctx.stroke()
        }

        // Render muzzle flash for turrets
        if (building.muzzleFlashStartTime && now - building.muzzleFlashStartTime <= MUZZLE_FLASH_DURATION) {
          const flashProgress = (now - building.muzzleFlashStartTime) / MUZZLE_FLASH_DURATION
          const flashAlpha = 1 - flashProgress
          const flashSize = MUZZLE_FLASH_SIZE * (1 - flashProgress * 0.5)

          ctx.save()
          ctx.globalAlpha = flashAlpha

          // Create radial gradient for muzzle flash
          const gradient = ctx.createRadialGradient(TILE_SIZE * 0.7, 0, 0, TILE_SIZE * 0.7, 0, flashSize)
          gradient.addColorStop(0, '#FFF')
          gradient.addColorStop(0.3, '#FF0')
          gradient.addColorStop(1, 'rgba(255, 165, 0, 0)')

          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(TILE_SIZE * 0.7, 0, flashSize, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }

        // Draw turret base
        ctx.fillStyle = '#222'
        ctx.beginPath()
        ctx.arc(0, 0, 8, 0, Math.PI * 2)
        ctx.fill()

        // Draw ready indicator if the turret can fire
        if (!building.lastShotTime || performance.now() - building.lastShotTime >= building.fireCooldown) {
          ctx.fillStyle = '#0F0'
          ctx.beginPath()
          ctx.arc(0, 0, 4, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.restore()
      } else if (building.type === 'rocketTurret') {
        const now = performance.now()

        if (building.muzzleFlashStartTime && now - building.muzzleFlashStartTime <= MUZZLE_FLASH_DURATION) {
          const flashProgress = (now - building.muzzleFlashStartTime) / MUZZLE_FLASH_DURATION
          const flashAlpha = 1 - flashProgress
          const flashSize = MUZZLE_FLASH_SIZE * 1.5 * (1 - flashProgress * 0.5)
          const muzzleIndex = building.muzzleFlashIndex || 0
          const muzzleOffset = ROCKET_TURRET_MUZZLE_OFFSETS[muzzleIndex % ROCKET_TURRET_MUZZLE_OFFSETS.length]
          const flashX = screenX + (muzzleOffset.x / ROCKET_TURRET_IMAGE_COORDS_SIZE) * width
          const flashY = screenY + (muzzleOffset.y / ROCKET_TURRET_IMAGE_COORDS_SIZE) * height

          ctx.save()
          ctx.globalAlpha = flashAlpha

          const gradient = ctx.createRadialGradient(flashX, flashY, 0, flashX, flashY, flashSize)
          gradient.addColorStop(0, '#FFF')
          gradient.addColorStop(0.2, '#FF0')
          gradient.addColorStop(0.5, '#FF4500')
          gradient.addColorStop(1, 'rgba(255, 69, 0, 0)')

          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(flashX, flashY, flashSize, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      }

      // Draw range indicator if selected (for non-tesla coil and non-artillery buildings)
      if (building.selected && building.type !== 'teslaCoil' && building.type !== 'artilleryTurret') {
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)'
        ctx.beginPath()
        ctx.arc(centerX, centerY, building.fireRange * TILE_SIZE, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  renderServiceRadius(ctx, building, screenX, screenY, width, height) {
    if (!building?.selected || !isServiceBuilding(building)) {
      return
    }

    const radius = getServiceRadiusPixels(building)
    if (!radius) {
      return
    }

    const centerX = screenX + width / 2
    const centerY = screenY + height / 2

    ctx.save()
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.45)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 6])
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  renderSelection(ctx, building, screenX, screenY, width, height) {
    // Draw selection corner indicators if building is selected
    if (building.selected) {
      ctx.strokeStyle = '#FF0'
      ctx.lineWidth = 2

      const cornerSize = 12 // Size of corner brackets
      const offset = 2 // Offset from building edge

      // Top-left corner
      ctx.beginPath()
      ctx.moveTo(screenX - offset, screenY - offset + cornerSize)
      ctx.lineTo(screenX - offset, screenY - offset)
      ctx.lineTo(screenX - offset + cornerSize, screenY - offset)
      ctx.stroke()

      // Top-right corner
      ctx.beginPath()
      ctx.moveTo(screenX + width + offset - cornerSize, screenY - offset)
      ctx.lineTo(screenX + width + offset, screenY - offset)
      ctx.lineTo(screenX + width + offset, screenY - offset + cornerSize)
      ctx.stroke()

      // Bottom-left corner
      ctx.beginPath()
      ctx.moveTo(screenX - offset, screenY + height + offset - cornerSize)
      ctx.lineTo(screenX - offset, screenY + height + offset)
      ctx.lineTo(screenX - offset + cornerSize, screenY + height + offset)
      ctx.stroke()

      // Bottom-right corner
      ctx.beginPath()
      ctx.moveTo(screenX + width + offset - cornerSize, screenY + height + offset)
      ctx.lineTo(screenX + width + offset, screenY + height + offset)
      ctx.lineTo(screenX + width + offset, screenY + height + offset - cornerSize)
      ctx.stroke()
    }
  }

  renderHealthBar(ctx, building, screenX, screenY, width) {
    // Only show health bar if building is damaged or selected
    const isDamaged = building.health < building.maxHealth
    const isSelected = building.selected

    if (!isDamaged && !isSelected) {
      return
    }

    // Draw health bar
    const healthBarWidth = width
    const healthBarHeight = 5
    const healthPercentage = building.health / building.maxHealth

    // Background
    ctx.fillStyle = '#333'
    ctx.fillRect(screenX, screenY - 10, healthBarWidth, healthBarHeight)

    // Health
    ctx.fillStyle = healthPercentage > 0.6 ? '#0f0' :
      healthPercentage > 0.3 ? '#ff0' : '#f00'
    ctx.fillRect(screenX, screenY - 10, healthBarWidth * healthPercentage, healthBarHeight)
  }

  renderHelipadFuel(ctx, building, screenX, screenY, width, height) {
    if (building.type !== 'helipad') {
      return
    }

    if (!building.selected || typeof building.maxFuel !== 'number' || building.maxFuel <= 0) {
      return
    }

    const margin = 4
    const barWidth = 5
    const barHeight = Math.max(0, height - margin * 2)
    if (barHeight <= 0) {
      return
    }

    const ratio = Math.max(0, Math.min(1, (building.fuel ?? building.maxFuel) / building.maxFuel))
    const barX = screenX + width - barWidth - margin / 2
    const barY = screenY + margin

    ctx.fillStyle = '#333'
    ctx.fillRect(barX, barY, barWidth, barHeight)

    const fillHeight = barHeight * ratio
    ctx.fillStyle = '#4A90E2'
    ctx.fillRect(barX, barY + barHeight - fillHeight, barWidth, fillHeight)

    ctx.strokeStyle = '#000'
    ctx.strokeRect(barX, barY, barWidth, barHeight)
  }

  renderHelipadAmmo(ctx, building, screenX, screenY, width, height) {
    if (building.type !== 'helipad') {
      return
    }

    if (!building.selected || typeof building.maxAmmo !== 'number' || building.maxAmmo <= 0) {
      return
    }

    const margin = 4
    const barWidth = 5
    const barHeight = Math.max(0, height - margin * 2)
    if (barHeight <= 0) {
      return
    }

    const ratio = Math.max(0, Math.min(1, (building.ammo ?? building.maxAmmo) / building.maxAmmo))
    const barX = screenX + margin / 2
    const barY = screenY + margin

    ctx.fillStyle = '#333'
    ctx.fillRect(barX, barY, barWidth, barHeight)

    const fillHeight = barHeight * ratio
    ctx.fillStyle = '#FFA500' // Orange color for ammunition
    ctx.fillRect(barX, barY + barHeight - fillHeight, barWidth, fillHeight)

    ctx.strokeStyle = '#000'
    ctx.strokeRect(barX, barY, barWidth, barHeight)
  }


  renderTurretAmmo(ctx, building, screenX, screenY, width, height) {
    const ammoTurretTypes = new Set(['turretGunV1', 'turretGunV2', 'turretGunV3', 'rocketTurret', 'artilleryTurret'])
    if (!ammoTurretTypes.has(building.type)) {
      return
    }

    if (!building.selected || typeof building.maxAmmo !== 'number' || building.maxAmmo <= 0) {
      return
    }

    const margin = 4
    const barWidth = 5
    const barHeight = Math.max(0, height - margin * 2)
    if (barHeight <= 0) {
      return
    }

    const ratio = Math.max(0, Math.min(1, (building.ammo ?? 0) / building.maxAmmo))
    const barX = screenX + margin / 2
    const barY = screenY + margin

    ctx.fillStyle = '#333'
    ctx.fillRect(barX, barY, barWidth, barHeight)

    const fillHeight = barHeight * ratio
    ctx.fillStyle = '#FFA500'
    ctx.fillRect(barX, barY + barHeight - fillHeight, barWidth, fillHeight)

    const cooldown = Math.max(1, building.fireCooldown || 1)
    const now = performance.now()
    const elapsed = building.lastShotTime ? now - building.lastShotTime : cooldown
    const reloadRatio = building.currentBurst > 0 ? 0 : Math.max(0, Math.min(1, elapsed / cooldown))
    const reloadLineY = barY + barHeight - (barHeight * reloadRatio)
    ctx.strokeStyle = '#FF0000'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(barX, reloadLineY)
    ctx.lineTo(barX + barWidth, reloadLineY)
    ctx.stroke()

    ctx.strokeStyle = '#000'
    ctx.strokeRect(barX, barY, barWidth, barHeight)
  }

  renderOwnerIndicator(ctx, building, screenX, screenY) {
    // Draw a small flag instead of a filled square
    const partyColor = PARTY_COLORS[building.owner] || PARTY_COLORS.player

    const _width = building.width * TILE_SIZE
    const height = building.height * TILE_SIZE

    // Position the flag pole at ground level in the top left corner
    const baseX = screenX + 2
    const baseY = screenY + height - 2

    const poleHeight = 10
    const poleWidth = 2
    const flagWidth = 6 // Should not exceed previous indicator width
    const flagHeight = 4

    // Draw pole
    ctx.fillStyle = '#777' // Dark silver
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.fillRect(baseX - poleWidth / 2, baseY - poleHeight, poleWidth, poleHeight)
    ctx.strokeRect(baseX - poleWidth / 2, baseY - poleHeight, poleWidth, poleHeight)

    // Calculate waving flag polygon
    const topX = baseX + poleWidth / 2
    const topY = baseY - poleHeight + 1

    const time = performance.now()
    const amplitude = 1.5
    const segments = 3

    ctx.fillStyle = partyColor
    ctx.beginPath()
    ctx.moveTo(topX, topY)

    for (let i = 1; i <= segments; i++) {
      const t = i / segments
      const x = topX + t * flagWidth
      const wave = Math.sin(time / 200 + t * 3) * amplitude
      const y = topY + WIND_DIRECTION.y * flagWidth * t + wave
      ctx.lineTo(x, y)
    }
    for (let i = segments; i >= 0; i--) {
      const t = i / segments
      const x = topX + t * flagWidth
      const wave = Math.sin(time / 200 + t * 3 + 0.5) * amplitude
      const y = topY + flagHeight + WIND_DIRECTION.y * flagWidth * t + wave
      ctx.lineTo(x, y)
    }

    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  getForcedAttackQueuePosition(selectedBuilding, targetBuilding) {
    if (!selectedBuilding || !selectedBuilding.isBuilding || !targetBuilding) {
      return null
    }

    if (selectedBuilding.forcedAttackTarget?.id === targetBuilding.id) {
      return 1
    }

    if (!Array.isArray(selectedBuilding.forcedAttackQueue)) {
      return null
    }

    const index = selectedBuilding.forcedAttackQueue.findIndex(target => target?.id === targetBuilding.id)
    if (index === -1) {
      return null
    }

    return (selectedBuilding.forcedAttackTarget ? 2 : 1) + index
  }

  renderAttackTargetIndicator(ctx, building, screenX, screenY, width, _height) {
    // Check if this building is in the attack group targets OR if it's currently being targeted by selected units
    const isInAttackGroupTargets = gameState.attackGroupTargets &&
                                   gameState.attackGroupTargets.some(target => target === building)

    // Check if any selected unit is targeting this building (for normal attacks and to show after reselection)
    const isTargetedBySelectedUnit = selectedUnits &&
                                     selectedUnits.some(selectedUnit =>
                                       selectedUnit.target === building ||
                                       (selectedUnit.attackQueue && selectedUnit.attackQueue.includes(building))
                                     )

    let forcedAttackQueuePosition = null
    if (Array.isArray(selectedUnits) && selectedUnits.length > 0) {
      selectedUnits.forEach(selectedUnit => {
        if (!selectedUnit?.selected || !selectedUnit?.isBuilding || selectedUnit.owner !== gameState.humanPlayer) {
          return
        }
        const position = this.getForcedAttackQueuePosition(selectedUnit, building)
        if (position !== null) {
          forcedAttackQueuePosition = forcedAttackQueuePosition === null ? position : Math.min(forcedAttackQueuePosition, position)
        }
      })
    }

    // Show red indicator if: building is in AGF targets OR being targeted by a selected unit OR queued by selected defense buildings
    const shouldShowAttackIndicator = isInAttackGroupTargets || isTargetedBySelectedUnit || forcedAttackQueuePosition !== null

    if (shouldShowAttackIndicator) {
      const now = performance.now()
      const bounceOffset = Math.sin(now * ATTACK_TARGET_BOUNCE_SPEED) * 3 // 3 pixel bounce

      // Position above the building center
      const indicatorX = screenX + width / 2
      const indicatorY = screenY - 15 + bounceOffset

      // Draw semi-transparent red triangle (50% transparency, half size)
      ctx.save()
      ctx.fillStyle = 'rgba(255, 0, 0, 0.35)' // Reduced from 0.7 to 0.35
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)' // Reduced from 1.0 to 0.5
      ctx.lineWidth = 1

      const halfSize = ATTACK_TARGET_INDICATOR_SIZE / 2 // Half the original size

      // Draw triangle pointing down
      ctx.beginPath()
      ctx.moveTo(indicatorX, indicatorY + halfSize)
      ctx.lineTo(indicatorX - halfSize, indicatorY - halfSize)
      ctx.lineTo(indicatorX + halfSize, indicatorY - halfSize)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      if (forcedAttackQueuePosition !== null) {
        ctx.fillStyle = '#fff'
        ctx.font = '10px "Rajdhani", "Arial Narrow", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(forcedAttackQueuePosition), indicatorX, indicatorY - halfSize / 3 + 2)
      }

      ctx.restore()
    }
  }

  renderRepairAnimation(ctx, building, screenX, screenY, width, height) {
    // Check if this building is currently under repair
    const isUnderRepair = gameState.buildingsUnderRepair &&
                          gameState.buildingsUnderRepair.some(repair => repair.building === building)

    if (!isUnderRepair || !this.wrenchIcon) {
      return
    }

    const now = performance.now()
    const cycleTime = 4000 // 4 second cycle time
    const cycleProgress = (now % cycleTime) / cycleTime

    // Create smooth in-out fading animation
    // Alpha varies from 0.3 to 1.0 in a sine wave pattern
    const alpha = 0.3 + 0.7 * (Math.sin(cycleProgress * Math.PI * 2) * 0.5 + 0.5)

    // Position at center of building
    const centerX = screenX + width / 2
    const centerY = screenY + height / 2

    // Icon size - 3x bigger than before, scale based on building size but cap it
    const iconSize = Math.min(72, Math.min(width, height) * 1.2)

    ctx.save()
    ctx.globalAlpha = alpha

    try {
      // Draw the repair cursor icon in yellow
      // Use canvas color manipulation to make it yellow
      ctx.filter = 'hue-rotate(40deg) saturate(2) brightness(1.5)'
      ctx.drawImage(
        this.wrenchIcon,
        centerX - iconSize / 2,
        centerY - iconSize / 2,
        iconSize,
        iconSize
      )

    } catch {
      // Fallback: draw a simple wrench shape if image fails
      ctx.filter = 'none'
      ctx.fillStyle = `rgba(255, 215, 0, ${alpha})` // Gold color
      ctx.strokeStyle = `rgba(255, 165, 0, ${alpha})` // Orange outline
      ctx.lineWidth = 3

      // Draw simple wrench shape - 3x bigger
      const wrenchSize = iconSize * 0.8
      ctx.beginPath()
      // Handle
      ctx.rect(centerX - wrenchSize / 8, centerY - wrenchSize / 2, wrenchSize / 4, wrenchSize * 0.6)
      // Head
      ctx.rect(centerX - wrenchSize / 3, centerY + wrenchSize / 6, wrenchSize * 0.6, wrenchSize / 4)
      ctx.fill()
      ctx.stroke()
    }

    ctx.restore()
  }

  renderPendingRepairCountdown(ctx, building, screenX, screenY, width, _height) {
    // Check if this building has a pending repair with countdown
    const pendingRepair = gameState.buildingsAwaitingRepair &&
                         gameState.buildingsAwaitingRepair.find(repair => repair.building === building)

    if (!pendingRepair) {
      return
    }

    // Use the pre-computed countdown from the awaiting repair system
    const secondsRemaining = pendingRepair.remainingCooldown

    if (secondsRemaining <= 0) {
      return // Countdown is over
    }

    // Calculate progress (reverse progress bar: 100% to 0%)
    const progress = secondsRemaining / 10 // 10 seconds total

    // Position above the health bar to avoid overlap with selection markers
    // Health bar is at screenY - 10, so we place this at screenY - 13 (3px height)
    const progressBarWidth = width // Same width as health bar
    const progressBarHeight = 3 // Same height as harvester loading bars
    const progressBarX = screenX
    const progressBarY = screenY - 13

    ctx.save()

    // Background bar
    ctx.fillStyle = '#333'
    ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight)

    // Progress fill (red color for attack cooldown)
    ctx.fillStyle = '#ff4444'
    ctx.fillRect(progressBarX, progressBarY, progressBarWidth * progress, progressBarHeight)

    ctx.restore()
  }

  renderFactoryProductionProgress(ctx, building, screenX, screenY, width, _height) {
    // Check if this is a factory (construction yard or vehicle factory) that's currently building something
    let factory = null
    let isFactory = false
    let currentlyBuilding = null
    let buildStartTime = null
    let buildDuration = null

    // Check if it's a construction yard factory
    if (building.type === 'constructionYard' && building.id && gameState.factories) {
      factory = gameState.factories.find(f => f.id === building.owner)
      if (factory && factory.currentlyBuilding) {
        isFactory = true
        currentlyBuilding = factory.currentlyBuilding
        buildStartTime = factory.buildStartTime
        buildDuration = factory.buildDuration
      }
    }
    // Check if it's a vehicle factory building (AI can use these for unit production)
    else if (building.type === 'vehicleFactory' && building.owner && building.owner !== gameState.humanPlayer) {
      // For enemy vehicle factories, we need to check if they're producing something
      // We can use the factory system to track this
      factory = gameState.factories?.find(f => f.id === building.owner)
      if (factory && factory.currentlyProducingUnit &&
          ['harvester', 'tank_v1', 'tank-v2', 'tank-v3', 'rocketTank', 'tankerTruck', 'howitzer'].includes(factory.currentlyProducingUnit)) {
        isFactory = true
        currentlyBuilding = factory.currentlyProducingUnit
        buildStartTime = factory.unitBuildStartTime
        buildDuration = factory.unitBuildDuration
      }
    }

    if (!isFactory || !currentlyBuilding) {
      return
    }

    const now = performance.now()
    const elapsed = now - (buildStartTime || 0)
    const progress = Math.min(elapsed / (buildDuration || 5000), 1)

    if (progress <= 0 || progress >= 1) {
      return // No progress to show
    }

    // Position the progress bar below the health bar to avoid overlap
    // Health bar is at screenY - 10, so we place this at screenY - 16 (6px gap + 3px height)
    const progressBarWidth = width
    const progressBarHeight = 3
    const progressBarX = screenX
    const progressBarY = screenY - 16

    ctx.save()

    // Background bar
    ctx.fillStyle = '#333'
    ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight)

    // Progress fill (blue color for production)
    ctx.fillStyle = '#4CAF50' // Green for building production
    if (['harvester', 'tank_v1', 'tank-v2', 'tank-v3', 'rocketTank', 'tankerTruck', 'howitzer'].includes(currentlyBuilding)) {
      ctx.fillStyle = '#2196F3' // Blue for unit production
    }
    ctx.fillRect(progressBarX, progressBarY, progressBarWidth * progress, progressBarHeight)

    // Border
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.strokeRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight)

    // Show what's being built (text above the progress bar)
    if (building.owner !== gameState.humanPlayer) { // Only show for enemy factories
      ctx.fillStyle = '#FFF'
      ctx.font = '10px "Rajdhani", "Arial Narrow", sans-serif'
      ctx.textAlign = 'center'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 2

      // Create more readable building names
      let displayName = currentlyBuilding
      if (currentlyBuilding === 'tank_v1') displayName = 'Tank'
      else if (currentlyBuilding === 'tank-v2') displayName = 'Tank V2'
      else if (currentlyBuilding === 'tank-v3') displayName = 'Tank V3'
      else if (currentlyBuilding === 'rocketTank') displayName = 'Rocket Tank'
      else if (currentlyBuilding === 'howitzer') displayName = 'Howitzer'
      else if (currentlyBuilding === 'tankerTruck') displayName = 'Tanker Truck'
      else if (currentlyBuilding === 'oreRefinery') displayName = 'Refinery'
      else if (currentlyBuilding === 'vehicleFactory') displayName = 'Vehicle Factory'
      else if (currentlyBuilding === 'powerPlant') displayName = 'Power Plant'
      else if (currentlyBuilding === 'turretGunV1') displayName = 'Turret'
      else if (currentlyBuilding === 'turretGunV2') displayName = 'Turret V2'
      else if (currentlyBuilding === 'turretGunV3') displayName = 'Turret V3'
      else if (currentlyBuilding === 'rocketTurret') displayName = 'Rocket Turret'
      else if (currentlyBuilding === 'radarStation') displayName = 'Radar'
      else if (currentlyBuilding === 'teslaCoil') displayName = 'Tesla Coil'
      else if (currentlyBuilding === 'harvester') displayName = 'Harvester'

      // Add black outline for better readability
      ctx.strokeText(displayName, screenX + width / 2, screenY - 18)
      ctx.fillText(displayName, screenX + width / 2, screenY - 18)
    }

    ctx.restore()
  }

  renderWorkshopRestoration(ctx, building, screenX, screenY, width, height) {
    // Only render for vehicle workshops
    if (building.type !== 'vehicleWorkshop') {
      return
    }

    // Check if workshop is currently restoring something
    if (!building.currentRestoration || !building.restorationProgress) {
      return
    }

    const progress = building.restorationProgress

    // Render progress bar below the building (small bar, always visible)
    const progressBarWidth = width * 0.8
    const progressBarHeight = 3
    const progressBarX = screenX + (width - progressBarWidth) / 2
    const progressBarY = screenY + height + 2 // Just below the building

    ctx.save()

    // Background bar
    ctx.fillStyle = '#333'
    ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight)

    // Progress fill (gold color for restoration)
    ctx.fillStyle = '#FFD700'
    ctx.fillRect(progressBarX, progressBarY, progressBarWidth * progress, progressBarHeight)

    // Border
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.strokeRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight)

    ctx.restore()
  }

  renderHospitalHealing(ctx, building, screenX, screenY, width, height) {
    // Only render for hospitals
    if (building.type !== 'hospital') {
      return
    }

    // Check if hospital is currently healing units
    if (!building.healingUnits || building.healingUnits.length === 0) {
      return
    }

    // Render progress bars for each healing unit
    building.healingUnits.forEach((healing, index) => {
      const progress = healing.progress / healing.totalProgress

      // Position bars below the building, stacked vertically
      const progressBarWidth = width * 0.8
      const progressBarHeight = 3
      const progressBarX = screenX + (width - progressBarWidth) / 2
      const progressBarY = screenY + height + 2 + (index * (progressBarHeight + 1)) // Stack bars

      ctx.save()

      // Background bar
      ctx.fillStyle = '#333'
      ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight)

      // Progress fill (green color for healing)
      ctx.fillStyle = '#00FF00'
      ctx.fillRect(progressBarX, progressBarY, progressBarWidth * progress, progressBarHeight)

      // Border
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      ctx.strokeRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight)

      ctx.restore()
    })
  }

  renderFactoryBudget(ctx, building, screenX, screenY, width, _height) {
    // Show enemy budget only when their construction yard is selected AND showEnemyResources is enabled
    if (
      building.type === 'constructionYard' &&
      building.owner !== gameState.humanPlayer &&
      building.selected &&
      gameState.factories &&
      gameState.showEnemyResources
    ) {
      const factory = gameState.factories.find(f => f.id === building.owner)
      if (factory && typeof factory.budget === 'number') {
        const budgetText = `$${Math.round(factory.budget)}`
        ctx.save()
        ctx.fillStyle = '#FFF'
        ctx.font = '12px "Rajdhani", "Arial Narrow", sans-serif'
        ctx.textAlign = 'center'
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 2
        const textX = screenX + width / 2
        const textY = screenY // display above building
        ctx.strokeText(budgetText, textX, textY)
        ctx.fillText(budgetText, textX, textY)
        ctx.restore()
      }
    }
  }

  renderFactoryPowerStatus(ctx, building, screenX, screenY, width, _height) {
    // Show power status when an enemy construction yard is selected AND showEnemyResources is enabled
    if (
      building.type === 'constructionYard' &&
      building.owner !== gameState.humanPlayer &&
      building.selected &&
      gameState.showEnemyResources
    ) {
      const powerText = `Power: ${gameState.enemyPowerSupply}`
      ctx.save()
      ctx.fillStyle = '#FFF'
      ctx.font = '12px "Rajdhani", "Arial Narrow", sans-serif'
      ctx.textAlign = 'center'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 2
      const textX = screenX + width / 2
      // Display power below the budget text
      const textY = screenY + 12
      ctx.strokeText(powerText, textX, textY)
      ctx.fillText(powerText, textX, textY)
      ctx.restore()
    }
  }

  renderPlayerAlias(ctx, building, screenX, screenY, width, _height) {
    // Only show alias above construction yards in multiplayer mode
    if (building.type !== 'constructionYard') {
      return
    }

    // Check if we're in multiplayer mode
    const isMultiplayer = gameState.multiplayerSession?.isRemote ||
      (gameState.partyStates && gameState.partyStates.some(p => !p.aiActive))

    if (!isMultiplayer) {
      return
    }

    // Find the party state for this building's owner
    const partyState = gameState.partyStates?.find(p => p.partyId === building.owner)
    if (!partyState) {
      return
    }

    // Get the alias (owner field contains "AI", "You (Host)", or player's alias)
    const alias = partyState.owner || 'Unknown'

    // Don't show "AI" - only show human player aliases
    if (alias === 'AI') {
      return
    }

    ctx.save()
    ctx.font = 'bold 11px "Rajdhani", "Arial Narrow", sans-serif'
    ctx.textAlign = 'center'
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2

    // Use party color for the text
    const partyColor = partyState.color || '#fff'
    ctx.fillStyle = partyColor

    const textX = screenX + width / 2
    // Position above the health bar (which is at screenY - 10)
    const textY = screenY - 18

    ctx.strokeText(alias, textX, textY)
    ctx.fillText(alias, textX, textY)
    ctx.restore()
  }

  renderBases(ctx, buildings, mapGrid, scrollOffset) {
    if (buildings && buildings.length > 0) {
      const viewportWidth = ctx.canvas.width
      const viewportHeight = ctx.canvas.height
      buildings.forEach(building => {
        if (!this.shouldRenderBuilding(building, scrollOffset, viewportWidth, viewportHeight)) return
        this.renderBuildingBase(ctx, building, mapGrid, scrollOffset)
      })
    }
  }

  renderOverlays(ctx, buildings, scrollOffset) {
    if (buildings && buildings.length > 0) {
      const viewportWidth = ctx.canvas.width
      const viewportHeight = ctx.canvas.height
      buildings.forEach(building => {
        if (!this.shouldRenderBuilding(building, scrollOffset, viewportWidth, viewportHeight)) return
        this.renderBuildingOverlays(ctx, building, scrollOffset)
      })
    }
  }

  shouldRenderBuilding(building, scrollOffset, viewportWidth, viewportHeight) {
    if (!building || building.health <= 0) {
      return false
    }

    // View frustum culling - skip buildings outside the visible viewport
    // This is the first check as it's the cheapest and most frequently eliminates entities
    if (scrollOffset && viewportWidth && viewportHeight) {
      const buildingWidthPx = (building.width || 1) * TILE_SIZE
      const buildingHeightPx = (building.height || 1) * TILE_SIZE
      const screenX = building.x * TILE_SIZE - scrollOffset.x
      const screenY = building.y * TILE_SIZE - scrollOffset.y
      const margin = VIEW_FRUSTUM_MARGIN

      if (
        screenX + buildingWidthPx < -margin ||
        screenY + buildingHeightPx < -margin ||
        screenX > viewportWidth + margin ||
        screenY > viewportHeight + margin
      ) {
        return false
      }
    }

    if (!gameState.shadowOfWarEnabled) {
      return true
    }

    const visibilityMap = gameState.visibilityMap
    if (!visibilityMap || !visibilityMap.length) {
      return true
    }

    const friendlyOwners = new Set([gameState.humanPlayer, 'player'])
    if (gameState.humanPlayer === 'player1') {
      friendlyOwners.add('player1')
    }

    if (friendlyOwners.has(building.owner)) {
      return true
    }

    const width = Math.max(1, Math.round(building.width || 1))
    const height = Math.max(1, Math.round(building.height || 1))
    const startTileX = Math.floor(building.x)
    const startTileY = Math.floor(building.y)

    let discovered = false
    let visible = false

    for (let offsetY = 0; offsetY < height; offsetY++) {
      const tileY = startTileY + offsetY
      if (tileY < 0 || tileY >= visibilityMap.length) {
        continue
      }

      const row = visibilityMap[tileY]
      if (!row || !row.length) {
        continue
      }

      for (let offsetX = 0; offsetX < width; offsetX++) {
        const tileX = startTileX + offsetX
        if (tileX < 0 || tileX >= row.length) {
          continue
        }

        const cell = row[tileX]
        if (!cell) {
          continue
        }

        if (cell.discovered) {
          discovered = true
        }

        if (cell.visible) {
          visible = true
        }

        if (discovered && visible) {
          break
        }
      }

      if (discovered && visible) {
        break
      }
    }

    if (!discovered) {
      return false
    }

    return visible
  }
}
