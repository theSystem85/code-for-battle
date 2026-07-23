import { TILE_SIZE, TANK_FIRE_RANGE } from '../config.js'
import { getCachedPath } from '../game/pathfinding.js'
import { gameRandom } from '../utils/gameRandom.js'
import { isEnemyTo } from './enemyUtils.js'
import {
  DODGE_TIME_DELAY,
  ENABLE_DODGING,
  LAST_POSITION_CHECK_TIME_DELAY,
  USE_SAFE_ATTACK_DISTANCE
} from './enemyUnitBehaviorConstants.js'

export function updateGroundDodge(unit, bullets, mapGrid, gameState, now, aiPlayerId) {
  // --- Dodge Logic: toggled by ENABLE_DODGING ---
  if (ENABLE_DODGING) {
    let underFire = false
    bullets.forEach(bullet => {
      if (bullet.shooter && isEnemyTo(bullet.shooter, aiPlayerId)) {
        const d = Math.hypot(bullet.x - (unit.x + TILE_SIZE / 2), bullet.y - (unit.y + TILE_SIZE / 2))
        if (d < 2 * TILE_SIZE) {
          underFire = true
        }
      }
    })

    if (underFire) {
      if (!unit.lastDodgeTime || now - unit.lastDodgeTime > DODGE_TIME_DELAY) {
        unit.lastDodgeTime = now
        const dodgeDir = { x: 0, y: 0 }
        bullets.forEach(bullet => {
          if (bullet.shooter && isEnemyTo(bullet.shooter, aiPlayerId)) {
            const dx = (unit.x + TILE_SIZE / 2) - bullet.x
            const dy = (unit.y + TILE_SIZE / 2) - bullet.y
            const mag = Math.hypot(dx, dy)
            if (mag > 0) {
              dodgeDir.x += dx / mag
              dodgeDir.y += dy / mag
            }
          }
        })
        const mag = Math.hypot(dodgeDir.x, dodgeDir.y)
        if (mag > 0) {
          dodgeDir.x /= mag
          dodgeDir.y /= mag
          const dodgeDistance = 1 + Math.floor(gameRandom() * 2)
          const destTileX = Math.floor(unit.tileX + Math.round(dodgeDir.x * dodgeDistance))
          const destTileY = Math.floor(unit.tileY + Math.round(dodgeDir.y * dodgeDistance))
          if (destTileX >= 0 && destTileX < mapGrid[0].length &&
                  destTileY >= 0 && destTileY < mapGrid.length) {
            const tileType = mapGrid[destTileY][destTileX].type
            const hasBuilding = mapGrid[destTileY][destTileX].building
            if (tileType !== 'water' && tileType !== 'rock' && !hasBuilding) {
              if (!unit.originalPath) {
                unit.originalPath = unit.path ? [...unit.path] : []
                unit.originalTarget = unit.target
                unit.dodgeEndTime = now + DODGE_TIME_DELAY
              }
              const newPath = getCachedPath(
                { x: unit.tileX, y: unit.tileY, owner: unit.owner },
                { x: destTileX, y: destTileY },
                mapGrid,
                gameState.occupancyMap,
                { unitOwner: unit.owner }
              )
              if (newPath.length > 1) {
                unit.isDodging = true
                unit.path = newPath.slice(1)
                unit.lastPathCalcTime = now
              }
            }
          }
        }
      }
    }
  }

  // Resume original path after dodging
  if (unit.isDodging && unit.originalPath) {
    if (unit.path.length === 0 || now > unit.dodgeEndTime) {
      unit.path = unit.originalPath
      unit.target = unit.originalTarget
      unit.originalPath = null
      unit.originalTarget = null
      unit.isDodging = false
      unit.dodgeEndTime = null
      unit.lastPathCalcTime = now
    }
  }
}

export function maintainSafeAttackDistance(unit, mapGrid, gameState, now) {
  // Maintain safe attack distance for combat units
  if (USE_SAFE_ATTACK_DISTANCE) {
    if ((unit.type === 'tank' || unit.type === 'rocketTank' || unit.type === 'howitzer') && unit.target) {
      const positionCheckNeeded = !unit.lastPositionCheckTime || (now - unit.lastPositionCheckTime > LAST_POSITION_CHECK_TIME_DELAY)
      if (positionCheckNeeded) {
        unit.lastPositionCheckTime = now
        const unitCenterX = unit.x + TILE_SIZE / 2
        const unitCenterY = unit.y + TILE_SIZE / 2
        let targetCenterX, targetCenterY
        if (unit.target.tileX !== undefined) {
          targetCenterX = unit.target.x + TILE_SIZE / 2
          targetCenterY = unit.target.y + TILE_SIZE / 2
        } else {
          targetCenterX = unit.target.x * TILE_SIZE + (unit.target.width * TILE_SIZE) / 2
          targetCenterY = unit.target.y * TILE_SIZE + (unit.target.height * TILE_SIZE) / 2
        }
        const dx = targetCenterX - unitCenterX
        const dy = targetCenterY - unitCenterY
        const currentDist = Math.hypot(dx, dy)
        const explosionSafetyBuffer = TILE_SIZE * 0.5
        const safeAttackDistance = Math.max(
          TANK_FIRE_RANGE * TILE_SIZE,
          TILE_SIZE * 2 + explosionSafetyBuffer
        )
        if (currentDist < safeAttackDistance && !unit.isDodging) {
          const destTileX = Math.floor(unit.tileX - Math.round((dx / currentDist) * 2))
          const destTileY = Math.floor(unit.tileY - Math.round((dy / currentDist) * 2))
          if (destTileX >= 0 && destTileX < mapGrid[0].length &&
                destTileY >= 0 && destTileY < mapGrid.length) {
            const tileType = mapGrid[destTileY][destTileX].type
            const hasBuilding = mapGrid[destTileY][destTileX].building
            if (tileType !== 'water' && tileType !== 'rock' && !hasBuilding) {
              // Use occupancy map for tactical retreat movement to avoid moving through units
              const occupancyMap = gameState.occupancyMap
              const newPath = getCachedPath(
                { x: unit.tileX, y: unit.tileY, owner: unit.owner },
                { x: destTileX, y: destTileY },
                mapGrid,
                occupancyMap,
                { unitOwner: unit.owner }
              )
              if (newPath.length > 1) {
                unit.path = newPath.slice(1)
                unit.lastPathCalcTime = now
              }
            }
          }
        }
      }
    }
  }
}
