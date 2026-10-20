import { gameState } from '../gameState.js'
import { focusAndSelectUnit } from '../game/attackNotifications.js'

// Build this list only on a tab click, never while updating or rendering units.
export function focusProducedUnit(controller) {
  const history = (gameState.units || []).map((unit, index) => ({ unit, index }))
    .filter(({ unit }) => unit.owner === gameState.humanPlayer && unit.health > 0 && Number.isFinite(unit.productionCompletedAt))
    .sort((a, b) => b.unit.productionCompletedAt - a.unit.productionCompletedAt || b.index - a.index)
  if (!history.length) return false
  const newest = history[0].unit
  if (controller.productionFocusNewest !== newest.id) {
    controller.productionFocusNewest = newest.id
    controller.productionFocusIndex = 0
  }
  const index = (controller.productionFocusIndex || 0) % history.length
  focusAndSelectUnit(history[index].unit)
  controller.productionFocusIndex = index + 1
  return true
}
