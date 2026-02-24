import {
  TILE_SIZE,
  COLLISION_SEPARATION_SCALE,
  COLLISION_SEPARATION_MAX,
  COLLISION_SEPARATION_MIN,
  COLLISION_NORMAL_DAMPING_MULT,
  COLLISION_NORMAL_DAMPING_MAX,
  AIR_COLLISION_AVOID_RADIUS,
  AIR_COLLISION_AVOID_FORCE,
  AIR_COLLISION_AVOID_MAX_NEIGHBORS,
  AIR_COLLISION_TIME_HORIZON,
  WRECK_COLLISION_REMOTE_BOOST,
  WRECK_COLLISION_SPEED_FACTOR,
  WRECK_COLLISION_OVERLAP_FACTOR,
  WRECK_COLLISION_MIN,
  WRECK_COLLISION_MAX,
  WRECK_COLLISION_RECOIL_FACTOR_UNIT,
  WRECK_COLLISION_RECOIL_MAX_UNIT,
  STATIC_COLLISION_BOUNCE_MULT,
  STATIC_COLLISION_BOUNCE_OVERLAP,
  STATIC_COLLISION_BOUNCE_MIN,
  STATIC_COLLISION_BOUNCE_MAX
} from '../config.js'
import { getSpatialQuadtree } from './spatialQuadtree.js'
import { detonateTankerTruck } from './tankerTruckUtils.js'
import {
  MOVEMENT_CONFIG,
  UNIT_COLLISION_MIN_DISTANCE,
  BASE_FRAME_SECONDS,
  LOCAL_LOOKAHEAD_STEPS,
  LOCAL_LOOKAHEAD_STRENGTH
} from './movementConstants.js'
import { isAirborneUnit, isGroundUnit, ownersAreEnemies } from './movementHelpers.js'
import { hasBlockingBuilding } from '../utils/buildingPassability.js'

const STATIC_COLLISION_SEPARATION_SCALE = 0.3
const STATIC_COLLISION_SEPARATION_MIN = 0.25
const STATIC_COLLISION_SEPARATION_MAX = 6

function isTileBlockedForCollision(mapGrid, tileX, tileY) {
  if (!mapGrid || tileY < 0 || tileY >= mapGrid.length) {
    return true
  }
  const row = mapGrid[tileY]
  if (!row || tileX < 0 || tileX >= row.length) {
    return true
  }

  const tile = row[tileX]
  if (typeof tile === 'number') {
    return tile === 1
  }

  if (!tile) {
    return true
  }

  if (tile.type === 'water' || tile.type === 'rock' || tile.seedCrystal) {
    return true
  }

  if (hasBlockingBuilding(tile)) {
    return true
  }

  return false
}

function isPositionBlockedForCollision(unit, targetX, targetY, mapGrid, occupancyMap, units = [], wrecks = [], ignoreIds = []) {
  if (!unit) {
    return true
  }

  const ignoreSet = ignoreIds.length > 0 ? new Set(ignoreIds) : null
  const centerX = targetX + TILE_SIZE / 2
  const centerY = targetY + TILE_SIZE / 2
  const tileX = Math.floor(centerX / TILE_SIZE)
  const tileY = Math.floor(centerY / TILE_SIZE)

  if (isTileBlockedForCollision(mapGrid, tileX, tileY)) {
    return true
  }

  if (occupancyMap && occupancyMap[tileY]) {
    let occupancy = occupancyMap[tileY][tileX] || 0
    const currentTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const currentTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

    if (tileX === currentTileX && tileY === currentTileY) {
      occupancy = Math.max(0, occupancy - 1)
    }

    if (occupancy > 0 && ignoreSet) {
      for (const other of units || []) {
        if (!other || other.id === unit.id) continue
        if (!ignoreSet.has(other.id)) continue
        const otherTileX = Math.floor((other.x + TILE_SIZE / 2) / TILE_SIZE)
        const otherTileY = Math.floor((other.y + TILE_SIZE / 2) / TILE_SIZE)
        if (otherTileX === tileX && otherTileY === tileY) {
          occupancy = Math.max(0, occupancy - 1)
        }
        if (occupancy <= 0) {
          break
        }
      }
    }

    if (occupancy > 0) {
      return true
    }
  }

  const minSeparation = MOVEMENT_CONFIG.MIN_UNIT_DISTANCE * 0.95

  if (units && units.length > 0) {
    for (const other of units) {
      if (!other || other.id === unit.id || other.health <= 0) continue
      if (ignoreSet && ignoreSet.has(other.id)) continue
      if (!isGroundUnit(other)) continue

      const otherCenterX = other.x + TILE_SIZE / 2
      const otherCenterY = other.y + TILE_SIZE / 2
      const distance = Math.hypot(centerX - otherCenterX, centerY - otherCenterY)

      if (distance < minSeparation) {
        return true
      }
    }
  }

  if (wrecks && wrecks.length > 0) {
    for (const wreck of wrecks) {
      if (!wreck || wreck.health <= 0) continue
      const wreckCenterX = wreck.x + TILE_SIZE / 2
      const wreckCenterY = wreck.y + TILE_SIZE / 2
      const distance = Math.hypot(centerX - wreckCenterX, centerY - wreckCenterY)
      if (distance < minSeparation) {
        return true
      }
    }
  }

  return false
}

