import { TILE_SIZE } from '../config.js'
import { getEffectiveFireRange } from '../game/unitCombat/combatHelpers.js'
import { normalizePartyOwner } from './enemyUtils.js'
import { getEnemyOwnersSet } from './enemyUnitBehaviorShared.js'
import {
  AIR_DEFENSE_BUILDINGS,
  AIR_DEFENSE_RADIUS,
  AIR_DEFENSE_TYPES,
  F22_ANTI_AIR_BUFFER,
  F22_APPROACH_NODE_LIMIT,
  PLAYER_DEFENSE_BUILDINGS,
  ROCKET_TURRET_RANGE
} from './enemyUnitBehaviorConstants.js'

export function getUnitCenter(unit) {
  return {
    x: unit.x + TILE_SIZE / 2,
    y: unit.y + TILE_SIZE / 2
  }
}

export function isAirDefenseNearby(position, units, gameState, aiPlayerId) {
  const enemyOwners = getEnemyOwnersSet(aiPlayerId, gameState)
  const nearbyRocketTanks = units.some(u =>
    enemyOwners.has(u.owner) &&
    AIR_DEFENSE_TYPES.has(u.type) &&
    u.health > 0 &&
    Math.hypot((u.x + TILE_SIZE / 2) - position.x, (u.y + TILE_SIZE / 2) - position.y) <= AIR_DEFENSE_RADIUS
  )

  if (nearbyRocketTanks) return true

  const nearbyTurrets = (gameState.buildings || []).some(building => {
    if (!enemyOwners.has(building.owner) || !AIR_DEFENSE_BUILDINGS.has(building.type) || building.health <= 0) return false

    const centerX = (building.x + (building.width || 1) / 2) * TILE_SIZE
    const centerY = (building.y + (building.height || 1) / 2) * TILE_SIZE
    const distance = Math.hypot(centerX - position.x, centerY - position.y)
    return distance <= ROCKET_TURRET_RANGE + TILE_SIZE
  })

  return nearbyTurrets
}

export function getAntiAirThreatSources(units, gameState, owner) {
  const sources = []
  const enemyUnits = Array.isArray(units) ? units : []

  enemyUnits.forEach(candidate => {
    if (!candidate || candidate.health <= 0 || candidate.owner === owner) return
    if (!AIR_DEFENSE_TYPES.has(candidate.type)) return
    const center = getUnitCenter(candidate)
    const range = getEffectiveFireRange(candidate)
    if (range > 0) {
      sources.push({ x: center.x, y: center.y, range })
    }
  })

  const enemyBuildings = Array.isArray(gameState?.buildings) ? gameState.buildings : []
  enemyBuildings.forEach(building => {
    if (!building || building.health <= 0 || building.owner === owner) return
    if (!AIR_DEFENSE_BUILDINGS.has(building.type)) return

    const buildingOwner = normalizePartyOwner(building.owner)
    const supply = buildingOwner === 'player1' ? gameState.playerPowerSupply : gameState.enemyPowerSupply
    if (building.type === 'rocketTurret' && supply < 0) return

    const range = (building.fireRange || 16) * TILE_SIZE
    const centerX = (building.x + (building.width || 1) / 2) * TILE_SIZE
    const centerY = (building.y + (building.height || 1) / 2) * TILE_SIZE
    sources.push({ x: centerX, y: centerY, range })
  })

  return sources
}

function isPointInsideAntiAirThreat(point, threatSources, buffer = 0) {
  if (!point || !Array.isArray(threatSources) || threatSources.length === 0) return false

  return threatSources.some(source => {
    const maxRange = source.range + buffer
    return Math.hypot(point.x - source.x, point.y - source.y) <= maxRange
  })
}

function isTargetOutsideAntiAirThreat(target, threatSources) {
  if (!target) return false

  let center = null
  if (target.tileX !== undefined && target.tileY !== undefined) {
    center = {
      x: (target.tileX + (target.width || 1) / 2) * TILE_SIZE,
      y: (target.tileY + (target.height || 1) / 2) * TILE_SIZE
    }
  } else if ((target.width !== undefined || target.height !== undefined) && Number.isFinite(target.x) && Number.isFinite(target.y)) {
    center = {
      x: (target.x + (target.width || 1) / 2) * TILE_SIZE,
      y: (target.y + (target.height || 1) / 2) * TILE_SIZE
    }
  } else {
    center = {
      x: target.x + TILE_SIZE / 2,
      y: target.y + TILE_SIZE / 2
    }
  }

  return !isPointInsideAntiAirThreat(center, threatSources, F22_ANTI_AIR_BUFFER)
}

