import { describe, expect, it, vi } from 'vitest'
import { AnimationSheetPreparation } from '../../src/rendering/animationSheetPreparation.js'

describe('prepared animation sheet swaps', () => {
  it('[U00189] keeps the previous sheet until ready and ignores older jobs finishing last', async() => {
    const previous = { sheetPath: 'previous.webp' }
    const state = { activeAnimationSpriteSheetMetadata: previous, activeAnimationSpriteSheetPath: previous.sheetPath, simulationTime: 1000, rngState: { seed: 123 } }
    const ready = new Map()
    const prepare = vi.fn(path => new Promise(resolve => ready.set(path, resolve)))
    const preparation = new AnimationSheetPreparation(state, prepare)
    const older = { sheetPath: 'older.webp' }
    const newer = { sheetPath: 'newer.webp' }
    const first = preparation.stage(older, older.sheetPath)
    expect(preparation.pending).toBe(true)
    expect(state.activeAnimationSpriteSheetMetadata).toBe(previous)
    const second = preparation.stage(newer, newer.sheetPath)
    ready.get(newer.sheetPath)()
    await second
    expect(state.activeAnimationSpriteSheetMetadata).toBe(newer)
    expect(preparation.pending).toBe(false)
    ready.get(older.sheetPath)()
    await first
    expect(state.activeAnimationSpriteSheetMetadata).toBe(newer)
    expect(state.activeAnimationSpriteSheetPath).toBe(newer.sheetPath)
    expect(state.simulationTime).toBe(1000)
    expect(state.rngState).toEqual({ seed: 123 })
  })

  it('[U00190] retains the current sheet on failure and allows a later successful selection', async() => {
    const previous = { sheetPath: 'previous.webp' }
    const state = { activeAnimationSpriteSheetMetadata: previous }
    const prepare = vi.fn().mockRejectedValueOnce(new Error('Budget exceeded')).mockResolvedValueOnce({})
    const preparation = new AnimationSheetPreparation(state, prepare)
    await expect(preparation.stage({}, 'oversized.webp')).rejects.toThrow('Budget exceeded')
    expect(state.activeAnimationSpriteSheetMetadata).toBe(previous)
    expect(preparation.pending).toBe(false)
    const replacement = { sheetPath: 'replacement.webp' }
    await preparation.stage(replacement, replacement.sheetPath)
    expect(state.activeAnimationSpriteSheetMetadata).toBe(replacement)
  })
})
