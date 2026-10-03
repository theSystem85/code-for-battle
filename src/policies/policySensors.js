// Sensors: measure unit policy conditions from real unit and world fields.
//
// measureLeaf(condition) returns a number (compare leaves), a boolean (check
// leaves) or undefined when the unit cannot be measured that way. An
// unavailable measurement is never true (see policyConditions.js).
//
// Hot path: measureLeaf runs for units that carry enabled policies, at most
// once per POLICY_EVAL_INTERVAL_MS per unit, and only for the leaves a policy
// actually uses. Everything that spans many entities (served units, protected
// units, building counts, visible enemy counts) comes from indexes that are
// rebuilt at most every INDEX_REFRESH_MS and reuse their containers.
//
// Game helpers that live in heavy modules (fire range, visibility, money) are
// injected through the policy context so this file stays testable.

import { TANK_FIRE_RANGE, TILE_SIZE, BUILDING_PROXIMITY_RANGE } from '../config.js'
import { getServiceRadiusPixels } from '../utils/serviceRadius.js'
import { getSpatialQuadtree } from '../game/spatialQuadtree.js'
import { DEFENSE_BUILDING_TYPES, effectiveMode, paramValue } from './policyConditions.js'
import {
  AIR_UNIT_TYPES,
  COMBAT_UNIT_TYPES,
  SERVICE_UNIT_TYPES,
  TURRET_TANK_TYPES,
  entityCenter,
  findNearestEnemy,
  isBuildingEntity,
  isHostile,
  sameParty,
  unitCenter
} from './policyWorld.js'

export const INDEX_REFRESH_MS = 250
export const HIT_WINDOW_MS = 3000
export const DISTANCE_SCAN_TILES = 30
export const DEFENSE_UNIT_SUPPORT_TILES = 3

const AIR_TYPES = AIR_UNIT_TYPES
const COMBAT_TYPES = COMBAT_UNIT_TYPES

const scope = {
  unit: null,
  context: null,
  now: 0,
  enemyScanned: false,
  enemy: null,
  enemyDistance: Infinity,
  enemyInRange: false
}

const scratch = []
const scratchEnemies = []
const point = { x: 0, y: 0 }

const index = {
  time: -Infinity,
  version: 0,
  served: new Set(),
  servedBy: new Set(),
  servedValid: false,
  protectedIds: new Set(),
  protectedValid: false,
  counts: new Map(),
  countsValid: false,
  visibleEnemies: new Map(),
  visibleValid: false
}

export function resetSensorIndexes() {
  index.time = -Infinity
  index.servedValid = false
  index.protectedValid = false
  index.countsValid = false
  index.visibleValid = false
}

/** Prepare the sensors for one unit. Cheap: no scans happen here. */
export function beginUnitScope(unit, context, now) {
  scope.unit = unit
  scope.context = context
  scope.now = now
  scope.enemyScanned = false
  scope.enemy = null
  scope.enemyDistance = Infinity
  scope.enemyInRange = false
  if (now - index.time >= INDEX_REFRESH_MS || now < index.time) {
    index.time = now
    index.servedValid = false
    index.protectedValid = false
    index.countsValid = false
    index.visibleValid = false
  }
}

export function getScopeEnemy() {
  ensureEnemy()
  return scope.enemy
}

/** Nearest enemy unit, its distance in tiles and whether it is in fire range. */
function ensureEnemy() {
  if (scope.enemyScanned) return
  scope.enemyScanned = true
  const { unit, context } = scope
  const enemy = findNearestEnemy(unit, context.units)
  scope.enemy = enemy
  if (!enemy) return
  const center = unitCenter(unit)
  const distance = Math.hypot(enemy.x + TILE_SIZE / 2 - center.x, enemy.y + TILE_SIZE / 2 - center.y)
  scope.enemyDistance = distance / TILE_SIZE
  scope.enemyInRange = distance <= fireRangePx(unit)
}

export function getScopeEnemyDistanceTiles() {
  ensureEnemy()
  return scope.enemyDistance
}

export function isScopeEnemyInRange() {
  ensureEnemy()
  return scope.enemyInRange
}