function findSafeApproachPath(startTile, destinationTile, mapGrid, threatSources) {
  if (!startTile || !destinationTile || !Array.isArray(mapGrid) || !Array.isArray(mapGrid[0])) return null

  const mapHeight = mapGrid.length
  const mapWidth = mapGrid[0].length
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < mapWidth && y < mapHeight
  const makeKey = (x, y) => `${x},${y}`
  const heuristic = (x, y) => Math.hypot(destinationTile.x - x, destinationTile.y - y)

  const isBlocked = (x, y) => {
    if (!inBounds(x, y)) return true
    const point = {
      x: (x + 0.5) * TILE_SIZE,
      y: (y + 0.5) * TILE_SIZE
    }
    return isPointInsideAntiAirThreat(point, threatSources, F22_ANTI_AIR_BUFFER)
  }

  if (isBlocked(destinationTile.x, destinationTile.y)) {
    return null
  }

  const startBlocked = isBlocked(startTile.x, startTile.y)
  const open = [{ x: startTile.x, y: startTile.y, g: 0, f: heuristic(startTile.x, startTile.y) }]
  const gScore = new Map([[makeKey(startTile.x, startTile.y), 0]])
  const cameFrom = new Map()
  const closed = new Set()

  const neighbors = [
    { x: -1, y: 0 }, { x: 1, y: 0 },
    { x: 0, y: -1 }, { x: 0, y: 1 },
    { x: -1, y: -1 }, { x: 1, y: -1 },
    { x: -1, y: 1 }, { x: 1, y: 1 }
  ]

  let explored = 0
  while (open.length > 0 && explored < F22_APPROACH_NODE_LIMIT) {
    explored++
    let currentIndex = 0
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[currentIndex].f) {
        currentIndex = i
      }
    }

    const current = open.splice(currentIndex, 1)[0]
    const currentKey = makeKey(current.x, current.y)
    if (closed.has(currentKey)) continue

    if (current.x === destinationTile.x && current.y === destinationTile.y) {
      const path = [{ x: current.x, y: current.y }]
      let traceKey = currentKey
      while (cameFrom.has(traceKey)) {
        const previous = cameFrom.get(traceKey)
        path.push(previous)
        traceKey = makeKey(previous.x, previous.y)
      }
      return path.reverse()
    }

    closed.add(currentKey)

    neighbors.forEach(offset => {
      const nx = current.x + offset.x
      const ny = current.y + offset.y
      const neighborKey = makeKey(nx, ny)
      if (closed.has(neighborKey) || !inBounds(nx, ny)) return

      if (!(startBlocked && nx === startTile.x && ny === startTile.y) && isBlocked(nx, ny)) {
        return
      }

      const stepCost = (offset.x === 0 || offset.y === 0) ? 1 : Math.SQRT2
      const tentativeG = current.g + stepCost
      const previousG = gScore.get(neighborKey)
      if (previousG !== undefined && tentativeG >= previousG) return

      cameFrom.set(neighborKey, { x: current.x, y: current.y })
      gScore.set(neighborKey, tentativeG)
      open.push({ x: nx, y: ny, g: tentativeG, f: tentativeG + heuristic(nx, ny) })
    })
  }

  return null
}

export function getF22SafeApproachWaypoint(seeker, target, threatSources, mapGrid) {
  if (!seeker || !target || !Array.isArray(mapGrid) || !Array.isArray(mapGrid[0])) return null

  const startTile = {
    x: Math.floor((seeker.x + TILE_SIZE / 2) / TILE_SIZE),
    y: Math.floor((seeker.y + TILE_SIZE / 2) / TILE_SIZE)
  }
  const destinationTile = target.tileX !== undefined
    ? { x: target.tileX, y: target.tileY }
    : { x: Math.floor(target.x), y: Math.floor(target.y) }

  const safePath = findSafeApproachPath(startTile, destinationTile, mapGrid, threatSources)
  if (!safePath || safePath.length === 0) return null

  const nextNode = safePath[Math.min(3, safePath.length - 1)]
  return {
    x: (nextNode.x + 0.5) * TILE_SIZE,
    y: (nextNode.y + 0.5) * TILE_SIZE,
    stopRadius: TILE_SIZE * 0.7,
    mode: 'attack',
    followTargetId: target.id || null,
    destinationTile: { x: destinationTile.x, y: destinationTile.y }
  }
}

function isHarvesterAtOreField(harvester, gameState) {
  if (!harvester || !gameState?.mapGrid) return false
  if (harvester.harvesting) return true

  const centerTileX = Math.floor((harvester.x + TILE_SIZE / 2) / TILE_SIZE)
  const centerTileY = Math.floor((harvester.y + TILE_SIZE / 2) / TILE_SIZE)
  const tile = gameState.mapGrid?.[centerTileY]?.[centerTileX]
  return Boolean(tile && tile.ore && !tile.seedCrystal)
}

