import { TILE_SIZE, UTILITY_SERVICE_INDICATOR_SIZE, UTILITY_SERVICE_INDICATOR_BOUNCE_SPEED } from '../config.js'
import { gameState } from '../gameState.js'
import { renderTankWithImages } from './tankImageRenderer.js'
import { getTankWreckCanvases, getSingleImageWreckSprite } from './wreckSpriteCache.js'
import { selectedUnits } from '../inputHandler.js'

const noiseCanvasCache = new Map()

function getNoiseCanvas(seedKey) {
  if (noiseCanvasCache.has(seedKey)) {
    return noiseCanvasCache.get(seedKey)
  }
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(canvas.width, canvas.height)
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const index = i / 4
    const value = Math.floor(((Math.sin(index * 12.9898 + seedKey * 78.233) * 43758.5453) % 1) * 80)
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 60
  }
  ctx.putImageData(imageData, 0, 0)
  noiseCanvasCache.set(seedKey, canvas)
  return canvas
}

export class WreckRenderer {
  render(ctx, wrecks, scrollOffset) {
    if (!wrecks || wrecks.length === 0) return
    wrecks.forEach(wreck => {
      if (!this.shouldRenderWreck(wreck)) {
        return
      }
      this.renderWreck(ctx, wreck, scrollOffset)
    })
  }

  shouldRenderWreck(wreck) {
    if (!wreck) return false
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

    if (friendlyOwners.has(wreck.owner)) {
      return true
    }

    const tileX = Math.floor((wreck.x + TILE_SIZE / 2) / TILE_SIZE)
    const tileY = Math.floor((wreck.y + TILE_SIZE / 2) / TILE_SIZE)

    if (
      tileY < 0 ||
      tileY >= visibilityMap.length ||
      tileX < 0 ||
      tileX >= (visibilityMap[tileY]?.length || 0)
    ) {
      return false
    }

    const visibility = visibilityMap[tileY]?.[tileX]
    return Boolean(visibility && visibility.visible)
  }

  renderWreck(ctx, wreck, scrollOffset) {
    const centerX = wreck.x + TILE_SIZE / 2 - scrollOffset.x
    const centerY = wreck.y + TILE_SIZE / 2 - scrollOffset.y

    const tankTypes = new Set(['tank_v1', 'tank-v2', 'tank_v2', 'tank-v3', 'tank_v3'])
    const isTank = wreck.unitType && tankTypes.has(wreck.unitType)

    // Check if wreck is being restored (show as unit preview)
    const isBeingRestored = wreck.isBeingRestored || false

    if (isTank) {
      const images = isBeingRestored ? null : getTankWreckCanvases(wreck.unitType)
      const pseudoUnit = {
        type: wreck.unitType,
        direction: isBeingRestored ? Math.PI * 5 / 4 : (wreck.direction || 0), // Southwest during restoration
        turretDirection: isBeingRestored ? Math.PI * 5 / 4 : (wreck.turretDirection || wreck.direction || 0),
        recoilStartTime: null,
        muzzleFlashStartTime: null
      }
      ctx.save()
      if (!images && !isBeingRestored) {
        ctx.filter = 'grayscale(1) saturate(0) brightness(0.75)'
      } else if (isBeingRestored) {
        // Show unit preview with slight transparency during restoration
        ctx.globalAlpha = 0.8
      }
      const rendered = renderTankWithImages(ctx, pseudoUnit, centerX, centerY, {
        images: images || undefined,
        disableRecoil: true,
        disableMuzzleFlash: true
      })
      ctx.restore()
      if (!rendered) {
        this.renderFallback(ctx, wreck, centerX, centerY)
      }
    } else {
      const sprite = isBeingRestored ? null : getSingleImageWreckSprite(wreck.unitType)
      if (sprite) {
        ctx.save()
        ctx.translate(centerX, centerY)
        const rotation = wreck.unitType === 'f22Raptor'
          ? (wreck.direction || 0) + Math.PI / 2
          : (wreck.direction || 0) - Math.PI / 2
        ctx.rotate(rotation)
        const scale = TILE_SIZE / Math.max(sprite.width, sprite.height)
        const width = sprite.width * scale
        const height = sprite.height * scale
        ctx.globalAlpha = 0.95
        ctx.drawImage(sprite, -width / 2, -height / 2, width, height)
        ctx.restore()
      } else {
        this.renderFallback(ctx, wreck, centerX, centerY)
      }
    }

    if (!isBeingRestored) {
      this.renderNoiseOverlay(ctx, wreck, centerX, centerY)
    }
    this.renderUtilityQueueIndicator(ctx, wreck, centerX, centerY)
    this.renderHealthBar(ctx, wreck, scrollOffset)
  }

