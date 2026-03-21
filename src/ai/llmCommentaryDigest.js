function roundNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function buildTilePosition(position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null
  return {
    x: Math.round(position.x),
    y: Math.round(position.y),
    space: 'tile'
  }
}

function trimSummary(summary, maxLines = 1) {
  if (!summary) return ''
  return String(summary).split('\n').slice(-Math.max(1, maxLines)).join('\n')
}

function sortEntriesByCount(counts) {
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return left[0].localeCompare(right[0])
    })
  )
}

function countBy(items, keySelector) {
  return sortEntriesByCount(items.reduce((counts, item) => {
    const key = keySelector(item)
    if (!key) return counts
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {}))
}

function resolveEntityLookups(input) {
  const lookup = new Map()
  const units = Array.isArray(input.snapshot?.units) ? input.snapshot.units : []
  const buildings = Array.isArray(input.snapshot?.buildings) ? input.snapshot.buildings : []

  units.forEach(unit => {
    lookup.set(unit.id, {
      id: unit.id,
      kind: 'unit',
      type: unit.type,
      owner: unit.owner,
      tilePosition: unit.tilePosition
    })
  })

  buildings.forEach(building => {
    lookup.set(building.id, {
      id: building.id,
      kind: 'building',
      type: building.type,
      owner: building.owner,
      tilePosition: building.tilePosition
    })
  })

  return lookup
}

function resolveEventOwner(event, entityLookup) {
  if (event.owner) return event.owner
  const relatedEntityId = event.targetId || event.victimId || event.unitId || event.buildingId
  if (!relatedEntityId) return null
  return entityLookup.get(relatedEntityId)?.owner || null
}

function resolveEventPosition(event, entityLookup) {
  if (event.tilePosition) return buildTilePosition(event.tilePosition)
  if (event.position) return buildTilePosition(event.position)
  const relatedEntityId = event.targetId || event.victimId || event.unitId || event.buildingId
  if (!relatedEntityId) return null
  return buildTilePosition(entityLookup.get(relatedEntityId)?.tilePosition)
}

export function isInterestingCommentaryEvent(event) {
  return [
    'damage',
    'destroyed',
    'unit_created',
    'building_started',
    'building_completed',
    'unit_destroyed',
    'building_destroyed',
    'building_placed',
    'attack_started',
    'building_captured',
    'unit_promoted',
    'milestone',
    'harvester_destroyed',
    'construction_started'
  ].includes(event?.type)
}

export function hasInterestingCommentaryEvents(events = []) {
  return Array.isArray(events) && events.some(event => isInterestingCommentaryEvent(event))
}

function compactCommentaryEvent(event, playerId, entityLookup) {
  const owner = resolveEventOwner(event, entityLookup)
  const relatedEntityId = event.targetId || event.victimId || event.unitId || event.buildingId || null
  const relatedEntity = relatedEntityId ? entityLookup.get(relatedEntityId) : null

  const compactEvent = {
    type: event.type,
    tick: event.tick,
    side: owner ? (owner === playerId ? 'self' : 'enemy') : 'unknown'
  }

  if (event.unitType) compactEvent.unitType = event.unitType
  if (event.buildingType) compactEvent.buildingType = event.buildingType
  if (event.victimKind) compactEvent.victimKind = event.victimKind
  if (Number.isFinite(event.amount)) compactEvent.amount = roundNumber(event.amount, 0)
  if (relatedEntityId) compactEvent.entityId = relatedEntityId
  if (relatedEntity?.type) compactEvent.entityType = relatedEntity.type
  const tilePosition = resolveEventPosition(event, entityLookup)
  if (tilePosition) compactEvent.tilePosition = tilePosition

  return compactEvent
}

export function buildCompactCommentaryInput(input, options = {}) {
  const playerId = input.playerId
  const summary = options.summary || ''
  const maxHighlights = Math.max(1, options.maxHighlights || 6)
  const maxRecentComments = Math.max(0, options.maxRecentComments || 3)
  const units = Array.isArray(input.snapshot?.units) ? input.snapshot.units : []
  const buildings = Array.isArray(input.snapshot?.buildings) ? input.snapshot.buildings : []
  const entityLookup = resolveEntityLookups(input)
  const interestingEvents = (Array.isArray(input.transitions?.events) ? input.transitions.events : [])
    .filter(isInterestingCommentaryEvent)

  const selfUnits = units.filter(unit => unit.owner === playerId)
  const enemyUnits = units.filter(unit => unit.owner !== playerId)
  const selfBuildings = buildings.filter(building => building.owner === playerId)
  const enemyBuildings = buildings.filter(building => building.owner !== playerId)
  const opposingOwners = Array.from(new Set([
    ...enemyUnits.map(unit => unit.owner),
    ...enemyBuildings.map(building => building.owner)
  ])).sort()

  return {
    protocolVersion: input.protocolVersion,
    inputMode: 'compact-commentary-v1',
    playerId,
    tick: input.tick,
    shortSummary: trimSummary(summary, 1),
    ownerContext: {
      selfPlayerId: playerId,
      opposingOwners,
      visibleCounts: {
        selfUnits: selfUnits.length,
        enemyUnits: enemyUnits.length,
        selfBuildings: selfBuildings.length,
        enemyBuildings: enemyBuildings.length
      },
      visibleEnemyUnitTypes: countBy(enemyUnits, unit => unit.type),
      visibleEnemyBuildingTypes: countBy(enemyBuildings, building => building.type)
    },
    recentDeltas: {
      summary: input.transitions?.summary || { totalDamage: 0, unitsDestroyed: 0, buildingsDestroyed: 0 },
      countsByType: countBy(interestingEvents, event => event.type),
      highlights: interestingEvents.slice(-maxHighlights).map(event => compactCommentaryEvent(event, playerId, entityLookup))
    },
    antiRepeat: {
      recentComments: (options.recentComments || []).slice(-maxRecentComments)
    }
  }
}
