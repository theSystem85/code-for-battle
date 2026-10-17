import { MUZZLE_FLASH_DURATION, MUZZLE_FLASH_SIZE, RECOIL_DISTANCE, RECOIL_DURATION } from '../config.js'

// Shared by naval and building turrets. Simulation timestamps include zero.
export function getRecoilOffset(startTime, now, distance = RECOIL_DISTANCE) {
  const elapsed = now - startTime
  if (!Number.isFinite(startTime) || elapsed < 0 || elapsed > RECOIL_DURATION) return 0
  return distance * Math.pow(1 - elapsed / RECOIL_DURATION, 3)
}

export function renderTurretMuzzleFlash(ctx, x, y, startTime, now) {
  const elapsed = now - startTime
  if (!Number.isFinite(startTime) || elapsed < 0 || elapsed > MUZZLE_FLASH_DURATION) return
  const progress = elapsed / MUZZLE_FLASH_DURATION
  const size = MUZZLE_FLASH_SIZE * 1.25 * (1 - progress * 0.5)
  ctx.save()
  ctx.globalAlpha *= 1 - progress
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size)
  gradient.addColorStop(0, '#fff')
  gradient.addColorStop(0.28, '#fff36a')
  gradient.addColorStop(0.65, '#ff8a22')
  gradient.addColorStop(1, 'rgba(255, 90, 0, 0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, size, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
