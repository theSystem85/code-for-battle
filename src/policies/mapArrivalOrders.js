import { executeUnitCommand } from './unitCommandApi.js'
import { TILE_SIZE } from '../config.js'
import { getPolicyEntry, applyPolicyToUnit } from './policyStore.js'

// At most one distance check per ordered unit per tick; no scans or allocations.
export function updateMapArrival(unit) {
  const order = unit.mapArrivalAction
  if (!order) return
  if (!(unit.health > 0)) { unit.mapArrivalAction = null; return }
  const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
  if (tileX !== Math.floor(order.x / TILE_SIZE) || tileY !== Math.floor(order.y / TILE_SIZE)) return
  unit.mapArrivalAction = null
  if (order.action === 'applyAutomationOnArrival') {
    if (getPolicyEntry(order.policyId)) applyPolicyToUnit(order.owner, unit, order.policyId)
  } else {
    executeUnitCommand('mapHold', unit, { order }, {})
  }
}
