const LLM_SETTINGS_KEY = 'rts_llm_settings'

export const DEFAULT_LLM_SETTINGS = {
  strategic: {
    enabled: false,
    tickSeconds: 60,
    provider: 'openai',
    verbosity: 'minimal',
    maxActions: 50
  },
  commentary: {
    enabled: false,
    provider: 'openai',
    promptOverride: '',
    ttsEnabled: true,
    voiceName: ''
  },
  providers: {
    openai: {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: '',
      riskAccepted: false
    },
    inceptionlabs: {
      apiKey: '',
      baseUrl: 'https://api.inceptionlabs.ai/v1',
      model: '',
      riskAccepted: false
    },
    anthropic: {
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      model: '',
      riskAccepted: false
    },
    xai: {
      apiKey: '',
      baseUrl: 'https://api.x.ai/v1',
      model: '',
      riskAccepted: false
    },
    ollama: {
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      model: '',
      riskAccepted: false
    }
  },
  strategicModelPool: []
}

let currentSettings = null

function mergeSettings(base, patch) {
  if (!patch || typeof patch !== 'object') return base
  const merged = { ...base }
  Object.entries(patch).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = mergeSettings(base[key] || {}, value)
    } else if (value !== undefined) {
      merged[key] = value
    }
  })
  return merged
}

export function loadLlmSettings() {
  if (currentSettings) return currentSettings
  let stored = null
  try {
    const raw = localStorage.getItem(LLM_SETTINGS_KEY)
    stored = raw ? JSON.parse(raw) : null
  } catch (err) {
    window.logger.warn('[LLM] Failed to parse stored settings:', err)
  }
  currentSettings = mergeSettings(DEFAULT_LLM_SETTINGS, stored || {})
  return currentSettings
}

export function saveLlmSettings(settings) {
  currentSettings = mergeSettings(DEFAULT_LLM_SETTINGS, settings || {})
  try {
    localStorage.setItem(LLM_SETTINGS_KEY, JSON.stringify(currentSettings))
  } catch (err) {
    window.logger.warn('[LLM] Failed to save settings:', err)
  }
  return currentSettings
}

export function updateLlmSettings(patch) {
  const existing = loadLlmSettings()
  return saveLlmSettings(mergeSettings(existing, patch))
}

export function getLlmSettings() {
  return loadLlmSettings()
}

export function getProviderSettings(providerId) {
  const settings = loadLlmSettings()
  return settings.providers?.[providerId] || null
}

export { LLM_SETTINGS_KEY }
