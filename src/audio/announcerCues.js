import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { isPositionVisibleToPlayer } from '../game/shadowOfWar.js'
import { playSound } from '../sound.js'

const ENEMY_SPOTTED_COOLDOWN_MS = 45000
const LOW_FUEL_COOLDOWN_MS = 20000
const seenEnemyIds = new Set()
let lastEnemySpottedAt = 0
let lastLowFuelAt = 0
let powerPrimed = false
let lastLowEnergy = null
let lastRadar = null

function isHuman(owner) {
  const human = gameState.humanPlayer || 'player1'
  return owner === human || (human === 'player1' && owner === 'player')
}

export function resetAnnouncerCuesForTests() {
  seenEnemyIds.clear()
  lastEnemySpottedAt = 0
  lastLowFuelAt = 0
  powerPrimed = false
  lastLowEnergy = null
  lastRadar = null
}

export function syncPowerAnnouncements(state = gameState) {
  if (!state?.gameStarted) return
  const low = Boolean(state.lowEnergyMode)
  const radar = Boolean(state.radarActive)
  if (!powerPrimed) {
    powerPrimed = true
    lastLowEnergy = low
    lastRadar = radar
    return
  }
  if (low !== lastLowEnergy) {
    lastLowEnergy = low
    if (low) {
      playSound('lowPowerAlarm', 0.8)
      playSound('lowPower', 1, 30, true)
    } else {
      playSound('powerRestored', 1, 8, true)
    }
  }
  if (radar !== lastRadar) {
    lastRadar = radar
    if (radar) {
      playSound('radarOnline', 0.7)
      playSound('radarOnlineVO', 1, 8, true)
    } else {
      playSound('radarOffline', 0.7)
      playSound('radarOfflineVO', 1, 8, true)
    }
  }
}

export function announceAircraftLowFuel(unit, now = Date.now()) {
  if (!unit || !isHuman(unit.owner) || unit.lowFuelAnnounced) return false
  if (now - lastLowFuelAt < LOW_FUEL_COOLDOWN_MS) return false
  unit.lowFuelAnnounced = true
  lastLowFuelAt = now
  playSound('aircraftLowFuel', 1, 0, true)
  return true
}

export function announceInsufficientFunds() {
  playSound('insufficientFunds', 1, 25, true)
}

// Newly visible enemy contacts. Already-seen ids are a Set lookup; hidden
// contacts are checked only until the first time they enter view.
export function noteVisibleEnemies(units, buildings, now = Date.now()) {
  if (!gameState.shadowOfWarEnabled || !gameState.gameStarted || gameState.gamePaused) return
  const ready = now - lastEnemySpottedAt >= ENEMY_SPOTTED_COOLDOWN_MS
  let announce = false
  const visit = (entity, x, y) => {
    if (!entity || entity.health <= 0 || isHuman(entity.owner)) return
    const id = entity.id
    if (id == null || seenEnemyIds.has(id)) return
    if (!isPositionVisibleToPlayer(gameState, gameState.mapGrid, x, y)) return
    seenEnemyIds.add(id)
    if (ready) announce = true
  }
  if (Array.isArray(units)) {
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]
      if (!unit) continue
      visit(unit, (unit.x || 0) + TILE_SIZE / 2, (unit.y || 0) + TILE_SIZE / 2)
    }
  }
  if (Array.isArray(buildings)) {
    for (let i = 0; i < buildings.length; i++) {
      const building = buildings[i]
      if (!building) continue
      const x = ((building.x || 0) + (building.width || 1) / 2) * TILE_SIZE
      const y = ((building.y || 0) + (building.height || 1) / 2) * TILE_SIZE
      visit(building, x, y)
    }
  }
  if (announce) {
    lastEnemySpottedAt = now
    playSound('enemySpotted', 1, 0, true)
  }
}
