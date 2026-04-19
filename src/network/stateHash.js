/**
 * State Hash System for Deterministic Lockstep
 *
 * Computes deterministic hashes of game state for sync verification.
 * Uses a fast, order-independent hashing approach for arrays/collections.
 */

// Precision for floating point values (quantize to avoid drift)
const POSITION_PRECISION = 100 // 0.01 pixel precision
const DIRECTION_PRECISION = 1000 // 0.001 radian precision

/**
 * Quantize a floating point number to fixed precision
 * @param {number} value - Value to quantize
 * @param {number} precision - Multiplier for precision
 * @returns {number} Quantized integer value
 */
function quantize(value, precision) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0
  }
  return Math.round(value * precision)
}

/**
 * Simple hash combine function (FNV-1a inspired)
 * @param {number} hash - Current hash value
 * @param {number} value - Value to incorporate
 * @returns {number}
 */
function hashCombine(hash, value) {
  const PRIME = 0x01000193
  hash ^= value & 0xFFFFFFFF
  hash = Math.imul(hash, PRIME) >>> 0
  return hash
}

/**
 * Hash a string
 * @param {string} str - String to hash
 * @returns {number}
 */
function hashString(str) {
  if (!str) return 0
  let hash = 2166136261 // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash = hashCombine(hash, str.charCodeAt(i))
  }
  return hash >>> 0
}

/**
 * Hash a unit's deterministic state
 * @param {Object} unit - Unit object
 * @returns {number}
 */
function hashUnit(unit) {
  let hash = 2166136261

  // Hash stable identifier
  hash = hashCombine(hash, hashString(unit.id))
  hash = hashCombine(hash, hashString(unit.type))
  hash = hashCombine(hash, hashString(unit.owner))

  // Hash position (quantized)
  hash = hashCombine(hash, quantize(unit.x, POSITION_PRECISION))
  hash = hashCombine(hash, quantize(unit.y, POSITION_PRECISION))
  hash = hashCombine(hash, quantize(unit.tileX, 1))
  hash = hashCombine(hash, quantize(unit.tileY, 1))

  // Hash health
  hash = hashCombine(hash, quantize(unit.health, 1))
  hash = hashCombine(hash, quantize(unit.maxHealth, 1))

  // Hash direction (quantized)
  hash = hashCombine(hash, quantize(unit.direction, DIRECTION_PRECISION))
  if (unit.turretDirection !== undefined) {
    hash = hashCombine(hash, quantize(unit.turretDirection, DIRECTION_PRECISION))
  }

  // Hash resources
  if (unit.gas !== undefined) {
    hash = hashCombine(hash, quantize(unit.gas, 1))
  }
  if (unit.ammunition !== undefined) {
    hash = hashCombine(hash, quantize(unit.ammunition, 1))
  }
  if (unit.oreCarried !== undefined) {
    hash = hashCombine(hash, quantize(unit.oreCarried, 1))
  }

  // Hash movement state
  if (unit.path) {
    hash = hashCombine(hash, unit.path.length)
  }
  if (unit.moveTarget) {
    hash = hashCombine(hash, quantize(unit.moveTarget.x, 1))
    hash = hashCombine(hash, quantize(unit.moveTarget.y, 1))
  }

  // Hash target
  if (unit.target && unit.target.id) {
    hash = hashCombine(hash, hashString(unit.target.id))
  }

  // Hash level/experience
  hash = hashCombine(hash, quantize(unit.level || 0, 1))
  hash = hashCombine(hash, quantize(unit.bountyCounter || 0, 1))

  return hash >>> 0
}

/**
 * Hash a building's deterministic state
 * @param {Object} building - Building object
 * @returns {number}
 */
