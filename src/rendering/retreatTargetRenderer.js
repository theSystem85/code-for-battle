/**
 * Retreat Target Renderer
 *
 * Renders visual indicators for retreat positions showing where tanks will retreat to
 */

import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'

export class RetreatTargetRenderer {
  /**
   * Render retreat target indicators for units in retreat mode
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} units
   * @param {Object} scrollOffset
   */
  renderRetreatTargets(ctx, units, scrollOffset) {
    if (!units || !Array.isArray(units)) return

    const now = performance.now()
    const pulseOpacity = 0.4 + Math.sin(now * 0.003) * 0.2 // Pulsing effect

    // Render retreat targets for retreating units
    units.forEach(unit => {
      if (!unit.isRetreating || !unit.retreatTarget) return
      if (unit.retreatIssuedByPlayer !== true) return

      if (unit.owner === gameState.humanPlayer) {
        // Calculate screen position of the retreat target
        const targetScreenX = unit.retreatTarget.x * TILE_SIZE + TILE_SIZE / 2 - scrollOffset.x
        const targetScreenY = unit.retreatTarget.y * TILE_SIZE + TILE_SIZE / 2 - scrollOffset.y

        // Only render if on screen
        if (targetScreenX >= -20 && targetScreenX <= ctx.canvas.width + 20 &&
            targetScreenY >= -20 && targetScreenY <= ctx.canvas.height + 20) {

          // Draw retreat indicator (orange/yellow circle with backward arrow)
          ctx.save()
          ctx.globalAlpha = pulseOpacity

          // Outer circle (warning color)
          ctx.fillStyle = 'rgba(255, 165, 0, 0.8)' // Orange
          ctx.strokeStyle = 'rgba(255, 140, 0, 1)' // Darker orange
          ctx.lineWidth = 2

          ctx.beginPath()
          ctx.arc(targetScreenX, targetScreenY, 16, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()

          // Inner circle
          ctx.fillStyle = 'rgba(255, 200, 0, 0.6)' // Light orange
          ctx.beginPath()
          ctx.arc(targetScreenX, targetScreenY, 10, 0, Math.PI * 2)
          ctx.fill()

          // Draw backward arrow
          ctx.strokeStyle = 'rgba(139, 69, 19, 0.9)' // Brown
          ctx.fillStyle = 'rgba(139, 69, 19, 0.9)'
          ctx.lineWidth = 2

          // Arrow pointing backward (left)
          const arrowSize = 6
          ctx.beginPath()
          ctx.moveTo(targetScreenX - arrowSize, targetScreenY)
          ctx.lineTo(targetScreenX + arrowSize / 2, targetScreenY - arrowSize / 2)
          ctx.lineTo(targetScreenX + arrowSize / 2, targetScreenY + arrowSize / 2)
          ctx.closePath()
          ctx.fill()

          // Add retreat text below
          ctx.globalAlpha = 1
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'
          ctx.lineWidth = 1
          ctx.font = '10px "Rajdhani", "Arial Narrow", sans-serif'
          ctx.textAlign = 'center'

          const text = 'RETREAT'
          ctx.strokeText(text, targetScreenX, targetScreenY + 28)
          ctx.fillText(text, targetScreenX, targetScreenY + 28)

          ctx.restore()
        }
      }
    })
  }
}
