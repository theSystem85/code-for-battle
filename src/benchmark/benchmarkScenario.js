import { gameState } from '../gameState.js'
import { factories, mapGrid, units, getCurrentGame } from '../main.js'
import { buildingData, canPlaceBuilding, createBuilding, placeBuilding, updatePowerSupply } from '../buildings.js'
import { initializeOccupancyMap, createUnit } from '../units.js'
import { updateDangerZoneMaps } from '../game/dangerZoneMap.js'
import { getTextureManager } from '../rendering.js'
import { cleanupOreFromBuildings } from '../gameSetup.js'
import { TILE_SIZE } from '../config.js'
import { getUniqueId } from '../utils.js'
import { resetBenchmarkCameraFocus } from './benchmarkTracker.js'
import { gameRandom } from '../utils/gameRandom.js'

const BUILDING_TYPES = Object.keys(buildingData)
const BENCHMARK_BUILDING_TYPES = BUILDING_TYPES.filter(type => type !== 'constructionYard')
const SEARCH_DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
]
const ANCHOR_AREA_SIZE = 6

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function tileKey(x, y) {
  return `${x},${y}`
}

function isTileOpen(tileX, tileY) {
  const mapHeight = mapGrid.length
  const mapWidth = mapGrid[0]?.length || 0
  if (tileX < 0 || tileY < 0 || tileX >= mapWidth || tileY >= mapHeight) {
    return false
  }

  const tile = mapGrid[tileY]?.[tileX]
  if (!tile) return false
  if (tile.type === 'water' || tile.type === 'rock' || tile.seedCrystal) {
    return false
  }
  if (tile.building) {
    return false
  }

  return true
}

function isAreaOpen(tileX, tileY, width, height, used = new Set()) {
  for (let y = tileY; y < tileY + height; y++) {
    for (let x = tileX; x < tileX + width; x++) {
      if (!isTileOpen(x, y) || used.has(tileKey(x, y))) {
        return false
      }
    }
  }

  return true
}

function findOpenAreaNear(preferredX, preferredY, width = 1, height = 1, used = new Set(), bounds = null) {
  const mapHeight = mapGrid.length
  const mapWidth = mapGrid[0]?.length || 0
  if (mapWidth === 0 || mapHeight === 0) {
    return null
  }

  const minX = bounds ? Math.max(0, bounds.minX) : 0
  const minY = bounds ? Math.max(0, bounds.minY) : 0
  const maxX = bounds ? Math.min(mapWidth - width, bounds.maxX - width + 1) : mapWidth - width
  const maxY = bounds ? Math.min(mapHeight - height, bounds.maxY - height + 1) : mapHeight - height

  if (maxX < minX || maxY < minY) {
    return null
  }

  const startX = clamp(preferredX, minX, maxX)
  const startY = clamp(preferredY, minY, maxY)

  const queue = [{ x: startX, y: startY }]
  const visited = new Set([tileKey(startX, startY)])

  while (queue.length > 0) {
    const { x, y } = queue.shift()
    if (isAreaOpen(x, y, width, height, used)) {
      return { x, y }
    }

    for (const dir of SEARCH_DIRECTIONS) {
      const nx = clamp(x + dir.x, minX, maxX)
      const ny = clamp(y + dir.y, minY, maxY)
      const key = tileKey(nx, ny)
      if (!visited.has(key)) {
        visited.add(key)
        queue.push({ x: nx, y: ny })
      }
    }
  }

  return null
}

function takeSpawnTile(preferredX, preferredY, usedTiles, bounds = null) {
  const tile = findOpenAreaNear(preferredX, preferredY, 1, 1, usedTiles, bounds)
  if (!tile) {
    return null
  }
  usedTiles.add(tileKey(tile.x, tile.y))
  return tile
}

function reserveArea(x, y, width, height, tracker) {
  for (let ty = y; ty < y + height; ty++) {
    for (let tx = x; tx < x + width; tx++) {
      tracker.add(tileKey(tx, ty))
    }
  }
}

function findPlacementForBuilding(playerId, factory, type) {
  const data = buildingData[type]
  if (!data) return null

  const mapHeight = mapGrid.length
  const mapWidth = mapGrid[0]?.length || 0
  if (!mapWidth || !mapHeight) return null

  const startX = clamp(
    factory.x + Math.floor(factory.width / 2) - Math.floor(data.width / 2),
    0,
    Math.max(0, mapWidth - data.width)
  )
  const startY = clamp(
    factory.y + Math.floor(factory.height / 2) - Math.floor(data.height / 2),
    0,
    Math.max(0, mapHeight - data.height)
  )

  const queue = [{ x: startX, y: startY }]
  const visited = new Set([tileKey(startX, startY)])

  while (queue.length > 0) {
    const { x, y } = queue.shift()
    if (canPlaceBuilding(type, x, y, mapGrid, units, gameState.buildings, factories, playerId)) {
      return { x, y }
    }

    for (const dir of SEARCH_DIRECTIONS) {
      const nx = clamp(x + dir.x, 0, Math.max(0, mapWidth - data.width))
      const ny = clamp(y + dir.y, 0, Math.max(0, mapHeight - data.height))
      const key = tileKey(nx, ny)
      if (!visited.has(key)) {
        visited.add(key)
        queue.push({ x: nx, y: ny })
      }
    }
  }

  return null
}

