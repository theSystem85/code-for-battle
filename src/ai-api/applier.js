import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { buildingData, canPlaceBuilding, repairBuilding } from '../buildings.js'
import { unitCosts } from '../units.js'
import { units as mainUnits, factories as mainFactories, mapGrid as mainMapGrid } from '../main.js'
import { validateGameTickOutput } from './validate.js'
import { findBuildingPosition } from '../ai/enemyBuilding.js'

const vehicleUnitTypes = [
  'tank',
  'tank-v2',
  'rocketTank',
  'tank_v1',
  'tank-v3',
  'harvester',
  'ambulance',
  'tankerTruck',
  'ammunitionTruck',
  'recoveryTank',
  'howitzer',
  'mineLayer',
  'mineSweeper'
]

/**
 * Ensure the LLM build queue structures exist on the strategic state.
 */
function ensureLlmQueues(state) {
  if (!state.llmStrategic) {
    state.llmStrategic = {
      lastTickAt: 0,
      lastTickFrame: 0,
      pending: false,
      lastSummary: '',
      plansByPlayer: {},
      summariesByPlayer: {},
      bootstrappedByPlayer: {},
      responseIdsByPlayer: {}
    }
  }
  if (!state.llmStrategic.buildQueuesByPlayer) {
    state.llmStrategic.buildQueuesByPlayer = {}
  }
  if (!state.llmStrategic.unitQueuesByPlayer) {
    state.llmStrategic.unitQueuesByPlayer = {}
  }
}

/**
 * Compute the set of building types available to a given owner based on tech tree.
 * Mirrors the logic in productionControllerTechTree.syncTechTreeWithBuildings.
 */
export function computeAvailableBuildingTypes(buildings, factories, owner) {
  // Start with the base set every player has
  const available = new Set([
    'constructionYard', 'oreRefinery', 'powerPlant', 'vehicleFactory',
    'vehicleWorkshop', 'radarStation', 'hospital', 'helipad',
    'gasStation', 'turretGunV1', 'concreteWall'
  ])
  const owned = [...buildings, ...factories].filter(b => b.owner === owner && b.health > 0)
  const hasRadar = owned.some(b => b.type === 'radarStation')
  const hasFactory = owned.some(b => b.type === 'vehicleFactory')
  if (hasFactory) available.add('ammunitionFactory')
  if (hasRadar) {
    available.add('turretGunV2')
    available.add('turretGunV3')
    available.add('rocketTurret')
    available.add('teslaCoil')
    available.add('artilleryTurret')
  }
  return available
}

/**
 * Compute the set of unit types available to a given owner based on tech tree.
 * Mirrors the logic in productionControllerTechTree.syncTechTreeWithBuildings.
 */
export function computeAvailableUnitTypes(buildings, factories, owner) {
  const available = new Set()
  const owned = [...buildings, ...factories].filter(b => b.owner === owner && b.health > 0)
  const hasFactory = owned.some(b => b.type === 'vehicleFactory')
  const hasRefinery = owned.some(b => b.type === 'oreRefinery')
  const hasGasStation = owned.some(b => b.type === 'gasStation')
  const hasHospital = owned.some(b => b.type === 'hospital')
  const hasWorkshop = owned.some(b => b.type === 'vehicleWorkshop')
  const hasAmmunitionFactory = owned.some(b => b.type === 'ammunitionFactory')
  const hasHelipad = owned.some(b => b.type === 'helipad')
  const hasRocketTurret = owned.some(b => b.type === 'rocketTurret')
  const hasArtilleryTurret = owned.some(b => b.type === 'artilleryTurret')
  const hasRadar = owned.some(b => b.type === 'radarStation')
  const factoryCount = owned.filter(b => b.type === 'vehicleFactory').length
  if (hasFactory) {
    available.add('tank')
    available.add('tank_v1')
  }
  if (hasFactory && hasRefinery) available.add('harvester')
  if (hasFactory && hasGasStation) available.add('tankerTruck')
  if (hasFactory && hasAmmunitionFactory) available.add('ammunitionTruck')
  if (hasHospital) available.add('ambulance')
  if (hasFactory && hasWorkshop) {
    available.add('recoveryTank')
    available.add('mineSweeper')
  }
  if (hasFactory && hasWorkshop && hasAmmunitionFactory) available.add('mineLayer')
  if (hasHelipad) available.add('apache')
  if (factoryCount >= 2) available.add('tank-v3')
  if (hasRocketTurret) available.add('rocketTank')
  if (hasRadar) {
    available.add('tank-v2')
    if (hasFactory && hasArtilleryTurret) available.add('howitzer')
  }
  return available
}

