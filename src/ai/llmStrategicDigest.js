const PRODUCTION_BUILDING_TYPES = new Set([
  'constructionYard',
  'powerPlant',
  'oreRefinery',
  'vehicleFactory',
  'vehicleWorkshop',
  'radarStation',
  'hospital',
  'helipad',
  'gasStation',
  'ammunitionFactory'
])

const DEFENSE_BUILDING_TYPES = new Set([
  'turretGunV1',
  'turretGunV2',
  'turretGunV3',
  'rocketTurret',
  'teslaCoil',
  'artilleryTurret',
  'concreteWall'
])

const AIR_UNIT_TYPES = new Set(['apache', 'f22Raptor'])
const SUPPORT_UNIT_TYPES = new Set(['ambulance', 'tankerTruck', 'ammunitionTruck', 'recoveryTank'])
const LOGISTICS_UNIT_TYPES = new Set(['harvester', 'mineLayer', 'mineSweeper'])
const PRIORITY_TARGET_BUILDING_TYPES = new Set([
  'constructionYard',
  'oreRefinery',
  'vehicleFactory',
  'radarStation',
  'helipad',
  'rocketTurret',
  'teslaCoil',
  'artilleryTurret'
])
const PRIORITY_TARGET_UNIT_TYPES = new Set([
  'harvester',
  'howitzer',
  'rocketTank',
  'apache',
  'f22Raptor',
  'recoveryTank',
  'mineLayer'
])

function roundNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function buildHealthRatio(entity) {
  const maxHealth = Number(entity?.maxHealth || 0)
  const health = Number(entity?.health || 0)
  if (maxHealth <= 0) return 0
  return roundNumber(Math.max(0, Math.min(1, health / maxHealth)))
}

function buildTilePosition(position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return null
  }
  return {
    x: Math.round(position.x),
    y: Math.round(position.y),
    space: 'tile'
  }
}

function incrementCount(counts, key) {
  if (!key) return counts
  counts[key] = (counts[key] || 0) + 1
  return counts
}

function summarizeCenter(entities = []) {
  if (!Array.isArray(entities) || entities.length === 0) return null
  const totals = entities.reduce((accumulator, entity) => {
    const tilePosition = entity.tilePosition || {}
    accumulator.x += Number(tilePosition.x || 0)
    accumulator.y += Number(tilePosition.y || 0)
    return accumulator
  }, { x: 0, y: 0 })

  return {
    x: roundNumber(totals.x / entities.length, 1),
    y: roundNumber(totals.y / entities.length, 1),
    space: 'tile'
  }
}

function sortEntriesByCount(counts) {
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return left[0].localeCompare(right[0])
    })
  )
}

function compactBuilding(building) {
  const entry = {
    id: building.id,
    type: building.type,
    tilePosition: buildTilePosition(building.tilePosition),
    healthRatio: buildHealthRatio(building)
  }
  if (building.rallyPoint) {
    entry.rallyPoint = buildTilePosition(building.rallyPoint)
  }
  if (building.constructionFinished === false) {
    entry.status = 'building'
  }
  return entry
}

function compactUnit(unit) {
  const entry = {
    id: unit.id,
    type: unit.type,
    tilePosition: buildTilePosition(unit.tilePosition),
    healthRatio: buildHealthRatio(unit)
  }
  if (Number.isFinite(unit.status?.ammo)) entry.ammo = unit.status.ammo
  if (Number.isFinite(unit.status?.fuel)) entry.fuel = unit.status.fuel
  if (unit.orders?.moveTarget) entry.moveTarget = buildTilePosition(unit.orders.moveTarget)
  if (unit.orders?.targetId) entry.targetId = unit.orders.targetId
  return entry
}

