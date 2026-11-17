import { describe, it, expect, vi } from 'vitest'
import '../setup.js'
import { buildingData } from '../../src/data/buildingData.js'
vi.mock('../../src/gameState.js', () => ({ gameState: {} }))
import { planBaseDefence, nextBaseDefence, relocateBaseDefences } from '../../src/ai/baseDefence.js'

function scenario() {
  const map = Array.from({ length: 70 }, () => Array.from({ length: 80 }, () => ({ type: 'land' })))
  for (let y = 0; y < 70; y++) {
    for (let x = 28; x <= 30; x++) map[y][x].type = 'street'
  }
  const yard = { id: 'enemy', x: 20, y: 25, width: 3, height: 3, health: 100, budget: 100000 }
  const buildings = [
    { type: 'powerPlant', x: 35, y: 30, width: 3, height: 3, owner: 'enemy', health: 100 },
    { type: 'radarStation', x: 21, y: 36, width: 2, height: 2, owner: 'enemy', health: 100 }
  ]
  const factories = [yard, { id: 'player1', x: 28, y: 2, width: 3, height: 3, health: 100 }]
  return { map, yard, buildings, factories }
}

describe('AI base perimeter defence', () => {
  it.each([false, true])('[U07192] constructs the complete perimeter and mixed clusters using normal placement range (transpose: %s)', transpose => {
    const { map: originalMap, buildings, factories } = scenario()
    let map = originalMap
    if (transpose) {
      map = map[0].map((_, x) => map.map(row => row[x]))
      for (const entity of [...buildings, ...factories]) {
        const oldX = entity.x
        entity.x = entity.y
        entity.y = oldX
      }
    }
    const plan = planBaseDefence('enemy', map, buildings, factories)
    const expected = plan.slots.length + plan.walls.length
    let built = 0
    for (; built <= expected; built++) {
      const slot = nextBaseDefence(plan, 'enemy', map, [], buildings, factories, 100000)
      if (!slot) break
      const building = { ...slot, ...buildingData[slot.type], owner: 'enemy', health: 100 }
      buildings.push(building)
      for (let y = slot.y; y < slot.y + building.height; y++) {
        for (let x = slot.x; x < slot.x + building.width; x++) map[y][x].building = building
      }
    }
    expect([...plan.slots, ...plan.walls].filter(slot => !buildings.some(b => b.x === slot.x && b.y === slot.y && b.type === slot.type))).toEqual([])
    expect(built).toBe(expected)
    expect(nextBaseDefence(plan, 'enemy', map, [], buildings, factories, 100000)).toBeNull()
  })

  it('[U07187] encloses every side with connected walls except three-tile road entrances', () => {
    const { map, buildings, factories } = scenario()
    const plan = planBaseDefence('enemy', map, buildings, factories)
    const { left, right, top, bottom } = plan.bounds
    expect(plan.gates).toHaveLength(2)
    expect(plan.gates[0].ny).toBe(-1)
    for (let x = left; x <= right; x++) {
      for (const y of [top, bottom]) {
        expect(plan.walls.some(wall => wall.x === x && wall.y === y)).toBe(x < 28 || x > 30)
      }
    }
    for (let y = top; y <= bottom; y++) {
      for (const x of [left, right]) expect(plan.walls.some(wall => wall.x === x && wall.y === y)).toBe(true)
    }
  })

  it('[U07188] places mixed clusters at road entrances with guns outside and heavy weapons inside', () => {
    const { map, buildings, factories } = scenario()
    const plan = planBaseDefence('enemy', map, buildings, factories)
    expect(plan.slots).toHaveLength(8)
    for (const gate of plan.gates) {
      const cluster = plan.slots.filter(slot => Math.abs(slot.y - gate.y) <= 3)
      expect(cluster.map(slot => slot.type).sort()).toEqual(['artilleryTurret', 'rocketTurret', 'teslaCoil', 'turretGunV3'])
      for (const slot of cluster) {
        const data = buildingData[slot.type]
        const outside = gate.ny < 0 ? slot.y < gate.y : slot.y > gate.y
        expect(outside).toBe(slot.type === 'turretGunV3')
        for (let y = slot.y; y < slot.y + data.height; y++) {
          for (let x = slot.x; x < slot.x + data.width; x++) expect(map[y][x].type).not.toBe('street')
        }
      }
    }
  })

  it('[U07189] keeps bounds stable when adding defences and expands when economic buildings grow', () => {
    const { map, buildings, factories, yard } = scenario()
    const plan = planBaseDefence('enemy', map, buildings, factories)
    const defences = [...plan.slots, ...plan.walls].map(slot => ({ ...slot, owner: 'enemy', health: 100 }))
    buildings.push(...defences)
    expect(planBaseDefence('enemy', map, buildings, factories).bounds).toEqual(plan.bounds)
    buildings.push({ type: 'vehicleFactory', x: 43, y: 30, width: 3, height: 3, owner: 'enemy', health: 100 })
    const expanded = planBaseDefence('enemy', map, buildings, factories)
    expect(expanded.bounds.right).toBeGreaterThan(plan.bounds.right)
    const oldWall = defences.find(b => b.type === 'concreteWall' && b.x === plan.bounds.right && b.y > plan.bounds.top && b.y < plan.bounds.bottom)
    relocateBaseDefences(expanded, 'enemy', buildings, yard, 1000)
    expect(oldWall.isBeingSold).toBe(true)
    expect(oldWall.sellStartTime).toBe(1000)
    const budget = yard.budget
    relocateBaseDefences(expanded, 'enemy', buildings, yard, 1000)
    expect(yard.budget).toBe(budget)
  })

  it('[U07190] builds only legal affordable slots, respects radar and repairs destroyed walls', () => {
    const { map, buildings, factories } = scenario()
    const plan = planBaseDefence('enemy', map, buildings, factories)
    const first = nextBaseDefence(plan, 'enemy', map, [], buildings, factories, 100000)
    expect(first).toBeTruthy()
    buildings.push({ ...first, owner: 'enemy', health: 100 })
    expect(nextBaseDefence(plan, 'enemy', map, [], buildings, factories, 100000)).not.toEqual(first)
    expect(nextBaseDefence(plan, 'enemy', map, [], buildings, factories, 99)).toBeNull()
    const noRadar = buildings.filter(b => b.type !== 'radarStation')
    expect(['rocketTurret', 'teslaCoil']).not.toContain(nextBaseDefence(plan, 'enemy', map, [], noRadar, factories, 100000)?.type)
    const wall = plan.walls.find(slot => nextBaseDefence({ slots: [], walls: [slot] }, 'enemy', map, [], buildings, factories, 100))
    expect(wall).toBeTruthy()
    buildings.push({ ...wall, owner: 'enemy', health: 0 })
    expect(nextBaseDefence({ slots: [], walls: [wall] }, 'enemy', map, [], buildings, factories, 100)).toEqual(wall)
  })

  it('[U07191] leaves a usable exit without streets and ignores other players and offshore shipyards', () => {
    const { map, buildings, factories } = scenario()
    for (const row of map) for (const tile of row) tile.type = 'land'
    const before = planBaseDefence('enemy', map, buildings, factories)
    buildings.push({ type: 'shipyard', owner: 'enemy', x: 60, y: 60, width: 5, height: 5, health: 100 })
    buildings.push({ type: 'powerPlant', owner: 'player1', x: 60, y: 60, health: 100 })
    const plan = planBaseDefence('enemy', map, buildings, factories)
    expect(plan.bounds).toEqual(before.bounds)
    expect(plan.gates).toHaveLength(1)
    expect(plan.gates[0].ny).toBe(-1)
  })
})
