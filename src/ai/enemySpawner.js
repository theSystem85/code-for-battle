import { TILE_SIZE } from '../config.js'
import { getCachedPath } from '../game/pathfinding.js'
import { findClosestOre } from '../logic.js'
import { assignHarvesterToOptimalRefinery } from '../game/harvesterLogic.js'
import { spawnUnit } from '../units.js'

export function spawnEnemyUnit(spawnBuilding, unitType, units, mapGrid, gameState, productionStartTime, aiPlayerId) {
  const unit = spawnUnit(
    spawnBuilding,
    unitType,
    units,
    mapGrid,
    null,
    gameState?.occupancyMap,
    {}
  )

  if (!unit) {
    return null
  }

  unit.owner = aiPlayerId
  unit.spawnTime = Date.now()
  unit.spawnedInFactory = true
  unit.holdInFactory = true
  unit.factoryBuildEndTime = productionStartTime + 5000
  unit.lastPathCalcTime = 0
  unit.lastPositionCheckTime = 0
  unit.lastTargetChangeTime = 0
  unit.lastDecisionTime = 0
  unit.effectiveSpeed = unit.speed

  // Combat units must be allowed to fire — the combat code gates AI firing
  // behind `unit.allowedToAttack === true`. Without this they will aim but never shoot.
  const nonCombatTypes = new Set(['harvester', 'ambulance', 'tankerTruck', 'recoveryTank', 'mineLayer', 'mineSweeper', 'ammunitionTruck'])
  if (!nonCombatTypes.has(unitType)) {
    unit.allowedToAttack = true
  }

  if (unitType === 'harvester') {
    const aiGameState = { buildings: gameState?.buildings?.filter(b => b.owner === aiPlayerId) || [] }
    assignHarvesterToOptimalRefinery(unit, aiGameState)
    const targetedOreTiles = gameState?.targetedOreTiles || {}
    const orePos = findClosestOre(unit, mapGrid, targetedOreTiles, unit.assignedRefinery)
    if (orePos) {
      const tileKey = `${orePos.x},${orePos.y}`
      if (gameState?.targetedOreTiles) {
        gameState.targetedOreTiles[tileKey] = unit.id
      }
      const newPath = getCachedPath(
        { x: unit.tileX, y: unit.tileY, owner: unit.owner },
        orePos,
        mapGrid,
        null,
        { unitOwner: unit.owner }
      )
      if (newPath.length > 1) {
        unit.path = newPath.slice(1)
        unit.oreField = orePos
      }
    }
  }

  if (unitType === 'tank_v1' && gameState) {
    const harvesterHunterQueuedKey = `${aiPlayerId}HarvesterHunterQueued`
    if (gameState[harvesterHunterQueuedKey]) {
      unit.harvesterHunter = true
      unit.lastSafeTile = { x: unit.tileX, y: unit.tileY }
      gameState[harvesterHunterQueuedKey] = false
    }
  }

  // Keep air units pinned to pad/strip while grounded so they never wander across grass.
  if ((unitType === 'apache' || unitType === 'f22Raptor') && unit.flightState === 'grounded') {
    unit.path = []
    unit.moveTarget = null
    unit.x = Math.floor(unit.x / TILE_SIZE) * TILE_SIZE
    unit.y = Math.floor(unit.y / TILE_SIZE) * TILE_SIZE
  }

  if (window.cheatSystem && window.cheatSystem.isGodModeActive()) {
    window.cheatSystem.addUnitToGodMode(unit)
  }

  return unit
}