function defaultFireRange(unit) {
  return TANK_FIRE_RANGE * TILE_SIZE * (unit.rangeMultiplier || 1)
}

export function fireRangePx(unit) {
  const fn = scope.context && scope.context.getFireRange
  return fn ? fn(unit) : defaultFireRange(unit)
}

function isVisibleToOwner(unit, px, py) {
  const fn = scope.context && scope.context.isVisible
  return fn ? fn(unit, px, py) : true
}

function toDegrees(radians) {
  return (((radians * 180) / Math.PI) % 360 + 360) % 360
}

function signedDegrees(radians) {
  let value = ((radians * 180) / Math.PI) % 360
  if (value > 180) value -= 360
  if (value < -180) value += 360
  return value
}

export function hasTurret(unit) {
  return TURRET_TANK_TYPES.has(unit.type) && typeof unit.turretDirection === 'number'
}

function relativeOrAbsolute(condition, value, max) {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined
  if (effectiveMode(condition) === 'relative') {
    return typeof max === 'number' && max > 0 ? value / max : undefined
  }
  return value
}

function crewCounts(unit) {
  const crew = unit.crew
  if (!crew || typeof crew !== 'object') return null
  let present = 0
  let total = 0
  for (const key in crew) {
    total += 1
    if (crew[key]) present += 1
  }
  return total > 0 ? { present, total } : null
}

function loadValues(unit) {
  switch (unit.type) {
    case 'harvester': return { value: unit.oreCarried, max: unit.cargoCapacity }
    case 'ambulance': return { value: unit.medics, max: unit.maxMedics }
    case 'tankerTruck': return { value: unit.supplyGas, max: unit.maxSupplyGas }
    case 'ammunitionTruck': return { value: unit.ammoCargo, max: unit.maxAmmoCargo }
    default: return null
  }
}

function reloadValues(unit) {
  const rate = scope.context && scope.context.getFireRate ? scope.context.getFireRate(unit) : null
  if (typeof rate !== 'number' || !(rate > 0)) return null
  const elapsed = unit.lastShotTime ? scope.now - unit.lastShotTime : rate
  return { rate, elapsed: Math.max(0, elapsed) }
}

function partyMoney(owner) {
  const fn = scope.context && scope.context.getMoney
  return fn ? fn(owner) : undefined
}

function partyPower(owner) {
  const fn = scope.context && scope.context.getPower
  return fn ? fn(owner) : undefined
}

function eachBuilding(context, visit) {
  const buildings = context.buildings
  if (buildings) {
    for (let i = 0; i < buildings.length; i++) visit(buildings[i])
  }
  const factories = context.factories
  if (factories && factories !== buildings) {
    for (let i = 0; i < factories.length; i++) {
      if (!buildings || !buildings.includes(factories[i])) visit(factories[i])
    }
  }
}

function ownerKey(owner) {
  return String(owner)
}

function ensureCounts() {
  if (index.countsValid) return
  index.countsValid = true
  index.counts.forEach(map => map.clear())
  eachBuilding(scope.context, building => {
    if (!building || !(building.health > 0) || !building.owner) return
    const key = ownerKey(building.owner)
    let map = index.counts.get(key)
    if (!map) {
      map = new Map()
      index.counts.set(key, map)
    }
    map.set(building.type, (map.get(building.type) || 0) + 1)
    map.set('any', (map.get('any') || 0) + 1)
  })
}

function buildingCount(owner, type) {
  ensureCounts()
  const map = index.counts.get(ownerKey(owner))
  return map ? map.get(type) || 0 : 0
}

function ensureServed() {
  if (index.servedValid) return
  index.servedValid = true
  index.served.clear()
  index.servedBy.clear()
  const { units, buildings } = scope.context
  if (units) {
    for (let i = 0; i < units.length; i++) {
      const provider = units[i]
      if (!provider || !(provider.health > 0)) continue
      const queue = provider.utilityQueue
      if (queue && queue.currentTargetId != null) {
        index.served.add(queue.currentTargetId)
        index.servedBy.add(queue.currentTargetId)
      }
      if (provider.refueling) index.served.add(provider.id)
    }
  }
  if (buildings) {
    for (let i = 0; i < buildings.length; i++) {
      const building = buildings[i]
      if (!building || !(building.health > 0)) continue
      if (building.type === 'vehicleWorkshop' && Array.isArray(building.repairSlots)) {
        for (let j = 0; j < building.repairSlots.length; j++) {
          const slotUnit = building.repairSlots[j] && building.repairSlots[j].unit
          if (slotUnit) index.served.add(slotUnit.id)
        }
      } else if (building.type === 'hospital' && Array.isArray(building.healingUnits)) {
        for (let j = 0; j < building.healingUnits.length; j++) {
          index.served.add(building.healingUnits[j].unitId)
        }
      }
    }
  }
}

