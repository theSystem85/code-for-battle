import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    buildingsAwaitingRepair: []
  }
}))

vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [] }))
vi.mock('../../src/buildingImageMap.js', () => ({ getBuildingImage: vi.fn() }))
vi.mock('../../src/rendering/turretImageRenderer.js', () => ({
  renderTurretWithImages: vi.fn(),
  turretImagesAvailable: vi.fn(() => false)
}))

describe('building repair countdown HUD', () => {
  it('never draws the timeout fill wider than the building', async() => {
    globalThis.Image = class Image {}
    const [{ BuildingRenderer }, { gameState }] = await Promise.all([
      import('../../src/rendering/buildingRenderer.js'),
      import('../../src/gameState.js')
    ])
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
})
