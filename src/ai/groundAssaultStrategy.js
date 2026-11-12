// Ground assault strategy for every AI player.
// Pure steps (outcome, squads, breach, target order, throttle) stay separate
// from the orchestrator so this can later move into the automation state machine.
// Heavy planning runs at most once every 5s per AI player, and only when the
// previous frame still had CPU headroom.

import { COMBAT_CONFIG } from '../game/unitCombat/combatConfig.js'
import {
  HOWITZER_BUILDING_DAMAGE_MULTIPLIER,
  HOWITZER_FIRE_COOLDOWN,
  HOWITZER_FIREPOWER,
  HOWITZER_FIRE_RANGE,
  TANK_FIRE_RANGE
} from '../config.js'
import { computeBuildingDps, generateDangerZoneMapForPlayer } from '../game/dangerZoneMap.js'
import { combinedDangerAt, refreshDynamicDangerMaps } from '../game/dynamicDangerZoneMap.js'
import { getCachedPath } from '../game/pathfinding.js'
import { getEnemyPlayers } from './enemyUtils.js'
import {
  AIR_DEFENSE_BUILDINGS,
  PLAYER_DEFENSE_BUILDINGS
} from './enemyUnitBehaviorConstants.js'

export const STRATEGY_EVAL_INTERVAL_MS = 5000
export const STRATEGY_HEADROOM_MS = 2
export const ENGAGEMENT_RADIUS_TILES = 12
export const WOUNDED_HEALTH_FRACTION = 0.8
export const CRIPPLED_DURABILITY_FACTOR = 0.2
export const RETREAT_TIME_MARGIN = 0.85
export const PATH_EXPANSION_CAP = 20000

export const SQUAD_TEMPLATE = Object.freeze({
  coreTanks: 3,
  lightTanks: 2,
  rocketTanks: 1,
  howitzers: 1,
  ambulances: 1,
  recoveryTanks: 1,
  ammunitionTrucks: 1
})

export const SOLO_AIR_STRIKE_TYPES = new Set(['apache', 'f22Raptor', 'f35'])
const CORE_TANK_TYPES = new Set(['tank', 'tank_v1', 'tank-v2', 'tank-v3'])
const SQUAD_COMBAT_TYPES = new Set([...CORE_TANK_TYPES, 'lightTank', 'rocketTank', 'howitzer'])
const AIR_DEFENCE_UNIT_TYPES = new Set(['rocketTank', 'destroyer'])
const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1]
]

const STANDARD_SECONDS = COMBAT_CONFIG.FIRE_RATES.STANDARD / 1000
const UNIT_DPS = {
  tank: COMBAT_CONFIG.DAMAGE.STANDARD / STANDARD_SECONDS,
  tank_v1: COMBAT_CONFIG.DAMAGE.STANDARD / STANDARD_SECONDS,
  'tank-v2': COMBAT_CONFIG.DAMAGE.STANDARD / STANDARD_SECONDS,
  'tank-v3': (COMBAT_CONFIG.DAMAGE.TANK_V3 * COMBAT_CONFIG.TANK_V3_BURST.COUNT) / STANDARD_SECONDS,
  lightTank: COMBAT_CONFIG.DAMAGE.LIGHT_TANK / (COMBAT_CONFIG.FIRE_RATES.LIGHT_TANK / 1000),
  rocketTank: (COMBAT_CONFIG.DAMAGE.ROCKET * COMBAT_CONFIG.ROCKET_BURST.COUNT) / (COMBAT_CONFIG.FIRE_RATES.ROCKET / 1000),
  howitzer: HOWITZER_FIREPOWER / (HOWITZER_FIRE_COOLDOWN / 1000),
  apache: COMBAT_CONFIG.DAMAGE.APACHE / (COMBAT_CONFIG.APACHE.FIRE_RATE / 1000),
  f22Raptor: COMBAT_CONFIG.DAMAGE.F22 / (COMBAT_CONFIG.FIRE_RATES.ROCKET / 1000),
  f35: COMBAT_CONFIG.DAMAGE.F35_BOMB / (COMBAT_CONFIG.APACHE.FIRE_RATE / 1000)
}

export function hasStrategyCpuBudget(headroomMs = globalThis.__cfbFrameHeadroomMs) {
  if (!Number.isFinite(headroomMs)) return true
  return headroomMs >= STRATEGY_HEADROOM_MS
}

export function shouldRunStrategyEvaluation(lastSuccessAt, now, headroomMs = globalThis.__cfbFrameHeadroomMs) {
  if (!hasStrategyCpuBudget(headroomMs)) return false
  if (!Number.isFinite(lastSuccessAt)) return true
  return now - lastSuccessAt >= STRATEGY_EVAL_INTERVAL_MS
}

export function isCrippledCrew(unit) {
  const crew = unit?.crew
  if (!crew || typeof crew !== 'object') return false
  return crew.gunner === false || crew.loader === false
}

export function isWoundedUnit(unit) {
  if (!unit?.maxHealth || unit.health === undefined) return false
  return unit.health / unit.maxHealth < WOUNDED_HEALTH_FRACTION
}

export function isGroundDefenceBuilding(entity) {
  return Boolean(entity && PLAYER_DEFENSE_BUILDINGS.has(entity.type) && entity.combatantKind !== 'unit')
}

function isBuildingCombatant(entity) {
  return entity?.combatantKind === 'building' || isGroundDefenceBuilding(entity)
}

function healthFraction(entity) {
  if (!entity?.maxHealth) return 1
  return Math.max(0, entity.health || 0) / entity.maxHealth
}

