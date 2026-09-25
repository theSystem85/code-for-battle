/**
 * Deterministic built-in "demo" save.
 *
 * Regenerates src/missions/mission_demo.js from the live map generator so the
 * scene uses organic coastlines, lakes, biomes, rocks, and cliffs.
 *
 *   node --import ./scripts/demoSaveRegister.js scripts/generateDemoSave.js
 */
import fs from 'fs'
import path from 'path'

import { JSDOM } from 'jsdom'
import { buildingData } from '../src/data/buildingData.js'
import { TILE_SIZE, UNIT_GAS_PROPERTIES, UNIT_PROPERTIES } from '../src/config.js'
import en from '../src/missions/locales/en.json' with { type: 'json' }

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
dom.window.matchMedia = (query) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent() { return false }
})
dom.window.logger = Object.assign(() => {}, {
  info() {},
  warn() {},
  error() {},
  debug() {}
})
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement
globalThis.Image = dom.window.Image
if (!globalThis.performance) globalThis.performance = dom.window.performance

const { gameState } = await import('../src/gameState.js')
const { generateMap } = await import('../src/gameSetup.js')

const MAP_SIZE = 96
const SEED_COUNT = 10
const MARGIN = 18
const PLAYER = 'player1'
const ENEMY = 'player2'

const ORIENTATIONS = [
  { name: 'south-water', toWorld: (cx, cy, u, v) => ({ x: cx + u, y: cy + v }) },
  { name: 'north-water', toWorld: (cx, cy, u, v) => ({ x: cx + u, y: cy - v }) },
  { name: 'east-water', toWorld: (cx, cy, u, v) => ({ x: cx + v, y: cy + u }) },
  { name: 'west-water', toWorld: (cx, cy, u, v) => ({ x: cx - v, y: cy + u }) }
]

const GROUND_LINE = [
  ['tank_v1', -4, -3, 24],
  ['tank_v1', -4, -1, 100],
  ['tank_v1', -4, 1, 70],
  ['tank-v2', -5, -2, 100],
  ['tank-v3', -5, 2, 100],
  ['rocketTank', -6, 0, 80],
  ['howitzer', -9, 0, 100]
]

const SUPPORT = [
  ['harvester', -12, 4],
  ['tankerTruck', -11, 5],
  ['ambulance', -13, 3],
  ['ammunitionTruck', -12, 6],
  ['recoveryTank', -14, 2],
  ['mineSweeper', -13, 6]
]

const AIR = [
  ['apache', -1, -2, 3.4],
  ['apache', 1, 2, 2.8],
  ['f22Raptor', 0, -4, 4.1],
  ['f35', 2, 0, 3.6]
]

const NAVAL = [
  ['destroyer', -6, 11],
  ['battleship', 2, 12],
  ['submarine', 7, 10],
  ['hovercraft', -2, 10]
]

function key(x, y) {
  return `${x},${y}`
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE
}

function round2(value) {
  return Math.round(value * 100) / 100
}

function serializeTile(tile) {
  const out = { type: tile.type || 'land' }
  if (tile.ore) {
    out.ore = true
    out.oreDensity = tile.oreDensity || 1
  }
  if (tile.seedCrystal) {
    out.seedCrystal = true
    out.seedCrystalDensity = tile.seedCrystalDensity || out.oreDensity || 1
  }
  if (typeof tile.biome === 'string') out.biome = tile.biome
  if (typeof tile.shorelineBiome === 'string') out.shorelineBiome = tile.shorelineBiome
  if (Number.isFinite(tile.biomeRegion)) out.biomeRegion = tile.biomeRegion
  if (tile.biomeBlend && typeof tile.biomeBlend.biome === 'string' && tile.biomeBlend.alpha > 0.02) {
    out.biomeBlend = {
      biome: tile.biomeBlend.biome,
      alpha: round2(tile.biomeBlend.alpha),
      angle: round2(tile.biomeBlend.angle || 0),
      cornerWeights: (tile.biomeBlend.cornerWeights || [0, 0, 0, 0]).slice(0, 4).map(weight => round2(weight))
    }
    if (Number.isFinite(tile.biomeBlend.featherPixels)) {
      out.biomeBlend.featherPixels = round2(tile.biomeBlend.featherPixels)
    }
  }
  return out
}

