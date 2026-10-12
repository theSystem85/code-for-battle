// Finalize a paid player building, whether placed manually or by a blueprint policy.
import { createBuilding, placeBuilding, updatePowerSupply, buildingData } from '../buildings.js'
import { updateDangerZoneMaps } from './dangerZoneMap.js'
import { broadcastBuildingPlace } from '../network/gameCommandSync.js'
import { playSound } from '../sound.js'
import { showNotification } from '../ui/notifications.js'
import { savePlayerBuildPatterns } from '../savePlayerBuildPatterns.js'

export function constructPlayerBuilding(type, x, y, state, mapGrid, controller, completionReceiptId = null) {
  const building = createBuilding(type, x, y)
  building.owner = state.humanPlayer
  if (!state.buildings) state.buildings = []
  state.buildings.push(building)
  placeBuilding(building, mapGrid, state.occupancyMap)
  updatePowerSupply(state.buildings, state)
  updateDangerZoneMaps(state)
  if (completionReceiptId) broadcastBuildingPlace(type, x, y, state.humanPlayer, { receiptId: completionReceiptId, itemId: `${completionReceiptId}:building` })
  else broadcastBuildingPlace(type, x, y, state.humanPlayer)
  state.pendingButtonUpdate = true
  if (controller) {
    controller.updateBuildingButtonStates()
    controller.syncTechTreeWithBuildings()
  }
  if (type !== 'street') playSound('buildingPlaced')
  showNotification(`${buildingData[type].displayName} constructed`)
  savePlayerBuildPatterns(type)
  return building
}
