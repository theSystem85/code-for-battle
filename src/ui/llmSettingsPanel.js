import { getLlmSettings, updateLlmSettings } from '../ai/llmSettings.js'
import { fetchCostMap, fetchModelList, formatModelCost, getModelCostInfo } from '../ai/llmProviders.js'
import { showNotification } from './notifications.js'

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'inceptionlabs', label: 'InceptionLabs' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'xai', label: 'xAI' },
  { id: 'ollama', label: 'Ollama' }
]

const ENABLED_PROVIDER_IDS = new Set(['openai', 'inceptionlabs'])
const PROVIDERS_REQUIRING_KEY = new Set(['openai', 'inceptionlabs', 'anthropic', 'xai'])

const modelCacheByProvider = new Map()

function emitLlmModelPoolChanged() {
  if (typeof document === 'undefined') return
  document.dispatchEvent(new CustomEvent('llmModelPoolChanged'))
}

function setSelectOptions(select, options, placeholder = 'Select model') {
  if (!select) return
  select.innerHTML = ''
  const first = document.createElement('option')
  first.value = ''
  first.textContent = placeholder
  select.appendChild(first)
  options.forEach(option => {
    const next = document.createElement('option')
    next.value = option.value
    next.textContent = option.label
    select.appendChild(next)
  })
}

function setSelectValue(select, value) {
  if (!select) return
  const hasValue = Array.from(select.options).some(opt => opt.value === value)
  select.value = hasValue ? value : ''
}

function buildPoolEntryKey(providerId, model) {
  return `${providerId}:${model}`
}

function updateProviderModelSelect(providerId, models, costs) {
  const select = document.getElementById(`llmModel-${providerId}`)
  if (!select) return
  setSelectOptions(select, models.map(model => ({
    value: model,
    label: `${model}${formatModelCost(getModelCostInfo(providerId, model, costs))}`
  })))
}

async function refreshProviderModels(providerId, settings, { silent = false } = {}) {
  if (!ENABLED_PROVIDER_IDS.has(providerId)) return []
  if (PROVIDERS_REQUIRING_KEY.has(providerId)) {
    const key = settings.providers?.[providerId]?.apiKey || ''
    if (!key.trim()) {
      const select = document.getElementById(`llmModel-${providerId}`)
      if (select) setSelectOptions(select, [], 'Enter API key first')
      return []
    }
  }

  try {
    const costs = await fetchCostMap()
    const models = await fetchModelList(providerId)
    modelCacheByProvider.set(providerId, models)
    updateProviderModelSelect(providerId, models, costs)
    setSelectValue(document.getElementById(`llmModel-${providerId}`), settings.providers?.[providerId]?.model || '')
    return models
  } catch (err) {
    window.logger.warn('[LLM] Failed to refresh models:', err)
    if (!silent) showNotification(`Failed to refresh ${providerId} models.`)
    return []
  }
}

function readAndStoreProviderInput(providerId) {
  const apiKeyInput = document.getElementById(`llmApiKey-${providerId}`)
  const baseUrlInput = document.getElementById(`llmBaseUrl-${providerId}`)
  const modelSelect = document.getElementById(`llmModel-${providerId}`)
  const riskConfirmInput = document.getElementById(`llmApiKeyRiskConfirm-${providerId}`)
  updateLlmSettings({
    providers: {
      [providerId]: {
        apiKey: apiKeyInput?.value || '',
        baseUrl: baseUrlInput?.value || '',
        model: modelSelect?.value || '',
        riskAccepted: Boolean(riskConfirmInput?.checked)
      }
    }
  })
}

function bindApiKeySecurityDisclosure(providerId, settings) {
  const wrap = document.getElementById(`llmApiKeySecurity-${providerId}`)
  const note = document.getElementById(`llmApiKeySecurityNote-${providerId}`)
  const keyInput = document.getElementById(`llmApiKey-${providerId}`)
  const confirm = document.getElementById(`llmApiKeyRiskConfirm-${providerId}`)
  if (!wrap || !note || !keyInput) return

  const setVisible = visible => note.classList.toggle('is-visible', visible)
  const applyRiskState = () => {
    if (!confirm) return
    const enabled = Boolean(confirm.checked)
    keyInput.disabled = !enabled
    keyInput.title = enabled ? '' : 'Confirm risk acknowledgment to enable API key entry.'
  }

  wrap.addEventListener('mouseenter', () => setVisible(true))
  wrap.addEventListener('mouseleave', () => setVisible(false))
  keyInput.addEventListener('focus', () => setVisible(true))

  if (confirm) {
    confirm.checked = Boolean(settings.providers?.[providerId]?.riskAccepted)
    confirm.addEventListener('change', () => {
      applyRiskState()
      readAndStoreProviderInput(providerId)
    })
    applyRiskState()
  }
}

