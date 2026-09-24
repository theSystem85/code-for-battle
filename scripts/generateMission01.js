import fs from 'fs'
import path from 'path'

const TILE_SIZE = 32
const MAP_WIDTH = 100
const MAP_HEIGHT = 100

let randomSeed = 987654321
function seededRandom() {
  randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0
  return randomSeed / 0x100000000
}

const buildingStats = {
  constructionYard: { width: 3, height: 3, health: 350, power: 50 },
  powerPlant: { width: 3, height: 3, health: 200, power: 200 },
  oreRefinery: { width: 3, height: 3, health: 200, power: -150 },
  vehicleFactory: { width: 3, height: 3, health: 300, power: -50 },
  vehicleWorkshop: { width: 3, height: 3, health: 300, power: -20, serviceMultiplier: 2 },
  radarStation: { width: 2, height: 2, health: 200, power: -50 },
  gasStation: { width: 3, height: 3, health: 50, power: -30 },
  teslaCoil: { width: 2, height: 2, health: 250, power: -60, tesla: true },
  rocketTurret: {
    width: 2,
    height: 2,
    health: 200,
    power: -20,
    turret: {
      fireRange: 16,
      fireCooldown: 6000,
      damage: 18,
      armor: 2,
      projectileType: 'rocket',
      projectileSpeed: 5,
      burstFire: true,
      burstCount: 4,
      burstDelay: 500
    }
  },
  artilleryTurret: {
    width: 2,
    height: 2,
    health: 300,
    power: -45,
    turret: {
      fireRange: 36,
      minFireRange: 5,
      fireCooldown: 7000,
      damage: 100,
      armor: 2,
      projectileType: 'artillery',
      projectileSpeed: 0.75,
      isArtillery: true
    }
  },
  turretGunV3: {
    width: 1,
    height: 1,
    health: 300,
    power: -30,
    turret: {
      fireRange: 12,
      fireCooldown: 3500,
      damage: 15,
      armor: 1.5,
      projectileType: 'bullet',
      projectileSpeed: 15,
      burstFire: true,
      burstCount: 3,
      burstDelay: 150
    }
  },
  turretGunV2: {
    width: 1,
    height: 1,
    health: 300,
    power: -20,
    turret: {
      fireRange: 10,
      fireCooldown: 3000,
      damage: 12,
      armor: 1,
      projectileType: 'bullet',
      projectileSpeed: 16,
      burstFire: true,
      burstCount: 2,
      burstDelay: 150
    }
  },
  turretGunV1: {
    width: 1,
    height: 1,
    health: 300,
    power: -10,
    turret: {
      fireRange: 10,
      fireCooldown: 3000,
      damage: 10,
      armor: 1,
      projectileType: 'bullet',
      projectileSpeed: 12
    }
  },
  concreteWall: { width: 1, height: 1, health: 200, power: 0 }
}

const unitStats = {
  tank_v1: { health: 100, maxHealth: 100 },
  'tank-v2': { health: 150, maxHealth: 150 },
  'tank-v3': { health: 200, maxHealth: 200 },
  rocketTank: { health: 100, maxHealth: 100 },
  harvester: { health: 150, maxHealth: 150, armor: 3 },
  tankerTruck: { health: 20, maxHealth: 20 }
}

const unitGas = {
  tank_v1: { tankSize: 1900, consumption: 450 },
  'tank-v2': { tankSize: 1900, consumption: 450 },
  'tank-v3': { tankSize: 1900, consumption: 450 },
  rocketTank: { tankSize: 1900, consumption: 450 },
  harvester: { tankSize: 2650, consumption: 30, harvestConsumption: 100 },
  tankerTruck: { tankSize: 700, consumption: 150, supply: 40000 }
}

const unitCosts = {
  tank_v1: 1000,
  'tank-v2': 2000,
  'tank-v3': 3000,
  rocketTank: 2000,
  harvester: 1500,
  tankerTruck: 300
}

const grid = Array.from({ length: MAP_HEIGHT }, () => Array.from({ length: MAP_WIDTH }, () => 'land'))
const orePositions = []
const occupiedTiles = new Set()

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT
}

function setTile(x, y, type) {
  if (inBounds(x, y)) {
    grid[y][x] = type
  }
}

