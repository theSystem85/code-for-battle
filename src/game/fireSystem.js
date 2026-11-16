import { getFireSeverity } from './fireSeverity.js'
import { TILE_SIZE, FIRE_SPREAD_PROBABILITY, FIRE_DAMAGE_PER_SECOND, FIRE_WATER_CAPACITY, FIRE_WATER_PER_SECOND, FIRE_EXTINGUISH_SECONDS, FIRE_HOSE_RANGE, WIND_DIRECTION } from '../config.js'
import { getRegisteredDecorationLayout } from './decorationLayoutRegistry.js'
import { gameRandom } from '../utils/gameRandom.js'
import { getCityAtWorld, applyCityDamage } from './cityBuildings.js'

const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const stationIndex = new Map()
const stationLoads = new Map()
const dispatchTargets = new Map()
const freeStationHeads = new Map()
const nextFreeStation = new Map()
function structure(grid, x, y) {
  return grid?.[y]?.[x]?.building || getCityAtWorld(grid, (x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE)
}
export function isFlammable(grid, x, y) {
  const tile = grid?.[y]?.[x]
  if (!tile) return false
  const building = structure(grid, x, y)
  const cell = getRegisteredDecorationLayout(grid)?.cells?.[y * (grid[0]?.length || 0) + x]
  return building ? building.health > 0 && building.type !== 'street' && building.type !== 'concreteWall' : tile.type === 'tree' || tile.type === 'woods' || tile.tags?.includes('trees') || tile.tags?.includes('woods') || cell?.group?.tagSet?.has('trees') || cell?.group?.tagSet?.has('woods')
}
export function igniteTile(state, grid, x, y) {
  const tile = grid?.[y]?.[x]
  if (!tile || tile.fire || !isFlammable(grid, x, y)) return false
  const fire = { x, y, age: 0, spreadElapsed: 0, suppression: 0 }
  tile.fire = fire
  // Fire is an overlay tag; underlying terrain and footprint stay intact.
  tile.tags ||= []
  if (!tile.tags.includes('fire')) tile.tags.push('fire')
  ;(state.fires ||= []).push(fire)
  return true
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
    if (!Number.isInteger(saved.x) || !Number.isInteger(saved.y) || !grid?.[saved.y]?.[saved.x]) continue
    const fire = { x: saved.x, y: saved.y, age: Math.max(0, Number(saved.age) || 0), spreadElapsed: Math.max(0, Number(saved.spreadElapsed) || 0), suppression: Math.max(0, Number(saved.suppression) || 0) }
    grid[fire.y][fire.x].fire = fire
    const tile = grid[fire.y][fire.x]
    tile.tags ||= []
    if (!tile.tags.includes('fire')) tile.tags.push('fire')
    state.fires.push(fire)
  }
}
export function igniteFromProjectile(state, grid, building, bullet, random = gameRandom) {
  if (!(building.health > 0) || bullet.noBuildingDamage) return false
  const kind = `${bullet.originType || ''} ${bullet.projectileType || ''}`
  if (!/tank|howitzer|artillery|rocket|grenade|shell/i.test(kind)) return false
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
  // Fix the count so newly spread fires cannot spread/damage again in this tick.
  const count = fires.length
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
      else { building.health = Math.max(0, building.health - damage); building.destroyedCause = 'fire' }
    }
    if (fire.sprayed) { fire.spreadElapsed = 0; continue }
    fire.spreadElapsed += seconds
    if (fire.spreadElapsed < 5) continue
    fire.spreadElapsed -= 5
    for (const [dx, dy] of neighbours) {
      const nx = fire.x + dx, ny = fire.y + dy
      if (isFlammable(grid, nx, ny)) {
        if (random() < Math.min(1, FIRE_SPREAD_PROBABILITY * severity * Math.max(0.25, 1 + dx * WIND_DIRECTION.x + dy * WIND_DIRECTION.y))) igniteTile(state, grid, nx, ny)
      } else if (building && dx * WIND_DIRECTION.x + dy * WIND_DIRECTION.y > 0 && !grid?.[ny]?.[nx]?.building) {
        const other = structure(grid, nx + dx, ny + dy)
        if (other && other !== building && random() < Math.min(1, FIRE_SPREAD_PROBABILITY * severity * Math.max(0.25, 1 + dx * WIND_DIRECTION.x + dy * WIND_DIRECTION.y))) igniteTile(state, grid, nx + dx, ny + dy)
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
