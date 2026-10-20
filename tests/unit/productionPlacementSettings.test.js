import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../src/storage/indexedDbStorage.js', () => ({ getStoredItem: vi.fn(() => null), setStoredItem: vi.fn() }))
import { getStoredItem, setStoredItem } from '../../src/storage/indexedDbStorage.js'

describe('production placement preferences', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); getStoredItem.mockReturnValue(null) })
  it('[U05424] enables both defaults and persists independent choices across module reloads', async() => {
    const values = new Map()
    getStoredItem.mockImplementation(key => values.get(key) ?? null)
    setStoredItem.mockImplementation((key, value) => values.set(key, value))
    let settings = await import('../../src/ui/productionPlacementSettings.js')
    expect(settings.getProductionPlacementSettings()).toEqual({ autoActivate: true, autoAdvance: true })
    settings.setProductionPlacementSetting('autoActivate', false)
    expect(settings.getProductionPlacementSettings().autoAdvance).toBe(true)
    settings.setProductionPlacementSetting('autoAdvance', false)
    vi.resetModules()
    settings = await import('../../src/ui/productionPlacementSettings.js')
    expect(settings.getProductionPlacementSettings()).toEqual({ autoActivate: false, autoAdvance: false })
  })
})