function toTilePosition(position) {
  if (!position) return null
  if (position.space === 'tile') {
    return { x: Math.floor(position.x), y: Math.floor(position.y) }
  }
  return {
    x: Math.floor(position.x / TILE_SIZE),
    y: Math.floor(position.y / TILE_SIZE)
  }
}

function toWorldPosition(position) {
  if (!position) return null
  if (position.space === 'world') {
    return { x: position.x, y: position.y }
  }
  return {
    x: position.x * TILE_SIZE + TILE_SIZE / 2,
    y: position.y * TILE_SIZE + TILE_SIZE / 2
  }
}

function findEntityById(units, buildings, factories, id) {
  return (
    units.find(u => u.id === id) ||
    buildings.find(b => b.id === id) ||
    factories.find(f => f.id === id)
  )
}

function findBuildingById(buildings, factories, id) {
  return buildings.find(b => b.id === id) || factories.find(f => f.id === id)
}

function resolveFactoryForUnit({ unitType, factoryId, buildings, factories, owner }) {
  const allBuildings = [...buildings, ...factories]
  if (factoryId) {
    const explicit = allBuildings.find(b => b.id === factoryId)
    return explicit || null
  }
  if (unitType === 'apache') {
    return allBuildings.find(b => b.type === 'helipad' && b.owner === owner) || null
  }
  if (vehicleUnitTypes.includes(unitType)) {
    return allBuildings.find(b => b.type === 'vehicleFactory' && b.owner === owner) || null
  }
  return allBuildings.find(b => b.type === 'constructionYard' && b.owner === owner) || null
}

