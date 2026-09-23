import { beforeEach, describe, expect, it, vi } from 'vitest'

const playSound = vi.fn()
const setMasterVolume = vi.fn()
const getMasterVolume = vi.fn(() => 0.5)

vi.mock('../../src/sound.js', () => ({
  playSound: (...args) => playSound(...args),
  setMasterVolume: (...args) => setMasterVolume(...args),
  getMasterVolume: (...args) => getMasterVolume(...args)
}))

import { initMasterVolumeControl } from '../../src/ui/volumeControl.js'

function mountSlider(value = '50') {
  document.body.innerHTML = `
    <div id="volumeControl">
      <span id="volumeValue">50%</span>
      <input type="range" id="masterVolumeSlider" min="0" max="100" value="${value}">
    </div>
  `
  return {
    slider: document.getElementById('masterVolumeSlider'),
    label: document.getElementById('volumeValue')
  }
}

describe('master volume preview', () => {
  beforeEach(() => {
    playSound.mockClear()
    setMasterVolume.mockClear()
    getMasterVolume.mockReset()
    getMasterVolume.mockReturnValue(0.5)
  })

  it('updates volume while dragging and plays the sample only on release', () => {
    const { slider, label } = mountSlider('50')
    initMasterVolumeControl()

    slider.value = '70'
    slider.dispatchEvent(new window.Event('input'))
    slider.value = '80'
    slider.dispatchEvent(new window.Event('input'))

    expect(setMasterVolume).toHaveBeenCalledWith(0.8)
    expect(label.textContent).toBe('80%')
    expect(playSound).not.toHaveBeenCalled()

    slider.dispatchEvent(new window.Event('mouseup'))
    expect(playSound).toHaveBeenCalledTimes(1)
    expect(playSound).toHaveBeenCalledWith('confirmed', 0.3)

    slider.dispatchEvent(new window.Event('change'))
    slider.dispatchEvent(new window.Event('pointerup'))
    slider.dispatchEvent(new window.Event('touchend'))
    expect(playSound).toHaveBeenCalledTimes(1)
  })

  it('plays once when the change event is the release signal', () => {
    const { slider } = mountSlider('40')
    initMasterVolumeControl()
    playSound.mockClear()

    slider.value = '55'
    slider.dispatchEvent(new window.Event('input'))
    slider.dispatchEvent(new window.Event('change'))
    slider.dispatchEvent(new window.Event('keyup'))

    expect(playSound).toHaveBeenCalledTimes(1)
  })

  it('does not preview when the released volume is zero', () => {
    const { slider } = mountSlider('20')
    initMasterVolumeControl()
    playSound.mockClear()

    slider.value = '0'
    slider.dispatchEvent(new window.Event('input'))
    slider.dispatchEvent(new window.Event('pointerup'))
    slider.dispatchEvent(new window.Event('change'))

    expect(setMasterVolume).toHaveBeenCalledWith(0)
    expect(playSound).not.toHaveBeenCalled()
  })
})
