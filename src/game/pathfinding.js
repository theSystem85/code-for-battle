// Path Finding Module - Handles unit pathfinding and formation management
import { PATH_CALC_INTERVAL, PATHFINDING_THRESHOLD, TILE_SIZE, MOVE_TARGET_REACHED_THRESHOLD, PATH_CACHE_TTL, MAX_PATHS_PER_CYCLE } from '../config.js'
import { findPath } from '../units.js'
import { logPerformance } from '../performanceUtils.js'

// Simple in-memory cache for sharing A* paths between units
const pathCache = new Map()

/**
 * Retrieve a cached path or reuse a path to the same end coordinate
 * from another unit if available. If a cached path doesn't exist,
 * calculate a new one and store it.
 */
function getCachedPath(start, end, mapGrid, occupancyMap, options = null) {
  const contextOptions = options || {}
  const derivedOwner = contextOptions.unitOwner ?? start.owner ?? start.ownerId ?? start.playerId ?? null
  const ownerKey = derivedOwner || 'any'
  const ignoreKey = contextOptions.ignoreFriendlyMines ? 'ignoreFriendly' : 'respectFriendly'
  const endKey = `${end.x},${end.y}-${occupancyMap ? 1 : 0}-${ownerKey}-${ignoreKey}`
  const now = performance.now()
  let entries = pathCache.get(endKey)

  // Remove stale entries
  if (entries) {
    entries = entries.filter(e => now - e.time < PATH_CACHE_TTL)
    if (entries.length > 0) {
      pathCache.set(endKey, entries)
    } else {
      pathCache.delete(endKey)
    }
  }

  if (entries) {
    for (const entry of entries) {
      const idx = entry.path.findIndex(p => p.x === start.x && p.y === start.y)
      if (idx !== -1) {
        return entry.path.slice(idx)
      }
    }
  }

  const pathOptions = { ...contextOptions }
  if (!pathOptions.unitOwner && derivedOwner) {
    pathOptions.unitOwner = derivedOwner
  }
  const path = findPath(start, end, mapGrid, occupancyMap, undefined, pathOptions)
  if (path && path.length > 0) {
    if (!entries) {
      entries = []
      pathCache.set(endKey, entries)
    }
    entries.push({ path, time: now })
  }
  return path
}

/**
 * Updates unit pathfinding with formation support and throttling
 * @param {Array} units - Array of unit objects
 * @param {Array} mapGrid - 2D array representing the map
 * @param {Object} occupancyMap - Map of occupied tiles
 * @param {Object} gameState - Game state object
 */