function configureGameState(seed) {
  gameState.playerCount = 2
  gameState.humanPlayer = PLAYER
  gameState.mapTilesX = MAP_SIZE
  gameState.mapTilesY = MAP_SIZE
  gameState.mapSeed = seed
  gameState.mapWaterPercent = 24
  gameState.mapRockPercent = 14
  gameState.mapShoreNorth = true
  gameState.mapShoreWest = true
  gameState.mapShoreEast = true
  gameState.mapShoreSouth = true
  gameState.mapCenterLake = true
  gameState.mapOreFieldCount = 6
  gameState.mapOreTotalValue = 48000
  gameState.mapBiomeRegionCount = 10
  gameState.mapBiomeDistribution = 'random'
  gameState.mapBiomeWeights = { grass: 28, soil: 24, sand: 26, snow: 22 }
  gameState.mapShorelineWidth = 2
  gameState.mapBiomeTransitionPixels = 8
  gameState.mapSnowOnPlateaus = true
  gameState.activeSpriteSheetBiomeTag = 'mixed'
}

function countBand(grid, toWorld, box, type) {
  let count = 0
  const biomes = new Set()
  for (let v = box.v0; v <= box.v1; v++) {
    for (let u = box.u0; u <= box.u1; u++) {
      const { x, y } = toWorld(u, v)
      const tile = grid[y]?.[x]
      if (!tile) continue
      if (!type || tile.type === type) count++
      if (tile.biome) biomes.add(tile.biome)
    }
  }
  return { count, biomes }
}

function scoreSite(grid, cx, cy) {
  let best = null
  ORIENTATIONS.forEach(orientation => {
    const toWorld = (u, v) => orientation.toWorld(cx, cy, u, v)
    const land = countBand(grid, toWorld, { u0: -16, u1: 16, v0: -6, v1: 5 }, 'land')
    const street = countBand(grid, toWorld, { u0: -16, u1: 16, v0: -6, v1: 5 }, 'street')
    const water = countBand(grid, toWorld, { u0: -14, u1: 14, v0: 8, v1: 15 }, 'water')
    const rock = countBand(grid, toWorld, { u0: -16, u1: 16, v0: -16, v1: -8 }, 'rock')
    const shore = countBand(grid, toWorld, { u0: -14, u1: 14, v0: 4, v1: 9 }, null)
    const open = land.count + street.count
    const bandTiles = 33 * 12
    if (open < bandTiles * 0.62 || water.count < 18 || rock.count < 10) return
    const biomes = new Set([...land.biomes, ...rock.biomes, ...shore.biomes])
    if (biomes.size < 3) return
    const score = open + Math.min(water.count, 90) + Math.min(rock.count, 70) + biomes.size * 40
    if (!best || score > best.score) {
      best = { score, orientation: orientation.name, toWorld, cx, cy, biomes: [...biomes], water: water.count, rock: rock.count, open }
    }
  })
  return best
}

function findBestSite() {
  let best = null
  for (let index = 1; index <= SEED_COUNT; index++) {
    const seed = `demo-battle-${index}`
    configureGameState(seed)
    const grid = []
    generateMap(seed, grid, MAP_SIZE, MAP_SIZE)
    for (let cy = MARGIN; cy < MAP_SIZE - MARGIN; cy += 3) {
      for (let cx = MARGIN; cx < MAP_SIZE - MARGIN; cx += 3) {
        const site = scoreSite(grid, cx, cy)
        if (site && (!best || site.score > best.score)) {
          best = { ...site, seed, grid }
        }
      }
    }
    console.log(`Scored ${seed}${best?.seed === seed ? ` (best ${best.score} ${best.orientation} @ ${best.cx},${best.cy})` : ''}`)
  }
  if (!best) throw new Error('No scenic demo site found')
  return best
}

function makeOccupied() {
  return new Set()
}

function footprintFree(grid, occupied, x, y, width, height, allowStreet = true) {
  if (x < 1 || y < 1 || x + width >= MAP_SIZE - 1 || y + height >= MAP_SIZE - 1) return false
  for (let tileY = y - 1; tileY < y + height + 1; tileY++) {
    for (let tileX = x - 1; tileX < x + width + 1; tileX++) {
      if (occupied.has(key(tileX, tileY))) return false
      const inside = tileX >= x && tileX < x + width && tileY >= y && tileY < y + height
      if (!inside) continue
      const type = grid[tileY][tileX].type
      if (type === 'land') continue
      if (allowStreet && type === 'street') continue
      return false
    }
  }
  return true
}

