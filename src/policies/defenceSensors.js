import { TILE_SIZE } from '../config.js'
import { getSpatialQuadtree } from '../game/spatialQuadtree.js'
import { effectiveMode, paramValue } from './policyConditions.js'
import { isHostile, sameParty } from './policyWorld.js'
import { defenceCapabilityReason } from './defenceCapabilities.js'
import { defenceDistanceSquared } from './defenceCommandApi.js'

const ALLOWED_AIR = new Set(['apache', 'f22Raptor', 'f35'])
const lookup = new Map()
let indexedUnits = null
let indexedTime = -Infinity
const buildingCounts = new Map()
let countedBuildings = null
let countTime = -Infinity
const nearestMemo = new Map()
let memoBuilding = null
let memoContext = null
let memoTime = -Infinity

/** One reusable world lookup per simulation frame, only when automation needs it. */
export function prepareDefenceWorld(context) {
  if (indexedUnits === context.units && indexedTime === context.now) return
  indexedUnits = context.units
  indexedTime = context.now
  lookup.clear()
  for (const unit of context.units || []) if (unit?.id != null) lookup.set(unit.id, unit)
}
export function defenceTargetById(id) { return lookup.get(id) || null }

export function canDefenceTarget(building, target, context, requireRange = true) {
  if (!isHostile(building, target) || target.isBuilding || target.embarkedOnId) return false
  if (target.type === 'submarine' && target.depthState !== 'surfaced') return false
  if (ALLOWED_AIR.has(target.type) && target.flightState !== 'grounded' && building.type !== 'rocketTurret') return false
  const x = target.x + TILE_SIZE / 2
  const y = target.y + TILE_SIZE / 2
  if (!context.isVisible?.(building, x, y)) return false
  const distance = defenceDistanceSquared(building, target)
  if (requireRange && (distance > (building.fireRange * TILE_SIZE) ** 2 || distance < ((building.minFireRange || 0) * TILE_SIZE) ** 2)) return false
  if (building.type.startsWith('turretGun') && context.hasLineOfSight && !context.hasLineOfSight(building, target)) return false
  return true
}

export function nearestDefenceEnemy(building, context, requireRange = false, type = 'any') {
  if (memoBuilding !== building || memoContext !== context || memoTime !== context.now) {
    memoBuilding = building; memoContext = context; memoTime = context.now; nearestMemo.clear()
  }
  const key = `${type}:${requireRange}`
  if (nearestMemo.has(key)) return nearestMemo.get(key)
  const cx = (building.x + building.width / 2) * TILE_SIZE
  const cy = (building.y + building.height / 2) * TILE_SIZE
  const radius = Math.max(building.fireRange || 0, 14) * TILE_SIZE
  const tree = getSpatialQuadtree()
  const ground = tree ? tree.queryNearbyGround(cx, cy, radius) : context.units || []
  const air = tree && building.type === 'rocketTurret' ? tree.queryNearbyAir(cx, cy, radius) : null
  let best = null
  let bestSq = radius * radius
  for (let pass = 0; pass < (air ? 2 : 1); pass++) {
    const candidates = pass === 0 ? ground : air
    for (const unit of candidates) {
      if (type !== 'any' && unit.type !== type && !(type === 'tank_v1' && unit.type === 'tank')) continue
      if (!canDefenceTarget(building, unit, context, requireRange)) continue
      const sq = defenceDistanceSquared(building, unit)
      if (sq < bestSq || (sq === bestSq && String(unit.id) < String(best?.id))) { best = unit; bestSq = sq }
    }
  }
  nearestMemo.set(key, best)
  return best
}

function ownBuildingCount(building, context, type) {
  if (countedBuildings !== context.buildings || context.now - countTime >= 250 || context.now < countTime) {
    countedBuildings = context.buildings
    countTime = context.now
    buildingCounts.clear()
    for (const item of context.buildings || []) {
      if (!(item.health > 0) || item.isBeingSold) continue
      const key = item.owner === 'player' ? 'player1' : item.owner
      buildingCounts.set(`${key}:any`, (buildingCounts.get(`${key}:any`) || 0) + 1)
      buildingCounts.set(`${key}:${item.type}`, (buildingCounts.get(`${key}:${item.type}`) || 0) + 1)
    }
  }
  const owner = building.owner === 'player' ? 'player1' : building.owner
  return buildingCounts.get(`${owner}:${type}`) || 0
}

export function measureDefenceLeaf(building, leaf, context) {
  if (leaf.type === 'compare') {
    const mode = effectiveMode(leaf)
    if (defenceCapabilityReason(building, 'fields', leaf.field, mode)) return undefined
    switch (leaf.field) {
      case 'hp': return mode === 'absolute' ? building.health : building.maxHealth > 0 ? building.health / building.maxHealth : undefined
      case 'ammo': return mode === 'absolute' ? building.ammo : building.maxAmmo > 0 ? building.ammo / building.maxAmmo : undefined
      case 'reload': {
        const remaining = Math.max(0, building.fireCooldown - (context.now - (building.lastShotTime || -Infinity)))
        return mode === 'absolute' ? remaining : building.fireCooldown > 0 ? 1 - remaining / building.fireCooldown : undefined
      }
      case 'turretRotation': return typeof building.turretDirection === 'number' ? ((building.turretDirection * 180 / Math.PI) % 360 + 360) % 360 : undefined
      case 'money': return context.getMoney?.(building.owner)
      case 'power': return context.getPower?.(building.owner)
      case 'buildingCount': return ownBuildingCount(building, context, paramValue(leaf, 'buildingType'))
      case 'distance': if (paramValue(leaf, 'kind') !== 'unit') return undefined
      // Both distance leaves use actual center-based pixel geometry.
      // falls through
      case 'enemyDistance': {
        const enemy = nearestDefenceEnemy(building, context, false, leaf.field === 'distance' ? paramValue(leaf, 'targetType') : 'any')
        return enemy ? Math.sqrt(defenceDistanceSquared(building, enemy)) / TILE_SIZE : Infinity
      }
      default: return undefined
    }
  }
  if (leaf.type === 'check') {
    if (defenceCapabilityReason(building, 'checks', leaf.check)) return undefined
    switch (leaf.check) {
      case 'enemyVisible': return Boolean(nearestDefenceEnemy(building, context, false, paramValue(leaf, 'targetType')))
      case 'enemyInFireRange': return Boolean(nearestDefenceEnemy(building, context, true, paramValue(leaf, 'targetType')))
      case 'canAttack': return paramValue(leaf, 'kind') === 'unit' && !building.holdFire && !(building.automationIntent?.action === 'holdFire') && !(typeof building.maxAmmo === 'number' && building.ammo <= 0) && !((building.type === 'rocketTurret' || building.type === 'teslaCoil') && context.getPower?.(building.owner) < 0) && Boolean(nearestDefenceEnemy(building, context, true))
      case 'attacking': {
        const target = building.forcedAttackTarget || building.firingAt || defenceTargetById(building.automationIntent?.targetId)
        return Boolean(target && target.health > 0 && !sameParty(building.owner, target.owner) && (paramValue(leaf, 'kind') === 'building') === Boolean(target.isBuilding))
      }
      default: return undefined
    }
  }
  return undefined
}