function applySafeSeparation(unit, dx, dy, mapGrid, occupancyMap, units = [], wrecks = [], ignoreIds = []) {
  if (!unit || (dx === 0 && dy === 0)) {
    return { appliedX: 0, appliedY: 0 }
  }

  const startX = unit.x
  const startY = unit.y
  let appliedX = 0
  let appliedY = 0
  let scale = 1

  for (let attempt = 0; attempt < 5; attempt++) {
    const scaledX = dx * scale
    const scaledY = dy * scale
    const targetX = startX + scaledX
    const targetY = startY + scaledY

    if (!isPositionBlockedForCollision(unit, targetX, targetY, mapGrid, occupancyMap, units, wrecks, ignoreIds)) {
      unit.x = targetX
      unit.y = targetY
      appliedX = scaledX
      appliedY = scaledY
      break
    }

    scale *= 0.5
  }

  if (appliedX === 0 && appliedY === 0) {
    unit.x = startX
    unit.y = startY
  }

  return { appliedX, appliedY }
}

function ensureMinimumSeparation(unit, otherUnit, normalX, normalY, mapGrid, occupancyMap, units = [], wrecks = []) {
  if (!unit || !otherUnit) {
    return
  }
  if (!isGroundUnit(unit) || !isGroundUnit(otherUnit)) {
    return
  }

  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2
  const otherCenterX = otherUnit.x + TILE_SIZE / 2
  const otherCenterY = otherUnit.y + TILE_SIZE / 2
  const distance = Math.hypot(unitCenterX - otherCenterX, unitCenterY - otherCenterY)
  const desiredDistance = MOVEMENT_CONFIG.MIN_UNIT_DISTANCE * 0.98

  if (distance >= desiredDistance) {
    return
  }

  let remaining = desiredDistance - distance
  if (remaining <= 0) {
    return
  }

  const otherResult = applySafeSeparation(
    otherUnit,
    normalX * remaining * 0.5,
    normalY * remaining * 0.5,
    mapGrid,
    occupancyMap,
    units,
    wrecks,
    [unit.id]
  )

  const otherAlong = otherResult.appliedX * normalX + otherResult.appliedY * normalY
  remaining = Math.max(0, remaining - otherAlong)

  if (remaining > 0.001) {
    const unitResult = applySafeSeparation(
      unit,
      -normalX * remaining,
      -normalY * remaining,
      mapGrid,
      occupancyMap,
      units,
      wrecks,
      [otherUnit.id]
    )
    const unitAlong = -(unitResult.appliedX * normalX + unitResult.appliedY * normalY)
    remaining = Math.max(0, remaining - unitAlong)
  }

  if (remaining > 0.001) {
    applySafeSeparation(
      otherUnit,
      normalX * remaining,
      normalY * remaining,
      mapGrid,
      occupancyMap,
      units,
      wrecks,
      [unit.id]
    )
  }
}

function applyAirSeparation(unit, otherUnit, normalX, normalY, separation) {
  const halfSeparation = separation * 0.5
  unit.x -= normalX * halfSeparation
  unit.y -= normalY * halfSeparation

  if (otherUnit) {
    otherUnit.x += normalX * halfSeparation
    otherUnit.y += normalY * halfSeparation
  }
}

