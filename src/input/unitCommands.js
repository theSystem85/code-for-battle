import { UTILITY_QUEUE_MODES, computeUtilityApproachPath, getUnitTilePosition } from './unitCommands/utilityHelpers.js'
import {
  clearAttackGroupState as clearAttackGroupStateImpl,
  cancelRecoveryTask,
  ensureUtilityQueueState,
  clearUtilityQueueState,
  cancelCurrentUtilityTask,
  canAmbulanceProvideCrew as canAmbulanceProvideCrewImpl,
  canTankerProvideFuel as canTankerProvideFuelImpl,
  canRecoveryTankRepair as canRecoveryTankRepairImpl,
  canAmmunitionTruckOperate as canAmmunitionTruckOperateImpl,
  canAmmunitionTruckProvideAmmo as canAmmunitionTruckProvideAmmoImpl,
  isUtilityTargetValid as isUtilityTargetValidImpl,
  findUnitById as findUnitByIdImpl,
  assignAmbulanceToTarget,
  assignTankerToTarget,
  assignAmmunitionTruckToTarget,
  assignRecoveryTankToTarget,
  assignRecoveryTankToWreck,
  startUtilityTaskForMode,
  startNextUtilityTask,
  setUtilityQueue,
  advanceUtilityQueue,
  findBestUtilityAssignment,
  planUtilityAssignments,
  queueUtilityTargets,
  getUtilityQueuePosition,
  issueTankerKamikazeCommand
} from './unitCommands/utilityQueue.js'
import { noteDirectOrder } from '../policies/policyEngine.js'
import { handleMovementCommand } from './unitCommands/movementCommands.js'
import {
  handleAttackCommand,
  calculateSemicircleFormation,
  getTargetPoint as getTargetPointImpl,
  isEnemyTargetForUnit as isEnemyTargetForUnitImpl
} from './unitCommands/attackCommands.js'
import { assignApacheFlight, handleApacheHelipadCommand } from './unitCommands/airCommands.js'
import {
  handleRefineryUnloadCommand,
  handleHarvesterCommand,
  handleRepairWorkshopCommand,
  handleWorkshopRepairHotkey,
  handleAmbulanceHealCommand,
  handleTankerRefuelCommand,
  handleAmmunitionTruckResupplyCommand,
  handleAmmunitionTruckReloadCommand,
  handleServiceProviderRequest,
  handleAmbulanceRefillCommand,
  handleGasStationRefillCommand,
  handleRecoveryTowCommand,
  handleRecoveryTankRepairCommand,
  handleRecoveryWreckTowCommand,
  handleRecoveryWreckRecycleCommand,
  handleDamagedUnitToRecoveryTankCommand
} from './unitCommands/supportCommands.js'

export class UnitCommandsHandler {
  constructor() {
    this.isAttackGroupOperation = false
  }
}

const proto = UnitCommandsHandler.prototype

// Every handler below is a direct order. Policy-issued orders are ignored by
// noteDirectOrder, so policies never register as their own direct orders.
function recordDirectOrder(units, result) {
  noteDirectOrder(units)
  return result
}

