import { describe, expect, it } from 'vitest'
import {
  buildCarryForwardMemory,
  estimateRequestPromptTokens,
  shouldResetResponseChain,
  trimRollingSummary
} from '../../src/ai/llmRequestBudget.js'

describe('llmRequestBudget helpers', () => {
  it('[U02363] estimates prompt tokens across messages and instructions', () => {
    const estimate = estimateRequestPromptTokens({
      messages: [{ role: 'user', content: 'hello world' }],
      instructions: 'follow this',
      system: null
    })

    expect(estimate).toBeGreaterThan(0)
  })

  it('[U02364] requests a context reset when chain length exceeds budget', () => {
    const decision = shouldResetResponseChain(
      { requestCount: 8, estimatedPromptTokens: 3000, responseId: 'resp_1' },
      400,
      { maxChainRequests: 8, maxEstimatedContextTokens: 6000 }
    )

    expect(decision).toEqual({ reset: true, reason: 'request-count-budget' })
  })

  it('[U02365] builds compact carry-forward memory for reset requests', () => {
    const memory = buildCarryForwardMemory({
      plan: {
        intent: 'expand-and-defend',
        notes: 'Need power and refinery first',
        confidence: 0.72,
        recentRejects: [{ type: 'build_place', reason: 'TECH_TREE_LOCKED' }]
      },
      summary: 'Tick 10 | Money 1200\nTick 20 | Money 800'
    })

    expect(memory).toEqual({
      intent: 'expand-and-defend',
      notes: 'Need power and refinery first',
      confidence: 0.72,
      summary: 'Tick 10 | Money 1200\nTick 20 | Money 800',
      rejected: ['build_place:TECH_TREE_LOCKED']
    })
  })

  it('[U02366] trims rolling summaries to the requested number of lines', () => {
    expect(trimRollingSummary('a\nb\nc', 2)).toBe('b\nc')
  })
})
