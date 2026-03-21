const ECONOMY_BUILDING_SEQUENCE = ['powerPlant', 'oreRefinery', 'vehicleFactory']

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

function isDeferrableSpendingAction(action, step) {
  if (!action) return false
  if (matchesEconomyStep(action, step)) return false
  return action.type === 'build_place' || action.type === 'build_queue'
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

  const nextEconomyStep = resolveNextEconomyStep(input)
  if (!nextEconomyStep) return output

  let prioritizedActions = output.actions.filter(action => !isDeferrableSpendingAction(action, nextEconomyStep))
  const existingStepIndex = prioritizedActions.findIndex(action => matchesEconomyStep(action, nextEconomyStep))

  if (existingStepIndex >= 0) {
    const [existingStepAction] = prioritizedActions.splice(existingStepIndex, 1)
    prioritizedActions.unshift(existingStepAction)
  } else {
    prioritizedActions.unshift(buildEconomyAction(nextEconomyStep, input, prioritizedActions))
  }

  const maxActions = Number(input?.constraints?.maxActionsPerTick || 0)
  if (maxActions > 0) {
    prioritizedActions = prioritizedActions.slice(0, maxActions)
  }

  return {
    ...output,
    actions: prioritizedActions
  }
}