export function checkUnitCollision(unit, mapGrid, occupancyMap, units, wrecks = []) {
  const tileX = Math.floor(unit.x / TILE_SIZE)
  const tileY = Math.floor(unit.y / TILE_SIZE)

  const tileRow = Array.isArray(mapGrid) ? mapGrid[tileY] : undefined
  const tile = tileRow ? tileRow[tileX] : undefined

  const unitAirborne = isAirborneUnit(unit)

  if (!tileRow || tile === undefined) {
    return { collided: true, type: 'bounds', tileX, tileY }
  }

  if (!unitAirborne) {
    if (typeof tile === 'number') {
      if (tile === 1) {
        return { collided: true, type: 'terrain', tileX, tileY }
      }
    } else {
      if (tile.type === 'water' || tile.type === 'rock' || tile.seedCrystal) {
        return { collided: true, type: 'terrain', tileX, tileY }
      }

      if (hasBlockingBuilding(tile)) {
        if (unit.type === 'apache' && tile.building.type === 'helipad') {
          return { collided: false }
        }
        return {
          collided: true,
          type: 'building',
          building: tile.building,
          tileX,
          tileY
        }
      }
    }
  }

  const spatialTree = getSpatialQuadtree()
  const unitCenterX = unit._cx ?? (unit.x + TILE_SIZE / 2)
  const unitCenterY = unit._cy ?? (unit.y + TILE_SIZE / 2)

  const nearbyUnits = spatialTree
    ? spatialTree.queryNearbyForUnit(unitCenterX, unitCenterY, MOVEMENT_CONFIG.FORCE_FIELD_RADIUS, unitAirborne, unit.id)
    : []

  for (let i = 0, len = nearbyUnits.length; i < len; i++) {
    const otherUnit = nearbyUnits[i]
    if (otherUnit.health <= 0) continue

    const otherAirborne = isAirborneUnit(otherUnit)
    if (unitAirborne !== otherAirborne) continue

    const otherCenterX = otherUnit._cx ?? (otherUnit.x + TILE_SIZE / 2)
    const otherCenterY = otherUnit._cy ?? (otherUnit.y + TILE_SIZE / 2)
    const dx = unitCenterX - otherCenterX
    const dy = unitCenterY - otherCenterY
    const distSq = dx * dx + dy * dy

    if (distSq < 1) continue

    const distance = Math.sqrt(distSq)

    if (distance < MOVEMENT_CONFIG.MIN_UNIT_DISTANCE) {
      const unitVelX = unit.movement?.velocity?.x || 0
      const unitVelY = unit.movement?.velocity?.y || 0

      const dotProduct = dx * unitVelX + dy * unitVelY
      if (dotProduct > 0) {
        continue
      }

      const invDist = 1 / distance
      const normalX = -dx * invDist
      const normalY = -dy * invDist
      const overlap = MOVEMENT_CONFIG.MIN_UNIT_DISTANCE - distance

      const separationForce = overlap * MOVEMENT_CONFIG.FORCE_FIELD_STRENGTH * 0.1

      // Note: Removed aggressive velocity damping that was causing exponential slowdown
      // when units approached each other. The separation forces below are sufficient
      // to push units apart without reducing their overall movement speed.

      const separationX = dx * invDist * separationForce
      const separationY = dy * invDist * separationForce

      unit.movement.velocity.x += separationX
      unit.movement.velocity.y += separationY

      if (otherUnit.movement) {
        otherUnit.movement.velocity.x -= separationX * 0.5
        otherUnit.movement.velocity.y -= separationY * 0.5
      }

      const otherVelX = otherUnit.movement?.velocity?.x || 0
      const otherVelY = otherUnit.movement?.velocity?.y || 0
      const unitSpeed = Math.sqrt(unitVelX * unitVelX + unitVelY * unitVelY)
      const otherSpeed = Math.sqrt(otherVelX * otherVelX + otherVelY * otherVelY)

      if (unitAirborne && otherAirborne) {
        return {
          collided: true,
          type: 'unit',
          other: otherUnit,
          data: {
            normalX,
            normalY,
            overlap,
            unitSpeed,
            otherSpeed,
            airCollision: true
          }
        }
      }

      return {
        collided: true,
        type: 'unit',
        other: otherUnit,
        data: {
          normalX,
          normalY,
          overlap,
          unitSpeed,
          otherSpeed
        }
      }
    }
  }

  if (!unitAirborne && wrecks && wrecks.length > 0) {
    const unitVelX = unit.movement?.velocity?.x || 0
    const unitVelY = unit.movement?.velocity?.y || 0

    for (const wreck of wrecks) {
      if (!wreck || wreck.health <= 0) continue
      if (wreck.towedBy === unit.id) continue

      const wreckCenterX = wreck.x + TILE_SIZE / 2
      const wreckCenterY = wreck.y + TILE_SIZE / 2
      const wdx = unitCenterX - wreckCenterX
      const wdy = unitCenterY - wreckCenterY
      const wDistSq = wdx * wdx + wdy * wdy
      const distance = Math.sqrt(wDistSq)

      if (distance >= UNIT_COLLISION_MIN_DISTANCE) {
        continue
      }

      const dotProduct = wdx * unitVelX + wdy * unitVelY

      if (dotProduct > 0) {
        continue
      }

      const normalX = (wreckCenterX - unitCenterX) / (distance || 1)
      const normalY = (wreckCenterY - unitCenterY) / (distance || 1)
      const overlap = UNIT_COLLISION_MIN_DISTANCE - distance
      const unitSpeed = Math.sqrt(unitVelX * unitVelX + unitVelY * unitVelY)

      const wreckSpeed = Math.sqrt((wreck.velocityX || 0) ** 2 + (wreck.velocityY || 0) ** 2)

      const remoteControlBoost = unit.remoteControlActive ? WRECK_COLLISION_REMOTE_BOOST : 1.0
      const baseImpulse = unitSpeed * WRECK_COLLISION_SPEED_FACTOR + overlap * WRECK_COLLISION_OVERLAP_FACTOR
      const impulseStrength = Math.max(WRECK_COLLISION_MIN, Math.min(WRECK_COLLISION_MAX, baseImpulse * remoteControlBoost))

      if (wreckSpeed <= unitSpeed) {
        wreck.velocityX = (wreck.velocityX || 0) + normalX * impulseStrength
        wreck.velocityY = (wreck.velocityY || 0) + normalY * impulseStrength
        unit.movement.velocity.x -= normalX * Math.min(impulseStrength * WRECK_COLLISION_RECOIL_FACTOR_UNIT, WRECK_COLLISION_RECOIL_MAX_UNIT)
        unit.movement.velocity.y -= normalY * Math.min(impulseStrength * WRECK_COLLISION_RECOIL_FACTOR_UNIT, WRECK_COLLISION_RECOIL_MAX_UNIT)
      } else {
        unit.movement.velocity.x -= normalX * impulseStrength
        unit.movement.velocity.y -= normalY * impulseStrength
      }

      const relativeSpeed = Math.max(0, -((unitVelX * normalX) + (unitVelY * normalY)))

      return {
        collided: true,
        type: 'wreck',
        wreck,
        data: {
          normalX,
          normalY,
          overlap,
          unitSpeed,
          impulseStrength,
          relativeSpeed
        }
      }
    }
  }

  return { collided: false }
}

