import { TILE_SIZE } from '../../config.js'
import { canCommandPolicy } from '../../policies/policyStore.js'
import { canSupplyShipServe } from '../../game/shipyardServiceLogic.js'
import { requestCarrierLanding, requestTransportLoadGroup, isTransportableGroundUnit, AIRCRAFT_SLOT_WEIGHT } from '../../game/navalFleetSystem.js'
import { createReplayEntityReference, createReplayUnitReferences, recordReplayCommand } from '../../replaySystem.js'

const PROVIDERS = new Set(['ambulance', 'tankerTruck', 'ammunitionTruck', 'recoveryTank'])

export function unitActionOptions(selection, target, owner, _buildings = []) {
  if (!target || target.health <= 0 || target.factoryExit || target.embarkedOnId || target.transportTransfer) return []
  const units = selection.filter(unit => !unit.isBuilding && unit.id !== target.id && unit.health > 0 &&
    !unit.factoryExit && !unit.embarkedOnId && !unit.transportOperation && !unit.transportTransfer && !unit.transportBoardingLocked && unit.crew?.commander !== false && canCommandPolicy(owner, unit.owner))
  if (!units.length) return []
  const friendly = canCommandPolicy(owner, target.owner)
  if (!friendly && target.type === 'submarine' && target.depthState !== 'surfaced') return []
  const result = [friendly ? 'forceAttackUnit' : 'attackUnit']
  if (friendly) result.push('guardUnit', 'serveUnit')
  result.push('followUnit')
  if (friendly && target.type === 'aircraftCarrier' && units.some(unit => AIRCRAFT_SLOT_WEIGHT[unit.type])) result.push('landOnUnit')
  if (friendly && ['vehicleFerry', 'hovercraft'].includes(target.type) &&
    units.some(unit => isTransportableGroundUnit(unit, target.owner, target.id))) result.push('embarkUnit')
  return result
}

export function canServeUnit(unit, target, buildings, commands) {
  if (!unit || !target || unit.id === target.id || unit.health <= 0 || target.health <= 0) return false
  if (canSupplyShipServe(unit, target, buildings)) return true
  const provider = {
    ambulance: ['heal', 'canAmbulanceProvideCrew'], tankerTruck: ['refuel', 'canTankerProvideFuel'],
    ammunitionTruck: ['ammoResupply', 'canAmmunitionTruckProvideAmmo'], recoveryTank: ['repair', 'canRecoveryTankRepair']
  }[unit.type]
  return Boolean(provider && commands?.[provider[1]]?.(unit) && commands.isUtilityTargetValid?.(provider[0], unit, target))
}

export function applyUnitAction(payload, owner, context) {
  const target = context.units.find(unit => unit.id === payload.targetId)
  const ids = new Set(payload.entityIds)
  const selected = context.units.filter(unit => ids.has(unit.id) && !unit.isBuilding && unit.id !== target?.id &&
    unit.health > 0 && !unit.factoryExit && !unit.embarkedOnId && !unit.transportOperation && !unit.transportTransfer && !unit.transportBoardingLocked && unit.crew?.commander !== false && canCommandPolicy(owner, unit.owner))
  if (!unitActionOptions(selected, target, owner, context.buildings).includes(payload.action)) return false
  const { action } = payload
  if (action === 'serveUnit' && !selected.some(unit => canServeUnit(unit, target, context.buildings, context.commands))) return false
  if (action === 'attackUnit' || action === 'forceAttackUnit') {
    context.commands.handleAttackCommand(selected, target, context.mapGrid, action === 'forceAttackUnit')
    recordReplayCommand({ type: 'unit_command', owner, unitIds: selected.map(unit => unit.id),
      unitRefs: createReplayUnitReferences(selected.map(unit => unit.id)), command: 'attack',
      targetRef: createReplayEntityReference(target), forceAttack: action === 'forceAttackUnit' }, { source: 'human' })
  } else if (action === 'embarkUnit') {
    return requestTransportLoadGroup(target, selected.filter(unit => isTransportableGroundUnit(unit, target.owner, target.id)), context.mapGrid, context.occupancyMap, context.units)
  } else if (action === 'landOnUnit') {
    let handled = false
    for (const unit of selected) if (AIRCRAFT_SLOT_WEIGHT[unit.type] && requestCarrierLanding(unit, target, context.units)) handled = true
    return handled
  } else {
    const ordered = []
    for (const unit of selected) {
      if (action === 'serveUnit' && !canSupplyShipServe(unit, target, context.buildings)) {
        if (PROVIDERS.has(unit.type) && context.commands.handleServiceProviderRequest(unit, [target], context.mapGrid)) {
          recordReplayCommand({ type: 'unit_command', owner, unitIds: [unit.id],
            command: 'service_provider_request', providerRef: createReplayEntityReference(unit),
            requesterRefs: [createReplayEntityReference(target)] }, { source: 'human' })
        }
        continue
      }
      // Let the regular order path cancel utility work, retreat and queued orders.
      context.commands.handleMovementCommand([unit], unit.x + TILE_SIZE / 2, unit.y + TILE_SIZE / 2, context.mapGrid)
      unit.path = []
      unit.target = null
      unit.moveTarget = null
      unit.guardTargets = [target]
      unit.guardTarget = target
      unit.guardMode = true
      unit.guardOrderMode = action === 'followUnit' ? 'follow' : action === 'serveUnit' ? 'serve' : null
      unit.lastGuardPathCalcTime = 0
      if (unit.type === 'battleship') {
        unit.lastHullTargetId = null
        for (const turret of Object.values(unit.batteries || {})) { turret.targetId = null; turret.salvoStartedAt = null; turret.scheduledAt = null; turret.nextBarrelIndex = 0 }
      }
      ordered.push(unit.id)
    }
    if (ordered.length) recordReplayCommand({
      type: 'unit_command', owner, unitIds: ordered, unitRefs: createReplayUnitReferences(ordered), command: 'guard',
      guardOrderMode: action === 'followUnit' ? 'follow' : action === 'serveUnit' ? 'serve' : null,
      targetRef: createReplayEntityReference(target)
    }, { source: 'human' })
  }
  return true
}
