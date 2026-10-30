import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    buildingsAwaitingRepair: [],
    simulationTime: 200
  }
}))

vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [] }))
vi.mock('../../src/buildingImageMap.js', () => ({ getBuildingImage: vi.fn() }))
vi.mock('../../src/rendering/turretImageRenderer.js', () => ({
  renderTurretWithImages: vi.fn(),
  turretImagesAvailable: vi.fn(() => false)
}))

beforeEach(() => {
  vi.resetModules()
})

describe('building repair countdown HUD', () => {
  it('[U07044] draws only an active production building progress bar in blue', async() => {
    globalThis.Image = class Image {}
    const { BuildingRenderer } = await import('../../src/rendering/buildingRenderer.js')
    const fillRect = vi.fn()
    const ctx = {
      fillRect,
      restore: vi.fn(),
      save: vi.fn(),
      set fillStyle(_value) {}
    }

    const renderer = new BuildingRenderer()
    renderer.renderFactoryProductionProgress(ctx, { productionProgress: 0.4 }, 20, 30, 100, 64)
    renderer.renderFactoryProductionProgress(ctx, {}, 20, 30, 100, 64)

    expect(fillRect).toHaveBeenCalledTimes(2)
    expect(fillRect).toHaveBeenNthCalledWith(2, 20, 14, 40, 3)
  })

  it('[U00549] never draws the timeout fill wider than the building', async() => {
    globalThis.Image = class Image {}
    const { gameState } = await import('../../src/gameState.js')
    const { BuildingRenderer } = await import('../../src/rendering/buildingRenderer.js')
    const building = { id: 'repairing-building' }
    gameState.buildingsAwaitingRepair = [{ building, remainingCooldown: 100 }]
    const fillRect = vi.fn()
    const ctx = {
      fillRect,
      restore: vi.fn(),
      save: vi.fn(),
      set fillStyle(_value) {}
    }

    new BuildingRenderer().renderPendingRepairCountdown(ctx, building, 20, 30, 96, 64)

    expect(fillRect).toHaveBeenNthCalledWith(1, 20, 17, 96, 3)
    expect(fillRect).toHaveBeenNthCalledWith(2, 20, 17, 96, 3)
  })

  it('[U00550] uses prepared Tesla source rectangles with proportional construction cropping', async() => {
    globalThis.Image = class Image {}
    const { BuildingRenderer } = await import('../../src/rendering/buildingRenderer.js')
    const image = { width: 384, height: 384 }
    const sprite = {
      image,
      sourceRect: { x: 10, y: 20, width: 384, height: 384 }
    }
    const renderer = new BuildingRenderer()
    renderer.setPreparedSpriteRegistry({ get: vi.fn(() => sprite) })
    const drawImage = vi.fn()
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage
    }

    renderer.drawTeslaCoilImage(
      ctx,
      renderer.getPreparedSprite('building:teslaCoil:base'),
      { teslaState: 'charging', teslaChargeStartTime: 0 },
      5,
      7,
      64,
      64
    )

    expect(drawImage).toHaveBeenCalledWith(
      image,
      10,
      71,
      384,
      333,
      5,
      15.5,
      64,
      55.5
    )
  })
})