export function applyWreckCollisionResponse(unit, movement, collisionResult) {
  if (!unit || !movement || !collisionResult || collisionResult.type !== 'wreck' || !collisionResult.data) {
    return
  }

  const { normalX, normalY, overlap, relativeSpeed } = collisionResult.data
  const remoteMultiplier = unit.remoteControlActive ? 0.6 : 1
  const separationDistance = Math.min(4, Math.max(0, (relativeSpeed * 2 + overlap * 0.5) * remoteMultiplier))

  if (separationDistance > 0.001) {
    unit.x -= normalX * separationDistance
    unit.y -= normalY * separationDistance
  }

  const recoilFactor = unit.remoteControlActive ? 0.45 : 0.75
  const velocityReduction = Math.min(1.5, Math.max(0, relativeSpeed * recoilFactor + overlap * 0.25))

  if (velocityReduction > 0.001) {
    movement.velocity.x -= normalX * velocityReduction
    movement.velocity.y -= normalY * velocityReduction

    if (!unit.remoteControlActive && movement.targetVelocity) {
      const targetReduction = velocityReduction * 0.35
      movement.targetVelocity.x -= normalX * targetReduction
      movement.targetVelocity.y -= normalY * targetReduction
    }
  }

  movement.currentSpeed = Math.hypot(movement.velocity.x, movement.velocity.y)
}

