import { getMasterVolume, setMusicDuck } from '../sound.js'
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
    setDuck: factor => setMusicDuck(factor)
  }
}

export function startStoryIntro() {
  return playStoryIntro({ deps: storyDeps() })
}

// Called once the loading screen is gone.
export function maybeAutoPlayStoryIntro() {
  if (isMissionIntroOpen()) return false
  if (!shouldAutoPlayStoryIntro()) return false
  return startStoryIntro()
}

export function mountStoryIntroReplay(doc = document) {
  const button = doc.getElementById('storyIntroReplay')
  if (!button || button.dataset.bound) return
  button.dataset.bound = 'true'
  button.addEventListener('click', () => startStoryIntro())
}