export function unitOffencePerSecond(unit, versusBuildings = false) {
  if (!unit || unit.health <= 0 || isCrippledCrew(unit)) return 0
  const type = unit.type === 'tank' ? 'tank_v1' : unit.type
  let dps = UNIT_DPS[type] || 0
  if (versusBuildings && type === 'howitzer') dps *= HOWITZER_BUILDING_DAMAGE_MULTIPLIER
  return dps * healthFraction(unit)
}

export function combatStrength(entity, versusBuildings = false) {
  if (!entity || entity.health <= 0) return { offence: 0, durability: 0, crippled: false }
  if (isBuildingCombatant(entity)) {
    const raw = Number.isFinite(entity.dps) ? entity.dps : (PLAYER_DEFENSE_BUILDINGS.has(entity.type) ? computeBuildingDps(entity) : 0)
    const dps = Number.isFinite(raw) ? raw : 0
    return { offence: dps * healthFraction(entity), durability: entity.health || 0, crippled: false }
  }
  const crippled = isCrippledCrew(entity)
  const health = entity.health || 0
  return {
    offence: crippled ? 0 : unitOffencePerSecond(entity, versusBuildings),
    durability: health * (crippled ? CRIPPLED_DURABILITY_FACTOR : 1),
    crippled
  }
}

export function estimateEngagementOutcome(friendlies, enemies) {
  const friendly = friendlies || []
  const hostile = enemies || []
  const versusBuildings = hostile.length > 0 && hostile.every(isBuildingCombatant)
  let friendOffence = 0
  let friendDurability = 0
  let enemyOffence = 0
  let enemyDurability = 0
  let preferredTarget = null
  let preferredDurability = Infinity

  for (const unit of friendly) {
    const strength = combatStrength(unit, versusBuildings)
    friendOffence += strength.offence
    if (!strength.crippled) friendDurability += strength.durability
  }
  for (const unit of hostile) {
    const strength = combatStrength(unit, false)
    enemyOffence += strength.offence
    if (!strength.crippled) enemyDurability += strength.durability
    if (strength.crippled && !isBuildingCombatant(unit) && strength.durability < preferredDurability) {
      preferredTarget = unit
      preferredDurability = strength.durability
    }
  }

  const weDieIn = friendDurability / Math.max(enemyOffence, 1e-9)
  const theyDieIn = enemyDurability / Math.max(friendOffence, 1e-9)
  const shouldRetreat = enemyOffence > 0 && weDieIn + 1e-9 < theyDieIn * RETREAT_TIME_MARGIN
  return {
    shouldRetreat,
    preferredTarget: shouldRetreat ? null : preferredTarget,
    friendOffence,
    enemyOffence,
    friendDurability,
    enemyDurability,
    weDieIn,
    theyDieIn
  }
}

export function mayGroundForceAttackBase({ combatantCount, groundDefenceCount, airDefenceCount }) {
  if ((groundDefenceCount || 0) <= 0 && (airDefenceCount || 0) <= 0) return combatantCount >= 1
  return combatantCount >= 2
}

export function maySoloAirStrikeBase(unitType, airDefenceCount) {
  return SOLO_AIR_STRIKE_TYPES.has(unitType) && (airDefenceCount || 0) <= 0
}

export function squadHasSufficientFirepower(attackers, threats) {
  const force = (attackers || []).filter(unit => unit && unit.health > 0 && !isCrippledCrew(unit))
  if (!threats || threats.length === 0) return force.length > 0
  const outcome = estimateEngagementOutcome(force, threats)
  return !outcome.shouldRetreat && outcome.friendOffence > 0
}

export function assaultPhaseForTarget(target, breachIds = []) {
  if (!target) return 'none'
  if (breachIds.includes(target.id)) return 'breach'
  if (target.type === 'constructionYard') return 'constructionYard'
  if (target.type === 'vehicleFactory') return 'vehicleFactory'
  if (PLAYER_DEFENSE_BUILDINGS.has(target.type)) return 'remainingDefences'
  return 'remainingBuildings'
}

export function orderAssaultTargets(buildings, breachIds = []) {
  const alive = (buildings || []).filter(building => building && building.health > 0)
  const used = new Set()
  const breach = []
  for (const id of breachIds) {
    const found = alive.find(building => building.id === id)
    if (found && !used.has(found)) {
      breach.push(found)
      used.add(found)
    }
  }
  const take = predicate => {
    const picked = []
    for (const building of alive) {
      if (used.has(building) || !predicate(building)) continue
      picked.push(building)
      used.add(building)
    }
    return picked
  }
  return [
    ...breach,
    ...take(building => building.type === 'constructionYard'),
    ...take(building => building.type === 'vehicleFactory'),
    ...take(building => PLAYER_DEFENSE_BUILDINGS.has(building.type)),
    ...take(() => true)
  ]
}

function countWhere(units, owner, predicate) {
  let count = 0
  for (const unit of units || []) {
    if (!unit || unit.owner !== owner || unit.health <= 0 || unit.harvesterHunter) continue
    if (predicate(unit)) count++
  }
  return count
}

function squadRoleCounts(units, owner) {
  return {
    core: countWhere(units, owner, unit => CORE_TANK_TYPES.has(unit.type)),
    light: countWhere(units, owner, unit => unit.type === 'lightTank'),
    rocket: countWhere(units, owner, unit => unit.type === 'rocketTank'),
    howitzer: countWhere(units, owner, unit => unit.type === 'howitzer'),
    ambulance: countWhere(units, owner, unit => unit.type === 'ambulance'),
    recovery: countWhere(units, owner, unit => unit.type === 'recoveryTank'),
    ammo: countWhere(units, owner, unit => unit.type === 'ammunitionTruck')
  }
}