function getStaticObstacleCollisionInfo(unit, collisionResult, attemptedX, attemptedY, mapGrid) {
  if (!unit || !collisionResult) {
    return null
  }

  const attemptedCenterX = attemptedX + TILE_SIZE / 2
  const attemptedCenterY = attemptedY + TILE_SIZE / 2
  const velocityX = unit.movement?.velocity?.x || 0
  const velocityY = unit.movement?.velocity?.y || 0

  let normalX = 0
  let normalY = 0
  let overlap = MOVEMENT_CONFIG.MIN_UNIT_DISTANCE * 0.5

  if (collisionResult.type === 'terrain' || collisionResult.type === 'building') {
    let tileX = Number.isFinite(collisionResult.tileX) ? collisionResult.tileX : null
    let tileY = Number.isFinite(collisionResult.tileY) ? collisionResult.tileY : null

    if (tileX === null) {
      tileX = Math.floor(attemptedCenterX / TILE_SIZE)
    }
    if (tileY === null) {
      tileY = Math.floor(attemptedCenterY / TILE_SIZE)
    }

    const tileCenterX = (tileX + 0.5) * TILE_SIZE
    const tileCenterY = (tileY + 0.5) * TILE_SIZE
    normalX = tileCenterX - attemptedCenterX
    normalY = tileCenterY - attemptedCenterY

    const tileMinX = tileX * TILE_SIZE
    const tileMaxX = tileMinX + TILE_SIZE
    const tileMinY = tileY * TILE_SIZE
    const tileMaxY = tileMinY + TILE_SIZE
    const distLeft = attemptedCenterX - tileMinX
    const distRight = tileMaxX - attemptedCenterX
    const distTop = attemptedCenterY - tileMinY
    const distBottom = tileMaxY - attemptedCenterY
    const minEdgeDistance = Math.min(distLeft, distRight, distTop, distBottom)
    const halfTile = TILE_SIZE / 2
    overlap += Math.max(0, halfTile - minEdgeDistance)
  } else if (collisionResult.type === 'bounds') {
    const mapWidth = (mapGrid && mapGrid[0] ? mapGrid[0].length : 0) * TILE_SIZE
    const mapHeight = (Array.isArray(mapGrid) ? mapGrid.length : 0) * TILE_SIZE

    if (attemptedCenterX < TILE_SIZE / 2) {
      normalX = -1
      overlap += TILE_SIZE / 2 - attemptedCenterX
    } else if (mapWidth > 0 && attemptedCenterX > mapWidth - TILE_SIZE / 2) {
      normalX = 1
      overlap += attemptedCenterX - (mapWidth - TILE_SIZE / 2)
    }

    if (attemptedCenterY < TILE_SIZE / 2) {
      normalY = -1
      overlap += TILE_SIZE / 2 - attemptedCenterY
    } else if (mapHeight > 0 && attemptedCenterY > mapHeight - TILE_SIZE / 2) {
      normalY = 1
      overlap += attemptedCenterY - (mapHeight - TILE_SIZE / 2)
    }
  }

  const normalLength = Math.hypot(normalX, normalY)
  if (normalLength > 0.0001) {
    normalX /= normalLength
    normalY /= normalLength
  } else {
    const velocityLength = Math.hypot(velocityX, velocityY)
    if (velocityLength > 0.0001) {
      normalX = velocityX / velocityLength
      normalY = velocityY / velocityLength
    } else {
      normalX = 0
      normalY = -1
    }
  }

  return { normalX, normalY, overlap }
}

export function applyStaticObstacleCollisionResponse(
  unit,
  movement,
  collisionResult,
  attemptedX,
  attemptedY,
  mapGrid,
  occupancyMap,
  units = [],
  wrecks = []
) {
  if (!unit || !movement || !collisionResult) {
    return
  }

  const info = getStaticObstacleCollisionInfo(unit, collisionResult, attemptedX, attemptedY, mapGrid)
  if (!info) {
    return
  }

  const { normalX, normalY, overlap } = info
  const normalVel = movement.velocity.x * normalX + movement.velocity.y * normalY

  if (normalVel > 0) {
    const impulseBase = normalVel * STATIC_COLLISION_BOUNCE_MULT + overlap * STATIC_COLLISION_BOUNCE_OVERLAP
    const impulse = Math.max(STATIC_COLLISION_BOUNCE_MIN, Math.min(STATIC_COLLISION_BOUNCE_MAX, impulseBase))
    movement.velocity.x -= normalX * impulse
    movement.velocity.y -= normalY * impulse
  }

  if (movement.targetVelocity) {
    const targetNormal = movement.targetVelocity.x * normalX + movement.targetVelocity.y * normalY
    if (targetNormal > 0) {
      movement.targetVelocity.x -= normalX * targetNormal
      movement.targetVelocity.y -= normalY * targetNormal
    }
  }

  const separation = Math.min(
    STATIC_COLLISION_SEPARATION_MAX,
    Math.max(
      STATIC_COLLISION_SEPARATION_MIN,
      overlap * STATIC_COLLISION_SEPARATION_SCALE + Math.max(0, normalVel) * 0.4
    )
  )

  if (separation > 0.001) {
    applySafeSeparation(unit, -normalX * separation, -normalY * separation, mapGrid, occupancyMap, units, wrecks)
  }

  movement.currentSpeed = Math.hypot(movement.velocity.x, movement.velocity.y)
  movement.lastStaticCollisionTime = performance.now()
  movement.lastStaticCollisionNormal = { x: normalX, y: normalY }
}

