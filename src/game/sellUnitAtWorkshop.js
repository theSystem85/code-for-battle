import { clearAirstripSlotOccupant, releaseAirstripParkingSlotReservation, releaseAirstripRunwayOperation, releaseC5ParkingSlots } from '../utils/airstripUtils.js'
import { getBuildingIdentifier } from '../utils.js'
import { removeUnitFromGame } from './gameStateManager.js'
import { interruptHarvesterAutomation } from './harvesterLogic.js'
import { normalizeServiceOwner } from './serviceUnitIndex.js'
import { releaseWreckAssignment } from './unitWreckManager.js'
import { getWorkshopUnitSalePrice } from './workshopUnitSales.js'

export function sellUnitAtWorkshop(unitId, owner, units, state, factories = state.factories) {
  const index = units.findIndex(unit => unit?.id === unitId)
  const unit = units[index]
  const price = getWorkshopUnitSalePrice(unit, state.buildings, owner)
  if (!price) return 0

  const local = normalizeServiceOwner(owner) === normalizeServiceOwner(state.humanPlayer)
  const factory = local ? null : factories?.find(candidate =>
    normalizeServiceOwner(candidate.owner || candidate.id) === normalizeServiceOwner(owner)
  )
  if (!local && !Number.isFinite(factory?.budget)) return 0

  if (unit.type === 'harvester') interruptHarvesterAutomation(unit, state)
  if (unit.type === 'recoveryTank') {
    for (const wreck of state.unitWrecks || []) {
      if (wreck?.assignedTankId === unit.id || wreck?.towedBy === unit.id) releaseWreckAssignment(wreck)
    }
  }
  if (unit.airstripId) {
    const airstrip = state.buildings?.find(building => building.type === 'airstrip' && getBuildingIdentifier(building) === unit.airstripId)
    if (airstrip) {
      if (unit.type === 'c5Galaxy') {
        releaseC5ParkingSlots(airstrip, unit.id)
      } else {
        clearAirstripSlotOccupant(airstrip, unit.id)
        releaseAirstripParkingSlotReservation(airstrip, unit.id)
      }
      releaseAirstripRunwayOperation(airstrip, unit.id)
    }
  }
  unit.health = 0
  unit.selected = false
  removeUnitFromGame(unit, index, units, state)

  if (local) state.money = (state.money || 0) + price
  else factory.budget += price
  return price
}
