import { BATTLESHIP_TURRET_NAMES, getBattleshipTurretLocalPoint } from '../game/battleshipTurrets.js'
import { BATTLESHIP_TURRET_RENDER_SCALE, BATTLESHIP_BARREL_LATERAL_OFFSET, BATTLESHIP_BARREL_ROOT_Y } from '../utils/navalSpriteGeometry.js'
import { getRecoilOffset } from '../rendering/turretFiringEffects.js'
import { gameState } from '../gameState.js'
import { getSimulationTime } from '../game/time.js'
import { TILE_SIZE } from '../config.js'
import masks from './navalImageMasks.json'
import { getNavalRenderLengthTiles, hasNativeNavalSprite, NAVAL_SPRITE_NATIVE_DENSITY } from '../utils/navalUtils.js'

// Source-alpha runs are prepared offline. Pointer queries allocate no canvas or mask.
export function unitContainsPoint(unit, worldX, worldY, radius = TILE_SIZE / 2) {
  if (!unit || unit.health <= 0 || unit.factoryExit || unit.embarkedOnId || unit.transportTransfer) return false
  const dx = worldX - unit.x - TILE_SIZE / 2
  let dy = worldY - unit.y - TILE_SIZE / 2
  const mask = masks[unit.type]
  if (!mask) {
    if (unit.isAirUnit || ['apache', 'f22Raptor', 'f35'].includes(unit.type)) dy += (unit.altitude || 0) * 0.4
    return Math.hypot(dx, dy) < radius
  }
  if (unit.type === 'battleship' && battleshipPartsContainPoint(unit, dx, dy)) return true
  const angle = (unit.direction || unit.rotation || 0) - Math.PI / 2
  const scale = hasNativeNavalSprite(unit.type)
    ? 1 / NAVAL_SPRITE_NATIVE_DENSITY
    : TILE_SIZE * getNavalRenderLengthTiles(unit.type) / Math.max(mask.width, mask.height)
  const x = Math.floor((dx * Math.cos(angle) + dy * Math.sin(angle)) / scale + mask.width / 2)
  const y = Math.floor((-dx * Math.sin(angle) + dy * Math.cos(angle)) / scale + mask.height / 2)
  if (x < 0 || x >= mask.width || y < 0 || y >= mask.height) return false
  if (unit.type === 'submarine' && ['surfacing', 'submerging'].includes(unit.depthState)) {
    const progress = unit.depthState === 'surfacing' ? Math.max(0.05, unit.depthTransitionProgress || 0) : Math.max(0.05, 1 - (unit.depthTransitionProgress || 0))
    if (y >= mask.height * progress) return false
  }
  const row = mask.rows[y]
  for (let i = 0; i < row.length; i += 2) if (x >= row[i] && x < row[i + 1]) return true
  return false
}

function alphaContains(mask, x, y) {
  x = Math.floor(x)
  y = Math.floor(y)
  if (x < 0 || x >= mask.width || y < 0 || y >= mask.height) return false
  const row = mask.rows[y]
  for (let i = 0; i < row.length; i += 2) if (x >= row[i] && x < row[i + 1]) return true
  return false
}

function battleshipPartsContainPoint(unit, dx, dy) {
  const direction = unit.direction || unit.rotation || 0
  const now = getSimulationTime(gameState)
  for (const name of BATTLESHIP_TURRET_NAMES) {
    const turret = unit.batteries?.[name]
    if (!turret || turret.enabled === false) continue
    const point = getBattleshipTurretLocalPoint(name)
    const offsetX = dx - Math.cos(direction) * point.y
    const offsetY = dy - Math.sin(direction) * point.y
    const angle = (Number.isFinite(turret.direction) ? turret.direction : direction) - Math.PI / 2
    const x = offsetX * Math.cos(angle) + offsetY * Math.sin(angle)
    const y = -offsetX * Math.sin(angle) + offsetY * Math.cos(angle)
    if (alphaContains(masks.battleshipTurret, x * 3 + masks.battleshipTurret.width / 2, y * 3 + masks.battleshipTurret.height / 2)) return true
    for (let index = 0; index < 2; index++) {
      const barrelX = (index === 0 ? -1 : 1) * BATTLESHIP_BARREL_LATERAL_OFFSET
      const barrelY = BATTLESHIP_BARREL_ROOT_Y - getRecoilOffset(turret.barrelRecoilStartTimes?.[index], now) * BATTLESHIP_TURRET_RENDER_SCALE
      if (alphaContains(masks.battleshipBarrel, (x - barrelX) * 3 + masks.battleshipBarrel.width / 2, (y - barrelY) * 3)) return true
    }
  }
  return false
}