function filledSquads(counts, needs) {
  const parts = [
    needs.core > 0 ? Math.floor(counts.core / needs.core) : Infinity,
    needs.light > 0 ? Math.floor(counts.light / needs.light) : Infinity,
    needs.rocket > 0 ? Math.floor(counts.rocket / needs.rocket) : Infinity,
    needs.howitzer > 0 ? Math.floor(counts.howitzer / needs.howitzer) : Infinity,
    needs.ambulance > 0 ? Math.floor(counts.ambulance / needs.ambulance) : Infinity,
    needs.recovery > 0 ? Math.floor(counts.recovery / needs.recovery) : Infinity,
    needs.ammo > 0 ? Math.floor(counts.ammo / needs.ammo) : Infinity
  ]
  return parts.reduce((min, value) => Math.min(min, value), Infinity)
}

export function chooseNextSquadUnit(units, owner, options = {}) {
  const counts = squadRoleCounts(units, owner)
  const needs = {
    core: SQUAD_TEMPLATE.coreTanks,
    light: SQUAD_TEMPLATE.lightTanks,
    rocket: SQUAD_TEMPLATE.rocketTanks,
    howitzer: SQUAD_TEMPLATE.howitzers,
    ambulance: options.hasHospital === false ? 0 : SQUAD_TEMPLATE.ambulances,
    recovery: SQUAD_TEMPLATE.recoveryTanks,
    ammo: options.hasAmmunitionFactory === false ? 0 : SQUAD_TEMPLATE.ammunitionTrucks
  }
  const done = filledSquads(counts, needs)
  const have = {
    core: counts.core - done * SQUAD_TEMPLATE.coreTanks,
    light: counts.light - done * SQUAD_TEMPLATE.lightTanks,
    rocket: counts.rocket - done * SQUAD_TEMPLATE.rocketTanks,
    howitzer: counts.howitzer - done * SQUAD_TEMPLATE.howitzers,
    ambulance: counts.ambulance - done * SQUAD_TEMPLATE.ambulances,
    recovery: counts.recovery - done * SQUAD_TEMPLATE.recoveryTanks,
    ammo: counts.ammo - done * SQUAD_TEMPLATE.ammunitionTrucks
  }
  const steps = [
    ['core', 1, 'tank_v1'],
    ['light', 1, 'lightTank'],
    ['rocket', 1, 'rocketTank'],
    ['howitzer', 1, 'howitzer'],
    ['core', 2, 'tank-v2'],
    ['ambulance', 1, 'ambulance'],
    ['recovery', 1, 'recoveryTank'],
    ['ammo', 1, 'ammunitionTruck'],
    ['core', SQUAD_TEMPLATE.coreTanks, 'tank-v3'],
    ['light', SQUAD_TEMPLATE.lightTanks, 'lightTank']
  ]
  for (const [key, minimum, type] of steps) {
    if (needs[key] <= 0) continue
    if (have[key] < minimum) return type
  }
  return 'tank_v1'
}

export function formSquads(units, owner) {
  const buckets = { core: [], light: [], rocket: [], howitzer: [] }
  for (const unit of units || []) {
    if (!unit || unit.owner !== owner || unit.health <= 0 || unit.harvesterHunter) continue
    if (CORE_TANK_TYPES.has(unit.type)) buckets.core.push(unit)
    else if (unit.type === 'lightTank') buckets.light.push(unit)
    else if (unit.type === 'rocketTank') buckets.rocket.push(unit)
    else if (unit.type === 'howitzer') buckets.howitzer.push(unit)
  }
  const byId = (a, b) => String(a.id).localeCompare(String(b.id))
  buckets.core.sort(byId)
  buckets.light.sort(byId)
  buckets.rocket.sort(byId)
  buckets.howitzer.sort(byId)
  const pull = (list, amount, into) => {
    let remaining = amount
    while (remaining > 0 && list.length) {
      into.push(list.shift())
      remaining--
    }
  }
  const squads = []
  while (buckets.core.length || buckets.light.length || buckets.rocket.length || buckets.howitzer.length) {
    const members = []
    pull(buckets.core, SQUAD_TEMPLATE.coreTanks, members)
    pull(buckets.light, SQUAD_TEMPLATE.lightTanks, members)
    pull(buckets.rocket, SQUAD_TEMPLATE.rocketTanks, members)
    pull(buckets.howitzer, SQUAD_TEMPLATE.howitzers, members)
    if (!members.length) break
    squads.push({ id: `${owner}-squad-${squads.length + 1}`, members })
  }
  return squads
}

export function assaultFormationTiles(origin, target) {
  const tx = Number.isFinite(target?.tileX) ? target.tileX : target?.x
  const ty = Number.isFinite(target?.tileY) ? target.tileY : target?.y
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null
  const ox = Number.isFinite(origin?.x) ? origin.x : tx
  const oy = Number.isFinite(origin?.y) ? origin.y : ty
  const dx = tx - ox
  const dy = ty - oy
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  return {
    frontTile: { x: Math.round(tx - ux), y: Math.round(ty - uy) },
    rearTile: { x: Math.round(tx - ux * 4), y: Math.round(ty - uy * 4) }
  }
}

export function assaultMoveTile(unit) {
  const order = unit?.aiAssault
  if (!order) return null
  if (order.mode === 'attack') return isWoundedUnit(unit) ? order.rearTile : order.frontTile
  return order.retreatTile || order.rallyTile || null
}

