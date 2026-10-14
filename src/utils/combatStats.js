import { recordMusicDamage } from '../audio/musicDirector.js'
import { gameState } from '../gameState.js'
import { TILE_SIZE } from '../config.js'
import { buildingData } from '../data/buildingData.js'
import { getUnitCost } from '../utils.js'

function getTargetCost(target) {
  if (!target) return 0
  if (typeof target.baseCost === 'number') return target.baseCost
  if (target.type && buildingData[target.type]?.cost) return buildingData[target.type].cost
  if (target.type) return getUnitCost(target.type) || 0
  if (typeof target.cost === 'number') return target.cost
  return 0
}

function getTargetMaxHealth(target) {
  if (!target) return 1
  if (typeof target.maxHealth === 'number' && target.maxHealth > 0) return target.maxHealth
  if (typeof target.health === 'number' && target.health > 0) return target.health
  return 1
}

export function recordDamageValue(shooter, target, healthDamage) {
  if (!shooter || !target) return
  if (!shooter.owner || !target.owner) return
  if (shooter.owner === target.owner) return
  const damage = Math.max(0, healthDamage || 0)
  if (damage <= 0) return
  recordMusicDamage(shooter, target, damage, gameState, TILE_SIZE)
  const maxHealth = getTargetMaxHealth(target)
  const targetCost = getTargetCost(target)
  if (!targetCost) return
  const damageValue = (damage / maxHealth) * targetCost
  shooter.damageValue = (shooter.damageValue || 0) + damageValue
}
