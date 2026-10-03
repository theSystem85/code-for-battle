// Unit command API: the one internal way policy code gives a unit an order.
//
// executeUnitCommand(name, unit, args, ctx) runs a command only when the engine
// allows it and returns false when it does not. Refusals never change the unit.
// Commands go through the same handlers a player uses (UnitCommandsHandler) and
// are wrapped in runAsPolicy so they never count as direct orders. Map physics
// (collision, occupancy, terrain) stay the only thing that may push a unit.
//
// ctx = { now, mapGrid, units, buildings, factories, commands,
//         getFireRange?, getFireRate?, canTarget?, fire? }
// Anything that needs a heavy game module is injected (see policyGameBindings.js).
//
// Existing human and enemy AI code is NOT routed through this API yet; that
// migration is listed as later work in docs/programmable-units-feature-list.md.

import { TANK_FIRE_RANGE, TILE_SIZE, TURRET_AIMING_THRESHOLD } from '../config.js'
import { runAsPolicy } from './policyIssuer.js'
import {
  AIR_UNIT_TYPES,
  COMBAT_UNIT_TYPES,
  SERVICE_UNIT_TYPES,
  TURRET_TANK_TYPES,
  findNearestEnemy,
  findNearestFriendly,
  findNearestFriendlyBuilding,
  findNearestFriendlyProvider,
  isBuildingEntity,
  isHostile,
  sameParty
} from './policyWorld.js'

export const TURN_STEP_RAD = Math.PI / 12
export const TURRET_STEP_RAD = Math.PI / 14
export const DEFAULT_MOVE_TILES = 2

const MODES = Object.freeze({ heal: 'heal', refuel: 'refuel', repair: 'repair', ammo: 'ammoResupply' })
const JET_TYPES = new Set(['f22Raptor', 'f35'])
const FIRING_TANK_TYPES = TURRET_TANK_TYPES

function normalizeAngle(angle) {
  let result = angle
  while (result > Math.PI) result -= 2 * Math.PI
  while (result < -Math.PI) result += 2 * Math.PI
  return result
}

function rotateToward(current, desired, maxStep) {
  const diff = normalizeAngle(desired - current)
  if (Math.abs(diff) <= maxStep) return desired
  return normalizeAngle(current + Math.sign(diff) * maxStep)
}

function centerOf(entity) {
  if (isBuildingEntity(entity)) {
    return { x: (entity.x + (entity.width || 1) / 2) * TILE_SIZE, y: (entity.y + (entity.height || 1) / 2) * TILE_SIZE }
  }
  return { x: entity.x + TILE_SIZE / 2, y: entity.y + TILE_SIZE / 2 }
}

function unitFireRange(unit, ctx) {
  return ctx.getFireRange ? ctx.getFireRange(unit) : TANK_FIRE_RANGE * TILE_SIZE
}

function baseRefusal(unit) {
  if (!unit || typeof unit !== 'object') return 'no unit'
  if (unit.isBuilding === true) return 'buildings cannot receive unit commands'
  if (!(unit.health > 0)) return 'the unit is destroyed'
  if (unit.embarkedOnId) return 'the unit is embarked'
  if (!unit.owner) return 'the unit has no owner'
  return null
}

function mobilityRefusal(unit) {
  const base = baseRefusal(unit)
  if (base) return base
  if (unit.crew && typeof unit.crew === 'object' && !unit.crew.driver) return 'the unit has no driver'
  if (typeof unit.maxGas === 'number' && !(unit.gas > 0)) return 'the unit is out of fuel'
  if (AIR_UNIT_TYPES.has(unit.type) && unit.flightState === 'grounded') return 'the aircraft is on the ground'
  return null
}

function targetRefusal(unit, target, ctx) {
  if (!target || typeof target !== 'object') return 'there is no target'
  if (!(target.health > 0)) return 'the target is destroyed'
  if (target.embarkedOnId) return 'the target is embarked'
  if (!isHostile(unit, target)) return 'the target is not an enemy'
  if (ctx.canTarget && !ctx.canTarget(unit, target)) return 'the unit cannot target that'
  return null
}

function weaponRefusal(unit) {
  if (!COMBAT_UNIT_TYPES.has(unit.type)) return 'the unit has no weapon'
  return null
}

