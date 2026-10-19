import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { gameState } from '../../src/gameState.js'
import { resetGameStorageForTests } from '../../src/storage/indexedDbStorage.js'
import {
  STORY_INTRO_MUSIC_DUCK,
  STORY_INTRO_MUSIC_RESTORE_MS,
  STORY_INTRO_STORAGE_KEY,
  closeStoryIntro,
  getActiveStoryIntroIndex,
  getStoryIntroStatus,
  isStoryIntroOpen,
  playStoryIntro,
  shouldAutoPlayStoryIntro
} from '../../src/story/storyIntro.js'
import { STORY_SEGMENTS, focusTransform, storyIntroTotalMs } from '../../src/story/storyIntroSegments.js'

function fakeDeps({ unlocked = true } = {}) {
  const timers = []
  const audios = []
  const ducks = []
  const music = { starts: 0, unlocks: 0, unlocked }
  return {
    timers,
    audios,
    ducks,
    music,
    deps: {
      loadClip: src => Promise.resolve({ src }),
      playClip: (clip, options) => {
        if (!music.unlocked) return null
        const handle = { src: clip.src, volume: options.volume, offsetSeconds: options.offsetSeconds, stop: vi.fn() }
        audios.push(handle)
        return handle
      },
      isAudioUnlocked: () => music.unlocked,
      hasUserActivation: () => music.unlocked,
      unlockAudio: () => {
        music.unlocks += 1
        return Promise.resolve(music.unlocked)
      },
      startMusic: () => { music.starts += 1 },
      getVolume: () => 0.5,
      now: () => 0,
      setDuck: factor => ducks.push(factor),
      setTimer: (fn, ms) => {
        timers.push({ fn, ms })
        return timers.length
      },
      clearTimer: () => {}
    }
  }
}

