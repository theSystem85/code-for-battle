import { describe, expect, it, vi } from 'vitest'
import { getStoredItem, resetGameStorageForTests } from '../../src/storage/indexedDbStorage.js'
import { GRAPHICS_SETTINGS_STORAGE_KEY } from '../../src/config.js'
import { getConfigValue, setConfigValue } from '../../src/configRegistry.js'
import { CRYSTAL_GLOW_COLORS, CrystalGlowRenderer, getCrystalGlowStyle } from '../../src/rendering/crystalGlow.js'

describe('crystal glow', () => {
  it('[U07046] scales the glow pool with crystal density and matches each crystal family color', () => {
    const smallOre = getCrystalGlowStyle('ore', 1)
    const largeOre = getCrystalGlowStyle('ore', 5)
    const seed = getCrystalGlowStyle('seedCrystal', 3)

    expect(largeOre.width).toBeGreaterThan(smallOre.width)
    expect(largeOre.height).toBeGreaterThan(smallOre.height)
    expect(largeOre.alpha).toBeGreaterThan(smallOre.alpha)
    expect(smallOre.color).toBe(CRYSTAL_GLOW_COLORS.ore)
    expect(seed.color).toBe(CRYSTAL_GLOW_COLORS.seedCrystal)
  })

  it('[U07047] defaults on and persists changes with the other graphics settings', () => {
    resetGameStorageForTests()
    expect(getConfigValue('crystalGlowEnabled')).toBe(true)

    setConfigValue('crystalGlowEnabled', false)
    const stored = JSON.parse(getStoredItem(GRAPHICS_SETTINGS_STORAGE_KEY))
    expect(stored.crystalGlowEnabled).toBe(false)

    setConfigValue('crystalGlowEnabled', true)
  })

  it('[U07049] draws a screen-blended ground pool, restores canvas state, and reuses cached sprites', () => {
    const gradients = []
    const context = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      scale: vi.fn(),
      createRadialGradient: vi.fn(() => {
        const gradient = { addColorStop: vi.fn() }
        gradients.push(gradient)
        return gradient
      })
    }
    const createCanvas = vi.fn((width, height) => ({ width, height, getContext: () => context }))
    const renderer = new CrystalGlowRenderer()

    renderer.draw(context, 'ore', 3, 4, 7, 100, 200, 1000, createCanvas)
    renderer.draw(context, 'ore', 3, 4, 7, 100, 200, 1200, createCanvas)

    expect(createCanvas).toHaveBeenCalledTimes(1)
    expect(context.scale).toHaveBeenCalledWith(1, expect.any(Number))
    expect(gradients[0].addColorStop).toHaveBeenLastCalledWith(1, 'rgba(0, 0, 0, 0)')
    expect(context.drawImage).toHaveBeenCalledTimes(2)
    expect(context.globalAlpha).toBe(1)
    expect(context.globalCompositeOperation).toBe('source-over')
  })
})