function tileWalkable(unit, ctx, tileX, tileY) {
  const grid = ctx.mapGrid
  if (!grid || !grid[0]) return false
  if (tileY < 0 || tileY >= grid.length || tileX < 0 || tileX >= grid[0].length) return false
  if (AIR_UNIT_TYPES.has(unit.type) || unit.isNaval) return true
  const tile = grid[tileY][tileX]
  if (!tile) return false
  return tile.type !== 'water' && tile.type !== 'rock' && !tile.building && !tile.seedCrystal
}

function planMove(unit, ctx, tiles, headingOffset) {
  const reason = mobilityRefusal(unit)
  if (reason) return { reason }
  if (!ctx.commands || typeof ctx.commands.handleMovementCommand !== 'function') return { reason: 'no command handler is available' }
  const distance = Number.isFinite(tiles) && tiles > 0 ? tiles : DEFAULT_MOVE_TILES
  const heading = (unit.direction || 0) + headingOffset
  const cx = unit.x + TILE_SIZE / 2
  const cy = unit.y + TILE_SIZE / 2
  const destX = cx + Math.cos(heading) * distance * TILE_SIZE
  const destY = cy + Math.sin(heading) * distance * TILE_SIZE
  const tileX = Math.floor(destX / TILE_SIZE)
  const tileY = Math.floor(destY / TILE_SIZE)
  if (!tileWalkable(unit, ctx, tileX, tileY)) return { reason: 'the destination is blocked' }
  return { x: tileX * TILE_SIZE + TILE_SIZE / 2, y: tileY * TILE_SIZE + TILE_SIZE / 2 }
}

function moveCommand(headingOffset, helicopterOnly) {
  return {
    check(unit, args, ctx) {
      if (helicopterOnly && unit && unit.type !== 'apache') return 'only helicopters can move sideways'
      return planMove(unit, ctx, args.tiles, headingOffset).reason || null
    },
    run(unit, args, ctx) {
      const plan = planMove(unit, ctx, args.tiles, headingOffset)
      if (plan.reason) return false
      ctx.commands.handleMovementCommand([unit], plan.x, plan.y, ctx.mapGrid)
      return true
    }
  }
}

function turnCommand(sign) {
  return {
    check(unit) {
      const base = baseRefusal(unit)
      if (base) return base
      if (JET_TYPES.has(unit.type)) return 'jets turn by flying'
      if (unit.crew && typeof unit.crew === 'object' && !unit.crew.driver) return 'the unit has no driver'
      if (typeof unit.maxGas === 'number' && !(unit.gas > 0)) return 'the unit is out of fuel'
      if (unit.moveTarget || (unit.path && unit.path.length > 0)) return 'the unit is already moving'
      return null
    },
    run(unit) {
      const next = normalizeAngle((unit.direction || 0) + sign * TURN_STEP_RAD)
      unit.direction = next
      unit.rotation = next
      unit.targetDirection = next
      if (unit.movement) {
        unit.movement.rotation = next
        unit.movement.targetRotation = next
      }
      return true
    }
  }
}

function turretCommand(sign) {
  return {
    check(unit) {
      const base = baseRefusal(unit)
      if (base) return base
      if (!TURRET_TANK_TYPES.has(unit.type)) return 'only tanks have a turret'
      if (unit.crew && typeof unit.crew === 'object' && !unit.crew.gunner) return 'the tank has no gunner'
      return null
    },
    run(unit) {
      const current = typeof unit.turretDirection === 'number' ? unit.turretDirection : unit.direction || 0
      unit.turretDirection = normalizeAngle(current + sign * TURRET_STEP_RAD)
      unit.turretShouldFollowMovement = false
      return true
    }
  }
}

function lockRefusal(unit, ctx) {
  const lock = unit.policyLock
  if (!lock) return 'no target is locked'
  return targetRefusal(unit, lock, ctx)
}

function fireRefusal(unit, ctx) {
  const base = baseRefusal(unit)
  if (base) return base
  if (!FIRING_TANK_TYPES.has(unit.type)) return 'this unit type cannot be fired on command'
  if (typeof ctx.fire !== 'function') return 'no firing hook is available'
  if (unit.crew && typeof unit.crew === 'object' && (!unit.crew.loader || !unit.crew.gunner)) return 'the crew cannot fire'
  if (unit.canFire === false) return 'the unit may not fire'
  if (typeof unit.ammunition === 'number' && !(unit.ammunition > 0)) return 'out of ammo'
  const rate = ctx.getFireRate ? ctx.getFireRate(unit) : null
  if (typeof rate === 'number' && unit.lastShotTime && ctx.now - unit.lastShotTime < rate) return 'the weapon is reloading'
  if (unit.burstState) return 'the weapon is in a burst'
  return null
}

