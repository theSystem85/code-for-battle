import { describe, it, expect, vi } from 'vitest'
import { beginFactoryExit, updateFactoryExits, factoryExitEase, canInteractWithUnit } from '../../src/game/factoryExit.js'
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

  it('eases through the midpoint, completes at 1200ms, then issues rally movement', () => {
    const f = fixture()
    const state = { ...f.unit.factoryExit }
    expect(factoryExitEase(0)).toBe(0)
    expect(factoryExitEase(1)).toBe(1)
    f.tick(600)
    expect(f.unit.x).toBe((state.startX + state.endX) / 2)
    expect(f.path).not.toHaveBeenCalled()
    f.tick(600)
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
    f.tick(500)
    expect(f.unit.factoryExit.elapsed).toBe(0)
    f.map[8][4].type = 'land'
    f.units.push({ id: 'blocker', health: 100, x: 4 * TILE_SIZE, y: 8 * TILE_SIZE })
    f.tick(500)
    expect(f.unit.factoryExit.phase).toBe('waiting')
    f.units.pop()
    f.occupancy[8][4] = 1
    f.tick(500)
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
    f.tick(250)
    expect(second.factoryExit.elapsed).toBe(0)
    f.tick(250)
    expect(second.factoryExit.phase).toBe('moving')
    expect(second.factoryExit.elapsed).toBeLessThan(f.unit.factoryExit.elapsed)
    expect(second.factoryExit.endX).toBeLessThan(f.unit.factoryExit.endX)
    f.tick(700)
    f.tick(500)
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
    f.tick(1200)
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
})
