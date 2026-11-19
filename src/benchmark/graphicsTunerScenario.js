import { createBuilding, placeBuilding, updatePowerSupply } from '../buildings.js'
import { TILE_SIZE, setMapDimensions } from '../config.js'
import { initSpatialQuadtree } from '../game/spatialQuadtree.js'
import { clearTrackMarks } from '../game/trackMarks.js'
import { clearPathCache } from '../game/pathCache.js'
import { clearFlowFields } from '../game/flowField.js'
import { gameState } from '../gameState.js'
import { selectedUnits } from '../inputHandler.js'
import { mapGrid, factories, units, bullets } from '../main.js'
import { createUnit, initializeOccupancyMap } from '../units.js'
import { deterministicRNG } from '../utils/gameRandom.js'
import { navalUnitTypes } from '../utils/navalUtils.js'
import {
  GRAPHICS_AIR_TYPES, GRAPHICS_TANK_TYPES, GRAPHICS_BATTLE_MAP,
  graphicsBattleLayout, graphicsBattleTerrain, validateGraphicsBattleLayout
} from './graphicsTunerLayout.js'

function chooseTarget(unit, candidates) {
  let nearest = null
  let distance = Infinity
  for (const other of candidates) {
    const nextDistance = Math.hypot(unit.x - other.x, unit.y - other.y)
    if (nextDistance < distance) {
      nearest = other
      distance = nextDistance
    }
  }
  return nearest
}

export function setupGraphicsBattle(textureManager) {
  const layout = graphicsBattleLayout()
  validateGraphicsBattleLayout(layout)
  deterministicRNG.setSeed('graphics-tuner-coast-1')
  deterministicRNG.enable()
  clearTrackMarks()
  clearPathCache()
  clearFlowFields()
  const { width, height } = GRAPHICS_BATTLE_MAP
  setMapDimensions(width, height)
  mapGrid.length = 0
  factories.length = 0
  units.length = 0
  bullets.length = 0
  selectedUnits.length = 0
  Object.assign(gameState, {
    mapTilesX: width, mapTilesY: height, mapSeed: 'graphics-tuner-coast-1',
    gameStarted: true, gamePaused: false, gameOver: false, shadowOfWarEnabled: false,
    playerCount: 2, humanPlayer: 'player1', speedMultiplier: 1, playerUnitsDestroyed: 0, enemyUnitsDestroyed: 0,
    partyStates: [{ partyId: 'player1', owner: 'Coastal base', aiActive: false }, { partyId: 'player2', owner: 'Raiding force', aiActive: false }],
    money: 20000, simulationTime: 0, gameTime: 0, frameCount: 0, lastOreUpdate: 0,
    units, factories, mapGrid, buildings: [], explosions: [], smokeParticles: [], smokeParticlePool: [], dustParticles: [],
    mines: [], waterMines: [], depthCharges: [], shipWakes: [], unitWrecks: [], fires: [], targetedOreTiles: {},
    buildingsUnderRepair: [], buildingsAwaitingRepair: [], isSpectator: false, localPlayerDefeated: false,
    lastGlobalAttackDecision: 0, globalAttackPoint: null
  })
  for (let y = 0; y < height; y++) {
    mapGrid.push(Array.from({ length: width }, (_, x) => ({
      x, y, type: graphicsBattleTerrain(x, y), biome: 'grass', ore: x >= 8 && x <= 10 && y >= 11 && y <= 15 ? 6 : 0
    })))
  }
  gameState.occupancyMap = null
  const production = new Map()
  layout.structures.forEach(({ type, x, y, owner }, index) => {
    const building = Object.assign(createBuilding(type, x, y), {
      id: type === 'constructionYard' ? owner : `tuner-building-${index}`,
      owner, constructionFinished: true, constructionStartTime: -10000, budget: 0
    })
    placeBuilding(building, mapGrid, null, { recordTransition: false })
    if (type === 'constructionYard') factories.push(building)
    else gameState.buildings.push(building)
    production.set(type, building)
  })
  layout.spawns.forEach(({ type, x, y, owner }, index) => {
    const isAir = GRAPHICS_AIR_TYPES.includes(type)
    const stationType = type === 'apache' ? 'helipad' : isAir ? 'airstrip' : navalUnitTypes.includes(type) ? 'shipyard' : 'vehicleFactory'
    const station = owner === 'player1' ? production.get(stationType) : { owner, type: stationType }
    const unit = createUnit(station, type, x, y, { id: `tuner-unit-${index}`, replaySpawnOrdinal: index })
    unit.direction = owner === 'player1' ? 0 : Math.PI
    unit.rotation = unit.direction
    unit.turretDirection = unit.direction
    unit.allowedToAttack = true
    unit.lastShotTime = -5000 + index * 57
    if (isAir) {
      unit.flightState = 'airborne'
      unit.altitude = unit.targetAltitude = unit.maxAltitude
      unit.manualFlightState = type === 'apache' ? 'hover' : 'auto'
      unit.autoHoldAltitude = true
      unit.hovering = type === 'apache'
      unit.airborneSince = 0
      if (type === 'f22Raptor' || type === 'f35') unit.f22State = 'airborne'
      if (unit.rotor) unit.rotor.speed = 0.12
    }
    if (owner === 'player1' && x >= 24) {
      unit.selected = true
      selectedUnits.push(unit)
    }
    if (GRAPHICS_TANK_TYPES.includes(type) && x >= 39 && index % 4 === 0) unit.health = unit.maxHealth * 0.22
    units.push(unit)
  })
  for (const unit of units) {
    if (!unit.isAirUnit && !unit.isNaval && unit.tileX < 39) continue
    const opponents = units.filter(other => other.owner !== unit.owner &&
      (unit.isNaval ? other.isNaval : !other.isAirUnit && !other.isNaval && other.tileX >= 39))
    unit.target = chooseTarget(unit, opponents)
  }
  textureManager.invalidateDecorationLayout()
  gameState.occupancyMap = initializeOccupancyMap(units, mapGrid)
  initSpatialQuadtree(width * TILE_SIZE, height * TILE_SIZE)
  updatePowerSupply([...gameState.buildings, ...factories], gameState)
  gameState.radarActive = gameState.playerPowerSupply >= 0
}
