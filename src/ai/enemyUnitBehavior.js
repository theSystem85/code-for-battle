import { updateAIUnitInternal } from './enemyUnitBehaviorCore.js'
import { updateNavalAIUnit } from './enemyNavalBehavior.js'
import { recordAiUnitReplayCommand } from './enemyUnitReplay.js'

function updateAIUnit(unit, units, gameState, mapGrid, now, aiPlayerId, targetedOreTiles, bullets) {
  updateAIUnitInternal(unit, units, gameState, mapGrid, now, aiPlayerId, targetedOreTiles, bullets)
  recordAiUnitReplayCommand(unit, mapGrid)
}

export { updateAIUnit, updateNavalAIUnit }
