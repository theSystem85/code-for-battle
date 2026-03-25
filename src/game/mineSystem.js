// game/mineSystem.js - Land mine deployment, detonation, and chain reaction mechanics
import { gameState } from '../gameState.js'
import { getUniqueId } from '../utils.js'
import {
  TILE_SIZE,
  MINE_HEALTH,
  MINE_DAMAGE_CENTER,
  MINE_EXPLOSION_RADIUS,
  MINE_ARM_DELAY
} from '../config.js'
import { broadcastBuildingDamage } from '../network/gameCommandSync.js'
import { recordDamage } from '../ai-api/transitionCollector.js'
import { getSimulationTime } from './time.js'

const mineLookup = new Map()

function getTileKey(tileX, tileY) {
  return `${tileX},${tileY}`
}

function registerMine(mine) {
  mineLookup.set(getTileKey(mine.tileX, mine.tileY), mine)
}

function unregisterMine(mine) {
  mineLookup.delete(getTileKey(mine.tileX, mine.tileY))
}

/**
 * Create a new mine entity
 * @param {number} tileX - Tile X coordinate
 * @param {number} tileY - Tile Y coordinate
 * @param {string} owner - Owner player ID
 * @param {number} deployTime - Simulation timestamp when mine was deployed
 * @returns {object} Mine entity
 */
export function createMine(tileX, tileY, owner, deployTime = getSimulationTime(gameState)) {
  return {
    id: getUniqueId(),
    tileX,
    tileY,
    owner,
    health: MINE_HEALTH,
    maxHealth: MINE_HEALTH,
    deployTime,
    armedAt: deployTime + MINE_ARM_DELAY,
    active: false // Will become true after arming delay
  }
}

/**
 * Deploy a mine at the specified tile position
 * @param {number} tileX - Tile X coordinate
 * @param {number} tileY - Tile Y coordinate
 * @param {string} owner - Owner player ID
 * @returns {object|null} Deployed mine or null if position invalid
 */
export function deployMine(tileX, tileY, owner) {
  // Check if there's already a mine at this position
  const existingMine = gameState.mines.find(m => m.tileX === tileX && m.tileY === tileY)
  if (existingMine) {
    return null // Cannot deploy mine on top of another mine
  }

  const mine = createMine(tileX, tileY, owner)
  gameState.mines.push(mine)
  registerMine(mine)

  return mine
}

/**
 * Update mine states (arming, etc.)
 * @param {number} currentTime - Current performance timestamp
 */
export function updateMines(currentTime) {
  gameState.mines.forEach(mine => {
    if (!mine.active && currentTime >= mine.armedAt) {
      mine.active = true
    }
  })
}

/**
 * Get mine at specific tile coordinates
 * @param {number} tileX - Tile X coordinate
 * @param {number} tileY - Tile Y coordinate
 * @returns {object|null} Mine entity or null
 */
export function getMineAtTile(tileX, tileY) {
  return mineLookup.get(getTileKey(tileX, tileY)) || null
}

/**
 * Check if a tile has an active (armed) mine
 * @param {number} tileX - Tile X coordinate
 * @param {number} tileY - Tile Y coordinate
 * @returns {boolean} True if tile has an active mine
 */
export function hasActiveMine(tileX, tileY) {
  const mine = getMineAtTile(tileX, tileY)
  return mine ? mine.active : false
}

/**
 * Detonate a mine and apply damage
 * @param {object} mine - Mine entity to detonate
 * @param {array} units - Array of all units
 * @param {array} buildings - Array of all buildings
 */