function summarizeUnitGroups(units = []) {
  const groupsByType = new Map()

  units.forEach(unit => {
    const list = groupsByType.get(unit.type) || []
    list.push(unit)
    groupsByType.set(unit.type, list)
  })

  return Array.from(groupsByType.entries())
    .map(([type, members]) => ({
      type,
      count: members.length,
      unitIds: members.map(unit => unit.id),
      centerTile: summarizeCenter(members),
      avgHealthRatio: roundNumber(
        members.reduce((total, member) => total + buildHealthRatio(member), 0) / Math.max(1, members.length)
      ),
      damagedCount: members.filter(member => buildHealthRatio(member) < 0.65).length,
      activeOrderCount: members.filter(member => member.orders?.moveTarget || member.orders?.targetId).length
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      return left.type.localeCompare(right.type)
    })
}

function summarizeFriendlyForces(units, playerId) {
  const ownedUnits = units.filter(unit => unit.owner === playerId)
  const combatUnits = ownedUnits.filter(unit => !AIR_UNIT_TYPES.has(unit.type) && !SUPPORT_UNIT_TYPES.has(unit.type) && !LOGISTICS_UNIT_TYPES.has(unit.type))
  const supportUnits = ownedUnits.filter(unit => SUPPORT_UNIT_TYPES.has(unit.type))
  const logisticsUnits = ownedUnits.filter(unit => LOGISTICS_UNIT_TYPES.has(unit.type))
  const aircraftUnits = ownedUnits.filter(unit => AIR_UNIT_TYPES.has(unit.type))
  const detailedUnits = ownedUnits
    .filter(unit => LOGISTICS_UNIT_TYPES.has(unit.type) || SUPPORT_UNIT_TYPES.has(unit.type) || AIR_UNIT_TYPES.has(unit.type) || buildHealthRatio(unit) < 0.55 || unit.orders?.targetId)
    .slice(0, 14)
    .map(compactUnit)

  return {
    totals: {
      combat: combatUnits.length,
      support: supportUnits.length,
      logistics: logisticsUnits.length,
      aircraft: aircraftUnits.length
    },
    combat: summarizeUnitGroups(combatUnits),
    support: summarizeUnitGroups(supportUnits),
    logistics: summarizeUnitGroups(logisticsUnits),
    aircraft: summarizeUnitGroups(aircraftUnits),
    detailedUnits
  }
}

function summarizeBaseStatus(buildings, playerId) {
  const ownedBuildings = buildings.filter(building => building.owner === playerId)
  const buildingCounts = {}

  ownedBuildings.forEach(building => incrementCount(buildingCounts, building.type))

  return {
    ownedBuildingCounts: sortEntriesByCount(buildingCounts),
    ownedBuildings: ownedBuildings.map(compactBuilding),
    productionAnchors: ownedBuildings.filter(building => PRODUCTION_BUILDING_TYPES.has(building.type)).map(compactBuilding),
    defenses: ownedBuildings.filter(building => DEFENSE_BUILDING_TYPES.has(building.type)).map(compactBuilding),
    criticalBuildings: ownedBuildings
      .filter(building => buildHealthRatio(building) < 0.65 || building.constructionFinished === false)
      .map(compactBuilding)
  }
}

function summarizeEnemyIntel(units, buildings, playerId) {
  const enemyUnits = units.filter(unit => unit.owner !== playerId)
  const enemyBuildings = buildings.filter(building => building.owner !== playerId)
  const unitCounts = {}
  const buildingCounts = {}

  enemyUnits.forEach(unit => incrementCount(unitCounts, unit.type))
  enemyBuildings.forEach(building => incrementCount(buildingCounts, building.type))

  const groupedUnits = summarizeUnitGroups(enemyUnits).slice(0, 8)
  const priorityTargets = [
    ...enemyUnits
      .filter(unit => PRIORITY_TARGET_UNIT_TYPES.has(unit.type) || buildHealthRatio(unit) < 0.55)
      .slice(0, 8)
      .map(unit => ({
        id: unit.id,
        type: unit.type,
        owner: unit.owner,
        tilePosition: buildTilePosition(unit.tilePosition),
        healthRatio: buildHealthRatio(unit)
      })),
    ...enemyBuildings
      .filter(building => PRIORITY_TARGET_BUILDING_TYPES.has(building.type) || buildHealthRatio(building) < 0.55)
      .slice(0, 8)
      .map(building => ({
        id: building.id,
        type: building.type,
        owner: building.owner,
        tilePosition: buildTilePosition(building.tilePosition),
        healthRatio: buildHealthRatio(building)
      }))
  ].slice(0, 12)

  const enemyBaseCenters = Object.entries(
    enemyBuildings.reduce((accumulator, building) => {
      const list = accumulator[building.owner] || []
      list.push(building)
      accumulator[building.owner] = list
      return accumulator
    }, {})
  ).map(([owner, ownerBuildings]) => ({
    owner,
    centerTile: summarizeCenter(ownerBuildings)
  }))

  return {
    visibleUnitCounts: sortEntriesByCount(unitCounts),
    visibleBuildingCounts: sortEntriesByCount(buildingCounts),
    visibleForceGroups: groupedUnits,
    priorityTargets,
    enemyBaseCenters
  }
}

function summarizeEconomy(input, baseStatus, forceGroups) {
  const money = Number(input.snapshot?.resources?.money || 0)
  const power = input.snapshot?.resources?.power || {}
  const ownedBuildings = baseStatus.ownedBuildingCounts || {}
  const refineryCount = Number(ownedBuildings.oreRefinery || 0)
  const harvesterGroup = forceGroups.logistics.find(group => group.type === 'harvester')
  const harvesterTotal = harvesterGroup?.count || 0

  return {
    money: Math.round(money),
    power: {
      supply: Number(power.supply || 0),
      production: Number(power.production || 0),
      consumption: Number(power.consumption || 0)
    },
    harvesters: {
      total: harvesterTotal,
      activeOrderCount: harvesterGroup?.activeOrderCount || 0,
      damagedCount: harvesterGroup?.damagedCount || 0
    },
    emergency: money < 2000 && (refineryCount === 0 || harvesterTotal === 0)
  }
}

function summarizeMapIntel(input, baseStatus, enemyIntel) {
  return {
    mapSize: {
      tilesX: Number(input.meta?.tilesX || 0),
      tilesY: Number(input.meta?.tilesY || 0)
    },
    fogOfWarEnabled: Boolean(input.meta?.fogOfWarEnabled),
    ownBaseCenter: summarizeCenter(baseStatus.productionAnchors.length > 0 ? baseStatus.productionAnchors : baseStatus.ownedBuildings),
    enemyBaseCenters: enemyIntel.enemyBaseCenters,
    visibleOreRefineries: [...baseStatus.ownedBuildings, ...enemyIntel.priorityTargets]
      .filter(entry => entry.type === 'oreRefinery')
      .map(entry => ({
        id: entry.id,
        owner: entry.owner || input.playerId,
        tilePosition: entry.tilePosition
      }))
  }
}

function compactEvent(event, playerId) {
  const entry = {
    type: event.type,
    tick: event.tick
  }

  if (event.owner) entry.side = event.owner === playerId ? 'self' : 'enemy'
  if (event.unitType) entry.unitType = event.unitType
  if (event.buildingType) entry.buildingType = event.buildingType
  if (event.unitId) entry.unitId = event.unitId
  if (event.buildingId) entry.buildingId = event.buildingId
  if (event.victimId) entry.victimId = event.victimId
  if (event.victimKind) entry.victimKind = event.victimKind
  if (event.targetId) entry.targetId = event.targetId
  if (Number.isFinite(event.amount)) entry.amount = event.amount
  if (event.position) entry.tilePosition = buildTilePosition(event.position)
  if (event.tilePosition) entry.tilePosition = buildTilePosition(event.tilePosition)
  return entry
}

function summarizeRecentDeltas(input) {
  const events = Array.isArray(input.transitions?.events) ? input.transitions.events : []
  const countsByType = {}
  events.forEach(event => incrementCount(countsByType, event.type))

  return {
    summary: input.transitions?.summary || { totalDamage: 0, unitsDestroyed: 0, buildingsDestroyed: 0 },
    countsByType: sortEntriesByCount(countsByType),
    highlights: events.slice(-8).map(event => compactEvent(event, input.playerId))
  }
}

export function buildCompactStrategicInput(input) {
  const units = Array.isArray(input.snapshot?.units) ? input.snapshot.units : []
  const buildings = Array.isArray(input.snapshot?.buildings) ? input.snapshot.buildings : []
  const baseStatus = summarizeBaseStatus(buildings, input.playerId)
  const forceGroups = summarizeFriendlyForces(units, input.playerId)
  const enemyIntel = summarizeEnemyIntel(units, buildings, input.playerId)

  return {
    protocolVersion: input.protocolVersion,
    inputMode: 'compact-strategic-v1',
    matchId: input.matchId,
    playerId: input.playerId,
    tick: input.tick,
    sinceTick: input.sinceTick,
    economy: summarizeEconomy(input, baseStatus, forceGroups),
    baseStatus,
    forceGroups,
    knownEnemyIntel: enemyIntel,
    mapIntel: summarizeMapIntel(input, baseStatus, enemyIntel),
    queueState: {
      llmQueue: input.snapshot?.llmQueue || { buildings: [], units: [] }
    },
    recentDeltas: summarizeRecentDeltas(input),
    constraints: input.constraints
  }
}
