import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestLlmCompletion } from '../../src/ai/llmProviders.js'
import { saveLlmSettings } from '../../src/ai/llmSettings.js'

describe('llmProviders openai request shaping', () => {
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
        openai: {
          apiKey: 'test-openai-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-5-nano',
          riskAccepted: true
        }
      }
    })
  })

  it('sends instructions without duplicating a system message in input', async() => {
    globalThis.fetch = vi.fn(async() => ({
      ok: true,
      json: async() => ({
        id: 'resp_123',
        output_text: '{"ok":true}',
        usage: { input_tokens: 11, output_tokens: 5, total_tokens: 16 }
      })
    }))

    await requestLlmCompletion('openai', {
      model: 'gpt-5-nano',
      system: 'system prompt',
      instructions: 'followup prompt',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 321,
      previousResponseId: 'resp_prev',
      requestType: 'strategic'
    })

    const [url, options] = globalThis.fetch.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    const requestBody = JSON.parse(options.body)
    expect(requestBody.instructions).toBe('followup prompt')
    expect(requestBody.max_output_tokens).toBe(321)
    expect(requestBody.previous_response_id).toBe('resp_prev')
    expect(requestBody.input).toHaveLength(1)
    expect(requestBody.input[0].role).toBe('user')
  })
})
