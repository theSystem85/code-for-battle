// unitCombat.js - Handles all unit combat and targeting logic
import { logPerformance } from '../performanceUtils.js'
import { gameState } from '../gameState.js'
import { handleTeslaEffects, processAttackQueue, updateGuardTargeting } from './unitCombat/combatState.js'
import { updateTankCombat, updateTankV2Combat, updateTankV3Combat, updateRocketTankCombat } from './unitCombat/tankCombat.js'
import { updateApacheCombat } from './unitCombat/apacheCombat.js'
import { updateHowitzerCombat } from './unitCombat/howitzerCombat.js'

/**
 * Clean up attack group targets that have been destroyed
 */
export function cleanupAttackGroupTargets() {
  if (gameState.attackGroupTargets && gameState.attackGroupTargets.length > 0) {
    gameState.attackGroupTargets = gameState.attackGroupTargets.filter(target =>
      target && target.health > 0
    )
  }
}

/**
 * Updates unit combat behavior including targeting and shooting
 */
export const updateUnitCombat = logPerformance(function updateUnitCombat(units, bullets, mapGrid, gameState, now) {
  const occupancyMap = gameState.occupancyMap

  units.forEach(unit => {
    // Skip if unit has no combat capabilities
    if (unit.type === 'harvester') return

    // Handle status effects
    handleTeslaEffects(unit, now)

    // Process attack queue for units with queued targets
    processAttackQueue(unit, units, mapGrid)

    updateGuardTargeting(unit, units)

    // Combat logic for different unit types
    if (unit.type === 'tank' || unit.type === 'tank_v1') {
      updateTankCombat(unit, units, bullets, mapGrid, now, occupancyMap)
    } else if (unit.type === 'tank-v2') {
      updateTankV2Combat(unit, units, bullets, mapGrid, now, occupancyMap)
    } else if (unit.type === 'tank-v3') {
      updateTankV3Combat(unit, units, bullets, mapGrid, now, occupancyMap)
    } else if (unit.type === 'rocketTank') {
      updateRocketTankCombat(unit, units, bullets, mapGrid, now, occupancyMap)
    } else if (unit.type === 'apache') {
      updateApacheCombat(unit, units, bullets, mapGrid, now, occupancyMap)
    } else if (unit.type === 'f22Raptor') {
      updateRocketTankCombat(unit, units, bullets, mapGrid, now, occupancyMap)
    } else if (unit.type === 'howitzer') {
      updateHowitzerCombat(unit, units, bullets, mapGrid, now, occupancyMap)
    }
  })
}, false)
