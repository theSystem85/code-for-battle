// settingsModal.js
// Tabbed settings modal that hosts runtime config shortcuts and the keybindings editor

import { runtimeConfigDialog } from './runtimeConfigDialog.js'
import { renderKeybindingsEditor } from './keybindingsEditor.js'
import { initLlmSettingsPanel } from './llmSettingsPanel.js'
import { gameState } from '../gameState.js'
import { getConfigValue, setConfigValue } from '../configRegistry.js'

const RADAR_OFFLINE_ANIMATION_SETTINGS_KEY = 'rts_radar_offline_animation'
const WATER_SETTINGS_CONFIG_IDS = {
  enabled: 'proceduralWaterRendering',
  tone: 'waterEffectTone',
  saturation: 'waterEffectSaturation',
  pixelDensity: 'mobileCanvasPixelRatioCap'
}

function formatWaterTone(value) {
  const percentage = Math.round(Number(value) * 100)
  if (percentage > 0) {
    return `+${percentage}%`
  }
  return `${percentage}%`
}

function formatWaterSaturation(value) {
  return `${Math.round(Number(value) * 100)}%`
}

function formatPixelDensity(value) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    return '1x'
  }
  const deviceRatio = window.devicePixelRatio || 1
  if (numericValue >= deviceRatio) {
    return `Native (${deviceRatio.toFixed(2).replace(/\.?0+$/, '')}x)`
  }
  return `${numericValue.toFixed(2).replace(/\.?0+$/, '')}x`
}

function syncWaterGraphicsControls(modal) {
  const enabledToggle = modal.querySelector('#settingsProceduralWaterToggle')
  const toneInput = modal.querySelector('#settingsWaterToneRange')
  const saturationInput = modal.querySelector('#settingsWaterSaturationRange')
  const pixelDensityInput = modal.querySelector('#settingsMobilePixelDensityRange')
  const toneValue = modal.querySelector('#settingsWaterToneValue')
  const saturationValue = modal.querySelector('#settingsWaterSaturationValue')
  const pixelDensityValue = modal.querySelector('#settingsMobilePixelDensityValue')

  if (enabledToggle) {
    enabledToggle.checked = Boolean(getConfigValue(WATER_SETTINGS_CONFIG_IDS.enabled))
  }

  if (toneInput) {
    const tone = Number(getConfigValue(WATER_SETTINGS_CONFIG_IDS.tone) ?? 0)
    toneInput.value = String(tone)
    toneInput.disabled = !enabledToggle?.checked
    if (toneValue) {
      toneValue.textContent = formatWaterTone(tone)
    }
  }

  if (saturationInput) {
    const saturation = Number(getConfigValue(WATER_SETTINGS_CONFIG_IDS.saturation) ?? 1)
    saturationInput.value = String(saturation)
    saturationInput.disabled = !enabledToggle?.checked
    if (saturationValue) {
      saturationValue.textContent = formatWaterSaturation(saturation)
    }
  }

  if (pixelDensityInput) {
    const pixelDensity = Number(getConfigValue(WATER_SETTINGS_CONFIG_IDS.pixelDensity) ?? 1)
    pixelDensityInput.value = String(pixelDensity)
    if (pixelDensityValue) {
      pixelDensityValue.textContent = formatPixelDensity(pixelDensity)
    }
  }
}

function loadRadarOfflineAnimationSetting() {
  try {
    const stored = localStorage.getItem(RADAR_OFFLINE_ANIMATION_SETTINGS_KEY)
    if (stored === null) return true
    return stored !== 'false'
  } catch (error) {
    window.logger.warn('Failed to load radar-offline animation setting:', error)
    return true
  }
}

function saveRadarOfflineAnimationSetting(enabled) {
  try {
    localStorage.setItem(RADAR_OFFLINE_ANIMATION_SETTINGS_KEY, enabled ? 'true' : 'false')
  } catch (error) {
    window.logger.warn('Failed to save radar-offline animation setting:', error)
  }
}

function setActiveTab(modal, tabId) {
  const tabs = modal.querySelectorAll('[data-config-tab]')
  const panels = modal.querySelectorAll('[data-config-tab-panel]')
  tabs.forEach(tab => {
    const isActive = tab.dataset.configTab === tabId
    tab.classList.toggle('config-modal__tab--active', isActive)
    tab.setAttribute('aria-selected', isActive)
  })
  panels.forEach(panel => {
    const isActive = panel.dataset.configTabPanel === tabId
    panel.classList.toggle('config-modal__content--active', isActive)
    panel.hidden = !isActive
  })
}

function bindTabs(modal) {
  modal.querySelectorAll('[data-config-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.configTab
      setActiveTab(modal, tabId)
    })
  })
}