proto.clearAttackGroupState = clearAttackGroupStateImpl
proto.cancelRecoveryTask = cancelRecoveryTask
proto.ensureUtilityQueueState = ensureUtilityQueueState
proto.clearUtilityQueueState = clearUtilityQueueState
proto.cancelCurrentUtilityTask = cancelCurrentUtilityTask
proto.canAmbulanceProvideCrew = canAmbulanceProvideCrewImpl
proto.canTankerProvideFuel = canTankerProvideFuelImpl
proto.canRecoveryTankRepair = canRecoveryTankRepairImpl
proto.canAmmunitionTruckOperate = canAmmunitionTruckOperateImpl
proto.canAmmunitionTruckProvideAmmo = canAmmunitionTruckProvideAmmoImpl
proto.isUtilityTargetValid = isUtilityTargetValidImpl
proto.findUnitById = findUnitByIdImpl
proto.assignAmbulanceToTarget = assignAmbulanceToTarget
proto.assignTankerToTarget = assignTankerToTarget
proto.assignAmmunitionTruckToTarget = assignAmmunitionTruckToTarget
proto.assignRecoveryTankToTarget = assignRecoveryTankToTarget
proto.assignRecoveryTankToWreck = assignRecoveryTankToWreck
proto.startUtilityTaskForMode = function(...args) { return startUtilityTaskForMode(this, ...args) }
proto.startNextUtilityTask = function(...args) { return startNextUtilityTask(this, ...args) }
proto.setUtilityQueue = function(...args) { return setUtilityQueue(this, ...args) }
proto.advanceUtilityQueue = function(...args) { return advanceUtilityQueue(this, ...args) }
proto.findBestUtilityAssignment = function(...args) { return findBestUtilityAssignment(...args) }
proto.planUtilityAssignments = function(...args) { return planUtilityAssignments(...args) }
proto.queueUtilityTargets = function(...args) { return queueUtilityTargets(this, ...args) }
proto.getUtilityQueuePosition = function(...args) { return getUtilityQueuePosition(...args) }
proto.issueTankerKamikazeCommand = function(...args) { return issueTankerKamikazeCommand(...args) }
proto.handleMovementCommand = function(...args) { return recordDirectOrder(args[0], handleMovementCommand(this, ...args)) }
proto.handleAttackCommand = function(...args) { return recordDirectOrder(args[0], handleAttackCommand(this, ...args)) }
proto.assignApacheFlight = function(...args) { return assignApacheFlight(...args) }
proto.handleApacheHelipadCommand = function(...args) { return recordDirectOrder(args[0], handleApacheHelipadCommand(this, ...args)) }
proto.handleRefineryUnloadCommand = function(...args) { return recordDirectOrder(args[0], handleRefineryUnloadCommand(this, ...args)) }
proto.handleHarvesterCommand = function(...args) { return recordDirectOrder(args[0], handleHarvesterCommand(this, ...args)) }
proto.handleRepairWorkshopCommand = function(...args) { return recordDirectOrder(args[0], handleRepairWorkshopCommand(this, ...args)) }
proto.handleWorkshopRepairHotkey = function(...args) { return recordDirectOrder(args[0], handleWorkshopRepairHotkey(this, ...args)) }
proto.handleAmbulanceHealCommand = function(...args) { return recordDirectOrder(args[0], handleAmbulanceHealCommand(this, ...args)) }
proto.handleTankerRefuelCommand = function(...args) { return recordDirectOrder(args[0], handleTankerRefuelCommand(this, ...args)) }
proto.handleAmmunitionTruckResupplyCommand = function(...args) { return recordDirectOrder(args[0], handleAmmunitionTruckResupplyCommand(this, ...args)) }
proto.handleAmmunitionTruckReloadCommand = function(...args) { return recordDirectOrder(args[0], handleAmmunitionTruckReloadCommand(this, ...args)) }
proto.handleServiceProviderRequest = function(...args) { return recordDirectOrder(args[1], handleServiceProviderRequest(this, ...args)) }
proto.handleAmbulanceRefillCommand = function(...args) { return recordDirectOrder(args[0], handleAmbulanceRefillCommand(this, ...args)) }
proto.handleGasStationRefillCommand = function(...args) { return recordDirectOrder(args[0], handleGasStationRefillCommand(this, ...args)) }
proto.handleRecoveryTowCommand = function(...args) { return recordDirectOrder(args[0], handleRecoveryTowCommand(this, ...args)) }
proto.handleRecoveryTankRepairCommand = function(...args) { return recordDirectOrder(args[0], handleRecoveryTankRepairCommand(this, ...args)) }
proto.handleRecoveryWreckTowCommand = function(...args) { return recordDirectOrder(args[0], handleRecoveryWreckTowCommand(this, ...args)) }
proto.handleRecoveryWreckRecycleCommand = function(...args) { return recordDirectOrder(args[0], handleRecoveryWreckRecycleCommand(this, ...args)) }
proto.handleDamagedUnitToRecoveryTankCommand = function(...args) { return recordDirectOrder(args[0], handleDamagedUnitToRecoveryTankCommand(this, ...args)) }
proto.calculateSemicircleFormation = function(...args) { return calculateSemicircleFormation(...args) }
proto.getTargetPoint = function(...args) { return getTargetPointImpl(...args) }
proto.isEnemyTargetForUnit = function(...args) { return isEnemyTargetForUnitImpl(...args) }

export {
  UTILITY_QUEUE_MODES,
  computeUtilityApproachPath,
  getUnitTilePosition
}

export function clearAttackGroupState(unitsParam) {
  const handler = new UnitCommandsHandler()
  return handler.clearAttackGroupState(unitsParam)
}

export function canAmbulanceProvideCrew(ambulance) {
  const handler = new UnitCommandsHandler()
  return handler.canAmbulanceProvideCrew(ambulance)
}

export function canTankerProvideFuel(tanker) {
  const handler = new UnitCommandsHandler()
  return handler.canTankerProvideFuel(tanker)
}

export function canRecoveryTankRepair(tank) {
  const handler = new UnitCommandsHandler()
  return handler.canRecoveryTankRepair(tank)
}

export function canAmmunitionTruckOperate(ammoTruck) {
  const handler = new UnitCommandsHandler()
  return handler.canAmmunitionTruckOperate(ammoTruck)
}

export function canAmmunitionTruckProvideAmmo(ammoTruck) {
  const handler = new UnitCommandsHandler()
  return handler.canAmmunitionTruckProvideAmmo(ammoTruck)
}

export function isEnemyTargetForUnit(target, unit) {
  const handler = new UnitCommandsHandler()
  return handler.isEnemyTargetForUnit(target, unit)
}

export function getTargetPoint(target, unitCenter) {
  const handler = new UnitCommandsHandler()
  return handler.getTargetPoint(target, unitCenter)
}

export function findUnitById(id) {
  const handler = new UnitCommandsHandler()
  return handler.findUnitById(id)
}