function bindProviderInputs(providerId, settings) {
  if (!ENABLED_PROVIDER_IDS.has(providerId)) return
  const apiKeyInput = document.getElementById(`llmApiKey-${providerId}`)
  const baseUrlInput = document.getElementById(`llmBaseUrl-${providerId}`)
  const modelSelect = document.getElementById(`llmModel-${providerId}`)
  const refreshBtn = document.getElementById(`llmRefresh-${providerId}`)

  bindApiKeySecurityDisclosure(providerId, settings)

  if (apiKeyInput) {
    apiKeyInput.value = settings.providers?.[providerId]?.apiKey || ''
    apiKeyInput.addEventListener('change', async() => {
      readAndStoreProviderInput(providerId)
      await refreshProviderModels(providerId, getLlmSettings(), { silent: true })
      syncPoolProviderModels()
    })
  }
  if (baseUrlInput) {
    baseUrlInput.value = settings.providers?.[providerId]?.baseUrl || ''
    baseUrlInput.addEventListener('change', async() => {
      readAndStoreProviderInput(providerId)
      await refreshProviderModels(providerId, getLlmSettings(), { silent: true })
      syncPoolProviderModels()
    })
  }
  if (modelSelect) {
    modelSelect.addEventListener('change', () => readAndStoreProviderInput(providerId))
  }
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async() => {
      await refreshProviderModels(providerId, getLlmSettings(), { silent: false })
      syncPoolProviderModels()
    })
  }
}

function populateProviderSelect(select, includeLocalOnly = false) {
  if (!select) return
  select.innerHTML = ''
  if (includeLocalOnly) {
    const local = document.createElement('option')
    local.value = 'local'
    local.textContent = 'Local AI'
    select.appendChild(local)
  }
  PROVIDERS.filter(provider => ENABLED_PROVIDER_IDS.has(provider.id)).forEach(provider => {
    const option = document.createElement('option')
    option.value = provider.id
    option.textContent = provider.label
    select.appendChild(option)
  })
}

function bindStrategicSettings(settings) {
  const enabledToggle = document.getElementById('llmStrategicEnabled')
  const tickInput = document.getElementById('llmStrategicInterval')
  const providerSelect = document.getElementById('llmStrategicProvider')
  const verbositySelect = document.getElementById('llmStrategicVerbosity')

  if (enabledToggle) {
    enabledToggle.checked = Boolean(settings.strategic.enabled)
    enabledToggle.addEventListener('change', () => {
      updateLlmSettings({ strategic: { enabled: enabledToggle.checked } })
      if (enabledToggle.checked) {
        import('../ai/llmStrategicController.js').then(mod => {
          if (typeof mod.triggerStrategicNow === 'function') mod.triggerStrategicNow()
        }).catch(err => window.logger.warn('[LLM] Failed to trigger immediate strategic tick:', err))
      }
    })
  }

  if (tickInput) {
    tickInput.value = settings.strategic.tickSeconds || 60
    tickInput.addEventListener('change', () => {
      const next = Math.max(5, Number.parseInt(tickInput.value, 10) || 60)
      tickInput.value = next
      updateLlmSettings({ strategic: { tickSeconds: next } })
      renderStrategicModelPool(getLlmSettings())
    })
  }

  if (providerSelect) {
    providerSelect.value = settings.strategic.provider || 'openai'
    providerSelect.addEventListener('change', () => {
      updateLlmSettings({ strategic: { provider: providerSelect.value } })
    })
  }

  if (verbositySelect) {
    verbositySelect.value = settings.strategic.verbosity || 'minimal'
    verbositySelect.addEventListener('change', () => {
      updateLlmSettings({ strategic: { verbosity: verbositySelect.value } })
    })
  }
}

function attachVoiceOptions(select, settings) {
  if (!select) return
  const voices = window.speechSynthesis?.getVoices?.() || []
  select.innerHTML = ''
  const defaultOption = document.createElement('option')
  defaultOption.value = ''
  defaultOption.textContent = 'Default'
  select.appendChild(defaultOption)
  voices.forEach(voice => {
    const option = document.createElement('option')
    option.value = voice.name
    option.textContent = `${voice.name} (${voice.lang})`
    select.appendChild(option)
  })
  setSelectValue(select, settings.commentary.voiceName)
}

