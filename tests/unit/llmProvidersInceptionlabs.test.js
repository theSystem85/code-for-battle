import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestLlmCompletion, fetchModelList } from '../../src/ai/llmProviders.js'
import { saveLlmSettings } from '../../src/ai/llmSettings.js'

describe('llmProviders inceptionlabs integration', () => {
  beforeEach(() => {
    globalThis.window = globalThis.window || {}
    window.logger = window.logger || { warn: vi.fn(), info: vi.fn() }
    globalThis.localStorage = {
      _data: new Map(),
      getItem(key) { return this._data.has(key) ? this._data.get(key) : null },
      setItem(key, value) { this._data.set(key, value) },
      removeItem(key) { this._data.delete(key) }
    }

    saveLlmSettings({
      providers: {
        inceptionlabs: {
          apiKey: 'test-key',
          baseUrl: 'https://api.inceptionlabs.ai/v1',
          model: 'Mercury 2',
          riskAccepted: true
        }
      }
    })
  })

  it('returns static Mercury 2 model list without network discovery', async() => {
    globalThis.fetch = vi.fn()
    const models = await fetchModelList('inceptionlabs')
    expect(models).toEqual(['mercury-2'])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('uses /chat/completions endpoint for completion requests', async() => {
    globalThis.fetch = vi.fn(async() => ({
      ok: true,
      json: async() => ({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      })
    }))

    const result = await requestLlmCompletion('inceptionlabs', {
      model: 'Mercury 2',
      system: 'sys',
      messages: [{ role: 'user', content: 'hello' }],
      responseFormat: { type: 'json_schema', name: 'X', schema: { type: 'object' }, strict: true }
    })

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = globalThis.fetch.mock.calls[0]
    expect(url).toBe('https://api.inceptionlabs.ai/v1/chat/completions')
    expect(options.method).toBe('POST')
    const requestBody = JSON.parse(options.body)
    expect(requestBody.model).toBe('mercury-2')
    expect(requestBody.max_tokens).toBe(10000)
    expect(result.text).toBe('{"ok":true}')
    expect(result.responseId).toBeNull()
  })
})
