// Deterministic late-game battle used by the heavy-battle frame-time benchmark.
// Placement, targets, and the camera sweep do not use Math.random. Smoke seeding
// uses the lockstep PRNG only while the scenario is armed, then restores it.

import { TILE_SIZE, MAX_SMOKE_PARTICLES } from '../config.js'
import { gameState } from '../gameState.js'
import { factories, mapGrid, units, getCurrentGame } from '../main.js'
import { createUnit, initializeOccupancyMap } from '../units.js'
import { updateDangerZoneMaps } from '../game/dangerZoneMap.js'
import { initializeShadowOfWar } from '../game/shadowOfWar.js'
import { emitSmokeParticles } from '../utils/smokeUtils.js'
import { getTextureManager } from '../rendering.js'
import { deterministicRNG } from '../network/deterministicRandom.js'

export const HEAVY_BATTLE_DEFAULT_UNITS = 320
export const HEAVY_BATTLE_MIN_UNITS = 40
export const HEAVY_BATTLE_MAX_UNITS = 800
export const HEAVY_BATTLE_CAMERA_SPEED_PX_PER_SEC = 600
export const HEAVY_BATTLE_PLAYERS = Object.freeze(['player1', 'player2', 'player3', 'player4'])
export const HEAVY_BATTLE_TYPES = Object.freeze(['tank_v1', 'tank-v2', 'tank-v3', 'rocketTank', 'howitzer'])

const COLUMN_STRIDE = 2
const ROW_STRIDE = 2
const COLUMNS_PER_PLAYER = 8
const FRONT_GAP_TILES = 8
const DUST_COUNT = 80
const DUST_LIFETIME_MS = 120000
const EXPLOSION_COUNT = 12
const EXPLOSION_DURATION_MS = 500

let rngRestore = null

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function clampHeavyBattleUnitCount(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return HEAVY_BATTLE_DEFAULT_UNITS
  return clamp(parsed, HEAVY_BATTLE_MIN_UNITS, HEAVY_BATTLE_MAX_UNITS)
}

export function heavyBattleScrollX(elapsedMs, minScrollX, maxScrollX, speedPxPerSec = HEAVY_BATTLE_CAMERA_SPEED_PX_PER_SEC) {
  const span = Math.max(0, maxScrollX - minScrollX)
  if (span <= 0) return minScrollX
  const distance = Math.max(0, elapsedMs) / 1000 * speedPxPerSec
  const cycle = distance % (span * 2)
  if (cycle <= span) return minScrollX + cycle
  return maxScrollX - (cycle - span)
}

function isSpawnTileOpen(tileX, tileY) {
  const mapHeight = mapGrid.length
  const mapWidth = mapGrid[0]?.length || 0
  if (tileX < 1 || tileY < 1 || tileX >= mapWidth - 1 || tileY >= mapHeight - 1) return false
  const tile = mapGrid[tileY]?.[tileX]
  if (!tile) return false
  if (tile.type === 'water' || tile.type === 'rock' || tile.seedCrystal || tile.building) return false
  return true
}

function findOpenTile(preferredX, preferredY, used) {
  const mapHeight = mapGrid.length
  const mapWidth = mapGrid[0]?.length || 0
  const maxRadius = 6
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
        const tileX = preferredX + dx
        const tileY = preferredY + dy
        if (tileX < 0 || tileY < 0 || tileX >= mapWidth || tileY >= mapHeight) continue
        const key = tileY * mapWidth + tileX
        if (used.has(key)) continue
        if (!isSpawnTileOpen(tileX, tileY)) continue
        used.add(key)
        return { x: tileX, y: tileY }
      }
    }
  }
  return null
}

function playerOrigin(playerIndex, centerX, centerY, rows) {
  const blockHeight = (rows - 1) * ROW_STRIDE
  const blockWidth = (COLUMNS_PER_PLAYER - 1) * COLUMN_STRIDE
  const pair = playerIndex < 2 ? 0 : 1
  const side = playerIndex % 2
  const y = pair === 0 ? centerY - blockHeight - 4 : centerY + 4
  if (side === 0) {
    const frontX = centerX - Math.ceil(FRONT_GAP_TILES / 2)
    return { x: frontX - blockWidth, y, facing: 0 }
  }
  const frontX = centerX + Math.floor(FRONT_GAP_TILES / 2)
  return { x: frontX, y, facing: Math.PI }
}

function armDeterministicRng(seed) {
  rngRestore = {
    enabled: deterministicRNG.isEnabled(),
    seed: deterministicRNG.getSeed()
  }
  deterministicRNG.setSeed(seed)
  deterministicRNG.enable()
}

function restoreDeterministicRng() {
  if (!rngRestore) return
  deterministicRNG.setSeed(rngRestore.seed)
  if (rngRestore.enabled) deterministicRNG.enable()
  else deterministicRNG.disable()
  rngRestore = null
}

