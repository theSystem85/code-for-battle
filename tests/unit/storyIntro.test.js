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

function fakeDeps() {
  const timers = []
  const audios = []
  const ducks = []
  return {
    timers,
    audios,
    ducks,
    deps: {
      createAudio: src => {
        const audio = { src, volume: 1, paused: false, play: vi.fn(() => Promise.resolve()), pause: vi.fn() }
        audios.push(audio)
        return audio
      },
      getVolume: () => 0.5,
      setDuck: factor => ducks.push(factor),
      setTimer: (fn, ms) => {
        timers.push({ fn, ms })
        return timers.length
      },
      clearTimer: () => {}
    }
  }
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

  it('advances each segment after its measured clip duration and plays its own clip', () => {
    const { deps, timers, audios, ducks } = fakeDeps()
    const seen = []
    playStoryIntro({ deps, gapMs: 400, onSegment: segment => seen.push(segment.id) })
    expect(isStoryIntroOpen()).toBe(true)
    expect(gameState.gamePaused).toBe(true)
    expect(ducks[0]).toBe(STORY_INTRO_MUSIC_DUCK)
    expect(timers[0].ms).toBe(STORY_SEGMENTS[0].durationMs + 400)
    expect(audios[0].src).toBe(STORY_SEGMENTS[0].audio)
    expect(audios[0].volume).toBeCloseTo(0.475)
    for (let i = 1; i < STORY_SEGMENTS.length; i++) {
      fireLatestTimer(timers)
      expect(getActiveStoryIntroIndex()).toBe(i)
      expect(timers[timers.length - 1].ms).toBe(STORY_SEGMENTS[i].durationMs + 400)
      expect(audios[i].src).toBe(STORY_SEGMENTS[i].audio)
      expect(audios[i - 1].pause).toHaveBeenCalled()
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

  it('keeps the timeline running silently when autoplay is blocked', async() => {
    const { deps, timers } = fakeDeps()
    deps.createAudio = src => ({
      src,
      volume: 1,
      pause: () => {},
      play: () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
    })
    playStoryIntro({ deps })
    await Promise.resolve()
    await Promise.resolve()
    const sound = document.querySelector('.story-intro__sound')
    expect(sound.hidden).toBe(false)
    fireLatestTimer(timers)
    expect(getActiveStoryIntroIndex()).toBe(1)
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
