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
const PROVIDERS_REQUIRING_KEY = new Set(['openai', 'anthropic', 'xai'])

const modelCacheByProvider = new Map()

function emitLlmModelPoolChanged() {
  if (typeof document === 'undefined') return
  document.dispatchEvent(new CustomEvent('llmModelPoolChanged'))
}

function formatProviderLabel(providerId) {
  return PROVIDERS.find(provider => provider.id === providerId)?.label || providerId
}

function formatModelNameForUi(providerId, model) {
  if (providerId === 'inceptionlabs' && model === 'mercury-2') return 'Mercury 2'
  return model
}

function formatPoolEntryLabel(entry, fallbackTickSeconds = 60) {
  const tickSeconds = entry.tickSeconds || fallbackTickSeconds
  return `${formatModelNameForUi(entry.provider, entry.model)} (${tickSeconds}s)`
}

function setSelectOptions(select, options, placeholder = 'Select model') {
  if (!select) return
  select.innerHTML = ''
  const placeholderOption = document.createElement('option')
  placeholderOption.value = ''
  placeholderOption.textContent = placeholder
  select.appendChild(placeholderOption)

  options.forEach(option => {
    const el = document.createElement('option')
    el.value = option.value
    el.textContent = option.label
    select.appendChild(el)
  })
}

function setSelectValue(select, value) {
  if (!select) return
  const hasValue = Array.from(select.options).some(option => option.value === value)
  select.value = hasValue ? value : ''
}

function buildPoolEntryKey(providerId, model) {
  return `${providerId}:${model}`
}

function updateProviderModelSelect(providerId, models, costs) {
  const select = document.getElementById(`llmModel-${providerId}`)
  if (!select) return
  const options = models.map(model => {
    const costInfo = getModelCostInfo(providerId, model, costs)
    const modelName = formatModelNameForUi(providerId, model)
    return {
      value: model,
      label: `${modelName}${formatModelCost(costInfo)}`
    }
  })
  setSelectOptions(select, options)
}

async function refreshProviderModels(providerId, settings, { silent = false } = {}) {
  if (!ENABLED_PROVIDER_IDS.has(providerId)) return []

  if (PROVIDERS_REQUIRING_KEY.has(providerId)) {
    const apiKey = settings.providers?.[providerId]?.apiKey || ''
    if (!apiKey.trim()) {
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
    const currentModel = settings.providers?.[providerId]?.model || ''
    setSelectValue(document.getElementById(`llmModel-${providerId}`), currentModel)
    return models
  } catch (err) {
    window.logger.warn('[LLM] Failed to refresh models:', err)
    if (!silent) {
      showNotification(`Failed to refresh ${providerId} models.`)
    }
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
  const securityWrap = document.getElementById(`llmApiKeySecurity-${providerId}`)
  const securityNote = document.getElementById(`llmApiKeySecurityNote-${providerId}`)
  const apiKeyInput = document.getElementById(`llmApiKey-${providerId}`)
  const riskConfirmInput = document.getElementById(`llmApiKeyRiskConfirm-${providerId}`)

  if (!securityWrap || !securityNote || !apiKeyInput) return

  const setVisible = visible => {
    securityNote.classList.toggle('is-visible', visible)
  }

  const applyRiskState = () => {
    if (!riskConfirmInput) return
    const riskAccepted = Boolean(riskConfirmInput.checked)
    apiKeyInput.disabled = !riskAccepted
    apiKeyInput.title = riskAccepted ? '' : 'Confirm risk acknowledgment to enable API key entry.'
  }

  securityWrap.addEventListener('mouseenter', () => setVisible(true))
  securityWrap.addEventListener('mouseleave', () => setVisible(false))
  apiKeyInput.addEventListener('focus', () => setVisible(true))

  if (riskConfirmInput) {
    riskConfirmInput.checked = Boolean(settings.providers?.[providerId]?.riskAccepted)
    riskConfirmInput.addEventListener('change', () => {
      applyRiskState()
      readAndStoreProviderInput(providerId)
    })
    applyRiskState()
  }
}

function syncPoolProviderModels() {
  const settings = getLlmSettings()
  const providerSelect = document.getElementById('llmPoolProvider')
  const modelSelect = document.getElementById('llmPoolModel')
  if (!providerSelect || !modelSelect) return

  const providerId = providerSelect.value || 'openai'
  const models = modelCacheByProvider.get(providerId) || []
  setSelectOptions(modelSelect, models.map(model => ({
    value: model,
    label: formatModelNameForUi(providerId, model)
  })))
  const defaultModel = settings.providers?.[providerId]?.model || ''
  setSelectValue(modelSelect, defaultModel)
}

function getPoolEntries(settings = getLlmSettings()) {
  return Array.isArray(settings.strategicModelPool) ? settings.strategicModelPool : []
}

function syncCommentaryModelOptions(settings = getLlmSettings()) {
  const commentaryModelSelect = document.getElementById('llmCommentaryModel')
  if (!commentaryModelSelect) return

  const pool = getPoolEntries(settings)
  const fallbackTickSeconds = settings.strategic.tickSeconds || 60
  setSelectOptions(commentaryModelSelect, pool.map(entry => ({
    value: entry.key,
    label: `🤖 ${formatPoolEntryLabel(entry, fallbackTickSeconds)}`
  })), 'Select model from pool')
  setSelectValue(commentaryModelSelect, settings.commentary.modelKey || '')
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
      syncCommentaryModelOptions()
    })
  }

  if (baseUrlInput) {
    baseUrlInput.value = settings.providers?.[providerId]?.baseUrl || ''
    baseUrlInput.addEventListener('change', async() => {
      readAndStoreProviderInput(providerId)
      await refreshProviderModels(providerId, getLlmSettings(), { silent: true })
      syncPoolProviderModels()
      syncCommentaryModelOptions()
    })
  }

  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      readAndStoreProviderInput(providerId)
      syncPoolProviderModels()
    })
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async() => {
      await refreshProviderModels(providerId, getLlmSettings(), { silent: false })
      syncPoolProviderModels()
      syncCommentaryModelOptions()
    })
  }
}