function defenceIsActive(building, gameState) {
  if (!building || building.health <= 0 || !PLAYER_DEFENSE_BUILDINGS.has(building.type)) return false
  if (building.type !== 'rocketTurret' && building.type !== 'teslaCoil') return true
  const supply = building.owner === gameState?.humanPlayer ? gameState?.playerPowerSupply : gameState?.enemyPowerSupply
  return !(supply < 0)
}

export function defenceCoversTile(building, x, y) {
  if (!building?.fireRange || !PLAYER_DEFENSE_BUILDINGS.has(building.type)) return false
  const cx = building.x + (building.width || 1) / 2
  const cy = building.y + (building.height || 1) / 2
  const dist = Math.hypot((x + 0.5) - cx, (y + 0.5) - cy)
  return dist <= building.fireRange && dist >= (building.minFireRange || 0)
}

function dangerAt(dangerMap, x, y, dynamicState = null) {
  return combinedDangerAt(dangerMap, dynamicState, x, y)
}

export function weaponRangeTiles(unit) {
  if (!unit) return TANK_FIRE_RANGE
  if (unit.type === 'howitzer') return HOWITZER_FIRE_RANGE
  if (unit.type === 'rocketTank') return Math.ceil(TANK_FIRE_RANGE * 1.5)
  if (unit.type === 'f22Raptor') return 16
  if (unit.type === 'f35') return 14
  if (unit.type === 'apache') return Math.max(6, Math.ceil(TANK_FIRE_RANGE * 0.8))
  if (unit.type === 'destroyer') return 18
  return TANK_FIRE_RANGE
}

export function inRangeReturnFire(unit, threats) {
  if (!unit) return null
  const range = weaponRangeTiles(unit)
  const pool = []
  if (unit.lastAttacker && unit.lastAttacker.health > 0) pool.push(unit.lastAttacker)
  if (Array.isArray(threats)) {
    for (const threat of threats) pool.push(threat)
  }
  let best = null
  let bestDistance = Infinity
  for (const threat of pool) {
    if (!threat || threat.health <= 0 || threat.owner === unit.owner) continue
    const distance = tileDistance(unit, threat)
    if (distance <= range && distance < bestDistance) {
      best = threat
      bestDistance = distance
    }
  }
  return best
}

function heapLess(a, b) {
  if (a.peak !== b.peak) return a.peak < b.peak
  return a.dist < b.dist
}

function heapPush(heap, item) {
  heap.push(item)
  let index = heap.length - 1
  while (index > 0) {
    const parent = (index - 1) >> 1
    if (!heapLess(heap[index], heap[parent])) break
    const swap = heap[parent]
    heap[parent] = heap[index]
    heap[index] = swap
    index = parent
  }
}

function heapPop(heap) {
  const top = heap[0]
  const last = heap.pop()
  if (heap.length && last) {
    heap[0] = last
    let index = 0
    for (;;) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      if (left < heap.length && heapLess(heap[left], heap[smallest])) smallest = left
      if (right < heap.length && heapLess(heap[right], heap[smallest])) smallest = right
      if (smallest === index) break
      const swap = heap[smallest]
      heap[smallest] = heap[index]
      heap[index] = swap
      index = smallest
    }
  }
  return top
}

function tileBlocked(mapGrid, blocked, x, y) {
  if (y < 0 || x < 0 || y >= mapGrid.length || x >= mapGrid[0].length) return true
  if (blocked.has(y * mapGrid[0].length + x)) return true
  const tile = mapGrid[y][x]
  if (!tile) return true
  return tile.type === 'water' || tile.type === 'rock' || tile.seedCrystal || Boolean(tile.building)
}

function buildingFootprint(building, width, height, blocked) {
  const bw = building.width || 1
  const bh = building.height || 1
  for (let y = building.y; y < building.y + bh; y++) {
    for (let x = building.x; x < building.x + bw; x++) {
      if (x >= 0 && y >= 0 && x < width && y < height) blocked.add(y * width + x)
    }
  }
}

function nearestWalkable(mapGrid, blocked, x, y) {
  const width = mapGrid[0].length
  const height = mapGrid.length
  const sx = Math.max(0, Math.min(width - 1, Math.round(x)))
  const sy = Math.max(0, Math.min(height - 1, Math.round(y)))
  if (!tileBlocked(mapGrid, blocked, sx, sy)) return sy * width + sx
  for (let radius = 1; radius <= 6; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
        const nx = sx + dx
        const ny = sy + dy
        if (!tileBlocked(mapGrid, blocked, nx, ny)) return ny * width + nx
      }
    }
  }
  return -1
}

function goalIndexes(building, mapGrid, blocked) {
  const width = mapGrid[0].length
  const height = mapGrid.length
  const goals = new Set()
  const x0 = building.x - 1
  const y0 = building.y - 1
  const x1 = building.x + (building.width || 1)
  const y1 = building.y + (building.height || 1)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!tileBlocked(mapGrid, blocked, x, y)) goals.add(y * width + x)
    }
  }
  if (!goals.size && height) {
    const fallback = nearestWalkable(mapGrid, blocked, building.x, building.y)
    if (fallback >= 0) goals.add(fallback)
  }
  return goals
}

function reconstructPath(parent, index, width) {
  const path = []
  let cursor = index
  let guard = 0
  const limit = parent.length + 1
  while (cursor >= 0 && guard++ < limit) {
    path.push({ x: cursor % width, y: Math.floor(cursor / width) })
    if (parent[cursor] === cursor) break
    cursor = parent[cursor]
  }
  path.reverse()
  return path
}

