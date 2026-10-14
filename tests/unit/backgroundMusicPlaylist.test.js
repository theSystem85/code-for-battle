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
  it('crossfades situational loops, preserves toggle on resume, and scales both volumes', async() => {
    await sound.toggleBackgroundMusic()
    await flush()
    const normal = sound.bgMusicAudio
    // Load first with real timers; then advance the audio ramp deterministically.
    await sound.updateDirectedMusic('firstAttack')
    const attack = sound.bgMusicAudio
    expect(attack.src).toBe('sound/music/music_attack_motivational.mp3')
    expect(attack.loop).toBe(true)
    expect(attack.volume).toBe(0)
    expect(normal.paused).toBe(false)
    sound.setMasterVolume(0.4)
    expect(normal.volume).toBeCloseTo(0.4)
    sound.pauseAllSounds()
    expect(normal.paused).toBe(true)
    expect(attack.paused).toBe(true)
    sound.resumeAllSounds()
    expect(attack.paused).toBe(false)
    await sound.toggleBackgroundMusic()
    sound.pauseAllSounds()
    sound.resumeAllSounds()
    expect(attack.paused).toBe(true)
    await sound.updateDirectedMusic('nearDefeat')
    expect(sound.bgMusicAudio).toBe(attack)
    await sound.toggleBackgroundMusic()
    await sound.updateDirectedMusic('nearDefeat')
    expect(sound.bgMusicAudio.src).toBe('sound/music/music_defeat_sad.mp3')
    sound.terminateAllSounds()
    expect(FakeAudio.instances.every(audio => audio.paused)).toBe(true)
  })

  it('finishes its 3.5 second volume ramp and stops the outgoing track', async() => {
    await sound.toggleBackgroundMusic()
    await flush()
    const normal = sound.bgMusicAudio
    vi.useFakeTimers()
    await sound.updateDirectedMusic('underAttackOutnumbered')
    sound.setMasterVolume(0.6)
    await vi.advanceTimersByTimeAsync(1750)
    expect(sound.bgMusicAudio.volume).toBeCloseTo(0.3)
    expect(normal.volume).toBeCloseTo(0.3)
    await vi.advanceTimersByTimeAsync(1800)
    expect(sound.bgMusicAudio.volume).toBeCloseTo(0.6)
    expect(normal.paused).toBe(true)
  })

  it('starts a normal playlist crossfade before the outgoing track ends', async() => {
    await sound.toggleBackgroundMusic()
    await flush()
    const first = sound.bgMusicAudio
    first.duration = 180
    first.currentTime = 177
    first.dispatchEvent(new window.Event('timeupdate'))
    await flush()
    expect(sound.bgMusicAudio.src).toBe('sound/music/music02.mp3')
    expect(sound.bgMusicAudio.loop).toBe(false)
    expect(first.paused).toBe(false)
    expect(sound.bgMusicAudio.volume).toBe(0)
  })

})
