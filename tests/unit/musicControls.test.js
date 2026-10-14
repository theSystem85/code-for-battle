import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/sound.js', () => ({
  toggleBackgroundMusic: vi.fn(async() => {}),
  skipToNextMusic: vi.fn(async() => 'music02.mp3'),
  isMusicEnabled: vi.fn(() => true),
  getMusicTooltipText: vi.fn(kind => (kind === 'next'
    ? 'Now playing: Battle Track 02 · Next: First Strike (Attack Theme)'
    : 'Now playing: Battle Track 02')),
  onMusicTrackChange: vi.fn()
}))

describe('sidebar music controls', () => {
  let sound
  let mod
  beforeEach(async() => {
    document.body.innerHTML = `
      <button id="musicControl" title="Toggle Music"><span class="music-icon">♪</span></button>
      <button id="musicNextButton"><span class="music-next-icon">⏭</span></button>
      <div id="musicTrackTip" class="offline-mode-tip" role="tooltip" hidden></div>`
    sound = await import('../../src/sound.js')
    mod = await import('../../src/ui/musicControls.js')
    mod.setupMusicControls(document)
  })
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

  const pointer = (el, type, pointerType) => {
    const event = new window.Event(type, { bubbles: true })
    event.pointerType = pointerType
    el.dispatchEvent(event)
  }

  it('uses the custom tooltip, never a native title attribute', () => {
    const toggle = document.getElementById('musicControl')
    expect(toggle.hasAttribute('title')).toBe(false)
    expect(document.getElementById('musicNextButton').hasAttribute('title')).toBe(false)
    pointer(toggle, 'pointerenter', 'mouse')
    const tip = document.getElementById('musicTrackTip')
    expect(tip.hidden).toBe(false)
    expect(tip.textContent).toBe('Now playing: Battle Track 02')
    pointer(toggle, 'pointerleave', 'mouse')
    expect(tip.hidden).toBe(true)
  })

  it('shows the title on touch long-press without skipping', async() => {
    vi.useFakeTimers()
    const next = document.getElementById('musicNextButton')
    pointer(next, 'pointerdown', 'touch')
    vi.advanceTimersByTime(mod.MUSIC_TOOLTIP_LONG_PRESS_MS + 10)
    const tip = document.getElementById('musicTrackTip')
    expect(tip.hidden).toBe(false)
    expect(tip.textContent).toContain('Next: First Strike (Attack Theme)')
    pointer(next, 'pointerup', 'touch')
    next.click()
    expect(sound.skipToNextMusic).not.toHaveBeenCalled()
    next.click()
    expect(sound.skipToNextMusic).toHaveBeenCalledTimes(1)
  })
})