function hashBuilding(building) {
  let hash = 2166136261

  // Hash stable identifier
  hash = hashCombine(hash, hashString(building.id))
  hash = hashCombine(hash, hashString(building.type))
  hash = hashCombine(hash, hashString(building.owner))

  // Hash position
  hash = hashCombine(hash, quantize(building.x, 1))
  hash = hashCombine(hash, quantize(building.y, 1))

  // Hash health
  hash = hashCombine(hash, quantize(building.health, 1))
  hash = hashCombine(hash, quantize(building.maxHealth, 1))

  // Hash construction state
  hash = hashCombine(hash, building.constructionFinished ? 1 : 0)
  if (building.constructionProgress !== undefined) {
    hash = hashCombine(hash, quantize(building.constructionProgress, 100))
  }

  // Hash sell state
  hash = hashCombine(hash, building.isBeingSold ? 1 : 0)

  // Hash turret direction if applicable
  if (building.turretDirection !== undefined) {
    hash = hashCombine(hash, quantize(building.turretDirection, DIRECTION_PRECISION))
  }

  // Hash ammunition
  if (building.ammo !== undefined) {
    hash = hashCombine(hash, quantize(building.ammo, 1))
  }

  return hash >>> 0
}

/**
 * Hash a bullet's deterministic state
 * @param {Object} bullet - Bullet object
 * @returns {number}
 */
function hashBullet(bullet) {
  let hash = 2166136261

  hash = hashCombine(hash, hashString(bullet.id?.toString() || ''))
  hash = hashCombine(hash, hashString(bullet.type || ''))
  hash = hashCombine(hash, hashString(bullet.owner || ''))

  // Hash position (quantized)
  hash = hashCombine(hash, quantize(bullet.x, POSITION_PRECISION))
  hash = hashCombine(hash, quantize(bullet.y, POSITION_PRECISION))

  // Hash target
  hash = hashCombine(hash, quantize(bullet.targetX, POSITION_PRECISION))
  hash = hashCombine(hash, quantize(bullet.targetY, POSITION_PRECISION))

  // Hash damage
  hash = hashCombine(hash, quantize(bullet.damage, 1))

  return hash >>> 0
}

/**
 * Hash a mine's deterministic state
 * @param {Object} mine - Mine object
 * @returns {number}
 */
function hashMine(mine) {
  let hash = 2166136261

  hash = hashCombine(hash, hashString(mine.id?.toString() || ''))
  hash = hashCombine(hash, hashString(mine.owner || ''))
  hash = hashCombine(hash, quantize(mine.x, 1))
  hash = hashCombine(hash, quantize(mine.y, 1))
  hash = hashCombine(hash, quantize(mine.health || 0, 1))
  hash = hashCombine(hash, mine.armed ? 1 : 0)

  return hash >>> 0
}

/**
 * Hash an array of objects using order-independent XOR
 * This ensures the hash is the same regardless of array order
 * @param {Array} array - Array of objects
 * @param {function} hashFn - Function to hash each object
 * @returns {number}
 */
function hashArrayUnordered(array, hashFn) {
  if (!array || array.length === 0) return 0

  // XOR all individual hashes (order-independent)
  let result = 0
  for (const item of array) {
    result ^= hashFn(item)
  }

  // Include length in hash
  result = hashCombine(result, array.length)

  return result >>> 0
}

/**
 * Hash an array of objects in order (for ordered collections)
 * @param {Array} array - Array of objects
 * @param {function} hashFn - Function to hash each object
 * @returns {number}
 */
export function hashArrayOrdered(array, hashFn) {
  if (!array || array.length === 0) return 0

  let hash = 2166136261
  for (const item of array) {
    hash = hashCombine(hash, hashFn(item))
  }
  hash = hashCombine(hash, array.length)

  return hash >>> 0
}

/**
 * Hash the map grid state (just ore positions and types)
 * @param {Array} mapGrid - 2D map grid
 * @returns {number}
 */
export function hashMapGrid(mapGrid) {
  if (!mapGrid || mapGrid.length === 0) return 0

  let hash = 2166136261

  // Only hash ore positions to reduce computation
  // Terrain is immutable after generation
  for (let y = 0; y < mapGrid.length; y++) {
    for (let x = 0; x < mapGrid[y].length; x++) {
      const tile = mapGrid[y][x]
      if (tile.ore) {
        hash = hashCombine(hash, x)
        hash = hashCombine(hash, y)
        hash = hashCombine(hash, tile.seedCrystal ? 1 : 0)
        hash = hashCombine(hash, Number.isFinite(tile.crystalDensity) ? tile.crystalDensity : 1)
        hash = hashCombine(hash, tile.crystalColor === 'red' ? 2 : 1)
      }
    }
  }

  return hash >>> 0
}

