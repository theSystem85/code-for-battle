import { getTileDensity } from './harvesterEligibility.js'

export const HARVESTER_BASE_CARGO_VALUE = 1000

export function getRemainingOreValue(tile) {
  if (!tile?.ore || tile.seedCrystal) return 0
  const level = getTileDensity(tile)
  // Each harvest pays the current level and then removes one level.
  return HARVESTER_BASE_CARGO_VALUE * level * (level + 1) / 2
}

const ORE_NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

export function getConnectedOreValue(mapGrid, seedX, seedY) {
  if (!mapGrid[seedY]?.[seedX]?.seedCrystal) return 0

  const width = mapGrid[0].length
  const start = seedY * width + seedX
  const visited = new Set([start])
  const queue = [start]
  let value = 0
  for (let index = 0; index < queue.length; index++) {
    const offset = queue[index]
    const x = offset % width
    const y = Math.floor(offset / width)
    value += getRemainingOreValue(mapGrid[y][x])
    for (const [dx, dy] of ORE_NEIGHBORS) {
      const nx = x + dx
      if (nx < 0 || nx >= width) continue
      const ny = y + dy
      const tile = mapGrid[ny]?.[nx]
      const neighbor = ny * width + nx
      if ((!tile?.ore && !tile?.seedCrystal) || visited.has(neighbor)) continue
      visited.add(neighbor)
      queue.push(neighbor)
    }
  }
  return value
}
