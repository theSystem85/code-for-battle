import { clearFlowFields } from './flowField.js'
import { CITY_BUILDING_HEALTH, TILE_SIZE } from '../config.js'
import { setBuildingDebrisDecals, setDecalSurfaceBlocker } from './tileDecals.js'
import { notifySurfaceTileMutation, notifyTopologyMutation } from '../rendering/prepared/mapMutationNotifier.js'
import { clearPathCache } from './pathCache.js'
import { spawnDestructionExplosion } from './spriteSheetEffects.js'

const registries = new WeakMap()
const EMPTY = Object.freeze([])
const layouts = new WeakMap()

// Living city buildings are impassable structures, so impacts on them leave no decal.
setDecalSurfaceBlocker('cityBuildings', (mapGrid, tileX, tileY) => {
  const building = getCityAtWorld(mapGrid, (tileX + 0.5) * TILE_SIZE, (tileY + 0.5) * TILE_SIZE)
  return Boolean(building && building.health > 0)
})

export function getCityBuildings(mapGrid) {
  return registries.get(mapGrid) || EMPTY
}

// Preparation only. Every covered layout cell shares one persistent object.
export function prepareCityBuildings(mapGrid, layout) {
  const buildings = []
  const seen = new Set()
  for (const cell of layout.cells) {
    if (!cell?.group.tagSet.has('city')) continue
    const key = `${cell.anchorX},${cell.anchorY}`
    const tile = mapGrid[cell.anchorY][cell.anchorX]
    if (!seen.has(key)) {
      seen.add(key)
      const area = cell.group.width * cell.group.height
      const maxHealth = CITY_BUILDING_HEALTH[area] || area * 100
      tile.cityBuilding ||= {
        id: `city-${key}`, type: 'city', owner: 'neutral',
        x: cell.anchorX, y: cell.anchorY,
        width: cell.group.width, height: cell.group.height,
        health: maxHealth, maxHealth
      }
      buildings.push(tile.cityBuilding)
    }
    cell.cityBuilding = tile.cityBuilding
  }
  layouts.set(mapGrid, layout)
  registries.set(mapGrid, buildings)
  applyCityStreets(mapGrid, layout)
  return buildings
}

/**
 * Stamp the layout's city streets as ordinary street tiles (flagged
 * `cityStreet`) and revert streets a previous layout added that the new one
 * no longer wants. Layout preparation treats flagged streets as land, so a
 * rebuilt layout yields the same streets and this is idempotent.
 */
export function applyCityStreets(mapGrid, layout) {
  const height = mapGrid?.length || 0
  const width = mapGrid?.[0]?.length || 0
  if (!width || !height) return 0
  const wanted = new Set(layout?.width === width ? layout.cityStreets || [] : [])
  let changed = 0
  let bounds = null
  const touch = (x, y) => {
    changed++
    bounds = bounds
      ? { left: Math.min(bounds.left, x), top: Math.min(bounds.top, y), right: Math.max(bounds.right, x + 1), bottom: Math.max(bounds.bottom, y + 1) }
      : { left: x, top: y, right: x + 1, bottom: y + 1 }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = mapGrid[y][x]
      if (!tile?.cityStreet || wanted.has(y * width + x)) continue
      delete tile.cityStreet
      if (tile.type === 'street') {
        tile.type = 'land'
        touch(x, y)
      }
    }
  }
  for (const offset of wanted) {
    const x = offset % width
    const y = (offset - x) / width
    const tile = mapGrid[y]?.[x]
    if (!tile || tile.cityStreet || tile.type !== 'land' || tile.building) continue
    tile.type = 'street'
    tile.cityStreet = true
    touch(x, y)
  }
  if (changed) {
    notifyTopologyMutation(mapGrid, bounds)
    clearPathCache()
    clearFlowFields()
  }
  return changed
}

