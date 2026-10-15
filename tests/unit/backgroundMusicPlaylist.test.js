import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeAudio extends window.EventTarget {
  constructor(src) {
    super()
    this.src = src
    this.paused = true
    this.currentTime = 0
    this.volume = 1
    this.loop = false
    this.preload = 'none'
    FakeAudio.instances.push(this)
  }

  load() {
    Promise.resolve().then(() => this.dispatchEvent(new window.Event('canplaythrough')))
  }

  play() {
    this.paused = false
    return Promise.resolve()
  }

  pause() {
    this.paused = true
  }

  finish() {
    this.paused = true
    this.dispatchEvent(new window.Event('ended'))
  }
}
FakeAudio.instances = []

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('background music playlist', () => {
  let sound

  beforeEach(async() => {
    FakeAudio.instances = []
    vi.resetModules()
    vi.stubGlobal('Audio', FakeAudio)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    sound = await import('../../src/sound.js')
    // These tests check fades against master volume only: neutral balance.
    sound.setMixBalance(50)
  })

  afterEach(() => {
    vi.useRealTimers()
    sound.clearSoundCache()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('picks a random file and never repeats the previous one when alternatives exist', () => {
    const files = ['music01.mp3', 'music02.mp3', 'music03.mp3']
    expect(sound.pickBackgroundMusicFile(files, null, () => 0)).toBe('music01.mp3')
    expect(sound.pickBackgroundMusicFile(files, null, () => 0.99)).toBe('music03.mp3')
    expect(sound.pickBackgroundMusicFile(files, 'music01.mp3', () => 0)).toBe('music02.mp3')
    expect(sound.pickBackgroundMusicFile(files, 'music03.mp3', () => 0.99)).toBe('music02.mp3')
    expect(sound.pickBackgroundMusicFile(['music01.mp3'], 'music01.mp3', () => 0.5)).toBe('music01.mp3')
    expect(sound.pickBackgroundMusicFile([], null)).toBeNull()
  })

  it('plays the next random track when one ends instead of looping', async() => {
    await sound.toggleBackgroundMusic()
    await flush()

    const first = sound.bgMusicAudio
    expect(first.src).toBe('sound/music/music01.mp3')
    expect(first.loop).toBe(false)
    expect(first.paused).toBe(false)
    // The next track is preloaded and cached while the first one plays
    expect(FakeAudio.instances.map(audio => audio.src)).toEqual([
      'sound/music/music01.mp3',
      'sound/music/music02.mp3'
    ])

    first.finish()
    await flush()

    const second = sound.bgMusicAudio
    expect(second.src).toBe('sound/music/music02.mp3')
    expect(second.paused).toBe(false)
    expect(first.paused).toBe(true)

    second.finish()
    await flush()

    expect(sound.bgMusicAudio).toBe(first)
    expect(first.paused).toBe(false)
    // Cached elements are reused, no new Audio objects are created
    expect(FakeAudio.instances).toHaveLength(2)
  })

  it('keeps toggle, volume and terminate behavior on the current track', async() => {
    await sound.toggleBackgroundMusic()
    await flush()
    sound.bgMusicAudio.finish()
    await flush()

    const current = sound.bgMusicAudio
    sound.setMasterVolume(0.3)
    expect(current.volume).toBeCloseTo(0.3)

    await sound.toggleBackgroundMusic()
    expect(current.paused).toBe(true)
    await sound.toggleBackgroundMusic()
    expect(current.paused).toBe(false)

    current.currentTime = 42
    sound.terminateAllSounds()
    expect(current.paused).toBe(true)
    expect(current.currentTime).toBe(0)
  })

  it('ignores ended events from tracks that are no longer current', async() => {
    await sound.toggleBackgroundMusic()
    await flush()
    const first = sound.bgMusicAudio
    first.finish()
    await flush()
    const second = sound.bgMusicAudio

    first.dispatchEvent(new window.Event('ended'))
    await flush()

    expect(sound.bgMusicAudio).toBe(second)
    expect(second.paused).toBe(false)
  })
  it('fades the current track out completely before the next starts at full volume', async() => {
    await sound.toggleBackgroundMusic()
    await flush()
    const normal = sound.bgMusicAudio
    sound.setMasterVolume(0.6)
    vi.useFakeTimers()
    await sound.updateDirectedMusic('underAttackOutnumbered')
    const danger = FakeAudio.instances.find(audio => audio.src === 'sound/music/music_under_attack_danger.mp3')
    const audible = () => FakeAudio.instances.filter(audio => !audio.paused)
    // Halfway: only the outgoing track plays, on the fade curve; nothing overlaps.
    await vi.advanceTimersByTimeAsync(sound.MUSIC_FADE_OUT_MS / 2)
    expect(audible()).toEqual([normal])
    expect(normal.volume).toBeCloseTo(0.6 * sound.musicFadeGain(0.5), 2)
    expect(danger.paused).toBe(true)
    // Superseding requests during the fade only replace the successor.
    await sound.updateDirectedMusic('nearDefeat')
    expect(audible()).toEqual([normal])
    await vi.advanceTimersByTimeAsync(sound.MUSIC_FADE_OUT_MS / 2 + 100)
    const sad = sound.bgMusicAudio
    expect(sad.src).toBe('sound/music/music_defeat_sad.mp3')
    expect(normal.paused).toBe(true)
    expect(danger.paused).toBe(true)
    expect(audible()).toEqual([sad])
    // No fade-in: the new track starts directly at full master volume.
    expect(sad.volume).toBeCloseTo(0.6)
    expect(sad.loop).toBe(true)
  })

  it('pauses the fade-out with the game and stops everything on terminate', async() => {
    await sound.toggleBackgroundMusic()
    await flush()
    const normal = sound.bgMusicAudio
    vi.useFakeTimers()
    await sound.updateDirectedMusic('firstAttack')
    await vi.advanceTimersByTimeAsync(1000)
    sound.pauseAllSounds()
    await vi.advanceTimersByTimeAsync(10000)
    expect(FakeAudio.instances.every(audio => audio.paused)).toBe(true)
    sound.resumeAllSounds()
    expect(sound.bgMusicAudio).toBe(normal)
    expect(normal.paused).toBe(false)
    await vi.advanceTimersByTimeAsync(3000)
    expect(sound.bgMusicAudio.src).toBe('sound/music/music_attack_motivational.mp3')
    expect(normal.paused).toBe(true)
    sound.terminateAllSounds()
    expect(FakeAudio.instances.every(audio => audio.paused)).toBe(true)
  })

  it('fades out the playlist track near its end, then starts the next without overlap', async() => {
    await sound.toggleBackgroundMusic()
    await flush()
    const first = sound.bgMusicAudio
    sound.setMasterVolume(0.5)
    first.duration = 180
    first.currentTime = 177
    first.dispatchEvent(new window.Event('timeupdate'))
    await flush()
    expect(sound.bgMusicAudio).toBe(first)
    const second = FakeAudio.instances.find(audio => audio.src === 'sound/music/music02.mp3')
    expect(second.paused).toBe(true)
    first.finish()
    await flush()
    expect(sound.bgMusicAudio).toBe(second)
    expect(second.paused).toBe(false)
    expect(second.loop).toBe(false)
    expect(second.volume).toBeCloseTo(0.5)
  })
})
