const ECONOMY_BUILDING_SEQUENCE = ['powerPlant', 'oreRefinery', 'vehicleFactory']
const BASE_BUILDING_TARGETS = [
  { type: 'powerPlant', targetCount: 2 },
  { type: 'oreRefinery', targetCount: 2 },
  { type: 'radarStation', targetCount: 1 },
  { type: 'vehicleWorkshop', targetCount: 1 },
  { type: 'ammunitionFactory', targetCount: 1 },
  { type: 'hospital', targetCount: 1 },
  { type: 'gasStation', targetCount: 1 },
  { type: 'turretGunV1', targetCount: 2 },
  { type: 'rocketTurret', targetCount: 1 },
  { type: 'artilleryTurret', targetCount: 1 },
  { type: 'helipad', targetCount: 1 }
]
const TARGET_ACTIVE_QUEUE_DEPTH = 5
const MAX_FORWARD_PLANNING_ACTIONS = 6

function buildAvailableTypeSet(entries = []) {
  return new Set(entries.map(entry => entry?.type).filter(Boolean))
}

function countOwnedBuildings(input, type) {
  return Number(input?.baseStatus?.ownedBuildingCounts?.[type] || 0)
}

function countOwnedHarvesters(input) {
  return Number(input?.economy?.harvesters?.total || 0)
}

function hasQueuedBuilding(input, type) {
  const queue = input?.queueState?.llmQueue?.buildings || []
  return queue.some(entry => entry?.buildingType === type && entry?.status !== 'failed')
}

function hasQueuedUnit(input, type) {
  const queue = input?.queueState?.llmQueue?.units || []
  return queue.some(entry => entry?.unitType === type && entry?.status !== 'failed')
}

function countQueuedBuildings(input, type) {
  const queue = input?.queueState?.llmQueue?.buildings || []
  return queue.filter(entry => entry?.buildingType === type && entry?.status !== 'failed').length
}

function countQueuedUnits(input, type) {
  const queue = input?.queueState?.llmQueue?.units || []
  return queue.filter(entry => entry?.unitType === type && entry?.status !== 'failed').length
}

function countActiveQueueEntries(entries = []) {
  return entries.filter(entry => entry?.status !== 'failed' && entry?.status !== 'completed').length
}

function buildCostLookup(entries = [], key = 'type') {
  return entries.reduce((lookup, entry) => {
    const type = entry?.[key]
    if (!type) return lookup
    lookup[type] = Number(entry.cost || 0)
    return lookup
  }, {})
}

function findAnchorTilePosition(input) {
  return input?.mapIntel?.ownBaseCenter ||
    input?.baseStatus?.productionAnchors?.[0]?.tilePosition ||
    input?.baseStatus?.ownedBuildings?.[0]?.tilePosition ||
    { x: 0, y: 0, space: 'tile' }
}

function matchesEconomyStep(action, step) {
  if (!action || !step) return false
  if (step.type === 'build_place') {
    return action.type === 'build_place' && action.buildingType === step.buildingType
  }
  return action.type === 'build_queue' && action.unitType === step.unitType
}

function isSpendingAction(action) {
  return action?.type === 'build_place' || action?.type === 'build_queue'
}

function buildUniqueActionId(actions, prefix) {
  const existing = new Set((actions || []).map(action => action?.actionId).filter(Boolean))
  let nextId = prefix
  let suffix = 1

  while (existing.has(nextId)) {
    nextId = `${prefix}-${suffix}`
    suffix += 1
  }

  return nextId
}

function resolveNextEconomyStep(input) {
  const availableBuildings = buildAvailableTypeSet(input?.productionOptions?.availableBuildings)
  const availableUnits = buildAvailableTypeSet(input?.productionOptions?.availableUnits)

  for (const buildingType of ECONOMY_BUILDING_SEQUENCE) {
    const alreadyCovered = countOwnedBuildings(input, buildingType) > 0 ||
      hasQueuedBuilding(input, buildingType)
    if (!alreadyCovered && availableBuildings.has(buildingType)) {
      return { type: 'build_place', buildingType }
    }
  }

  const hasHarvester = countOwnedHarvesters(input) > 0 ||
    hasQueuedUnit(input, 'harvester')
  if (!hasHarvester && availableUnits.has('harvester')) {
    return { type: 'build_queue', unitType: 'harvester' }
  }

  return null
}

function resolveHarvesterTarget(input) {
  const refineries = Math.max(1, countOwnedBuildings(input, 'oreRefinery') + countQueuedBuildings(input, 'oreRefinery'))
  return Math.min(4, Math.max(2, refineries + 1))
}

function buildPlanningSteps(input) {
  const steps = []

  ECONOMY_BUILDING_SEQUENCE.forEach(buildingType => {
    steps.push({ type: 'build_place', buildingType, targetCount: 1 })
  })

  steps.push({ type: 'build_queue', unitType: 'harvester', targetCount: resolveHarvesterTarget(input) })

  BASE_BUILDING_TARGETS.forEach(({ type, targetCount }) => {
    steps.push({ type: 'build_place', buildingType: type, targetCount })
  })

  return steps
}

function getPlannedActionCount(actions, step) {
  if (step.type === 'build_place') {
    return actions.filter(action => action?.type === 'build_place' && action?.buildingType === step.buildingType).length
  }
  return actions.filter(action => action?.type === 'build_queue' && action?.unitType === step.unitType).length
}