export function detonateMine(mine, units, buildings) {
  if (!mine) return
  const now = getSimulationTime(gameState)

  // Create explosion effect at mine location
  const explosionX = mine.tileX * TILE_SIZE + TILE_SIZE / 2
  const explosionY = mine.tileY * TILE_SIZE + TILE_SIZE / 2

  gameState.explosions.push({
    x: explosionX,
    y: explosionY,
    maxRadius: TILE_SIZE,
    startTime: now,
    duration: 300
  })

  const radius = Math.max(0, MINE_EXPLOSION_RADIUS)
  const maxOffset = Math.ceil(radius)
  const mapGrid = Array.isArray(gameState.mapGrid) ? gameState.mapGrid : []
  const mapWidth = mapGrid.length > 0 ? mapGrid[0].length : 0
  const mapHeight = mapGrid.length
  const hasBounds = mapWidth > 0 && mapHeight > 0

  for (let dx = -maxOffset; dx <= maxOffset; dx++) {
    for (let dy = -maxOffset; dy <= maxOffset; dy++) {
      const targetX = mine.tileX + dx
      const targetY = mine.tileY + dy
      if (hasBounds && (targetX < 0 || targetY < 0 || targetX >= mapWidth || targetY >= mapHeight)) {
        continue
      }
      const distance = Math.hypot(dx, dy)
      if (distance > radius) {
        continue
      }
      const falloff = radius > 0 ? Math.max(0, 1 - distance / radius) : 1
      const damage = MINE_DAMAGE_CENTER * falloff
      if (damage <= 0) continue
      applyMineDamageToTile(targetX, targetY, damage, units, buildings)
    }
  }

  // Remove the detonated mine
  const mineIndex = gameState.mines.indexOf(mine)
  if (mineIndex !== -1) {
    gameState.mines.splice(mineIndex, 1)
    unregisterMine(mine)
  }

  // Check for chain reactions with adjacent mines
  checkChainReaction(mine.tileX, mine.tileY, units, buildings)
}

/**
 * Apply damage to all units and buildings on a specific tile
 * @param {number} tileX - Tile X coordinate
 * @param {number} tileY - Tile Y coordinate
 * @param {number} damage - Amount of damage to apply
 * @param {array} units - Array of all units
 * @param {array} buildings - Array of all buildings
 */
function applyMineDamageToTile(tileX, tileY, damage, units, buildings) {
  if (damage <= 0) return

  units.forEach(unit => {
    const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

    if (unitTileX === tileX && unitTileY === tileY) {
      const previousHealth = unit.health
      unit.health = Math.max(0, unit.health - damage)
      const damageAmount = Math.max(0, previousHealth - unit.health)
      if (damageAmount > 0 && gameState.gameStarted && !gameState.mapEditMode) {
        recordDamage({
          attackerId: null,
          targetId: unit.id,
          targetKind: 'unit',
          amount: damageAmount,
          weapon: 'mine',
          position: { x: unit.x, y: unit.y, space: 'world' },
          tick: gameState.frameCount,
          timeSeconds: gameState.gameTime
        })
      }
    }
  })

  // Damage buildings on this tile
  buildings.forEach(building => {
    for (let by = building.y; by < building.y + building.height; by++) {
      for (let bx = building.x; bx < building.x + building.width; bx++) {
        if (bx === tileX && by === tileY) {
          const previousHealth = building.health
          building.health = Math.max(0, building.health - damage)
          const damageAmount = Math.max(0, previousHealth - building.health)
          if (damageAmount > 0 && gameState.gameStarted && !gameState.mapEditMode) {
            recordDamage({
              attackerId: null,
              targetId: building.id,
              targetKind: 'building',
              amount: damageAmount,
              weapon: 'mine',
              position: {
                x: building.x * TILE_SIZE + (building.width * TILE_SIZE) / 2,
                y: building.y * TILE_SIZE + (building.height * TILE_SIZE) / 2,
                space: 'world'
              },
              tick: gameState.frameCount,
              timeSeconds: gameState.gameTime
            })
          }
          // Broadcast building damage to host in multiplayer
          if (building.id) {
            broadcastBuildingDamage(building.id, damage, building.health)
          }
          return // Only damage once per building
        }
      }
    }
  })

  // Check if there's a mine on this tile and damage it
  const mine = getMineAtTile(tileX, tileY)
  if (mine && mine.active) {
    mine.health = Math.max(0, mine.health - damage)
  }
}

/**
 * Check for chain reactions with adjacent mines
 * @param {number} sourceTileX - Source tile X coordinate
 * @param {number} sourceTileY - Source tile Y coordinate
 * @param {array} units - Array of all units
 * @param {array} buildings - Array of all buildings
 */
