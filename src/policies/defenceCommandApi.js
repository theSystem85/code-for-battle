import { TILE_SIZE } from '../config.js'
import { isDefenceReady, defenceCapabilityReason } from './defenceCapabilities.js'
import { canCommandPolicy } from './policyStore.js'
import { isPolicyIssuingOrder, runAsPolicy } from './policyIssuer.js'

const ACCEPTED = Object.freeze({ accepted: true, reason: null })
function refused(reason) { return { accepted: false, reason } }

/** Clear only the command owned by this program/hold, preserving manual orders. */
export function clearDefenceIntent(building, issuerId, transitionId) {
  const intent = building?.automationIntent
  if (!intent || (issuerId && intent.issuerId !== issuerId) || (transitionId && intent.transitionId !== transitionId)) return false
  building.automationIntent = null
  return true
}

export function noteDefenceDirectOrder(building, kind = 'attack', now = 0) {
  if (!building || isPolicyIssuingOrder()) return
  clearDefenceIntent(building)
  building.automationControl = null
  building.automationControlSequence = 0
  building.automationManualOverride = { kind, issuedAt: now, persistent: kind === 'holdFire' }
  building.policyActive = false
  if (building.policyBindings) for (const binding of building.policyBindings) binding.active = false
}

export function releaseDefenceManualOverride(building) {
  if (!building) return
  building.automationManualOverride = null
  building.holdFire = false
}

/** No combat is simulated here: inert intent is consumed by the real weapon path. */
export function executeDefenceCommand(building, effect, context, ownership = {}) {
  if (!canCommandPolicy(context.owner || ownership.owner, building?.owner)) return refused('foreign-owner')
  if (!isDefenceReady(building)) return refused('incomplete-or-dead')
  if (context.authoritative === false || context.replayMode) return refused('inactive-authority')
  const capability = defenceCapabilityReason(building, 'actions', effect?.type)
  if (capability) return refused(capability)
  if (building.holdFire) return refused('manual-hold-fire')
  const action = effect.type
  let target = null
  if (action === 'aimNearestEnemy') target = context.nearestEnemy?.(building)
  if (action === 'fireAtLocked') target = context.targetById?.(building.automationIntent?.targetId)
  if (action === 'aimNearestEnemy' || action === 'fireAtLocked') {
    if (!target || !context.canTarget?.(building, target)) return refused('no-valid-target')
  }
  if (action === 'fireAtLocked' || action === 'fireForward') {
    if ((building.type === 'rocketTurret' || building.type === 'teslaCoil') && context.getPower?.(building.owner) < 0) return refused('low-power')
    if (typeof building.maxAmmo === 'number' && !(building.ammo > 0)) return refused('empty-ammo')
    if (building.lastShotTime && context.now - building.lastShotTime < building.fireCooldown) return refused('reload-pending')
  }
  return runAsPolicy(() => {
    if (action === 'resumeFire' || action === 'autoAttackInRange') {
      clearDefenceIntent(building)
      return ACCEPTED
    }
    const previous = building.automationIntent
    const targetId = target?.id || (action === 'fireAtLocked' ? previous?.targetId : null)
    if (previous && previous.action === action && previous.issuerId === ownership.issuerId && previous.revision === ownership.revision && previous.transitionId === ownership.transitionId && previous.targetId === targetId) {
      if (action === 'fireAtLocked' || action === 'fireForward') previous.fireRequested = true
      return ACCEPTED
    }
    building.automationIntent = {
      action, issuerId: ownership.issuerId, revision: ownership.revision,
      transitionId: ownership.transitionId || null, temporary: Boolean(ownership.temporary),
      targetId, owner: building.owner, issuedAt: context.now,
      fireRequested: action === 'fireAtLocked' || action === 'fireForward', sequence: ownership.sequence || 0
    }
    return ACCEPTED
  })
}

/** Building geometry is tile based; target units use their sprite center. */
export function defenceDistanceSquared(building, unit) {
  const dx = unit.x + TILE_SIZE / 2 - (building.x + building.width / 2) * TILE_SIZE
  const dy = unit.y + TILE_SIZE / 2 - (building.y + building.height / 2) * TILE_SIZE
  return dx * dx + dy * dy
}
