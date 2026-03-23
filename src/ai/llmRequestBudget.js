export const LLM_REQUEST_BUDGETS = {
  strategic: {
    maxEstimatedPromptTokens: 9000,
    maxEstimatedContextTokens: 18000,
    maxOutputTokens: 1200,
    maxChainRequests: 8,
    maxSummaryLinesOnReset: 2
  },
  commentary: {
    maxEstimatedPromptTokens: 1500,
    maxEstimatedContextTokens: 4000,
    maxOutputTokens: 160,
    maxChainRequests: 4,
    maxSummaryLinesOnReset: 1
  }
}

export function estimateTextTokens(value) {
  if (value === null || value === undefined) return 0
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

export function estimateMessagesTokens(messages = []) {
  return messages.reduce((total, message) => total + estimateTextTokens(message) + 6, 0)
}

export function estimateRequestPromptTokens({ messages = [], instructions = null, system = null }) {
  return estimateMessagesTokens(messages) + estimateTextTokens(instructions) + estimateTextTokens(system)
}

export function trimRollingSummary(summary, maxLines = 1) {
  if (!summary) return ''
  return String(summary).split('\n').slice(-Math.max(1, maxLines)).join('\n')
}

export function summarizeRejectedActions(rejectedActions = []) {
  return rejectedActions
    .slice(-3)
    .map(action => `${action.type || 'unknown'}:${action.reason || 'rejected'}`)
}

export function buildCarryForwardMemory({ plan = null, summary = '', rejectedActions = [] } = {}) {
  const memory = {}
  if (plan?.intent) memory.intent = plan.intent
  if (plan?.notes) memory.notes = String(plan.notes).slice(0, 180)
  if (Number.isFinite(plan?.confidence)) memory.confidence = plan.confidence
  const summaryText = trimRollingSummary(summary, 2)
  if (summaryText) memory.summary = summaryText
  const rejected = summarizeRejectedActions(rejectedActions.length > 0 ? rejectedActions : (plan?.recentRejects || []))
  if (rejected.length > 0) memory.rejected = rejected
  return Object.keys(memory).length > 0 ? memory : null
}

export function shouldResetResponseChain(contextStats = {}, estimatedPromptTokens = 0, budget = {}) {
  const requestCount = Number(contextStats.requestCount || 0)
  const cumulativePromptTokens = Number(contextStats.estimatedPromptTokens || 0)

  if (!contextStats.responseId) {
    return { reset: false, reason: null }
  }

  if (budget.maxChainRequests && requestCount >= budget.maxChainRequests) {
    return { reset: true, reason: 'request-count-budget' }
  }

  if (budget.maxEstimatedContextTokens && cumulativePromptTokens + estimatedPromptTokens > budget.maxEstimatedContextTokens) {
    return { reset: true, reason: 'estimated-context-budget' }
  }

  return { reset: false, reason: null }
}
