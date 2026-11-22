import { hasOperationalBuilding } from '../production/researchCenterRequirements.js'
import { gameState } from '../gameState.js'
import { CAPSTONE_PERK_ID, PERKS, START_PERK_BY_VARIANT, getPerk } from './perkCatalog.js'
import { setStarGrantListener, setTurretVeterancyGate } from '../game/veterancy.js'

const listeners = new Set()
const policyCache = new WeakMap()
const normalizeOwner = owner => owner === 'player' ? 'player1' : owner
function state() {
  if (!gameState.perks || typeof gameState.perks !== 'object') gameState.perks = { automationPerkMode: 'required', owners: {} }
  gameState.perks.owners ||= {}
  return gameState.perks
}
function mutableLedger(ownerId) {
  const owner = normalizeOwner(ownerId)
  const owners = state().owners
  if (!owners[owner]) owners[owner] = { earned: 0, spent: 0, owned: [], log: [] }
  return owners[owner]
}
function notify() { for (const listener of listeners) listener() }
export function getPerkLedger(ownerId) {
  const value = mutableLedger(ownerId)
  return { earned: value.earned, spent: value.spent, available: value.earned - value.spent, owned: [...value.owned].sort() }
}
export function ownsPerk(ownerId, perkId) { return getAutomationPerkMode() === 'allUnlocked' || mutableLedger(ownerId).owned.includes(perkId) }
export function hasLivingCommandCenter(ownerId) {
  const owner = normalizeOwner(ownerId)
  return (gameState.buildings || []).some(building => building.type === 'commandCenter' && normalizeOwner(building.owner) === owner && building.health > 0)
}
export function hasLivingResearchCenter(ownerId) {
  return hasOperationalBuilding(gameState.buildings || [], 'technologyResearchCenter', ownerId)
}
export function ownsResearchPerk(ownerId, perkId) {
  return getPerk(perkId)?.tree === 'research' && mutableLedger(ownerId).owned.includes(perkId)
}
export function canPurchasePerk(ownerId, perkId) {
  const perk = getPerk(perkId)
  if (!perk) return { ok: false, reason: 'unknown' }
  const ledger = mutableLedger(ownerId)
  if (ledger.owned.includes(perkId)) return { ok: false, reason: 'owned' }
  if (perk.tree === 'research') {
    if (!hasLivingResearchCenter(ownerId)) return { ok: false, reason: 'noResearchCenter' }
  } else if (!hasLivingCommandCenter(ownerId)) return { ok: false, reason: 'noCommandCenter' }
  const requirementsMet = perk.requires.all ? perk.requires.all.every(id => ledger.owned.includes(id)) : perk.requires.any.some(id => ledger.owned.includes(id))
  if (!requirementsMet) return { ok: false, reason: 'missingPrerequisite' }
  if (ledger.earned - ledger.spent < perk.cost) return { ok: false, reason: 'insufficientStars' }
  return { ok: true }
}
export function applyPerkPurchase(ownerId, perkId, expectedCost = getPerk(perkId)?.cost) {
  const perk = getPerk(perkId)
  if (!perk || expectedCost !== perk.cost) return { ok: false, reason: 'unknown' }
  const result = canPurchasePerk(ownerId, perkId)
  if (!result.ok) return result
  const ledger = mutableLedger(ownerId)
  ledger.spent += perk.cost
  ledger.owned.push(perk.id)
  if (perk.lane === 'start') for (const included of PERKS.filter(item => item.auto && item.requires.all?.includes(perk.id))) if (!ledger.owned.includes(included.id)) ledger.owned.push(included.id)
  ledger.owned.sort()
  ledger.log.push({ tick: gameState.frameCount || 0, perkId, cost: perk.cost })
  notify()
  return { ok: true }
}
export async function requestPerkPurchase(perkId) {
  const actorId = normalizeOwner(gameState.humanPlayer || 'player1')
  const expectedCost = getPerk(perkId)?.cost
  const remote = Boolean(gameState.multiplayerSession?.isRemote)
  const payload = { actorId, perkId, expectedCost }
  const result = remote ? { ok: true } : applyPerkPurchase(actorId, perkId, expectedCost)
  if (!result.ok) return result
  const { COMMAND_TYPES } = await import('../network/commandTypes.js')
  if (!remote) {
    const { recordReplayCommand } = await import('../replayCommandPrimitives.js')
    recordReplayCommand({ type: COMMAND_TYPES.PERK_PURCHASE, payload })
  }
  if (gameState.multiplayerSession) {
    const { broadcastGameCommand } = await import('../network/commandBroadcast.js')
    broadcastGameCommand(COMMAND_TYPES.PERK_PURCHASE, payload, actorId)
  }
  return result
}
export function grantPerkStars(entity, count) {
  if (!entity || !Number.isSafeInteger(count) || count <= 0) return
  adjustPerkStars(entity.owner, count)
}
export function adjustPerkStars(ownerId, delta) {
  if (!Number.isSafeInteger(delta) || delta === 0) return 0
  const ledger = mutableLedger(ownerId)
  const adjustment = delta < 0
    ? Math.max(delta, -Math.max(0, ledger.earned - ledger.spent))
    : Math.min(delta, Number.MAX_SAFE_INTEGER - ledger.earned)
  if (!adjustment) return 0
  ledger.earned += adjustment
  notify()
  return adjustment
}
export const getAutomationPerkMode = () => globalThis.__AUTOMATION_PERK_MODE__ === 'allUnlocked' || state().automationPerkMode === 'allUnlocked' ? 'allUnlocked' : 'required'
export function setAutomationPerkMode(mode) {
  if (mode !== 'required' && mode !== 'allUnlocked') throw new TypeError('Invalid automation perk mode')
  if (getAutomationPerkMode() !== mode) { state().automationPerkMode = mode; notify() }
}
export function isItemUnlocked(ownerId, variant, kind, id, option) {
  if (getAutomationPerkMode() === 'allUnlocked') return true
  if (!ownsPerk(ownerId, START_PERK_BY_VARIANT[variant])) return false
  return PERKS.some(perk => perk.variant === variant && ownsPerk(ownerId, perk.id) && (kind === 'condition'
    ? perk.unlocks.conditions.includes(id) : kind === 'effect' ? perk.unlocks.effects.includes(id)
      : perk.unlocks.options.some(entry => entry.effect === id && entry.values.includes(option))))
}
export function getItemUnlockPerk(variant, kind, id, option) {
  return PERKS.find(perk => perk.variant === variant && (kind === 'condition'
    ? perk.unlocks.conditions.includes(id) : kind === 'effect' ? perk.unlocks.effects.includes(id)
      : perk.unlocks.options.some(entry => entry.effect === id && entry.values.includes(option)))) || getPerk(START_PERK_BY_VARIANT[variant])
}
export function getPolicyLock(ownerId, policy) {
  if (getAutomationPerkMode() === 'allUnlocked') return null
  if (!hasLivingCommandCenter(ownerId)) return 'needs an operational Command Center'
  const missing = [...requiredPerksForPolicy(policy)].find(id => !ownsPerk(ownerId, id))
  const perk = getPerk(missing)
  return perk ? `needs ${perk.name} (${perk.cost}★)` : null
}
function visitCondition(condition, required, variant) {
  if (!condition) return
  if (condition.type === 'and' || condition.type === 'or') for (const child of condition.of || []) visitCondition(child, required, variant)
  else if (condition.type === 'not') visitCondition(condition.of, required, variant)
  else {
    const id = condition.type === 'compare' ? condition.field : condition.type === 'check' ? condition.check : condition.type
    const perk = PERKS.find(item => item.variant === variant && item.unlocks.conditions.includes(id))
    if (perk) required.add(perk.id)
  }
}
export function requiredPerksForPolicy(policy) {
  if (!policy || typeof policy !== 'object') return new Set()
  if (policyCache.has(policy)) return policyCache.get(policy)
  const required = new Set([START_PERK_BY_VARIANT[policy.variant]])
  for (const state of policy.states || []) {
    const effect = state.effect || state.do
    if (effect) {
      const perk = PERKS.find(item => item.variant === policy.variant && (item.unlocks.effects.includes(effect.type) || item.unlocks.options.some(option => option.effect === effect.type && option.values.includes(effect[option.param]))))
      if (perk) required.add(perk.id)
    }
    for (const transition of state.transitions || []) { visitCondition(transition.when, required, policy.variant); visitCondition(transition.until, required, policy.variant) }
  }
  policyCache.set(policy, required)
  return required
}
export function subscribePerks(listener) { listeners.add(listener); return () => listeners.delete(listener) }
export function exportPerkState() {
  return JSON.parse(JSON.stringify(state()))
}
function restoreStarCount(count) {
  const value = Math.trunc(Number(count))
  return Number.isSafeInteger(value) ? Math.max(0, value) : 0
}
export function restorePerkState(payload) {
  gameState.perks = { automationPerkMode: payload?.automationPerkMode === 'allUnlocked' ? 'allUnlocked' : 'required', owners: {} }
  for (const [owner, value] of Object.entries(payload?.owners || {})) gameState.perks.owners[owner] = { earned: restoreStarCount(value.earned), spent: restoreStarCount(value.spent), owned: [...new Set((value.owned || []).filter(id => getPerk(id)))].sort(), log: Array.isArray(value.log) ? value.log.map(item => ({ ...item })) : [] }
  notify()
}
export function resetPerkState(mode = globalThis.__AUTOMATION_PERK_MODE__) {
  restorePerkState({ automationPerkMode: mode })
}
export function getPerkStateHash() {
  const text = JSON.stringify(exportPerkState())
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0
  return hash
}
setStarGrantListener((entity, count) => {
  const bonus = entity?.type !== 'harvester' && hasOperationalBuilding(gameState.buildings, 'aiCenter', entity?.owner) ? 1 : 0
  grantPerkStars(entity, count + bonus)
})
setTurretVeterancyGate(ownerId => ownsPerk(ownerId, CAPSTONE_PERK_ID))
