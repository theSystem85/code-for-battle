import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SOUND_VERSION_PAIRS } from '../../src/audio/soundVersionPairs.js'
import {
  SOUND_VERSION_STORAGE_KEY,
  registerSoundVersionPairs,
  resolveSoundAssetPath,
  setSoundVersion,
  soundVersionConfigDocument
} from '../../src/audio/soundVersionPreference.js'
import { initializeGameStorage, removeStoredItem } from '../../src/storage/indexedDbStorage.js'
import '../../src/sound.js'

registerSoundVersionPairs(SOUND_VERSION_PAIRS)

beforeEach(async() => {
  await initializeGameStorage()
  removeStoredItem(SOUND_VERSION_STORAGE_KEY)
})

afterEach(() => {
  removeStoredItem(SOUND_VERSION_STORAGE_KEY)
})

describe('sound version preference', () => {
  it('[U07259] defaults every paired effect to the pre-v3 file', () => {
    expect(SOUND_VERSION_PAIRS).toHaveLength(79)
    expect(resolveSoundAssetPath('sound/achievementStinger.mp3')).toBe('sound/legacy/achievementStinger.mp3')
    expect(resolveSoundAssetPath('mine_explosion.mp3')).toBe('sound/legacy/mine_explosion.mp3')
    expect(resolveSoundAssetPath('sound/music/music01.mp3')).toBe('sound/music/music01.mp3')
    const document = soundVersionConfigDocument()
    expect(document.default).toBe('old')
    expect(Object.values(document.sounds).every(value => value === 'old')).toBe(true)
    expect(Object.keys(document.sounds)).toHaveLength(79)
  })

  it('[U07260] switches only the chosen file to the new take', () => {
    setSoundVersion('tankShot01.mp3', true)
    expect(resolveSoundAssetPath('sound/tankShot01.mp3')).toBe('sound/tankShot01.mp3')
    expect(resolveSoundAssetPath('sound/tankShot02.mp3')).toBe('sound/legacy/tankShot02.mp3')
    expect(soundVersionConfigDocument().sounds['tankShot01.mp3']).toBe('new')
    setSoundVersion('tankShot01.mp3', false)
    expect(resolveSoundAssetPath('sound/tankShot01.mp3')).toBe('sound/legacy/tankShot01.mp3')
  })

  it('[U07261] leaves an explicit legacy path unchanged', () => {
    expect(resolveSoundAssetPath('sound/legacy/tankShot01.mp3')).toBe('sound/legacy/tankShot01.mp3')
  })
})