export function findApacheStrikeTarget(units, gameState, seeker) {
  const enemyOwners = getEnemyOwnersSet(seeker?.owner, gameState)
  const isStrikeJet = seeker?.type === 'f22Raptor' || seeker?.type === 'f35'
  const antiAirThreatSources = isStrikeJet
    ? getAntiAirThreatSources(units, gameState, seeker.owner)
    : []
  const playerHarvesters = units.filter(u => enemyOwners.has(u.owner) && u.type === 'harvester' && u.health > 0)
  const seekerCenter = getUnitCenter(seeker)

  const unprotectedHarvesters = playerHarvesters.filter(harvester => {
    const center = getUnitCenter(harvester)
    return !isAirDefenseNearby(center, units, gameState, seeker?.owner)
  })

  if (isStrikeJet) {
    const oreFieldHarvesters = unprotectedHarvesters
      .filter(harvester => isHarvesterAtOreField(harvester, gameState))
      .filter(harvester => isTargetOutsideAntiAirThreat(harvester, antiAirThreatSources))
    if (oreFieldHarvesters.length > 0) {
      oreFieldHarvesters.sort((a, b) => {
        const aCenter = getUnitCenter(a)
        const bCenter = getUnitCenter(b)
        return Math.hypot(aCenter.x - seekerCenter.x, aCenter.y - seekerCenter.y) - Math.hypot(bCenter.x - seekerCenter.x, bCenter.y - seekerCenter.y)
      })
      return oreFieldHarvesters[0]
    }
  }

  if (unprotectedHarvesters.length > 0) {
    const safeHarvesters = isStrikeJet
      ? unprotectedHarvesters.filter(harvester => isTargetOutsideAntiAirThreat(harvester, antiAirThreatSources))
      : unprotectedHarvesters

    safeHarvesters.sort((a, b) => {
      const aCenter = getUnitCenter(a)
      const bCenter = getUnitCenter(b)
      return Math.hypot(aCenter.x - seekerCenter.x, aCenter.y - seekerCenter.y) - Math.hypot(bCenter.x - seekerCenter.x, bCenter.y - seekerCenter.y)
    })
    if (safeHarvesters.length > 0) {
      return safeHarvesters[0]
    }
  }

  const playerBuildings = (gameState.buildings || []).filter(b => enemyOwners.has(b.owner) && b.health > 0)

  if (seeker?.type === 'f22Raptor') {
    const unprotectedDefenses = playerBuildings.filter(building => {
      if (!PLAYER_DEFENSE_BUILDINGS.has(building.type)) return false
      const center = {
        x: (building.x + (building.width || 1) / 2) * TILE_SIZE,
        y: (building.y + (building.height || 1) / 2) * TILE_SIZE
      }
      return !isAirDefenseNearby(center, units, gameState, seeker?.owner) && isTargetOutsideAntiAirThreat(building, antiAirThreatSources)
    })

    if (unprotectedDefenses.length > 0) {
      unprotectedDefenses.sort((a, b) => {
        const aCenterX = (a.x + (a.width || 1) / 2) * TILE_SIZE
        const aCenterY = (a.y + (a.height || 1) / 2) * TILE_SIZE
        const bCenterX = (b.x + (b.width || 1) / 2) * TILE_SIZE
        const bCenterY = (b.y + (b.height || 1) / 2) * TILE_SIZE
        return Math.hypot(aCenterX - seekerCenter.x, aCenterY - seekerCenter.y) - Math.hypot(bCenterX - seekerCenter.x, bCenterY - seekerCenter.y)
      })
      return unprotectedDefenses[0]
    }
  }


  if (seeker?.type === 'f35') {
    const unprotectedGroundBuildings = playerBuildings.filter(building => {
      if (AIR_DEFENSE_BUILDINGS.has(building.type)) return false
      const center = {
        x: (building.x + (building.width || 1) / 2) * TILE_SIZE,
        y: (building.y + (building.height || 1) / 2) * TILE_SIZE
      }
      return !isAirDefenseNearby(center, units, gameState, seeker?.owner) && isTargetOutsideAntiAirThreat(building, antiAirThreatSources)
    })

    if (unprotectedGroundBuildings.length > 0) {
      unprotectedGroundBuildings.sort((a, b) => {
        const aCenterX = (a.x + (a.width || 1) / 2) * TILE_SIZE
        const aCenterY = (a.y + (a.height || 1) / 2) * TILE_SIZE
        const bCenterX = (b.x + (b.width || 1) / 2) * TILE_SIZE
        const bCenterY = (b.y + (b.height || 1) / 2) * TILE_SIZE
        return Math.hypot(aCenterX - seekerCenter.x, aCenterY - seekerCenter.y) - Math.hypot(bCenterX - seekerCenter.x, bCenterY - seekerCenter.y)
      })
      return unprotectedGroundBuildings[0]
    }
  }

  const priorityBuildings = ['constructionYard', 'oreRefinery', 'vehicleFactory', 'powerPlant']

  for (const type of priorityBuildings) {
    const candidate = playerBuildings
      .filter(b => b.type === type)
      .find(b => !isAirDefenseNearby({
        x: (b.x + (b.width || 1) / 2) * TILE_SIZE,
        y: (b.y + (b.height || 1) / 2) * TILE_SIZE
      }, units, gameState, seeker?.owner) && isTargetOutsideAntiAirThreat(b, antiAirThreatSources))

    if (candidate) return candidate
  }

  const fallback = playerBuildings.find(b => !isAirDefenseNearby({
    x: (b.x + (b.width || 1) / 2) * TILE_SIZE,
    y: (b.y + (b.height || 1) / 2) * TILE_SIZE
  }, units, gameState, seeker?.owner) && isTargetOutsideAntiAirThreat(b, antiAirThreatSources))

  return fallback || null
}