export function applyUnitCollisionResponse(unit, movement, collisionResult, units = [], factories = [], gameState = null, mapGrid = null, occupancyMap = null, wrecks = []) {
  if (!unit || !movement || !collisionResult || collisionResult.type !== 'unit' || !collisionResult.data) {
    return false
  }

  const { normalX, normalY, overlap, unitSpeed, otherSpeed, airCollision = false } = collisionResult.data
  const factoryList = Array.isArray(factories) ? factories : []

  if (unit.type === 'tankerTruck') {
    const otherUnit = collisionResult.other
    const isEnemyCollision = Boolean(
      otherUnit && typeof otherUnit.owner === 'string' && typeof unit.owner === 'string' && otherUnit.owner !== unit.owner
    )
    const kamikazeActive = isEnemyCollision && unit.kamikazeMode
    const baseSpeed = typeof unit.speed === 'number' ? unit.speed : MOVEMENT_CONFIG.MAX_SPEED
    const speedModifier = typeof unit.speedModifier === 'number' ? unit.speedModifier : 1
    const effectiveSpeed = Math.max(baseSpeed * speedModifier, 0.01)
    const currentSpeed = unitSpeed || movement.currentSpeed || 0
    const remoteAtMaxSpeed = isEnemyCollision && unit.remoteControlActive && currentSpeed >= effectiveSpeed * 0.95

    if ((kamikazeActive || remoteAtMaxSpeed) && detonateTankerTruck(unit, units, factoryList, gameState)) {
      return true
    }
  }

  const separation = Math.min(COLLISION_SEPARATION_MAX, Math.max(COLLISION_SEPARATION_MIN, (overlap * COLLISION_SEPARATION_SCALE)))
  const otherUnit = collisionResult.other && collisionResult.other.movement ? collisionResult.other : null

  if (airCollision) {
    if (separation > 0.001) {
      applyAirSeparation(unit, otherUnit, normalX, normalY, separation)
    }

    const otherVelocity = otherUnit?.movement?.velocity
    const relativeNormalSpeed =
      (movement.velocity.x - (otherVelocity?.x || 0)) * normalX +
      (movement.velocity.y - (otherVelocity?.y || 0)) * normalY

    if (relativeNormalSpeed > 0) {
      const bleedOff = Math.min(relativeNormalSpeed, COLLISION_NORMAL_DAMPING_MAX)
      movement.velocity.x -= normalX * bleedOff
      movement.velocity.y -= normalY * bleedOff

      if (otherVelocity) {
        otherVelocity.x += normalX * Math.min(bleedOff * 0.5, COLLISION_NORMAL_DAMPING_MAX)
        otherVelocity.y += normalY * Math.min(bleedOff * 0.5, COLLISION_NORMAL_DAMPING_MAX)
      }
    }

    movement.currentSpeed = Math.hypot(movement.velocity.x, movement.velocity.y)
    return false
  } else if (separation > 0.001) {
    const pushOther = Boolean(otherUnit) && otherSpeed <= unitSpeed

    if (pushOther && otherUnit) {
      applySafeSeparation(
        otherUnit,
        normalX * separation,
        normalY * separation,
        mapGrid,
        occupancyMap,
        units,
        wrecks,
        [unit.id]
      )
    }

    applySafeSeparation(
      unit,
      -normalX * separation,
      -normalY * separation,
      mapGrid,
      occupancyMap,
      units,
      wrecks,
      otherUnit ? [otherUnit.id] : []
    )

    if (otherUnit) {
      ensureMinimumSeparation(unit, otherUnit, normalX, normalY, mapGrid, occupancyMap, units, wrecks)
    }
  }

  const normalVel = movement.velocity.x * normalX + movement.velocity.y * normalY
  if (normalVel > 0) {
    movement.velocity.x -= normalX * Math.min(normalVel * COLLISION_NORMAL_DAMPING_MULT, COLLISION_NORMAL_DAMPING_MAX)
    movement.velocity.y -= normalY * Math.min(normalVel * COLLISION_NORMAL_DAMPING_MULT, COLLISION_NORMAL_DAMPING_MAX)
  }

  movement.currentSpeed = Math.hypot(movement.velocity.x, movement.velocity.y)
  return false
}