export function getCityAtWorld(mapGrid, x, y) {
  const layout = layouts.get(mapGrid)
  if (!layout) return null
  const tileX = Math.floor(x / TILE_SIZE)
  const tileY = Math.floor(y / TILE_SIZE)
  if (tileX < 0 || tileY < 0 || tileX >= layout.width || tileY >= layout.height) return null
  return layout.cells[tileY * layout.width + tileX]?.cityBuilding || null
}

// Living city structure under a world point, for normal attack clicks and hover.
export function getAttackableCityAtWorld(mapGrid, x, y) {
  const building = getCityAtWorld(mapGrid, x, y)
  return building && building.health > 0 ? building : null
}

export function isCityBuildingTarget(entity) {
  return Boolean(entity) && entity.type === 'city' && entity.owner === 'neutral' &&
    typeof entity.id === 'string' && entity.id.startsWith('city-')
}

// City ids encode their anchor tile (`city-x,y`), so commands, replays and
// saves can resolve them from the map grid before the layout is prepared.
export function findCityBuildingById(mapGrid, id) {
  const match = /^city-(\d+),(\d+)$/.exec(typeof id === 'string' ? id : '')
  if (!match) return null
  const building = mapGrid?.[Number(match[2])]?.[Number(match[1])]?.cityBuilding
  return building && building.id === id ? building : null
}

export function applyCityDamage(building, damage, mapGrid, state, playSound = null) {
  // City damage is simulated by the host; clients receive the resulting state.
  if (state.multiplayerSession?.isRemote && state.multiplayerSession?.localRole !== 'host') return false
  if (!building || building.health <= 0 || !Number.isFinite(damage) || damage <= 0) return false
  building.health = Math.max(0, building.health - damage)
  if (building.health > 0) return true
  finishCityDestruction(building, mapGrid, state, true, playSound)
  return true
}

function finishCityDestruction(building, mapGrid, state, effects, playSound = null) {
  setBuildingDebrisDecals(mapGrid, state, building)
  for (let y = building.y; y < building.y + building.height; y++) {
    for (let x = building.x; x < building.x + building.width; x++) {
      const tile = mapGrid[y]?.[x]
      if (!tile) continue
      // Decorations own tagged occupancy, not tile.building or unit occupancy.
      if (state.occupancyMap?.[y] && !tile.building && tile.type === 'land' && !tile.seedCrystal) {
        state.occupancyMap[y][x] = Math.max(0, state.occupancyMap[y][x] - 1)
      }
      notifySurfaceTileMutation(mapGrid, x, y)
    }
  }
  clearPathCache()
  clearFlowFields()
  if (effects) {
    const x = (building.x + building.width / 2) * TILE_SIZE
    const y = (building.y + building.height / 2) * TILE_SIZE
    spawnDestructionExplosion(state, x, y)
    playSound?.('explosion', x, y, 0.5)
  }
}

export function applyCitySnapshot(mapGrid, state, records) {
  for (const record of records || []) {
    const tile = mapGrid?.[record.y]?.[record.x]
    if (!tile || !Number.isFinite(record.health) || !Number.isFinite(record.maxHealth)) continue
    const previous = tile.cityBuilding?.health
    if (tile.cityBuilding) Object.assign(tile.cityBuilding, record)
    else tile.cityBuilding = { ...record }
    if (record.health <= 0 && previous !== 0) finishCityDestruction(tile.cityBuilding, mapGrid, state, false)
  }
}

export function renderCityHealthBars(ctx, mapGrid, scrollOffset) {
  for (const building of getCityBuildings(mapGrid)) {
    if (building.health <= 0 || building.health >= building.maxHealth) continue
    const x = building.x * TILE_SIZE - scrollOffset.x
    const y = building.y * TILE_SIZE - scrollOffset.y - 6
    const width = building.width * TILE_SIZE
    if (x + width < 0 || y < 0 || x > ctx.canvas.width || y > ctx.canvas.height) continue
    ctx.fillStyle = '#222'
    ctx.fillRect(x, y, width, 4)
    ctx.fillStyle = '#70d050'
    ctx.fillRect(x, y, width * building.health / building.maxHealth, 4)
  }
}