function findMinPeakPath(mapGrid, dangerMap, blocked, origin, goalBuilding, dynamicState = null) {
  const width = mapGrid[0].length
  const height = mapGrid.length
  const cellCount = width * height
  const goals = goalIndexes(goalBuilding, mapGrid, blocked)
  const start = nearestWalkable(mapGrid, blocked, origin.x, origin.y)
  if (start < 0 || !goals.size) return null
  const bestPeak = new Float64Array(cellCount)
  const bestDist = new Int32Array(cellCount)
  const parent = new Int32Array(cellCount)
  bestPeak.fill(Number.POSITIVE_INFINITY)
  bestDist.fill(-1)
  parent.fill(-1)
  const startX = start % width
  const startY = Math.floor(start / width)
  bestPeak[start] = dangerAt(dangerMap, startX, startY, dynamicState)
  bestDist[start] = 0
  parent[start] = start
  const heap = []
  heapPush(heap, { peak: bestPeak[start], dist: 0, index: start })
  let expanded = 0
  while (heap.length && expanded < PATH_EXPANSION_CAP) {
    const item = heapPop(heap)
    if (!item || item.peak !== bestPeak[item.index] || item.dist !== bestDist[item.index]) continue
    expanded++
    if (goals.has(item.index)) return reconstructPath(parent, item.index, width)
    const x = item.index % width
    const y = Math.floor(item.index / width)
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx
      const ny = y + dy
      if (tileBlocked(mapGrid, blocked, nx, ny)) continue
      const next = ny * width + nx
      const nextPeak = Math.max(item.peak, dangerAt(dangerMap, nx, ny, dynamicState))
      const nextDist = item.dist + 1
      if (nextPeak < bestPeak[next] || (nextPeak === bestPeak[next] && nextDist < bestDist[next])) {
        bestPeak[next] = nextPeak
        bestDist[next] = nextDist
        parent[next] = item.index
        heapPush(heap, { peak: nextPeak, dist: nextDist, index: next })
      }
    }
  }
  return null
}

function weakestDefence(defences) {
  let best = null
  let bestDps = Infinity
  for (const defence of defences) {
    const dps = computeBuildingDps(defence)
    if (!best || dps < bestDps) {
      best = defence
      bestDps = dps
    }
  }
  return best
}

function minimumBreach(defences, tiles) {
  const remaining = new Set(tiles.map(tile => `${tile.x},${tile.y}`))
  const pool = defences.slice()
  const chosen = []
  while (remaining.size && pool.length) {
    let best = null
    let bestCount = 0
    let bestDps = Infinity
    for (const defence of pool) {
      let count = 0
      for (const key of remaining) {
        const comma = key.indexOf(',')
        const x = Number(key.slice(0, comma))
        const y = Number(key.slice(comma + 1))
        if (defenceCoversTile(defence, x, y)) count++
      }
      const dps = computeBuildingDps(defence)
      if (count > bestCount || (count === bestCount && count > 0 && dps < bestDps)) {
        best = defence
        bestCount = count
        bestDps = dps
      }
    }
    if (!best || bestCount === 0) break
    chosen.push(best)
    pool.splice(pool.indexOf(best), 1)
    for (const key of [...remaining]) {
      const comma = key.indexOf(',')
      const x = Number(key.slice(0, comma))
      const y = Number(key.slice(comma + 1))
      if (defenceCoversTile(best, x, y)) remaining.delete(key)
    }
  }
  return chosen
}

export function planWeakestBreach({ mapGrid, dangerMap, buildings, origin, goalBuilding, gameState, dynamicState = null }) {
  const source = buildings || []
  const defences = source.filter(building => defenceIsActive(building, gameState))
  if (!goalBuilding || !mapGrid?.length || !mapGrid[0]?.length) {
    const weakest = weakestDefence(defences)
    return {
      breachIds: weakest ? [weakest.id] : [],
      peakDanger: weakest ? computeBuildingDps(weakest) : 0,
      path: [],
      gateTile: weakest ? { x: weakest.x, y: weakest.y } : null
    }
  }
  const blocked = new Set()
  for (const building of source) {
    if (building && building.health > 0) buildingFootprint(building, mapGrid[0].length, mapGrid.length, blocked)
  }
  const path = findMinPeakPath(mapGrid, dangerMap, blocked, origin || { x: 0, y: 0 }, goalBuilding, dynamicState)
  if (!path) {
    const weakest = weakestDefence(defences)
    return {
      breachIds: weakest ? [weakest.id] : [],
      peakDanger: weakest ? computeBuildingDps(weakest) : 0,
      path: [],
      gateTile: weakest ? { x: weakest.x, y: weakest.y } : null
    }
  }
  let peakDanger = 0
  const dangerous = []
  for (const tile of path) {
    const danger = dangerAt(dangerMap, tile.x, tile.y, dynamicState)
    if (danger > peakDanger) peakDanger = danger
    if (danger > 0) dangerous.push(tile)
  }
  const gateTile = dangerous[0] || path[path.length - 1] || null
  if (peakDanger <= 0) return { breachIds: [], peakDanger: 0, path, gateTile }
  const breach = minimumBreach(defences, dangerous)
  return { breachIds: breach.map(building => building.id), peakDanger, path, gateTile }
}

function anchorBuilding(buildings) {
  return buildings.find(building => building.type === 'constructionYard')
    || buildings.find(building => building.type === 'vehicleFactory')
    || buildings[0]
    || null
}

function buildingCenter(building) {
  return {
    x: building.x + (building.width || 1) / 2,
    y: building.y + (building.height || 1) / 2
  }
}

function squadCentroid(members) {
  let x = 0
  let y = 0
  let count = 0
  for (const member of members) {
    if (!Number.isFinite(member.tileX) || !Number.isFinite(member.tileY)) continue
    x += member.tileX
    y += member.tileY
    count++
  }
  if (!count) return { x: 0, y: 0 }
  return { x: x / count, y: y / count }
}

