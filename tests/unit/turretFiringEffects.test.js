import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { RECOIL_DURATION, TURRET_RECOIL_DISTANCE } from '../../src/config.js'
import { getRecoilOffset, renderTurretMuzzleFlash } from '../../src/rendering/turretFiringEffects.js'
import { renderTurretWithImages } from '../../src/rendering/turretImageRenderer.js'
import { drawPreparedSpriteCentered, drawPreparedSpriteTopLeft } from '../../src/rendering/prepared/preparedSpritePipeline.js'

vi.mock('../../src/rendering/prepared/preparedSpritePipeline.js', () => ({
  getPreparedBuildingLayer: vi.fn((type, layer) => ({
    id: `${type}:${layer}`, sourceWidth: layer === 'barrel' ? 16 : 256,
    sourceHeight: layer === 'barrel' ? 88 : 256,
    logicalWidth: layer === 'barrel' ? 2 : 32, logicalHeight: layer === 'barrel' ? 11 : 32
  })),
  drawPreparedSpriteCentered: vi.fn(),
  drawPreparedSpriteTopLeft: vi.fn()
}))

function context() {
  return {
    globalAlpha: 0.4, save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), drawImage: vi.fn()
  }
}

beforeEach(() => vi.clearAllMocks())

describe('shared turret firing effects', () => {
  it('[U04486] accepts simulation time zero and ignores missing, expired and future shots', () => {
    expect(getRecoilOffset(0, 0, 6)).toBe(6)
    expect(getRecoilOffset(0, RECOIL_DURATION / 2, 6)).toBeCloseTo(0.75)
    for (const start of [null, undefined, NaN, 100]) expect(getRecoilOffset(start, 0)).toBe(0)
    expect(getRecoilOffset(0, RECOIL_DURATION + 1)).toBe(0)
  })

  it('[U04487] preserves parent opacity when drawing a flash', () => {
    const ctx = context()
    renderTurretMuzzleFlash(ctx, 0, 11, 0, 0)
    expect(ctx.globalAlpha).toBe(0.4)
    expect(ctx.arc).toHaveBeenCalledOnce()
  })

  it.each([1, 2, 3])('[U04488] renders V%i with the correct barrel count and fixed foundation/housing', version => {
    gameState.simulationTime = 1000
    const ctx = context()
    renderTurretWithImages(ctx, { type: `turretGunV${version}`, turretDirection: 0 }, 20, 40, 32, 32)
    expect(drawPreparedSpriteCentered.mock.calls.map(call => call.slice(2))).toEqual([[36, 56], [0, 0]])
    expect(drawPreparedSpriteTopLeft).toHaveBeenCalledTimes(version)
    expect(ctx.rotate).toHaveBeenCalledWith(-Math.PI / 2)
    expect(ctx.drawImage).not.toHaveBeenCalled()
    expect(ctx.arc).not.toHaveBeenCalled()
  })

  it('[U04489] retains overlapping burst recoil on individual barrels without moving the armor', () => {
    gameState.simulationTime = 150
    const shotTimes = [0, 150, null]
    const building = { type: 'turretGunV3', barrelShotTimes: shotTimes, muzzleFlashIndex: 1 }
    const ctx = context()
    renderTurretWithImages(ctx, building, 0, 0, 32, 32)
    const calls = drawPreparedSpriteTopLeft.mock.calls
    expect(calls[0][3]).toBeCloseTo(3 - TURRET_RECOIL_DISTANCE / 8)
    expect(calls[1][3]).toBeCloseTo(3 - TURRET_RECOIL_DISTANCE)
    expect(calls[2][3]).toBe(4)
    expect(building.barrelShotTimes).toBe(shotTimes)
    expect(drawPreparedSpriteCentered).toHaveBeenLastCalledWith(ctx, expect.anything(), 0, 0)
    expect(ctx.arc).toHaveBeenCalledWith(4.5, 14 - TURRET_RECOIL_DISTANCE, expect.any(Number), 0, Math.PI * 2)
  })
})
