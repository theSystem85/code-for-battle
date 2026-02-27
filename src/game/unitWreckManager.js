import {
  TILE_SIZE,
  WRECK_IMPACT_FORCE_MULTIPLIER,
  WRECK_INERTIA_DECAY,
  DEFAULT_MAP_TILES_X,
  DEFAULT_MAP_TILES_Y
} from '../config.js'
import { getUnitCost } from '../utils.js'
import { UNIT_COLLISION_MIN_DISTANCE } from './unifiedMovement.js'
import { gameRandom } from '../utils/gameRandom.js'

function adjustWreckOccupancy(wreck, occupancyMap, tileX, tileY) {
  if (!occupancyMap || occupancyMap.length === 0) {
    wreck.occupancyTileX = Number.isInteger(tileX) ? tileX : null
    wreck.occupancyTileY = Number.isInteger(tileY) ? tileY : null
    return
  }

  const prevX = wreck.occupancyTileX
  const prevY = wreck.occupancyTileY

  if (
    Number.isInteger(prevX) &&
    Number.isInteger(prevY) &&
    prevY >= 0 &&
    prevY < occupancyMap.length &&
    prevX >= 0 &&
    prevX < occupancyMap[prevY].length
  ) {
    occupancyMap[prevY][prevX] = Math.max(0, (occupancyMap[prevY][prevX] || 0) - 1)
  }

  if (
    Number.isInteger(tileX) &&
    Number.isInteger(tileY) &&
    tileY >= 0 &&
    tileY < occupancyMap.length &&
    tileX >= 0 &&
    tileX < occupancyMap[tileY].length
  ) {
    occupancyMap[tileY][tileX] = (occupancyMap[tileY][tileX] || 0) + 1
    wreck.occupancyTileX = tileX
    wreck.occupancyTileY = tileY
  } else {
    wreck.occupancyTileX = null
    wreck.occupancyTileY = null
  }
}

function cleanupWreck(wreck, gameState) {
  if (!wreck || !gameState) {
    return
  }
  if (gameState.occupancyMap) {
    adjustWreckOccupancy(wreck, gameState.occupancyMap, null, null)
  }
  if (gameState.selectedWreckId === wreck.id) {
    gameState.selectedWreckId = null
  }
  releaseWreckAssignment(wreck)
}

const DEFAULT_BUILD_DURATION_BASE = 3000
const MIN_BUILD_DURATION = 1000

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function estimateBuildDuration(unitType, existingDuration = null) {
  if (existingDuration && existingDuration > 0) {
    return existingDuration
  }
  const cost = getUnitCost(unitType) || 500
  const estimated = DEFAULT_BUILD_DURATION_BASE * (cost / 500)
  return Math.max(MIN_BUILD_DURATION, estimated)
}

export function registerUnitWreck(unit, gameState) {
  if (!unit) return null
  if (!gameState.unitWrecks) {
    gameState.unitWrecks = []
  }

  const existing = gameState.unitWrecks.find(w => w.sourceUnitId === unit.id)
  if (existing) {
    return existing
  }

  const baseHealth = Math.max(1, unit.maxHealth || unit.health || 100)

  const wreck = {
    id: `${unit.id}-wreck`,
    sourceUnitId: unit.id,
    unitType: unit.type,
    owner: unit.owner,
    x: unit.x,
    y: unit.y,
    tileX: unit.tileX,
    tileY: unit.tileY,
    direction: (unit.type === 'f22Raptor' && Number.isFinite(unit.f22CrashWreckDirection))
      ? unit.f22CrashWreckDirection
      : (unit.direction || 0),
    turretDirection: unit.turretDirection || unit.direction || 0,
    createdAt: performance.now(),
    cost: getUnitCost(unit.type) || 0,
    buildDuration: estimateBuildDuration(unit.type, unit.buildDuration),
    assignedTankId: null,
    towedBy: null,
    isBeingRecycled: false,
    recycleStartedAt: null,
    recycleDuration: null,
    noiseSeed: gameRandom(),
    spriteCacheKey: unit.type,
    maxHealth: baseHealth,
    health: baseHealth,
    velocityX: 0,
    velocityY: 0,
    occupancyTileX: null,
    occupancyTileY: null
  }

  gameState.unitWrecks.push(wreck)
  if (gameState.occupancyMap) {
    // Calculate center-based tile position for occupancy
    const centerTileX = Math.floor((wreck.x + TILE_SIZE / 2) / TILE_SIZE)
    const centerTileY = Math.floor((wreck.y + TILE_SIZE / 2) / TILE_SIZE)
    adjustWreckOccupancy(wreck, gameState.occupancyMap, centerTileX, centerTileY)
  }
  return wreck
}

