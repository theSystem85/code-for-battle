// Connects the policy sensors and the unit command API to the running game.
// Kept apart from policyEngine.js so the engine and its tests never import
// combat, rendering or fog-of-war modules.

import { BUILDING_PROXIMITY_RANGE, TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { COMBAT_CONFIG } from '../game/unitCombat/combatConfig.js'
import {
  canUnitTargetEntity,
  getEffectiveFireRange,
  getEffectiveFireRate
} from '../game/unitCombat/combatHelpers.js'
import { handleTankFiring } from '../game/unitCombat/firingHandlers.js'
import { getUnitVisionRange, isPositionVisibleToPlayer } from '../game/shadowOfWar.js'
import { getExperienceProgress } from '../utils.js'
import { TURRET_TANK_TYPES, entityCenter, isBuildingEntity } from './policyWorld.js'

const aimTarget = { id: 'policy-aim', x: 0, y: 0, tileX: 0, tileY: 0, health: 1 }
const centerScratch = { x: 0, y: 0 }

function partyState(owner) {
  const parties = gameState.partyStates
  if (!Array.isArray(parties)) return null
  for (let i = 0; i < parties.length; i++) {
    if (parties[i].partyId === owner) return parties[i]
  }
  return null
}

function getMoney(owner) {
  const party = partyState(owner)
  if (party && Number.isFinite(party.money)) return party.money
  return owner === gameState.humanPlayer ? Number(gameState.money) || 0 : undefined
}

function getPower(owner) {
  return owner === gameState.humanPlayer ? gameState.playerPowerSupply || 0 : gameState.enemyPowerSupply || 0
}

/** Tanks only: the rate the weapon needs between shots, or null for other units. */
function getFireRate(unit) {
  if (!TURRET_TANK_TYPES.has(unit.type)) return null
  return getEffectiveFireRate(unit, COMBAT_CONFIG.FIRE_RATES.STANDARD)
}

/**
 * What the owner can see. The human player sees through the shadow of war; any
 * other party is approximated by the unit's own vision range.
 */
function isVisible(unit, px, py, context) {
  if (unit.owner === gameState.humanPlayer) {
    return isPositionVisibleToPlayer(gameState, context.mapGrid, px, py)
  }
  const range = getUnitVisionRange(unit) * TILE_SIZE
  return (px - unit.x - TILE_SIZE / 2) ** 2 + (py - unit.y - TILE_SIZE / 2) ** 2 <= range * range
}

function getVisionRange(entity) {
  if (isBuildingEntity(entity)) return Math.max(BUILDING_PROXIMITY_RANGE, entity.fireRange || 0)
  return getUnitVisionRange(entity)
}

function fire(unit, target, aim, context) {
  const rate = getEffectiveFireRate(unit, COMBAT_CONFIG.FIRE_RATES.STANDARD)
  const bullets = context.bullets
  if (!Array.isArray(bullets)) return false
  if (aim) {
    aimTarget.x = aim.x - TILE_SIZE / 2
    aimTarget.y = aim.y - TILE_SIZE / 2
    return handleTankFiring(unit, aimTarget, bullets, context.now, rate, aim.x, aim.y, 'bullet', context.units, context.mapGrid, false, aim, true)
  }
  entityCenter(target, centerScratch)
  return handleTankFiring(unit, target, bullets, context.now, rate, centerScratch.x, centerScratch.y, 'bullet', context.units, context.mapGrid, false, null, null)
}

/** Install the game helpers on the shared policy context (once). */
export function installPolicyGameBindings(context) {
  context.getFireRange = getEffectiveFireRange
  context.getFireRate = getFireRate
  context.canTarget = canUnitTargetEntity
  context.isVisible = (unit, px, py) => isVisible(unit, px, py, context)
  context.getVisionRange = getVisionRange
  context.getMoney = getMoney
  context.getPower = getPower
  context.getXpProgress = getExperienceProgress
  context.fire = (unit, target, aim) => fire(unit, target, aim, context)
  return context
}