function seedSmoke(now) {
  const mapWidth = mapGrid[0]?.length || 0
  const mapHeight = mapGrid.length || 0
  const originX = Math.floor(mapWidth / 2) * TILE_SIZE
  const originY = Math.floor(mapHeight / 2) * TILE_SIZE
  if (!Array.isArray(gameState.smokeParticles)) gameState.smokeParticles = []
  if (!Array.isArray(gameState.smokeParticlePool)) gameState.smokeParticlePool = []
  const puffCount = Math.min(MAX_SMOKE_PARTICLES, 300)
  for (let index = 0; index < puffCount; index++) {
    const column = index % 20
    const row = Math.floor(index / 20)
    emitSmokeParticles(
      gameState,
      originX + (column - 10) * TILE_SIZE,
      originY + (row - 8) * TILE_SIZE,
      now,
      1
    )
  }
}

function seedDust(now) {
  const mapWidth = mapGrid[0]?.length || 0
  const mapHeight = mapGrid.length || 0
  const originX = Math.floor(mapWidth / 2) * TILE_SIZE
  const originY = Math.floor(mapHeight / 2) * TILE_SIZE
  gameState.dustParticles = []
  for (let index = 0; index < DUST_COUNT; index++) {
    const column = index % 10
    const row = Math.floor(index / 10)
    gameState.dustParticles.push({
      x: originX + (column - 5) * TILE_SIZE,
      y: originY + (row - 4) * TILE_SIZE,
      size: 8,
      startTime: now,
      lifetime: DUST_LIFETIME_MS,
      alpha: 1,
      currentSize: 8,
      velocity: { x: ((index % 5) - 2) * 0.05, y: -0.04 },
      color: '#D2B48C'
    })
  }
}

function seedExplosions(now) {
  const mapWidth = mapGrid[0]?.length || 0
  const mapHeight = mapGrid.length || 0
  const originX = Math.floor(mapWidth / 2) * TILE_SIZE
  const originY = Math.floor(mapHeight / 2) * TILE_SIZE
  if (!Array.isArray(gameState.explosions)) gameState.explosions = []
  for (let index = 0; index < EXPLOSION_COUNT; index++) {
    gameState.explosions.push({
      x: originX + ((index % 4) - 1.5) * TILE_SIZE * 3,
      y: originY + (Math.floor(index / 4) - 1) * TILE_SIZE * 3,
      startTime: now,
      duration: EXPLOSION_DURATION_MS,
      maxRadius: TILE_SIZE * (1.2 + (index % 3) * 0.4),
      loop: true
    })
  }
}

function buildCamera(spawnedUnits) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const unit of spawnedUnits) {
    minX = Math.min(minX, unit.x)
    maxX = Math.max(maxX, unit.x + TILE_SIZE)
    minY = Math.min(minY, unit.y)
    maxY = Math.max(maxY, unit.y + TILE_SIZE)
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    maxX = TILE_SIZE
    minY = 0
    maxY = TILE_SIZE
  }
  return {
    minWorldX: minX,
    maxWorldX: maxX,
    minWorldY: minY,
    maxWorldY: maxY,
    focusY: (minY + maxY) / 2
  }
}

