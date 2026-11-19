import { igniteTile } from '../game/fireSystem.js'

export function seedBenchmarkFires(state, grid) {
  for (const building of state.buildings) {
    for (let y = building.y; y < building.y + building.height; y++) {
      for (let x = building.x; x < building.x + building.width; x++) igniteTile(state, grid, x, y)
    }
  }
  // Stagger ignition across the map, leaving fuel for live spread.
  for (let y = 0; y < grid.length; y++) {
    for (let x = y % 3; x < grid[y].length; x += 3) {
      if (!grid[y][x].building) igniteTile(state, grid, x, y)
    }
  }
}
