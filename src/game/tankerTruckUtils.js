import { TILE_SIZE, TANKER_SUPPLY_CAPACITY } from '../config.js'
import { findPath } from '../units.js'
import { triggerExplosion } from '../logic.js'
import { triggerDistortionEffect } from '../ui/distortionEffect.js'

const KAMIKAZE_APPROACH_OFFSETS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
]

export function computeTankerKamikazeApproach(tanker, target, mapGrid, occupancyMap, options = null) {
  if (!tanker || !target || !mapGrid || mapGrid.length === 0) {
    return null
  }

  const startTile = {
    x: typeof tanker.tileX === 'number' ? tanker.tileX : Math.floor((tanker.x + TILE_SIZE / 2) / TILE_SIZE),
    y: typeof tanker.tileY === 'number' ? tanker.tileY : Math.floor((tanker.y + TILE_SIZE / 2) / TILE_SIZE),
    owner: tanker.owner
  }

  const targetTile = getTargetTile(target)
  if (!targetTile) {
    return null
  }

  const width = mapGrid[0].length
  const height = mapGrid.length
  const pathOptions = { ...options, unitOwner: tanker.owner }

  const buildResult = (path, destinationTile) => ({
    path,
    destinationTile,
    moveTarget: { x: destinationTile.x, y: destinationTile.y }
  })

  for (const offset of KAMIKAZE_APPROACH_OFFSETS) {
    const dest = { x: targetTile.x + offset.x, y: targetTile.y + offset.y }
    if (dest.x < 0 || dest.y < 0 || dest.x >= width || dest.y >= height) {
      continue
    }

    const path = findPath(startTile, dest, mapGrid, occupancyMap, undefined, pathOptions)
    if (path && path.length > 0) {
      return buildResult(path, dest)
    }
  }

  const fallbackPath = findPath(startTile, targetTile, mapGrid,
    options?.includeMovableOccupancy ? occupancyMap : null, undefined, pathOptions)
  if (fallbackPath && fallbackPath.length > 0) {
    return buildResult(fallbackPath, targetTile)
  }

  return null
}

function getTargetTile(target) {
  if (target.tileX !== undefined && target.tileY !== undefined) {
    return { x: target.tileX, y: target.tileY }
  }
  if (target.x !== undefined && target.y !== undefined) {
    const width = target.width || 1
    const height = target.height || 1
    const centerX = target.x + Math.floor(width / 2)
    const centerY = target.y + Math.floor(height / 2)
    return { x: centerX, y: centerY }
  }
  return null
}

export function detonateTankerTruck(unit, units, factories = [], gameState = null) {
  if (!unit || unit.health <= 0) {
    return false
  }
  if (unit._tankerDetonated) {
    return false
  }

  const explosionX = unit.x + TILE_SIZE / 2
  const explosionY = unit.y + TILE_SIZE / 2

  const maxSupply = (unit.maxSupplyGas && unit.maxSupplyGas > 0)
    ? unit.maxSupplyGas
    : TANKER_SUPPLY_CAPACITY
  const currentSupply = Math.max(0, unit.supplyGas ?? maxSupply)
  const fillRatio = maxSupply > 0 ? Math.max(0, Math.min(1, currentSupply / maxSupply)) : 0
  const radius = TILE_SIZE * (3 + fillRatio * 2)

  if (radius > 0) {
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    triggerExplosion(
      explosionX,
      explosionY,
      95,
      units,
      factories,
      null,
      now,
      undefined,
      radius,
      true
    )
    if (gameState) {
      triggerDistortionEffect(explosionX, explosionY, radius, gameState)
    }
  }

  unit._tankerDetonated = true
  unit.kamikazeMode = false
  unit.kamikazeTargetId = null
  unit.kamikazeTargetType = null
  unit.kamikazeTargetPoint = null
  unit.kamikazeLastPathTime = null
  unit.kamikazeTargetBuilding = null
  unit.moveTarget = null
  unit.path = []
  unit.commandQueue = []
  unit.currentCommand = null
  unit.supplyGas = 0
  unit.refuelTarget = null
  unit.refuelTimer = 0
  unit.emergencyTarget = null
  unit.emergencyMode = false

  unit.health = 0

  if (unit.movement) {
    unit.movement.velocity.x = 0
    unit.movement.velocity.y = 0
    if (unit.movement.targetVelocity) {
      unit.movement.targetVelocity.x = 0
      unit.movement.targetVelocity.y = 0
    }
    unit.movement.isMoving = false
    unit.movement.currentSpeed = 0
  }

  return true
}

export function clearTankerKamikazeState(unit) {
  if (!unit || unit.type !== 'tankerTruck') {
    return
  }
  unit.kamikazeMode = false
  unit.kamikazeTargetId = null
  unit.kamikazeTargetType = null
  unit.kamikazeTargetPoint = null
  unit.kamikazeLastPathTime = null
  unit.kamikazeTargetBuilding = null
  unit._tankerDetonated = false
  unit.moveTarget = null
}

export function updateKamikazeTargetPoint(unit, target) {
  if (!unit || unit.type !== 'tankerTruck' || !target) {
    return null
  }

  if (target.tileX !== undefined && target.tileY !== undefined) {
    const point = { x: target.x + TILE_SIZE / 2, y: target.y + TILE_SIZE / 2 }
    unit.kamikazeTargetPoint = point
    return point
  }

  if (target.x !== undefined && target.y !== undefined) {
    const width = target.width || 1
    const height = target.height || 1
    const point = {
      x: (target.x + width / 2) * TILE_SIZE,
      y: (target.y + height / 2) * TILE_SIZE
    }
    unit.kamikazeTargetPoint = point
    return point
  }

  return null
}