function markFootprint(occupied, x, y, width, height) {
  for (let tileY = y; tileY < y + height; tileY++) {
    for (let tileX = x; tileX < x + width; tileX++) occupied.add(key(tileX, tileY))
  }
}

function clearOre(grid, x, y, width, height) {
  for (let tileY = y; tileY < y + height; tileY++) {
    for (let tileX = x; tileX < x + width; tileX++) {
      const tile = grid[tileY][tileX]
      tile.ore = false
      tile.oreDensity = 0
      tile.seedCrystal = false
      tile.seedCrystalDensity = 0
    }
  }
}

function createBuilding(grid, occupied, type, owner, x, y, id) {
  const data = buildingData[type]
  const building = {
    type,
    owner,
    x,
    y,
    width: data.width,
    height: data.height,
    health: data.health,
    maxHealth: data.health,
    power: data.power,
    isBuilding: true,
    constructionStartTime: -5000,
    constructionFinished: true,
    id,
    damageValue: 0
  }
  if (type === 'constructionYard') {
    building.rallyPoint = null
    building.budget = owner === ENEMY ? 60000 : 0
    building.productionCountdown = 0
    building.isHuman = owner === PLAYER
  }
  if (type === 'vehicleFactory' || type === 'helipad' || type === 'shipyard') building.rallyPoint = null
  if (type === 'helipad') building.landedUnitId = null
  if (typeof data.fireRange === 'number') {
    building.fireRange = data.fireRange
    building.minFireRange = data.minFireRange || 0
    building.fireCooldown = data.fireCooldown
    building.damage = data.damage
    building.armor = data.armor || 1
    building.projectileType = data.projectileType
    building.projectileSpeed = data.projectileSpeed
    building.lastShotTime = 0
    building.turretDirection = 0
    building.targetDirection = 0
    building.holdFire = false
    building.forcedAttackTarget = null
    if (data.isTeslaCoil) {
      building.isTeslaCoil = true
      building.teslaState = 'idle'
      building.teslaChargeStartTime = 0
      building.teslaFireStartTime = 0
    }
    if (data.burstFire) {
      building.burstFire = true
      building.burstCount = data.burstCount || 3
      building.burstDelay = data.burstDelay || 150
      building.currentBurst = 0
      building.lastBurstTime = 0
    }
  }
  markFootprint(occupied, x, y, data.width, data.height)
  clearOre(grid, x, y, data.width, data.height)
  return building
}

function findSpot(grid, occupied, toWorld, type, u, v, radius = 4) {
  const data = buildingData[type]
  let best = null
  for (let dv = -radius; dv <= radius; dv++) {
    for (let du = -radius; du <= radius; du++) {
      const origin = toWorld(u + du, v + dv)
      if (!footprintFree(grid, occupied, origin.x, origin.y, data.width, data.height)) continue
      const distance = Math.abs(du) + Math.abs(dv)
      if (!best || distance < best.distance) best = { ...origin, distance }
    }
  }
  return best
}

function placeBuilding(grid, occupied, buildings, toWorld, type, owner, u, v, id) {
  const spot = findSpot(grid, occupied, toWorld, type, u, v)
  if (!spot) return null
  const building = createBuilding(grid, occupied, type, owner, spot.x, spot.y, id)
  buildings.push(building)
  return building
}

function playerPower(buildings, owner) {
  let supply = 0
  let production = 0
  let consumption = 0
  buildings.forEach(building => {
    if (building.owner !== owner || building.health <= 0) return
    if (building.type === 'constructionYard') {
      const yardPower = buildingData.constructionYard.power
      supply += yardPower
      production += yardPower
    }
    const power = building.power || 0
    supply += power
    if (power > 0) production += power
    if (power < 0) consumption += Math.abs(power)
  })
  return { supply, production, consumption }
}