function tileWalkable(mapGrid, x, y) {
  if (!mapGrid?.length || y < 0 || x < 0 || y >= mapGrid.length || x >= mapGrid[0].length) return false
  const tile = mapGrid[y][x]
  if (!tile) return false
  return tile.type !== 'water' && tile.type !== 'rock' && !tile.seedCrystal && !tile.building
}

export function chooseRetreatTile({ origin, threat, rally, mapGrid, dangerMap, dynamicState }) {
  const from = origin || rally || { x: 0, y: 0 }
  const awayX = from.x - (Number.isFinite(threat?.x) ? threat.x : from.x)
  const awayY = from.y - (Number.isFinite(threat?.y) ? threat.y : from.y)
  const length = Math.hypot(awayX, awayY) || 1
  const ux = awayX / length
  const uy = awayY / length
  const candidates = []
  if (rally) candidates.push(rally)
  for (const step of [4, 8, 12]) {
    candidates.push({ x: Math.round(from.x + ux * step), y: Math.round(from.y + uy * step) })
    candidates.push({
      x: Math.round(from.x + ux * step - uy * 3),
      y: Math.round(from.y + uy * step + ux * 3)
    })
  }
  let best = rally || from
  let bestDanger = Infinity
  let bestDistance = Infinity
  for (const tile of candidates) {
    if (mapGrid && !tileWalkable(mapGrid, tile.x, tile.y)) continue
    const danger = dangerAt(dangerMap, tile.x, tile.y, dynamicState)
    const distance = rally ? Math.hypot(tile.x - rally.x, tile.y - rally.y) : 0
    if (danger < bestDanger - 0.001 || (Math.abs(danger - bestDanger) <= 0.001 && distance < bestDistance)) {
      best = tile
      bestDanger = danger
      bestDistance = distance
    }
  }
  return best
}

function ownRallyTile(aiPlayerId, gameState) {
  const own = (gameState?.buildings || []).filter(building => building.owner === aiPlayerId && building.health > 0)
  const yard = own.find(building => building.type === 'constructionYard') || own[0]
  if (!yard) return { x: 1, y: 1 }
  return { x: yard.x + (yard.width || 1), y: yard.y + (yard.height || 1) }
}

function countAirDefences(buildings, units, opponentId) {
  let count = 0
  for (const building of buildings) {
    if (building.owner === opponentId && building.health > 0 && AIR_DEFENSE_BUILDINGS.has(building.type)) count++
  }
  for (const unit of units || []) {
    if (unit.owner === opponentId && unit.health > 0 && AIR_DEFENCE_UNIT_TYPES.has(unit.type)) count++
  }
  return count
}

function countGroundDefences(buildings, opponentId) {
  let count = 0
  for (const building of buildings) {
    if (building.owner === opponentId && building.health > 0 && PLAYER_DEFENSE_BUILDINGS.has(building.type)) count++
  }
  return count
}

function tileDistance(a, b) {
  const ax = Number.isFinite(a.tileX) ? a.tileX : a.x
  const ay = Number.isFinite(a.tileY) ? a.tileY : a.y
  const bx = Number.isFinite(b.tileX) ? b.tileX : b.x
  const by = Number.isFinite(b.tileY) ? b.tileY : b.y
  return Math.hypot(ax - bx, ay - by)
}

function findEngagingThreats(members, units, buildings, aiPlayerId, gameState) {
  const threats = []
  for (const unit of units || []) {
    if (!unit || unit.health <= 0 || unit.owner === aiPlayerId) continue
    if (!members.some(member => tileDistance(member, unit) <= ENGAGEMENT_RADIUS_TILES)) continue
    threats.push(unit)
  }
  for (const building of buildings || []) {
    if (!defenceIsActive(building, gameState)) continue
    const range = (building.fireRange || 0) + 1
    if (!members.some(member => tileDistance(member, building) <= range)) continue
    threats.push({ ...building, combatantKind: 'building', dps: computeBuildingDps(building) })
  }
  return threats
}

function threatIsBuilding(threat) {
  return threat?.combatantKind === 'building' || (PLAYER_DEFENSE_BUILDINGS.has(threat?.type) && threat.tileX === undefined)
}

function immediateThreat(members, engaging) {
  let bestUnit = null
  let bestUnitDistance = Infinity
  let bestBuilding = null
  let bestBuildingDistance = Infinity
  for (const threat of engaging || []) {
    if (!threat || threat.health <= 0) continue
    let nearest = Infinity
    let reachable = false
    for (const member of members) {
      const distance = tileDistance(member, threat)
      const range = threatIsBuilding(threat)
        ? Math.max(weaponRangeTiles(member), threat.fireRange || 0)
        : Math.max(weaponRangeTiles(member), weaponRangeTiles(threat))
      if (distance <= range && distance < nearest) {
        nearest = distance
        reachable = true
      }
    }
    if (!reachable) continue
    if (threatIsBuilding(threat)) {
      if (nearest < bestBuildingDistance) {
        bestBuilding = threat
        bestBuildingDistance = nearest
      }
    } else if (nearest < bestUnitDistance) {
      bestUnit = threat
      bestUnitDistance = nearest
    }
  }
  return bestUnit || bestBuilding || null
}

