import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { gameState } from '../../src/gameState.js'
import { resetGameStorageForTests } from '../../src/storage/indexedDbStorage.js'
import {
  STORY_INTRO_MUSIC_DUCK,
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

  it('walks the newspaper sections in reading order', () => {
    expect(STORY_SEGMENTS.map(s => s.id)).toEqual([
      'headline', 'photo', 'global-powers', 'front-lines',
      'kyronite-power', 'ai-war-machines', 'voices-of-concern', 'ticker'
    ])
    const total = storyIntroTotalMs()
    expect(total).toBeGreaterThan(45000)
    expect(total).toBeLessThan(85000)
  })

  it('advances each segment after its measured clip duration and plays its own clip without further gestures', async() => {
    const { deps, timers, audios, ducks } = fakeDeps()
    const seen = []
    playStoryIntro({ deps, gapMs: 400, onSegment: segment => seen.push(segment.id) })
    expect(isStoryIntroOpen()).toBe(true)
    expect(gameState.gamePaused).toBe(true)
    expect(ducks[0]).toBe(STORY_INTRO_MUSIC_DUCK)
    expect(timers[0].ms).toBe(STORY_SEGMENTS[0].durationMs + 400)
    await flush()
    expect(audios[0].src).toBe(STORY_SEGMENTS[0].audio)
    expect(audios[0].volume).toBeCloseTo(0.45)
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
    expect(ducks[ducks.length - 1]).toBe(1)
    expect(gameState.gamePaused).toBe(false)
  })

  it('skips with Escape, the skip button or a tap and remembers it', () => {
    const run = trigger => {
      resetGameStorageForTests({})
      const { deps } = fakeDeps()
      playStoryIntro({ deps })
      trigger(document.getElementById('story-intro'))
      expect(isStoryIntroOpen()).toBe(false)
      expect(getStoryIntroStatus()).toBe('skipped')
      expect(shouldAutoPlayStoryIntro({ search: '', webdriver: false, remote: false })).toBe(false)
    }
    run(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })))
    run(root => root.querySelector('.story-intro__skip').click())
    run(root => root.querySelector('.story-intro__stage').click())
  })

  it('only autoplays on a fresh first play outside automation', () => {
    const base = { search: '', webdriver: false, remote: false, status: null }
    expect(shouldAutoPlayStoryIntro(base)).toBe(true)
    expect(shouldAutoPlayStoryIntro({ ...base, status: 'seen' })).toBe(false)
    expect(shouldAutoPlayStoryIntro({ ...base, webdriver: true })).toBe(false)
    expect(shouldAutoPlayStoryIntro({ ...base, webdriver: true, search: '?storyIntro=1' })).toBe(true)
    expect(shouldAutoPlayStoryIntro({ ...base, search: '?storyIntro=0' })).toBe(false)
    expect(shouldAutoPlayStoryIntro({ ...base, remote: true })).toBe(false)
    expect(STORY_INTRO_STORAGE_KEY).toMatch(/story-intro/)
  })

  it('keeps the timeline running while audio is locked and starts narration and music at the first gesture', async() => {
    const { deps, timers, audios, music, ducks } = fakeDeps({ unlocked: false })
    playStoryIntro({ deps, withMusic: true })
    await flush()
    expect(document.querySelector('.story-intro__sound')).toBeNull()
    expect(audios).toHaveLength(0)
    expect(music.starts).toBe(0)
    fireLatestTimer(timers)
    expect(getActiveStoryIntroIndex()).toBe(1)

    // First tap on the newspaper unlocks audio instead of skipping.
    music.unlocked = true
    const stage = document.querySelector('.story-intro__stage')
    stage.dispatchEvent(new window.Event('pointerdown', { bubbles: true }))
    stage.click()
    await flush()
    expect(isStoryIntroOpen()).toBe(true)
    expect(music.starts).toBeGreaterThanOrEqual(1)
    expect(ducks).toContain(STORY_INTRO_MUSIC_DUCK)
    expect(audios.map(a => a.src)).toEqual([STORY_SEGMENTS[1].audio])

    // Later segments continue with no additional gesture.
    fireLatestTimer(timers)
    await flush()
    fireLatestTimer(timers)
    await flush()
    expect(audios.map(a => a.src)).toEqual(STORY_SEGMENTS.slice(1, 4).map(s => s.audio))

    // A second tap skips as before.
    stage.click()
    expect(isStoryIntroOpen()).toBe(false)
  })

  it('starts the intro music immediately when audio is already unlocked', () => {
    const { deps, music } = fakeDeps()
    playStoryIntro({ deps, withMusic: true })
    expect(music.starts).toBe(1)
    expect(document.querySelector('.story-intro__sound')).toBeNull()
    expect(document.querySelector('#story-intro button').textContent).toMatch(/Skip/i)
  })

  it('fits and centers the focus rectangle', () => {
    const { scale, tx, ty } = focusTransform({ x: 100, y: 200, w: 400, h: 100 }, 800, 600, 1)
    expect(scale).toBe(2)
    expect(tx + 300 * scale).toBeCloseTo(400)
    expect(ty + 250 * scale).toBeCloseTo(300)
  })
})

describe('story intro hand-off', () => {
  it('announces closing so the tutorial can start afterwards', () => {
    resetGameStorageForTests({})
    const { deps } = fakeDeps()
    const listener = vi.fn()
    window.addEventListener('story-intro-closed', listener, { once: true })
    playStoryIntro({ deps })
    closeStoryIntro('skipped')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].detail.status).toBe('skipped')
  })
})
