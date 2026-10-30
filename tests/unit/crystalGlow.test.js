import { describe, expect, it } from 'vitest'
import { getStoredItem, resetGameStorageForTests } from '../../src/storage/indexedDbStorage.js'
import { GRAPHICS_SETTINGS_STORAGE_KEY } from '../../src/config.js'
import { getConfigValue, setConfigValue } from '../../src/configRegistry.js'
import { CRYSTAL_GLOW_COLORS, getCrystalGlowStyle } from '../../src/rendering/crystalGlow.js'

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
})
