import { getFireSeverity } from './fireSeverity.js'
import { TILE_SIZE, FIRE_SPREAD_PROBABILITY, FIRE_DAMAGE_PER_SECOND, FIRE_WATER_CAPACITY, FIRE_WATER_PER_SECOND, FIRE_EXTINGUISH_SECONDS, FIRE_HOSE_RANGE, WIND_DIRECTION } from '../config.js'
import { getRegisteredDecorationLayout } from './decorationLayoutRegistry.js'
import { gameRandom } from '../utils/gameRandom.js'
import { getCityAtWorld, applyCityDamage } from './cityBuildings.js'
import { isTankUnit } from './hitZoneCalculator.js'
import { getValidDecorationCell } from '../rendering/decorationLayout.js'
import { notifyTopologyMutation } from '../rendering/prepared/mapMutationNotifier.js'
import { addFixedOccupancy } from './occupancyTags.js'
import { clearPathCache } from './pathCache.js'
import { clearFlowFields } from './flowField.js'
import { hasBuildingFire } from './fireQueries.js'
import { notifyBuildingFire } from '../ui/fireNotifications.js'

const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const ignitionRolls = new WeakMap()
const stationIndex = new Map()
const stationLoads = new Map()
const dispatchTargets = new Map()
const freeStationHeads = new Map()
const nextFreeStation = new Map()
function structure(grid, x, y) {
  return grid?.[y]?.[x]?.building || getCityAtWorld(grid, (x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE)
}
export const NON_STRUCTURE_BURN_SECONDS = 30
const vegetationTags = ['tree', 'trees', 'woods']

function combustibleDecoration(grid, x, y) {
  const layout = getRegisteredDecorationLayout(grid)
  const cell = layout?.cells[y * layout.width + x]
  const tags = cell?.group.tagSet
  if (!tags || !(tags.has('trees') || tags.has('woods') || tags.has('farm') || tags.has('ruins') || tags.has('roadside'))) return null
  return getValidDecorationCell(layout, grid, x, y, cell.biome)
}

function isVegetation(tile) {
  return vegetationTags.includes(tile.type) || vegetationTags.some(tag => tile.tags?.includes(tag))
}

export function isFlammable(grid, x, y) {
  const tile = grid?.[y]?.[x]
  if (!tile || tile.type === 'water') return false
  const building = structure(grid, x, y)
  if (building) return building.health > 0 && building.type !== 'street' && building.type !== 'concreteWall'
  return !tile.burnedFuel && (isVegetation(tile) || Boolean(combustibleDecoration(grid, x, y)))
}

export function burnOut(state, grid, x, y) {
  const source = grid?.[y]?.[x]
  if (!source || source.burnedFuel) return
  const cell = combustibleDecoration(grid, x, y)
  const layout = cell ? getRegisteredDecorationLayout(grid) : null
  const left = cell?.anchorX ?? x
  const top = cell?.anchorY ?? y
  const right = left + (cell?.footprintWidth || cell?.group.width || 1) - 1
  const bottom = top + (cell?.footprintHeight || cell?.group.height || 1) - 1
  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      const tile = grid[ty][tx]
      tile.burnedFuel = true
      if (vegetationTags.includes(tile.type)) tile.type = 'land'
      if (tile.tags) tile.tags = tile.tags.filter(tag => !vegetationTags.includes(tag))
      if (layout && state.occupancyMap?.[ty] && !tile.building) {
        const decorationTile = layout.cells[ty * layout.width + tx]
        const offset = `${decorationTile?.offsetX},${decorationTile?.offsetY}`
        if (cell.group.tilesByOffset?.[offset]?.tags?.includes('impassable')) {
          state.occupancyMap[ty][tx] = addFixedOccupancy(state.occupancyMap[ty][tx], -1)
        }
      }
    }
  }
  notifyTopologyMutation(grid, { left, top, right: right + 1, bottom: bottom + 1 })
  clearPathCache()
  clearFlowFields()
}

export function igniteTile(state, grid, x, y) {
  const tile = grid?.[y]?.[x]
  if (!tile || tile.fire || !isFlammable(grid, x, y)) return false
  const building = structure(grid, x, y)
  if (building && building.owner === state.humanPlayer && !hasBuildingFire(grid, building)) notifyBuildingFire(state, grid, building)
  const fire = { x, y, age: 0, spreadElapsed: 0, suppression: 0 }
  tile.fire = fire
  // Fire is an overlay tag; underlying terrain and footprint stay intact.
  tile.tags ||= []
  if (!tile.tags.includes('fire')) tile.tags.push('fire')
  ;(state.fires ||= []).push(fire)
  return true
}
function activeSeverity(fire) {
  if (!fire) return 0
  const severity = getFireSeverity(fire)
  return fire.suppression >= FIRE_EXTINGUISH_SECONDS * severity ? 0 : severity
}