function placePlayerBuildings(playerId, factory) {
  BENCHMARK_BUILDING_TYPES.forEach((type, index) => {
    const placement = findPlacementForBuilding(playerId, factory, type)
    if (!placement) {
      return
    }

    const building = createBuilding(type, placement.x, placement.y)
    building.id = `${playerId}_${type}_${index}_${getUniqueId()}`
    building.owner = playerId
    building.constructionFinished = true
    building.constructionStartTime = performance.now() - 10000
    building.isBenchmarkStructure = true

    placeBuilding(building, mapGrid, gameState.occupancyMap, { recordTransition: false })
    gameState.buildings.push(building)
  })
}

function spawnSupportUnits(factory, supportAnchor, fireBenchmark) {
  if (!supportAnchor) return

  const supportTypes = ['harvester', 'tankerTruck', 'ambulance', 'recoveryTank']
  if (fireBenchmark) supportTypes.push('fireEngine')
  const mapWidth = mapGrid[0]?.length || 0
  const mapHeight = mapGrid.length || 0
  const baseX = clamp(supportAnchor.x, 0, Math.max(0, mapWidth - 1))
  const baseY = clamp(supportAnchor.y, 0, Math.max(0, mapHeight - 1))
  const usedTiles = new Set()

  supportTypes.forEach((type, index) => {
    const preferredX = baseX + index * 2
    const preferredY = baseY
    const spawnTile = takeSpawnTile(preferredX, preferredY, usedTiles)
    if (!spawnTile) {
      return
    }

    const unit = createUnit(factory, type, spawnTile.x, spawnTile.y)
    unit.x = spawnTile.x * TILE_SIZE
    unit.y = spawnTile.y * TILE_SIZE
    unit.target = null
    unit.id = `${unit.id}_bench`
    units.push(unit)
  })
}

function spawnBattleUnits(factory, anchor) {
  const battleTypes = ['tank_v1', 'tank-v2', 'tank-v3', 'rocketTank', 'howitzer', 'apache']
  const offsets = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 4, y: 0 },
    { x: 0, y: 2 },
    { x: 2, y: 2 },
    { x: 4, y: 2 }
  ]

  const createdUnits = []
  const usedTiles = anchor.usedTiles || new Set()
  const bounds = anchor.bounds || null

  battleTypes.forEach((type, index) => {
    const offset = offsets[index % offsets.length]
    const preferredX = anchor.x + offset.x
    const preferredY = anchor.y + offset.y
    const spawnTile = takeSpawnTile(preferredX, preferredY, usedTiles, bounds)
    if (!spawnTile) {
      return
    }

    const unit = createUnit(factory, type, spawnTile.x, spawnTile.y)
    unit.x = spawnTile.x * TILE_SIZE
    unit.y = spawnTile.y * TILE_SIZE
    unit.id = `${unit.id}_bench`

    if (unit.type === 'apache') {
      unit.isAirUnit = true
      unit.flightState = 'airborne'
      unit.altitude = TILE_SIZE * 3
      unit.targetAltitude = unit.altitude
      unit.hovering = true
      unit.rotor = unit.rotor || { angle: 0, speed: 0, targetSpeed: 0 }
      unit.rotor.speed = 20
      unit.rotor.targetSpeed = 20
    }

    createdUnits.push(unit)
    units.push(unit)
  })

  anchor.usedTiles = usedTiles

  return createdUnits
}

function assignBattleTargets(anchorEntries) {
  anchorEntries.forEach(([playerId, anchor]) => {
    const enemyUnits = anchorEntries
      .filter(([otherId]) => otherId !== playerId)
      .flatMap(([, enemyAnchor]) => enemyAnchor.units)

    anchor.units.forEach(unit => {
      if (enemyUnits.length === 0) {
        unit.target = null
        return
      }
      const target = enemyUnits[Math.floor(gameRandom() * enemyUnits.length)]
      unit.target = target
      unit.guardMode = false
    })
  })
}