export function applyBuildingCollisionResponse(unit, movement, collisionResult, units = [], factories = [], gameState = null) {
  if (!unit || !movement || !collisionResult || collisionResult.type !== 'building') {
    return false
  }

  if (unit.type !== 'tankerTruck') {
    return false
  }

  const building = collisionResult.building || null
  const factoryList = Array.isArray(factories) ? factories : []
  const enemyBuilding = building ? ownersAreEnemies(unit.owner, building.owner) : false

  let shouldDetonate = false

  if (unit.kamikazeMode && unit.kamikazeTargetType === 'building') {
    if (building && unit.kamikazeTargetBuilding && building === unit.kamikazeTargetBuilding) {
      shouldDetonate = true
    } else if (building && unit.kamikazeTargetId && building.id === unit.kamikazeTargetId) {
      shouldDetonate = true
    } else if (enemyBuilding) {
      const tileX = collisionResult.tileX
      const tileY = collisionResult.tileY
      if (typeof tileX === 'number' && typeof tileY === 'number' && building &&
          typeof building.x === 'number' && typeof building.y === 'number' &&
          typeof building.width === 'number' && typeof building.height === 'number') {
        const withinBounds = tileX >= building.x && tileX < building.x + building.width &&
          tileY >= building.y && tileY < building.y + building.height
        if (withinBounds) {
          shouldDetonate = true
        }
      } else if (unit.kamikazeTargetPoint) {
        const targetTileX = Math.floor(unit.kamikazeTargetPoint.x / TILE_SIZE)
        const targetTileY = Math.floor(unit.kamikazeTargetPoint.y / TILE_SIZE)
        if (tileX === targetTileX && tileY === targetTileY) {
          shouldDetonate = true
        }
      } else {
        shouldDetonate = true
      }
    }
  }

  if (!shouldDetonate && enemyBuilding && unit.remoteControlActive) {
    const baseSpeed = typeof unit.speed === 'number' ? unit.speed : MOVEMENT_CONFIG.MAX_SPEED
    const speedModifier = typeof unit.speedModifier === 'number' ? unit.speedModifier : 1
    const effectiveSpeed = Math.max(baseSpeed * speedModifier, 0.01)
    const currentSpeed = movement.currentSpeed || Math.hypot(movement.velocity.x, movement.velocity.y)
    if (currentSpeed >= effectiveSpeed * 0.95) {
      shouldDetonate = true
    }
  }

  if (shouldDetonate) {
    return detonateTankerTruck(unit, units, factoryList, gameState)
  }

  return false
}

export function trySlideMovement(unit, movement, mapGrid, occupancyMap, units = [], wrecks = []) {
  const originalX = unit.x
  const originalY = unit.y

  unit.x = originalX + movement.velocity.x
  unit.y = originalY

  if (!checkUnitCollision(unit, mapGrid, occupancyMap, units, wrecks).collided) {
    movement.velocity.y = 0
    return
  }

  unit.x = originalX
  unit.y = originalY + movement.velocity.y

  if (!checkUnitCollision(unit, mapGrid, occupancyMap, units, wrecks).collided) {
    movement.velocity.x = 0
    return
  }

  unit.x = originalX
  unit.y = originalY
  movement.velocity.x = 0
  movement.velocity.y = 0
}

export function calculateAirCollisionAvoidance(unit, units) {
  if (!unit || !units || units.length === 0) {
    return { x: 0, y: 0 }
  }

  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2
  const unitVelX = unit.movement?.velocity?.x || 0
  const unitVelY = unit.movement?.velocity?.y || 0
  const radiusSq = AIR_COLLISION_AVOID_RADIUS * AIR_COLLISION_AVOID_RADIUS
  const minDistanceSq = MOVEMENT_CONFIG.MIN_UNIT_DISTANCE * MOVEMENT_CONFIG.MIN_UNIT_DISTANCE
  const timeHorizonFrames = AIR_COLLISION_TIME_HORIZON / BASE_FRAME_SECONDS
  let avoidanceX = 0
  let avoidanceY = 0
  let neighborCount = 0

  for (const otherUnit of units) {
    if (!otherUnit || otherUnit.id === unit.id || otherUnit.health <= 0) continue
    if (!isAirborneUnit(otherUnit)) continue

    const otherCenterX = otherUnit.x + TILE_SIZE / 2
    const otherCenterY = otherUnit.y + TILE_SIZE / 2
    const dx = unitCenterX - otherCenterX
    const dy = unitCenterY - otherCenterY
    const distanceSq = dx * dx + dy * dy

    if (distanceSq < 1 || distanceSq > radiusSq) continue

    const relativeVelX = unitVelX - (otherUnit.movement?.velocity?.x || 0)
    const relativeVelY = unitVelY - (otherUnit.movement?.velocity?.y || 0)
    const relativeSpeedSq = relativeVelX * relativeVelX + relativeVelY * relativeVelY
    const closingDot = dx * relativeVelX + dy * relativeVelY

    if (closingDot <= 0 && distanceSq > minDistanceSq) {
      continue
    }

    let timeToClosest = relativeSpeedSq > 0 ? -closingDot / relativeSpeedSq : Infinity
    if (timeToClosest < 0) timeToClosest = 0

    const projectedDx = dx + relativeVelX * Math.min(timeToClosest, timeHorizonFrames)
    const projectedDy = dy + relativeVelY * Math.min(timeToClosest, timeHorizonFrames)
    const projectedDistSq = projectedDx * projectedDx + projectedDy * projectedDy

    const withinHorizon = timeToClosest <= timeHorizonFrames
    const distanceFactor = Math.max(0, 1 - Math.min(projectedDistSq, radiusSq) / radiusSq)
    const safetyFactor = projectedDistSq < minDistanceSq ? 1 : Math.max(0, (minDistanceSq - projectedDistSq) / minDistanceSq)
    const timeFactor = withinHorizon && timeHorizonFrames > 0
      ? 1 - Math.min(1, (timeToClosest * BASE_FRAME_SECONDS) / AIR_COLLISION_TIME_HORIZON)
      : 0

    const strength = (distanceFactor + safetyFactor + timeFactor) * AIR_COLLISION_AVOID_FORCE
    const projectionDistance = Math.sqrt(projectedDistSq) || 1
    avoidanceX += (projectedDx / projectionDistance) * strength
    avoidanceY += (projectedDy / projectionDistance) * strength

    neighborCount++
    if (neighborCount >= AIR_COLLISION_AVOID_MAX_NEIGHBORS) {
      break
    }
  }

  return { x: avoidanceX, y: avoidanceY }
}

