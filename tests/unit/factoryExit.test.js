import { describe, it, expect, vi } from 'vitest'
import { beginFactoryExit, updateFactoryExits, factoryExitEase, canInteractWithUnit, factoryExitVisibility, FACTORY_EXIT_DURATION, FACTORY_EXIT_STAGGER, FACTORY_EXIT_BLOCKED_WAIT } from '../../src/game/factoryExit.js'
import { TILE_SIZE } from '../../src/config.js'

function fixture() {
  const factory = { id: 'garage', type: 'vehicleFactory', x: 5, y: 5, health: 100 }
  const map = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => ({ type: 'land' })))
  const occupancy = map.map(row => row.map(() => 0))
  const unit = { id: 'tank', health: 100 }
  beginFactoryExit(unit, factory, { x: 12, y: 12 })
  const units = [unit]
  const path = vi.fn(() => [{ x: 4, y: 8 }, { x: 12, y: 12 }])
  return { unit, units, factory, map, occupancy, path,
    tick(delta, paused = false) { updateFactoryExits(units, [factory], map, occupancy, delta, paused, path) } }
}

describe('vehicle factory exit', () => {
  it('starts covered, facing southwest with center-based tile coordinates', () => {
    const { unit, factory } = fixture()
    expect(unit.x).toBe((factory.x + 1.3) * TILE_SIZE)
    expect(unit.direction).toBe(Math.PI * 3 / 4)
    expect(unit.tileX).toBe(Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE))
    expect(unit.path).toEqual([])
    expect(canInteractWithUnit(unit)).toBe(false)
  })

  it('eases through the midpoint, completes after the slow crawl duration, then issues rally movement', () => {
    const f = fixture()
    const state = { ...f.unit.factoryExit }
    expect(factoryExitEase(0)).toBe(0)
    expect(factoryExitEase(1)).toBe(1)
    expect(FACTORY_EXIT_DURATION).toBeGreaterThanOrEqual(3500)
    expect(FACTORY_EXIT_DURATION).toBeLessThanOrEqual(4000)
    f.tick(FACTORY_EXIT_DURATION / 2)
    expect(f.unit.x).toBe((state.startX + state.endX) / 2)
    expect(f.path).not.toHaveBeenCalled()
    f.tick(FACTORY_EXIT_DURATION / 2 - 1)
    expect(f.unit.factoryExit).toBeDefined()
    f.tick(1)
    expect(f.unit.factoryExit).toBeUndefined()
    expect(f.unit.x).toBe(state.endX)
    expect(f.unit.y).toBe(state.endY)
    expect(f.unit.moveTarget).toEqual({ x: 12, y: 12 })
    expect(f.occupancy[8][4]).toBe(1)
    expect(canInteractWithUnit(f.unit)).toBe(true)
  })

  it('is deterministic and never advances while paused', () => {
    const a = fixture()
    const b = fixture()
    for (let i = 0; i < 60; i++) {
      a.tick(16)
      b.tick(16)
      expect(a.unit).toEqual(b.unit)
    }
    const before = JSON.stringify(a.unit)
    a.tick(10000, true)
    expect(JSON.stringify(a.unit)).toBe(before)
  })

  it('holds inside until both terrain and unit occupancy allow departure', () => {
    const f = fixture()
    f.map[8][4].type = 'water'
    f.tick(200)
    expect(f.unit.factoryExit.elapsed).toBe(0)
    f.map[8][4].type = 'land'
    f.units.push({ id: 'blocker', health: 100, owner: 'enemy', x: 4 * TILE_SIZE, y: 8 * TILE_SIZE })
    f.tick(200)
    expect(f.unit.factoryExit.phase).toBe('waiting')
    f.units.pop()
    f.occupancy[8][4] = 1
    f.tick(200)
    expect(f.unit.factoryExit.elapsed).toBe(0)
    f.occupancy[8][4] = 0
    f.tick(100)
    expect(f.unit.factoryExit.elapsed).toBe(100)
  })

  it('staggers units until the previous vehicle has cleared the gate', () => {
    const f = fixture()
    const second = { id: 'second', health: 100 }
    beginFactoryExit(second, f.factory)
    f.units.push(second)
    f.tick(FACTORY_EXIT_STAGGER / 2)
    expect(second.factoryExit.elapsed).toBe(0)
    f.tick(FACTORY_EXIT_STAGGER / 2)
    expect(second.factoryExit.phase).toBe('moving')
    expect(second.factoryExit.elapsed).toBeLessThan(f.unit.factoryExit.elapsed)
    expect(second.factoryExit.endX).toBeLessThan(f.unit.factoryExit.endX)
    f.tick(FACTORY_EXIT_DURATION)
    f.tick(FACTORY_EXIT_DURATION)
    expect(second.factoryExit).toBeUndefined()
    expect(second.x).not.toBe(f.unit.x)
  })

  it.each(['destroyed', 'sold', 'removed'])('finishes immediately when the factory is %s', reason => {
    const f = fixture()
    const endX = f.unit.factoryExit.endX
    if (reason === 'destroyed') f.factory.health = 0
    if (reason === 'sold') f.factory.isBeingSold = true
    updateFactoryExits(f.units, reason === 'removed' ? [] : [f.factory], f.map, f.occupancy, 16)
    expect(f.unit.factoryExit).toBeUndefined()
    expect(f.unit.x).toBe(endX)
    expect(canInteractWithUnit(f.unit)).toBe(true)
  })

  it('uses a valid outside tile for a factory at the southwest map corner', () => {
    const f = fixture()
    f.factory.x = 0
    f.factory.y = 17
    beginFactoryExit(f.unit, f.factory)
    f.tick(FACTORY_EXIT_DURATION)
    expect(f.unit.factoryExit).toBeUndefined()
    expect(f.unit.tileX).toBe(3)
    expect(f.unit.tileY).toBe(19)
  })

  it('resumes identical positions and completion after a JSON save/load round trip', () => {
    const a = fixture()
    a.tick(375)
    const b = fixture()
    Object.assign(b.unit, JSON.parse(JSON.stringify(a.unit)))
    for (let i = 0; i < 40; i++) {
      a.tick(25)
      b.tick(25)
      expect(b.unit).toEqual(a.unit)
    }
  })
  it('hides the unit inside the dark gate and fades it in while rolling out', () => {
    const f = fixture()
    expect(factoryExitVisibility(f.unit)).toBe(0)
    f.tick(FACTORY_EXIT_DURATION * 0.075)
    expect(factoryExitVisibility(f.unit)).toBeCloseTo(0.5)
    f.tick(FACTORY_EXIT_DURATION * 0.5)
    expect(factoryExitVisibility(f.unit)).toBe(1)
  })

  it('pushes an idle friendly unit off the exit tile instead of waiting forever', () => {
    const f = fixture()
    f.unit.owner = 'p1'
    const idle = { id: 'idle', owner: 'p1', health: 100, x: 4 * TILE_SIZE, y: 8 * TILE_SIZE, path: [] }
    f.units.push(idle)
    f.path.mockImplementation((from, to) => [from, to])
    f.tick(16)
    expect(idle.moveTarget).toBeDefined()
    expect(idle.moveTarget).not.toEqual({ x: 4, y: 8 })
    expect(idle.path.length).toBe(1)
    // The pushed unit drives away; the exit then proceeds.
    idle.x = idle.moveTarget.x * TILE_SIZE
    idle.y = idle.moveTarget.y * TILE_SIZE
    f.tick(16)
    expect(f.unit.factoryExit.phase).toBe('moving')
  })

  it('uses the next free spot when the exit is blocked by a non-movable unit (no deadlock)', () => {
    const f = fixture()
    f.unit.owner = 'p1'
    f.units.push({ id: 'enemy', owner: 'p2', health: 100, x: 4 * TILE_SIZE, y: 8 * TILE_SIZE })
    f.tick(FACTORY_EXIT_BLOCKED_WAIT - 16)
    expect(f.unit.factoryExit.phase).toBe('waiting')
    f.tick(16)
    expect(f.unit.factoryExit.phase).toBe('moving')
    const endTile = { x: f.unit.factoryExit.endX / TILE_SIZE, y: f.unit.factoryExit.endY / TILE_SIZE }
    expect(endTile).not.toEqual({ x: 4, y: 8 })
    f.tick(FACTORY_EXIT_DURATION)
    expect(f.unit.factoryExit).toBeUndefined()
    expect(f.unit.tileX < f.factory.x || f.unit.tileY >= f.factory.y + 3).toBe(true)
  })

  it('sends the unit to the nearest free tile when the rally point is occupied', () => {
    const f = fixture()
    f.path.mockImplementation((from, to) => [from, to])
    f.units.push({ id: 'parked', health: 100, x: 12 * TILE_SIZE, y: 12 * TILE_SIZE })
    f.tick(FACTORY_EXIT_DURATION)
    expect(f.unit.moveTarget).not.toEqual({ x: 12, y: 12 })
    expect(Math.max(Math.abs(f.unit.moveTarget.x - 12), Math.abs(f.unit.moveTarget.y - 12))).toBe(1)
  })

  it('gives queued units distinct rally tiles when they share one rally point', () => {
    const f = fixture()
    f.path.mockImplementation((from, to) => [from, to])
    const second = { id: 'second', health: 100 }
    beginFactoryExit(second, f.factory, { x: 12, y: 12 })
    f.units.push(second)
    for (let i = 0; i < 600; i++) f.tick(16)
    expect(f.unit.moveTarget).toEqual({ x: 12, y: 12 })
    expect(second.moveTarget).not.toEqual({ x: 12, y: 12 })
  })

  it('resolves blocked exits and rally points identically on every peer', () => {
    const build = () => {
      const f = fixture()
      f.path.mockImplementation((from, to) => [from, to])
      f.unit.owner = 'p1'
      f.units.push({ id: 'idle', owner: 'p1', health: 100, x: 4 * TILE_SIZE, y: 8 * TILE_SIZE, path: [] })
      f.units.push({ id: 'parked', owner: 'p2', health: 100, x: 12 * TILE_SIZE, y: 12 * TILE_SIZE })
      return f
    }
    const a = build()
    const b = build()
    for (let i = 0; i < 400; i++) {
      a.tick(16)
      b.tick(16)
    }
    expect(JSON.stringify(a.units)).toBe(JSON.stringify(b.units))
  })
})
