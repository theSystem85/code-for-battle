import { describe, expect, it } from 'vitest'
import { getUnitShadowOffset } from '../../src/rendering/unitShadow.js'

describe('unit shadow geometry', () => {
  it('[U07042] casts the default 45 degree shadow toward the north-east', () => {
    const offset = getUnitShadowOffset(0.25, 45, 40)
    expect(offset.x).toBeCloseTo(Math.sqrt(50))
    expect(offset.y).toBeCloseTo(-Math.sqrt(50))
  })

  it('[U07043] clamps negative lengths to the unit origin', () => {
    expect(getUnitShadowOffset(-1, 120, 40)).toEqual({ x: -0, y: -0 })
  })
})
