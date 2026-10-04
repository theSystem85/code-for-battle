// Build command API: the one internal way a build policy orders construction.
//
// executeBuildCommand(name, args, ctx) runs a command only when the engine
// allows it and reports { ok, reason }. A refusal never changes anything.
// A command goes through the same queue a player uses (blueprint + production
// queue), so cost, build time, power slow-down and the "must touch the base"
// placement rules stay with the engine. A policy cannot skip any of them.
//
// ctx.build is the adapter installed by basePolicyGameBindings.js:
//   lockReason()                  -> string | null  (paused, replay, AI controls the party)
//   hasConstructionYard(owner)    -> boolean
//   isAvailable(type)             -> boolean        (the sidebar button is unlocked)
//   isQueueBusy()                 -> boolean        (something is building or waiting to be placed)
//   getCost(type)                 -> number | null
//   findPlacement(type, owner)    -> { x, y } | null  (already valid for canPlaceBuilding)
//   queue(type, placement)        -> boolean
// ctx.owner is the party the policy builds for; ctx.getMoney(owner) is its money.
//
// Units are not part of this API. Enemy AI building code does not use it.

import { BUILDABLE_TYPES } from './policyEffects.js'

function typeLabel(type) {
  const found = BUILDABLE_TYPES.find(item => item.value === type)
  return found ? found.label.toLowerCase() : String(type)
}

function planBuild(args, ctx) {
  const build = ctx && ctx.build
  if (!build) return { reason: 'no build command handler is available' }
  const type = args && args.buildingType
  if (!BUILDABLE_TYPES.some(item => item.value === type)) return { reason: 'this building cannot be ordered by a policy' }
  const locked = build.lockReason()
  if (locked) return { reason: locked }
  if (!build.hasConstructionYard(ctx.owner)) return { reason: 'a construction yard is required' }
  if (!build.isAvailable(type)) return { reason: `the ${typeLabel(type)} is not unlocked yet` }
  if (build.isQueueBusy()) return { reason: 'the construction queue is busy' }
  const cost = build.getCost(type)
  if (typeof cost !== 'number') return { reason: `the ${typeLabel(type)} has no price` }
  const money = ctx.getMoney ? ctx.getMoney(ctx.owner) : undefined
  if (typeof money !== 'number' || money < cost) return { reason: `not enough money for a ${typeLabel(type)}` }
  const placement = build.findPlacement(type, ctx.owner)
  if (!placement) return { reason: `there is no valid place for a ${typeLabel(type)}` }
  return { type, placement }
}

const COMMANDS = {
  buildBuilding: {
    check(args, ctx) {
      return planBuild(args, ctx).reason || null
    },
    run(args, ctx) {
      const plan = planBuild(args, ctx)
      if (plan.reason) return { ok: false, reason: plan.reason }
      if (ctx.build.queue(plan.type, plan.placement) !== true) return { ok: false, reason: 'the engine did not accept the order' }
      return { ok: true, reason: null }
    }
  }
}

export const BUILD_COMMAND_NAMES = Object.freeze(Object.keys(COMMANDS))

/** Plain-language reason a command would be refused right now, or null when it would run. */
export function getBuildRefusal(name, args, ctx) {
  const command = COMMANDS[name]
  if (!command) return `unknown build command "${name}"`
  return command.check(args || {}, ctx)
}

/**
 * Run a build command. `ok` is true only when the construction was really
 * queued; otherwise `reason` says why the engine refused.
 * @returns {{ ok: boolean, reason: string | null }}
 */
export function executeBuildCommand(name, args, ctx) {
  const command = COMMANDS[name]
  if (!command) return { ok: false, reason: `unknown build command "${name}"` }
  return command.run(args || {}, ctx)
}
