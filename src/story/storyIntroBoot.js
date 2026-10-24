import {
  FIRST_GAMEPLAY_MUSIC_FILE,
  STORY_INTRO_MUSIC_FILE,
  getMusicDebugState,
  getSharedAudioContext,
  hasUserActivation,
  isAudioUnlocked,
  loadNarrationBuffer,
  playNarrationBuffer,
  primeMusicElementInGesture,
  unlockAudioContext,
  isMusicFilePlaying,
  playDefaultGameplayMusic,
  playFirstGameplayMusic,
  playMusicCue,
  rampMusicDuck,
  setMusicDuck,
  setMusicPauseExempt
} from '../sound.js'
import { suppressNextFirstAttackTheme } from '../audio/musicDirector.js'
import { isMissionIntroOpen } from '../ui/missionIntro.js'
import { playStoryIntro, shouldAutoPlayStoryIntro } from './storyIntro.js'

// Per-segment playback log for debugging autoplay problems; also exposed to
// Playwright via window.__storyIntroAudioLog.
function logStoryAudio(entry) {
  const record = { t: Math.round(performance.now()), ...entry, music: getMusicDebugState() }
  if (typeof window !== 'undefined') {
    window.__storyIntroAudioLog = window.__storyIntroAudioLog || []
    window.__storyIntroAudioLog.push(record)
  }
}

// Plays a decoded clip once the shared context is actually running (a resume
// started inside the unlocking gesture may still be settling).
function playClipWhenReady(buffer, options) {
  const ctx = getSharedAudioContext()
  if (!ctx) return null
  if (ctx.state === 'running') return playNarrationBuffer(buffer, options)
  let handle = null
  let cancelled = false
  const startedAt = performance.now()
  unlockAudioContext().then(running => {
    if (!running || cancelled) return
    const waited = (performance.now() - startedAt) / 1000
    handle = playNarrationBuffer(buffer, { ...options, offsetSeconds: (options.offsetSeconds || 0) + waited })
  })
  return { stop: () => { cancelled = true; handle?.stop() } }
}

function storyDeps() {
  return {
    loadClip: src => loadNarrationBuffer(src),
    playClip: (buffer, options) => playClipWhenReady(buffer, options),
    isAudioUnlocked: () => isAudioUnlocked(),
    hasUserActivation: () => hasUserActivation(),
    // Runs inside every gesture during the intro, so it also primes the music
    // elements that iOS would otherwise refuse to start later.
    unlockAudio: () => {
      primeMusicElementInGesture(STORY_INTRO_MUSIC_FILE)
      primeMusicElementInGesture(FIRST_GAMEPLAY_MUSIC_FILE)
      return unlockAudioContext()
    },
    // The intro pauses the game; keep the audio context and music alive.
    setAudioHold: hold => setMusicPauseExempt(hold),
    log: logStoryAudio,
    // Relative: playNarrationBuffer applies master x balance live.
    getVolume: () => 1,
    setDuck: factor => setMusicDuck(factor),
    rampDuck: (target, ms) => rampMusicDuck(target, ms),
    // First Strike under the first-launch intro, ducked by setDuck while the
    // narration runs. The game is paused meanwhile, so music is exempted from
    // the pause handler until the intro closes.
    startMusic: () => {
      if (isMusicFilePlaying(STORY_INTRO_MUSIC_FILE)) return
      playMusicCue(STORY_INTRO_MUSIC_FILE).then(started => {
        if (started) suppressNextFirstAttackTheme()
      })
    },
    // Closing the first intro hands over to Battle Track 02: First Strike fades
    // out for the full 3 s, then Battle Track 02 starts at full volume.
    endMusic: withMusic => {
      if (withMusic) playFirstGameplayMusic()
    }
  }
}

export function startStoryIntro(options = {}) {
  return playStoryIntro({ deps: storyDeps(), withMusic: Boolean(options.withMusic), fromGesture: Boolean(options.fromGesture) })
}

// Called once the loading screen is gone. The automatic first-launch intro
// brings its own music; other sessions start gameplay music on the first gesture.
export function maybeAutoPlayStoryIntro() {
  if (!isMissionIntroOpen() && shouldAutoPlayStoryIntro()) {
    return startStoryIntro({ withMusic: true })
  }
  armFirstGameplayMusic()
  return false
}

// Browsers block audio before the first user gesture, so without an intro the
// default music waits for the first tap, click or key press.
function armFirstGameplayMusic(win = window) {
  const events = ['pointerdown', 'keydown']
  const start = () => {
    events.forEach(type => win.removeEventListener(type, start, true))
    playDefaultGameplayMusic()
  }
  events.forEach(type => win.addEventListener(type, start, true))
}

export function mountStoryIntroReplay(doc = document) {
  const button = doc.getElementById('storyIntroReplay')
  if (!button || button.dataset.bound) return
  button.dataset.bound = 'true'
  button.addEventListener('click', () => startStoryIntro({ fromGesture: true }))
}
