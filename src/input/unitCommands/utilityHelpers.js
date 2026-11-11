import { TILE_SIZE } from '../../config.js'
import { findPathForOwner } from '../../units.js'
import { gameState } from '../../gameState.js'

export const UTILITY_QUEUE_MODES = {
  HEAL: 'heal',
  REFUEL: 'refuel',
  REPAIR: 'repair',
  AMMO: 'ammoResupply'
}

export const AMBULANCE_APPROACH_OFFSETS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
]

export const RECOVERY_APPROACH_OFFSETS = [
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 }
]

export function getUnitTilePosition(unit) {
  if (!unit) return null
  if (typeof unit.tileX === 'number' && typeof unit.tileY === 'number') {
    return { x: unit.tileX, y: unit.tileY }
  }
  if (typeof unit.x === 'number' && typeof unit.y === 'number') {
    return {
      x: Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE),
      y: Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
    }
  }
  return null
}

export function computeUtilityApproachPath(serviceUnit, target, mode, mapGrid, startTileOverride = null) {
  if (!serviceUnit || !target || !mapGrid || mapGrid.length === 0) {
    return null
  }

  const startTile = startTileOverride ? { x: startTileOverride.x, y: startTileOverride.y } : getUnitTilePosition(serviceUnit)
  if (!startTile) {
    return null
  }

  const targetTileX = typeof target.tileX === 'number'
    ? target.tileX
    : Math.floor((target.x + TILE_SIZE / 2) / TILE_SIZE)
  const targetTileY = typeof target.tileY === 'number'
    ? target.tileY
    : Math.floor((target.y + TILE_SIZE / 2) / TILE_SIZE)

  if (Number.isNaN(targetTileX) || Number.isNaN(targetTileY)) {
    return null
  }

  const buildResult = (path, destinationTile, moveTarget) => ({
    path,
    destinationTile,
    moveTarget,
    cost: path.length
  })

  if (mode === UTILITY_QUEUE_MODES.HEAL || mode === UTILITY_QUEUE_MODES.REFUEL || mode === UTILITY_QUEUE_MODES.AMMO) {
    const offsets = AMBULANCE_APPROACH_OFFSETS
    let bestPlan = null
    offsets.forEach(offset => {
      const destX = targetTileX + offset.x
      const destY = targetTileY + offset.y
      if (destX < 0 || destY < 0 || destY >= mapGrid.length || destX >= mapGrid[0].length) {
        return
      }
      const path = findPathForOwner(startTile, { x: destX, y: destY }, mapGrid, gameState.occupancyMap, serviceUnit.owner)
      if (path && path.length > 0) {
        const plan = buildResult(path, { x: destX, y: destY }, { x: destX, y: destY })
        if (!bestPlan || plan.cost < bestPlan.cost) bestPlan = plan
      }
    })
    return bestPlan
  }

  if (mode === UTILITY_QUEUE_MODES.REPAIR) {
    if (target.isWreckTarget) {
      const candidatePositions = [
        { x: targetTileX, y: targetTileY },
        { x: targetTileX + 1, y: targetTileY },
        { x: targetTileX - 1, y: targetTileY },
        { x: targetTileX, y: targetTileY + 1 },
        { x: targetTileX, y: targetTileY - 1 }
      ]

      let bestPlan = null
      candidatePositions.forEach(pos => {
        if (pos.x < 0 || pos.y < 0 || pos.y >= mapGrid.length || pos.x >= mapGrid[0].length) {
          return
        }
        const path = findPathForOwner(startTile, pos, mapGrid, gameState.occupancyMap, serviceUnit.owner)
        if (path && path.length > 0) {
          const plan = buildResult(path, { x: pos.x, y: pos.y }, { x: pos.x, y: pos.y })
          if (!bestPlan || plan.cost < bestPlan.cost) {
            bestPlan = plan
          }
        }
      })
      return bestPlan
    }

    let bestPlan = null
    RECOVERY_APPROACH_OFFSETS.forEach(offset => {
      const destX = targetTileX + offset.x
      const destY = targetTileY + offset.y
      if (destX < 0 || destY < 0 || destY >= mapGrid.length || destX >= mapGrid[0].length) {
        return
      }
      const path = findPathForOwner(startTile, { x: destX, y: destY }, mapGrid, gameState.occupancyMap, serviceUnit.owner)
      if (path && path.length > 0) {
        const plan = buildResult(path, { x: destX, y: destY }, { x: destX * TILE_SIZE, y: destY * TILE_SIZE })
        if (!bestPlan || plan.cost < bestPlan.cost) {
          bestPlan = plan
        }
      }
    })
    return bestPlan
  }

  return null
}