async function flush() {
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

function fireLatestTimer(timers) {
  timers[timers.length - 1].fn()
}

describe('story intro', () => {
  beforeEach(() => {
    resetGameStorageForTests({})
    gameState.gamePaused = false
    gameState.gameOver = false
  })

  afterEach(() => {
    closeStoryIntro('skipped')
    document.getElementById('story-intro')?.remove()
    gameState.gamePaused = false
  })

  it('[U04308] walks the newspaper sections in reading order', () => {
    expect(STORY_SEGMENTS.map(s => s.id)).toEqual([
      'headline', 'photo', 'global-powers', 'front-lines',
      'kyronite-power', 'ai-war-machines', 'voices-of-concern', 'ticker'
    ])
    const total = storyIntroTotalMs()
    expect(total).toBeGreaterThan(45000)
    expect(total).toBeLessThan(85000)
  })

  it('[U04309] advances each segment after its measured clip duration and plays its own clip without further gestures', async() => {
    const { deps, timers, audios, ducks } = fakeDeps()
    const seen = []
    playStoryIntro({ fromGesture: true, deps, gapMs: 400, onSegment: segment => seen.push(segment.id) })
    expect(isStoryIntroOpen()).toBe(true)
    expect(gameState.gamePaused).toBe(true)
    expect(ducks[0]).toBe(STORY_INTRO_MUSIC_DUCK)
    expect(timers[0].ms).toBe(STORY_SEGMENTS[0].durationMs + 400)
    await flush()
    expect(audios[0].src).toBe(STORY_SEGMENTS[0].audio)
    expect(audios[0].volume).toBeCloseTo(0.5)
    for (let i = 1; i < STORY_SEGMENTS.length; i++) {
      fireLatestTimer(timers)
      await flush()
      expect(getActiveStoryIntroIndex()).toBe(i)
      expect(timers[timers.length - 1].ms).toBe(STORY_SEGMENTS[i].durationMs + 400)
      expect(audios[i].src).toBe(STORY_SEGMENTS[i].audio)
      expect(audios[i - 1].stop).toHaveBeenCalled()
    }
    expect(seen).toEqual(STORY_SEGMENTS.map(s => s.id))
    fireLatestTimer(timers)
    expect(isStoryIntroOpen()).toBe(false)
    expect(getStoryIntroStatus()).toBe('seen')
    expect(ducks).toEqual([STORY_INTRO_MUSIC_DUCK])
    expect(gameState.gamePaused).toBe(false)
  })

  it('[U04310] skips with Escape, the skip button or a tap and remembers it', () => {
    const run = trigger => {
      resetGameStorageForTests({})
      const { deps } = fakeDeps()
      playStoryIntro({ fromGesture: true, deps })
      trigger(document.getElementById('story-intro'))
      expect(isStoryIntroOpen()).toBe(false)
      expect(getStoryIntroStatus()).toBe('skipped')
      expect(shouldAutoPlayStoryIntro({ search: '', webdriver: false, remote: false })).toBe(false)
    }
    run(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })))
    run(root => root.querySelector('.story-intro__skip').click())
    run(root => root.querySelector('.story-intro__stage').click())
  })

  it('[U04311] only autoplays on a fresh first play outside automation', () => {
    const base = { search: '', webdriver: false, remote: false, status: null }
    expect(shouldAutoPlayStoryIntro(base)).toBe(true)
    expect(shouldAutoPlayStoryIntro({ ...base, status: 'seen' })).toBe(false)
    expect(shouldAutoPlayStoryIntro({ ...base, webdriver: true })).toBe(false)
    expect(shouldAutoPlayStoryIntro({ ...base, webdriver: true, search: '?storyIntro=1' })).toBe(true)
    expect(shouldAutoPlayStoryIntro({ ...base, search: '?storyIntro=0' })).toBe(false)
    expect(shouldAutoPlayStoryIntro({ ...base, remote: true })).toBe(false)
    expect(STORY_INTRO_STORAGE_KEY).toMatch(/story-intro/)
  })

  it('[U04312] waits on a Start intro button while audio is locked; pressing it starts narration and music together', async() => {
    const { deps, timers, audios, music, ducks } = fakeDeps({ unlocked: false })
    playStoryIntro({ deps, withMusic: true })
    await flush()
    expect(document.querySelector('.story-intro__sound')).toBeNull()
    const start = document.querySelector('.story-intro__start-btn')
    expect(start).not.toBeNull()
    expect(start.textContent).toMatch(/Start intro/i)
    expect(start.hasAttribute('title')).toBe(false)
    // The timeline has not started: no timer, no clip, no music, no section.
    expect(timers).toHaveLength(0)
    expect(audios).toHaveLength(0)
    expect(music.starts).toBe(0)
    expect(getActiveStoryIntroIndex()).toBe(-1)
    // Tapping the dimmed newspaper does not skip while waiting.
    document.querySelector('.story-intro__stage').click()
    expect(isStoryIntroOpen()).toBe(true)

    music.unlocked = true
    start.click()
    await flush()
    expect(document.querySelector('.story-intro__start-btn')).toBeNull()
    expect(music.unlocks).toBeGreaterThanOrEqual(2)
    expect(music.starts).toBe(1)
    expect(ducks).toContain(STORY_INTRO_MUSIC_DUCK)
    expect(getActiveStoryIntroIndex()).toBe(0)
    expect(audios.map(a => a.src)).toEqual([STORY_SEGMENTS[0].audio])

    // Later segments continue with no additional gesture.
    fireLatestTimer(timers)
    await flush()
    fireLatestTimer(timers)
    await flush()
    expect(audios.map(a => a.src)).toEqual(STORY_SEGMENTS.slice(0, 3).map(s => s.audio))

    document.querySelector('.story-intro__stage').click()
    expect(isStoryIntroOpen()).toBe(false)
  })

  it('[U04313] keeps Skip and Escape available while waiting for Start', () => {
    const { deps } = fakeDeps({ unlocked: false })
    playStoryIntro({ deps, withMusic: true })
    document.querySelector('.story-intro__skip').click()
    expect(isStoryIntroOpen()).toBe(false)
    playStoryIntro({ deps, withMusic: true })
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
    expect(isStoryIntroOpen()).toBe(false)
  })

  it('[U04314] replays from a sidebar click straight away, without the button', async() => {
    const { deps, audios } = fakeDeps()
    playStoryIntro({ fromGesture: true, deps })
    await flush()
    expect(document.querySelector('.story-intro__start-btn')).toBeNull()
    expect(getActiveStoryIntroIndex()).toBe(0)
    expect(audios).toHaveLength(1)
  })

  it('[U04315] always shows the Start intro button on the automatic intro, even when audio looks unlocked', async() => {
    const { deps, timers, audios, music } = fakeDeps({ unlocked: true })
    playStoryIntro({ deps, withMusic: true })
    await flush()
    expect(document.querySelector('.story-intro__start-btn')).not.toBeNull()
    expect(timers).toHaveLength(0)
    expect(audios).toHaveLength(0)
    expect(music.starts).toBe(0)
    document.querySelector('.story-intro__start-btn').click()
    await flush()
    expect(music.starts).toBe(1)
    expect(audios).toHaveLength(1)
  })

  it('[U04316] keeps music ducked throughout narration and restores it smoothly afterwards', async() => {
    const { deps, timers, ducks } = fakeDeps()
    const ramps = []
    deps.rampDuck = (target, ms) => ramps.push({ target, ms })
    const segments = [
      { id: 'a', audio: 'a.mp3', durationMs: 10000, focus: STORY_SEGMENTS[0].focus, caption: 'a' },
      { id: 'b', audio: 'b.mp3', durationMs: 5000, focus: STORY_SEGMENTS[0].focus, caption: 'b' }
    ]
    playStoryIntro({ fromGesture: true, deps, segments, gapMs: 500 })
    expect(STORY_INTRO_MUSIC_DUCK).toBeGreaterThanOrEqual(0.25)
    expect(STORY_INTRO_MUSIC_DUCK).toBeLessThanOrEqual(0.3)
    expect(ducks[0]).toBe(STORY_INTRO_MUSIC_DUCK)
    expect(ramps).toEqual([])
    fireLatestTimer(timers)
    await flush()
    fireLatestTimer(timers)
    expect(ramps).toEqual([{ target: 1, ms: STORY_INTRO_MUSIC_RESTORE_MS }])
  })

  it('[U04317] fits and centers the focus rectangle', () => {
    const { scale, tx, ty } = focusTransform({ x: 100, y: 200, w: 400, h: 100 }, 800, 600, 1)
    expect(scale).toBe(2)
    expect(tx + 300 * scale).toBeCloseTo(400)
    expect(ty + 250 * scale).toBeCloseTo(300)
  })
})

describe('story intro hand-off', () => {
  it('[U04318] announces closing so the tutorial can start afterwards', () => {
    resetGameStorageForTests({})
    const { deps } = fakeDeps()
    const listener = vi.fn()
    window.addEventListener('story-intro-closed', listener, { once: true })
    playStoryIntro({ fromGesture: true, deps })
    closeStoryIntro('skipped')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].detail.status).toBe('skipped')
  })
})
