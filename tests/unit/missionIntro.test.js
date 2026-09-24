import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { gameState } from '../../src/gameState.js'
import { LANDING_LOCALE_STORAGE_KEY } from '../../src/landing/landingLocale.js'
import {
  dismissMissionIntro,
  flushQueuedMissionIntro,
  isMissionIntroOpen,
  missionIntroAssetPath,
  playMissionIntro,
  queueMissionIntro
} from '../../src/ui/missionIntro.js'

const mission = {
  id: 'Mission_01',
  labelKey: 'missions.mission01.label',
  descriptionKey: 'missions.mission01.description',
  objectiveKeys: [
    'missions.mission01.objectives.power',
    'missions.mission01.objectives.economy',
    'missions.mission01.objectives.fight'
  ],
  label: 'Mission 01: Fordline',
  description: 'Secure the Ashford ford.',
  introVideo: 'mission_01_intro.mp4',
  introAudio: 'mission_01_intro.mp3'
}

function resetIntro() {
  queueMissionIntro(null)
  dismissMissionIntro()
  gameState.gamePaused = false
  gameState.gameOver = false
  gameState.multiplayerSession = null
  document.getElementById('mission-intro')?.remove()
  localStorage.removeItem(LANDING_LOCALE_STORAGE_KEY)
}

describe('mission intro', () => {
  beforeEach(() => {
    resetIntro()
  })

  afterEach(() => {
    resetIntro()
  })

  it('points at the public video path and does not open without a clip name', async() => {
    expect(missionIntroAssetPath('mission_01_intro.mp4')).toBe('/video/mission_01_intro.mp4')
    gameState.gamePaused = false
    queueMissionIntro({ id: 'Full_Base_Test', label: 'Full Base Test' })
    await flushQueuedMissionIntro()
    expect(isMissionIntroOpen()).toBe(false)
    expect(gameState.gamePaused).toBe(false)
  })

  it('shows the localized briefing when the video file is missing', async() => {
    localStorage.setItem(LANDING_LOCALE_STORAGE_KEY, 'de')
    const played = await playMissionIntro(mission, { loadTimeoutMs: 20 })
    const root = document.getElementById('mission-intro')

    expect(played).toBe(false)
    expect(root.dataset.mode).toBe('briefing')
    expect(root.textContent).toContain('Furtlinie')
    expect(root.textContent).toContain('Überspringen')
    expect(gameState.gamePaused).toBe(true)

    root.querySelector('.mission-intro__skip').click()
    expect(isMissionIntroOpen()).toBe(false)
    expect(gameState.gamePaused).toBe(false)
  })

  it('plays a loaded clip once and closes on Escape', async() => {
    const played = await playMissionIntro(mission, {
      loadVideo: async(video) => {
        video.play = () => Promise.resolve()
      }
    })
    const root = document.getElementById('mission-intro')
    const video = root.querySelector('.mission-intro__video')

    expect(played).toBe(true)
    expect(root.dataset.mode).toBe('video')
    expect(video.hidden).toBe(false)
    expect(gameState.gamePaused).toBe(true)

    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(isMissionIntroOpen()).toBe(false)
    expect(gameState.gamePaused).toBe(false)
  })

  it('waits for the loading screen to finish before opening a queued intro', async() => {
    queueMissionIntro(mission)
    expect(isMissionIntroOpen()).toBe(false)
    expect(gameState.gamePaused).toBe(true)

    await flushQueuedMissionIntro({ loadTimeoutMs: 20 })
    expect(isMissionIntroOpen()).toBe(true)
  })
})
