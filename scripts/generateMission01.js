import fs from 'fs'
import path from 'path'

import { buildingData } from '../src/data/buildingData.js'
import { TILE_SIZE, UNIT_GAS_PROPERTIES, UNIT_PROPERTIES } from '../src/config.js'
import { ensureServiceRadius } from '../src/utils/serviceRadius.js'
import { MISSION_01_OBJECTIVE_KEYS } from '../src/missions/missionText.js'

const MAP_WIDTH = 100
const MAP_HEIGHT = 100
const PLAYER = 'player1'
const ENEMY = 'player2'
const START_MONEY = 11000
const ENEMY_BUDGET = 500
const RIVER_Y0 = 48
const RIVER_Y1 = 53
const FORD_X0 = 40
const FORD_X1 = 47

const STARTER_BUILDINGS = [
  'constructionYard',
  'oreRefinery',
  'powerPlant',
  'vehicleFactory',
  'vehicleWorkshop',
  'radarStation',
  'hospital',
  'helipad',
  'gasStation',
  'turretGunV1',
  'street',
  'concreteWall'
]

const grid = Array.from({ length: MAP_HEIGHT }, () => Array.from({ length: MAP_WIDTH }, () => 'land'))
const occupied = new Set()
const orePositions = []

function keyOf(x, y) {
  return `${x},${y}`
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT
}

function setTile(x, y, type) {
  if (inBounds(x, y)) grid[y][x] = type
}

function fillRect(x0, y0, x1, y1, type) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) setTile(x, y, type)
  }
}

function drawThickLine(start, end, thickness, type) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1)
  const half = Math.floor(thickness / 2)
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(start.x + (dx * i) / steps)
    const y = Math.round(start.y + (dy * i) / steps)
    for (let ty = -half; ty <= half; ty++) {
      for (let tx = -half; tx <= half; tx++) setTile(x + tx, y + ty, type)
    }
  }
}

function addRoad(points, thickness = 2) {
  for (let i = 0; i < points.length - 1; i++) {
    drawThickLine(points[i], points[i + 1], thickness, 'street')
  }
}

function addWallRing(x0, y0, x1, y1, openings) {
  const open = new Set(openings.map(tile => keyOf(tile.x, tile.y)))
  const place = (x, y) => {
    if (open.has(keyOf(x, y))) return
    buildings.push(createBuilding('concreteWall', ENEMY, x, y, `mission01-p2-wall-${x}-${y}`))
  }
  for (let x = x0; x <= x1; x++) {
    place(x, y0)
    if (y1 !== y0) place(x, y1)
  }
  for (let y = y0 + 1; y <= y1 - 1; y++) {
    place(x0, y)
    place(x1, y)
  }
}

function addRockCluster(cx, cy, radius) {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= radius * radius) setTile(x, y, 'rock')
    }
  }
}

function addOreCluster(cx, cy, radius) {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy > radius * radius) continue
      if (!inBounds(x, y) || grid[y][x] !== 'land' || occupied.has(keyOf(x, y))) continue
      orePositions.push({ x, y })
      occupied.add(keyOf(x, y))
    }
  }
}

function markFootprint(x, y, width, height) {
  for (let tileY = y; tileY < y + height; tileY++) {
    for (let tileX = x; tileX < x + width; tileX++) occupied.add(keyOf(tileX, tileY))
  }
}

function createBuilding(type, owner, x, y, id) {
  const data = buildingData[type]
  if (!data) throw new Error(`Unknown building type: ${type}`)
  if (!inBounds(x, y) || !inBounds(x + data.width - 1, y + data.height - 1)) {
    throw new Error(`${type} at ${x},${y} is out of bounds`)
  }
  for (let tileY = y; tileY < y + data.height; tileY++) {
    for (let tileX = x; tileX < x + data.width; tileX++) {
      if (grid[tileY][tileX] === 'water' || grid[tileY][tileX] === 'rock') {
        throw new Error(`${type} overlaps ${grid[tileY][tileX]} at ${tileX},${tileY}`)
      }
      if (occupied.has(keyOf(tileX, tileY))) {
        throw new Error(`${type} overlaps an occupied tile at ${tileX},${tileY}`)
      }
    }
  }
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
    building.budget = owner === ENEMY ? ENEMY_BUDGET : 0
    building.productionCountdown = 0
    building.isHuman = owner === PLAYER
  }
  if (type === 'vehicleFactory') building.rallyPoint = null
  ensureServiceRadius(building)
  if (type.startsWith('turretGun') || type === 'rocketTurret' || type === 'teslaCoil' || type === 'artilleryTurret') {
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
  }
  markFootprint(x, y, data.width, data.height)
  return building
}