export function applyGameTickOutput(state = gameState, output, options = {}) {
  const validation = validateGameTickOutput(output)
  const accepted = []
  const rejected = []

  if (!validation.ok) {
    return {
      accepted,
      rejected: [
        {
          actionId: 'schema',
          reason: 'INVALID_SCHEMA',
          details: validation.errors
        }
      ]
    }
  }

  const units = options.units || mainUnits || state.units || []
  const buildings = options.buildings || state.buildings || []
  const factories = options.factories || mainFactories || []
  const _mapGrid = options.mapGrid || state.mapGrid || mainMapGrid || []
  const owner = options.playerId || state.humanPlayer || 'player1'
  const seenActionIds = new Set()
  const overrideMoney = Number.isFinite(options.money)
  let availableMoney = overrideMoney ? options.money : (state.money ?? 0)
  const updateMoney = (delta) => {
    availableMoney += delta
    if (!overrideMoney) {
      state.money = availableMoney
    }
    if (typeof options.onMoneyChange === 'function') {
      options.onMoneyChange(availableMoney)
    }
  }

  output.actions.forEach(action => {
    if (seenActionIds.has(action.actionId)) {
      rejected.push({ actionId: action.actionId, reason: 'DUPLICATE_ACTION' })
      return
    }
    seenActionIds.add(action.actionId)

    switch (action.type) {
      case 'build_place': {
        const tilePos = toTilePosition(action.tilePosition)
        if (!tilePos) {
          rejected.push({ actionId: action.actionId, reason: 'INVALID_ACTION' })
          return
        }
        const buildingInfo = buildingData[action.buildingType]
        if (!buildingInfo) {
          rejected.push({ actionId: action.actionId, reason: 'UNKNOWN_ENTITY' })
          return
        }
        // Enforce tech tree for non-human players
        const availableBuildings = computeAvailableBuildingTypes(buildings, factories, owner)
        if (!availableBuildings.has(action.buildingType)) {
          rejected.push({ actionId: action.actionId, reason: 'TECH_TREE_LOCKED' })
          return
        }
        const cost = buildingInfo.cost || 0
        if (availableMoney < cost) {
          rejected.push({ actionId: action.actionId, reason: 'NOT_ENOUGH_RESOURCES' })
          return
        }
        // Queue the building for sequential construction instead of placing instantly.
        // Buildings will be constructed one at a time with timers, just like the
        // player and local AI. The actual placement (with fallback position
        // finding) happens when construction completes in the AI update loop.
        ensureLlmQueues(state)
        if (!state.llmStrategic.buildQueuesByPlayer[owner]) {
          state.llmStrategic.buildQueuesByPlayer[owner] = []
        }
        // Reject if this building type is already queued or in progress
        const existingBuild = state.llmStrategic.buildQueuesByPlayer[owner].find(
          item => item.buildingType === action.buildingType &&
            (item.status === 'queued' || item.status === 'building')
        )
        if (existingBuild) {
          rejected.push({ actionId: action.actionId, reason: 'ALREADY_QUEUED' })
          return
        }
        state.llmStrategic.buildQueuesByPlayer[owner].push({
          buildingType: action.buildingType,
          tilePosition: tilePos,
          rallyPoint: action.rallyPoint ? toWorldPosition(action.rallyPoint) : null,
          cost,
          status: 'queued'
        })
        updateMoney(-cost)
        accepted.push({ actionId: action.actionId, type: action.type, queued: true })
        return
      }
      case 'build_queue': {
        const unitType = action.unitType
        if (!unitCosts[unitType]) {
          rejected.push({ actionId: action.actionId, reason: 'UNKNOWN_ENTITY' })
          return
        }
        // Enforce tech tree
        const availableUnits = computeAvailableUnitTypes(buildings, factories, owner)
        if (!availableUnits.has(unitType)) {
          rejected.push({ actionId: action.actionId, reason: 'TECH_TREE_LOCKED' })
          return
        }
        const factory = resolveFactoryForUnit({
          unitType,
          factoryId: action.factoryId,
          buildings,
          factories,
          owner
        })
        if (!factory) {
          rejected.push({ actionId: action.actionId, reason: 'UNKNOWN_ENTITY' })
          return
        }
        if (unitType === 'apache' && factory.type !== 'helipad') {
          rejected.push({ actionId: action.actionId, reason: 'WRONG_FACTORY' })
          return
        }
        if (vehicleUnitTypes.includes(unitType) && factory.type !== 'vehicleFactory') {
          rejected.push({ actionId: action.actionId, reason: 'WRONG_FACTORY' })
          return
        }
        const count = Math.max(1, Math.floor(action.count || 1))
        const totalCost = unitCosts[unitType] * count
        if (availableMoney < totalCost) {
          rejected.push({ actionId: action.actionId, reason: 'NOT_ENOUGH_RESOURCES' })
          return
        }
        const rallyPoint = action.rallyPoint ? toWorldPosition(action.rallyPoint) : null
        // Queue units for sequential production instead of spawning instantly.
        // Units will be produced one at a time with timers, just like the
        // player and local AI.
        ensureLlmQueues(state)
        if (!state.llmStrategic.unitQueuesByPlayer[owner]) {
          state.llmStrategic.unitQueuesByPlayer[owner] = []
        }
        for (let i = 0; i < count; i++) {
          state.llmStrategic.unitQueuesByPlayer[owner].push({
            unitType,
            factoryId: factory.id,
            rallyPoint,
            cost: unitCosts[unitType],
            status: 'queued'
          })
        }
        updateMoney(-totalCost)
        accepted.push({ actionId: action.actionId, type: action.type, queued: true, count })
        return
      }
      case 'unit_command': {
        const targetPos = action.targetPos ? toTilePosition(action.targetPos) : null
        const worldTarget = action.targetPos ? toWorldPosition(action.targetPos) : null
        const target = action.targetId
          ? findEntityById(units, buildings, factories, action.targetId)
          : null
        const selectedUnits = action.unitIds
          .map(id => units.find(u => u.id === id))
          .filter(u => u && u.owner === owner)
        if (selectedUnits.length === 0) {
          rejected.push({ actionId: action.actionId, reason: 'UNKNOWN_ENTITY' })
          return
        }

        if (action.command === 'move') {
          if (!targetPos) {
            rejected.push({ actionId: action.actionId, reason: 'INVALID_TARGET' })
            return
          }
          if (action.queueMode === 'append') {
            selectedUnits.forEach(unit => {
              unit.commandQueue = unit.commandQueue || []
              unit.commandQueue.push({ type: 'move', x: worldTarget.x, y: worldTarget.y })
            })
          } else {
            selectedUnits.forEach(unit => {
              unit.moveTarget = { x: targetPos.x, y: targetPos.y }
              unit.target = null
              unit.guardTarget = null
              unit.guardMode = false
            })
          }
          accepted.push({ actionId: action.actionId, type: action.type, unitIds: action.unitIds })
          return
        }

        if (action.command === 'attack') {
          if (action.queueMode === 'append') {
            if (!target) {
              rejected.push({ actionId: action.actionId, reason: 'INVALID_TARGET' })
              return
            }
            selectedUnits.forEach(unit => {
              unit.commandQueue = unit.commandQueue || []
              unit.commandQueue.push({ type: 'attack', target })
              unit.allowedToAttack = true
            })
          } else if (target) {
            selectedUnits.forEach(unit => {
              unit.target = target
              unit.allowedToAttack = true
              unit.moveTarget = null
              unit.guardTarget = null
              unit.guardMode = false
            })
          } else if (targetPos) {
            selectedUnits.forEach(unit => {
              unit.moveTarget = { x: targetPos.x, y: targetPos.y }
              unit.allowedToAttack = true
              unit.target = null
            })
          } else {
            rejected.push({ actionId: action.actionId, reason: 'INVALID_TARGET' })
            return
          }
          accepted.push({ actionId: action.actionId, type: action.type, unitIds: action.unitIds })
          return
        }

        if (action.command === 'stop') {
          selectedUnits.forEach(unit => {
            unit.path = null
            unit.moveTarget = null
            unit.target = null
            unit.attackTarget = null
            unit.guardTarget = null
            unit.guardMode = false
            unit.commandQueue = []
            unit.currentCommand = null
          })
          accepted.push({ actionId: action.actionId, type: action.type, unitIds: action.unitIds })
          return
        }

        if (action.command === 'hold') {
          selectedUnits.forEach(unit => {
            unit.holdFire = true
            unit.target = null
            unit.moveTarget = null
          })
          accepted.push({ actionId: action.actionId, type: action.type, unitIds: action.unitIds })
          return
        }

        if (action.command === 'guard') {
          if (!target) {
            rejected.push({ actionId: action.actionId, reason: 'INVALID_TARGET' })
            return
          }
          selectedUnits.forEach(unit => {
            unit.guardTarget = target
            unit.guardMode = true
            unit.target = null
            unit.moveTarget = null
          })
          accepted.push({ actionId: action.actionId, type: action.type, unitIds: action.unitIds })
          return
        }

        rejected.push({ actionId: action.actionId, reason: 'NOT_SUPPORTED' })
        return
      }
      case 'set_rally': {
        const building = findBuildingById(buildings, factories, action.buildingId)
        if (!building || building.owner !== owner) {
          rejected.push({ actionId: action.actionId, reason: 'UNKNOWN_ENTITY' })
          return
        }
        const rallyPoint = toWorldPosition(action.rallyPoint)
        building.rallyPoint = rallyPoint
        accepted.push({ actionId: action.actionId, type: action.type })
        return
      }
      case 'cancel':
      case 'ability':
        rejected.push({ actionId: action.actionId, reason: 'NOT_SUPPORTED' })
        break
      case 'sell_building': {
        const building = findBuildingById(buildings, factories, action.buildingId)
        if (!building || building.owner !== owner) {
          rejected.push({ actionId: action.actionId, reason: 'UNKNOWN_ENTITY' })
          return
        }
        if (building.isBeingSold) {
          rejected.push({ actionId: action.actionId, reason: 'ALREADY_SELLING' })
          return
        }
        // Cannot sell the construction yard
        if (building.type === 'constructionYard') {
          rejected.push({ actionId: action.actionId, reason: 'PROTECTED_BUILDING' })
          return
        }
        const bData = buildingData[building.type]
        if (!bData || !bData.cost) {
          rejected.push({ actionId: action.actionId, reason: 'UNKNOWN_ENTITY' })
          return
        }
        const sellValue = Math.floor(bData.cost * 0.7)
        building.isBeingSold = true
        building.sellStartTime = performance.now()
        updateMoney(sellValue)
        accepted.push({ actionId: action.actionId, type: action.type, sellValue })
        return
      }
      case 'repair_building': {
        const building = findBuildingById(buildings, factories, action.buildingId)
        if (!building || building.owner !== owner) {
          rejected.push({ actionId: action.actionId, reason: 'UNKNOWN_ENTITY' })
          return
        }
        if (building.health >= (building.maxHealth || building.health)) {
          rejected.push({ actionId: action.actionId, reason: 'ALREADY_FULL_HEALTH' })
          return
        }
        const result = repairBuilding(building, state)
        if (result.success) {
          accepted.push({ actionId: action.actionId, type: action.type })
        } else {
          rejected.push({ actionId: action.actionId, reason: 'REPAIR_FAILED', details: result.message })
        }
        return
      }
      default:
        rejected.push({ actionId: action.actionId, reason: 'NOT_SUPPORTED' })
    }
  })

  return { accepted, rejected }
}

