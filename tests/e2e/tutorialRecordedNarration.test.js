import { expect, test } from '@playwright/test'

// Run with npm run test:e2e:narration (a dedicated app-audio-enabled server).
// A regular Chrome UA bypasses the application's HeadlessChrome mute guard;
// Chromium's output-device mute can remain on while native media still decodes.
test.use({ userAgent: 'Mozilla/5.0 Chrome/145.0.0.0 Safari/537.36' })

test('[E00235] plays every installed guided recording through the tutorial with native audio', async({ page }) => {
  await page.goto('/?seed=41&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.tutorialSystem)
  await page.mouse.click(10, 10)
  await page.evaluate(async() => {
    const { setMasterVolume, unlockAudioContext } = await import('/src/sound.js')
    setMasterVolume(0.5)
    await unlockAudioContext()
    const { isHeadlessAudioMuted } = await import('/src/utils/headlessAudioMute.js')
    if (isHeadlessAudioMuted()) throw new Error('Recorded playback verification requires application audio unmuted')
    const t = window.tutorialSystem
    t.stop()
    t.settings.speechEnabled = true
    t.settings.showTutorial = true
    // Hold tasks open so native audio can finish without starting another clip.
    t.steps = t.steps.map(step => ({ ...step, completion: () => false }))
    t.active = true
    t.showUI()
    t.speakWithTts = () => { throw new Error('Default guided recording unexpectedly fell back to TTS') }
    const narrator = t.getNarrator()
    const originalSpeak = narrator.speak
    narrator.speak = (...args) => {
      const result = originalSpeak(...args)
      if (result !== 'clip') throw new Error(`Expected recording for ${args[0]}`)
      return result
    }
    // Observe native HTMLAudioElements without replacing play() or media events.
    const NativeAudio = window.Audio
    window.Audio = function(src) {
      const audio = new NativeAudio(src)
      if (src?.includes('/sound/tutorial/')) {
        window.testNarrationAudio = audio
        audio.playbackRate = 8
      }
      return audio
    }
  })
  const variants = [
    ['mouse-keyboard', 'welcome', 0], ['mouse-keyboard', 'build-power', 1],
    ['mouse-keyboard', 'build-refinery', 2], ['mouse-keyboard', 'build-vehicle-factory', 3],
    ['mouse-keyboard', 'build-harvester', 4], ['mouse-keyboard', 'select-group', 5],
    ['mouse-keyboard', 'tank-rally', 6], ['mouse-keyboard', 'tank-control', 7],
    ['mouse-keyboard', 'crew-system', 8], ['mouse-keyboard', 'tech-tree', 9],
    ['mouse-keyboard', 'settings-help', 10], ['touch', 'select-group', 11], ['touch', 'tank-rally', 12]
  ]
  for (const [method, id, index] of variants) {
    await page.evaluate(({ method, id }) => {
      const t = window.tutorialSystem
      t.stopSpeech()
      t.settings.preferredInputMethod = method
      t.stepIndex = t.steps.findIndex(step => step.id === id)
      t.runCurrentStep()
    }, { method, id })
    await expect.poll(() => page.evaluate(() => {
      const a = window.testNarrationAudio
      return a && !a.muted && a.volume > 0 && !a.paused && a.currentTime > 0 && a.readyState >= 2
    })).toBe(true)
    expect(await page.evaluate(() => new URL(window.testNarrationAudio.src).pathname)).toBe(`/sound/tutorial/${id}-guided-${index}.mp3`)
    await page.waitForFunction(() => window.testNarrationAudio.ended)
    expect(await page.evaluate(() => window.tutorialSystem.speaking)).toBe(false)
  }
  await page.evaluate(() => window.tutorialSystem.stop())
})
