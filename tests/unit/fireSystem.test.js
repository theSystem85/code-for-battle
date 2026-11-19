import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TILE_SIZE, WIND_DIRECTION, setFireSpreadProbability, setFireDamagePerSecond } from '../../src/config.js'
vi.mock('../../src/game/cityBuildings.js', () => ({ getCityAtWorld: () => null, applyCityDamage: vi.fn() }))
import { igniteTile, igniteApacheImpact, igniteFromProjectile, restoreFires, updateFireSystem } from '../../src/game/fireSystem.js'
import { migrations } from '../../src/gameStateMigrations.js'
import { productionUnlockRules } from '../../src/production/techTree.js'

function world() {
  const grid = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ type: 'land' })))
  const state = { buildings: [], simulationTime: 0, humanPlayer: 'player1' }
  return { grid, state }
}
function building(grid, state, x, y, type = 'vehicleFactory') {
  const entity = { id: `${x}-${y}`, x, y, width: 1, height: 1, owner: 'player1', health: 300, maxHealth: 300, type }
  grid[y][x].building = entity
  state.buildings.push(entity)
  return entity
}
function engine(x, y, water = 1000) {
  return { id: 'engine', x: x * TILE_SIZE, y: y * TILE_SIZE, type: 'fireEngine', owner: 'player1', health: 60, water, maxWater: 1000 }
}
beforeEach(() => { setFireSpreadProbability(0.2); setFireDamagePerSecond(2) })
describe('Fire simulation', () => {
  it('[U07162] carries embers across a one-tile gap only downwind', () => {
    const { grid, state } = world()
    building(grid, state, 4, 4)
    building(grid, state, 6, 4)
    building(grid, state, 2, 4)
    const previousX = WIND_DIRECTION.x, previousY = WIND_DIRECTION.y
    WIND_DIRECTION.x = 1; WIND_DIRECTION.y = 0
    try {
      igniteTile(state, grid, 4, 4)
      updateFireSystem([], state, grid, 5000, null, () => 0)
      expect(grid[4][6].fire).toBeDefined()
      expect(grid[4][2].fire).toBeUndefined()
      expect(grid[4][5].fire).toBeUndefined()
    } finally { WIND_DIRECTION.x = previousX; WIND_DIRECTION.y = previousY }
  })

  it('[U07163] keeps terrain and building references intact and rejects duplicate ignitions', () => {
    const { grid, state } = world()
    const house = building(grid, state, 4, 4)
    expect(igniteTile(state, grid, 4, 4)).toBe(true)
    expect(igniteTile(state, grid, 4, 4)).toBe(false)
    expect(grid[4][4]).toMatchObject({ type: 'land', building: house, tags: ['fire'] })
    expect(igniteTile(state, grid, 0, 0)).toBe(false)
  })
  it('[U07164] deals per-tile configurable damage in simulation seconds', () => {
    const { grid, state } = world()
    const house = building(grid, state, 4, 4)
    igniteTile(state, grid, 4, 4)
    setFireDamagePerSecond(7)
    updateFireSystem([], state, grid, 1000)
    expect(house.health).toBe(293)
  })
  it('[U07165] waits five seconds to spread and prevents instant cascade', () => {
    const { grid, state } = world()
    for (let x = 4; x <= 6; x++) grid[4][x].type = 'woods'
    igniteTile(state, grid, 4, 4)
    updateFireSystem([], state, grid, 4999, null, () => 0)
    expect(state.fires).toHaveLength(1)
    updateFireSystem([], state, grid, 1, null, () => 0)
    expect(state.fires).toHaveLength(2)
    expect(grid[4][6].fire).toBeUndefined()
  })
  it('[U07166] drains water, blocks spread while spraying, and extinguishes the tile', () => {
    const { grid, state } = world()
    building(grid, state, 4, 4)
    grid[4][5].type = 'woods'
    igniteTile(state, grid, 4, 4)
    const truck = engine(3, 4)
    updateFireSystem([truck], state, grid, 500, null, () => 0)
    expect(truck.water).toBe(980)
    expect(state.fires).toHaveLength(0)
    expect(grid[4][4].tags).not.toContain('fire')
  })
  it('[U07167] resumes spread after a partially extinguished fire is abandoned', () => {
    const { grid, state } = world()
    building(grid, state, 4, 4)
    grid[4][5].type = 'woods'
    igniteTile(state, grid, 4, 4)
    updateFireSystem([engine(3, 4)], state, grid, 250, null, () => 0)
    updateFireSystem([], state, grid, 5000, null, () => 0)
    expect(grid[4][5].fire).toBeDefined()
  })
  it('[U07168] never spends water it does not have', () => {
    const { grid, state } = world()
    building(grid, state, 4, 4)
    igniteTile(state, grid, 4, 4)
    const truck = engine(3, 4, 10)
    updateFireSystem([truck], state, grid, 1000)
    expect(truck.water).toBe(0)
    expect(state.fires[0].suppression).toBe(0.25)
  })
  it('[U07169] refills only at a friendly assigned station and assigns no more than four engines', () => {
    const { grid, state } = world()
    const station = building(grid, state, 4, 4, 'fireDepartment')
    const trucks = Array.from({ length: 5 }, (_, id) => ({ ...engine(3, 4, 0), id }))
    updateFireSystem(trucks, state, grid, 1000)
    expect(trucks.filter(u => u.fireHomeId === station.id)).toHaveLength(4)
    expect(trucks[0].water).toBe(200)
    expect(trucks[4].water).toBe(0)
    station.health = 0
    updateFireSystem(trucks, state, grid, 1000)
    expect(trucks.every(u => !u.fireHomeId)).toBe(true)
  })
  it('[U07170] makes damaged buildings more likely to ignite from eligible weapons', () => {
    const { grid, state } = world()
    const house = building(grid, state, 4, 4)
    const bullet = { originType: 'tank_v1', x: 4 * TILE_SIZE, y: 4 * TILE_SIZE }
    expect(igniteFromProjectile(state, grid, house, bullet, () => 0.3)).toBe(false)
    house.health = 20
    expect(igniteFromProjectile(state, grid, house, bullet, () => 0.3)).toBe(true)
  })
  it('[U07171] round trips fire timers and overlay tags without retaining old fires', () => {
    const { grid, state } = world()
    grid[4][4].type = 'woods'
    igniteTile(state, grid, 4, 4)
    updateFireSystem([], state, grid, 2000)
    const records = JSON.parse(JSON.stringify(state.fires))
    restoreFires(state, grid, records)
    expect(grid[4][4].fire).toBe(state.fires[0])
    expect(state.fires[0].age).toBe(2)
    restoreFires(state, grid, [])
    expect(grid[4][4].fire).toBeUndefined()
    expect(grid[4][4].tags).not.toContain('fire')
  })
  it('[U07172] migrates old saves without mutation and wires the workshop tech prerequisite', () => {
    const original = { gameState: {}, units: [{ type: 'fireEngine' }] }
    const result = migrations[7](original)
    expect(result.units[0].water).toBe(1000)
    expect(original.units[0].water).toBeUndefined()
    expect(productionUnlockRules).toContainEqual({ requires: ['vehicleWorkshop'], buildings: ['fireDepartment'] })
  })
})

