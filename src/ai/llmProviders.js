import { getProviderSettings } from './llmSettings.js'

const LOCAL_COSTS_URL = '/data/llm-costs.json'

// Custom error class for quota exceeded errors
export class QuotaExceededError extends Error {
  constructor(message, providerId) {
    super(message)
    this.name = 'QuotaExceededError'
    this.providerId = providerId
  }
}

// Custom error class for authentication/permission errors
export class AuthenticationError extends Error {
  constructor(message, providerId) {
    super(message)
    this.name = 'AuthenticationError'
    this.providerId = providerId
  }
}

// Custom error class for API parameter errors
export class ApiParameterError extends Error {
  constructor(message, providerId, paramName) {
    super(message)
    this.name = 'ApiParameterError'
    this.providerId = providerId
    this.paramName = paramName
  }
}

let cachedCosts = null
let costFetchInFlight = null

function normalizeBaseUrl(url) {
  if (!url) return ''
  return url.endsWith('/') ? url.slice(0, -1) : url
}

export async function fetchCostMap() {
  if (cachedCosts) return cachedCosts
  if (costFetchInFlight) return costFetchInFlight

  costFetchInFlight = (async() => {
    const urls = [LOCAL_COSTS_URL].filter(Boolean)
    for (const url of urls) {
      try {
        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) continue
        const data = await response.json()
        cachedCosts = data
        return cachedCosts
      } catch (err) {
        window.logger.warn('[LLM] Failed to fetch cost map from', url, err)
      }
    }
    cachedCosts = { models: {} }
    return cachedCosts
  })()

  return costFetchInFlight
}

export function getModelCostInfo(providerId, modelId, costMap) {
  if (!costMap || !costMap.models) return null
  const providerCosts = costMap.models[providerId]
  if (!providerCosts) return null
  return providerCosts[modelId] || null
}

export function formatModelCost(costInfo) {
  if (!costInfo) return ''
  const input = Number.isFinite(costInfo.input) ? costInfo.input : null
  const output = Number.isFinite(costInfo.output) ? costInfo.output : null
  if (input === null && output === null) return ''
  const unit = costInfo.unit === 'per_1k' ? '1k' : '1M'
  if (input !== null && output !== null) {
    return ` ($${input}/${unit} in, $${output}/${unit} out)`
  }
  if (input !== null) {
    return ` ($${input}/${unit} in)`
  }
  return ` ($${output}/${unit} out)`
}

export async function fetchModelList(providerId) {
  const settings = getProviderSettings(providerId)
  if (!settings) return []
  const baseUrl = normalizeBaseUrl(settings.baseUrl)

  switch (providerId) {
    case 'openai':
    case 'inceptionlabs': {
      if (!settings.apiKey) return []
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${settings.apiKey}`
        }
      })
      if (!response.ok) {
        throw new Error(`${providerId} model fetch failed: ${response.status}`)
      }
      const payload = await response.json()
      return (payload.data || [])
        .map(model => model.id)
        .filter(Boolean)
        .sort()
    }
    case 'anthropic': {
      if (!settings.apiKey) return []
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: {
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01'
        }
      })
      if (!response.ok) {
        throw new Error(`Anthropic model fetch failed: ${response.status}`)
      }
      const payload = await response.json()
      return (payload.data || [])
        .map(model => model.id)
        .filter(Boolean)
        .sort()
    }
    case 'xai': {
      if (!settings.apiKey) return []
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${settings.apiKey}`
        }
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        if (errorData?.error?.code === 'insufficient_quota' || errorData?.error?.type === 'insufficient_quota') {
          throw new QuotaExceededError(
            errorData.error.message || 'API quota exceeded',
            providerId
          )
        }
        throw new Error(`xAI model fetch failed: ${response.status}`)
      }
      const payload = await response.json()
      return (payload.data || [])
        .map(model => model.id)
        .filter(Boolean)
        .sort()
    }
    case 'ollama': {
      const response = await fetch(`${baseUrl}/api/tags`)
      if (!response.ok) {
        throw new Error(`Ollama model fetch failed: ${response.status}`)
      }
      const payload = await response.json()
      return (payload.models || [])
        .map(model => model.name)
        .filter(Boolean)
        .sort()
    }
    default:
      return []
  }
}

function ensureTextContent(content) {
  if (Array.isArray(content)) {
    return content.map(entry => (
      entry && typeof entry === 'object' && entry.type
        ? entry
        : { type: 'input_text', text: String(entry) }
    ))
  }
  if (typeof content === 'string') return [{ type: 'input_text', text: content }]
  return [{ type: 'input_text', text: JSON.stringify(content) }]
}

function buildResponseInput(messages = []) {
  return messages.map(message => ({
    role: message.role,
    content: ensureTextContent(message.content)
  }))
}

function extractResponseText(output) {
  if (!output || typeof output !== 'object') return ''
  if (typeof output.output_text === 'string') return output.output_text
  const items = Array.isArray(output.output) ? output.output : []
  for (const item of items) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      const textPart = item.content.find(part => part?.type === 'output_text' && part.text)
      if (textPart?.text) return textPart.text
    }
    if (item?.type === 'output_text' && item.text) return item.text
  }
  return ''
}

