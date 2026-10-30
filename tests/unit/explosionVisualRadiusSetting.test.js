import { beforeEach, describe, expect, it } from 'vitest'
import { getStoredItem, resetGameStorageForTests, setStoredItem } from '../../src/storage/indexedDbStorage.js'
import {
  GRAPHICS_SETTINGS_STORAGE_KEY,
  LARGE_EXPLOSION_VISUAL_RADIUS,
  loadGraphicsSettingsFromIndexedDb,
  setLargeExplosionVisualRadius
} from '../../src/config.js'

describe('explosion visual radius graphics setting', () => {
  beforeEach(() => {
    resetGameStorageForTests()
    setLargeExplosionVisualRadius(64)
  })

  it('[U07051] defaults to the large blast baseline and persists tuning', () => {
    expect(LARGE_EXPLOSION_VISUAL_RADIUS).toBe(64)
    setLargeExplosionVisualRadius(88)
    expect(JSON.parse(getStoredItem(GRAPHICS_SETTINGS_STORAGE_KEY))).toMatchObject({
      largeExplosionVisualRadius: 88
    })
    setLargeExplosionVisualRadius(64)
    setStoredItem(GRAPHICS_SETTINGS_STORAGE_KEY, JSON.stringify({ largeExplosionVisualRadius: 96 }))
    loadGraphicsSettingsFromIndexedDb()
    expect(LARGE_EXPLOSION_VISUAL_RADIUS).toBe(96)
  })
})
