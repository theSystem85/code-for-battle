// Bounded, event-driven production receipts. IDs travel with the exact queue items.
import { canCommandPolicy, getPolicyEntry, getPolicySequence, nextPolicySequence, registerAutomationRuntimeProvider, subscribeAutomationMutations } from './policyStore.js'
import { gameState } from '../gameState.js'
import { recordReplayCommand } from '../replayCommandPrimitives.js'
const receipts = new Map()
export function createCompletionReceipt(ownerId, issuerId, quantity = 1, behaviorRevision = 1) {
  const id = `automation-completion:${gameState.currentSessionId || 'match'}:${ownerId}:${issuerId}:${nextPolicySequence()}`
  receipts.set(id, { id, ownerId, issuerId, behaviorRevision, quantity, completedItems: [], remaining: quantity, status: 'pending', reason: null })
  return id
}
export function getCompletionReceipt(id) { return receipts.get(id) || null }
export function releaseCompletionReceipt(id) { receipts.delete(id) }
function record(receipt) {
  if (!gameState.replayMode && gameState.replay?.recordingActive) recordReplayCommand({ type: 'automation-completion', receipt: { ...receipt, completedItems: receipt.completedItems.slice() } }, { source: 'automation' })
}
export function completeProductionItem(id, itemId) {
  const receipt = receipts.get(id)
  if (!receipt || receipt.status !== 'pending') return
  const token = itemId || (receipt.quantity === 1 ? `${id}:building` : null)
  if (!token || receipt.completedItems.includes(token)) return
  receipt.completedItems.push(token)
  receipt.reason = null
  if (--receipt.remaining <= 0) receipt.status = 'completed'
  record(receipt)
}
export function noteProductionBlocked(id, reason) {
  const receipt = receipts.get(id)
  if (!receipt || receipt.status !== 'pending' || receipt.reason === reason) return
  receipt.reason = reason
  record(receipt)
}
export function failCompletionReceipt(id, reason = 'production was cancelled') {
  const receipt = receipts.get(id)
  if (!receipt || receipt.status !== 'pending') return
  receipt.status = 'failed'
  receipt.reason = reason
  record(receipt)
}
export function applyProductionCompletionAck({ receiptId, itemId, ownerId, status, reason }) {
  const receipt = receipts.get(receiptId)
  if (!receipt || !itemId || !canCommandPolicy(ownerId, receipt.ownerId) || !canCommandPolicy(gameState.humanPlayer, ownerId)) return
  if (!itemId.startsWith(`${receiptId}:`)) return
  if (status === 'failed') failCompletionReceipt(receiptId, reason || 'the authoritative spawn was rejected')
  else if (status === 'completed') completeProductionItem(receiptId, itemId)
}
export function restoreCompletionReceipt(receipt, { replay = false } = {}) {
  if (!receipt || typeof receipt.id !== 'string' || receipt.id.length > 1024 || !Number.isInteger(receipt.quantity) || receipt.quantity < 1 || receipt.quantity > 20 || !Number.isInteger(receipt.remaining) || receipt.remaining < 0 || receipt.remaining > receipt.quantity || !['pending', 'completed', 'failed'].includes(receipt.status)) return
  const sequence = Number(receipt.id.split(':').at(-1))
  if (!Number.isSafeInteger(sequence) || sequence < 1 || !receipt.id.startsWith('automation-completion:')) return
  if (!(replay && gameState.replayMode) && sequence > getPolicySequence()) return
  const entry = getPolicyEntry(receipt.issuerId)
  if (!entry || !canCommandPolicy(entry.ownerId, receipt.ownerId) || entry.behaviorRevision !== receipt.behaviorRevision) return
  if (gameState.humanPlayer && !canCommandPolicy(gameState.humanPlayer, receipt.ownerId)) return
  if (!Array.isArray(receipt.completedItems) || receipt.completedItems.length > receipt.quantity || receipt.completedItems.some(id => typeof id !== 'string') || new Set(receipt.completedItems).size !== receipt.completedItems.length) return
  if (receipt.status === 'completed' && receipt.remaining !== 0) return
  if (receipt.status === 'pending' && receipt.remaining === 0) return
  if (receipt.quantity - receipt.remaining !== receipt.completedItems.length) return
  for (const existing of receipts.values()) if (existing.issuerId === receipt.issuerId && existing.id !== receipt.id) return
  receipts.set(receipt.id, { ...receipt, completedItems: receipt.completedItems.slice() })
}
subscribeAutomationMutations(command => {
  const id = command.payload?.id || command.payload?.policyId
  if (!id) return
  const revision = getPolicyEntry(id)?.behaviorRevision
  for (const [receiptId, receipt] of receipts) {
    if (receipt.issuerId === id && (command.operation === 'delete' || (command.operation === 'enable' && !command.payload.enabled) || (command.operation === 'save' && revision !== receipt.behaviorRevision))) receipts.delete(receiptId)
  }
})
registerAutomationRuntimeProvider('completion-receipts', {
  reset: () => receipts.clear(),
  export: () => Array.from(receipts.values(), receipt => ({ ...receipt, completedItems: receipt.completedItems.slice() })),
  restore: (snapshot, options = {}) => {
    if (options.authority === 'host-snapshot') return
    receipts.clear(); if (Array.isArray(snapshot)) snapshot.forEach(receipt => restoreCompletionReceipt(receipt))
  }
})
