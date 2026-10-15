import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_SSE_SHEETS,
  isRetiredSpriteSheetPath,
  migrateSavedSpriteSheetState,
  purgeRetiredSheetStorage
} from '../../src/ui/spriteSheetRegistry.js'

const SEASONS = 'images/map/sprite_sheets/seasons_1024_q90_2.webp'
const STREETS = 'images/map/sprite_sheets/streets24_q90_1024x1024.webp'

function memoryStorage(entries) {
  const map = new Map(Object.entries(entries))
  return {
    map,
    getStoredItem: key => (map.has(key) ? map.get(key) : null),
    setStoredItem: (key, value) => map.set(key, value),
    removeStoredItem: key => map.delete(key),
    getStoredKeys: prefix => [...map.keys()].filter(key => key.startsWith(prefix))
  }
}

describe('sprite sheet registry', () => {
  it('matches index.json and every listed sheet exists', () => {
    const index = JSON.parse(readFileSync('public/images/map/sprite_sheets/index.json', 'utf8'))
    expect(index.sheets).toEqual([...DEFAULT_SSE_SHEETS])
    DEFAULT_SSE_SHEETS.forEach((path) => {
      expect(() => readFileSync(`public/${path}`)).not.toThrow()
      expect(isRetiredSpriteSheetPath(path)).toBe(false)
    })
  })

  it('purges stored state that references retired sheets', () => {
    const storage = memoryStorage({
      [`rts-sse-metadata:${SEASONS}`]: '{}',
      [`rts-sse-metadata:${STREETS}`]: '{}',
      'rts-sse-last-sheet': `/${SEASONS}`,
      'rts-sse-applied-metadata': JSON.stringify({ sheetPath: SEASONS }),
      'rts-integrated-spritesheet-selected-sheets': JSON.stringify([SEASONS, STREETS])
    })
    purgeRetiredSheetStorage(storage)
    expect(storage.map.has(`rts-sse-metadata:${SEASONS}`)).toBe(false)
    expect(storage.map.has(`rts-sse-metadata:${STREETS}`)).toBe(true)
    expect(storage.map.has('rts-sse-last-sheet')).toBe(false)
    expect(storage.map.has('rts-sse-applied-metadata')).toBe(false)
    expect(JSON.parse(storage.map.get('rts-integrated-spritesheet-selected-sheets'))).toEqual([STREETS])
  })

  it('clears retired sheets from loaded saved games', () => {
    const saved = migrateSavedSpriteSheetState({
      useIntegratedSpriteSheetMode: true,
      activeSpriteSheetPath: 'images/map/sprite_sheets/rockCliffsMountains_64x64_1024x1024.webp',
      activeSpriteSheetMetadata: { sheetPath: 'images/map/sprite_sheets/major_sprite_sheet_default.webp' }
    })
    expect(saved.activeSpriteSheetPath).toBeNull()
    expect(saved.activeSpriteSheetMetadata).toBeNull()
    expect(saved.useIntegratedSpriteSheetMode).toBe(true)
  })
})