export const updateGlobalPathfinding = logPerformance(_updateGlobalPathfinding, false)
function _updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState) {
  const now = performance.now()

  // IMMEDIATE path calculation for units with moveTarget but no path
  // This ensures remote player units get paths right away without waiting for the interval
  const unitsNeedingImmediatePath = units.filter(u =>
    u.type !== 'f22Raptor' &&
    u.moveTarget &&
    (!u.path || u.path.length === 0) &&
    !u.lastPathCalcTime // Only units that haven't had paths calculated yet
  )

  unitsNeedingImmediatePath.forEach(unit => {
    const targetPos = unit.moveTarget
    const startNode = { x: unit.tileX, y: unit.tileY, owner: unit.owner }
    const cacheOptions = { unitOwner: unit.owner }
    const distance = Math.hypot(targetPos.x - unit.tileX, targetPos.y - unit.tileY)
    const useOccupancyMap = distance <= PATHFINDING_THRESHOLD

    const newPath = useOccupancyMap
      ? getCachedPath(startNode, targetPos, mapGrid, occupancyMap, cacheOptions)
      : getCachedPath(startNode, targetPos, mapGrid, null, cacheOptions)

    if (newPath.length > 1) {
      unit.path = newPath.slice(1)
      unit.lastPathCalcTime = now
      unit.pathComputedWithOccupancy = useOccupancyMap
    }
  })

  if (!gameState.lastGlobalPathCalc || now - gameState.lastGlobalPathCalc > PATH_CALC_INTERVAL) {
    gameState.lastGlobalPathCalc = now

    // Group units by formation to calculate centers before path recalculations
    const formationGroups = {}

    // First pass: identify all formation groups and calculate centers
    units.forEach(unit => {
      if (unit.formationActive && unit.groupNumber) {
        if (!formationGroups[unit.groupNumber]) {
          formationGroups[unit.groupNumber] = {
            units: [],
            centerX: 0,
            centerY: 0
          }
        }
        formationGroups[unit.groupNumber].units.push(unit)
      }
    })

    // Calculate the center position of each formation group
    Object.values(formationGroups).forEach(group => {
      if (group.units.length > 0) {
        group.centerX = group.units.reduce((sum, unit) => sum + unit.x, 0) / group.units.length
        group.centerY = group.units.reduce((sum, unit) => sum + unit.y, 0) / group.units.length
      }
    })

    // Collect units needing path recalculation and sort by priority
    const unitsNeedingPaths = []

    units.forEach(unit => {
      if (unit.type === 'f22Raptor') {
        return
      }

      // SKIP units that have an attack target - they are handled by updateUnitMovement()
      // This prevents duplicate path calculations between the two systems
      if (unit.target && unit.target.health !== undefined && unit.target.health > 0) {
        return // Attack movement is handled in updateUnitMovement()
      }

      // Skip if path was calculated very recently (within this frame or last few frames)
      // This prevents immediate recalculation after updateUnitMovement() sets a path
      const recentPathCalc = unit.lastPathCalcTime && (now - unit.lastPathCalcTime < 100)
      const recentAttackPathCalc = unit.lastAttackPathCalcTime && (now - unit.lastAttackPathCalcTime < 100)
      if (recentPathCalc || recentAttackPathCalc) {
        return
      }

      // Get the target position from moveTarget
      const targetPos = unit.moveTarget
      if (!targetPos) return

      // Calculate distance for priority sorting (closer units get priority)
      const distance = Math.hypot(targetPos.x - unit.tileX, targetPos.y - unit.tileY)

      // Skip if essentially at target already
      if (distance < MOVE_TARGET_REACHED_THRESHOLD) {
        unit.moveTarget = null
        return
      }

      // Determine if the unit entered the close-range zone with a stale
      // long-distance path (computed without the occupancy map). If so,
      // force a recalculation so the new path accounts for dynamic obstacles.
      // Use strict equality (=== false) so units without the flag (legacy/test
      // paths) are not affected.
      const hasStaleNonOccupancyPath = unit.path && unit.path.length > 0 &&
        unit.pathComputedWithOccupancy === false && distance <= PATHFINDING_THRESHOLD

      if (!unit.path || unit.path.length === 0 || hasStaleNonOccupancyPath) {
        // For AI units, respect target change timer
        if (unit.owner !== gameState.humanPlayer && unit.lastTargetChangeTime &&
          now - unit.lastTargetChangeTime < 2000) {
          return // Skip recalculation if target was changed recently
        }

        unitsNeedingPaths.push({ unit, targetPos, distance, isAttackMode: false, formationGroups })
      }
    })

    // Sort by distance (closer units have higher priority) and limit to MAX_PATHS_PER_CYCLE
    unitsNeedingPaths.sort((a, b) => a.distance - b.distance)
    const unitsToProcess = unitsNeedingPaths.slice(0, MAX_PATHS_PER_CYCLE)

    // Process batched path calculations
    unitsToProcess.forEach(({ unit, targetPos, distance, formationGroups }) => {
      // Store move target for future recalculations
      unit.moveTarget = targetPos

      // Apply formation offset if unit is in formation mode
      let adjustedTarget = { ...targetPos }

      // If unit is in formation mode and has formation offset, adjust the target
      if (unit.formationActive && unit.formationOffset && unit.groupNumber) {
        const formationGroup = formationGroups[unit.groupNumber]

        // If this unit is part of a known formation group
        if (formationGroup && formationGroup.units.some(u => u.moveTarget)) {
          // Use the first unit with a moveTarget as the formation reference point
          const referenceUnit = formationGroup.units.find(u => u.moveTarget)
          if (referenceUnit && referenceUnit !== unit) {
            // Apply formation offset to target position
            adjustedTarget = {
              x: Math.floor((targetPos.x * TILE_SIZE + unit.formationOffset.x) / TILE_SIZE),
              y: Math.floor((targetPos.y * TILE_SIZE + unit.formationOffset.y) / TILE_SIZE)
            }
          }
        }
      }

      // Use occupancy map for close range movement to avoid collisions
      const useOccupancyMap = distance <= PATHFINDING_THRESHOLD
      const startNode = { x: unit.tileX, y: unit.tileY, owner: unit.owner }
      const cacheOptions = { unitOwner: unit.owner }
      const newPath = useOccupancyMap
        ? getCachedPath(startNode, adjustedTarget, mapGrid, occupancyMap, cacheOptions)
        : getCachedPath(startNode, adjustedTarget, mapGrid, null, cacheOptions)

      if (newPath.length > 1) {
        unit.path = newPath.slice(1)
        unit.lastPathCalcTime = now
        unit.pathComputedWithOccupancy = useOccupancyMap
      } else if (Math.hypot(unit.tileX - targetPos.x, unit.tileY - targetPos.y) < MOVE_TARGET_REACHED_THRESHOLD) {
        // Clear moveTarget if we've reached destination
        unit.moveTarget = null
      }
    })
  }
}

/**
 * Creates formation offsets for a group of units
 * @param {Array} units - Array of units to arrange in formation
 * @param {number} groupNumber - Formation group identifier
 */
export function createFormationOffsets(units, groupNumber) {
  const unitsPerRow = Math.ceil(Math.sqrt(units.length))
  const spacing = 48 // 1.5 tiles spacing between units

  units.forEach((unit, index) => {
    const row = Math.floor(index / unitsPerRow)
    const col = index % unitsPerRow

    // Center the formation
    const offsetX = (col - (unitsPerRow - 1) / 2) * spacing
    const offsetY = row * spacing

    unit.formationOffset = { x: offsetX, y: offsetY }
    unit.formationActive = true
    unit.groupNumber = groupNumber
  })
}

/**
 * Clears formation data from units
 * @param {Array} units - Array of units to clear formation from
 */
export function clearFormation(units) {
  units.forEach(unit => {
    unit.formationOffset = null
    unit.formationActive = false
    unit.groupNumber = null
  })
}

export { getCachedPath }
