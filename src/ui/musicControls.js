// Sidebar music buttons: on/off toggle, deterministic "next song" and a custom
// tooltip (never a native title attribute) that shows the current song title
// on hover, keyboard focus or touch long-press.
import { toggleBackgroundMusic, skipToNextMusic, isMusicEnabled, getMusicTooltipText, onMusicTrackChange } from '../sound.js'
import { placeFloatingTip } from '../pwa/offlineController.js'

export const MUSIC_TOOLTIP_LONG_PRESS_MS = 450

export function setupMusicControls(doc = document) {
  const toggle = doc.getElementById('musicControl')
  const next = doc.getElementById('musicNextButton')
  const tip = doc.getElementById('musicTrackTip')
  if (!toggle) return null
  let activeAnchor = null
  let pressTimer = null
  let suppressClickFor = null

  const kindOf = anchor => (anchor === next ? 'next' : 'toggle')
  const syncIcon = () => {
    const icon = toggle.querySelector('.music-icon')
    if (icon) icon.textContent = isMusicEnabled() ? '🔇' : '♪'
    toggle.setAttribute('aria-pressed', isMusicEnabled() ? 'true' : 'false')
  }
  const showTip = anchor => {
    if (!tip) return
    activeAnchor = anchor
    tip.textContent = getMusicTooltipText(kindOf(anchor))
    placeFloatingTip(anchor, tip)
  }
  const hideTip = () => {
    activeAnchor = null
    clearTimeout(pressTimer)
    pressTimer = null
    if (tip) tip.hidden = true
  }
  const refresh = () => {
    syncIcon()
    if (activeAnchor && tip) {
      tip.textContent = getMusicTooltipText(kindOf(activeAnchor))
      placeFloatingTip(activeAnchor, tip)
    }
  }

  const wire = (button, action) => {
    if (!button) return
    button.removeAttribute('title')
    button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') showTip(button) })
    button.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') hideTip() })
    button.addEventListener('focus', () => {
      // Keyboard focus only; taps also focus buttons but use long-press instead.
      let keyboard = false
      try { keyboard = button.matches(':focus-visible') } catch { keyboard = false }
      if (keyboard) showTip(button)
    })
    button.addEventListener('blur', hideTip)
    button.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse') return
      clearTimeout(pressTimer)
      pressTimer = setTimeout(() => {
        pressTimer = null
        suppressClickFor = button
        showTip(button)
      }, MUSIC_TOOLTIP_LONG_PRESS_MS)
    })
    const endPress = event => {
      if (event.pointerType === 'mouse') return
      clearTimeout(pressTimer)
      pressTimer = null
      if (activeAnchor === button) setTimeout(hideTip, 1200)
    }
    button.addEventListener('pointerup', endPress)
    button.addEventListener('pointercancel', endPress)
    button.addEventListener('contextmenu', event => event.preventDefault())
    button.addEventListener('click', async event => {
      // A long-press only shows the title; it does not toggle or skip.
      if (suppressClickFor === button) {
        suppressClickFor = null
        event.preventDefault()
        return
      }
      await action()
      refresh()
    })
  }

  wire(toggle, () => toggleBackgroundMusic())
  wire(next, () => skipToNextMusic())
  onMusicTrackChange(refresh)
  syncIcon()
  return { refresh, showTip, hideTip }
}
