import { describe, expect, it } from 'vitest'
import { bindMixBalanceControl, formatMixBalance } from '../../src/ui/settingsModal.js'
import { getEffectsVolume, getMixBalance, getMusicVolume, setMasterVolume, setMixBalance } from '../../src/sound.js'

describe('sound effects / music ratio setting', () => {
  it('[U02984] formats the balance compactly', () => {
    expect(formatMixBalance(50)).toBe('Equal')
    expect(formatMixBalance(75)).toBe('SFX 50% / Music 100%')
    expect(formatMixBalance(0)).toBe('SFX 100% / Music 0%')
  })

  it('[U02985] binds the slider, applies it live and uses no native title tooltip', () => {
    setMixBalance(50)
    setMasterVolume(1)
    const root = document.createElement('div')
    root.innerHTML = `
      <label class="config-modal__field--mix"><span id="settingsMixBalanceValue"></span>
      <input type="range" id="settingsMixBalanceRange" min="0" max="100" value="50">
      <span class="config-modal__mix-tip" role="tooltip">tip</span></label>`
    bindMixBalanceControl(root)
    const range = root.querySelector('#settingsMixBalanceRange')
    expect(root.querySelector('#settingsMixBalanceValue').textContent).toBe('Equal')
    range.value = '25'
    range.dispatchEvent(new window.Event('input'))
    expect(getMixBalance()).toBe(25)
    expect(getMusicVolume()).toBeCloseTo(0.5)
    expect(getEffectsVolume()).toBeCloseTo(1)
    expect(root.querySelector('#settingsMixBalanceValue').textContent).toBe('SFX 100% / Music 50%')
    expect(root.querySelector('[title]')).toBeNull()
    setMixBalance(25)
  })

  it('[U02986] labels the default Music 50% / SFX 100%', () => {
    expect(formatMixBalance(25)).toBe('SFX 100% / Music 50%')
  })
})