/**
 * Process the LLM building queue for a given AI player.
 * Should be called every AI update frame. Starts construction of the next
 * queued building when the factory is idle, using the same timer-based
 * construction system as the local AI. Placement fallback is handled at
 * construction-start time: if the LLM-requested position is blocked, the
 * algorithmic findBuildingPosition is used instead.
 *
 * @param {Object} state - gameState
 * @param {string} owner - AI player id
 * @param {Object} aiFactory - the AI player's construction yard / factory object
 * @param {Array} factories - all factories
 * @param {Array} mapGrid - the map grid
 * @param {Array} units - all units
 * @param {Array} buildings - all buildings
 * @param {number} now - current timestamp (performance.now())
 */
export function processLlmBuildQueue(state, owner, aiFactory, factories, mapGrid, units, buildings, now) {
  if (!state.llmStrategic?.buildQueuesByPlayer?.[owner]?.length) return
  // Don't start a new construction if one is already in progress
  if (aiFactory.currentlyBuilding) return

  const queue = state.llmStrategic.buildQueuesByPlayer[owner]

  // Process items — find the first with status 'queued'
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]
    if (item.status !== 'queued') continue

    // Re-check tech tree at construction start time — prerequisites may have
    // been destroyed since the action was originally queued.
    const availableBuildings = computeAvailableBuildingTypes(buildings, factories, owner)
    if (!availableBuildings.has(item.buildingType)) {
      // Prerequisite no longer met — refund money and mark failed
      item.status = 'failed'
      item.failReason = 'tech_tree_locked'
      aiFactory.budget += item.cost
      window.logger.warn(`[LLM] Building '${item.buildingType}' dropped from queue for ${owner}: tech tree locked`)
      continue
    }

    // Find a valid placement position.
    // 1. Try the LLM's requested position first
    let position = null
    if (item.tilePosition) {
      if (canPlaceBuilding(item.buildingType, item.tilePosition.x, item.tilePosition.y, mapGrid, units, buildings, factories, owner)) {
        position = item.tilePosition
      }
    }
    // 2. Fallback: use algorithmic placement near the AI base
    if (!position) {
      position = findBuildingPosition(item.buildingType, mapGrid, units, buildings, factories, owner)
    }

    if (position) {
      // Start construction with the same timer formula as the local AI
      item.status = 'building'
      const cost = item.cost
      aiFactory.currentlyBuilding = item.buildingType
      aiFactory.buildStartTime = now
      aiFactory.buildDuration = 750 * (cost / 500)
      // Slow down if enemy power is negative
      if (state.enemyPowerSupply < 0) {
        aiFactory.buildDuration = aiFactory.buildDuration / Math.max(state.enemyBuildSpeedModifier || 1, 0.01)
      }
      // Apply game speed multiplier
      aiFactory.buildDuration = aiFactory.buildDuration / (state.speedMultiplier || 1)
      aiFactory.buildingPosition = position
      return
    }

    // No valid position found — refund and mark failed
    item.status = 'failed'
    item.failReason = 'no_position'
    aiFactory.budget += item.cost
    window.logger.warn(`[LLM] Building '${item.buildingType}' dropped from queue for ${owner}: no valid position`)
  }
}