function populateProviderSelect(select) {
  if (!select) return
  select.innerHTML = ''
  PROVIDERS
    .filter(provider => ENABLED_PROVIDER_IDS.has(provider.id))
    .forEach(provider => {
      const option = document.createElement('option')
      option.value = provider.id
      option.textContent = provider.label
      select.appendChild(option)
    })
}

function bindStrategicSettings(settings) {
  const verbositySelect = document.getElementById('llmStrategicVerbosity')
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
  const modelSelect = document.getElementById('llmCommentaryModel')
  const promptInput = document.getElementById('llmCommentaryPrompt')
  const ttsToggle = document.getElementById('llmCommentaryTts')
  const voiceSelect = document.getElementById('llmCommentaryVoice')

  if (enabledToggle) {
    enabledToggle.checked = Boolean(settings.commentary.enabled)
    enabledToggle.addEventListener('change', () => {
      updateLlmSettings({ commentary: { enabled: enabledToggle.checked } })
    })
  }

  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      updateLlmSettings({ commentary: { modelKey: modelSelect.value || '' } })
    })
  }

  if (promptInput) {
    promptInput.value = settings.commentary.promptOverride || ''
    promptInput.addEventListener('change', () => {
      updateLlmSettings({ commentary: { promptOverride: promptInput.value } })
    })
  }

  if (ttsToggle) {
    ttsToggle.checked = settings.commentary.ttsEnabled !== false
    ttsToggle.addEventListener('change', () => {
      updateLlmSettings({ commentary: { ttsEnabled: ttsToggle.checked } })
    })
  }

  if (voiceSelect) {
    voiceSelect.addEventListener('change', () => {
      updateLlmSettings({ commentary: { voiceName: voiceSelect.value } })
    })
  }

  attachVoiceOptions(voiceSelect, settings)
  if (window.speechSynthesis && typeof window.speechSynthesis.addEventListener === 'function') {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      attachVoiceOptions(voiceSelect, getLlmSettings())
    })
  }
}

function renderStrategicModelPool(settings) {
  const list = document.getElementById('llmPoolList')
  if (!list) return

  const pool = getPoolEntries(settings)
  if (pool.length === 0) {
    list.innerHTML = 'No LLM models added yet.'
    return
  }

  const fallbackTickSeconds = settings.strategic.tickSeconds || 60
  list.innerHTML = ''
  pool.forEach(entry => {
    const row = document.createElement('div')
    row.className = 'config-modal__field config-modal__field--row'

    const modelLabel = document.createElement('span')
    modelLabel.textContent = formatPoolEntryLabel(entry, fallbackTickSeconds)

    const providerLabel = document.createElement('span')
    providerLabel.textContent = formatProviderLabel(entry.provider)
    providerLabel.style.opacity = '0.8'

    const removeButton = document.createElement('button')
    removeButton.type = 'button'
    removeButton.className = 'config-modal__button'
    removeButton.textContent = 'Remove'
    removeButton.addEventListener('click', () => {
      const current = getLlmSettings()
      const nextPool = getPoolEntries(current).filter(item => item.key !== entry.key)
      const commentaryPatch = current.commentary?.modelKey === entry.key
        ? { modelKey: '' }
        : {}
      updateLlmSettings({
        strategicModelPool: nextPool,
        commentary: commentaryPatch
      })
      const nextSettings = getLlmSettings()
      renderStrategicModelPool(nextSettings)
      syncCommentaryModelOptions(nextSettings)
      emitLlmModelPoolChanged()
    })

    row.append(modelLabel, providerLabel, removeButton)
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
  providerSelect.value = settings.providers?.inceptionlabs?.model ? 'inceptionlabs' : 'openai'
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

    const current = getLlmSettings()
    const pool = [...getPoolEntries(current)]
    const key = buildPoolEntryKey(providerId, model)
    const nextEntry = { key, provider: providerId, model, tickSeconds }
    const existingIndex = pool.findIndex(entry => entry.key === key)
    if (existingIndex >= 0) {
      pool.splice(existingIndex, 1, nextEntry)
    } else {
      pool.push(nextEntry)
    }

    updateLlmSettings({ strategicModelPool: pool })
    const nextSettings = getLlmSettings()
    renderStrategicModelPool(nextSettings)
    syncCommentaryModelOptions(nextSettings)
    emitLlmModelPoolChanged()
    intervalInput.value = ''
  })

  syncPoolProviderModels()
  renderStrategicModelPool(settings)
}

export function initLlmSettingsPanel() {
  const settings = getLlmSettings()

  bindStrategicSettings(settings)
  bindCommentarySettings(settings)
  bindModelPoolSettings(settings)

  PROVIDERS.forEach(provider => bindProviderInputs(provider.id, settings))
  PROVIDERS.forEach(async provider => {
    await refreshProviderModels(provider.id, settings, { silent: true })
    syncPoolProviderModels()
    syncCommentaryModelOptions(getLlmSettings())
  })

  syncCommentaryModelOptions(settings)
}
