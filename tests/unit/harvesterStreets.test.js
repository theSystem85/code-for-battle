import { describe, it, expect, vi } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
vi.mock('../../src/buildings.js', () => ({
  buildingData: { street: { cost: 10 } },
  createBuilding: (type, x, y) => ({ type, x, y }),
  placeBuilding: (building, grid) => { grid[building.y][building.x].type = 'street' }
}))
vi.mock('../../src/validation/buildingPlacement.js', () => ({ isDecorativeBuildBlocker: () => false }))
import { updateHarvesterStreets } from '../../src/ai/harvesterStreets.js'

function setup() {
  const grid = [Array.from({ length: 5 }, () => ({ type: 'land' }))]
  grid[0][0].type = 'street'
  const factory = { owner: 'player2', budget: 100 }
  const state = { buildings: [] }
  const unit = { x: 0, y: 0 }
  let now = 0
  const visit = x => {
    unit.x = x * TILE_SIZE
    updateHarvesterStreets(factory, [unit], grid, state, [], now, undefined)
    now += 1000
  }
  return { grid, factory, state, visit }
}

describe('AI harvester streets', () => {
  it('[U07159] paves repeated off-road traffic, charges its owner and extends the road', () => {
    const { grid, factory, state, visit } = setup()
    visit(0)
    visit(1)
    for (let i = 0; i < 5; i++) visit(1)
    expect(state.buildings).toHaveLength(0)
    visit(0)
    visit(1)
    expect(state.buildings).toHaveLength(0)
    visit(0)
    visit(1)
    expect(grid[0][1].type).toBe('street')
    expect(state.buildings[0].owner).toBe('player2')
    expect(factory.budget).toBe(90)
    for (let i = 0; i < 3; i++) { visit(1); visit(2) }
    expect(grid[0][2].type).toBe('street')
  })

  it.each(['ore', 'seedCrystal', 'building', 'noBuild'])('[U07160] preserves tiles blocked by %s', flag => {
    const { grid, state, visit } = setup()
    grid[0][1][flag] = true
    for (let i = 0; i < 5; i++) { visit(0); visit(1) }
    expect(state.buildings).toHaveLength(0)
  })

  it('[U07161] requires a connected street and sufficient funds', () => {
    const { grid, factory, state, visit } = setup()
    for (let i = 0; i < 4; i++) { visit(3); visit(4) }
    expect(state.buildings).toHaveLength(0)
    factory.budget = 0
    for (let i = 0; i < 4; i++) { visit(0); visit(1) }
    expect(grid[0][1].type).toBe('land')
    factory.budget = 10
    visit(0)
    expect(grid[0][1].type).toBe('street')
    expect(factory.budget).toBe(0)
  })
})
