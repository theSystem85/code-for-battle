import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { productionQueue } from '../productionQueue.js'
import { units as mainUnits, factories as mainFactories, mapGrid as mainMapGrid } from '../main.js'
import { collectTransitionsSince, pruneTransitionsUpTo } from './transitionCollector.js'
import { getSupportedProtocolVersion } from './validate.js'
import { getLlmQueueState } from './applier.js'

function toWorldPosition(x, y) {
  return { x, y, space: 'world' }
}

function toTilePosition(x, y) {
  return { x, y, space: 'tile' }
}

function unitToSnapshot(unit) {
  const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

  // Build compact status — only include non-null / non-default properties
  const status = {}
  if (Number.isFinite(unit.ammo)) status.ammo = unit.ammo
  if (Number.isFinite(unit.gas)) status.fuel = unit.gas
  if (unit.crew) status.crew = unit.crew
  if (unit.isAirUnit) status.isAirUnit = true

  // Build compact orders — only include when there is an active order
  const orders = {}
  if (unit.moveTarget) orders.moveTarget = toTilePosition(unit.moveTarget.x, unit.moveTarget.y)
  if (unit.target) orders.targetId = unit.target.id

  const snapshot = {
    id: unit.id,
    type: unit.type,
    owner: unit.owner,
    health: unit.health,
    maxHealth: unit.maxHealth,
    tilePosition: toTilePosition(tileX, tileY)
  }
  if (Object.keys(status).length > 0) snapshot.status = status
  if (Object.keys(orders).length > 0) snapshot.orders = orders
  return snapshot
}

function buildingToSnapshot(building) {
  const snapshot = {
    id: building.id,
    type: building.type,
    owner: building.owner,
    health: building.health,
    maxHealth: building.maxHealth,
    tilePosition: toTilePosition(building.x, building.y),
    size: { width: building.width, height: building.height },
    constructionFinished: Boolean(building.constructionFinished)
  }
  // Only include rallyPoint when set — omitting null saves tokens
  if (building.rallyPoint) {
    snapshot.rallyPoint = toWorldPosition(building.rallyPoint.x, building.rallyPoint.y)
  }
  return snapshot
}

function collectMapSnapshot(mapGrid, verbosity) {
  if (verbosity !== 'full' || !Array.isArray(mapGrid) || mapGrid.length === 0) {
    return undefined
  }
  const oreTiles = []
  const obstacles = []
  mapGrid.forEach((row, y) => {
    if (!Array.isArray(row)) return
    row.forEach((tile, x) => {
      if (!tile) return
      if (tile.ore) {
        oreTiles.push({ x, y })
      }
      if (tile.type === 'water' || tile.type === 'rock' || tile.seedCrystal) {
        obstacles.push({ x, y, type: tile.type })
      }
    })
  })
  return { oreTiles, obstacles }
}

/**
 * Aggregate damage transition events by target to dramatically reduce token count.
 * Multiple individual hits against the same target are merged into one entry with
 * the total damage amount. Non-damage events are kept verbatim.
 */
function compactTransitions(transitions) {
  if (!transitions || !Array.isArray(transitions.events)) return transitions

  const nonDamageEvents = []
  /** @type {Map<string, {id: string, type: string, tick: number, targetId: string, targetKind: string, amount: number}>} */
  const damageByTarget = new Map()

  for (const event of transitions.events) {
    if (event.type === 'damage') {
      const key = event.targetId
      if (!damageByTarget.has(key)) {
        damageByTarget.set(key, {
          id: event.id,
          type: 'damage',
          tick: event.tick,
          targetId: event.targetId,
          targetKind: event.targetKind,
          amount: 0
        })
      }
      damageByTarget.get(key).amount += event.amount
    } else {
      nonDamageEvents.push(event)
    }
  }

  return {
    ...transitions,
    events: [...nonDamageEvents, ...Array.from(damageByTarget.values())]
  }
}

export function exportGameTickInput(state = gameState, sinceTick = 0, options = {}) {
  const units = options.units || mainUnits || state.units || []
  const buildings = options.buildings || state.buildings || []
  const factories = options.factories || mainFactories || []
  const mapGrid = options.mapGrid || state.mapGrid || mainMapGrid || []
  const verbosity = options.verbosity || 'normal'

  const playerId = options.playerId || state.humanPlayer || 'player1'
  const matchId = options.matchId || state.gameInstanceId || 'local'
  const tick = Number.isFinite(options.tick) ? options.tick : state.frameCount

  const uniqueBuildings = new Map()
  buildings.forEach(building => {
    if (building && building.id) uniqueBuildings.set(building.id, building)
  })
  factories.forEach(factory => {
    if (factory && factory.id && !uniqueBuildings.has(factory.id)) {
      uniqueBuildings.set(factory.id, factory)
    }
  })

  const snapshotBuildings = Array.from(uniqueBuildings.values()).map(buildingToSnapshot)
  const snapshotUnits = Array.isArray(units) ? units.map(unitToSnapshot) : []

  const isHumanPlayer = playerId === state.humanPlayer ||
    (state.humanPlayer === 'player1' && playerId === 'player')
  const powerSnapshot = isHumanPlayer
    ? {
      supply: state.playerPowerSupply ?? state.powerSupply ?? 0,
      production: state.playerTotalPowerProduction ?? 0,
      consumption: state.playerPowerConsumption ?? 0
    }
    : {
      supply: state.enemyPowerSupply ?? 0,
      production: state.enemyTotalPowerProduction ?? 0,
      consumption: state.enemyPowerConsumption ?? 0
    }

  const buildQueues = productionQueue.getSerializableState()

  // Include LLM production queue state so the LLM knows what's already
  // queued, in-progress, or completed — preventing duplicate commands.
  const llmQueue = getLlmQueueState(state, playerId)

  const transitions = compactTransitions(collectTransitionsSince(sinceTick))
  if (options.pruneTransitions !== false) {
    pruneTransitionsUpTo(sinceTick)
  }

  return {
    protocolVersion: getSupportedProtocolVersion(),
    matchId,
    playerId,
    tick,
    sinceTick,
    verbosity,
    meta: {
      tilesX: state.mapTilesX,
      tilesY: state.mapTilesY,
      tileSize: TILE_SIZE,
      coordinateSystem: {
        tileOrigin: 'top-left',
        worldOrigin: 'top-left',
        worldUnits: 'pixels'
      },
      fogOfWarEnabled: Boolean(state.shadowOfWarEnabled),
      catalogVersion: options.catalogVersion || state.catalogVersion || 'default'
    },
    snapshot: {
      resources: {
        money: state.money ?? 0,
        power: powerSnapshot
      },
      units: snapshotUnits,
      buildings: snapshotBuildings,
      buildQueues,
      llmQueue,
      map: collectMapSnapshot(mapGrid, verbosity)
    },
    transitions,
    constraints: {
      maxActionsPerTick: options.maxActionsPerTick ?? 50,
      allowQueuedCommands: options.allowQueuedCommands ?? true,
      maxQueuedCommands: options.maxQueuedCommands ?? 20
    }
  }
}
