import { applyC5Order } from '../../game/c5GalaxySystem.js'
import { gameState } from '../../gameState.js'
import { applyUnitAction } from './unitActions.js'
import { withoutUnitCommandBroadcast } from '../../network/commandBroadcastScope.js'
import { TILE_SIZE } from '../../config.js'
import { canCommandPolicy, listPolicies } from '../../policies/policyStore.js'
import { isProgrammableUnit } from '../../policies/policyEngine.js'
import { isDefenceReady } from '../../policies/defenceCapabilities.js'
import { COMBAT_UNIT_TYPES } from '../../policies/policyWorld.js'
import { queueDefenseBuildingTarget } from '../../input/unitCommands/defenceCommands.js'
import { noteDefenceDirectOrder } from '../../policies/defenceCommandApi.js'
import { GROUND_ACTIONS, GROUND_COMMANDS, groundSelection, applyGroundAction } from './groundActions.js'

const MAP_COMBAT_TYPES = new Set([...COMBAT_UNIT_TYPES, 'destroyer'])

export function commandableSelection(selection, owner) {
  return selection.filter(entity => entity?.health > 0 && !entity.factoryExit &&
    canCommandPolicy(owner, entity.owner) && (!entity.isBuilding || isDefenceReady(entity)))
}

export function applicableAutomations(selection, owner, entries = listPolicies(owner)) {
  const units = commandableSelection(selection, owner).filter(unit => !unit.isBuilding && isProgrammableUnit(unit))
  return entries.filter(entry => canCommandPolicy(owner, entry.ownerId) && entry.policy.scope === 'perUnit' &&
    entry.policy.variant === 'unit' && units.length > 0)
}

export function mapActionOptions(selection, owner) {
  const entities = commandableSelection(selection, owner)
  const units = entities.some(entity => !entity.isBuilding)
  const defence = entities.some(entity => entity.isBuilding)
  const options = []
  if (entities.some(entity => entity.isBuilding || MAP_COMBAT_TYPES.has(entity.type))) options.push('forceAttackAt')
  if (units) options.push('defendHoldAt')
  if (groundSelection(entities, owner).length) options.push(...GROUND_ACTIONS)
  if (entities.some(entity => entity.type === 'c5Galaxy' && !entity.c5Mission && entity.embarkedUnitIds?.length)) options.push('c5Airdrop')
  if (entities.some(entity => entity.type === 'c5Galaxy' && entity.flightState === 'grounded')) options.push('c5Unload')
  if (applicableAutomations(entities, owner).length) options.push('applyAutomationOnArrival')
  if (defence) options.push('holdFire', 'clearTarget')
  return options
}

// Called both locally and by the authoritative multiplayer command processor.
export function applyMapAction(payload, owner, context) {
  const { action, x, y, policyId, entityIds } = payload || {}
  if (GROUND_COMMANDS.includes(action) && Array.isArray(entityIds) && Number.isFinite(x) && Number.isFinite(y)) {
    return withoutUnitCommandBroadcast(() => applyGroundAction(payload, owner, context))
  }
  if (typeof action === 'string' && action.endsWith('Unit') && Array.isArray(entityIds)) {
    return withoutUnitCommandBroadcast(() => applyUnitAction(payload, owner, context))
  }
  if (!['forceAttackAt', 'defendHoldAt', 'applyAutomationOnArrival', 'holdFire', 'clearTarget', 'c5Airdrop', 'c5Unload'].includes(action) ||
    !Number.isFinite(x) || !Number.isFinite(y) || !Array.isArray(entityIds)) return false
  const grid = context.mapGrid
  if (x < 0 || y < 0 || x >= (grid?.[0]?.length || 0) * TILE_SIZE || y >= (grid?.length || 0) * TILE_SIZE) return false
  const ids = new Set(entityIds)
  const entities = commandableSelection([...context.units, ...(context.buildings || [])].filter(entity => ids.has(entity.id)), owner)
  if (!entities.length) return false
  if (action === 'c5Airdrop' || action === 'c5Unload') {
    const target = { x: Math.floor(x / TILE_SIZE), y: Math.floor(y / TILE_SIZE) }
    const order = action === 'c5Airdrop' ? 'airdrop' : 'unload'
    let accepted = false
    for (const entity of entities) {
      if (entity.type === 'c5Galaxy' && applyC5Order(order, { galaxyId: entity.id, target }, owner, context.units, {
        ...gameState, mapGrid: grid, occupancyMap: context.occupancyMap ?? gameState.occupancyMap, buildings: context.buildings
      })) accepted = true
    }
    return accepted
  }
  if (action === 'applyAutomationOnArrival' && !applicableAutomations(entities, owner).some(entry => entry.policy.id === policyId)) return false
  const target = action === 'forceAttackAt' ? {
    id: `ground_${Math.floor(x / TILE_SIZE)}_${Math.floor(y / TILE_SIZE)}`, type: 'groundTarget',
    x, y, tileX: Math.floor(x / TILE_SIZE), tileY: Math.floor(y / TILE_SIZE), health: 1, maxHealth: 1, isGroundTarget: true
  } : null
  for (const entity of entities) {
    if (entity.isBuilding) {
      if (action === 'forceAttackAt') queueDefenseBuildingTarget(entity, target)
      if (action === 'holdFire' || action === 'clearTarget') {
        entity.forcedAttackTarget = null
        entity.forcedAttackQueue = []
        entity.forcedAttack = false
        entity.target = null
        entity.holdFire = action === 'holdFire'
        noteDefenceDirectOrder(entity, action === 'holdFire' ? 'holdFire' : 'stop')
      }
      continue
    }
    if (action === 'holdFire' || action === 'clearTarget') continue
    if (action === 'forceAttackAt') {
      if (!MAP_COMBAT_TYPES.has(entity.type)) continue
      withoutUnitCommandBroadcast(() => context.commands.handleAttackCommand([entity], target, grid, true))
      entity.forcedAttack = true
    } else {
      if (action === 'applyAutomationOnArrival' && !isProgrammableUnit(entity)) continue
      withoutUnitCommandBroadcast(() => context.commands.handleMovementCommand([entity], x, y, grid))
      entity.mapArrivalAction = { action, x, y, policyId, owner }
    }
  }
  return true
}

