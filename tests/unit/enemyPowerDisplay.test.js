import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/gameState.js', () => ({
  gameState: { humanPlayer: 'player1', showEnemyResources: true, enemyPowerSupply: 999 }
}))
vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [] }))
vi.mock('../../src/buildingImageMap.js', () => ({ getBuildingImage: vi.fn() }))
vi.mock('../../src/rendering/turretImageRenderer.js', () => ({
  renderTurretWithImages: vi.fn(),
  turretImagesAvailable: vi.fn(() => false)
}))

import { gameState } from '../../src/gameState.js'
import { BuildingRenderer } from '../../src/rendering/buildingRenderer.js'

describe('enemy construction yard power display', () => {
  it.each([100, 0, -20, undefined, NaN, Infinity])('[U01382] renders finite owner power for %s', power => {
    gameState.powerSupplyByOwner = { player2: power, player3: 500 }
    const ctx = { save: vi.fn(), restore: vi.fn(), strokeText: vi.fn(), fillText: vi.fn() }
    const building = { type: 'constructionYard', owner: 'player2', selected: true }

    BuildingRenderer.prototype.renderFactoryPowerStatus(ctx, building, 10, 20, 96, 96)

    const expected = `Power: ${Number.isFinite(power) ? power : 0}`
    expect(ctx.fillText).toHaveBeenCalledWith(expected, 58, 32)
    expect(ctx.strokeText).toHaveBeenCalledWith(expected, 58, 32)
  })

  it('[U01383] renders zero before the owner lookup is initialized', () => {
    delete gameState.powerSupplyByOwner
    const ctx = { save: vi.fn(), restore: vi.fn(), strokeText: vi.fn(), fillText: vi.fn() }

    BuildingRenderer.prototype.renderFactoryPowerStatus(ctx,
      { type: 'constructionYard', owner: 'player2', selected: true }, 0, 0, 96, 96)

    expect(ctx.fillText).toHaveBeenCalledWith('Power: 0', 48, 12)
  })
})