function stampShipyard(grid, occupied, toWorld) {
  const width = buildingData.shipyard.width
  const height = buildingData.shipyard.height
  const waterDepth = Math.ceil(height / 2)
  for (let v = 6; v <= 12; v++) {
    for (let u = -14; u <= 6; u++) {
      const origin = toWorld(u, v)
      let landRows = 0
      let waterRows = 0
      let blocked = false
      for (let localY = 0; localY < height; localY++) {
        for (let localX = 0; localX < width; localX++) {
          const x = origin.x + localX
          const y = origin.y + localY
          if (!inBounds(x, y) || occupied.has(key(x, y))) {
            blocked = true
            break
          }
          const type = grid[y][x].type
          if (localY < height - waterDepth) {
            if (type === 'land' || type === 'street') landRows++
          } else if (type === 'water') waterRows++
        }
        if (blocked) break
      }
      const launch = toWorld(u, v + height)
      const launchWater = inBounds(launch.x, origin.y + height) && grid[origin.y + height]?.[origin.x]?.type === 'water'
      if (!blocked && landRows >= width && waterRows >= width * 2 && launchWater) {
        return { x: origin.x, y: origin.y }
      }
    }
  }

  for (let v = 7; v <= 11; v++) {
    for (let u = -12; u <= 4; u++) {
      const origin = toWorld(u, v)
      if (origin.x < 2 || origin.y < 2 || origin.x + width >= MAP_SIZE - 2 || origin.y + height >= MAP_SIZE - 2) continue
      let nearWater = false
      for (let localY = 0; localY < height + 1 && !nearWater; localY++) {
        for (let localX = 0; localX < width; localX++) {
          if (grid[origin.y + localY]?.[origin.x + localX]?.type === 'water') nearWater = true
        }
      }
      if (!nearWater) continue
      let overlaps = false
      for (let tileY = origin.y; tileY < origin.y + height && !overlaps; tileY++) {
        for (let tileX = origin.x; tileX < origin.x + width; tileX++) {
          if (occupied.has(key(tileX, tileY))) overlaps = true
        }
      }
      if (overlaps) continue
      for (let localY = 0; localY < height; localY++) {
        for (let localX = 0; localX < width; localX++) {
          const tile = grid[origin.y + localY][origin.x + localX]
          const shouldBeWater = localY >= height - waterDepth
          if (shouldBeWater) {
            tile.type = 'water'
            tile.ore = false
            tile.oreDensity = 0
          } else if (tile.type !== 'land' && tile.type !== 'street') {
            tile.type = 'land'
            tile.biome = tile.biome || 'sand'
          }
        }
      }
      const below = origin.y + height
      for (let localX = 0; localX < width; localX++) {
        const tile = grid[below][origin.x + localX]
        tile.type = 'water'
        tile.ore = false
      }
      return { x: origin.x, y: origin.y }
    }
  }
  return null
}

function neighborTile(grid, occupied, x, y, wanted) {
  const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2]]
  for (const [dx, dy] of offsets) {
    const tileX = x + dx
    const tileY = y + dy
    if (!inBounds(tileX, tileY) || occupied.has(key(tileX, tileY))) continue
    const type = grid[tileY][tileX].type
    if (wanted === 'water' ? type === 'water' : (type === 'land' || type === 'street')) {
      return { x: tileX, y: tileY }
    }
  }
  return null
}

function createUnit(grid, occupied, type, tileX, tileY, extra) {
  const props = UNIT_PROPERTIES[type]
  const x = tileX * TILE_SIZE
  const y = tileY * TILE_SIZE
  const centerTileX = Math.floor((x + TILE_SIZE / 2) / TILE_SIZE)
  const centerTileY = Math.floor((y + TILE_SIZE / 2) / TILE_SIZE)
  const gas = UNIT_GAS_PROPERTIES[type]
  const unit = {
    id: extra.id,
    type,
    owner: extra.owner,
    tileX: centerTileX,
    tileY: centerTileY,
    x,
    y,
    health: extra.health ?? props.health,
    maxHealth: props.maxHealth,
    path: [],
    direction: extra.direction || 0,
    turretDirection: extra.direction || 0,
    targetId: extra.targetId || null,
    targetType: extra.targetId ? 'unit' : null,
    allowedToAttack: true,
    lastShotTime: 0,
    ...extra.fields
  }
  if (gas) {
    unit.gas = gas.tankSize
    unit.maxGas = gas.tankSize
  }
  if (type === 'submarine') unit.depthState = 'surfaced'
  occupied.add(key(centerTileX, centerTileY))
  return unit
}