function angleTo(unit, entity) {
  const center = centerOf(entity)
  return Math.atan2(center.y - (unit.y + TILE_SIZE / 2), center.x - (unit.x + TILE_SIZE / 2))
}

function aimedAt(unit, entity) {
  const threshold = unit.type === 'tank-v3' ? TURRET_AIMING_THRESHOLD * 0.5 : TURRET_AIMING_THRESHOLD
  return Math.abs(normalizeAngle((unit.turretDirection || 0) - angleTo(unit, entity))) <= threshold
}

function inFireRange(unit, entity, ctx) {
  const center = centerOf(entity)
  return Math.hypot(center.x - (unit.x + TILE_SIZE / 2), center.y - (unit.y + TILE_SIZE / 2)) <= unitFireRange(unit, ctx)
}

function releaseNoChase(unit, target) {
  if (unit.policyNoChase && (!target || unit.policyNoChase === target)) {
    if (!target || unit.target === target) {
      unit.target = null
      unit.path = null
      unit.moveTarget = null
    }
    unit.policyNoChase = null
  }
}

function attackInRangeRefusal(unit, target, ctx) {
  const base = baseRefusal(unit)
  if (base) return base
  const weapon = weaponRefusal(unit)
  if (weapon) return weapon
  const bad = targetRefusal(unit, target, ctx)
  if (bad) return bad
  if (!inFireRange(unit, target, ctx)) return 'the target is out of range'
  return null
}

function applyAttackInRange(unit, target) {
  unit.canFire = true
  unit.forcedAttack = false
  unit.policyNoChase = target
  if (unit.target !== target) unit.target = target
  return true
}

function nearestEnemyInRange(unit, ctx) {
  const enemy = findNearestEnemy(unit, ctx.units)
  if (!enemy) return null
  return attackInRangeRefusal(unit, enemy, ctx) ? null : enemy
}

function serviceModeFor(unit) {
  switch (unit.type) {
    case 'ambulance': return MODES.heal
    case 'tankerTruck': return MODES.refuel
    case 'ammunitionTruck': return MODES.ammo
    case 'recoveryTank': return MODES.repair
    default: return null
  }
}

function serviceRefusal(unit, target, ctx) {
  const base = baseRefusal(unit)
  if (base) return base
  const mode = serviceModeFor(unit)
  if (!mode) return 'only service units can service a target'
  const commands = ctx.commands
  if (!commands || typeof commands.isUtilityTargetValid !== 'function') return 'no command handler is available'
  if (!target || !(target.health > 0)) return 'there is no unit to service'
  if (!sameParty(target.owner, unit.owner)) return 'only friendly units can be serviced'
  if (!commands.isUtilityTargetValid(mode, unit, target)) return 'the target does not need that service'
  const capable = unit.type === 'ambulance' ? commands.canAmbulanceProvideCrew(unit)
    : unit.type === 'tankerTruck' ? commands.canTankerProvideFuel(unit)
      : unit.type === 'ammunitionTruck' ? commands.canAmmunitionTruckProvideAmmo(unit)
        : commands.canRecoveryTankRepair(unit)
  return capable ? null : 'the service unit cannot provide that service right now'
}

/** First nearby friendly unit that `unit` can service, or null. */
export function findServiceTarget(unit, ctx) {
  const mode = serviceModeFor(unit)
  if (!mode || !ctx.commands || typeof ctx.commands.isUtilityTargetValid !== 'function') return null
  return findNearestFriendly(unit, ctx.units, 14, other => ctx.commands.isUtilityTargetValid(mode, unit, other))
}