function ensureProtected() {
  if (index.protectedValid) return
  index.protectedValid = true
  index.protectedIds.clear()
  const units = scope.context.units
  if (!units) return
  for (let i = 0; i < units.length; i++) {
    const guard = units[i]
    if (!guard || !guard.guardMode || !(guard.health > 0)) continue
    if (guard.guardTarget && guard.guardTarget.id != null) index.protectedIds.add(guard.guardTarget.id)
    if (Array.isArray(guard.guardTargets)) {
      for (let j = 0; j < guard.guardTargets.length; j++) {
        if (guard.guardTargets[j] && guard.guardTargets[j].id != null) index.protectedIds.add(guard.guardTargets[j].id)
      }
    }
  }
}

function ensureVisibleEnemies() {
  if (index.visibleValid) return
  index.visibleValid = true
  index.visibleEnemies.forEach(map => map.clear())
  const { unit, context } = scope
  const units = context.units
  if (!units) return
  const key = ownerKey(unit.owner)
  let map = index.visibleEnemies.get(key)
  if (!map) {
    map = new Map()
    index.visibleEnemies.set(key, map)
  }
  for (let i = 0; i < units.length; i++) {
    const other = units[i]
    if (!isHostile(unit, other)) continue
    if (!isVisibleToOwner(unit, other.x + TILE_SIZE / 2, other.y + TILE_SIZE / 2)) continue
    map.set('any', (map.get('any') || 0) + 1)
    map.set(other.type, (map.get(other.type) || 0) + 1)
  }
}

function visibleEnemyCount(type) {
  ensureVisibleEnemies()
  const map = index.visibleEnemies.get(ownerKey(scope.unit.owner))
  return map ? map.get(type) || 0 : 0
}

function collectNearbyInto(out, x, y, radius, excludeId) {
  out.length = 0
  const tree = getSpatialQuadtree()
  if (tree) {
    const ground = tree.queryNearbyGround(x, y, radius, excludeId)
    for (let i = 0; i < ground.length; i++) out.push(ground[i])
    const air = tree.queryNearbyAir(x, y, radius, excludeId)
    for (let i = 0; i < air.length; i++) out.push(air[i])
  } else {
    const units = scope.context.units || []
    const radiusSq = radius * radius
    for (let i = 0; i < units.length; i++) {
      const other = units[i]
      if (!other || other.id === excludeId) continue
      if ((other.x + TILE_SIZE / 2 - x) ** 2 + (other.y + TILE_SIZE / 2 - y) ** 2 <= radiusSq) out.push(other)
    }
  }
  return out
}

function collectNearby(x, y, radius, excludeId) {
  return collectNearbyInto(scratch, x, y, radius, excludeId)
}

function matchesType(entity, type) {
  return type === 'any' || type === undefined || entity.type === type
}

function canTarget(unit, target) {
  const fn = scope.context && scope.context.canTarget
  return fn ? fn(unit, target) : true
}

/** Nearest visible enemy unit of `type` within `tiles`, or null. */
function nearestVisibleEnemyUnit(type, tiles) {
  const { unit } = scope
  const center = unitCenter(unit)
  const list = collectNearby(center.x, center.y, tiles * TILE_SIZE, unit.id)
  let best = null
  let bestSq = Infinity
  for (let i = 0; i < list.length; i++) {
    const other = list[i]
    if (!isHostile(unit, other) || !matchesType(other, type)) continue
    const cx = other.x + TILE_SIZE / 2
    const cy = other.y + TILE_SIZE / 2
    if (!isVisibleToOwner(unit, cx, cy)) continue
    const distSq = (cx - center.x) ** 2 + (cy - center.y) ** 2
    if (distSq < bestSq) {
      best = other
      bestSq = distSq
    }
  }
  return best
}