function placeUnit(grid, occupied, toWorld, type, owner, u, v, id, direction, fields = {}, health = null) {
  const naval = Boolean(UNIT_PROPERTIES[type].isNaval)
  const preferred = toWorld(u, v)
  const spot = neighborTile(grid, occupied, preferred.x, preferred.y, naval ? 'water' : 'land')
  if (!spot) throw new Error(`No tile for ${id} near ${preferred.x},${preferred.y}`)
  if (naval && grid[spot.y][spot.x].type !== 'water') {
    throw new Error(`Naval unit ${id} missed the water`)
  }
  return createUnit(grid, occupied, type, spot.x, spot.y, {
    id,
    owner,
    direction,
    health: health ?? undefined,
    fields
  })
}

function facing(toWorld, u, v, towardEnemy) {
  const here = toWorld(u, v)
  const ahead = toWorld(u + (towardEnemy ? 1 : -1), v)
  return Math.atan2(ahead.y - here.y, ahead.x - here.x)
}

function airFields(type, altitudeTiles) {
  const altitude = Math.round(TILE_SIZE * altitudeTiles)
  const maxAltitude = type === 'f35' ? TILE_SIZE * 4.2 : TILE_SIZE * 4.5
  const fields = {
    flightState: 'airborne',
    altitude,
    targetAltitude: altitude,
    maxAltitude,
    autoHoldAltitude: true,
    isAirUnit: true,
    canFire: true,
    apacheAmmoEmpty: false,
    hovering: true,
    groundedOccupancyApplied: false,
    helipadLandingRequested: false
  }
  if (type === 'apache') {
    fields.rocketAmmo = 38
    fields.maxRocketAmmo = 38
  }
  if (type === 'f35') {
    fields.rocketAmmo = 6
    fields.maxRocketAmmo = 6
    fields.manualFlightState = 'auto'
  }
  if (type === 'f22Raptor') {
    fields.f22State = 'airborne'
    fields.rocketAmmo = 8
    fields.maxRocketAmmo = 8
    fields.f22PendingTakeoff = false
  }
  return fields
}

function buildArmies(grid, occupied, toWorld) {
  const units = []
  const pairTargets = []

  function addPair(type, u, v, health, fieldsFor) {
    const playerId = `demo-p1-${type}-${units.length}`
    const enemyId = `demo-p2-${type}-${units.length}`
    const playerFields = fieldsFor ? fieldsFor(type) : {}
    const enemyFields = fieldsFor ? fieldsFor(type) : {}
    if (type === 'f22Raptor') {
      playerFields.f22AssignedDestination = { mode: 'combat', followTargetId: enemyId, x: 0, y: 0, stopRadius: 96 }
      enemyFields.f22AssignedDestination = { mode: 'combat', followTargetId: playerId, x: 0, y: 0, stopRadius: 96 }
    }
    const playerUnit = placeUnit(
      grid, occupied, toWorld, type, PLAYER, u, v, playerId,
      facing(toWorld, u, v, true), playerFields, health
    )
    const enemyUnit = placeUnit(
      grid, occupied, toWorld, type, ENEMY, -u, v, enemyId,
      facing(toWorld, -u, v, false), enemyFields, health
    )
    playerUnit.targetId = enemyId
    enemyUnit.targetId = playerId
    if (type === 'f22Raptor') {
      playerUnit.f22AssignedDestination.x = enemyUnit.x
      playerUnit.f22AssignedDestination.y = enemyUnit.y
      enemyUnit.f22AssignedDestination.x = playerUnit.x
      enemyUnit.f22AssignedDestination.y = playerUnit.y
    }
    units.push(playerUnit, enemyUnit)
    pairTargets.push([playerUnit, enemyUnit])
  }

  GROUND_LINE.forEach(([type, u, v, health]) => addPair(type, u, v, health))
  SUPPORT.forEach(([type, u, v]) => {
    const playerId = `demo-p1-${type}-${units.length}`
    const enemyId = `demo-p2-${type}-${units.length}`
    units.push(placeUnit(grid, occupied, toWorld, type, PLAYER, u, v, playerId, facing(toWorld, u, v, true)))
    units.push(placeUnit(grid, occupied, toWorld, type, ENEMY, -u, v, enemyId, facing(toWorld, -u, v, false)))
  })
  AIR.forEach(([type, u, v, altitude]) => addPair(type, u, v, null, () => airFields(type, altitude)))
  NAVAL.forEach(([type, u, v]) => addPair(type, u, v, null))
  return { units, pairTargets }
}