function defendersNearPath(path, units, opponentId) {
  if (!path?.length) return []
  const found = []
  for (const unit of units || []) {
    if (!unit || unit.owner !== opponentId || unit.health <= 0) continue
    if (!SQUAD_COMBAT_TYPES.has(unit.type) && unit.type !== 'apache' && unit.type !== 'destroyer' && unit.type !== 'f22Raptor' && unit.type !== 'f35') continue
    if (!Number.isFinite(unit.tileX) || !Number.isFinite(unit.tileY)) continue
    const range = weaponRangeTiles(unit) + 1
    for (const tile of path) {
      if (Math.hypot(tile.x - unit.tileX, tile.y - unit.tileY) <= range) {
        found.push(unit)
        break
      }
    }
  }
  return found
}

function threatBuildingsFor(target, breachBuildings) {
  if (!target) return []
  if (breachBuildings.some(building => building.id === target.id)) return breachBuildings
  if (PLAYER_DEFENSE_BUILDINGS.has(target.type)) {
    return [{ ...target, combatantKind: 'building', dps: computeBuildingDps(target) }]
  }
  return []
}

function readyCombatants(members) {
  return members.filter(member => member.health > 0 && SQUAD_COMBAT_TYPES.has(member.type) && !isCrippledCrew(member))
}

function ensureBucket(gameState, aiPlayerId) {
  if (!gameState.aiGroundAssault) gameState.aiGroundAssault = {}
  if (!gameState.aiGroundAssault[aiPlayerId]) {
    gameState.aiGroundAssault[aiPlayerId] = { evaluatedAt: null, runs: 0, plans: {} }
  }
  return gameState.aiGroundAssault[aiPlayerId]
}

function opponentDangerMap(aiPlayerId, mapGrid, buildings, gameState) {
  if (typeof generateDangerZoneMapForPlayer !== 'function') return null
  return generateDangerZoneMapForPlayer(aiPlayerId, mapGrid, buildings, gameState)
}

function writeOrders(members, order) {
  for (const member of members) {
    if (member.llmOrderLockUntil && order.now < member.llmOrderLockUntil) continue
    const support = member.type === 'ambulance' || member.type === 'recoveryTank' || member.type === 'ammunitionTruck'
    member.aiAssault = {
      mode: order.mode,
      target: support ? null : (order.target || null),
      frontTile: order.frontTile || null,
      rearTile: order.rearTile || null,
      rallyTile: order.rallyTile,
      retreatTile: order.retreatTile,
      returnFire: order.returnFire || null,
      squadId: order.squadId,
      opponentId: order.opponentId || null,
      role: support || isWoundedUnit(member) ? 'rear' : 'front'
    }
    member.squadId = order.squadId
  }
}

function supportIsBusy(unit) {
  if (unit.type === 'ambulance') return Boolean(unit.healingTarget || unit.refillingTarget || unit.criticalHealing)
  if (unit.type === 'recoveryTank') return Boolean(unit.towedUnit)
  if (unit.type === 'ammunitionTruck') return Boolean(unit.ammoResupplyTarget && unit.ammoResupplyTarget.health > 0)
  return false
}

function claimSupport(units, owner, type, used) {
  const available = []
  for (const unit of units || []) {
    if (!unit || unit.owner !== owner || unit.type !== type || unit.health <= 0 || used.has(unit)) continue
    available.push(unit)
  }
  available.sort((a, b) => String(a.id).localeCompare(String(b.id)))
  return available[0] || null
}

function followSupportUnit(unit, tile, mapGrid, gameState, now) {
  if (supportIsBusy(unit) || !tile || !Number.isFinite(unit.tileX) || !Number.isFinite(unit.tileY)) return
  const x = tile.x
  const y = tile.y
  if (unit.moveTarget && unit.moveTarget.x === x && unit.moveTarget.y === y && unit.path?.length) return
  const path = getCachedPath(
    { x: unit.tileX, y: unit.tileY, owner: unit.owner },
    { x, y },
    mapGrid,
    gameState.occupancyMap,
    { unitOwner: unit.owner }
  )
  if (path?.length > 1) {
    unit.path = path.slice(1)
    unit.moveTarget = { x, y }
    unit.lastPathCalcTime = now
  }
}

