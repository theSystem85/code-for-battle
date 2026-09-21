// ui/harvesterHUD.js - HUD overlay for harvester assignment visualization
import { TILE_SIZE } from '../config.js'
import { isInputFieldFocused } from '../utils/inputUtils.js'
import { getCanvasLogicalSize } from '../rendering/renderingUtils.js'

export class HarvesterHUD {
  constructor() {
    this.isVisible = false
    this.setupKeyListener()
  }

  setupKeyListener() {
    document.addEventListener('keydown', (event) => {
      // Don't handle keyboard shortcuts if an input field is focused
      if (isInputFieldFocused()) {
        return
      }

      if (event.key.toLowerCase() === 'i') {
        event.preventDefault()
        event.stopPropagation()
        this.toggle()
      }
    })
  }

  toggle() {
    this.isVisible = !this.isVisible
  }

  render(ctx, units, gameState, scrollOffset, entityIndex = null) {
    if (!this.isVisible || !gameState.buildings) return

    // Draw assignment lines for each harvester
    for (const harvester of units) {
      if (
        harvester.type !== 'harvester' ||
        harvester.health <= 0 ||
        !harvester.targetRefinery
      ) {
        continue
      }

      // Find the assigned refinery
      let assignedRefinery = entityIndex?.get(`refinery:${harvester.targetRefinery}`)
      if (!assignedRefinery) {
        for (const refinery of gameState.buildings) {
          if (
            refinery.type === 'oreRefinery' &&
            refinery.health > 0 &&
            (refinery.id || `refinery_${refinery.x}_${refinery.y}`) === harvester.targetRefinery
          ) {
            assignedRefinery = refinery
            break
          }
        }
      }

      if (!assignedRefinery || assignedRefinery.health <= 0) continue

      // Calculate positions
      const harvesterX = harvester.x + TILE_SIZE / 2 - scrollOffset.x
      const harvesterY = harvester.y + TILE_SIZE / 2 - scrollOffset.y

      const refineryX = (assignedRefinery.x + assignedRefinery.width / 2) * TILE_SIZE - scrollOffset.x
      const refineryY = (assignedRefinery.y + assignedRefinery.height / 2) * TILE_SIZE - scrollOffset.y

      // Draw assignment line
      this.drawAssignmentLine(ctx, harvesterX, harvesterY, refineryX, refineryY, harvester)

      // Draw queue number bubble in the middle of the line
      if (harvester.queuePosition > 0) {
        const midX = (harvesterX + refineryX) / 2
        const midY = (harvesterY + refineryY) / 2
        this.drawQueueBubble(ctx, midX, midY, harvester.queuePosition)
      }
    }

    // Draw HUD status indicator
    this.drawStatusIndicator(ctx)
  }

  drawAssignmentLine(ctx, x1, y1, x2, y2, harvester) {
    ctx.save()

    // Set line style based on harvester state
    if (harvester.unloadingAtRefinery) {
      // Unloading - thick green line
      ctx.strokeStyle = '#00FF00'
      ctx.lineWidth = 3
      ctx.setLineDash([])
    } else if (harvester.queuePosition === 1) {
      // Next in queue - thick yellow line
      ctx.strokeStyle = '#FFFF00'
      ctx.lineWidth = 2
      ctx.setLineDash([])
    } else if (harvester.queuePosition > 1) {
      // In queue - dashed orange line
      ctx.strokeStyle = '#FFA500'
      ctx.lineWidth = 1
      ctx.setLineDash([5, 5])
    } else {
      // Moving to refinery - dotted blue line
      ctx.strokeStyle = '#4A90E2'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
    }

    // Draw the line
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    // Draw arrow at harvester end
    this.drawArrow(ctx, x1, y1, x2, y2)

    ctx.restore()
  }

  drawArrow(ctx, x1, y1, x2, y2) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const arrowLength = 8
    const arrowAngle = Math.PI / 6

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(
      x1 + arrowLength * Math.cos(angle - arrowAngle),
      y1 + arrowLength * Math.sin(angle - arrowAngle)
    )
    ctx.moveTo(x1, y1)
    ctx.lineTo(
      x1 + arrowLength * Math.cos(angle + arrowAngle),
      y1 + arrowLength * Math.sin(angle + arrowAngle)
    )
    ctx.stroke()
  }

  drawQueueBubble(ctx, x, y, queueNumber) {
    ctx.save()

    // Draw bubble background
    const radius = 12
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 1

    ctx.beginPath()
    ctx.arc(x, y, radius, 0, 2 * Math.PI)
    ctx.fill()
    ctx.stroke()

    // Draw queue number
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 10px "Rajdhani", "Arial Narrow", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(queueNumber.toString(), x, y)

    ctx.restore()
  }

  drawStatusIndicator(ctx) {
    // Draw small indicator in top-right to show HUD is active
    ctx.save()
    const { width: viewportWidth } = getCanvasLogicalSize(ctx.canvas)

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(viewportWidth - 120, 10, 110, 25)

    ctx.strokeStyle = '#4A90E2'
    ctx.lineWidth = 1
    ctx.strokeRect(viewportWidth - 120, 10, 110, 25)

    ctx.fillStyle = '#FFFFFF'
    ctx.font = '12px "Rajdhani", "Arial Narrow", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Harvester HUD (i)', viewportWidth - 65, 27)

    ctx.restore()
  }
}