export function getWreckById(gameState, wreckId) {
  if (!gameState || !gameState.unitWrecks) return null
  return gameState.unitWrecks.find(wreck => wreck.id === wreckId)
}

export function removeWreckById(gameState, wreckId) {
  if (!gameState || !gameState.unitWrecks) return null
  const index = gameState.unitWrecks.findIndex(wreck => wreck.id === wreckId)
  if (index !== -1) {
    const [removed] = gameState.unitWrecks.splice(index, 1)
    cleanupWreck(removed, gameState)
    return removed
  }
  return null
}

export function findWreckAtTile(gameState, tileX, tileY) {
  if (!gameState || !gameState.unitWrecks) return null
  return gameState.unitWrecks.find(wreck => {
    const wTileX = Math.floor((wreck.x + TILE_SIZE / 2) / TILE_SIZE)
    const wTileY = Math.floor((wreck.y + TILE_SIZE / 2) / TILE_SIZE)
    return wTileX === tileX && wTileY === tileY
  })
}

export function releaseWreckAssignment(wreck) {
  if (!wreck) return
  wreck.assignedTankId = null
  wreck.towedBy = null
  wreck.isBeingRecycled = false
  wreck.recycleStartedAt = null
  wreck.recycleDuration = null
}

export function updateWreckPositionFromTank(wreck, tank, occupancyMap) {
  if (!wreck || !tank) return
  const offsetDistance = TILE_SIZE * 0.8
  const angle = tank.direction || 0
  const offsetX = -Math.cos(angle) * offsetDistance
  const offsetY = -Math.sin(angle) * offsetDistance
  wreck.x = tank.x + offsetX
  wreck.y = tank.y + offsetY
  wreck.tileX = Math.floor((wreck.x + TILE_SIZE / 2) / TILE_SIZE)
  wreck.tileY = Math.floor((wreck.y + TILE_SIZE / 2) / TILE_SIZE)
  if (occupancyMap) {
    adjustWreckOccupancy(wreck, occupancyMap, wreck.tileX, wreck.tileY)
  }
}

export function findNearestWorkshop(gameState, owner, fromTile) {
  if (!gameState || !gameState.buildings) return null
  const workshops = gameState.buildings.filter(building =>
    building.type === 'vehicleWorkshop' &&
    building.owner === owner &&
    building.health > 0
  )

  if (workshops.length === 0) {
    return null
  }

  let best = null
  let bestDistance = Infinity

  workshops.forEach(workshop => {
    const entryTiles = getWorkshopEntryTiles(workshop)
    entryTiles.forEach(tile => {
      const dx = tile.x - fromTile.x
      const dy = tile.y - fromTile.y
      const dist = Math.hypot(dx, dy)
      if (dist < bestDistance) {
        bestDistance = dist
        best = { workshop, entryTile: tile }
      }
    })
  })

  return best
}

function getWorkshopEntryTiles(workshop) {
  const tiles = []
  const startX = workshop.x - 1
  const endX = workshop.x + workshop.width
  const startY = workshop.y - 1
  const endY = workshop.y + workshop.height

  for (let x = startX; x <= endX; x++) {
    tiles.push({ x, y: startY })
    tiles.push({ x, y: endY })
  }

  for (let y = startY + 1; y < endY; y++) {
    tiles.push({ x: startX, y })
    tiles.push({ x: endX, y })
  }

  return tiles
}

export function getRecycleDurationForWreck(wreck) {
  if (!wreck) return MIN_BUILD_DURATION
  return clamp(estimateBuildDuration(wreck.unitType, wreck.buildDuration), MIN_BUILD_DURATION, 600000)
}

export function applyDamageToWreck(wreck, damage, gameState, impactPosition = null) {
  if (!wreck || !gameState) return false
  const actualDamage = Math.max(0, damage)
  if (actualDamage === 0 || wreck.health <= 0) {
    return false
  }

  wreck.health = Math.max(0, wreck.health - actualDamage)

  if (wreck.health === 0) {
    removeWreckById(gameState, wreck.id)
    return true
  }

  if (
    impactPosition &&
    Number.isFinite(impactPosition.x) &&
    Number.isFinite(impactPosition.y)
  ) {
    const centerX = wreck.x + TILE_SIZE / 2
    const centerY = wreck.y + TILE_SIZE / 2
    let dx = centerX - impactPosition.x
    let dy = centerY - impactPosition.y
    let distance = Math.hypot(dx, dy)

    if (distance === 0) {
      const randomAngle = gameRandom() * Math.PI * 2
      dx = Math.cos(randomAngle)
      dy = Math.sin(randomAngle)
      distance = 1
    }

    const normX = dx / distance
    const normY = dy / distance
    const impulse = actualDamage * WRECK_IMPACT_FORCE_MULTIPLIER

    wreck.velocityX = (wreck.velocityX || 0) + normX * impulse
    wreck.velocityY = (wreck.velocityY || 0) + normY * impulse
  }

  return false
}