function addLake(cx, cy, rx, ry) {
  for (let y = Math.max(0, cy - ry - 1); y <= Math.min(MAP_HEIGHT - 1, cy + ry + 1); y++) {
    for (let x = Math.max(0, cx - rx - 1); x <= Math.min(MAP_WIDTH - 1, cx + rx + 1); x++) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1.05) {
        setTile(x, y, 'water')
      }
    }
  }
}

function addRockCluster(cx, cy, radius, density = 0.8) {
  for (let y = Math.max(0, cy - radius); y <= Math.min(MAP_HEIGHT - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(MAP_WIDTH - 1, cx + radius); x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= radius * radius && seededRandom() < density) {
        setTile(x, y, 'rock')
      }
    }
  }
}

function addOreCluster(cx, cy, radius, density = 0.7) {
  for (let y = Math.max(0, cy - radius); y <= Math.min(MAP_HEIGHT - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(MAP_WIDTH - 1, cx + radius); x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= radius * radius && seededRandom() < density && grid[y][x] !== 'water') {
        orePositions.push({ x, y })
      }
    }
  }
}

function drawThickLine(start, end, thickness, type) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const steps = Math.max(Math.abs(dx), Math.abs(dy))
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(start.x + (dx * i) / steps)
    const y = Math.round(start.y + (dy * i) / steps)
    for (let ty = -Math.floor(thickness / 2); ty <= Math.floor(thickness / 2); ty++) {
      for (let tx = -Math.floor(thickness / 2); tx <= Math.floor(thickness / 2); tx++) {
        setTile(x + tx, y + ty, type)
      }
    }
  }
}

function addStreetPath(points, thickness = 2) {
  for (let i = 0; i < points.length - 1; i++) {
    drawThickLine(points[i], points[i + 1], thickness, 'street')
  }
}

function addStreetRect(x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      setTile(x, y, 'street')
    }
  }
}

function markOccupied(building) {
  for (let y = building.y; y < building.y + building.height; y++) {
    for (let x = building.x; x < building.x + building.width; x++) {
      occupiedTiles.add(`${x},${y}`)
    }
  }
}

function computeServiceRadius(type, width, height, multiplier = 1) {
  const base = Math.hypot(width / 2 + 0.5, height / 2 + 0.5)
  if (type === 'vehicleWorkshop') {
    return base * (multiplier || 2)
  }
  if (type === 'hospital') {
    return base * 2
  }
  if (type === 'gasStation') {
    return base
  }
  return base
}

function createBuilding({ type, owner, x, y, id, extra = {} }) {
  const stats = buildingStats[type]
  if (!stats) {
    throw new Error(`Unknown building type: ${type}`)
  }
  const building = {
    type,
    owner,
    x,
    y,
    width: stats.width,
    height: stats.height,
    health: stats.health,
    maxHealth: stats.health,
    power: stats.power,
    isBuilding: true,
    constructionStartTime: -5000,
    constructionFinished: true,
    id: id || `${type}_${x}_${y}`,
    ...extra
  }

  if (type === 'constructionYard') {
    building.rallyPoint = null
    building.budget = extra.budget ?? 0
    building.productionCountdown = 0
    building.isHuman = owner === 'player1'
  }

  if (type === 'vehicleFactory') {
    building.rallyPoint = extra.rallyPoint || null
  }

  if (type === 'vehicleWorkshop' || type === 'gasStation') {
    building.serviceRadius = computeServiceRadius(type, stats.width, stats.height, stats.serviceMultiplier)
  }

  if (stats.tesla) {
    building.isTeslaCoil = true
    building.teslaState = 'idle'
    building.teslaChargeStartTime = 0
    building.teslaFireStartTime = 0
  }

  if (stats.turret) {
    building.fireRange = stats.turret.fireRange
    building.minFireRange = stats.turret.minFireRange || 0
    building.fireCooldown = stats.turret.fireCooldown
    building.damage = stats.turret.damage
    building.armor = stats.turret.armor || 1
    building.projectileType = stats.turret.projectileType
    building.projectileSpeed = stats.turret.projectileSpeed
    building.lastShotTime = 0
    building.turretDirection = 0
    building.targetDirection = 0
    building.holdFire = false
    building.forcedAttackTarget = null
    if (stats.turret.burstFire) {
      building.burstFire = true
      building.burstCount = stats.turret.burstCount
      building.burstDelay = stats.turret.burstDelay
      building.currentBurst = 0
      building.lastBurstTime = 0
    }
    if (stats.turret.isArtillery) {
      building.isArtillery = true
    }
  }

  markOccupied(building)
  return building
}