export function calculateCollisionAvoidance(unit, units, mapGrid, occupancyMap) {
  if (!unit) return { x: 0, y: 0 }

  const unitCenterX = unit._cx ?? (unit.x + TILE_SIZE / 2)
  const unitCenterY = unit._cy ?? (unit.y + TILE_SIZE / 2)
  let avoidanceX = 0
  let avoidanceY = 0

  const spatialTree = getSpatialQuadtree()
  const forceRadius = MOVEMENT_CONFIG.FORCE_FIELD_RADIUS
  const nearbyUnits = spatialTree
    ? spatialTree.queryNearbyGround(unitCenterX, unitCenterY, forceRadius, unit.id)
    : []

  for (let i = 0, len = nearbyUnits.length; i < len; i++) {
    const otherUnit = nearbyUnits[i]
    if (otherUnit.health <= 0) continue
    // Skip avoidance if this unit is our attack target
    if (unit.target && unit.target === otherUnit) continue

    const otherCenterX = otherUnit._cx ?? (otherUnit.x + TILE_SIZE / 2)
    const otherCenterY = otherUnit._cy ?? (otherUnit.y + TILE_SIZE / 2)
    const dx = unitCenterX - otherCenterX
    const dy = unitCenterY - otherCenterY
    const distSq = dx * dx + dy * dy

    if (distSq < 1) continue

    const distance = Math.sqrt(distSq)

    if (distance < forceRadius) {
      const normalizedDist = distance / forceRadius
      const forceMagnitude = MOVEMENT_CONFIG.FORCE_FIELD_STRENGTH *
        Math.pow(1 - normalizedDist, MOVEMENT_CONFIG.FORCE_FIELD_FALLOFF)

      const invDist = 1 / distance
      avoidanceX += dx * invDist * forceMagnitude
      avoidanceY += dy * invDist * forceMagnitude
    }
  }

  const movement = unit.movement
  if (!movement) return { x: avoidanceX, y: avoidanceY }

  const velX = movement.targetVelocity?.x ?? movement.velocity?.x ?? 0
  const velY = movement.targetVelocity?.y ?? movement.velocity?.y ?? 0
  const speed = Math.sqrt(velX * velX + velY * velY)

  if (speed > 0.0001 && mapGrid) {
    const invSpeed = 1 / speed
    const dirX = velX * invSpeed
    const dirY = velY * invSpeed

    for (let s = 0; s < 3; s++) {
      const step = LOCAL_LOOKAHEAD_STEPS[s]
      const lookDist = step * TILE_SIZE
      const sampleX = unitCenterX + dirX * lookDist
      const sampleY = unitCenterY + dirY * lookDist
      const tileX = (sampleX / TILE_SIZE) | 0
      const tileY = (sampleY / TILE_SIZE) | 0

      let blocked = isTileBlockedForCollision(mapGrid, tileX, tileY)

      if (!blocked && occupancyMap) {
        const row = occupancyMap[tileY]
        if (row) {
          const occ = row[tileX] || 0
          const myTileX = (unitCenterX / TILE_SIZE) | 0
          const myTileY = (unitCenterY / TILE_SIZE) | 0
          blocked = (tileX === myTileX && tileY === myTileY) ? occ > 1 : occ > 0
        }
      }

      if (blocked) {
        const tileCenterX = (tileX + 0.5) * TILE_SIZE
        const tileCenterY = (tileY + 0.5) * TILE_SIZE
        const awayX = unitCenterX - tileCenterX
        const awayY = unitCenterY - tileCenterY
        const awayDist = Math.sqrt(awayX * awayX + awayY * awayY) || 1

        const weight = 1 - step / 2
        const strength = weight * LOCAL_LOOKAHEAD_STRENGTH * MOVEMENT_CONFIG.AVOIDANCE_FORCE

        avoidanceX += (awayX / awayDist) * strength
        avoidanceY += (awayY / awayDist) * strength
      }
    }
  }

  return { x: avoidanceX, y: avoidanceY }
}