/** Nearest visible enemy building of `type` within `tiles`, or null. */
function nearestVisibleEnemyBuilding(type, tiles) {
  const { unit, context } = scope
  const center = unitCenter(unit)
  const limitSq = (tiles * TILE_SIZE) ** 2
  let best = null
  let bestSq = Infinity
  eachBuilding(context, building => {
    if (!isHostile(unit, building) || !matchesType(building, type)) return
    entityCenter(building, point)
    if (!isVisibleToOwner(unit, point.x, point.y)) return
    const distSq = (point.x - center.x) ** 2 + (point.y - center.y) ** 2
    if (distSq <= limitSq && distSq < bestSq) {
      best = building
      bestSq = distSq
    }
  })
  return best
}

function distanceToEntity(entity) {
  const center = unitCenter(scope.unit)
  entityCenter(entity, point)
  return Math.hypot(point.x - center.x, point.y - center.y)
}

function visionRangeTiles(entity) {
  const fn = scope.context && scope.context.getVisionRange
  if (fn) return fn(entity)
  return isBuildingEntity(entity) ? BUILDING_PROXIMITY_RANGE : TANK_FIRE_RANGE
}

function isGroundedAir(unit) {
  return AIR_TYPES.has(unit.type) && unit.flightState === 'grounded'
}

function insideBuilding(unit, building) {
  const cx = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  const cy = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
  return cx >= building.x && cx < building.x + (building.width || 1) && cy >= building.y && cy < building.y + (building.height || 1)
}

function recentHit(condition) {
  const hit = scope.unit.lastHit
  if (!hit || !hit.attacker) return null
  if (scope.now - hit.time > HIT_WINDOW_MS) return null
  const wantBuilding = paramValue(condition, 'by') === 'building'
  return hit.byBuilding === wantBuilding ? hit : null
}

function inFriendlyServiceRange(buildingType) {
  const { unit, context } = scope
  const center = unitCenter(unit)
  let found = false
  eachBuilding(context, building => {
    if (found || !building || building.type !== buildingType || !(building.health > 0)) return
    if (!sameParty(building.owner, unit.owner)) return
    entityCenter(building, point)
    if (Math.hypot(point.x - center.x, point.y - center.y) <= getServiceRadiusPixels(building)) found = true
  })
  return found
}

function inDefenseBuildingRange() {
  const { unit, context } = scope
  const center = unitCenter(unit)
  const fn = context.getBuildingFireRange
  let found = false
  eachBuilding(context, building => {
    if (found || !building || !(building.health > 0) || !DEFENSE_BUILDING_TYPES.includes(building.type)) return
    if (!sameParty(building.owner, unit.owner)) return
    const range = fn ? fn(building) : (building.fireRange || 0) * TILE_SIZE
    if (!(range > 0)) return
    entityCenter(building, point)
    if (Math.hypot(point.x - center.x, point.y - center.y) <= range) found = true
  })
  return found
}

function inFriendlyUnitSupport() {
  const { unit } = scope
  const center = unitCenter(unit)
  const reach = Math.max(fireRangePx(unit), DEFENSE_UNIT_SUPPORT_TILES * TILE_SIZE) * 1.5
  const list = collectNearby(center.x, center.y, reach, unit.id)
  for (let i = 0; i < list.length; i++) {
    const other = list[i]
    if (!other || !(other.health > 0) || other.embarkedOnId || !sameParty(other.owner, unit.owner)) continue
    const distance = Math.hypot(other.x + TILE_SIZE / 2 - center.x, other.y + TILE_SIZE / 2 - center.y)
    if (SERVICE_UNIT_TYPES.has(other.type) && distance <= DEFENSE_UNIT_SUPPORT_TILES * TILE_SIZE) return true
    if (COMBAT_TYPES.has(other.type) && distance <= fireRangePx(other)) return true
  }
  return false
}

