import { describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { TUTORIAL_NARRATION_CLIPS } from '../../src/ui/tutorialSystem/narrationManifest.js'
import { TUTORIAL_MUSIC_DUCK, createTutorialNarrator, findTutorialNarrationClip, normalizeNarrationText } from '../../src/ui/tutorialSystem/narration.js'
import { keybindingManager } from '../../src/input/keybindings.js'
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
  it('[U04499] has a normalized file on disk for every clip', () => {
    for (const clip of TUTORIAL_NARRATION_CLIPS) {
      expect(fs.existsSync(path.join('public', clip.file))).toBe(true)
      expect(clip.durationMs).toBeGreaterThan(1000)
      if (clip.file.includes('-guided-')) {
        const sources = JSON.parse(fs.readFileSync('docs/tutorial-narration-recordings.json', 'utf8'))
        const source = sources.find(source => clip.file.endsWith(`/${source.filename}`))
        expect(source).toBeDefined()
        expect(clip.text).toBe(source.prompt)
        expect(clip.durationMs).toBe(Math.round(source.duration * 1000))
        expect(fs.readFileSync(path.join('public', clip.file)).length).toBeGreaterThan(100000)
      }
    }
  })

  it('[U04500] narrates every default mouse, trackpad and touch step with an exact local recording', () => {
    for (const touchLayout of [false, true]) {
      document.body.classList.toggle('is-touch', touchLayout)
      for (const method of ['mouse-keyboard', 'touch', 'trackpad']) {
        for (const step of buildTutorialSteps()) {
          if (step.id === 'mobile-sidebar-gestures' && !touchLayout) continue
          const text = getSpokenTextForStep(step, method)
          const clip = findTutorialNarrationClip(step.id, text)
          const deps = makeDeps()
          const narrator = createTutorialNarrator(deps)
          expect(clip, `${method}: ${step.id}: ${text}`).not.toBeNull()
          expect(narrator.speak(step.id, text)).toBe('clip')
          expect(deps.clips[0].src).toBe(clip.file)
          expect(deps.clips[0].paused).toBe(false)
          expect(deps.tts).toEqual([])
        }
      }
    }
    document.body.classList.remove('is-touch')
  })


  it('[U05490] selects the exact guided file for each replaced script and input variant', () => {
    const names = ['welcome', 'build-power', 'build-refinery', 'build-vehicle-factory', 'build-harvester', 'select-group', 'tank-rally', 'tank-control', 'crew-system', 'tech-tree', 'settings-help']
    for (const method of ['mouse-keyboard', 'trackpad', 'touch']) {
      for (const [index, id] of names.entries()) {
        const step = buildTutorialSteps().find(step => step.id === id)
        const text = getSpokenTextForStep(step, method)
        const clip = findTutorialNarrationClip(id, text)
        const variant = method === 'touch' && index === 5 ? 11 : method === 'touch' && index === 6 ? 12 : index
        const filename = method === 'touch' && id === 'tank-control' ? 'tank-control-2.mp3' : `${id}-guided-${variant}.mp3`
        expect(clip?.file, `${method}: ${id}`).toBe(`/sound/tutorial/${filename}`)
      }
    }
  })

  it('[U05491] falls back for custom keybindings instead of playing a stale default script', () => {
    const step = buildTutorialSteps().find(step => step.id === 'tank-control')
    const original = getSpokenTextForStep(step, 'mouse-keyboard')
    const binding = vi.spyOn(keybindingManager, 'getBindingsByDevice').mockReturnValue([{ id: 'remote-fire', input: 'KeyF' }])
    try {
      const text = getSpokenTextForStep(step, 'mouse-keyboard')
      expect(text).not.toBe(original)
      expect(findTutorialNarrationClip(step.id, text)).toBeNull()
      const deps = makeDeps()
      expect(createTutorialNarrator(deps).speak(step.id, text)).toBe('tts')
      expect(deps.tts).toEqual([text])
    } finally { binding.mockRestore() }
  })

  // Regression: a player who skipped the input-method step has no preference.
  // Steps 7+ used the legacy copy then and fell back to browser TTS.
  it('[U04501] resolves recorded narration when no input method was chosen', () => {
    for (const touchLayout of [false, true]) {
      document.body.classList.toggle('is-touch', touchLayout)
      const method = resolveTutorialInputMethod(null)
      expect(method).toBe(touchLayout ? 'touch' : 'mouse-keyboard')
      for (const step of buildTutorialSteps()) {
        if (step.id === 'mobile-sidebar-gestures' && !touchLayout) continue
        const text = getSpokenTextForStep(step, method)
        const clip = findTutorialNarrationClip(step.id, text)
        const deps = makeDeps()
        expect(clip, `${method}: ${step.id}`).not.toBeNull()
        expect(createTutorialNarrator(deps).speak(step.id, text)).toBe('clip')
        expect(deps.tts).toEqual([])
      }
    }
    document.body.classList.remove('is-touch')
    expect(resolveTutorialInputMethod('trackpad')).toBe('trackpad')
    expect(resolveTutorialInputMethod('bogus')).toBe('mouse-keyboard')
  })

  it('[U04502] ignores whitespace and typographic punctuation differences', () => {
    const clip = TUTORIAL_NARRATION_CLIPS.find(c => c.step === 'welcome')
    expect(normalizeNarrationText('  a\n  b \u2019c\u2019 ')).toBe("a b 'c'")
    expect(findTutorialNarrationClip('welcome', `  ${clip.text.replace(/ /g, '  ')}\n`)).toBe(clip)
  })

  it('[U04503] only matches the exact text for the step and English', () => {
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

  it('[U04504] plays the clip, ducks music and restores it when the clip ends', () => {
    const deps = makeDeps()
    const narrator = createTutorialNarrator(deps)
    expect(narrator.speak('welcome', clip.text)).toBe('clip')
    expect(deps.clips[0].src).toBe(clip.file)
    expect(deps.clips[0].volume).toBeCloseTo(0.5, 5)
    expect(deps.duck).toEqual([TUTORIAL_MUSIC_DUCK])
    expect(deps.tts).toEqual([])
    deps.clips[0].dispatchEvent(new window.Event('ended'))
    expect(deps.duck).toEqual([TUTORIAL_MUSIC_DUCK, 1])
    expect(narrator.isPlayingClip()).toBe(false)
  })

  it('[U04505] falls back to TTS without a matching clip or for other languages', () => {
    const deps = makeDeps()
    const narrator = createTutorialNarrator(deps)
    expect(narrator.speak('welcome', 'Some custom text')).toBe('tts')
    expect(narrator.speak('welcome', clip.text, { lang: 'de' })).toBe('tts')
    expect(deps.tts).toEqual(['Some custom text', clip.text])
    expect(deps.clips).toHaveLength(0)
  })

  it('[U04506] falls back to TTS when the file fails to load', () => {
    const deps = makeDeps()
    const narrator = createTutorialNarrator(deps)
    narrator.speak('welcome', clip.text)
    deps.clips[0].dispatchEvent(new window.Event('error'))
    expect(deps.tts).toEqual([clip.text])
    expect(deps.duck.at(-1)).toBe(1)
  })

  it('[U04507] falls back to TTS when playback is rejected', async() => {
    const deps = makeDeps({ playResult: Promise.reject(new Error('blocked')) })
    const narrator = createTutorialNarrator(deps)
    narrator.speak('welcome', clip.text)
    await flush()
    expect(deps.tts).toEqual([clip.text])
  })

  it('[U05473] ignores ended events from a stopped clip after a new narration starts', () => {
    const onEnd = vi.fn()
    const deps = makeDeps({ onEnd })
    const narrator = createTutorialNarrator(deps)
    narrator.speak('welcome', clip.text)
    const old = deps.clips[0]
    narrator.speak('welcome', clip.text)
    old.dispatchEvent(new window.Event('ended'))
    expect(onEnd).not.toHaveBeenCalled()
    expect(narrator.isPlayingClip()).toBe(true)
    deps.clips[1].dispatchEvent(new window.Event('ended'))
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('[U04508] stops the clip on the next step without a late fallback', () => {
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
