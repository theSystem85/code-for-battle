import { describe, it, expect } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import { getUnitCollisionBounds, getUnitCollisionBoxAt } from '../../src/game/unitCollisionBounds.js'

describe('unitCollisionBounds', () => {
  it('returns fallback tile bounds for unknown unit types', () => {
    const bounds = getUnitCollisionBounds('unknown_unit')
    expect(bounds.minX).toBe(0)
    expect(bounds.minY).toBe(0)
    expect(bounds.maxX).toBe(TILE_SIZE)
    expect(bounds.maxY).toBe(TILE_SIZE)
  })

  it('projects local bounds into world coordinates', () => {
    const box = getUnitCollisionBoxAt({ type: 'unknown_unit' }, 10, 20)
    expect(box.minX).toBe(10)
    expect(box.minY).toBe(20)
    expect(box.maxX).toBe(10 + TILE_SIZE)
    expect(box.maxY).toBe(20 + TILE_SIZE)
    expect(box.width).toBe(TILE_SIZE)
    expect(box.height).toBe(TILE_SIZE)
  })
})