function myUnitsInEnemyRange(type) {
  const { unit } = scope
  const center = unitCenter(unit)
  collectNearbyInto(scratchEnemies, center.x, center.y, DISTANCE_SCAN_TILES * TILE_SIZE, unit.id)
  for (let i = 0; i < scratchEnemies.length; i++) {
    const enemy = scratchEnemies[i]
    if (!isHostile(unit, enemy) || !COMBAT_TYPES.has(enemy.type)) continue
    const ex = enemy.x + TILE_SIZE / 2
    const ey = enemy.y + TILE_SIZE / 2
    const range = fireRangePx(enemy)
    if (matchesType(unit, type) && (center.x - ex) ** 2 + (center.y - ey) ** 2 <= range * range) return true
    const near = collectNearby(ex, ey, range, enemy.id)
    for (let j = 0; j < near.length; j++) {
      const mine = near[j]
      if (mine && mine.health > 0 && sameParty(mine.owner, unit.owner) && matchesType(mine, type)) return true
    }
  }
  return false
}

function measureCheck(condition) {
  const { unit, context } = scope
  switch (condition.check) {
    case 'airborne':
      return AIR_TYPES.has(unit.type) && unit.flightState !== 'grounded'
    case 'moving':
      return Boolean(unit.moveTarget) || (Array.isArray(unit.path) && unit.path.length > 0)
    case 'attacking': {
      const target = unit.target
      if (!target || !(target.health > 0)) return false
      return isBuildingEntity(target) === (paramValue(condition, 'kind') === 'building')
    }
    case 'serving':
      return Boolean(unit.utilityQueue && unit.utilityQueue.currentTargetId != null)
    case 'underService':
      ensureServed()
      return index.served.has(unit.id)
    case 'underServiceByUnit':
      ensureServed()
      return index.servedBy.has(unit.id)
    case 'inServiceRange':
      return inFriendlyServiceRange(paramValue(condition, 'building'))
    case 'protectedByUnit':
      ensureProtected()
      return index.protectedIds.has(unit.id)
    case 'inDefenseRange':
      return paramValue(condition, 'by') === 'unit' ? inFriendlyUnitSupport() : inDefenseBuildingRange()
    case 'canAttack': {
      if (!unit.type || !(fireRangePx(unit) > 0)) return false
      const kind = paramValue(condition, 'kind')
      if (kind === 'building') {
        const building = nearestVisibleEnemyBuilding('any', DISTANCE_SCAN_TILES)
        return Boolean(building) && canTarget(unit, building)
      }
      const target = nearestVisibleEnemyUnit('any', DISTANCE_SCAN_TILES)
      return Boolean(target) && canTarget(unit, target)
    }
    case 'inVisibleRange': {
      const center = unitCenter(unit)
      if (paramValue(condition, 'by') === 'building') {
        let seen = false
        eachBuilding(context, building => {
          if (seen || !isHostile(unit, building)) return
          entityCenter(building, point)
          if (Math.hypot(point.x - center.x, point.y - center.y) <= visionRangeTiles(building) * TILE_SIZE) seen = true
        })
        return seen
      }
      const list = collectNearby(center.x, center.y, DISTANCE_SCAN_TILES * TILE_SIZE, unit.id)
      for (let i = 0; i < list.length; i++) {
        const enemy = list[i]
        if (!isHostile(unit, enemy)) continue
        const distance = Math.hypot(enemy.x + TILE_SIZE / 2 - center.x, enemy.y + TILE_SIZE / 2 - center.y)
        if (distance <= visionRangeTiles(enemy) * TILE_SIZE) return true
      }
      return false
    }
    case 'parkedAt': {
      const place = paramValue(condition, 'place')
      let parked = false
      if (place === 'vehicleWorkshop') {
        eachBuilding(context, building => {
          if (parked || !building || building.type !== 'vehicleWorkshop' || !Array.isArray(building.repairSlots)) return
          parked = building.repairSlots.some(slot => slot && slot.unit === unit)
        })
        return parked
      }
      if (!isGroundedAir(unit)) return false
      eachBuilding(context, building => {
        if (parked || !building || building.type !== place || !(building.health > 0)) return
        if (sameParty(building.owner, unit.owner) && insideBuilding(unit, building)) parked = true
      })
      return parked
    }
    case 'hitDirect': {
      const hit = recentHit(condition)
      return Boolean(hit) && hit.direct === true
    }
    case 'hitIndirect': {
      const hit = recentHit(condition)
      return Boolean(hit) && hit.direct === false
    }
    case 'underAttackBy': {
      const hit = recentHit(condition)
      if (!hit || !(hit.attacker.health > 0)) return false
      entityCenter(hit.attacker, point)
      return isVisibleToOwner(unit, point.x, point.y)
    }
    case 'enemyVisible':
      return visibleEnemyCount(paramValue(condition, 'targetType')) > 0
    case 'enemyInFireRange': {
      const type = paramValue(condition, 'targetType')
      const range = fireRangePx(unit)
      const center = unitCenter(unit)
      const list = collectNearby(center.x, center.y, range, unit.id)
      for (let i = 0; i < list.length; i++) {
        const enemy = list[i]
        if (isHostile(unit, enemy) && matchesType(enemy, type) && canTarget(unit, enemy)) return true
      }
      return false
    }
    case 'myUnitsInEnemyRange':
      return myUnitsInEnemyRange(paramValue(condition, 'unitType'))
    default:
      return undefined
  }
}