export function setupHeavyBattleScenario(options = {}) {
  const game = getCurrentGame()
  if (!game) throw new Error('Game instance not available')

  const unitCount = clampHeavyBattleUnitCount(options.unitCount)
  const perPlayer = Math.floor(unitCount / HEAVY_BATTLE_PLAYERS.length)
  const rows = Math.max(1, Math.ceil(perPlayer / COLUMNS_PER_PLAYER))
  const seed = options.seed ?? gameState.mapSeed ?? '11'

  gameState.playerCount = 4
  gameState.humanPlayer = 'player1'
  gameState.speedMultiplier = 1
  game.resetGame()
  units.length = 0

  const mapWidth = mapGrid[0]?.length || 0
  const mapHeight = mapGrid.length || 0
  const centerX = Math.floor(mapWidth / 2)
  const centerY = Math.floor(mapHeight / 2)

  gameState.money = 50000
  gameState.gameTime = 0
  gameState.frameCount = 0
  gameState.unitWrecks = []
  gameState.smokeParticles = []
  gameState.smokeParticlePool = []
  gameState.dustParticles = []
  gameState.explosions = []
  gameState.benchmarkActive = true
  gameState.heavyBattleBenchmark = true
  gameState.shadowOfWarEnabled = true
  gameState.gamePaused = false
  gameState.gameStarted = true
  gameState.fpsVisible = true
  if (options.uncapped !== false) gameState.frameLimiterEnabled = false

  factories.forEach(factory => {
    factory.budget = 50000
    factory.rallyPoint = null
  })
  gameState.buildings.length = 0
  gameState.buildings.push(...factories)

  armDeterministicRng(String(seed))
  const used = new Set()
  const byPlayer = new Map(HEAVY_BATTLE_PLAYERS.map(playerId => [playerId, []]))

  try {
    HEAVY_BATTLE_PLAYERS.forEach((playerId, playerIndex) => {
      const factory = factories.find(entry => entry.owner === playerId)
      if (!factory) return
      const origin = playerOrigin(playerIndex, centerX, centerY, rows)
      for (let index = 0; index < perPlayer; index++) {
        const column = index % COLUMNS_PER_PLAYER
        const row = Math.floor(index / COLUMNS_PER_PLAYER)
        const preferredX = origin.x + column * COLUMN_STRIDE
        const preferredY = origin.y + row * ROW_STRIDE
        const tile = findOpenTile(preferredX, preferredY, used)
        if (!tile) continue
        const type = HEAVY_BATTLE_TYPES[index % HEAVY_BATTLE_TYPES.length]
        const unit = createUnit(factory, type, tile.x, tile.y)
        unit.x = tile.x * TILE_SIZE
        unit.y = tile.y * TILE_SIZE
        unit.tileX = tile.x
        unit.tileY = tile.y
        unit.direction = origin.facing
        unit.turretDirection = origin.facing
        unit.guardMode = false
        unit.alertMode = false
        unit.allowedToAttack = true
        unit.heavyBattleFront = column >= COLUMNS_PER_PLAYER / 2 && playerIndex % 2 === 0
          || column < COLUMNS_PER_PLAYER / 2 && playerIndex % 2 === 1
        if (index % 5 === 0 && unit.maxHealth > 0) {
          unit.health = Math.max(1, unit.maxHealth * 0.2)
        }
        unit.id = `${playerId}_heavy_${index}`
        units.push(unit)
        byPlayer.get(playerId).push(unit)
      }
    })

    const pairs = [['player1', 'player2'], ['player2', 'player1'], ['player3', 'player4'], ['player4', 'player3']]
    for (const [playerId, enemyId] of pairs) {
      const army = byPlayer.get(playerId) || []
      const enemy = byPlayer.get(enemyId) || []
      army.forEach((unit, index) => {
        const target = enemy[index % enemy.length]
        if (!target) return
        unit.target = target
        if (!unit.heavyBattleFront) {
          unit.moveTarget = {
            x: target.tileX,
            y: target.tileY
          }
        }
      })
    }

    const now = 0
    seedSmoke(now)
    seedDust(now)
    seedExplosions(now)
  } finally {
    restoreDeterministicRng()
  }

  initializeShadowOfWar(gameState, mapGrid)
  gameState.occupancyMap = initializeOccupancyMap(units, mapGrid, getTextureManager())
  updateDangerZoneMaps(gameState)
  gameState.heavyBattleCamera = buildCamera(units)
  gameState.heavyBattleUnitCount = units.length
  return {
    unitCount: units.length,
    camera: gameState.heavyBattleCamera,
    smoke: gameState.smokeParticles.length,
    dust: gameState.dustParticles.length,
    explosions: gameState.explosions.length
  }
}

export function stepHeavyBattleCamera(now, viewportWidth = 800, viewportHeight = 600) {
  if (!gameState.heavyBattleBenchmark || !gameState.heavyBattleCamera) return false
  const camera = gameState.heavyBattleCamera
  if (!Number.isFinite(gameState.heavyBattleCameraStartedAt)) {
    gameState.heavyBattleCameraStartedAt = now
  }
  const mapWidthPx = (mapGrid[0]?.length || 0) * TILE_SIZE
  const mapHeightPx = mapGrid.length * TILE_SIZE
  const viewWidth = Math.max(1, viewportWidth)
  const viewHeight = Math.max(1, viewportHeight)
  const maxScrollX = Math.max(0, mapWidthPx - viewWidth)
  const maxScrollY = Math.max(0, mapHeightPx - viewHeight)
  const margin = TILE_SIZE * 2
  const minScrollX = clamp(camera.minWorldX - margin, 0, maxScrollX)
  const sweepMaxX = clamp(camera.maxWorldX - viewWidth + margin, minScrollX, maxScrollX)
  const elapsed = now - gameState.heavyBattleCameraStartedAt
  gameState.scrollOffset.x = heavyBattleScrollX(elapsed, minScrollX, sweepMaxX)
  gameState.scrollOffset.y = clamp(camera.focusY - viewHeight / 2, 0, maxScrollY)
  return true
}

export function teardownHeavyBattleScenario() {
  gameState.heavyBattleBenchmark = false
  gameState.benchmarkActive = false
  gameState.heavyBattleCamera = null
  restoreDeterministicRng()
}