function createUnit({ type, owner, tileX, tileY, id, extra = {} }) {
  const stats = unitStats[type]
  if (!stats) {
    throw new Error(`Unknown unit type: ${type}`)
  }
  const gasInfo = unitGas[type]
  const worldX = tileX * TILE_SIZE
  const worldY = tileY * TILE_SIZE
  const unit = {
    type,
    owner,
    tileX,
    tileY,
    x: worldX,
    y: worldY,
    health: stats.health,
    maxHealth: stats.maxHealth,
    id: id || `${type}_${tileX}_${tileY}`,
    gas: gasInfo ? gasInfo.tankSize : undefined,
    maxGas: gasInfo ? gasInfo.tankSize : undefined,
    supplyGas: gasInfo?.supply,
    maxSupplyGas: gasInfo?.supply,
    gasRefillTimer: 0,
    refueling: false,
    outOfGasPlayed: false,
    oreCarried: extra.oreCarried ?? 0,
    assignedRefinery: extra.assignedRefinery || null,
    oreField: extra.oreField || null,
    path: [],
    targetId: null,
    targetType: null,
    groupNumber: null,
    level: extra.level ?? 0,
    experience: extra.experience ?? 0,
    baseCost: unitCosts[type],
    rangeMultiplier: extra.rangeMultiplier,
    fireRateMultiplier: extra.fireRateMultiplier,
    armor: stats.armor,
    selfRepair: extra.selfRepair || false
  }
  return unit
}

// --- Map Features ---
addLake(28, 28, 8, 6)
addLake(52, 62, 7, 5)
addLake(18, 58, 6, 4)
addLake(76, 70, 5, 4)
addLake(90, 50, 6, 4)

addStreetPath([
  { x: 12, y: 80 },
  { x: 20, y: 80 },
  { x: 36, y: 74 },
  { x: 50, y: 64 },
  { x: 62, y: 54 },
  { x: 72, y: 46 }
])
addStreetPath([
  { x: 20, y: 80 },
  { x: 24, y: 72 },
  { x: 30, y: 60 }
])
addStreetRect(10, 76, 16, 82)
addStreetRect(62, 24, 86, 38)
addStreetPath([
  { x: 66, y: 44 },
  { x: 72, y: 54 },
  { x: 80, y: 60 }
])

addRockCluster(40, 16, 4)
addRockCluster(22, 50, 5)
addRockCluster(55, 86, 4)
addRockCluster(82, 58, 3)
addRockCluster(12, 32, 3)

addOreCluster(22, 78, 4, 0.8)
addOreCluster(44, 48, 5, 0.6)
addOreCluster(88, 26, 4, 0.7)
addOreCluster(68, 74, 4, 0.6)
addOreCluster(32, 20, 3, 0.5)

// Carve a river connecting the main lakes
addStreetPath([
  { x: 30, y: 34 },
  { x: 36, y: 44 },
  { x: 44, y: 52 },
  { x: 52, y: 62 }
], 3)
for (let y = 34; y <= 62; y++) {
  for (let x = 28; x <= 54; x++) {
    if (grid[y][x] === 'street') {
      setTile(x, y, 'water')
    }
  }
}

// --- Buildings ---
const buildings = []
const factories = []

function addBuilding(buildingOptions) {
  const building = createBuilding(buildingOptions)
  buildings.push(building)
  if (building.type === 'constructionYard') {
    factories.push(building)
  }
  return building
}

addBuilding({
  type: 'constructionYard',
  owner: 'player',
  x: 12,
  y: 78,
  id: 'player',
  extra: { budget: 0 }
})

