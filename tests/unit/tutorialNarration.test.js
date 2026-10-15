import { describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { TUTORIAL_NARRATION_CLIPS } from '../../src/ui/tutorialSystem/narrationManifest.js'
import { TUTORIAL_MUSIC_DUCK, createTutorialNarrator, findTutorialNarrationClip, normalizeNarrationText } from '../../src/ui/tutorialSystem/narration.js'
import { buildTutorialSteps } from '../../src/ui/tutorialSystem/steps.js'
import { getSpokenTextForStep, resolveTutorialInputMethod } from '../../src/ui/tutorialSystem/helpers.js'

class FakeClip extends window.EventTarget {
  constructor(src, playResult = Promise.resolve()) {
    super()
    this.src = src
    this.volume = 1
    this.paused = true
    this.playResult = playResult
  }
  play() { this.paused = false; return this.playResult }
  pause() { this.paused = true }
}

function makeDeps(overrides = {}) {
  const clips = []
  const deps = {
    clips,
    duck: [],
    tts: [],
    createAudio: src => { const clip = new FakeClip(src, overrides.playResult); clips.push(clip); return clip },
    getVolume: () => 0.5,
    setDuck: factor => deps.duck.push(factor),
    speakTts: text => deps.tts.push(text),
    cancelTts: vi.fn(),
    ...overrides
  }
  return deps
}

describe('tutorial narration manifest', () => {
  it('has a normalized file on disk for every clip', () => {
    for (const clip of TUTORIAL_NARRATION_CLIPS) {
      expect(fs.existsSync(path.join('public', clip.file))).toBe(true)
      expect(clip.durationMs).toBeGreaterThan(1000)
    }
  })

  it('covers every step for mouse, touch and trackpad in both layouts', () => {
    for (const touchLayout of [false, true]) {
      document.body.classList.toggle('is-touch', touchLayout)
      for (const method of ['mouse-keyboard', 'touch', 'trackpad']) {
        for (const step of buildTutorialSteps()) {
          if (step.id === 'mobile-sidebar-gestures' && !touchLayout) continue
          const text = getSpokenTextForStep(step, method)
          expect(findTutorialNarrationClip(step.id, text), `${step.id} ${method} ${touchLayout}`).not.toBeNull()
        }
      }
    }
    document.body.classList.remove('is-touch')
  })

  // Regression: a player who skipped the input-method step has no preference.
  // Steps 7+ used the legacy copy then and fell back to browser TTS.
  it('resolves a clip for every step when no input method was chosen', () => {
    for (const touchLayout of [false, true]) {
      document.body.classList.toggle('is-touch', touchLayout)
      const method = resolveTutorialInputMethod(null)
      expect(method).toBe(touchLayout ? 'touch' : 'mouse-keyboard')
      for (const step of buildTutorialSteps()) {
        if (step.id === 'mobile-sidebar-gestures' && !touchLayout) continue
        const text = getSpokenTextForStep(step, method)
        expect(findTutorialNarrationClip(step.id, text), `${step.id} null ${touchLayout}`).not.toBeNull()
      }
    }
    document.body.classList.remove('is-touch')
    expect(resolveTutorialInputMethod('trackpad')).toBe('trackpad')
    expect(resolveTutorialInputMethod('bogus')).toBe('mouse-keyboard')
  })

  it('ignores whitespace and typographic punctuation differences', () => {
    const clip = TUTORIAL_NARRATION_CLIPS.find(c => c.step === 'welcome')
    expect(normalizeNarrationText('  a\n  b \u2019c\u2019 ')).toBe("a b 'c'")
    expect(findTutorialNarrationClip('welcome', `  ${clip.text.replace(/ /g, '  ')}\n`)).toBe(clip)
  })

  it('only matches the exact text for the step and English', () => {
    const clip = TUTORIAL_NARRATION_CLIPS[0]
    expect(findTutorialNarrationClip(clip.step, clip.text)).toBe(clip)
    expect(findTutorialNarrationClip(clip.step, `${clip.text} extra`)).toBeNull()
    expect(findTutorialNarrationClip('welcome', clip.text)).toBeNull()
    expect(findTutorialNarrationClip(clip.step, clip.text, { lang: 'de' })).toBeNull()
    expect(findTutorialNarrationClip(clip.step, clip.text, { lang: 'en-GB' })).toBe(clip)
  })
})

describe('tutorial narrator', () => {
  const clip = TUTORIAL_NARRATION_CLIPS.find(c => c.step === 'welcome')
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))

  it('plays the clip, ducks music and restores it when the clip ends', () => {
    const deps = makeDeps()
    const narrator = createTutorialNarrator(deps)
    expect(narrator.speak('welcome', clip.text)).toBe('clip')
    expect(deps.clips[0].src).toBe(clip.file)
    expect(deps.clips[0].volume).toBeCloseTo(0.475, 5)
    expect(deps.duck).toEqual([TUTORIAL_MUSIC_DUCK])
    expect(deps.tts).toEqual([])
    deps.clips[0].dispatchEvent(new window.Event('ended'))
    expect(deps.duck).toEqual([TUTORIAL_MUSIC_DUCK, 1])
    expect(narrator.isPlayingClip()).toBe(false)
  })

  it('falls back to TTS without a matching clip or for other languages', () => {
    const deps = makeDeps()
    const narrator = createTutorialNarrator(deps)
    expect(narrator.speak('welcome', 'Some custom text')).toBe('tts')
    expect(narrator.speak('welcome', clip.text, { lang: 'de' })).toBe('tts')
    expect(deps.tts).toEqual(['Some custom text', clip.text])
    expect(deps.clips).toHaveLength(0)
  })

  it('falls back to TTS when the file fails to load', () => {
    const deps = makeDeps()
    const narrator = createTutorialNarrator(deps)
    narrator.speak('welcome', clip.text)
    deps.clips[0].dispatchEvent(new window.Event('error'))
    expect(deps.tts).toEqual([clip.text])
    expect(deps.duck.at(-1)).toBe(1)
  })

  it('falls back to TTS when playback is rejected', async() => {
    const deps = makeDeps({ playResult: Promise.reject(new Error('blocked')) })
    const narrator = createTutorialNarrator(deps)
    narrator.speak('welcome', clip.text)
    await flush()
    expect(deps.tts).toEqual([clip.text])
  })

  it('stops the clip on the next step without a late fallback', () => {
    const deps = makeDeps()
    const narrator = createTutorialNarrator(deps)
    narrator.speak('welcome', clip.text)
    const first = deps.clips[0]
    narrator.stop()
    expect(first.paused).toBe(true)
    expect(deps.duck.at(-1)).toBe(1)
    first.dispatchEvent(new window.Event('error'))
    expect(deps.tts).toEqual([])
  })
})