function checkChainReaction(sourceTileX, sourceTileY, units, buildings) {
  const orthogonalOffsets = [
    { dx: 0, dy: -1 },  // North
    { dx: 1, dy: 0 },   // East
    { dx: 0, dy: 1 },   // South
    { dx: -1, dy: 0 }   // West
  ]

  orthogonalOffsets.forEach(({ dx, dy }) => {
    const neighborX = sourceTileX + dx
    const neighborY = sourceTileY + dy
    const adjacentMine = getMineAtTile(neighborX, neighborY)

    if (adjacentMine && adjacentMine.active && adjacentMine.health <= 0) {
      // This mine was destroyed by the explosion, trigger chain reaction
      detonateMine(adjacentMine, units, buildings)
    }
  })
}

/**
 * Remove a mine from the game state
 * @param {object} mine - Mine to remove
 */
export function removeMine(mine) {
  const index = gameState.mines.indexOf(mine)
  if (index !== -1) {
    gameState.mines.splice(index, 1)
    unregisterMine(mine)
  }
}

/**
 * Safely detonate a mine when cleared by a Mine Sweeper
 * Creates explosion effects and damages nearby units/buildings, but grants immunity to sweeping units
 * @param {object} mine - Mine to detonate
 * @param {array} units - Array of all units
 * @param {array} buildings - Array of all buildings
 */
export function safeSweeperDetonation(mine, units, buildings) {
  if (!mine) return
  const now = getSimulationTime(gameState)

  // Create explosion effect at mine location
  const explosionX = mine.tileX * TILE_SIZE + TILE_SIZE / 2
  const explosionY = mine.tileY * TILE_SIZE + TILE_SIZE / 2

  gameState.explosions.push({
    x: explosionX,
    y: explosionY,
    maxRadius: TILE_SIZE,
    startTime: now,
    duration: 300
  })

  const radius = 1 // Reduced radius for sweeper detonations to prevent chain reactions
  const maxOffset = Math.ceil(radius)
  const mapGrid = Array.isArray(gameState.mapGrid) ? gameState.mapGrid : []
  const mapWidth = mapGrid.length > 0 ? mapGrid[0].length : 0
  const mapHeight = mapGrid.length
  const hasBounds = mapWidth > 0 && mapHeight > 0

  for (let dx = -maxOffset; dx <= maxOffset; dx++) {
    for (let dy = -maxOffset; dy <= maxOffset; dy++) {
      const targetX = mine.tileX + dx
      const targetY = mine.tileY + dy
      if (hasBounds && (targetX < 0 || targetY < 0 || targetX >= mapWidth || targetY >= mapHeight)) {
        continue
      }
      const distance = Math.hypot(dx, dy)
      if (distance > radius) {
        continue
      }
      const falloff = radius > 0 ? Math.max(0, 1 - distance / radius) : 1
      const damage = MINE_DAMAGE_CENTER * falloff
      if (damage <= 0) continue

      // Apply damage but skip sweeping units
      applyMineDamageWithSweeperImmunity(targetX, targetY, damage, units, buildings)
    }
  }

  // Remove the detonated mine
  const mineIndex = gameState.mines.indexOf(mine)
  if (mineIndex !== -1) {
    gameState.mines.splice(mineIndex, 1)
    unregisterMine(mine)
  }

  // Check for chain reactions with adjacent mines
  checkChainReaction(mine.tileX, mine.tileY, units, buildings)
}

/**
 * Apply damage to units and buildings, but skip units that are currently sweeping
 * @param {number} tileX - Tile X coordinate
 * @param {number} tileY - Tile Y coordinate
 * @param {number} damage - Amount of damage to apply
 * @param {array} units - Array of all units
 * @param {array} buildings - Array of all buildings
 */