function placePacked(grid, occupied, buildings, toWorld, owner, sign, queue) {
  const prefix = owner === PLAYER ? 'demo-p1' : 'demo-p2'
  let serial = 0
  for (let v = -10; v <= 8; v++) {
    for (let u = -18; u <= -7; u++) {
      if (queue.length === 0) return
      const [type, required] = queue[0]
      const localU = sign * u
      const spot = findSpot(grid, occupied, toWorld, type, localU, v, 1)
      if (!spot) continue
      serial += 1
      const id = type === 'constructionYard' && owner === PLAYER
        ? PLAYER
        : (type === 'constructionYard' ? ENEMY : `${prefix}-${type}-${serial}`)
      const placed = placeBuilding(grid, occupied, buildings, toWorld, type, owner, localU, v, id)
      if (placed) queue.shift()
      else if (!required) queue.shift()
    }
  }
  const missingRequired = queue.filter(([, required]) => required).map(([type]) => type)
  if (missingRequired.length > 0) {
    throw new Error(`Could not place ${owner} buildings: ${missingRequired.join(', ')}`)
  }
}

function placeBase(grid, occupied, buildings, toWorld, owner, sign) {
  const queue = [
    ['constructionYard', true],
    ['powerPlant', true],
    ['oreRefinery', true],
    ['vehicleFactory', true],
    ['powerPlant', false],
    ['helipad', false],
    ['radarStation', false],
    ['turretGunV2', false],
    ['rocketTurret', false],
    ['teslaCoil', false],
    ['turretGunV1', false],
    ['concreteWall', false],
    ['concreteWall', false],
    ['concreteWall', false],
    ['concreteWall', false]
  ]
  placePacked(grid, occupied, buildings, toWorld, owner, sign, queue)

  const dock = stampShipyard(grid, occupied, (u, v) => toWorld(sign * u, v))
  if (dock) {
    const prefix = owner === PLAYER ? 'demo-p1' : 'demo-p2'
    buildings.push(createBuilding(grid, occupied, 'shipyard', owner, dock.x, dock.y, `${prefix}-shipyard`))
  }

  let power = playerPower(buildings, owner)
  let extra = 0
  while (power.supply < 40 && extra < 4) {
    extra += 1
    const placed = placeBuilding(
      grid, occupied, buildings, toWorld, 'powerPlant', owner,
      sign * (-18 - extra), extra, `${owner}-power-extra-${extra}`
    )
    if (!placed) break
    power = playerPower(buildings, owner)
  }
  return power
}

function writeIndex() {
  const indexContents = `import { mission01 } from './mission_01.js'
import { fullBaseTest } from './mission_full_base_test.js'
import { demoSave } from './mission_demo.js'

export const builtinMissions = [mission01, fullBaseTest, demoSave]

export function getBuiltinMissionById(id) {
  return builtinMissions.find(mission => mission.id === id) || null
}
`
  fs.writeFileSync(path.join('src', 'missions', 'index.js'), indexContents)
}

const site = findBestSite()
const { grid, toWorld, seed, orientation, cx, cy } = site
const occupied = makeOccupied()
const buildings = []
const playerPowerNet = placeBase(grid, occupied, buildings, toWorld, PLAYER, 1)
const enemyPowerNet = placeBase(grid, occupied, buildings, toWorld, ENEMY, -1)
const { units } = buildArmies(grid, occupied, toWorld)

const focus = toWorld(0, 0)
const orePositions = []
for (let y = 0; y < MAP_SIZE; y++) {
  for (let x = 0; x < MAP_SIZE; x++) {
    if (grid[y][x].ore) orePositions.push({ x, y })
  }
}

