// mineSweeperBehavior.js - Mine Sweeper unit behaviors
import { UNIT_PROPERTIES, TILE_SIZE } from '../config.js'

/**
 * Update Mine Sweeper behaviors - sweeping mode toggle, speed modulation, dust emission
 * @param {Array} units - All game units
 * @param {Object} gameState - Game state object
 * @param {number} now - Current timestamp
 */
export function updateMineSweeperBehavior(units, gameState, now) {
  units.forEach(unit => {
    if (unit.type !== 'mineSweeper') return

    // Initialize speed properties if not set
    if (!unit.normalSpeed) {
      unit.normalSpeed = UNIT_PROPERTIES.mineSweeper.speed
    }
    if (!unit.sweepingSpeed) {
      unit.sweepingSpeed = UNIT_PROPERTIES.mineSweeper.sweepingSpeed
    }

    // Determine if there is an active sweep command
    const isActiveSweep = unit.currentCommand && unit.currentCommand.type === 'sweepArea'

    // Update sweeping flag and speed only when actually sweeping
    if (isActiveSweep && !unit.sweeping) {
      unit.sweeping = true
      unit.speed = unit.sweepingSpeed
    } else if (!isActiveSweep && unit.sweeping) {
      unit.sweeping = false
      unit.speed = unit.normalSpeed
      unit.lastDustTime = 0
    }

    // Generate dust if sweeping and moving
    if (unit.sweeping && (unit.velocityX !== 0 || unit.velocityY !== 0)) {
      // Limit dust emission rate (e.g., every 100ms)
      if (!unit.lastDustTime || now - unit.lastDustTime > 100) {
        const dust = generateSweepDust(unit, now)
        if (dust) {
          if (!gameState.dustParticles) gameState.dustParticles = []
          gameState.dustParticles.push(dust)
          unit.lastDustTime = now
        }
      }
    }
  })
}

/**
 * Activate sweeping mode for Mine Sweeper
 * @param {object} unit - Mine Sweeper unit
 */
export function activateSweepingMode(unit) {
  if (unit.type !== 'mineSweeper') return

  if (!unit.normalSpeed) {
    unit.normalSpeed = UNIT_PROPERTIES.mineSweeper.speed
  }
  if (!unit.sweepingSpeed) {
    unit.sweepingSpeed = UNIT_PROPERTIES.mineSweeper.sweepingSpeed
  }

  unit.sweeping = true
  unit.speed = unit.sweepingSpeed || UNIT_PROPERTIES.mineSweeper.sweepingSpeed
}

/**
 * Deactivate sweeping mode for Mine Sweeper
 * @param {object} unit - Mine Sweeper unit
 */
export function deactivateSweepingMode(unit) {
  if (unit.type !== 'mineSweeper') return

  if (!unit.normalSpeed) {
    unit.normalSpeed = UNIT_PROPERTIES.mineSweeper.speed
  }
  if (!unit.sweepingSpeed) {
    unit.sweepingSpeed = UNIT_PROPERTIES.mineSweeper.sweepingSpeed
  }

  unit.sweeping = false
  unit.speed = unit.normalSpeed || UNIT_PROPERTIES.mineSweeper.speed
}

/**
 * Calculate zig-zag sweep path for rectangular area
 * @param {object} area - Area bounds {startX, startY, endX, endY} in tile coordinates
 * @returns {Array} Array of tile coordinates for serpentine path
 */
export function calculateZigZagSweepPath(area, orientation = { horizontal: 'left', vertical: 'top' }) {
  if (!area) return []

  const minX = Math.min(area.startX, area.endX)
  const maxX = Math.max(area.startX, area.endX)
  const minY = Math.min(area.startY, area.endY)
  const maxY = Math.max(area.startY, area.endY)

  const path = []
  const horizontalDirection = orientation.horizontal === 'right' ? -1 : 1
  const verticalFromBottom = orientation.vertical === 'bottom'
  const rowStart = verticalFromBottom ? maxY : minY
  const rowEnd = verticalFromBottom ? minY : maxY
  const rowStep = verticalFromBottom ? -1 : 1
  const rowCondition = verticalFromBottom ? (y) => y >= rowEnd : (y) => y <= rowEnd

  let direction = horizontalDirection

  for (let y = rowStart; rowCondition(y); y += rowStep) {
    if (direction === 1) {
      for (let x = minX; x <= maxX; x++) {
        path.push({ x, y })
      }
    } else {
      for (let x = maxX; x >= minX; x--) {
        path.push({ x, y })
      }
    }
    direction *= -1
  }

  return path
}

/**
 * Calculate sweep path for freeform painted area
 * @param {Set} paintedTiles - Set of painted tile coordinates as "x,y" strings
 * @returns {Array} Array of tile coordinates for sweep path
 */
export function calculateFreeformSweepPath(paintedTiles) {
  if (!paintedTiles || paintedTiles.size === 0) return []

  // Convert Set to array of {x, y} objects
  const tiles = []
  paintedTiles.forEach(key => {
    const [x, y] = key.split(',').map(Number)
    tiles.push({ x, y })
  })

  // Sort tiles to create an efficient path
  // Use a simple approach: sort by Y then X for now
  tiles.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y
    return a.x - b.x
  })

  return tiles
}

/**
 * Generate dust particles in front of Mine Sweeper
 * @param {object} unit - Mine Sweeper unit
 * @param {number} now - Current timestamp
 * @returns {object} Dust particle data
 */
export function generateSweepDust(unit, now) {
  if (!unit.sweeping) return null

  const dustOffsetDistance = TILE_SIZE * 0.8

  // Calculate position in front of unit based on direction
  const dustX = unit.x + TILE_SIZE / 2 + Math.cos(unit.direction) * dustOffsetDistance
  const dustY = unit.y + TILE_SIZE / 2 + Math.sin(unit.direction) * dustOffsetDistance

  return {
    x: dustX,
    y: dustY,
    startTime: now,
    lifetime: SWEEP_DUST_LIFETIME_MS,
    color: '#D2B48C', // Tan/sandy color
    size: SWEEP_DUST_SIZE,
    alpha: 1,
    velocity: {
      x: Math.cos(unit.direction) * 0.5,
      y: Math.sin(unit.direction) * 0.5
    }
  }
}

export const SWEEP_DUST_LIFETIME_MS = 500
export const SWEEP_DUST_SIZE = 8

/**
 * Sweep-dust radius grows from its base size over its lifetime.
 * Age is clamped to the lifetime so a clock skew (simulation time vs
 * performance.now()) cannot feed canvas.arc a negative radius.
 * @param {object} dust
 * @param {number} now
 * @returns {number} Positive radius, or 0 when the particle should not be drawn
 */
export function computeSweepDustRadius(dust, now) {
  const baseSize = Number.isFinite(dust?.size) ? dust.size : 0
  const lifetime = Number.isFinite(dust?.lifetime) ? dust.lifetime : 0
  if (!(baseSize > 0) || !(lifetime > 0) || !Number.isFinite(dust?.startTime) || !Number.isFinite(now)) {
    return 0
  }

  const age = now - dust.startTime
  if (age >= lifetime) return 0

  const progress = Math.min(1, Math.max(0, age / lifetime))
  return baseSize * (1 + progress * 0.5)
}

export function getDustEffectNow(state) {
  return Number.isFinite(state?.simulationTime) ? state.simulationTime : performance.now()
}