const BASE_FRAME_TIME = 1000 / 60

export function updateWreckPhysics(gameState, unitsOrDelta, maybeDelta) {
  if (!gameState || !Array.isArray(gameState.unitWrecks) || gameState.unitWrecks.length === 0) {
    return
  }

  let units = []
  let delta = unitsOrDelta

  if (Array.isArray(unitsOrDelta)) {
    units = unitsOrDelta
    delta = maybeDelta
  }

  if (!Number.isFinite(delta)) {
    delta = undefined
  }

  const effectiveDelta = Number.isFinite(delta) && delta > 0 ? delta : BASE_FRAME_TIME
  const frameFactor = effectiveDelta / BASE_FRAME_TIME
  const inertiaFactor = Math.pow(WRECK_INERTIA_DECAY, frameFactor)

  const gridRows = Array.isArray(gameState.mapGrid) ? gameState.mapGrid.length : 0
  const gridCols = gridRows > 0 && Array.isArray(gameState.mapGrid[0]) ? gameState.mapGrid[0].length : 0

  const mapTilesX = Number.isFinite(gameState.mapTilesX) && gameState.mapTilesX > 0
    ? gameState.mapTilesX
    : (gridCols || DEFAULT_MAP_TILES_X)

  const mapTilesY = Number.isFinite(gameState.mapTilesY) && gameState.mapTilesY > 0
    ? gameState.mapTilesY
    : (gridRows || DEFAULT_MAP_TILES_Y)

  const mapWidth = Math.max(TILE_SIZE, mapTilesX * TILE_SIZE)
  const mapHeight = Math.max(TILE_SIZE, mapTilesY * TILE_SIZE)
  const maxX = Math.max(0, mapWidth - TILE_SIZE)
  const maxY = Math.max(0, mapHeight - TILE_SIZE)

  const occupancyMap = gameState.occupancyMap
  const mapGrid = Array.isArray(gameState.mapGrid) ? gameState.mapGrid : []

  gameState.unitWrecks.forEach(wreck => {
    if (!wreck || wreck.health <= 0) {
      return
    }

    if (wreck.towedBy) {
      wreck.velocityX = 0
      wreck.velocityY = 0
      return
    }

    const velocityX = wreck.velocityX || 0
    const velocityY = wreck.velocityY || 0

    if (Math.abs(velocityX) < 0.0001 && Math.abs(velocityY) < 0.0001) {
      wreck.velocityX = 0
      wreck.velocityY = 0
      return
    }

    const deltaX = velocityX * frameFactor
    const deltaY = velocityY * frameFactor

    if (deltaX === 0 && deltaY === 0) {
      wreck.velocityX = velocityX * inertiaFactor
      wreck.velocityY = velocityY * inertiaFactor
      return
    }

    const prevX = wreck.x
    const prevY = wreck.y

    const targetX = prevX + deltaX
    const targetY = prevY + deltaY
    const candidateX = clamp(targetX, 0, maxX)
    const candidateY = clamp(targetY, 0, maxY)

    const prevCenterX = prevX + TILE_SIZE / 2
    const prevCenterY = prevY + TILE_SIZE / 2
    const candidateCenterX = candidateX + TILE_SIZE / 2
    const candidateCenterY = candidateY + TILE_SIZE / 2

    const tileX = Math.floor(candidateCenterX / TILE_SIZE)
    const tileY = Math.floor(candidateCenterY / TILE_SIZE)

    let collided = false
    let separationVelX = 0
    let separationVelY = 0

    if (isTileBlocked(mapGrid, tileX, tileY)) {
      collided = true
    }

    if (!collided && Array.isArray(units) && units.length > 0) {
      for (const unit of units) {
        if (!unit || unit.health <= 0) continue

        const unitCenterX = unit.x + TILE_SIZE / 2
        const unitCenterY = unit.y + TILE_SIZE / 2

        const collision = evaluateEntityCollision(prevCenterX, prevCenterY, candidateCenterX, candidateCenterY, unitCenterX, unitCenterY)
        if (collision.blocked) {
          collided = true
          const impulse = (collision.overlap + 0.5) * 0.25
          separationVelX += collision.normalX * impulse
          separationVelY += collision.normalY * impulse
          break
        }
      }
    }

    if (!collided) {
      for (const otherWreck of gameState.unitWrecks) {
        if (!otherWreck || otherWreck === wreck || otherWreck.health <= 0) continue

        const otherCenterX = otherWreck.x + TILE_SIZE / 2
        const otherCenterY = otherWreck.y + TILE_SIZE / 2

        const collision = evaluateEntityCollision(prevCenterX, prevCenterY, candidateCenterX, candidateCenterY, otherCenterX, otherCenterY)
        if (collision.blocked) {
          collided = true
          const impulse = (collision.overlap + 0.5) * 0.25
          separationVelX += collision.normalX * impulse
          separationVelY += collision.normalY * impulse
          otherWreck.velocityX = (otherWreck.velocityX || 0) - collision.normalX * impulse
          otherWreck.velocityY = (otherWreck.velocityY || 0) - collision.normalY * impulse
          break
        }
      }
    }

    let nextVelX
    let nextVelY
    let finalX
    let finalY
    const moved = !collided

    if (collided) {
      finalX = prevX
      finalY = prevY
      nextVelX = separationVelX
      nextVelY = separationVelY
    } else {
      finalX = candidateX
      finalY = candidateY
      const baseVelX = candidateX !== targetX ? 0 : velocityX * inertiaFactor
      const baseVelY = candidateY !== targetY ? 0 : velocityY * inertiaFactor
      nextVelX = Math.abs(baseVelX) < 0.001 ? 0 : baseVelX
      nextVelY = Math.abs(baseVelY) < 0.001 ? 0 : baseVelY
    }

    wreck.x = finalX
    wreck.y = finalY

    if (moved) {
      const newTileX = Math.floor((finalX + TILE_SIZE / 2) / TILE_SIZE)
      const newTileY = Math.floor((finalY + TILE_SIZE / 2) / TILE_SIZE)

      if (newTileX !== wreck.tileX || newTileY !== wreck.tileY) {
        wreck.tileX = newTileX
        wreck.tileY = newTileY
        if (occupancyMap) {
          adjustWreckOccupancy(wreck, occupancyMap, newTileX, newTileY)
        }
      }
    }

    wreck.velocityX = Math.abs(nextVelX) < 0.001 ? 0 : nextVelX
    wreck.velocityY = Math.abs(nextVelY) < 0.001 ? 0 : nextVelY
  })
}