function bindCommentarySettings(settings) {
  const enabledToggle = document.getElementById('llmCommentaryEnabled')
  const providerSelect = document.getElementById('llmCommentaryProvider')
  const promptInput = document.getElementById('llmCommentaryPrompt')
  const ttsToggle = document.getElementById('llmCommentaryTts')
  const voiceSelect = document.getElementById('llmCommentaryVoice')

  if (enabledToggle) {
    enabledToggle.checked = Boolean(settings.commentary.enabled)
    enabledToggle.addEventListener('change', () => updateLlmSettings({ commentary: { enabled: enabledToggle.checked } }))
  }
  if (providerSelect) {
    providerSelect.value = settings.commentary.provider || 'openai'
    providerSelect.addEventListener('change', () => updateLlmSettings({ commentary: { provider: providerSelect.value } }))
  }
  if (promptInput) {
    promptInput.value = settings.commentary.promptOverride || ''
    promptInput.addEventListener('change', () => updateLlmSettings({ commentary: { promptOverride: promptInput.value } }))
  }
  if (ttsToggle) {
    ttsToggle.checked = settings.commentary.ttsEnabled !== false
    ttsToggle.addEventListener('change', () => updateLlmSettings({ commentary: { ttsEnabled: ttsToggle.checked } }))
  }
  if (voiceSelect) {
    voiceSelect.addEventListener('change', () => updateLlmSettings({ commentary: { voiceName: voiceSelect.value } }))
  }
  attachVoiceOptions(voiceSelect, settings)
  if (window.speechSynthesis && typeof window.speechSynthesis.addEventListener === 'function') {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      attachVoiceOptions(voiceSelect, getLlmSettings())
    })
  }
}

function syncPoolProviderModels() {
  const settings = getLlmSettings()
  const providerSelect = document.getElementById('llmPoolProvider')
  const modelSelect = document.getElementById('llmPoolModel')
  if (!providerSelect || !modelSelect) return
  const providerId = providerSelect.value || 'openai'
  const models = modelCacheByProvider.get(providerId) || []
  setSelectOptions(modelSelect, models.map(model => ({ value: model, label: model })))
  const defaultProviderModel = settings.providers?.[providerId]?.model || ''
  setSelectValue(modelSelect, defaultProviderModel)
}

function renderStrategicModelPool(settings) {
  const list = document.getElementById('llmPoolList')
  if (!list) return
  const pool = Array.isArray(settings.strategicModelPool) ? settings.strategicModelPool : []
  if (pool.length === 0) {
    list.innerHTML = 'No LLM models added yet.'
    return
  }
  const fallbackInterval = settings.strategic.tickSeconds || 60
  list.innerHTML = ''
  pool.forEach(entry => {
    const row = document.createElement('div')
    row.className = 'config-modal__field config-modal__field--row'
    const name = document.createElement('span')
    const interval = entry.tickSeconds || fallbackInterval
    name.textContent = `${entry.model} (${interval}s)`
    const provider = document.createElement('span')
    provider.textContent = `${entry.provider}`
    provider.style.opacity = '0.8'
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'config-modal__button'
    remove.textContent = 'Remove'
    remove.addEventListener('click', () => {
      const nextPool = pool.filter(item => item.key !== entry.key)
      updateLlmSettings({ strategicModelPool: nextPool })
      renderStrategicModelPool(getLlmSettings())
      emitLlmModelPoolChanged()
    })
    row.append(name, provider, remove)
    list.appendChild(row)
  })
}

function bindModelPoolSettings(settings) {
  const providerSelect = document.getElementById('llmPoolProvider')
  const modelSelect = document.getElementById('llmPoolModel')
  const intervalInput = document.getElementById('llmPoolInterval')
  const addButton = document.getElementById('llmPoolAddButton')
  if (!providerSelect || !modelSelect || !intervalInput || !addButton) return

  populateProviderSelect(providerSelect)
  providerSelect.value = 'openai'
  providerSelect.addEventListener('change', () => syncPoolProviderModels())

  addButton.addEventListener('click', () => {
    const providerId = providerSelect.value
    const model = modelSelect.value
    if (!providerId || !model) {
      showNotification('Choose provider and model before adding to model pool.')
      return
    }
    const parsed = Number.parseInt(intervalInput.value, 10)
    const tickSeconds = Number.isFinite(parsed) ? Math.max(5, parsed) : null
    const pool = Array.isArray(getLlmSettings().strategicModelPool) ? [...getLlmSettings().strategicModelPool] : []
    const key = buildPoolEntryKey(providerId, model)
    const existingIndex = pool.findIndex(entry => entry.key === key)
    const nextEntry = { key, provider: providerId, model, tickSeconds }
    if (existingIndex >= 0) {
      pool.splice(existingIndex, 1, nextEntry)
    } else {
      pool.push(nextEntry)
    }
    updateLlmSettings({ strategicModelPool: pool })
    renderStrategicModelPool(getLlmSettings())
    emitLlmModelPoolChanged()
    intervalInput.value = ''
  })

  syncPoolProviderModels()
  renderStrategicModelPool(settings)
}

export function initLlmSettingsPanel() {
  const settings = getLlmSettings()
  populateProviderSelect(document.getElementById('llmStrategicProvider'))
  populateProviderSelect(document.getElementById('llmCommentaryProvider'))
  bindStrategicSettings(settings)
  bindCommentarySettings(settings)
  bindModelPoolSettings(settings)

  PROVIDERS.forEach(provider => bindProviderInputs(provider.id, settings))
  PROVIDERS.forEach(async provider => {
    await refreshProviderModels(provider.id, settings, { silent: true })
    syncPoolProviderModels()
  })
}