export async function requestLlmCompletion(providerId, {
  model,
  messages,
  system,
  maxTokens = 10000,
  temperature = 1.0,
  responseFormat,
  previousResponseId,
  instructions
}) {
  const settings = getProviderSettings(providerId)
  if (!settings) {
    throw new Error(`Unknown provider: ${providerId}`)
  }
  const baseUrl = normalizeBaseUrl(settings.baseUrl)

  switch (providerId) {
    case 'openai':
    case 'inceptionlabs': {
      if (!settings.apiKey) {
        throw new Error(`${providerId} API key missing`)
      }

      const inputItems = buildResponseInput([
        ...(system ? [{ role: 'system', content: system }] : []),
        ...(messages || [])
      ])

      const requestBody = {
        model,
        input: inputItems,
        temperature,
        max_output_tokens: maxTokens,
        store: true
      }

      if (previousResponseId) {
        requestBody.previous_response_id = previousResponseId
      }

      if (responseFormat) {
        requestBody.text = { format: responseFormat }
      }

      if (instructions || system) {
        requestBody.instructions = instructions || system
      }

      const response = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)

        if (errorData?.error?.code === 'insufficient_quota' || errorData?.error?.type === 'insufficient_quota') {
          throw new QuotaExceededError(
            errorData.error.message || 'API quota exceeded',
            providerId
          )
        }

        if (response.status === 401 || errorData?.error?.type === 'invalid_request_error') {
          throw new AuthenticationError(
            errorData?.error?.message || 'Authentication failed or insufficient permissions',
            providerId
          )
        }

        if (response.status === 400 && errorData?.error?.param) {
          const paramName = errorData.error.param
          const errorCode = errorData.error.code
          if (errorCode === 'unsupported_parameter' || errorCode === 'unsupported_value') {
            throw new ApiParameterError(
              errorData.error.message || 'API parameter error',
              providerId,
              paramName
            )
          }
        }

        throw new Error(`${providerId} completion failed: ${response.status}`)
      }

      const payload = await response.json()
      return {
        text: extractResponseText(payload),
        usage: payload.usage || null,
        responseId: payload.id || null
      }
    }
    case 'xai': {
      if (!settings.apiKey) {
        throw new Error('xai API key missing')
      }

      const requestBody = {
        model,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...(messages || [])
        ],
        temperature,
        max_completion_tokens: maxTokens
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)

        if (errorData?.error?.code === 'insufficient_quota' || errorData?.error?.type === 'insufficient_quota') {
          throw new QuotaExceededError(
            errorData.error.message || 'API quota exceeded',
            providerId
          )
        }

        if (response.status === 401 || errorData?.error?.type === 'invalid_request_error') {
          throw new AuthenticationError(
            errorData?.error?.message || 'Authentication failed or insufficient permissions',
            providerId
          )
        }

        if (response.status === 400 && errorData?.error?.param) {
          const paramName = errorData.error.param
          const errorCode = errorData.error.code
          if (errorCode === 'unsupported_parameter' || errorCode === 'unsupported_value') {
            throw new ApiParameterError(
              errorData.error.message || 'API parameter error',
              providerId,
              paramName
            )
          }
        }

        throw new Error(`${providerId} completion failed: ${response.status}`)
      }
      const payload = await response.json()
      const content = payload.choices?.[0]?.message?.content || ''
      return {
        text: content,
        usage: payload.usage || null
      }
    }
    case 'anthropic': {
      if (!settings.apiKey) {
        throw new Error('Anthropic API key missing')
      }
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system,
          messages
        })
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)

        // Handle quota exceeded errors
        if (errorData?.error?.code === 'insufficient_quota' || errorData?.error?.type === 'insufficient_quota') {
          throw new QuotaExceededError(
            errorData.error.message || 'API quota exceeded',
            providerId
          )
        }

        // Handle authentication/permission errors (401)
        if (response.status === 401 || errorData?.error?.type === 'authentication_error') {
          throw new AuthenticationError(
            errorData?.error?.message || 'Authentication failed or insufficient permissions',
            providerId
          )
        }

        // Handle parameter errors (400) - unsupported parameters or values
        if (response.status === 400 && errorData?.error?.param) {
          const paramName = errorData.error.param
          const errorCode = errorData.error.code
          if (errorCode === 'unsupported_parameter' || errorCode === 'unsupported_value') {
            throw new ApiParameterError(
              errorData.error.message || 'API parameter error',
              providerId,
              paramName
            )
          }
        }

        throw new Error(`Anthropic completion failed: ${response.status}`)
      }
      const payload = await response.json()
      const content = payload.content?.[0]?.text || ''
      return {
        text: content,
        usage: payload.usage || null
      }
    }
    case 'ollama': {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            ...messages
          ],
          stream: false,
          options: {
            temperature
          }
        })
      })
      if (!response.ok) {
        throw new Error(`Ollama completion failed: ${response.status}`)
      }
      const payload = await response.json()
      return {
        text: payload.message?.content || '',
        usage: payload.usage || {
          prompt_tokens: payload.prompt_eval_count,
          completion_tokens: payload.eval_count,
          total_tokens: payload.prompt_eval_count + payload.eval_count
        }
      }
    }
    default:
      throw new Error(`Unsupported provider: ${providerId}`)
  }
}