const enemyBuildings = [
  { type: 'constructionYard', owner: 'player2', x: 74, y: 26, id: 'player2', extra: { budget: 18000 } },
  { type: 'powerPlant', owner: 'player2', x: 70, y: 18, id: 'mission01-p2-pp-nw' },
  { type: 'powerPlant', owner: 'player2', x: 74, y: 18, id: 'mission01-p2-pp-ne' },
  { type: 'powerPlant', owner: 'player2', x: 70, y: 34, id: 'mission01-p2-pp-sw' },
  { type: 'powerPlant', owner: 'player2', x: 74, y: 34, id: 'mission01-p2-pp-se' },
  { type: 'powerPlant', owner: 'player2', x: 80, y: 26, id: 'mission01-p2-pp-east' },
  { type: 'oreRefinery', owner: 'player2', x: 64, y: 20, id: 'mission01-p2-ref-west' },
  { type: 'oreRefinery', owner: 'player2', x: 82, y: 20, id: 'mission01-p2-ref-east' },
  { type: 'vehicleFactory', owner: 'player2', x: 68, y: 28, id: 'mission01-p2-factory', extra: { rallyPoint: { x: 76 * TILE_SIZE, y: 44 * TILE_SIZE } } },
  { type: 'vehicleWorkshop', owner: 'player2', x: 78, y: 30, id: 'mission01-p2-workshop' },
  { type: 'gasStation', owner: 'player2', x: 66, y: 34, id: 'mission01-p2-gas' },
  { type: 'radarStation', owner: 'player2', x: 80, y: 30, id: 'mission01-p2-radar' },
  { type: 'teslaCoil', owner: 'player2', x: 74, y: 22, id: 'mission01-p2-tesla' },
  { type: 'rocketTurret', owner: 'player2', x: 66, y: 18, id: 'mission01-p2-rocket-nw' },
  { type: 'rocketTurret', owner: 'player2', x: 86, y: 32, id: 'mission01-p2-rocket-se' },
  { type: 'artilleryTurret', owner: 'player2', x: 82, y: 26, id: 'mission01-p2-artillery' },
  { type: 'turretGunV3', owner: 'player2', x: 60, y: 14, id: 'mission01-p2-v3-nw' },
  { type: 'turretGunV3', owner: 'player2', x: 86, y: 14, id: 'mission01-p2-v3-ne' },
  { type: 'turretGunV3', owner: 'player2', x: 60, y: 46, id: 'mission01-p2-v3-sw' },
  { type: 'turretGunV3', owner: 'player2', x: 86, y: 46, id: 'mission01-p2-v3-se' },
  { type: 'turretGunV2', owner: 'player2', x: 66, y: 14, id: 'mission01-p2-v2-sw' },
  { type: 'turretGunV2', owner: 'player2', x: 80, y: 14, id: 'mission01-p2-v2-se' },
  { type: 'turretGunV2', owner: 'player2', x: 66, y: 46, id: 'mission01-p2-v2-nw' },
  { type: 'turretGunV2', owner: 'player2', x: 80, y: 46, id: 'mission01-p2-v2-ne' },
  { type: 'turretGunV1', owner: 'player2', x: 58, y: 30, id: 'mission01-p2-v1-west' },
  { type: 'turretGunV1', owner: 'player2', x: 88, y: 30, id: 'mission01-p2-v1-east' },
  { type: 'turretGunV1', owner: 'player2', x: 72, y: 14, id: 'mission01-p2-v1-north' },
  { type: 'turretGunV1', owner: 'player2', x: 72, y: 46, id: 'mission01-p2-v1-south' }
]

enemyBuildings.forEach(addBuilding)

function addWall(x, y) {
  if (!occupiedTiles.has(`${x},${y}`)) {
    addBuilding({ type: 'concreteWall', owner: 'player2', x, y, id: `mission01-wall-${x}-${y}` })
  }
}

for (let x = 58; x <= 88; x++) {
  if (x < 72 || x > 78) {
    addWall(x, 16)
  }
  addWall(x, 44)
}
for (let y = 16; y <= 44; y++) {
  addWall(58, y)
  addWall(88, y)
}

// Gate posts with heavier defenses near entrance
addBuilding({ type: 'turretGunV3', owner: 'player2', x: 70, y: 46, id: 'mission01-p2-gate-v3-west' })
addBuilding({ type: 'turretGunV3', owner: 'player2', x: 78, y: 46, id: 'mission01-p2-gate-v3-east' })
addBuilding({ type: 'turretGunV2', owner: 'player2', x: 72, y: 46, id: 'mission01-p2-gate-v2-mid' })

// --- Units ---
const units = []
function addUnit(unitOptions) {
  units.push(createUnit(unitOptions))
}