it('[U07178] scales damage, suppression time and spread across all five severities', () => {
  for (let severity = 1; severity <= 5; severity++) {
    const { grid, state } = world()
    const house = building(grid, state, 4, 4)
    grid[4][5].type = 'woods'
    igniteTile(state, grid, 4, 4)
    state.fires[0].age = (severity - 1) * 20
    updateFireSystem([], state, grid, 1000)
    expect(house.health).toBe(300 - severity * 2)
    const truck = engine(3, 4)
    updateFireSystem([truck], state, grid, 500)
    expect(Boolean(grid[4][4].fire)).toBe(severity > 1)
    if (severity > 1) {
      updateFireSystem([truck], state, grid, (severity - 1) * 500)
      expect(grid[4][4].fire).toBeUndefined()
    }
  }
})
it('[U07179] ignites combustible terrain at Apache ground impacts and rejects water', () => {
  const { grid, state } = world()
  grid[4][4].type = 'woods'
  const bullet = { x: 4.5 * TILE_SIZE, y: 4.5 * TILE_SIZE, originType: 'apacheRocket' }
  expect(igniteApacheImpact(state, grid, bullet, () => 0)).toBe(true)
  grid[5][4].type = 'water'
  expect(igniteApacheImpact(state, grid, { ...bullet, y: 5.5 * TILE_SIZE }, () => 0)).toBe(false)
})
it('[U07180] increases spread probability with severity and keeps saved age', () => {
  const { grid, state } = world()
  grid[4][4].type = 'woods'
  grid[4][5].type = 'woods'
  restoreFires(state, grid, [{ x: 4, y: 4, age: 80 }])
  updateFireSystem([], state, grid, 5000, null, () => 0.8)
  expect(grid[4][5].fire).toBeDefined()
  expect(state.fires[0].age).toBe(85)
})
