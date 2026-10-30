import { describe, expect, it } from 'vitest'
import { clearUnitShadowCaches, drawCachedUnitShadow, getUnitShadowCacheStats, getUnitShadowOffset, rebuildUnitShadowCaches, usesUnitGroundShadow } from '../../src/rendering/unitShadow.js'

describe('unit shadow geometry', () => {
  it('[U07042] casts the default 45 degree shadow toward the north-east', () => {
    const offset = getUnitShadowOffset(0.25, 45, 40)
    expect(offset.x).toBeCloseTo(Math.sqrt(50))
    expect(offset.y).toBeCloseTo(-Math.sqrt(50))
  })

  it('[U07043] clamps negative lengths to the unit origin', () => {
    expect(getUnitShadowOffset(-1, 120, 40)).toEqual({ x: -0, y: -0 })
  })

  it('[U07045] reuses one prepared mask per type and rebuilds known types only when committed', () => {
    clearUnitShadowCaches()
    const target = document.createElement('canvas').getContext('2d')
    let maskDraws = 0
    const drawMask = ctx => { maskDraws++; ctx.fillRect(20, 20, 30, 20) }
    const settings = () => ({ offset: 0.3, direction: 45, startStretch: 1, endStretch: 1.4, size: 1.1, opacity: 0.4, blur: 3 })
    drawCachedUnitShadow(target, 'tank_v1', 50, 50, 40, drawMask, settings)
    drawCachedUnitShadow(target, 'tank_v1', 90, 50, 40, drawMask, settings)
    expect(maskDraws).toBe(1)
    expect(getUnitShadowCacheStats().entries).toBe(1)

    rebuildUnitShadowCaches(settings())
    expect(maskDraws).toBe(2)
    expect(getUnitShadowCacheStats().entries).toBe(1)
  })

  it('[U07052] excludes configured and runtime air units from ground shadows', () => {
    expect(usesUnitGroundShadow({ type: 'apache' })).toBe(false)
    expect(usesUnitGroundShadow({ type: 'f22Raptor' })).toBe(false)
    expect(usesUnitGroundShadow({ type: 'f35', carrierId: 'carrier-1' })).toBe(false)
    expect(usesUnitGroundShadow({ type: 'futureAircraft', isAirUnit: true })).toBe(false)
    expect(usesUnitGroundShadow({ type: 'tank_v1' })).toBe(true)
    expect(usesUnitGroundShadow({ type: 'aircraftCarrier', isNaval: true })).toBe(true)
  })
})