function openModal(modal, defaultTab = 'keybindings') {
  setActiveTab(modal, defaultTab)
  modal.classList.add('config-modal--open')
  modal.setAttribute('aria-hidden', 'false')
  document.body.classList.add('config-modal-open')
  const keybindingsPanel = modal.querySelector('[data-config-tab-panel="keybindings"]')
  const frameLimiterToggle = modal.querySelector('#settingsFrameLimiterToggle')
  const radarOfflineAnimationToggle = modal.querySelector('#settingsRadarOfflineAnimationToggle')
  if (frameLimiterToggle) {
    frameLimiterToggle.checked = gameState.frameLimiterEnabled !== false
  }
  if (radarOfflineAnimationToggle) {
    radarOfflineAnimationToggle.checked = gameState.radarOfflineAnimationEnabled !== false
  }
  syncWaterGraphicsControls(modal)
  if (keybindingsPanel) {
    renderKeybindingsEditor(keybindingsPanel)
  }
}

function closeModal(modal) {
  modal.classList.remove('config-modal--open')
  modal.setAttribute('aria-hidden', 'true')
  document.body.classList.remove('config-modal-open')
}

export function openSettingsModal(defaultTab = 'keybindings') {
  const modal = document.getElementById('configSettingsModal')
  if (!modal) return
  openModal(modal, defaultTab)
}

export function closeSettingsModal() {
  const modal = document.getElementById('configSettingsModal')
  if (!modal) return
  closeModal(modal)
}

export function initSettingsModal() {
  const modal = document.getElementById('configSettingsModal')
  const closeBtn = document.getElementById('configModalCloseBtn')
  const runtimeLaunchBtn = document.getElementById('openRuntimeConfigDialogBtn')
  const frameLimiterToggle = document.getElementById('settingsFrameLimiterToggle')
  const radarOfflineAnimationToggle = document.getElementById('settingsRadarOfflineAnimationToggle')
  const proceduralWaterToggle = document.getElementById('settingsProceduralWaterToggle')
  const waterToneRange = document.getElementById('settingsWaterToneRange')
  const waterSaturationRange = document.getElementById('settingsWaterSaturationRange')
  const mobilePixelDensityRange = document.getElementById('settingsMobilePixelDensityRange')

  if (!modal) return

  gameState.radarOfflineAnimationEnabled = loadRadarOfflineAnimationSetting()

  bindTabs(modal)
  initLlmSettingsPanel()

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeModal(modal))
  }

  modal.addEventListener('click', event => {
    if (event.target === modal) {
      closeModal(modal)
    }
  })

  if (runtimeLaunchBtn) {
    runtimeLaunchBtn.addEventListener('click', () => {
      runtimeConfigDialog.openDialog()
    })
  }

  if (frameLimiterToggle) {
    frameLimiterToggle.checked = gameState.frameLimiterEnabled !== false
    frameLimiterToggle.addEventListener('change', (event) => {
      gameState.frameLimiterEnabled = event.target.checked
    })
  }

  if (radarOfflineAnimationToggle) {
    radarOfflineAnimationToggle.checked = gameState.radarOfflineAnimationEnabled !== false
    radarOfflineAnimationToggle.addEventListener('change', (event) => {
      const enabled = event.target.checked
      gameState.radarOfflineAnimationEnabled = enabled
      saveRadarOfflineAnimationSetting(enabled)
    })
  }

  if (proceduralWaterToggle) {
    proceduralWaterToggle.checked = Boolean(getConfigValue(WATER_SETTINGS_CONFIG_IDS.enabled))
    proceduralWaterToggle.addEventListener('change', (event) => {
      setConfigValue(WATER_SETTINGS_CONFIG_IDS.enabled, event.target.checked)
      syncWaterGraphicsControls(modal)
    })
  }

  if (waterToneRange) {
    waterToneRange.value = String(getConfigValue(WATER_SETTINGS_CONFIG_IDS.tone) ?? 0)
    waterToneRange.addEventListener('input', (event) => {
      setConfigValue(WATER_SETTINGS_CONFIG_IDS.tone, Number(event.target.value))
      syncWaterGraphicsControls(modal)
    })
  }

  if (waterSaturationRange) {
    waterSaturationRange.value = String(getConfigValue(WATER_SETTINGS_CONFIG_IDS.saturation) ?? 1)
    waterSaturationRange.addEventListener('input', (event) => {
      setConfigValue(WATER_SETTINGS_CONFIG_IDS.saturation, Number(event.target.value))
      syncWaterGraphicsControls(modal)
    })
  }

  if (mobilePixelDensityRange) {
    mobilePixelDensityRange.value = String(getConfigValue(WATER_SETTINGS_CONFIG_IDS.pixelDensity) ?? 1)
    mobilePixelDensityRange.addEventListener('input', (event) => {
      setConfigValue(WATER_SETTINGS_CONFIG_IDS.pixelDensity, Number(event.target.value))
      syncWaterGraphicsControls(modal)
    })
  }

  syncWaterGraphicsControls(modal)
}