const mapTileState = grid.map(row => row.map(tile => serializeTile(tile)))
const mapGridTypes = grid.map(row => row.map(tile => tile.type))
const achievedMilestones = ['firstRefinery', 'firstUnit', 'firstTank', 'radarBuilt', 'tenBuildings']
const unitTypes = [...new Set(units.filter(unit => unit.owner === PLAYER).map(unit => unit.type))]

const state = {
  gameState: {
    money: 50000,
    startMoney: 50000,
    gameTime: 0,
    frameCount: 0,
    wins: 0,
    losses: 0,
    gameStarted: true,
    gamePaused: false,
    gameOver: false,
    gameOverMessage: null,
    gameResult: null,
    playerUnitsDestroyed: 0,
    enemyUnitsDestroyed: 0,
    playerBuildingsDestroyed: 0,
    enemyBuildingsDestroyed: 0,
    totalMoneyEarned: 0,
    mapTilesX: MAP_SIZE,
    mapTilesY: MAP_SIZE,
    speedMultiplier: 1,
    powerSupply: playerPowerNet.supply,
    playerPowerSupply: playerPowerNet.supply,
    playerTotalPowerProduction: playerPowerNet.production,
    playerPowerConsumption: playerPowerNet.consumption,
    enemyPowerSupply: enemyPowerNet.supply,
    enemyTotalPowerProduction: enemyPowerNet.production,
    enemyPowerConsumption: enemyPowerNet.consumption,
    playerCount: 2,
    humanPlayer: PLAYER,
    defeatedPlayers: [],
    availableUnitTypes: unitTypes,
    availableBuildingTypes: Object.keys(buildingData),
    newUnitTypes: [],
    newBuildingTypes: [],
    currentSessionId: 'demo',
    mapSeed: seed,
    mapWaterPercent: 24,
    mapRockPercent: 14,
    mapShoreNorth: true,
    mapShoreWest: true,
    mapShoreEast: true,
    mapShoreSouth: true,
    mapCenterLake: true,
    mapOreFieldCount: 6,
    mapOreTotalValue: 48000,
    mapBiomeRegionCount: 10,
    mapBiomeDistribution: 'random',
    mapBiomeWeights: { grass: 28, soil: 24, sand: 26, snow: 22 },
    mapShorelineWidth: 2,
    mapBiomeTransitionPixels: 8,
    mapSnowOnPlateaus: true,
    activeSpriteSheetBiomeTag: 'mixed',
    radarActive: true,
    shadowOfWarEnabled: false,
    achievedMilestones
  },
  aiFactoryBudgets: { [ENEMY]: 60000 },
  units,
  unitWrecks: [],
  buildings,
  factoryRallyPoints: buildings
    .filter(building => building.type === 'constructionYard')
    .map(building => ({ id: building.id, rallyPoint: null })),
  orePositions,
  mapGridTypes,
  mapTileState,
  targetedOreTiles: {},
  achievedMilestones,
  productionQueueState: null
}

const copy = en.missions.demo
const mission = {
  id: 'demo',
  labelKey: 'missions.demo.label',
  descriptionKey: 'missions.demo.description',
  label: copy.label,
  description: copy.description,
  time: Date.UTC(2024, 6, 1),
  focus: { tileX: focus.x, tileY: focus.y },
  seed,
  orientation,
  state: JSON.stringify(state)
}

const fileContents = `/* eslint-disable quotes */\nexport const demoSave = ${JSON.stringify(mission, null, 2)}\n`
fs.writeFileSync(path.join('src', 'missions', 'mission_demo.js'), fileContents)
writeIndex()

const biomeSet = new Set()
let water = 0
let rock = 0
mapTileState.forEach(row => row.forEach(tile => {
  if (tile.biome) biomeSet.add(tile.biome)
  if (tile.type === 'water') water++
  if (tile.type === 'rock') rock++
}))
const bytes = fs.statSync(path.join('src', 'missions', 'mission_demo.js')).size
console.log(`Demo save written (${bytes} bytes)`)
console.log(`Site ${seed} ${orientation} focus ${focus.x},${focus.y} search ${cx},${cy}`)
console.log(`Units ${units.length}, buildings ${buildings.length}, water ${water}, rock ${rock}, biomes ${[...biomeSet].join(',')}`)
console.log(`Player power ${playerPowerNet.supply}, enemy power ${enemyPowerNet.supply}`)