addUnit({ type: 'tank_v1', owner: 'player2', tileX: 68, tileY: 24, id: 'mission01-p2-tank-1' })
addUnit({ type: 'tank_v1', owner: 'player2', tileX: 80, tileY: 24, id: 'mission01-p2-tank-2' })
addUnit({ type: 'tank_v1', owner: 'player2', tileX: 68, tileY: 32, id: 'mission01-p2-tank-3' })
addUnit({ type: 'tank_v1', owner: 'player2', tileX: 80, tileY: 32, id: 'mission01-p2-tank-4' })
addUnit({ type: 'tank-v2', owner: 'player2', tileX: 72, tileY: 18, id: 'mission01-p2-v2-1' })
addUnit({ type: 'tank-v2', owner: 'player2', tileX: 78, tileY: 18, id: 'mission01-p2-v2-2' })
addUnit({ type: 'tank-v3', owner: 'player2', tileX: 74, tileY: 40, id: 'mission01-p2-v3-1' })
addUnit({ type: 'rocketTank', owner: 'player2', tileX: 66, tileY: 28, id: 'mission01-p2-rocket-1' })
addUnit({ type: 'rocketTank', owner: 'player2', tileX: 84, tileY: 28, id: 'mission01-p2-rocket-2' })
addUnit({ type: 'rocketTank', owner: 'player2', tileX: 64, tileY: 46, id: 'mission01-p2-rocket-3' })
addUnit({
  type: 'harvester',
  owner: 'player2',
  tileX: 86,
  tileY: 24,
  id: 'mission01-p2-harvester-1',
  extra: { assignedRefinery: 'mission01-p2-ref-east' }
})
addUnit({ type: 'tankerTruck', owner: 'player2', tileX: 78, tileY: 34, id: 'mission01-p2-tanker-1' })

// --- Game State ---
const gameState = {
  money: 12000,
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
  scrollOffset: { x: 0, y: 0 },
  dragVelocity: { x: 0, y: 0 },
  mapTilesX: MAP_WIDTH,
  mapTilesY: MAP_HEIGHT,
  keyScroll: { up: false, down: false, left: false, right: false },
  cameraFollowUnitId: null,
  isRightDragging: false,
  lastDragPos: { x: 0, y: 0 },
  enemyLastProductionTime: 0,
  lastOreUpdate: 0,
  explosions: [],
  smokeParticles: [],
  smokeParticlePool: [],
  unitWrecks: [],
  selectedWreckId: null,
  speedMultiplier: 1,
  buildings: [...buildings],
  factories: [...factories],
  mapGrid: [],
  occupancyMap: [],
  powerSupply: 0,
  playerPowerSupply: 0,
  playerTotalPowerProduction: 0,
  playerPowerConsumption: 0,
  enemyPowerSupply: 0,
  enemyTotalPowerProduction: 0,
  enemyPowerConsumption: 0,
  playerBuildSpeedModifier: 1,
  enemyBuildSpeedModifier: 1,
  buildingPlacementMode: false,
  currentBuildingType: null,
  cursorX: 0,
  cursorY: 0,
  draggedBuildingType: null,
  draggedBuildingButton: null,
  draggedUnitType: null,
  draggedUnitButton: null,
  blueprints: [],
  chainBuildPrimed: false,
  chainBuildMode: false,
  chainStartX: 0,
  chainStartY: 0,
  chainBuildingType: null,
  chainBuildingButton: null,
  shiftKeyDown: false,
  altKeyDown: false,
  remoteControl: {
    forward: 0,
    backward: 0,
    turnLeft: 0,
    turnRight: 0,
    turretLeft: 0,
    turretRight: 0,
    fire: 0
  },
  remoteControlSources: {
    forward: {},
    backward: {},
    turnLeft: {},
    turnRight: {},
    turretLeft: {},
    turretRight: {},
    fire: {}
  },
  remoteControlAbsolute: {
    wagonDirection: null,
    wagonSpeed: 0,
    turretDirection: null,
    turretTurnFactor: 0
  },
  remoteControlAbsoluteSources: {},
  repairMode: false,
  buildingsUnderRepair: [],
  playerBuildHistory: [],
  currentSessionId: 'Mission_01',
  enemyLastBuildingTime: 0,
  radarActive: false,
  shadowOfWarEnabled: false,
  visibilityMap: [],
  gridVisible: false,
  occupancyVisible: false,
  performanceVisible: false,
  benchmarkActive: false,
  dangerZoneMaps: {},
  dzmOverlayIndex: -1,
  fpsVisible: false,
  fpsCounter: {
    frameCount: 0,
    lastTime: 0,
    fps: 0,
    frameTimes: [],
    avgFrameTime: 0,
    minFrameTime: 0,
    maxFrameTime: 0
  },
  useTankImages: true,
  useTurretImages: true,
  cheatDialogOpen: false,
  runtimeConfigDialogOpen: false,
  nextVehicleFactoryIndex: 0,
  refineryStatus: {},
  attackGroupMode: false,
  attackGroupStart: { x: 0, y: 0 },
  attackGroupEnd: { x: 0, y: 0 },
  attackGroupTargets: [],
  disableAGFRendering: false,
  globalAttackPoint: null,
  lastGlobalAttackDecision: 0,
  playerCount: 2,
  humanPlayer: 'player',
  defeatedPlayers: [],
  availableUnitTypes: [],
  availableBuildingTypes: [
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
    'concreteWall'
  ],
  newUnitTypes: [],
  newBuildingTypes: [],
  pendingButtonUpdate: false,
  mapSeed: 'Mission_01',
  targetedOreTiles: {},
  achievedMilestones: []
}