function applyMineDamageWithSweeperImmunity(tileX, tileY, damage, units, buildings) {
  if (damage <= 0) return

  units.forEach(unit => {
    const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

    if (unitTileX === tileX && unitTileY === tileY) {
      // Grant immunity to sweeping Mine Sweepers
      if (unit.type === 'mineSweeper' && unit.sweeping) {
        return // Skip damage for sweeping Mine Sweepers
      }
      const previousHealth = unit.health
      unit.health = Math.max(0, unit.health - damage)
      const damageAmount = Math.max(0, previousHealth - unit.health)
      if (damageAmount > 0 && gameState.gameStarted && !gameState.mapEditMode) {
        recordDamage({
          attackerId: null,
          targetId: unit.id,
          targetKind: 'unit',
          amount: damageAmount,
          weapon: 'mine',
          position: { x: unit.x, y: unit.y, space: 'world' },
          tick: gameState.frameCount,
          timeSeconds: gameState.gameTime
        })
      }
    }
  })

  // Damage buildings on this tile
  buildings.forEach(building => {
    for (let by = building.y; by < building.y + building.height; by++) {
      for (let bx = building.x; bx < building.x + building.width; bx++) {
        if (bx === tileX && by === tileY) {
          const previousHealth = building.health
          building.health = Math.max(0, building.health - damage)
          const damageAmount = Math.max(0, previousHealth - building.health)
          if (damageAmount > 0 && gameState.gameStarted && !gameState.mapEditMode) {
            recordDamage({
              attackerId: null,
              targetId: building.id,
              targetKind: 'building',
              amount: damageAmount,
              weapon: 'mine',
              position: {
                x: building.x * TILE_SIZE + (building.width * TILE_SIZE) / 2,
                y: building.y * TILE_SIZE + (building.height * TILE_SIZE) / 2,
                space: 'world'
              },
              tick: gameState.frameCount,
              timeSeconds: gameState.gameTime
            })
          }
          // Broadcast building damage to host in multiplayer
          if (building.id) {
            broadcastBuildingDamage(building.id, damage, building.health)
          }
          return // Only damage once per building
        }
      }
    }
  })

  // Note: Mines are not damaged by other mine explosions to prevent chain reactions
}

/**
 * Distribute mine payload damage when Mine Layer is destroyed
 * @param {object} unit - Mine Layer unit being destroyed
 * @param {array} units - Array of all units
 * @param {array} buildings - Array of all buildings
 */
export function distributeMineLayerPayload(unit, units, buildings) {
  if (unit.type !== 'mineLayer' || !unit.remainingMines || unit.remainingMines <= 0) {
    return
  }

  const now = getSimulationTime(gameState)

  // Calculate total damage from remaining mines
  const totalDamage = unit.remainingMines * MINE_DAMAGE_CENTER

  // Distribute evenly to surrounding 8 tiles
  const surroundingOffsets = [
    { dx: 0, dy: -1 },   // North
    { dx: 1, dy: -1 },   // Northeast
    { dx: 1, dy: 0 },    // East
    { dx: 1, dy: 1 },    // Southeast
    { dx: 0, dy: 1 },    // South
    { dx: -1, dy: 1 },   // Southwest
    { dx: -1, dy: 0 },   // West
    { dx: -1, dy: -1 }   // Northwest
  ]

  const damagePerTile = totalDamage / surroundingOffsets.length
  const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

  surroundingOffsets.forEach(({ dx, dy }) => {
    const targetX = unitTileX + dx
    const targetY = unitTileY + dy
    applyMineDamageToTile(targetX, targetY, damagePerTile, units, buildings)
  })

  // Create explosion effects
  for (let i = 0; i < Math.min(unit.remainingMines, 5); i++) {
    const offset = surroundingOffsets[i % surroundingOffsets.length]
    const explosionX = (unitTileX + offset.dx) * TILE_SIZE + TILE_SIZE / 2
    const explosionY = (unitTileY + offset.dy) * TILE_SIZE + TILE_SIZE / 2

    gameState.explosions.push({
      x: explosionX,
      y: explosionY,
      maxRadius: TILE_SIZE * 0.8,
      startTime: now + i * 50,
      duration: 300
    })
  }
}

export function isFriendlyMineBlocking(tileX, tileY, owner) {
  if (!owner) return false
  const mine = getMineAtTile(tileX, tileY)
  return Boolean(mine && mine.active && mine.owner === owner)
}

export function rebuildMineLookup() {
  mineLookup.clear()
  if (Array.isArray(gameState.mines)) {
    gameState.mines.forEach(mine => {
      if (Number.isFinite(mine.tileX) && Number.isFinite(mine.tileY)) {
        registerMine(mine)
      }
    })
  }
}
