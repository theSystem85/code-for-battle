import { TUTORIAL_NARRATION_CLIPS } from './narrationManifest.js'

// Music level while a tutorial voice clip plays (same idea as the story intro).
export const TUTORIAL_MUSIC_DUCK = 0.35
// Same relative narration gain as the story intro (see NARRATION_GAIN).
export const TUTORIAL_VOICE_GAIN = 1

// Only English has recorded clips; the tutorial copy is English-only today, so
// any other language falls back to browser TTS.
export function isNarrationLanguage(lang) {
  return !lang || /^en\b/i.test(String(lang))
}

// Whitespace and typographic quote/dash differences must not cost a clip.
export function normalizeNarrationText(text) {
  return String(text ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function findTutorialNarrationClip(stepId, text, { lang = 'en', clips = TUTORIAL_NARRATION_CLIPS } = {}) {
  if (!stepId || !text || !isNarrationLanguage(lang)) return null
  const spoken = normalizeNarrationText(text)
  return clips.find(clip => clip.step === stepId && normalizeNarrationText(clip.text) === spoken) || null
}

// Plays the recorded narrator clip for a step and falls back to the existing
// browser TTS when no clip matches, the file fails to load, or playback is
// rejected. Music is ducked only while a clip is audible.
export function createTutorialNarrator(deps) {
  let current = null

  const release = state => {
    if (!state || state.released) return
    state.released = true
    deps.setDuck(1)
    if (current === state) current = null
  }

  const stop = () => {
    const state = current
    current = null
    if (state) {
      state.stopped = true
      try {
        state.audio.pause()
        state.audio.src = ''
      } catch {
        // Ignore teardown errors.
      }
      release(state)
    }
    deps.cancelTts()
  }

  const fallback = (state, text) => {
    if (state.stopped || state.fellBack) return
    state.fellBack = true
    release(state)
    deps.speakTts(text)
  }

  const speak = (stepId, text, options = {}) => {
    stop()
    const clip = findTutorialNarrationClip(stepId, text, { lang: options.lang, clips: options.clips })
    if (!clip) {
      deps.speakTts(text)
      return 'tts'
    }
    let audio
    try {
      audio = deps.createAudio(clip.file)
    } catch {
      deps.speakTts(text)
      return 'tts'
    }
    const state = { audio, clip, stopped: false, released: false, fellBack: false }
    current = state
    if (!deps.routeVoice?.(audio, TUTORIAL_VOICE_GAIN)) {
      audio.volume = Math.max(0, Math.min(1, deps.getVolume() * TUTORIAL_VOICE_GAIN))
    }
    audio.addEventListener?.('ended', () => {
      if (state.stopped || state.fellBack || current !== state) return
      release(state)
      deps.onEnd?.()
    })
    audio.addEventListener?.('error', () => fallback(state, text))
    deps.setDuck(TUTORIAL_MUSIC_DUCK)
    let playing
    try {
      playing = audio.play?.()
    } catch {
      fallback(state, text)
      return 'tts'
    }
    if (playing && typeof playing.catch === 'function') {
      playing.catch(() => fallback(state, text))
    }
    return 'clip'
  }

  return {
    speak,
    stop,
    isPlayingClip: () => Boolean(current && !current.released)
  }
}
