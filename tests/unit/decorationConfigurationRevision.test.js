import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeDecorationConfiguration } from '../../src/game/decorationConfigurationRevision.js'
import { DECORATION_SETTINGS, normalizeDecorationSettings } from '../../src/game/decorationSettings.js'
import * as settingsModule from '../../src/game/decorationSettings.js'
import { TextureManager } from '../../src/rendering/textureManager.js'
import { gameState } from '../../src/gameState.js'

describe('decoration configuration revisions', () => {
  afterEach(() => vi.restoreAllMocks())
  it('[U07067] retains observer identity and raw save/UI values while ignoring equivalent normalized writes', () => {
    const state = { ...normalizeDecorationSettings(), mapSeed: '11', playerCount: 4 }
    const observer = observeDecorationConfiguration(state)
    expect(observeDecorationConfiguration(state)).toBe(observer)
    state.citySeeds = '4'
    state.decorativeTileCount = 999
    expect(state.citySeeds).toBe('4')
    expect(observer.revision).toBe(0)
    expect(JSON.parse(JSON.stringify(state)).citySeeds).toBe('4')
    state.citySeeds = 5
    expect(observer.revision).toBe(1)
    state.citySeeds = 5
    expect(observer.revision).toBe(1)
  })

  it('[U07068] invalidates every effective setting plus seed/player configuration without replacing arrays or normalizing on reads', () => {
    const state = { ...normalizeDecorationSettings(), mapSeed: '11', playerCount: 4 }
    const observer = observeDecorationConfiguration(state)
    let changes = 0
    for (const [key, rule] of Object.entries(DECORATION_SETTINGS)) {
      if (key === 'decorativeTileCount') continue
      state[key] = state[key] < rule.max ? state[key] + 1 : state[key] - 1
      expect(observer.revision).toBe(++changes)
    }
    state.mapSeed = '12'
    state.playerCount = 3
    expect(observer.revision).toBe(changes + 2)
  })

  it('[U07072] reads a published layout repeatedly without normalization/serialization and retires it on configuration writes', () => {
    const manager = new TextureManager()
    const grid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ type: 'land', biome: 'grass' })))
    const layout = manager.prepareDecorationLayout(grid)
    const normalization = vi.spyOn(settingsModule, 'normalizeDecorationSettings')
    const stringify = vi.spyOn(JSON, 'stringify')
    let same = true
    for (let i = 0; i < 10000; i++) same &&= manager.getDecorationLayout(grid) === layout
    const normalizations = normalization.mock.calls.length, serializations = stringify.mock.calls.length
    stringify.mockRestore()
    expect(same).toBe(true)
    expect(normalizations).toBe(0)
    expect(serializations).toBe(0)
    const old = gameState.citySeeds
    try {
      gameState.citySeeds = Number(old) === 0 ? 1 : 0
      expect(manager.getDecorationLayout(grid)).toBeNull()
      expect(manager.ensureDecorationLayout(grid)).toBeNull()
      manager.integratedSpriteSheetMode = true
      const replacement = manager.ensureDecorationLayout(grid)
      expect(replacement).not.toBe(layout)
      expect(manager.getDecorationLayout(grid)).toBe(replacement)
      expect(normalization.mock.calls.length).toBeGreaterThan(0)
    } finally { gameState.citySeeds = old }
  })
})
