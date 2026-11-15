import { playSound } from '../sound.js'

export function playUiToggle(enabled, volume = 0.55) {
  playSound(enabled ? 'uiToggleOn' : 'uiToggleOff', volume)
}