const REFILL = Object.freeze({
  ammo: {
    provider: 'ammunitionTruck',
    usable: (commands, provider) => commands.canAmmunitionTruckProvideAmmo(provider),
    needs: unit => (typeof unit.maxAmmunition === 'number' && unit.ammunition < unit.maxAmmunition) ||
      (typeof unit.maxRocketAmmo === 'number' && unit.rocketAmmo < unit.maxRocketAmmo)
  },
  health: {
    provider: 'recoveryTank',
    usable: (commands, provider) => commands.canRecoveryTankRepair(provider),
    needs: unit => unit.health < unit.maxHealth
  },
  fuel: {
    provider: 'tankerTruck',
    usable: (commands, provider) => commands.canTankerProvideFuel(provider) && provider.supplyGas > 0,
    needs: unit => typeof unit.maxGas === 'number' && unit.gas < unit.maxGas
  }
})

function refillPlan(unit, args, ctx) {
  const base = baseRefusal(unit)
  if (base) return { reason: base }
  const spec = REFILL[args.resource || 'ammo']
  if (!spec) return { reason: 'unknown refill type' }
  if (SERVICE_UNIT_TYPES.has(unit.type) && unit.type === spec.provider) return { reason: 'a service unit cannot refill itself' }
  const commands = ctx.commands
  if (!commands || typeof commands.handleServiceProviderRequest !== 'function') return { reason: 'no command handler is available' }
  if (!spec.needs(unit)) return { reason: 'the unit does not need a refill' }
  const provider = findNearestFriendlyProvider(unit, ctx.units, spec.provider, other => spec.usable(commands, other))
  if (!provider) return { reason: 'no service unit is available' }
  return { provider }
}

function buildingTripPlan(unit, ctx, type, eligible) {
  const base = baseRefusal(unit)
  if (base) return { reason: base }
  const reason = eligible(unit)
  if (reason) return { reason }
  const buildings = ctx.factories && ctx.factories.length ? (ctx.buildings || []).concat(ctx.factories) : (ctx.buildings || [])
  const building = findNearestFriendlyBuilding(unit, buildings, type)
  if (!building) return { reason: 'there is no such building' }
  if (!ctx.commands) return { reason: 'no command handler is available' }
  return { building }
}

function groundFlightRefusal(unit, wantGrounded) {
  const base = baseRefusal(unit)
  if (base) return base
  if (unit.type !== 'apache' && unit.type !== 'f35') return 'only helicopters and the F-35 can take off and land'
  const grounded = unit.flightState === 'grounded'
  if (wantGrounded && grounded) return 'the aircraft is already on the ground'
  if (!wantGrounded && !grounded) return 'the aircraft is already airborne'
  return null
}

