import { TILE_SIZE } from '../config.js'
import { getNavalHullDimensions, isWaterPassableTile } from '../utils/navalUtils.js'

const hullOffsets = new Map()

// Reserve the full turning circle, plus room for the continuous route between
// sampled tile centers. This is planning work, never a per-frame hull scan.
export function createNavalClearanceCheck(mapGrid, type, start = null) {
  const radius = getNavalHullDimensions(type).length / (2 * TILE_SIZE) + 0.75
  let offsets = hullOffsets.get(radius)
  if (!offsets) {
    offsets = []
    const reach = Math.ceil(radius + 0.5)
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const distance = Math.hypot(Math.max(0, Math.abs(dx) - 0.5), Math.max(0, Math.abs(dy) - 0.5))
        if (distance < radius) offsets.push({ dx, dy, distance })
      }
    }
    offsets.sort((a, b) => a.distance - b.distance)
    hullOffsets.set(radius, offsets)
  }
  const distances = new Map()
  const width = mapGrid[0].length
  function clearance(x, y) {
    const key = y * width + x
    if (distances.has(key)) return distances.get(key)
    let nearest = radius
    for (const offset of offsets) {
      if (!isWaterPassableTile(mapGrid, x + offset.dx, y + offset.dy)) {
        nearest = offset.distance
        break
      }
    }
    distances.set(key, nearest)
    return nearest
  }
  const initial = start ? clearance(start.x, start.y) : radius
  const isClear = (x, y) => {
    if (!isWaterPassableTile(mapGrid, x, y)) return false
    // Saved/spawned ships may already be too close to shore. Let them leave
    // that pocket with steadily increasing clearance instead of trapping them.
    const required = start
      ? Math.min(radius, initial + Math.hypot(x - start.x, y - start.y) * 0.5)
      : radius
    return clearance(x, y) + 1e-9 >= required
  }
  // The escape allowance is for departure only. Arrival must always leave
  // enough room for the next turn, even when the requested move is very short.
  isClear.isSafeDestination = (x, y) => isWaterPassableTile(mapGrid, x, y) && clearance(x, y) + 1e-9 >= radius
  return isClear
}