function spreadToTile(state, grid, x, y) {
  const existing = grid[y][x].fire
  if (existing) {
    if (getFireSeverity(existing) < 5) existing.spreadBoost = (existing.spreadBoost || 0) + 1
  } else igniteTile(state, grid, x, y)
}
function clearFire(grid, fire) {
  const tile = grid?.[fire.y]?.[fire.x]
  if (!tile) return
  delete tile.fire
  const index = tile.tags?.indexOf('fire') ?? -1
  if (index >= 0) tile.tags.splice(index, 1)
}
export function restoreFires(state, grid, records) {
  for (const fire of state.fires || []) clearFire(grid, fire)
  state.fires = []
  for (const saved of records) {
    if (!Number.isInteger(saved.x) || !Number.isInteger(saved.y) || !grid?.[saved.y]?.[saved.x] || grid[saved.y][saved.x].fire) continue
    const fire = { x: saved.x, y: saved.y, age: Math.max(0, Number(saved.age) || 0), spreadElapsed: Math.max(0, Number(saved.spreadElapsed) || 0), suppression: Math.max(0, Number(saved.suppression) || 0) }
    if (saved.spreadBoost > 0) fire.spreadBoost = Math.min(4, Math.floor(saved.spreadBoost))
    grid[fire.y][fire.x].fire = fire
    const tile = grid[fire.y][fire.x]
    tile.tags ||= []
    if (!tile.tags.includes('fire')) tile.tags.push('fire')
    state.fires.push(fire)
  }
}
function ignitionAlreadyRolled(bullet, building) {
  if (!bullet || typeof bullet !== 'object') return false
  let seen = ignitionRolls.get(bullet)
  if (!seen) {
    seen = new Set()
    ignitionRolls.set(bullet, seen)
  }
  const id = building.id ?? `${building.x}:${building.y}`
  if (seen.has(id)) return true
  seen.add(id)
  return false
}
export function igniteFromProjectile(state, grid, building, bullet, random = gameRandom) {
  if (!(building.health > 0) || bullet.noBuildingDamage) return false
  const kind = `${bullet.originType || bullet.shooter?.type || ''} ${bullet.projectileType || ''}`
  if (!/tank|howitzer|artillery|rocket|grenade|shell/i.test(kind)) return false
  // A direct hit and its splash share one projectile. Roll each building once.
  if (ignitionAlreadyRolled(bullet, building)) return false
  const damageRatio = 1 - building.health / (building.maxHealth || 300)
  if (random() >= 0.08 + 0.52 * Math.max(0, Math.min(1, damageRatio))) return false
  const x = Math.max(building.x, Math.min(building.x + (building.width || 1) - 1, Math.floor(bullet.x / TILE_SIZE)))
  const y = Math.max(building.y, Math.min(building.y + (building.height || 1) - 1, Math.floor(bullet.y / TILE_SIZE)))
  return igniteTile(state, grid, x, y)
}