function computePower() {
  let playerPower = 0
  let playerProd = 0
  let playerCons = 0
  let enemyPower = 0
  let enemyProd = 0
  let enemyCons = 0

  factories.forEach(factory => {
    if (factory.owner === 'player1') {
      playerPower += 50
      playerProd += 50
    } else {
      enemyPower += 50
      enemyProd += 50
    }
  })

  buildings.forEach(building => {
    if (!building.owner) return
    if (building.owner === 'player1') {
      playerPower += building.power
      if (building.power > 0) playerProd += building.power
      if (building.power < 0) playerCons += Math.abs(building.power)
    } else {
      enemyPower += building.power
      if (building.power > 0) enemyProd += building.power
      if (building.power < 0) enemyCons += Math.abs(building.power)
    }
  })

  gameState.playerPowerSupply = playerPower
  gameState.playerTotalPowerProduction = playerProd
  gameState.playerPowerConsumption = playerCons
  gameState.enemyPowerSupply = enemyPower
  gameState.enemyTotalPowerProduction = enemyProd
  gameState.enemyPowerConsumption = enemyCons
  gameState.powerSupply = playerPower
}

computePower()

const factoryRallyPoints = factories.map(factory => ({
  id: factory.id,
  rallyPoint: factory.rallyPoint || null
}))

const mapGridTypes = grid.map(row => [...row])

const saveData = {
  gameState,
  aiFactoryBudgets: { player2: 18000 },
  units,
  unitWrecks: [],
  buildings,
  factoryRallyPoints,
  orePositions,
  mapGridTypes,
  targetedOreTiles: {},
  achievedMilestones: [],
  productionQueueState: null
}

const mission = {
  id: 'Mission_01',
  label: 'Mission 01: Midnight Siege',
  description: 'Infiltrate the Scarlet Dominion stronghold before their patrols discover your lone construction yard.',
  time: Date.UTC(2025, 0, 1),
  state: JSON.stringify(saveData)
}

const outputDir = path.join('src', 'missions')
fs.mkdirSync(outputDir, { recursive: true })

const fileContents = `/* eslint-disable quotes */\nexport const mission01 = ${JSON.stringify({
  id: mission.id,
  label: mission.label,
  description: mission.description,
  time: mission.time,
  state: mission.state
}, null, 2)}\n`

fs.writeFileSync(path.join(outputDir, 'mission_01.js'), fileContents)

const indexContents = 'import { mission01 } from \'./mission_01.js\'\nimport { fullBaseTest } from \'./mission_full_base_test.js\'\n\nexport const builtinMissions = [mission01, fullBaseTest]\n\nexport function getBuiltinMissionById(id) {\n  return builtinMissions.find(mission => mission.id === id) || null\n}\n'

fs.writeFileSync(path.join(outputDir, 'index.js'), indexContents)

console.log('Mission 01 generated successfully')
