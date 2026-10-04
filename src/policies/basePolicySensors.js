// Base sensors: measure build-policy conditions from real game fields.
//
// measureBaseLeaf(condition) returns a number, or undefined when the field
// cannot be measured right now (an unavailable measurement is never true).
//
// Hot path: a base pass runs at most once per BASE_EVAL_INTERVAL_MS (see
// basePolicyEngine.js), not per tick. The unit and building scans below run
// lazily, once per pass, and only for the leaves a policy actually uses. The
// count maps and the money history reuse their storage, so a pass allocates
// nothing after the first one.
//
// Fields that exist in the game:
//   money            context.getMoney(owner)            (gameState.money for the human player)
//   power            context.getPower(owner)            (gameState.playerPowerSupply)
//   moneyPerMinute   rolling window over context.getMoneyEarned() (gameState.totalMoneyEarned,
//                    which counts ore delivered to a refinery and recovery refunds)
//   building / unit counts of the owner, and of enemies the owner can see
// Not measurable and therefore not offered: income of AI factions (the game
// keeps no earnings counter for them), and a building count "under construction".

import { paramValue } from './policyConditions.js'
import { entityCenter, sameParty } from './policyWorld.js'

export const MONEY_WINDOW_MS = 60000
export const MONEY_MIN_SPAN_MS = 10000
export const MONEY_SAMPLE_MS = 1000
const MAX_SAMPLES = Math.ceil(MONEY_WINDOW_MS / MONEY_SAMPLE_MS) + 5

const scope = {
  context: null,
  owner: null,
  now: 0,
  ownValid: false,
  enemyValid: false
}

const counts = {
  ownUnits: new Map(),
  ownBuildings: new Map(),
  enemyUnits: new Map(),
  enemyBuildings: new Map()
}

const history = {
  times: new Float64Array(MAX_SAMPLES),
  totals: new Float64Array(MAX_SAMPLES),
  head: 0,
  size: 0
}

const point = { x: 0, y: 0 }

export function resetBaseSensors() {
  history.head = 0
  history.size = 0
  scope.context = null
  scope.ownValid = false
  scope.enemyValid = false
}

function sampleAt(offsetFromOldest) {
  return (history.head + offsetFromOldest) % MAX_SAMPLES
}

function recordMoney(now, total) {
  if (history.size > 0) {
    const newest = sampleAt(history.size - 1)
    if (now < history.times[newest]) {
      history.head = 0
      history.size = 0
    } else if (now - history.times[newest] < MONEY_SAMPLE_MS) {
      return
    }
  }
  if (history.size === MAX_SAMPLES) {
    history.head = (history.head + 1) % MAX_SAMPLES
    history.size -= 1
  }
  const slot = sampleAt(history.size)
  history.times[slot] = now
  history.totals[slot] = total
  history.size += 1
}

/** Money earned per minute over the last minute, once at least MONEY_MIN_SPAN_MS of history exists. */
function moneyPerMinute() {
  if (history.size < 2) return undefined
  const newest = sampleAt(history.size - 1)
  const windowStart = history.times[newest] - MONEY_WINDOW_MS
  let oldest = sampleAt(0)
  for (let i = 0; i < history.size; i++) {
    const slot = sampleAt(i)
    if (history.times[slot] >= windowStart) {
      oldest = slot
      break
    }
  }
  const span = history.times[newest] - history.times[oldest]
  if (span < MONEY_MIN_SPAN_MS) return undefined
  return Math.max(0, history.totals[newest] - history.totals[oldest]) / span * 60000
}

/**
 * Prepare the sensors for one base pass. Cheap: no entity scans happen here,
 * only one money sample per second.
 */
export function beginBaseScope(context, owner, now) {
  scope.context = context
  scope.owner = owner
  scope.now = now
  scope.ownValid = false
  scope.enemyValid = false
  if (typeof context.getMoneyEarned === 'function') {
    const total = context.getMoneyEarned(owner)
    if (typeof total === 'number' && Number.isFinite(total)) recordMoney(now, total)
  }
}

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1)
}

function ensureOwn() {
  if (scope.ownValid) return
  scope.ownValid = true
  counts.ownUnits.clear()
  counts.ownBuildings.clear()
  const { units, buildings } = scope.context
  if (units) {
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]
      if (!unit || !(unit.health > 0) || unit.embarkedOnId || !sameParty(unit.owner, scope.owner)) continue
      bump(counts.ownUnits, unit.type)
      bump(counts.ownUnits, 'any')
    }
  }
  if (buildings) {
    for (let i = 0; i < buildings.length; i++) {
      const building = buildings[i]
      if (!building || !(building.health > 0) || !sameParty(building.owner, scope.owner)) continue
      bump(counts.ownBuildings, building.type)
      bump(counts.ownBuildings, 'any')
    }
  }
}

function seen(entity) {
  entityCenter(entity, point)
  return scope.context.isPositionVisible ? scope.context.isPositionVisible(scope.owner, point.x, point.y) : true
}

function ensureEnemy() {
  if (scope.enemyValid) return
  scope.enemyValid = true
  counts.enemyUnits.clear()
  counts.enemyBuildings.clear()
  const { units, buildings } = scope.context
  if (units) {
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]
      if (!unit || !(unit.health > 0) || unit.embarkedOnId || !unit.owner || sameParty(unit.owner, scope.owner)) continue
      if (!seen(unit)) continue
      bump(counts.enemyUnits, unit.type)
      bump(counts.enemyUnits, 'any')
    }
  }
  if (buildings) {
    for (let i = 0; i < buildings.length; i++) {
      const building = buildings[i]
      if (!building || !(building.health > 0) || !building.owner || sameParty(building.owner, scope.owner)) continue
      if (!seen(building)) continue
      bump(counts.enemyBuildings, building.type)
      bump(counts.enemyBuildings, 'any')
    }
  }
}

export function measureBaseLeaf(condition) {
  if (condition.type !== 'compare') return undefined
  const { context, owner } = scope
  if (!context) return undefined
  switch (condition.field) {
    case 'money':
      return context.getMoney ? context.getMoney(owner) : undefined
    case 'power':
      return context.getPower ? context.getPower(owner) : undefined
    case 'moneyPerMinute':
      return moneyPerMinute()
    case 'buildingCount':
      ensureOwn()
      return counts.ownBuildings.get(paramValue(condition, 'buildingType')) || 0
    case 'unitCount':
      ensureOwn()
      return counts.ownUnits.get(paramValue(condition, 'unitType')) || 0
    case 'enemyUnitCount':
      ensureEnemy()
      return counts.enemyUnits.get(paramValue(condition, 'unitType')) || 0
    case 'enemyBuildingCount':
      ensureEnemy()
      return counts.enemyBuildings.get(paramValue(condition, 'buildingType')) || 0
    default:
      return undefined
  }
}