function createUnit(type, owner, tileX, tileY, id, fields = {}) {
  const props = UNIT_PROPERTIES[type]
  if (!props) throw new Error(`Unknown unit type: ${type}`)
  const x = tileX * TILE_SIZE
  const y = tileY * TILE_SIZE
  const centerTileX = Math.floor((x + TILE_SIZE / 2) / TILE_SIZE)
  const centerTileY = Math.floor((y + TILE_SIZE / 2) / TILE_SIZE)
  if (centerTileX !== tileX || centerTileY !== tileY) {
    throw new Error(`Unit ${id} center tile drifted from ${tileX},${tileY}`)
  }
  const terrain = grid[centerTileY]?.[centerTileX]
  if (terrain !== 'land' && terrain !== 'street') {
    throw new Error(`Unit ${id} stands on ${terrain}`)
  }
  if (occupied.has(keyOf(centerTileX, centerTileY))) {
    throw new Error(`Unit ${id} overlaps an occupied tile`)
  }
  const gas = UNIT_GAS_PROPERTIES[type]
  const unit = {
    id,
    type,
    owner,
    tileX: centerTileX,
    tileY: centerTileY,
    x,
    y,
    health: props.health,
    maxHealth: props.maxHealth,
    path: [],
    direction: 0,
    ...fields
  }
  if (gas) {
    unit.gas = gas.tankSize
    unit.maxGas = gas.tankSize
  }
  occupied.add(keyOf(centerTileX, centerTileY))
  return unit
}

function sidePower(owner) {
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

function assertReachable(from, to) {
  const blocked = new Set(occupied)
  const seen = new Set([keyOf(from.x, from.y)])
  const queue = [from]
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current.x === to.x && current.y === to.y) return
    dirs.forEach(([dx, dy]) => {
      const x = current.x + dx
      const y = current.y + dy
      const id = keyOf(x, y)
      if (!inBounds(x, y) || seen.has(id) || blocked.has(id)) return
      const terrain = grid[y][x]
      if (terrain !== 'land' && terrain !== 'street') return
      seen.add(id)
      queue.push({ x, y })
    })
  }
  throw new Error(`No land route from ${from.x},${from.y} to ${to.x},${to.y}`)
}

fillRect(0, RIVER_Y0, MAP_WIDTH - 1, RIVER_Y1, 'water')
// The yard sits on land. A solid street pad renders as dark asphalt and looks
// like missing ground around the start camera. Keep only a narrow road.
addRoad([
  { x: 18, y: 80 },
  { x: 18, y: 56 },
  { x: 43, y: 50 },
  { x: 70, y: 32 },
  { x: 72, y: 31 }
])
fillRect(FORD_X0, RIVER_Y0, FORD_X1, RIVER_Y1, 'street')
addRockCluster(6, 36, 3)
addRockCluster(92, 34, 3)
addRockCluster(54, 88, 2)

const WALL_X0 = 62
const WALL_Y0 = 11
const WALL_X1 = 84
const WALL_Y1 = 30
const GATE = []
for (let x = 70; x <= 74; x++) GATE.push({ x, y: WALL_Y1 })

const buildings = []
buildings.push(createBuilding('constructionYard', PLAYER, 14, 78, PLAYER))
buildings.push(createBuilding('powerPlant', ENEMY, 64, 13, 'mission01-p2-power'))
buildings.push(createBuilding('constructionYard', ENEMY, 70, 13, ENEMY))
buildings.push(createBuilding('oreRefinery', ENEMY, 76, 13, 'mission01-p2-refinery'))
buildings.push(createBuilding('turretGunV1', ENEMY, 66, 24, 'mission01-p2-turret-w'))
buildings.push(createBuilding('turretGunV1', ENEMY, 78, 24, 'mission01-p2-turret-e'))
addWallRing(WALL_X0, WALL_Y0, WALL_X1, WALL_Y1, GATE)

const units = []
units.push(createUnit('tank_v1', PLAYER, 20, 82, 'mission01-player-tank'))
units.push(createUnit('tank_v1', ENEMY, 68, 22, 'mission01-p2-tank-1'))
units.push(createUnit('tank_v1', ENEMY, 74, 22, 'mission01-p2-tank-2'))
units.push(createUnit('harvester', ENEMY, 81, 18, 'mission01-p2-harvester', {
  needsRefineryAssignment: true
}))

addOreCluster(28, 74, 3)
addOreCluster(81, 21, 1)

let startPadStreets = 0
for (let y = 76; y <= 84; y++) {
  for (let x = 10; x <= 22; x++) {
    if (grid[y][x] === 'street') startPadStreets++
  }
}
if (startPadStreets > 24) {
  throw new Error(`Player start still has a street slab (${startPadStreets} street tiles)`)
}
for (let y = 78; y <= 80; y++) {
  for (let x = 14; x <= 16; x++) {
    if (grid[y][x] !== 'land') throw new Error(`Player yard tile ${x},${y} is ${grid[y][x]}`)
  }
}