export function updateGroundAssaultStrategy(aiPlayerId, units, gameState, mapGrid, now, options = {}) {
  const bucket = ensureBucket(gameState, aiPlayerId)
  const headroom = options.headroomMs !== undefined ? options.headroomMs : globalThis.__cfbFrameHeadroomMs
  if (!shouldRunStrategyEvaluation(bucket.evaluatedAt, now, headroom)) return bucket
  if (!mapGrid?.length || !mapGrid[0]?.length) return bucket

  bucket.evaluatedAt = now
  bucket.runs += 1
  refreshDynamicDangerMaps(gameState, units, mapGrid, now, headroom)
  const squads = formSquads(units, aiPlayerId)
  const assigned = new Set()
  const rallyTile = ownRallyTile(aiPlayerId, gameState)
  const dangerByOpponent = new Map()
  const opponentIds = getEnemyPlayers(aiPlayerId, gameState)
  const opponents = []
  for (const id of opponentIds) {
    const buildings = (gameState.buildings || []).filter(building => building && building.owner === id && building.health > 0)
    if (buildings.length) opponents.push({ id, buildings })
  }

  for (const squad of squads) {
    for (const member of squad.members) assigned.add(member)
    let opponent = null
    let bestDistance = Infinity
    const origin = squadCentroid(squad.members)
    for (const candidate of opponents) {
      const anchor = anchorBuilding(candidate.buildings)
      if (!anchor) continue
      const center = buildingCenter(anchor)
      const distance = Math.hypot(center.x - origin.x, center.y - origin.y)
      if (distance < bestDistance) {
        bestDistance = distance
        opponent = candidate
      }
    }
    if (!opponent) {
      writeOrders(squad.members, { mode: 'hold', rallyTile, retreatTile: rallyTile, squadId: squad.id, now })
      continue
    }
    const anchor = anchorBuilding(opponent.buildings)
    let dangerMap = dangerByOpponent.get(opponent.id)
    if (dangerMap === undefined) {
      dangerMap = opponentDangerMap(aiPlayerId, mapGrid, opponent.buildings, gameState)
      dangerByOpponent.set(opponent.id, dangerMap)
    }
    const dynamicState = gameState.dynamicDangerMaps?.[aiPlayerId] || null
    const breach = planWeakestBreach({
      mapGrid,
      dangerMap,
      buildings: opponent.buildings,
      origin,
      goalBuilding: anchor,
      gameState,
      dynamicState
    })
    const ordered = orderAssaultTargets(opponent.buildings, breach.breachIds)
    const engaging = findEngagingThreats(squad.members, units, opponent.buildings, aiPlayerId, gameState)
    const outcome = engaging.length ? estimateEngagementOutcome(squad.members, engaging) : null
    if (outcome?.shouldRetreat) {
      const threat = engaging[0]
      const threatTile = threat ? {
        x: Number.isFinite(threat.tileX) ? threat.tileX : threat.x,
        y: Number.isFinite(threat.tileY) ? threat.tileY : threat.y
      } : null
      writeOrders(squad.members, {
        mode: 'retreat',
        rallyTile,
        retreatTile: chooseRetreatTile({
          origin,
          threat: threatTile,
          rally: rallyTile,
          mapGrid,
          dangerMap,
          dynamicState
        }),
        returnFire: engaging,
        squadId: squad.id,
        opponentId: opponent.id,
        now
      })
      continue
    }
    const pressing = immediateThreat(squad.members, engaging)
    if (pressing) {
      const tiles = assaultFormationTiles(origin, pressing) || { frontTile: origin, rearTile: origin }
      writeOrders(squad.members, {
        mode: 'attack',
        target: pressing.combatantKind === 'building' ? (opponent.buildings.find(building => building.id === pressing.id) || pressing) : pressing,
        frontTile: tiles.frontTile,
        rearTile: tiles.rearTile,
        rallyTile,
        retreatTile: rallyTile,
        squadId: squad.id,
        opponentId: opponent.id,
        now
      })
      continue
    }
    if (outcome?.preferredTarget) {
      const tiles = assaultFormationTiles(origin, outcome.preferredTarget) || { frontTile: origin, rearTile: origin }
      writeOrders(squad.members, {
        mode: 'attack',
        target: outcome.preferredTarget,
        frontTile: tiles.frontTile,
        rearTile: tiles.rearTile,
        rallyTile,
        retreatTile: rallyTile,
        squadId: squad.id,
        opponentId: opponent.id,
        now
      })
      continue
    }

    const combatants = readyCombatants(squad.members)
    const groundDefenceCount = countGroundDefences(opponent.buildings, opponent.id)
    const airDefenceCount = countAirDefences(opponent.buildings, units, opponent.id)
    const breachBuildings = ordered.filter(building => breach.breachIds.includes(building.id))
    const pathDefenders = defendersNearPath(breach.path, units, opponent.id)
    let target = null
    if (mayGroundForceAttackBase({
      combatantCount: combatants.length,
      groundDefenceCount,
      airDefenceCount
    })) {
      for (const candidate of ordered) {
        const threats = [...threatBuildingsFor(candidate, breachBuildings), ...pathDefenders]
        if (!squadHasSufficientFirepower(combatants, threats)) break
        target = candidate
        break
      }
    }
    if (!target) {
      writeOrders(squad.members, {
        mode: 'hold',
        rallyTile,
        retreatTile: rallyTile,
        squadId: squad.id,
        opponentId: opponent.id,
        now
      })
      continue
    }
    const moveAnchor = breach.breachIds.includes(target.id) && breach.gateTile ? breach.gateTile : target
    const tiles = assaultFormationTiles(origin, moveAnchor) || { frontTile: { x: target.x, y: target.y }, rearTile: { x: target.x, y: target.y } }
    writeOrders(squad.members, {
      mode: 'attack',
      target,
      frontTile: tiles.frontTile,
      rearTile: tiles.rearTile,
      rallyTile,
      retreatTile: rallyTile,
      squadId: squad.id,
      opponentId: opponent.id,
      now
    })
  }

  for (const squad of squads) {
    const sample = squad.members.find(member => member.aiAssault) || squad.members[0]
    const order = sample?.aiAssault
    if (!order) continue
    const followTile = order.rearTile || order.retreatTile || order.rallyTile
    for (const type of ['ambulance', 'recoveryTank', 'ammunitionTruck']) {
      const support = claimSupport(units, aiPlayerId, type, assigned)
      if (!support) continue
      assigned.add(support)
      writeOrders([support], {
        mode: order.mode === 'attack' ? 'attack' : order.mode,
        target: null,
        frontTile: order.frontTile,
        rearTile: followTile,
        rallyTile: order.rallyTile,
        retreatTile: order.retreatTile,
        squadId: order.squadId,
        opponentId: order.opponentId,
        now
      })
      followSupportUnit(support, followTile, mapGrid, gameState, now)
    }
  }

  for (const unit of units || []) {
    if (!unit || unit.owner !== aiPlayerId || !unit.aiAssault || assigned.has(unit)) continue
    if (unit.llmOrderLockUntil && now < unit.llmOrderLockUntil) continue
    unit.aiAssault = null
    unit.squadId = null
  }
  bucket.plans = { squads: squads.map(squad => squad.id) }
  return bucket
}