/**
 * Process the LLM unit production queue for a given AI player.
 * Should be called every AI update frame. Starts production of the next
 * queued unit when the factory is idle, using the same timer-based system
 * as the local AI.
 *
 * @param {Object} state - gameState
 * @param {string} owner - AI player id
 * @param {Object} aiFactory - the AI player's construction yard / factory object
 * @param {Array} factories - all factories
 * @param {Array} units - all units
 * @param {Array} buildings - all buildings
 * @param {number} now - current timestamp (performance.now())
 */
export function processLlmUnitQueue(state, owner, aiFactory, factories, units, buildings, now) {
  if (!state.llmStrategic?.unitQueuesByPlayer?.[owner]?.length) return
  // Don't start new production if one is already in progress
  if (aiFactory.currentlyProducingUnit) return

  const queue = state.llmStrategic.unitQueuesByPlayer[owner]

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]
    if (item.status !== 'queued') continue

    // Re-check tech tree at production start time
    const availableUnits = computeAvailableUnitTypes(buildings, factories, owner)
    if (!availableUnits.has(item.unitType)) {
      item.status = 'failed'
      item.failReason = 'tech_tree_locked'
      aiFactory.budget += item.cost
      window.logger.warn(`[LLM] Unit '${item.unitType}' dropped from queue for ${owner}: tech tree locked`)
      continue
    }

    // Find the spawn factory
    const spawnFactory = resolveFactoryForUnit({
      unitType: item.unitType,
      factoryId: item.factoryId,
      buildings,
      factories,
      owner
    })
    if (!spawnFactory) {
      item.status = 'failed'
      item.failReason = 'no_spawn_factory'
      aiFactory.budget += item.cost
      window.logger.warn(`[LLM] Unit '${item.unitType}' dropped from queue for ${owner}: no spawn factory`)
      continue
    }

    // Start production with timer
    item.status = 'building'
    aiFactory.currentlyProducingUnit = item.unitType
    aiFactory.unitBuildStartTime = now
    aiFactory.unitBuildDuration = 10000 // Same base duration as local AI
    // Slow production if enemy power is negative
    if (state.enemyPowerSupply < 0) {
      aiFactory.unitBuildDuration = aiFactory.unitBuildDuration / Math.max(state.enemyBuildSpeedModifier || 1, 0.01)
    }
    // Apply game speed multiplier
    aiFactory.unitBuildDuration = aiFactory.unitBuildDuration / (state.speedMultiplier || 1)
    aiFactory.unitSpawnBuilding = spawnFactory
    return
  }
}