const enemyWalls = buildings.filter(building => building.type === 'concreteWall')
if (enemyWalls.length < 40 || enemyWalls.length > 90) {
  throw new Error(`Enemy wall count should stay a camp, not a fortress (${enemyWalls.length})`)
}
if (!GATE.every(tile => !occupied.has(keyOf(tile.x, tile.y)))) {
  throw new Error('South gate is blocked')
}
if (buildings.filter(building => building.type === 'turretGunV1').length !== 2) {
  throw new Error('Enemy camp should have two gun turrets')
}

const playerOre = orePositions.filter(pos => pos.x < 50)
const enemyOre = orePositions.filter(pos => pos.x >= 50)
if (playerOre.length < 12) throw new Error(`Player ore patch is too small (${playerOre.length})`)
if (enemyOre.length < 4 || enemyOre.length > 10) {
  throw new Error(`Enemy ore patch should stay small (${enemyOre.length})`)
}

assertReachable({ x: 20, y: 82 }, { x: 72, y: 28 })

const playerPower = sidePower(PLAYER)
const enemyPower = sidePower(ENEMY)
if (playerPower.supply <= 0) throw new Error('Player base starts without power')
if (enemyPower.supply <= 0) throw new Error('Enemy outpost starts without power')

const openingCost = buildingData.powerPlant.cost
  + buildingData.oreRefinery.cost
  + buildingData.vehicleFactory.cost
  + 1500
if (START_MONEY < openingCost) {
  throw new Error(`Starting money ${START_MONEY} cannot cover the opening build (${openingCost})`)
}

const copy = JSON.parse(fs.readFileSync(path.join('src', 'missions', 'locales', 'en.json'), 'utf8'))

const gameState = {
  money: START_MONEY,
  startMoney: START_MONEY,
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
  powerSupply: playerPower.supply,
  playerPowerSupply: playerPower.supply,
  playerTotalPowerProduction: playerPower.production,
  playerPowerConsumption: playerPower.consumption,
  enemyPowerSupply: enemyPower.supply,
  enemyTotalPowerProduction: enemyPower.production,
  enemyPowerConsumption: enemyPower.consumption,
  playerCount: 2,
  humanPlayer: PLAYER,
  defeatedPlayers: [],
  availableUnitTypes: [],
  availableBuildingTypes: STARTER_BUILDINGS,
  newUnitTypes: [],
  newBuildingTypes: [],
  currentSessionId: 'Mission_01',
  mapSeed: 'Mission_01',
  radarActive: false,
  shadowOfWarEnabled: false,
  achievedMilestones: []
}

const saveData = {
  gameState,
  aiFactoryBudgets: { [ENEMY]: ENEMY_BUDGET },
  units,
  unitWrecks: [],
  buildings,
  factoryRallyPoints: buildings
    .filter(building => building.type === 'constructionYard')
    .map(building => ({ id: building.id, rallyPoint: null })),
  orePositions,
  mapGridTypes: grid,
  targetedOreTiles: {},
  achievedMilestones: [],
  productionQueueState: null
}

const mission = {
  id: 'Mission_01',
  labelKey: 'missions.mission01.label',
  descriptionKey: 'missions.mission01.description',
  objectiveKeys: MISSION_01_OBJECTIVE_KEYS,
  label: copy.missions.mission01.label,
  description: copy.missions.mission01.description,
  introVideo: 'mission_01_intro.mp4',
  introAudio: 'mission_01_intro.mp3',
  time: Date.UTC(2025, 0, 1),
  state: JSON.stringify(saveData)
}

const outputDir = path.join('src', 'missions')
const fileContents = `/* eslint-disable quotes */\nexport const mission01 = ${JSON.stringify(mission, null, 2)}\n`
fs.writeFileSync(path.join(outputDir, 'mission_01.js'), fileContents)

const indexContents = `import { mission01 } from './mission_01.js'
import { fullBaseTest } from './mission_full_base_test.js'

export const builtinMissions = [mission01, fullBaseTest]

export function getBuiltinMissionById(id) {
  return builtinMissions.find(mission => mission.id === id) || null
}
`
fs.writeFileSync(path.join(outputDir, 'index.js'), indexContents)

console.log('Mission 01 generated')
console.log(`Player ore ${playerOre.length}, enemy ore ${enemyOre.length}`)
console.log(`Player power ${playerPower.supply}, enemy power ${enemyPower.supply}`)
console.log(`Credits after opening chain: ${START_MONEY - openingCost}`)
