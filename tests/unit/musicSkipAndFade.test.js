import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MUSIC_SKIP_ORDER, getNextSkipTrack } from '../../src/audio/musicDirector.js'

class FakeAudio extends window.EventTarget {
  constructor(src) {
    super()
    this.src = src
    this.paused = true
    this.currentTime = 0
    this.volume = 1
    this.loop = false
    FakeAudio.instances.push(this)
  }
  load() { Promise.resolve().then(() => this.dispatchEvent(new window.Event('canplaythrough'))) }
  play() { this.paused = false; return Promise.resolve() }
  pause() { this.paused = true }
  finish() { this.paused = true; this.dispatchEvent(new window.Event('ended')) }
}
FakeAudio.instances = []
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('music skip order', () => {
  it('[U03122] walks playlist tracks then situational themes in a fixed order and wraps around', () => {
    expect(MUSIC_SKIP_ORDER).toEqual([
      'music01.mp3', 'music02.mp3', 'music03.mp3', 'music04.mp3', 'music05.mp3',
      'music_attack_motivational.mp3',
      'music_under_attack_danger.mp3', 'music_defeat_sad.mp3'
    ])
    let file = null
    const visited = []
    for (let i = 0; i < MUSIC_SKIP_ORDER.length + 1; i++) { file = getNextSkipTrack(file); visited.push(file) }
    expect(visited).toEqual([...MUSIC_SKIP_ORDER, 'music01.mp3'])
  })
})

describe('music skip, tooltip and fade', () => {
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

  it('[U03123] fades over the full 3 s with a gradual, monotonic curve', () => {
    expect(sound.MUSIC_FADE_OUT_MS).toBe(3000)
    const samples = Array.from({ length: 31 }, (_, i) => sound.musicFadeGain(i / 30))
    expect(samples[0]).toBe(1)
    expect(samples[30]).toBe(0)
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeLessThan(samples[i - 1])
    // Audibly spread: still clearly present at the 1 s mark, quiet before the end.
    expect(sound.musicFadeGain(1 / 3)).toBeGreaterThan(0.15)
    expect(sound.musicFadeGain(0.9)).toBeLessThan(0.02)
  })

  it('[U03124] keeps the old track audible for the whole fade before a mood change', async() => {
    await sound.toggleBackgroundMusic()
    await flush()
    const normal = sound.bgMusicAudio
    vi.useFakeTimers()
    await sound.updateDirectedMusic('firstAttack')
    await vi.advanceTimersByTimeAsync(2800)
    expect(sound.bgMusicAudio).toBe(normal)
    expect(normal.paused).toBe(false)
    expect(normal.volume).toBeGreaterThan(0)
    // A repeated director request must not restart or shorten the fade.
    await sound.updateDirectedMusic('firstAttack')
    await vi.advanceTimersByTimeAsync(300)
    expect(sound.bgMusicAudio.src).toBe('sound/music/music_attack_motivational.mp3')
    expect(normal.paused).toBe(true)
  })

  it('[U03125] skips in order with a fade, plays the manual pick once, then resumes the mood', async() => {
    await sound.toggleBackgroundMusic()
    await flush()
    expect(sound.bgMusicAudio.src).toBe('sound/music/music01.mp3')
    expect(sound.getMusicTooltipText('toggle')).toBe('Now playing: Veil of Shadows (Remix)')
    expect(sound.getMusicTooltipText('next')).toBe('Now playing: Veil of Shadows (Remix) · Next: Battle Track 02')
    vi.useFakeTimers()
    await sound.skipToNextMusic()
    await vi.advanceTimersByTimeAsync(sound.MUSIC_FADE_OUT_MS + 100)
    expect(sound.bgMusicAudio.src).toBe('sound/music/music02.mp3')
    expect(sound.getMusicTooltipText('next')).toBe('Now playing: Battle Track 02 · Next: Iron Veil (Industrial Theme)')
    await sound.skipToNextMusic()
    await vi.advanceTimersByTimeAsync(sound.MUSIC_FADE_OUT_MS + 100)
    const manual = sound.bgMusicAudio
    expect(manual.src).toBe('sound/music/music03.mp3')
    expect(manual.loop).toBe(false)
    expect(sound.getMusicTooltipText('toggle')).toBe('Now playing: Iron Veil (Industrial Theme)')
    // Mood is still normal: when the manual pick ends, a playlist track follows.
    manual.finish()
    await vi.advanceTimersByTimeAsync(50)
    expect(sound.bgMusicAudio.src).toMatch(/music0[1-5]\.mp3$/)
    expect(sound.bgMusicAudio.paused).toBe(false)
  })

  it('[U03126] turns music on when next is pressed while music is off', async() => {
    expect(sound.getMusicTooltipText('toggle')).toBe('Music off')
    await sound.skipToNextMusic()
    await flush()
    expect(sound.isMusicEnabled()).toBe(true)
    expect(sound.bgMusicAudio.paused).toBe(false)
  })
})