/**
 * Mark the currently-building LLM queued building as completed.
 * Called from enemyAIPlayer.js when a building finishes construction.
 */
export function markLlmBuildComplete(state, owner) {
  const queue = state.llmStrategic?.buildQueuesByPlayer?.[owner]
  if (!queue) return
  const item = queue.find(i => i.status === 'building')
  if (item) {
    item.status = 'completed'
  }
}

/**
 * Mark the currently-producing LLM queued unit as completed.
 * Called from enemyAIPlayer.js when a unit finishes production.
 */
export function markLlmUnitComplete(state, owner) {
  const queue = state.llmStrategic?.unitQueuesByPlayer?.[owner]
  if (!queue) return
  const item = queue.find(i => i.status === 'building')
  if (item) {
    item.status = 'completed'
  }
}

/**
 * Get the LLM queue state for a given player — used by the exporter and tooltip.
 * Returns both building and unit queues with their current statuses.
 */
export function getLlmQueueState(state, owner) {
  const buildQueue = state.llmStrategic?.buildQueuesByPlayer?.[owner] || []
  const unitQueue = state.llmStrategic?.unitQueuesByPlayer?.[owner] || []
  return {
    buildings: buildQueue.map(item => ({
      buildingType: item.buildingType,
      status: item.status,
      failReason: item.failReason || undefined
    })),
    units: unitQueue.map(item => ({
      unitType: item.unitType,
      status: item.status,
      failReason: item.failReason || undefined
    }))
  }
}