const COMMANDS = {
  moveForward: moveCommand(0, false),
  moveBackward: moveCommand(Math.PI, false),
  moveSidewaysLeft: moveCommand(-Math.PI / 2, true),
  moveSidewaysRight: moveCommand(Math.PI / 2, true),
  turnLeft: turnCommand(-1),
  turnRight: turnCommand(1),
  turretLeft: turretCommand(-1),
  turretRight: turretCommand(1),

  takeoff: {
    check: unit => groundFlightRefusal(unit, false),
    run(unit) {
      unit.path = []
      unit.moveTarget = null
      unit.flightPlan = null
      unit.helipadLandingRequested = false
      unit.manualFlightState = 'takeoff'
      unit.manualFlightHoverRequested = true
      unit.autoHoldAltitude = true
      return true
    }
  },
  land: {
    check: unit => groundFlightRefusal(unit, true),
    run(unit) {
      unit.path = []
      unit.moveTarget = null
      unit.flightPlan = null
      unit.manualFlightState = 'land'
      unit.manualFlightHoverRequested = false
      unit.autoHoldAltitude = false
      return true
    }
  },

  aimAndLock: {
    check(unit, args, ctx) {
      const base = baseRefusal(unit)
      if (base) return base
      if (!TURRET_TANK_TYPES.has(unit.type)) return 'only tanks with a turret can aim and lock'
      if (unit.crew && typeof unit.crew === 'object' && !unit.crew.gunner) return 'the tank has no gunner'
      return targetRefusal(unit, args.target, ctx)
    },
    run(unit, args) {
      unit.policyLock = args.target
      unit.turretDirection = rotateToward(
        typeof unit.turretDirection === 'number' ? unit.turretDirection : unit.direction || 0,
        angleTo(unit, args.target),
        TURRET_STEP_RAD
      )
      unit.turretShouldFollowMovement = false
      return true
    }
  },
  fireAtLocked: {
    check(unit, args, ctx) {
      const base = fireRefusal(unit, ctx)
      if (base) return base
      const lock = lockRefusal(unit, ctx)
      if (lock) return lock
      if (!inFireRange(unit, unit.policyLock, ctx)) return 'the locked target is out of range'
      if (!aimedAt(unit, unit.policyLock)) return 'the turret is not aimed at the locked target'
      return null
    },
    run(unit, args, ctx) {
      return ctx.fire(unit, unit.policyLock, null) === true
    }
  },
  fireForward: {
    check: (unit, args, ctx) => fireRefusal(unit, ctx),
    run(unit, args, ctx) {
      const range = unitFireRange(unit, ctx)
      const heading = typeof unit.turretDirection === 'number' ? unit.turretDirection : unit.direction || 0
      const aim = {
        x: unit.x + TILE_SIZE / 2 + Math.cos(heading) * range,
        y: unit.y + TILE_SIZE / 2 + Math.sin(heading) * range
      }
      return ctx.fire(unit, null, aim) === true
    }
  },

  stop: {
    check: unit => baseRefusal(unit),
    run(unit) {
      unit.path = null
      unit.moveTarget = null
      unit.attackTarget = null
      unit.guardPosition = null
      unit.guardMode = false
      unit.guardTarget = null
      unit.guardTargets = null
      unit.target = null
      unit.policyLock = null
      unit.policyNoChase = null
      unit.forcedAttack = false
      unit.attackQueue = []
      unit.attackGroupTargets = []
      unit.commandQueue = []
      unit.currentCommand = null
      return true
    }
  },
  retreatTo: {
    check(unit, args, ctx) {
      const reason = mobilityRefusal(unit)
      if (reason) return reason
      if (!ctx.commands || typeof ctx.commands.handleMovementCommand !== 'function') return 'no command handler is available'
      if (!tileWalkable(unit, ctx, args.tileX, args.tileY)) return 'the retreat position is blocked'
      return null
    },
    run(unit, args, ctx) {
      ctx.commands.handleMovementCommand([unit], args.tileX * TILE_SIZE + TILE_SIZE / 2, args.tileY * TILE_SIZE + TILE_SIZE / 2, ctx.mapGrid)
      return true
    }
  },
  attackAndChase: {
    check(unit, args, ctx) {
      const base = baseRefusal(unit)
      if (base) return base
      const weapon = weaponRefusal(unit)
      if (weapon) return weapon
      if (!ctx.commands || typeof ctx.commands.handleAttackCommand !== 'function') return 'no command handler is available'
      return targetRefusal(unit, args.target, ctx)
    },
    run(unit, args, ctx) {
      if (unit.target === args.target) return false
      unit.policyNoChase = null
      ctx.commands.handleAttackCommand([unit], args.target, ctx.mapGrid, false, false)
      return true
    }
  },
  attackInRange: {
    check: (unit, args, ctx) => attackInRangeRefusal(unit, args.target, ctx),
    run: (unit, args) => applyAttackInRange(unit, args.target),
    onRefused: (unit, args) => releaseNoChase(unit, args.target)
  },
  autoAttackInRange: {
    check(unit, args, ctx) {
      const base = baseRefusal(unit)
      if (base) return base
      const weapon = weaponRefusal(unit)
      if (weapon) return weapon
      return nearestEnemyInRange(unit, ctx) ? null : 'no enemy is in range'
    },
    run(unit, args, ctx) {
      const enemy = nearestEnemyInRange(unit, ctx)
      return enemy ? applyAttackInRange(unit, enemy) : false
    },
    onRefused: unit => releaseNoChase(unit, null)
  },
  serviceTarget: {
    check: (unit, args, ctx) => serviceRefusal(unit, args.target, ctx),
    run(unit, args, ctx) {
      const options = { suppressNotifications: true }
      const { commands } = ctx
      switch (unit.type) {
        case 'ambulance': commands.handleAmbulanceHealCommand([unit], args.target, ctx.mapGrid, options); break
        case 'tankerTruck': commands.handleTankerRefuelCommand([unit], args.target, ctx.mapGrid, options); break
        case 'ammunitionTruck': commands.handleAmmunitionTruckResupplyCommand([unit], args.target, ctx.mapGrid, options); break
        default: commands.handleRecoveryTankRepairCommand([unit], args.target, ctx.mapGrid, options)
      }
      return true
    }
  },
  protect: {
    check(unit, args) {
      const base = baseRefusal(unit)
      if (base) return base
      const target = args.target
      if (!target || !(target.health > 0)) return 'there is nothing to protect'
      if (target === unit || target.id === unit.id) return 'a unit cannot protect itself'
      if (isBuildingEntity(target)) return 'only units can be protected'
      if (!sameParty(target.owner, unit.owner)) return 'only friendly units can be protected'
      if (unit.type === 'harvester' || unit.isNaval) return 'this unit cannot protect others'
      return null
    },
    run(unit, args) {
      unit.guardTargets = [args.target]
      unit.guardTarget = args.target
      unit.guardMode = true
      unit.target = null
      unit.moveTarget = null
      unit.policyLock = null
      unit.policyNoChase = null
      return true
    }
  },
  requestRefill: {
    check: (unit, args, ctx) => refillPlan(unit, args, ctx).reason || null,
    run(unit, args, ctx) {
      const plan = refillPlan(unit, args, ctx)
      if (plan.reason) return false
      return ctx.commands.handleServiceProviderRequest(plan.provider, [unit], ctx.mapGrid) === true
    }
  },
  goToWorkshop: {
    check: (unit, args, ctx) => buildingTripPlan(unit, ctx, 'vehicleWorkshop', u => {
      if (AIR_UNIT_TYPES.has(u.type) || u.isNaval) return 'only land vehicles use a workshop'
      return u.health < u.maxHealth ? null : 'the unit needs no repairs'
    }).reason || null,
    run(unit, args, ctx) {
      const plan = buildingTripPlan(unit, ctx, 'vehicleWorkshop', () => null)
      if (plan.reason) return false
      ctx.commands.handleRepairWorkshopCommand([unit], plan.building, ctx.mapGrid)
      return true
    }
  },
  goToHospital: {
    check: (unit, args, ctx) => buildingTripPlan(unit, ctx, 'hospital', u => {
      if (u.type !== 'ambulance') return 'only ambulances restock at a hospital'
      return u.medics < (u.maxMedics || 4) ? null : 'the ambulance is fully staffed'
    }).reason || null,
    run(unit, args, ctx) {
      const plan = buildingTripPlan(unit, ctx, 'hospital', () => null)
      if (plan.reason) return false
      ctx.commands.handleAmbulanceRefillCommand([unit], plan.building, ctx.mapGrid)
      return true
    }
  },
  goToAmmoFactory: {
    check: (unit, args, ctx) => buildingTripPlan(unit, ctx, 'ammunitionFactory', u => {
      if (u.type !== 'ammunitionTruck') return 'only ammunition trucks reload at an ammo factory'
      return u.ammoCargo < u.maxAmmoCargo ? null : 'the truck is fully loaded'
    }).reason || null,
    run(unit, args, ctx) {
      const plan = buildingTripPlan(unit, ctx, 'ammunitionFactory', () => null)
      if (plan.reason) return false
      ctx.commands.handleAmmunitionTruckReloadCommand([unit], plan.building, ctx.mapGrid, { suppressNotifications: true })
      return true
    }
  }
}

export const UNIT_COMMAND_NAMES = Object.freeze(Object.keys(COMMANDS))

const NO_ARGS = Object.freeze({})
const EMPTY_CTX = Object.freeze({})

/** Why the command is refused, or null when the engine allows it. */
export function refuseUnitCommand(name, unit, args = NO_ARGS, ctx = EMPTY_CTX) {
  const command = COMMANDS[name]
  if (!command) return `unknown command "${name}"`
  return command.check(unit, args || NO_ARGS, ctx)
}

export function canExecuteUnitCommand(name, unit, args, ctx) {
  return refuseUnitCommand(name, unit, args, ctx) === null
}

/** Run a command if allowed. Returns false (and changes nothing) when refused. */
export function executeUnitCommand(name, unit, args = NO_ARGS, ctx = EMPTY_CTX) {
  const command = COMMANDS[name]
  if (!command) return false
  const safeArgs = args || NO_ARGS
  if (command.check(unit, safeArgs, ctx) !== null) {
    if (command.onRefused && unit) command.onRefused(unit, safeArgs, ctx)
    return false
  }
  return runAsPolicy(() => command.run(unit, safeArgs, ctx)) === true
}
