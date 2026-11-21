import { C5_DROP_DESCENT_TICKS } from '../game/c5Cargo.js'

export function renderC5Airdrop(ctx, drop, unit, tick, tileSize) {
  const progress = Math.max(0, Math.min(1, (tick - drop.startTick) / C5_DROP_DESCENT_TICKS))
  const x = (drop.tile.x + 0.5) * tileSize
  const groundY = (drop.tile.y + 0.5) * tileSize
  const y = groundY - (1 - progress) * tileSize * 4
  ctx.save(); ctx.fillStyle = '#eee8c9'; ctx.strokeStyle = '#d7d2b7'; ctx.beginPath()
  ctx.arc(x, y - tileSize * 0.7, tileSize * 0.55, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x - tileSize * 0.55, y - tileSize * 0.7); ctx.lineTo(x - tileSize * 0.2, y)
  ctx.moveTo(x + tileSize * 0.55, y - tileSize * 0.7); ctx.lineTo(x + tileSize * 0.2, y); ctx.stroke()
  ctx.fillStyle = unit?.owner === 'enemy' ? '#8b3a3a' : '#556b2f'; ctx.fillRect(x - tileSize * 0.25, y, tileSize * 0.5, tileSize * 0.35); ctx.restore()
}
