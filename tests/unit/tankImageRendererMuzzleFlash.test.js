import { afterEach, describe, expect, it, vi } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { renderTankWithImages } from '../../src/rendering/tankImageRenderer.js'

function createContext() {
  const gradient = { addColorStop: vi.fn() }
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    drawImage: vi.fn(),
    fill: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    gradient
  }
}

const images = {
  wagon: { width: 100, height: 100 },
  turret: { width: 80, height: 101 },
  barrel: { width: 13, height: 95 }
}

describe('tank image muzzle flashes', () => {
  afterEach(() => {
    gameState.simulationTime = 0
  })

  it('[U07048] keeps the rapid-fire light tank flash visible after a standard tank flash expires', () => {
    gameState.simulationTime = 1200
    const lightTankContext = createContext()
    const standardTankContext = createContext()
    const commonUnit = {
      direction: 0,
      turretDirection: 0,
      muzzleFlashStartTime: 1000
    }

    expect(renderTankWithImages(lightTankContext, { ...commonUnit, type: 'lightTank' }, 50, 50, { images })).toBe(true)
    expect(renderTankWithImages(standardTankContext, { ...commonUnit, type: 'tank_v1' }, 50, 50, { images })).toBe(true)

    expect(lightTankContext.createRadialGradient).toHaveBeenCalledOnce()
    expect(lightTankContext.arc).toHaveBeenCalledOnce()
    expect(standardTankContext.createRadialGradient).not.toHaveBeenCalled()
  })
})
