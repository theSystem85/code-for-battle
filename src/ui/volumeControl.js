import { getMasterVolume, playSound, setMasterVolume } from '../sound.js'

function syncMasterVolume(volumeSlider, volumeValue) {
  const volumePercent = Number.parseInt(volumeSlider.value, 10)
  const safePercent = Number.isFinite(volumePercent) ? volumePercent : 0
  setMasterVolume(safePercent / 100)
  volumeValue.textContent = `${safePercent}%`
  return safePercent
}

/**
 * Live-updates master volume while the slider moves, and plays the preview
 * sample only when the pointer or key is released.
 */
export function initMasterVolumeControl(doc = document) {
  const volumeSlider = doc.getElementById('masterVolumeSlider')
  const volumeValue = doc.getElementById('volumeValue')
  if (!volumeSlider || !volumeValue) return

  const currentVolume = Math.round(getMasterVolume() * 100)
  volumeSlider.value = String(currentVolume)
  volumeValue.textContent = `${currentVolume}%`

  let previewArmed = false

  const armPreview = () => {
    const safePercent = syncMasterVolume(volumeSlider, volumeValue)
    previewArmed = safePercent > 0
  }

  const playPreviewIfArmed = () => {
    if (!previewArmed) return
    previewArmed = false
    playSound('confirmed', 0.3)
  }

  volumeSlider.addEventListener('input', armPreview)
  volumeSlider.addEventListener('change', playPreviewIfArmed)
  volumeSlider.addEventListener('mouseup', playPreviewIfArmed)
  volumeSlider.addEventListener('touchend', playPreviewIfArmed)
  volumeSlider.addEventListener('pointerup', playPreviewIfArmed)
  volumeSlider.addEventListener('keyup', playPreviewIfArmed)
}
