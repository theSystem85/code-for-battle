import { TILE_SIZE, PARTY_COLORS } from '../config.js'
import { getCanvasLogicalSize } from './renderingUtils.js'

export class DangerZoneRenderer {
  render(ctx, dzm, scrollOffset, playerId) {
    if (!dzm || !playerId) return

    const startX = Math.max(0, Math.floor(scrollOffset.x / TILE_SIZE))
    const startY = Math.max(0, Math.floor(scrollOffset.y / TILE_SIZE))
    const { width: viewportWidth, height: viewportHeight } = getCanvasLogicalSize(ctx.canvas)
    const tilesX = Math.ceil(viewportWidth / TILE_SIZE) + 1
    const tilesY = Math.ceil(viewportHeight / TILE_SIZE) + 1
    const endX = Math.min(dzm[0].length, startX + tilesX)
    const endY = Math.min(dzm.length, startY + tilesY)

    ctx.save()
    ctx.strokeStyle = 'rgba(255,0,0,0.5)'
    ctx.lineWidth = 1
    ctx.font = '8px "Rajdhani", "Arial Narrow", sans-serif'
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const dps = dzm[y][x]
        const baseX = x * TILE_SIZE - scrollOffset.x
        const baseY = y * TILE_SIZE - scrollOffset.y
        if (dps > 0) {
          const spacing = Math.max(2, 32 / Math.max(1, dps))
          const lines = Math.floor(TILE_SIZE / spacing)
          for (let i = 1; i <= lines; i++) {
            const off = i * spacing
            if (off >= TILE_SIZE) break
            ctx.beginPath()
            ctx.moveTo(baseX, baseY + off)
            ctx.lineTo(baseX + TILE_SIZE, baseY + off)
            ctx.stroke()
          }
        }
        ctx.fillText(dps.toFixed(1), baseX + TILE_SIZE - 1, baseY + TILE_SIZE - 1)
      }
    }
    ctx.restore()

    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(viewportWidth - 110, 10, 100, 18)
    ctx.strokeStyle = PARTY_COLORS[playerId] || '#fff'
    ctx.strokeRect(viewportWidth - 110, 10, 100, 18)
    ctx.fillStyle = '#fff'
    ctx.font = '12px "Rajdhani", "Arial Narrow", sans-serif'
    ctx.textAlign = 'center'
    const names = { player1: 'Green', player2: 'Red', player3: 'Blue', player4: 'Yellow' }
    const label = names[playerId] ? `Player ${names[playerId]}` : playerId
    ctx.fillText(label, viewportWidth - 60, 23)
    ctx.restore()
  }
}