export function setupBenchmarkScenario({ seedFires } = {}) {
  const game = getCurrentGame()
  if (!game) {
    throw new Error('Game instance not available')
  }

  gameState.playerCount = 4
  gameState.humanPlayer = 'player1'
  gameState.speedMultiplier = 1

  game.resetGame()

  const mapWidth = mapGrid[0]?.length || 0
  const mapHeight = mapGrid.length || 0

  cleanupOreFromBuildings(mapGrid, gameState.buildings, factories)

  gameState.money = 50000
  gameState.gameTime = 0
  gameState.frameCount = 0
  gameState.totalMoneyEarned = 0
  gameState.playerUnitsDestroyed = 0
  gameState.enemyUnitsDestroyed = 0
  gameState.playerBuildingsDestroyed = 0
  gameState.enemyBuildingsDestroyed = 0
  gameState.unitWrecks = []
  gameState.smokeParticles = []
  gameState.smokeParticlePool = []
  gameState.benchmarkActive = true
  gameState.availableUnitTypes = new Set(['tank_v1', 'tank-v2', 'tank-v3', 'rocketTank', 'harvester', 'ambulance', 'tankerTruck', 'recoveryTank', 'apache', 'howitzer'])
  gameState.availableBuildingTypes = new Set(BUILDING_TYPES)
  gameState.newUnitTypes = new Set()
  gameState.newBuildingTypes = new Set()
  gameState.defeatedPlayers = new Set()

  factories.forEach(factory => {
    factory.budget = 50000
    factory.rallyPoint = null
    factory.isBenchmarkStructure = true
  })

  gameState.buildings.length = 0
  gameState.buildings.push(...factories)

  const centerX = Math.floor(mapWidth / 2)
  const centerY = Math.floor(mapHeight / 2)

  const desiredBattleCenters = {
    player1: { x: centerX - 10, y: centerY + 6 },
    player2: { x: centerX + 6, y: centerY - 10 },
    player3: { x: centerX - 10, y: centerY - 10 },
    player4: { x: centerX + 6, y: centerY + 6 }
  }

  const reservedBattleTiles = new Set()
  const battleAnchors = {}

  Object.entries(desiredBattleCenters).forEach(([playerId, desired]) => {
    const half = Math.floor(ANCHOR_AREA_SIZE / 2)
    const preferredTopLeftX = desired.x - half
    const preferredTopLeftY = desired.y - half

    const area = findOpenAreaNear(
      preferredTopLeftX,
      preferredTopLeftY,
      ANCHOR_AREA_SIZE,
      ANCHOR_AREA_SIZE,
      reservedBattleTiles
    ) || findOpenAreaNear(
      centerX - half,
      centerY - half,
      ANCHOR_AREA_SIZE,
      ANCHOR_AREA_SIZE,
      reservedBattleTiles
    )

    const fallbackTopLeft = {
      x: clamp(preferredTopLeftX, 0, Math.max(0, mapWidth - ANCHOR_AREA_SIZE)),
      y: clamp(preferredTopLeftY, 0, Math.max(0, mapHeight - ANCHOR_AREA_SIZE))
    }

    const resolved = area || fallbackTopLeft
    reserveArea(resolved.x, resolved.y, ANCHOR_AREA_SIZE, ANCHOR_AREA_SIZE, reservedBattleTiles)

    battleAnchors[playerId] = {
      x: resolved.x,
      y: resolved.y,
      bounds: {
        minX: resolved.x,
        maxX: resolved.x + ANCHOR_AREA_SIZE - 1,
        minY: resolved.y,
        maxY: resolved.y + ANCHOR_AREA_SIZE - 1
      },
      usedTiles: new Set(),
      units: []
    }
  })

  const supportAnchors = {}
  factories.forEach(factory => {
    const preferred = (() => {
      const width = factory.width || 0
      const height = factory.height || 0
      switch (factory.owner) {
        case 'player1':
          return { x: factory.x + width + 2, y: factory.y + height + 1 }
        case 'player2':
          return { x: factory.x - 6, y: factory.y - 2 }
        case 'player3':
          return { x: factory.x + width + 2, y: factory.y - 2 }
        case 'player4':
          return { x: factory.x - 6, y: factory.y + height + 1 }
        default:
          return { x: factory.x + width + 1, y: factory.y + height + 1 }
      }
    })()

    const anchor = findOpenAreaNear(preferred.x, preferred.y, 1, 1) || {
      x: clamp(preferred.x, 0, Math.max(0, mapWidth - 1)),
      y: clamp(preferred.y, 0, Math.max(0, mapHeight - 1))
    }

    supportAnchors[factory.owner] = anchor
  })

  const anchorEntries = Object.entries(battleAnchors)

  anchorEntries.forEach(([playerId, anchor]) => {
    const factory = factories.find(f => f.owner === playerId)
    if (!factory) return

    placePlayerBuildings(playerId, factory)
    spawnSupportUnits(factory, supportAnchors[playerId], Boolean(seedFires))

    const battleUnits = spawnBattleUnits(factory, anchor)
    anchor.units.push(...battleUnits)
  })

  assignBattleTargets(anchorEntries)

  cleanupOreFromBuildings(mapGrid, gameState.buildings, factories)
  updatePowerSupply(gameState.buildings, gameState)

  gameState.occupancyMap = initializeOccupancyMap(units, mapGrid, getTextureManager())
  updateDangerZoneMaps(gameState)

  seedFires?.(gameState, mapGrid)

  gameState.gamePaused = false
  gameState.gameStarted = true

  if (typeof game.centerOnPlayerFactory === 'function') {
    game.centerOnPlayerFactory()
  }
}

export function teardownBenchmarkScenario() {
  gameState.benchmarkActive = false
  resetBenchmarkCameraFocus()
}