function measureNumber(condition) {
  const { unit, context } = scope
  switch (condition.field) {
    case 'hp':
      return relativeOrAbsolute(condition, unit.health, unit.maxHealth)
    case 'enemyDistance':
      return getScopeEnemyDistanceTiles()
    case 'xp': {
      if (typeof unit.experience !== 'number') return undefined
      if (effectiveMode(condition) === 'relative') {
        return context.getXpProgress ? context.getXpProgress(unit) : undefined
      }
      return unit.experience
    }
    case 'rank':
      return typeof unit.level === 'number' ? unit.level : undefined
    case 'fuel':
      return typeof unit.maxGas === 'number' ? relativeOrAbsolute(condition, unit.gas, unit.maxGas) : undefined
    case 'ammo': {
      if (typeof unit.maxAmmunition === 'number') return relativeOrAbsolute(condition, unit.ammunition, unit.maxAmmunition)
      if (typeof unit.maxRocketAmmo === 'number') return relativeOrAbsolute(condition, unit.rocketAmmo, unit.maxRocketAmmo)
      return undefined
    }
    case 'reload': {
      const values = reloadValues(unit)
      if (!values) return undefined
      if (effectiveMode(condition) === 'relative') return Math.min(1, values.elapsed / values.rate)
      return Math.max(0, values.rate - values.elapsed)
    }
    case 'crew': {
      const counts = crewCounts(unit)
      if (!counts) return undefined
      return effectiveMode(condition) === 'relative' ? counts.present / counts.total : counts.present
    }
    case 'load': {
      const load = loadValues(unit)
      if (!load) return undefined
      return relativeOrAbsolute(condition, load.value, load.max)
    }
    case 'rotation':
      return typeof unit.direction === 'number' ? toDegrees(unit.direction) : undefined
    case 'turretRotation': {
      if (!hasTurret(unit)) return undefined
      if (effectiveMode(condition) === 'relative') {
        return signedDegrees((unit.turretDirection || 0) - (unit.direction || 0))
      }
      return toDegrees(unit.turretDirection)
    }
    case 'money':
      return partyMoney(unit.owner)
    case 'power':
      return partyPower(unit.owner)
    case 'buildingCount':
      return buildingCount(unit.owner, paramValue(condition, 'buildingType'))
    case 'distance': {
      const type = paramValue(condition, 'targetType')
      const found = paramValue(condition, 'kind') === 'building'
        ? nearestVisibleEnemyBuilding('any', DISTANCE_SCAN_TILES)
        : nearestVisibleEnemyUnit(type, DISTANCE_SCAN_TILES)
      if (!found) return undefined
      return distanceToEntity(found) / TILE_SIZE
    }
    default:
      return undefined
  }
}

/** Measure one leaf for the unit prepared by beginUnitScope. */
export function measureLeaf(condition) {
  if (!scope.unit) return undefined
  if (condition.type === 'check') return measureCheck(condition)
  if (condition.type === 'compare') return measureNumber(condition)
  return undefined
}
