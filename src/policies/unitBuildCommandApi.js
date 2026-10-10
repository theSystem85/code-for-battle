import { UNIT_BUILDABLE_TYPES, UNIT_DELIVERY_ORDERS } from './policyEffects.js'

export const MAX_AUTOMATED_UNIT_STACK = 20
export const MAX_UNIT_QUEUE_ITEMS = 100

function known(options, value) {
  return options.some(item => item.value === value)
}

function plan(args, ctx) {
  const production = ctx && ctx.unitBuild
  if (!production) return { reason: 'no unit production handler is available' }
  const unitType = args && args.unitType
  const quantity = Number(args && args.quantity)
  const delivery = args && args.delivery
  if (!known(UNIT_BUILDABLE_TYPES, unitType)) return { reason: 'this unit cannot be ordered by automation' }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_AUTOMATED_UNIT_STACK) {
    return { reason: `the stack size must be between 1 and ${MAX_AUTOMATED_UNIT_STACK}` }
  }
  if (!known(UNIT_DELIVERY_ORDERS, delivery)) return { reason: 'the delivery order is not supported' }
  const locked = production.lockReason()
  if (locked) return { reason: locked }
  if (!production.isAvailable(unitType)) return { reason: 'the unit is not unlocked or its production building is unavailable' }
  if (production.queueLength() + quantity > MAX_UNIT_QUEUE_ITEMS) return { reason: 'the unit production queue is full' }
  return { unitType, quantity, delivery }
}

export function executeUnitBuildCommand(name, args, ctx) {
  if (name !== 'buildUnits') return { ok: false, reason: `unknown unit build command "${name}"` }
  const order = plan(args || {}, ctx)
  if (order.reason) return { ok: false, reason: order.reason }
  if (ctx.unitBuild.queue(order) !== true) return { ok: false, reason: 'the engine did not accept the unit stack' }
  return { ok: true, reason: null }
}

export function getUnitBuildRefusal(name, args, ctx) {
  if (name !== 'buildUnits') return `unknown unit build command "${name}"`
  return plan(args || {}, ctx).reason || null
}
