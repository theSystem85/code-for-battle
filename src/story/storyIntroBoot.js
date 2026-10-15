import {
  STORY_INTRO_MUSIC_FILE,
  getMasterVolume,
  isMusicFilePlaying,
  hasPlayedFirstGameplayMusic,
  playFirstGameplayMusic,
  playMusicCue,
  setMusicDuck,
  setMusicPauseExempt
} from '../sound.js'
import { suppressNextFirstAttackTheme } from '../audio/musicDirector.js'
import { isMissionIntroOpen } from '../ui/missionIntro.js'
import { configureAudioElement } from '../pwa/audioElementPolicy.js'
import { playStoryIntro, shouldAutoPlayStoryIntro } from './storyIntro.js'

function storyDeps() {
  return {
    createAudio: src => {
      const audio = new Audio(src)
      configureAudioElement(audio, src, window.location.origin)
      return audio
    },
    getVolume: () => getMasterVolume(),
    setDuck: factor => setMusicDuck(factor),
    // First Strike under the first-launch intro, ducked by setDuck while the
    // narration runs. The game is paused meanwhile, so music is exempted from
    // the pause handler until the intro closes.
    startMusic: () => {
      setMusicPauseExempt(true)
      if (isMusicFilePlaying(STORY_INTRO_MUSIC_FILE)) return
      playMusicCue(STORY_INTRO_MUSIC_FILE).then(started => {
        if (started) suppressNextFirstAttackTheme()
      })
    },
    // Closing the first intro hands over to Battle Track 02: First Strike fades
    // out for the full 3 s, then Battle Track 02 starts at full volume.
    endMusic: withMusic => {
      setMusicPauseExempt(false)
      if (withMusic) playFirstGameplayMusic()
    }
  }
}

export function startStoryIntro(options = {}) {
  return playStoryIntro({ deps: storyDeps(), withMusic: Boolean(options.withMusic) })
}

// Called once the loading screen is gone. The automatic first-launch intro
// brings its own music; when no intro plays, the first gameplay session still
// opens with Battle Track 02 (once per device).
export function maybeAutoPlayStoryIntro() {
  if (!isMissionIntroOpen() && shouldAutoPlayStoryIntro()) {
    return startStoryIntro({ withMusic: true })
  }
  armFirstGameplayMusic()
  return false
}

// Browsers block audio before the first user gesture, so without an intro the
// Battle Track 02 cue waits for the first tap, click or key press.
function armFirstGameplayMusic(win = window) {
  if (hasPlayedFirstGameplayMusic()) return
  const events = ['pointerdown', 'keydown']
  const start = () => {
    events.forEach(type => win.removeEventListener(type, start, true))
    playFirstGameplayMusic()
  }
  events.forEach(type => win.addEventListener(type, start, true))
}

export function mountStoryIntroReplay(doc = document) {
  const button = doc.getElementById('storyIntroReplay')
  if (!button || button.dataset.bound) return
  button.dataset.bound = 'true'
  button.addEventListener('click', () => startStoryIntro())
}
