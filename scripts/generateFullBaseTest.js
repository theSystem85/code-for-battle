import fs from 'fs'
import path from 'path'

import { buildingData } from '../src/data/buildingData.js'
import { TILE_SIZE, UNIT_GAS_PROPERTIES, UNIT_PROPERTIES } from '../src/config.js'
import { getShipyardWaterLocalTiles, NAVAL_RENDER_LENGTH_TILES } from '../src/utils/navalUtils.js'
import { ensureServiceRadius } from '../src/utils/serviceRadius.js'
import {
  ensureAirstripOperations,
  getAirstripParkingSpots,
  setAirstripSlotOccupant
} from '../src/utils/airstripUtils.js'
import { getHelipadLandingTile, getHelipadLandingTopLeft } from '../src/utils/helipadUtils.js'

const MAP_WIDTH = 100
const MAP_HEIGHT = 100
const WATER_START_Y = 72
const PLAYER = 'player1'
const ENEMY = 'player2'
const KNOWN_AIR_UNIT_TYPES = new Set(['apache', 'f22Raptor', 'f35'])

const grid = Array.from({ length: MAP_HEIGHT }, (_, y) => (
  Array.from({ length: MAP_WIDTH }, () => (y >= WATER_START_Y ? 'water' : 'land'))
))
const occupied = new Set()
const orePositions = []

function key(x, y) {
  return `${x},${y}`
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT
}

function markFootprint(x, y, width, height) {
  for (let tileY = y; tileY < y + height; tileY++) {
    for (let tileX = x; tileX < x + width; tileX++) {
      occupied.add(key(tileX, tileY))
    }
  }
}

function footprintFits(x, y, width, height, gap = 1) {
  if (x < 0 || y < 0 || x + width > MAP_WIDTH || y + height > MAP_HEIGHT) return false
  for (let tileY = y - gap; tileY < y + height + gap; tileY++) {
    for (let tileX = x - gap; tileX < x + width + gap; tileX++) {
      const inside = tileX >= x && tileX < x + width && tileY >= y && tileY < y + height
      if (!inBounds(tileX, tileY)) {
        if (inside) return false
        continue
      }
      if (occupied.has(key(tileX, tileY))) return false
      if (inside && grid[tileY][tileX] !== 'land') return false
    }
  }
  return true
}

function findLandSpot(width, height, bounds) {
  for (let y = bounds.y; y <= bounds.y + bounds.height - height; y++) {
    for (let x = bounds.x; x <= bounds.x + bounds.width - width; x++) {
      if (footprintFits(x, y, width, height)) return { x, y }
    }
  }
  return null
}

function createBuilding(type, owner, x, y, id) {
  const data = buildingData[type]
  if (!data) throw new Error(`Unknown building type: ${type}`)
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
    building.budget = 0
    building.productionCountdown = 0
    building.isHuman = owner === PLAYER
  }

  if (type === 'vehicleFactory' || type === 'vehicleWorkshop' || type === 'airstrip' || type === 'shipyard') {
    building.rallyPoint = null
  }

  if (type === 'helipad' || type === 'airstrip') {
    building.landedUnitId = null
  }

  if (type === 'street') {
    building.selectable = false
  }

  if (typeof data.maxFuel === 'number') {
    building.maxFuel = data.maxFuel
    building.fuel = data.maxFuel
    if (typeof data.fuelReloadTime === 'number') building.fuelReloadTime = data.fuelReloadTime
  }

  if (typeof data.maxAmmo === 'number') {
    building.maxAmmo = data.maxAmmo
    building.ammo = data.maxAmmo
    if (typeof data.ammoReloadTime === 'number') building.ammoReloadTime = data.ammoReloadTime
  }

  ensureServiceRadius(building)

  if (type === 'rocketTurret' || type.startsWith('turretGun') || type === 'teslaCoil' || type === 'artilleryTurret') {
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
    if (type === 'artilleryTurret') building.isArtillery = true
    if (data.burstFire) {
      building.burstFire = true
      building.burstCount = data.burstCount || 3
      building.burstDelay = data.burstDelay || 150
      building.currentBurst = 0
      building.lastBurstTime = 0
    }
  }

  markFootprint(x, y, data.width, data.height)
  return building
}

function rectanglesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function playerPowerNet(buildings) {
  let supply = 0
  let production = 0
  let consumption = 0
  buildings.forEach(building => {
    if (building.owner !== PLAYER || building.health <= 0) return
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

function createUnit(type, tileX, tileY, extra = {}) {
  const props = UNIT_PROPERTIES[type]
  if (!props) throw new Error(`Unknown unit type: ${type}`)
  const x = Number.isFinite(extra.x) ? extra.x : tileX * TILE_SIZE
  const y = Number.isFinite(extra.y) ? extra.y : tileY * TILE_SIZE
  const centerTileX = Math.floor((x + TILE_SIZE / 2) / TILE_SIZE)
  const centerTileY = Math.floor((y + TILE_SIZE / 2) / TILE_SIZE)
  const gas = UNIT_GAS_PROPERTIES[type]
  const unit = {
    id: extra.id || `fullbase-player-${type}`,
    type,
    owner: PLAYER,
    tileX: centerTileX,
    tileY: centerTileY,
    x,
    y,
    health: props.health,
    maxHealth: props.maxHealth,
    path: [],
    direction: extra.direction || 0,
    ...extra.fields
  }
  if (gas) {
    unit.gas = gas.tankSize
    unit.maxGas = gas.tankSize
  }
  occupied.add(key(centerTileX, centerTileY))
  return unit
}

const playerBounds = { x: 4, y: 4, width: 64, height: 62 }
const buildings = []

const shipyard = createBuilding('shipyard', PLAYER, 8, 70, 'fullbase-player-shipyard')
buildings.push(shipyard)

const shipyardWater = getShipyardWaterLocalTiles(shipyard.width, shipyard.height, 'south')
const waterKeys = new Set(shipyardWater.map(tile => key(tile.x, tile.y)))
for (let localY = 0; localY < shipyard.height; localY++) {
  for (let localX = 0; localX < shipyard.width; localX++) {
    const worldX = shipyard.x + localX
    const worldY = shipyard.y + localY
    const shouldBeWater = waterKeys.has(key(localX, localY))
    if (shouldBeWater && grid[worldY][worldX] !== 'water') {
      throw new Error(`Shipyard water tile ${worldX},${worldY} is ${grid[worldY][worldX]}`)
    }
    if (!shouldBeWater && grid[worldY][worldX] !== 'land') {
      throw new Error(`Shipyard land tile ${worldX},${worldY} is ${grid[worldY][worldX]}`)
    }
  }
}
const launchY = shipyard.y + shipyard.height
for (let x = shipyard.x; x < shipyard.x + shipyard.width; x++) {
  if (grid[launchY]?.[x] !== 'water') throw new Error(`Shipyard launch tile ${x},${launchY} is not water`)
  occupied.add(key(x, launchY))
}

const enemyYard = createBuilding('constructionYard', ENEMY, 82, 8, ENEMY)
buildings.push(enemyYard)

const buildingTypes = Object.keys(buildingData).filter(type => type !== 'shipyard')
buildingTypes.sort((a, b) => {
  const areaA = buildingData[a].width * buildingData[a].height
  const areaB = buildingData[b].width * buildingData[b].height
  return areaB - areaA || a.localeCompare(b)
})

const placedTypes = new Map([['shipyard', 1]])
for (const type of buildingTypes) {
  const data = buildingData[type]
  const spot = findLandSpot(data.width, data.height, playerBounds)
  if (!spot) throw new Error(`No land spot for ${type}`)
  const index = (placedTypes.get(type) || 0) + 1
  placedTypes.set(type, index)
  const id = type === 'constructionYard'
    ? PLAYER
    : `fullbase-player-${type}${index > 1 ? `-${index}` : ''}`
  buildings.push(createBuilding(type, PLAYER, spot.x, spot.y, id))
}

let power = playerPowerNet(buildings.filter(building => building.owner === PLAYER))
while (power.supply < 0) {
  const data = buildingData.powerPlant
  const spot = findLandSpot(data.width, data.height, playerBounds)
  if (!spot) throw new Error('No land spot for an extra power plant')
  const index = (placedTypes.get('powerPlant') || 0) + 1
  placedTypes.set('powerPlant', index)
  buildings.push(createBuilding('powerPlant', PLAYER, spot.x, spot.y, `fullbase-player-powerPlant-${index}`))
  power = playerPowerNet(buildings.filter(building => building.owner === PLAYER))
}

for (let i = 0; i < buildings.length; i++) {
  for (let j = i + 1; j < buildings.length; j++) {
    if (rectanglesOverlap(buildings[i], buildings[j])) {
      throw new Error(`Overlapping buildings ${buildings[i].id} and ${buildings[j].id}`)
    }
  }
}

const airstrip = buildings.find(building => building.type === 'airstrip')
const helipad = buildings.find(building => building.type === 'helipad')
ensureAirstripOperations(airstrip)
const parkingSpots = getAirstripParkingSpots(airstrip)
if (parkingSpots.length < 2) throw new Error('Airstrip does not have two parking spots')

const unitTypes = Object.keys(UNIT_PROPERTIES).filter(type => type !== 'base')
const navalTypes = unitTypes.filter(type => UNIT_PROPERTIES[type].isNaval || UNIT_PROPERTIES[type].movementType === 'water')
const airTypes = unitTypes.filter(type => KNOWN_AIR_UNIT_TYPES.has(type))
const landTypes = unitTypes.filter(type => !navalTypes.includes(type) && !airTypes.includes(type))
landTypes.forEach(type => {
  if ((UNIT_PROPERTIES[type].speed || 0) >= 2) {
    throw new Error(`Fast unit ${type} is not classified as air or naval`)
  }
})

const units = []

function placeLandUnit(type) {
  for (let y = playerBounds.y; y < playerBounds.y + playerBounds.height; y += 2) {
    for (let x = playerBounds.x; x < playerBounds.x + playerBounds.width; x += 2) {
      if (grid[y][x] !== 'land' || occupied.has(key(x, y))) continue
      units.push(createUnit(type, x, y, { id: `fullbase-player-${type}` }))
      return
    }
  }
  throw new Error(`No land tile for ${type}`)
}

landTypes.forEach(placeLandUnit)

const helipadLanding = getHelipadLandingTopLeft(helipad)
const helipadTile = getHelipadLandingTile(helipad)
if (!helipadLanding || !helipadTile) throw new Error('Helipad has no landing spot')
const apache = createUnit('apache', helipadTile.x, helipadTile.y, {
  id: 'fullbase-player-apache',
  x: helipadLanding.x,
  y: helipadLanding.y,
  fields: {
    flightState: 'grounded',
    altitude: 0,
    landedHelipadId: helipad.id,
    helipadTargetId: helipad.id,
    groundedOccupancyApplied: false
  }
})
helipad.landedUnitId = apache.id
units.push(apache)

function placeParkedJet(type, slotIndex) {
  const spot = parkingSpots[slotIndex]
  const unit = createUnit(type, spot.x, spot.y, {
    id: `fullbase-player-${type}`,
    x: spot.worldX,
    y: spot.worldY,
    direction: spot.facing,
    fields: {
      flightState: 'grounded',
      altitude: 0,
      airstripId: airstrip.id,
      airstripParkingSlotIndex: slotIndex,
      landedHelipadId: airstrip.id,
      helipadTargetId: airstrip.id,
      groundedOccupancyApplied: true,
      ...(type === 'f22Raptor' ? { f22State: 'parked', f22PendingTakeoff: false } : {})
    }
  })
  setAirstripSlotOccupant(airstrip, slotIndex, unit.id)
  units.push(unit)
}

const parkedAirTypes = airTypes.filter(type => type !== 'apache')
parkedAirTypes.forEach((type, index) => {
  if (index >= parkingSpots.length) throw new Error(`Not enough airstrip parking for ${type}`)
  placeParkedJet(type, index)
})

let navalCursorX = 8
const navalY = 84
navalTypes.forEach(type => {
  const length = NAVAL_RENDER_LENGTH_TILES[type] || 3
  const span = Math.ceil(length) + 2
  const tileX = navalCursorX + Math.ceil(length / 2)
  if (tileX <= 0 || tileX >= MAP_WIDTH || grid[navalY]?.[tileX] !== 'water' || occupied.has(key(tileX, navalY))) {
    throw new Error(`No water tile for ${type}`)
  }
  units.push(createUnit(type, tileX, navalY, {
    id: `fullbase-player-${type}`,
    direction: 0
  }))
  navalCursorX += span
})

const refinery = buildings.find(building => building.type === 'oreRefinery' && building.owner === PLAYER)
let orePlaced = 0
for (let radius = 2; radius < 20 && orePlaced < 12; radius++) {
  for (let y = refinery.y - radius; y <= refinery.y + refinery.height + radius && orePlaced < 12; y++) {
    for (let x = refinery.x - radius; x <= refinery.x + refinery.width + radius && orePlaced < 12; x++) {
      if (!inBounds(x, y) || grid[y][x] !== 'land' || occupied.has(key(x, y))) continue
      const onEdge = x === refinery.x - radius || x === refinery.x + refinery.width + radius ||
        y === refinery.y - radius || y === refinery.y + refinery.height + radius
      if (!onEdge) continue
      orePositions.push({ x, y })
      occupied.add(key(x, y))
      orePlaced++
    }
  }
}
if (orePlaced < 4) throw new Error('Could not place an ore patch near the refinery')

for (let y = 40; y <= 46; y++) {
  for (let x = 90; x <= 96; x++) {
    if (grid[y][x] === 'land' && !occupied.has(key(x, y)) && (x + y) % 2 === 0) {
      grid[y][x] = 'rock'
    }
  }
}

const achievedMilestones = [
  'firstRefinery',
  'firstAirstrip',
  'firstFactory',
  'harvesterUnlocked',
  'tankerTruckUnlocked',
  'rocketTankUnlocked',
  'hospitalBuilt',
  'recoveryTankUnlocked',
  'tenBuildings',
  'firstUnit',
  'firstTank',
  'firstTeslaCoil',
  'radarBuilt'
]

const enemyPower = buildingData.constructionYard.power * 2
const gameState = {
  money: 80000,
  startMoney: 80000,
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
  mapTilesX: MAP_WIDTH,
  mapTilesY: MAP_HEIGHT,
  speedMultiplier: 1,
  powerSupply: power.supply,
  playerPowerSupply: power.supply,
  playerTotalPowerProduction: power.production,
  playerPowerConsumption: power.consumption,
  enemyPowerSupply: enemyPower,
  enemyTotalPowerProduction: enemyPower,
  enemyPowerConsumption: 0,
  playerCount: 2,
  humanPlayer: PLAYER,
  defeatedPlayers: [],
  availableUnitTypes: ['tank', ...unitTypes],
  availableBuildingTypes: Object.keys(buildingData),
  newUnitTypes: [],
  newBuildingTypes: [],
  currentSessionId: 'Full_Base_Test',
  mapSeed: 'Full_Base_Test',
  radarActive: true,
  shadowOfWarEnabled: false,
  achievedMilestones
}

const saveData = {
  gameState,
  aiFactoryBudgets: { [ENEMY]: 0 },
  units,
  unitWrecks: [],
  buildings,
  factoryRallyPoints: buildings
    .filter(building => building.type === 'constructionYard')
    .map(building => ({ id: building.id, rallyPoint: null })),
  orePositions,
  mapGridTypes: grid,
  targetedOreTiles: {},
  achievedMilestones,
  productionQueueState: null
}

const mission = {
  id: 'Full_Base_Test',
  label: 'Full Base Test',
  description: 'Locked test save. The local player owns one of every unit and building, with enough power plants for a surplus, a coastal shipyard, and an airstrip. The enemy has only a construction yard.',
  time: Date.UTC(2024, 0, 1),
  state: JSON.stringify(saveData)
}

const outputDir = path.join('src', 'missions')
const fileContents = `/* eslint-disable quotes */\nexport const fullBaseTest = ${JSON.stringify(mission, null, 2)}\n`
fs.writeFileSync(path.join(outputDir, 'mission_full_base_test.js'), fileContents)

const indexContents = `import { mission01 } from './mission_01.js'
import { fullBaseTest } from './mission_full_base_test.js'

export const builtinMissions = [mission01, fullBaseTest]

export function getBuiltinMissionById(id) {
  return builtinMissions.find(mission => mission.id === id) || null
}
`
fs.writeFileSync(path.join(outputDir, 'index.js'), indexContents)

const playerBuildings = buildings.filter(building => building.owner === PLAYER)
console.log('Full base test save generated')
console.log(`Player buildings: ${playerBuildings.length} (power plants: ${playerBuildings.filter(building => building.type === 'powerPlant').length})`)
console.log(`Player power: ${power.supply} (production ${power.production}, consumption ${power.consumption})`)
console.log(`Player units: ${units.length}`)
console.log(`Enemy buildings: ${buildings.filter(building => building.owner === ENEMY).map(building => building.type).join(', ')}`)
console.log(`Water rows: ${MAP_HEIGHT - WATER_START_Y}`)