function getSatisfiedCount(input, plannedActions, step) {
  if (step.type === 'build_place') {
    return countOwnedBuildings(input, step.buildingType) + countQueuedBuildings(input, step.buildingType) + getPlannedActionCount(plannedActions, step)
  }
  if (step.unitType === 'harvester') {
    return countOwnedHarvesters(input) + countQueuedUnits(input, step.unitType) + getPlannedActionCount(plannedActions, step)
  }
  return countQueuedUnits(input, step.unitType) + getPlannedActionCount(plannedActions, step)
}

function canBuildStep(input, step) {
  const availableBuildings = buildAvailableTypeSet(input?.productionOptions?.availableBuildings)
  const availableUnits = buildAvailableTypeSet(input?.productionOptions?.availableUnits)
  if (step.type === 'build_place') return availableBuildings.has(step.buildingType)
  return availableUnits.has(step.unitType)
}

function estimateActionCost(action, buildingCosts, unitCosts) {
  if (action?.type === 'build_place') return Number(buildingCosts[action.buildingType] || 0)
  if (action?.type === 'build_queue') return Number(unitCosts[action.unitType] || 0) * Math.max(1, Number(action.count || 1))
  return 0
}

function consumeMatchingProposedAction(proposedActions, step) {
  const index = proposedActions.findIndex(action => matchesEconomyStep(action, step))
  if (index === -1) return null
  return proposedActions.splice(index, 1)[0]
}

function countCriticalMissingSteps(input) {
  const nextEconomyStep = resolveNextEconomyStep(input)
  if (!nextEconomyStep) return 0

  if (nextEconomyStep.type === 'build_place') {
    const remainingBuildings = ECONOMY_BUILDING_SEQUENCE.filter(type => countOwnedBuildings(input, type) + countQueuedBuildings(input, type) === 0)
    return remainingBuildings.length
  }

  return Math.max(1, resolveHarvesterTarget(input) - (countOwnedHarvesters(input) + countQueuedUnits(input, 'harvester')))
}

function buildEconomyAction(step, input, actions) {
  if (step.type === 'build_place') {
    return {
      actionId: buildUniqueActionId(actions, `econ-${step.buildingType}`),
      type: 'build_place',
      buildingType: step.buildingType,
      tilePosition: findAnchorTilePosition(input),
      rallyPoint: null
    }
  }

  return {
    actionId: buildUniqueActionId(actions, `econ-${step.unitType}`),
    type: 'build_queue',
    unitType: step.unitType,
    count: 1,
    factoryId: null,
    rallyPoint: null
  }
}

export function prioritizeEconomyActions(output, input) {
  if (!output || !Array.isArray(output.actions) || !input) return output

  const nonSpendingActions = output.actions.filter(action => !isSpendingAction(action))
  const proposedSpendingActions = output.actions.filter(isSpendingAction)
  const buildingCosts = buildCostLookup(input?.productionOptions?.availableBuildings)
  const unitCosts = buildCostLookup(input?.productionOptions?.availableUnits)
  const activeQueueDepth = countActiveQueueEntries(input?.queueState?.llmQueue?.buildings || []) + countActiveQueueEntries(input?.queueState?.llmQueue?.units || [])
  const maxActions = Number(input?.constraints?.maxActionsPerTick || 0)
  const maxSpendingActions = maxActions > 0 ? Math.max(0, maxActions - nonSpendingActions.length) : proposedSpendingActions.length + TARGET_ACTIVE_QUEUE_DEPTH
  const minimumPlanningActions = Math.max(countCriticalMissingSteps(input), Math.max(0, TARGET_ACTIVE_QUEUE_DEPTH - activeQueueDepth))
  const targetPlanningActions = Math.min(maxSpendingActions, Math.min(MAX_FORWARD_PLANNING_ACTIONS, minimumPlanningActions))
  const planningSteps = buildPlanningSteps(input)
  const prioritizedSpending = []
  let remainingBudget = Number(input?.economy?.money || 0)

  for (const step of planningSteps) {
    if (prioritizedSpending.length >= targetPlanningActions) break
    if (!canBuildStep(input, step)) continue

    while (getSatisfiedCount(input, prioritizedSpending, step) < step.targetCount && prioritizedSpending.length < targetPlanningActions) {
      const proposedAction = consumeMatchingProposedAction(proposedSpendingActions, step)
      const action = proposedAction || buildEconomyAction(step, input, prioritizedSpending)
      const actionCost = estimateActionCost(action, buildingCosts, unitCosts)
      if (actionCost > remainingBudget) break
      prioritizedSpending.push(action)
      remainingBudget -= actionCost
    }
  }

  proposedSpendingActions.forEach(action => {
    if (prioritizedSpending.length >= maxSpendingActions) return
    const actionCost = estimateActionCost(action, buildingCosts, unitCosts)
    if (actionCost > remainingBudget) return
    prioritizedSpending.push(action)
    remainingBudget -= actionCost
  })

  let prioritizedActions = [...prioritizedSpending, ...nonSpendingActions]

  if (maxActions > 0) {
    prioritizedActions = prioritizedActions.slice(0, maxActions)
  }

  return {
    ...output,
    actions: prioritizedActions
  }
}