// 60 simulation ticks/s. O(buildings + units + active fires * 4 + engines * 81).
// Reuse service indexes; never scan the map, resize sprites, or search unit arrays per engine.
export function updateFireSystem(units, state, grid, delta, findPath, random = gameRandom) {
  const seconds = Math.max(0, delta) / 1000
  if (!seconds) return
  const fires = state.fires
  let hasEngines = false
  for (const unit of units) if (unit.type === 'fireEngine' && unit.health > 0) { hasEngines = true; break }
  if (!fires?.length && !hasEngines) return
  if (fires) for (const fire of fires) fire.sprayed = false
  dispatchTargets.clear()
  if (fires) for (const fire of fires) {
    const owner = structure(grid, fire.x, fire.y)?.owner
    if (owner && !dispatchTargets.has(owner)) dispatchTargets.set(owner, fire)
  }
  stationIndex.clear()
  stationLoads.clear()
  for (const building of state.buildings || []) {
    if (building.type === 'fireDepartment' && building.health > 0) {
      stationIndex.set(building.id, building)
      stationLoads.set(building.id, 0)
    }
  }
  for (const unit of units) {
    if (unit.type !== 'fireEngine' || unit.health <= 0) continue
    const home = stationIndex.get(unit.fireHomeId)
    if (home?.owner === unit.owner && stationLoads.get(home.id) < 4) stationLoads.set(home.id, stationLoads.get(home.id) + 1)
    else unit.fireHomeId = null
  }
  freeStationHeads.clear()
  nextFreeStation.clear()
  for (const station of stationIndex.values()) {
    if (stationLoads.get(station.id) >= 4) continue
    nextFreeStation.set(station.id, freeStationHeads.get(station.owner) || null)
    freeStationHeads.set(station.owner, station)
  }
  for (const unit of units) {
    if (unit.type !== 'fireEngine' || unit.health <= 0 || unit.factoryExit) continue
    unit.maxWater ??= FIRE_WATER_CAPACITY
    unit.water ??= unit.maxWater
    unit.extinguishing = null
    if (!unit.fireHomeId) {
      const station = freeStationHeads.get(unit.owner)
      if (station) {
        unit.fireHomeId = station.id
        const load = stationLoads.get(station.id) + 1
        stationLoads.set(station.id, load)
        if (load >= 4) freeStationHeads.set(unit.owner, nextFreeStation.get(station.id))
      }
    }
    const x = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const y = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
    const home = stationIndex.get(unit.fireHomeId)
    if (home && x >= home.x - 1 && x <= home.x + home.width && y >= home.y - 1 && y <= home.y + home.height) {
      unit.water = Math.min(unit.maxWater, unit.water + seconds * 200)
    }
    if (unit.water <= 0) {
      if (home && !unit.path?.length && findPath && (state.simulationTime || 0) >= (unit.fireRepathAt || 0)) {
        unit.fireRepathAt = (state.simulationTime || 0) + 1000
        for (const [dx, dy] of neighbours) {
          const tx = dx > 0 ? home.x + home.width : dx < 0 ? home.x - 1 : home.x
          const ty = dy > 0 ? home.y + home.height : dy < 0 ? home.y - 1 : home.y
          if (!grid?.[ty]?.[tx] || grid[ty][tx].building) continue
          const path = findPath({ x, y, owner: unit.owner, type: unit.type }, { x: tx, y: ty }, grid, state.occupancyMap)
          if (path?.length > 1) { unit.path = path.slice(1); unit.moveTarget = { x: tx, y: ty }; break }
        }
      }
      continue
    }
    if (unit.crew && !unit.crew.loader) continue
    if (unit.remoteControlActive && !unit.fireManualSpray) continue
    let target = null
    let distance = Infinity
    for (let dy = -FIRE_HOSE_RANGE; dy <= FIRE_HOSE_RANGE; dy++) {
      for (let dx = -FIRE_HOSE_RANGE; dx <= FIRE_HOSE_RANGE; dx++) {
        const fire = grid?.[y + dy]?.[x + dx]?.fire
        const d = dx * dx + dy * dy
        if (fire && d <= FIRE_HOSE_RANGE ** 2 && d < distance) { target = fire; distance = d }
      }
    }
    if (!target && unit.water >= FIRE_WATER_PER_SECOND * FIRE_EXTINGUISH_SECONDS && !unit.path?.length && !unit.remoteControlActive && findPath && (state.simulationTime || 0) >= (unit.fireRepathAt || 0)) {
      const incident = dispatchTargets.get(unit.owner)
      if (incident) {
        unit.fireRepathAt = (state.simulationTime || 0) + 1000
        for (const [dx, dy] of neighbours) {
          const tx = incident.x + dx * (FIRE_HOSE_RANGE - 1)
          const ty = incident.y + dy * (FIRE_HOSE_RANGE - 1)
          if (!grid?.[ty]?.[tx] || grid[ty][tx].building) continue
          const path = findPath({ x, y, owner: unit.owner, type: unit.type }, { x: tx, y: ty }, grid, state.occupancyMap)
          if (path?.length > 1) { unit.path = path.slice(1); unit.moveTarget = { x: tx, y: ty }; break }
        }
      }
    }
    if (target) {
      const used = Math.min(unit.water, FIRE_WATER_PER_SECOND * seconds)
      unit.water -= used
      target.sprayed = true
      target.suppression += used / FIRE_WATER_PER_SECOND
      unit.fireSprayPoint ||= { x: 0, y: 0 }
      unit.fireSprayPoint.x = target.x
      unit.fireSprayPoint.y = target.y
      unit.extinguishing = unit.fireSprayPoint
    }
  }
  if (!fires?.length) return
  // One bounded lookup per occupied tile and four neighbours per unit per tick.
  for (const unit of units) {
    if (!unit || unit.health <= 0 || unit.embarkedOnId || (unit.isAirUnit && unit.altitude > 0)) continue
    const x = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const y = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
    const ownFire = grid?.[y]?.[x]?.fire
    let damage = ownFire ? FIRE_DAMAGE_PER_SECOND * activeSeverity(ownFire) * 0.6 * (isTankUnit(unit) ? 0.2 : 1) : 0
    for (const [dx, dy] of neighbours) {
      const adjacent = grid?.[y + dy]?.[x + dx]?.fire
      if (adjacent) damage += FIRE_DAMAGE_PER_SECOND * activeSeverity(adjacent) * 0.3
    }
    damage *= seconds
    if (damage <= 0) continue
    if (unit.owner === state.humanPlayer && globalThis.window?.cheatSystem) damage = window.cheatSystem.preventDamage(unit, damage)
    if (damage > 0) unit.health = Math.max(0, unit.health - damage)
  }
  // Fix the count so newly spread fires cannot spread/damage again in this tick.
  const count = fires.length
  // Repair cooldowns compare this stamp with simulation time. Wall-clock time
  // diverges between a live match and its replay.
  const attackTime = state.simulationTime || 0
  for (let i = count - 1; i >= 0; i--) {
    const fire = fires[i]
    const severity = getFireSeverity(fire)
    if (fire.suppression >= FIRE_EXTINGUISH_SECONDS * severity || !isFlammable(grid, fire.x, fire.y)) {
      clearFire(grid, fire)
      fires.splice(i, 1)
      continue
    }
    fire.age += seconds
    const building = structure(grid, fire.x, fire.y)
    if (building) {
      let damage = FIRE_DAMAGE_PER_SECOND * severity * seconds
      if (building.owner === state.humanPlayer && globalThis.window?.cheatSystem) damage = window.cheatSystem.preventDamage(building, damage)
      if (building.type === 'city') applyCityDamage(building, damage, grid, state)
      else {
        building.health = Math.max(0, building.health - damage)
        building.destroyedCause = 'fire'
        building.lastAttackedTime = attackTime
        building.needsRepairPause = true
      }
    }
    if (!building && fire.age >= NON_STRUCTURE_BURN_SECONDS) {
      burnOut(state, grid, fire.x, fire.y)
      clearFire(grid, fire)
      fires.splice(i, 1)
      continue
    }
    if (fire.sprayed) { fire.spreadElapsed = 0; continue }
    fire.spreadElapsed += seconds
    if (fire.spreadElapsed < 5) continue
    fire.spreadElapsed -= 5
    for (const [dx, dy] of neighbours) {
      const nx = fire.x + dx, ny = fire.y + dy
      if (isFlammable(grid, nx, ny)) {
        if (random() < Math.min(1, FIRE_SPREAD_PROBABILITY * severity * Math.max(0.25, 1 + dx * WIND_DIRECTION.x + dy * WIND_DIRECTION.y))) {
          spreadToTile(state, grid, nx, ny)
        }
      } else if (building && dx * WIND_DIRECTION.x + dy * WIND_DIRECTION.y > 0 && !grid?.[ny]?.[nx]?.building) {
        const other = structure(grid, nx + dx, ny + dy)
        if (other && other !== building && random() < Math.min(1, FIRE_SPREAD_PROBABILITY * severity * Math.max(0.25, 1 + dx * WIND_DIRECTION.x + dy * WIND_DIRECTION.y))) spreadToTile(state, grid, nx + dx, ny + dy)
      }
    }
  }
}

export function igniteApacheImpact(state, grid, bullet, random = gameRandom) {
  if (bullet.noBuildingDamage) return false
  const x = Math.floor(bullet.x / TILE_SIZE), y = Math.floor(bullet.y / TILE_SIZE)
  const building = structure(grid, x, y)
  if (building) return igniteFromProjectile(state, grid, building, bullet, random)
  return random() < 0.25 && igniteTile(state, grid, x, y)
}

// Ground impacts on prepared decorative footprints have no building entity.
export function igniteDecorationImpact(state, grid, bullet, x, y, random = gameRandom) {
  if (bullet.noBuildingDamage || !/tank|howitzer|artillery|rocket|grenade|shell/i.test(`${bullet.originType || bullet.shooter?.type || ''} ${bullet.projectileType || ''}`)) return false
  const tx = Math.floor(x / TILE_SIZE), ty = Math.floor(y / TILE_SIZE)
  if (structure(grid, tx, ty) || !combustibleDecoration(grid, tx, ty) || grid[ty][tx].fire) return false
  return random() < 0.25 && igniteTile(state, grid, tx, ty)
}