/**
 * Compute a deterministic hash of the entire game state
 * @param {Object} gameState - Game state object
 * @param {number} tick - Current simulation tick
 * @returns {string} Hex string hash
 */
export function computeStateHash(gameState, tick) {
  let hash = 2166136261

  // Include tick number
  hash = hashCombine(hash, tick)

  // Hash units (unordered - units can be in any order in array)
  const unitsHash = hashArrayUnordered(gameState.units || [], hashUnit)
  hash = hashCombine(hash, unitsHash)

  // Hash buildings (unordered)
  const buildingsHash = hashArrayUnordered(gameState.buildings || [], hashBuilding)
  hash = hashCombine(hash, buildingsHash)

  // Hash bullets (unordered)
  const bulletsHash = hashArrayUnordered(gameState.bullets || [], hashBullet)
  hash = hashCombine(hash, bulletsHash)

  // Hash mines (unordered)
  const minesHash = hashArrayUnordered(gameState.mines || [], hashMine)
  hash = hashCombine(hash, minesHash)

  // Hash party states (money, power)
  if (gameState.partyStates) {
    for (const party of gameState.partyStates) {
      hash = hashCombine(hash, hashString(party.partyId))
      hash = hashCombine(hash, quantize(party.money || 0, 1))
    }
  }

  // Hash global money
  hash = hashCombine(hash, quantize(gameState.money || 0, 1))

  // Hash map ore state (expensive, do periodically)
  // const mapHash = hashMapGrid(gameState.mapGrid)
  // hash = hashCombine(hash, mapHash)

  // Convert to hex string for easy comparison
  const finalHash = hash >>> 0
  return finalHash.toString(16).padStart(8, '0')
}

/**
 * Compare two state hashes
 * @param {string} hash1 - First hash
 * @param {string} hash2 - Second hash
 * @returns {boolean} True if hashes match
 */
export function compareHashes(hash1, hash2) {
  return hash1 === hash2
}

/**
 * Compute a quick hash for a subset of state (for more frequent checks)
 * @param {Object} gameState - Game state
 * @param {number} tick - Current tick
 * @returns {string} Quick hash
 */
export function computeQuickHash(gameState, tick) {
  let hash = 2166136261

  hash = hashCombine(hash, tick)

  // Just count entities and total health
  const units = gameState.units || []
  const buildings = gameState.buildings || []

  hash = hashCombine(hash, units.length)
  hash = hashCombine(hash, buildings.length)

  let totalUnitHealth = 0
  for (const unit of units) {
    totalUnitHealth += unit.health || 0
  }
  hash = hashCombine(hash, quantize(totalUnitHealth, 1))

  let totalBuildingHealth = 0
  for (const building of buildings) {
    totalBuildingHealth += building.health || 0
  }
  hash = hashCombine(hash, quantize(totalBuildingHealth, 1))

  hash = hashCombine(hash, quantize(gameState.money || 0, 1))

  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Create a detailed hash report for debugging desyncs
 * @param {Object} gameState - Game state
 * @param {number} tick - Current tick
 * @returns {Object} Detailed hash breakdown
 */
export function createHashReport(gameState, tick) {
  return {
    tick,
    unitCount: (gameState.units || []).length,
    buildingCount: (gameState.buildings || []).length,
    bulletCount: (gameState.bullets || []).length,
    mineCount: (gameState.mines || []).length,
    money: gameState.money,
    unitsHash: hashArrayUnordered(gameState.units || [], hashUnit).toString(16),
    buildingsHash: hashArrayUnordered(gameState.buildings || [], hashBuilding).toString(16),
    bulletsHash: hashArrayUnordered(gameState.bullets || [], hashBullet).toString(16),
    minesHash: hashArrayUnordered(gameState.mines || [], hashMine).toString(16),
    fullHash: computeStateHash(gameState, tick)
  }
}