function isTileBlocked(mapGrid, tileX, tileY) {
  if (!Array.isArray(mapGrid) || mapGrid.length === 0) {
    return false
  }

  if (tileY < 0 || tileY >= mapGrid.length) {
    return true
  }

  const row = mapGrid[tileY]
  if (!row || tileX < 0 || tileX >= row.length) {
    return true
  }

  const tile = row[tileX]

  if (tile === 1) {
    return true
  }

  if (tile && typeof tile === 'object') {
    if (tile.type === 'water' || tile.type === 'rock' || tile.seedCrystal || tile.building) {
      return true
    }

    if (tile.walkable === false || tile.passable === false) {
      return true
    }
  }

  return false
}

function evaluateEntityCollision(prevCenterX, prevCenterY, newCenterX, newCenterY, otherCenterX, otherCenterY) {
  const newDistance = Math.hypot(newCenterX - otherCenterX, newCenterY - otherCenterY)

  if (!Number.isFinite(newDistance)) {
    return { blocked: false, overlap: 0, normalX: 0, normalY: 0 }
  }

  if (newDistance >= UNIT_COLLISION_MIN_DISTANCE) {
    return { blocked: false, overlap: 0, normalX: 0, normalY: 0 }
  }

  const prevDistance = Math.hypot(prevCenterX - otherCenterX, prevCenterY - otherCenterY)
  const movingAway = Number.isFinite(prevDistance) && newDistance > prevDistance + 0.1

  if (movingAway) {
    return { blocked: false, overlap: 0, normalX: 0, normalY: 0 }
  }

  const normalX = (newCenterX - otherCenterX) / (newDistance || 1)
  const normalY = (newCenterY - otherCenterY) / (newDistance || 1)
  const overlap = UNIT_COLLISION_MIN_DISTANCE - newDistance

  return { blocked: true, overlap, normalX, normalY }
}

