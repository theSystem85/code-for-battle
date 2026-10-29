const DEG_TO_RADIANS = Math.PI / 180

export function getUnitShadowOffset(length, directionDegrees, footprint) {
  const distance = Math.max(0, Number(length) || 0) * Math.max(0, Number(footprint) || 0)
  const radians = (Number(directionDegrees) || 0) * DEG_TO_RADIANS
  return {
    x: Math.cos(radians) * distance,
    y: -Math.sin(radians) * distance
  }
}

export function drawUnitShadow(ctx, centerX, centerY, footprint, length, directionDegrees, airborne = false) {
  const offset = getUnitShadowOffset(length, directionDegrees, footprint)
  const scale = airborne ? 0.72 : 1
  ctx.save()
  ctx.fillStyle = airborne ? 'rgba(8, 12, 14, 0.14)' : 'rgba(8, 12, 14, 0.2)'
  ctx.beginPath()
  ctx.ellipse(
    centerX + offset.x,
    centerY + footprint * 0.2 + offset.y,
    footprint * 0.34 * scale,
    footprint * 0.16 * scale,
    -Math.PI / 4,
    0,
    Math.PI * 2
  )
  ctx.fill()
  ctx.restore()
}
