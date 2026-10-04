// Small read-only world helpers shared by the policy engine, the sensors and the
// unit command API. Nothing here changes a unit.

import { TILE_SIZE } from '../config.js'
import { getSpatialQuadtree } from '../game/spatialQuadtree.js'
import { normalizePolicyOwner } from './policyStore.js'

export const ENEMY_SCAN_TILES = 14

export const AIR_UNIT_TYPES = Object.freeze(new Set(['apache', 'f22Raptor', 'f35']))
export const COMBAT_UNIT_TYPES = Object.freeze(new Set([
  'tank', 'tank_v1', 'tank-v2', 'tank-v3', 'rocketTank', 'howitzer', 'apache', 'f22Raptor', 'f35'
]))
export const SERVICE_UNIT_TYPES = Object.freeze(new Set(['ambulance', 'tankerTruck', 'ammunitionTruck', 'recoveryTank']))

/** Tanks with an independently rotating turret. */
export const TURRET_TANK_TYPES = Object.freeze(new Set(['tank', 'tank_v1', 'tank-v2', 'tank-v3']))

export function isBuildingEntity(entity) {
  return Boolean(entity) && (entity.isBuilding === true || typeof entity.tileX !== 'number')
}

/** Pixel centre of a unit or building. */
export function entityCenter(entity, out) {
  const target = out || { x: 0, y: 0 }
  if (isBuildingEntity(entity)) {
    target.x = (entity.x + (entity.width || 1) / 2) * TILE_SIZE
    target.y = (entity.y + (entity.height || 1) / 2) * TILE_SIZE
  } else {
    target.x = entity.x + TILE_SIZE / 2
    target.y = entity.y + TILE_SIZE / 2
  }
  return target
}

export function unitCenter(unit) {
  return { x: unit.x + TILE_SIZE / 2, y: unit.y + TILE_SIZE / 2 }
}

export function sameParty(a, b) {
  if (!a || !b) return false
  return normalizePolicyOwner(a) === normalizePolicyOwner(b)
}

export function isHostile(unit, other) {
  if (!other || other === unit || !(other.health > 0) || other.embarkedOnId) return false
  if (!other.owner || !unit.owner) return false
  return !sameParty(other.owner, unit.owner)
}

function nearestAmong(unit, center, candidates, radiusSq) {
  let best = null
  let bestSq = radiusSq
  for (let i = 0; i < candidates.length; i++) {
    const other = candidates[i]
    if (!isHostile(unit, other)) continue
    const dx = other.x + TILE_SIZE / 2 - center.x
    const dy = other.y + TILE_SIZE / 2 - center.y
    const distSq = dx * dx + dy * dy
    if (distSq <= bestSq) {
      best = other
      bestSq = distSq
    }
  }
  return best
}

/** Nearest hostile unit within the scan radius, or null. */
export function findNearestEnemy(unit, units) {
  const center = unitCenter(unit)
  const radius = ENEMY_SCAN_TILES * TILE_SIZE
  const tree = getSpatialQuadtree()
  const candidates = tree ? tree.queryNearbyGround(center.x, center.y, radius, unit.id) : units
  return nearestAmong(unit, center, candidates, radius * radius)
}

/** Nearest friendly unit (not the unit itself) within `tiles` that `accept` allows. */
export function findNearestFriendly(unit, units, tiles = ENEMY_SCAN_TILES, accept = null) {
  const center = unitCenter(unit)
  const radius = tiles * TILE_SIZE
  const tree = getSpatialQuadtree()
  const candidates = tree ? tree.queryNearbyGround(center.x, center.y, radius, unit.id) : units
  let best = null
  let bestSq = radius * radius
  for (let i = 0; i < candidates.length; i++) {
    const other = candidates[i]
    if (!other || other === unit || !(other.health > 0) || other.embarkedOnId) continue
    if (!sameParty(other.owner, unit.owner)) continue
    if (accept && !accept(other)) continue
    const dx = other.x + TILE_SIZE / 2 - center.x
    const dy = other.y + TILE_SIZE / 2 - center.y
    const distSq = dx * dx + dy * dy
    if (distSq <= bestSq) {
      best = other
      bestSq = distSq
    }
  }
  return best
}

/** Nearest living building of `type` that belongs to the unit's party. */
export function findNearestFriendlyBuilding(unit, buildings, type) {
  const center = unitCenter(unit)
  const point = { x: 0, y: 0 }
  let best = null
  let bestSq = Infinity
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i]
    if (!building || building.type !== type || !(building.health > 0)) continue
    if (!sameParty(building.owner, unit.owner)) continue
    entityCenter(building, point)
    const distSq = (point.x - center.x) ** 2 + (point.y - center.y) ** 2
    if (distSq < bestSq) {
      best = building
      bestSq = distSq
    }
  }
  return best
}

/** Nearest friendly service unit of `type` for which `usable(provider)` holds. */
export function findNearestFriendlyProvider(unit, units, type, usable) {
  const center = unitCenter(unit)
  let best = null
  let bestSq = Infinity
  for (let i = 0; i < units.length; i++) {
    const other = units[i]
    if (!other || other.type !== type || other === unit || !(other.health > 0) || other.embarkedOnId) continue
    if (!sameParty(other.owner, unit.owner)) continue
    if (usable && !usable(other)) continue
    const distSq = (other.x + TILE_SIZE / 2 - center.x) ** 2 + (other.y + TILE_SIZE / 2 - center.y) ** 2
    if (distSq < bestSq) {
      best = other
      bestSq = distSq
    }
  }
  return best
}
