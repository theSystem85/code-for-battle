// Tile occupancy is one integer so existing increment sites and saves stay numeric.
// Low 16 bits count fixed blockers (buildings, water, rock, seed crystals, impassable tags).
// High bits count movable occupants (units and wrecks). Pathfinding blocks on fixed only.

export const MOVABLE_OCCUPANCY_SHIFT = 16
export const MOVABLE_OCCUPANCY_STEP = 1 << MOVABLE_OCCUPANCY_SHIFT
const FIXED_OCCUPANCY_MASK = MOVABLE_OCCUPANCY_STEP - 1
const MAX_MOVABLE_OCCUPANCY = 0x7fff

function normalizeOccupancy(value) {
  const n = value | 0
  return n > 0 ? n : 0
}

export function fixedOccupancyCount(value) {
  return normalizeOccupancy(value) & FIXED_OCCUPANCY_MASK
}

export function movableOccupancyCount(value) {
  return normalizeOccupancy(value) >>> MOVABLE_OCCUPANCY_SHIFT
}

export function totalOccupancyCount(value) {
  return fixedOccupancyCount(value) + movableOccupancyCount(value)
}

export function hasFixedOccupancy(value) {
  return fixedOccupancyCount(value) > 0
}

export function hasMovableOccupancy(value) {
  return movableOccupancyCount(value) > 0
}

export function addFixedOccupancy(value, amount = 1) {
  const base = normalizeOccupancy(value)
  const fixed = base & FIXED_OCCUPANCY_MASK
  const movable = base >>> MOVABLE_OCCUPANCY_SHIFT
  const nextFixed = Math.max(0, Math.min(FIXED_OCCUPANCY_MASK, fixed + amount))
  return nextFixed | (movable << MOVABLE_OCCUPANCY_SHIFT)
}

export function addMovableOccupancy(value, amount = 1) {
  const base = normalizeOccupancy(value)
  const fixed = base & FIXED_OCCUPANCY_MASK
  const movable = base >>> MOVABLE_OCCUPANCY_SHIFT
  const nextMovable = Math.max(0, Math.min(MAX_MOVABLE_OCCUPANCY, movable + amount))
  return fixed | (nextMovable << MOVABLE_OCCUPANCY_SHIFT)
}