  getUtilityQueuePosition(selectedUnit, wreck) {
    if (!selectedUnit || !wreck || selectedUnit.type !== 'recoveryTank') {
      return null
    }
    const queue = selectedUnit.utilityQueue
    if (!queue) {
      return null
    }
    const currentType = queue.currentTargetType || 'unit'
    if (queue.currentTargetId === wreck.id && currentType === 'wreck') {
      return 1
    }
    if (!Array.isArray(queue.targets)) {
      return null
    }
    const index = queue.targets.findIndex(entry => {
      if (!entry) return false
      if (typeof entry === 'object') {
        const entryType = entry.type || 'unit'
        return entry.id === wreck.id && entryType === 'wreck'
      }
      return false
    })
    if (index === -1) {
      return null
    }
    return (queue.currentTargetId ? 2 : 1) + index
  }

  renderUtilityQueueIndicator(ctx, wreck, centerX, centerY) {
    if (!selectedUnits || selectedUnits.length === 0) {
      return
    }

    let queuePosition = null
    selectedUnits.forEach(selectedUnit => {
      if (!selectedUnit?.selected) {
        return
      }
      if (selectedUnit.type !== 'recoveryTank') {
        return
      }
      const position = this.getUtilityQueuePosition(selectedUnit, wreck)
      if (position !== null) {
        queuePosition = queuePosition === null ? position : Math.min(queuePosition, position)
      }
    })

    if (queuePosition === null) {
      return
    }

    const now = performance.now()
    const bounceOffset = Math.sin(now * UTILITY_SERVICE_INDICATOR_BOUNCE_SPEED) * 3
    const baseIndicatorY = centerY - TILE_SIZE / 2 - 15 + bounceOffset
    const indicatorX = centerX
    const indicatorY = baseIndicatorY - UTILITY_SERVICE_INDICATOR_SIZE - 4
    const halfSize = UTILITY_SERVICE_INDICATOR_SIZE / 2

    ctx.save()
    ctx.fillStyle = 'rgba(255, 215, 0, 0.45)'
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.85)'
    ctx.lineWidth = 1

    ctx.beginPath()
    ctx.moveTo(indicatorX, indicatorY + halfSize)
    ctx.lineTo(indicatorX - halfSize, indicatorY - halfSize)
    ctx.lineTo(indicatorX + halfSize, indicatorY - halfSize)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#000'
    ctx.font = '10px "Rajdhani", "Arial Narrow", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(queuePosition), indicatorX, indicatorY - halfSize / 3 + 3)

    ctx.restore()
  }

  renderFallback(ctx, wreck, centerX, centerY) {
    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.rotate(wreck.direction || 0)
    ctx.fillStyle = 'rgba(90, 90, 90, 0.9)'
    ctx.fillRect(-TILE_SIZE * 0.35, -TILE_SIZE * 0.2, TILE_SIZE * 0.7, TILE_SIZE * 0.4)
    ctx.fillStyle = 'rgba(40, 40, 40, 0.9)'
    ctx.fillRect(-TILE_SIZE * 0.15, -TILE_SIZE * 0.3, TILE_SIZE * 0.3, TILE_SIZE * 0.6)
    ctx.restore()
  }

  renderNoiseOverlay(ctx, wreck, centerX, centerY) {
    const noiseCanvas = getNoiseCanvas(wreck.spriteCacheKey || wreck.unitType || 'default')
    if (!noiseCanvas) return
    const size = TILE_SIZE * 1.2
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.translate(centerX - size / 2, centerY - size / 2)
    ctx.drawImage(noiseCanvas, 0, 0, size, size)
    ctx.restore()
  }

  renderHealthBar(ctx, wreck, scrollOffset) {
    if (!wreck || gameState.selectedWreckId !== wreck.id) {
      return
    }

    const maxHealth = Math.max(1, wreck.maxHealth || 1)
    const ratio = Math.max(0, Math.min(1, wreck.health / maxHealth))
    const healthBarWidth = TILE_SIZE * 0.8
    const healthBarHeight = 3
    const healthBarX = wreck.x + TILE_SIZE / 2 - scrollOffset.x - healthBarWidth / 2
    const healthBarY = wreck.y - 6 - scrollOffset.y

    ctx.fillStyle = '#333'
    ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight)

    ctx.fillStyle = '#FFD700'
    ctx.fillRect(healthBarX, healthBarY, healthBarWidth * ratio, healthBarHeight)
  }
}

