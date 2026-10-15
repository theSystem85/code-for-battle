import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeAudio extends window.EventTarget {
  constructor(src) {
    super()
    this.src = src
    this.paused = true
    this.currentTime = 0
    this.volume = 1
    this.loop = false
  }
  load() { Promise.resolve().then(() => this.dispatchEvent(new window.Event('canplaythrough'))) }
  play() { this.paused = false; return Promise.resolve() }
  pause() { this.paused = true }
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('story intro and first gameplay music cues', () => {
  let sound
  let director
  beforeEach(async() => {
    window.localStorage?.clear?.()
    vi.resetModules()
    vi.stubGlobal('Audio', FakeAudio)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    sound = await import('../../src/sound.js')
    director = await import('../../src/audio/musicDirector.js')
    const storage = await import('../../src/storage/indexedDbStorage.js')
    storage.setStoredItem(sound.MUSIC_USER_OFF_STORAGE_KEY, false)
    storage.setStoredItem(sound.FIRST_GAMEPLAY_MUSIC_STORAGE_KEY, false)
  })
  afterEach(() => {
    vi.useRealTimers()
    director.suppressNextFirstAttackTheme(false)
    sound.clearSoundCache()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('plays First Strike for the intro, then fades it out fully before Battle Track 02', async() => {
    expect(sound.STORY_INTRO_MUSIC_FILE).toBe('music_attack_motivational.mp3')
    expect(sound.FIRST_GAMEPLAY_MUSIC_FILE).toBe('music02.mp3')
    expect(await sound.playMusicCue(sound.STORY_INTRO_MUSIC_FILE)).toBe(true)
    await flush()
    const intro = sound.bgMusicAudio
    expect(intro.src).toBe('sound/music/music_attack_motivational.mp3')
    expect(intro.paused).toBe(false)
    expect(sound.isMusicEnabled()).toBe(true)
    expect(sound.isMusicFilePlaying(sound.STORY_INTRO_MUSIC_FILE)).toBe(true)

    vi.useFakeTimers()
    expect(await sound.playFirstGameplayMusic()).toBe(true)
    await vi.advanceTimersByTimeAsync(2800)
    // Sequential: First Strike still fading, Battle Track 02 not started yet.
    expect(sound.bgMusicAudio).toBe(intro)
    expect(intro.paused).toBe(false)
    await vi.advanceTimersByTimeAsync(400)
    expect(intro.paused).toBe(true)
    expect(sound.bgMusicAudio.src).toBe('sound/music/music02.mp3')
    expect(sound.bgMusicAudio.paused).toBe(false)
    expect(sound.getCurrentMusicTitle()).toBe('Battle Track 02')
    // Only once per device.
    expect(sound.hasPlayedFirstGameplayMusic()).toBe(true)
    expect(await sound.playFirstGameplayMusic()).toBe(false)
  })

  it('respects an explicit music-off choice', async() => {
    await sound.toggleBackgroundMusic() // on
    await sound.toggleBackgroundMusic() // off, remembered
    expect(sound.isMusicUserDisabled()).toBe(true)
    expect(await sound.playMusicCue(sound.STORY_INTRO_MUSIC_FILE)).toBe(false)
    expect(await sound.playFirstGameplayMusic()).toBe(false)
    expect(sound.isMusicEnabled()).toBe(false)
    expect(sound.hasPlayedFirstGameplayMusic()).toBe(false)
  })

  it('keeps intro music playing while the intro holds the game paused', async() => {
    await sound.playMusicCue(sound.STORY_INTRO_MUSIC_FILE)
    await flush()
    sound.setMusicPauseExempt(true)
    sound.pauseAllSounds()
    expect(sound.bgMusicAudio.paused).toBe(false)
    sound.setMusicPauseExempt(false)
    sound.pauseAllSounds()
    expect(sound.bgMusicAudio.paused).toBe(true)
  })

  it('applies the narration duck on top of master volume', async() => {
    await sound.playMusicCue(sound.STORY_INTRO_MUSIC_FILE)
    await flush()
    sound.setMasterVolume(0.8)
    sound.setMusicDuck(0.25)
    expect(sound.bgMusicAudio.volume).toBeCloseTo(0.2, 5)
    sound.setMusicDuck(1)
    expect(sound.bgMusicAudio.volume).toBeCloseTo(0.8, 5)
  })
  it('starts a cue without first loading a random playlist track', async() => {
    expect(await sound.playMusicCue(sound.STORY_INTRO_MUSIC_FILE)).toBe(true)
    await flush()
    expect(sound.bgMusicAudio.src).toBe('sound/music/music_attack_motivational.mp3')
    expect(sound.getMusicDebugState().file).toBe('music_attack_motivational.mp3')
  })

  it('primes the cue element muted inside a gesture and pauses it again', async() => {
    expect(sound.primeMusicElementInGesture(sound.STORY_INTRO_MUSIC_FILE)).toBe(true)
    await flush()
    // A second prime is a no-op; the element is unmuted and paused again.
    expect(sound.primeMusicElementInGesture(sound.STORY_INTRO_MUSIC_FILE)).toBe(false)
    expect(await sound.playMusicCue(sound.STORY_INTRO_MUSIC_FILE)).toBe(true)
    await flush()
    expect(sound.bgMusicAudio.paused).toBe(false)
    expect(Boolean(sound.bgMusicAudio.muted)).toBe(false)
  })

})

describe('first attack theme after the intro', () => {
  it('skips the First Strike mood once when the intro already played it', async() => {
    const { createMusicDirector, suppressNextFirstAttackTheme, isFirstAttackThemeSuppressed } = await import('../../src/audio/musicDirector.js')
    suppressNextFirstAttackTheme()
    const d = createMusicDirector()
    d.attack()
    expect(isFirstAttackThemeSuppressed()).toBe(false)
    expect(d.update(0, {})).toBe('normal')
    // Other moods are unaffected.
    expect(d.update(1000, { underAttackOutnumbered: true })).toBe('underAttackOutnumbered')
    // A later game (new director, no intro) gets the theme again.
    const next = createMusicDirector()
    next.attack()
    expect(next.update(0, {})).toBe('firstAttack')
  })

})
