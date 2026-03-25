// crewHealing.js - AI crew healing and medical support
import { TILE_SIZE } from '../config.js'
import { getCachedPath } from '../game/pathfinding.js'
import { assignAmbulanceToHealUnit } from '../game/ambulanceSystem.js'
import { getActiveAIPlayers } from './enemyUtils.js'

const crewScanCooldowns = new Map()

function getNowTime() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now()
}

function getMissingCrewCount(unit) {
  if (!unit || !unit.crew || typeof unit.crew !== 'object') return 0
  return Object.values(unit.crew).filter(alive => !alive).length
}

function ensureAmbulanceQueue(ambulance) {
  if (!ambulance) return []
  if (!Array.isArray(ambulance.pendingHealQueue)) {
    ambulance.pendingHealQueue = []
  }
  return ambulance.pendingHealQueue
}

function isUnitAlreadyQueued(ambulance, unitId) {
  if (!ambulance || !Array.isArray(ambulance.pendingHealQueue)) return false
  return ambulance.pendingHealQueue.some(entry => entry && entry.unitId === unitId)
}

function requestAmbulanceSupport(targetUnit, ambulances, mapGrid) {
  if (!targetUnit || !targetUnit.id) return false
  const missingCrew = getMissingCrewCount(targetUnit)
  if (missingCrew === 0) return false
  const requestTime = getNowTime()

  const eligibleAmbulances = ambulances
    .filter(ambulance => ambulance && ambulance.health > 0 && ambulance.type === 'ambulance')
    .map(ambulance => {
      const distance = Math.hypot(
        (ambulance.x ?? ambulance.tileX * TILE_SIZE) - (targetUnit.x ?? targetUnit.tileX * TILE_SIZE),
        (ambulance.y ?? ambulance.tileY * TILE_SIZE) - (targetUnit.y ?? targetUnit.tileY * TILE_SIZE)
      )
      return {
        ambulance,
        distance
      }
    })
    .filter(entry => {
      const { ambulance } = entry
      if (ambulance.medics <= 0) return false
      if (ambulance.crew && typeof ambulance.crew === 'object' && !ambulance.crew.loader) return false
      return true
    })

  if (eligibleAmbulances.length === 0) {
    return false
  }

  eligibleAmbulances.sort((a, b) => a.distance - b.distance)

  // Check if unit is already being served or queued
  const alreadyAssigned = eligibleAmbulances.some(entry => {
    const ambulance = entry.ambulance
    if (ambulance.healingTarget && ambulance.healingTarget.id === targetUnit.id) {
      return true
    }
    return isUnitAlreadyQueued(ambulance, targetUnit.id)
  })
  if (alreadyAssigned) {
    targetUnit.lastAmbulanceRequestTime = requestTime
    return true
  }

  for (const { ambulance } of eligibleAmbulances) {
    if (ambulance.refillingTarget || ambulance.healingTarget) {
      continue
    }
    if (assignAmbulanceToHealUnit(ambulance, targetUnit, mapGrid)) {
      ambulance.criticalHealing = true
      ambulance.pendingHealQueue = ambulance.pendingHealQueue?.filter(entry => entry.unitId !== targetUnit.id)
      targetUnit.lastAmbulanceRequestTime = requestTime
      return true
    }
  }

  // If no ambulance free, queue with the closest one
  const closest = eligibleAmbulances[0]?.ambulance
  if (!closest) {
    return false
  }

  const queue = ensureAmbulanceQueue(closest)
  const alreadyQueued = queue.some(entry => entry.unitId === targetUnit.id)
  if (!alreadyQueued) {
    queue.push({ unitId: targetUnit.id, requestedAt: requestTime })
    targetUnit.lastAmbulanceRequestTime = requestTime
    return true
  }

  return false
}

export function manageAICrewHealing(units, gameState, now) {
  // Get all AI players (respect human player and playerCount)
  const aiPlayers = getActiveAIPlayers(gameState)

  aiPlayers.forEach(aiPlayerId => {
    const aiUnits = units.filter(u => u.owner === aiPlayerId)
    const aiBuildings = gameState.buildings ? gameState.buildings.filter(b => b.owner === aiPlayerId) : []
    const hospitals = aiBuildings.filter(b => b.type === 'hospital' && b.health > 0)
    const ambulances = aiUnits.filter(u => u.type === 'ambulance')

    const lastScan = crewScanCooldowns.get(aiPlayerId) || 0
    const allowScan = !lastScan || (now - lastScan >= 5000)

    if (allowScan) {
      crewScanCooldowns.set(aiPlayerId, now)

      // Find units with missing crew members (excluding ambulance)
      const unitsNeedingCrew = aiUnits.filter(unit => {
        if (!unit.crew || typeof unit.crew !== 'object') return false
        if (unit.type === 'ambulance') return false
        return Object.values(unit.crew).some(alive => !alive)
      })

      unitsNeedingCrew.forEach(unit => {
        const engagedAmbulance = requestAmbulanceSupport(unit, ambulances, gameState.mapGrid)
        const canMove = unit.crew.driver && unit.crew.commander

        if (canMove) {
          if (hospitals.length > 0 && !engagedAmbulance) {
            sendUnitToHospital(unit, hospitals[0], gameState.mapGrid, now)
          }
        } else if (!engagedAmbulance && hospitals.length > 0) {
          // Unit cannot move - ensure it remains on the ambulance queue or wait for next scan
          assignAmbulanceToUnit(unit, ambulances, hospitals[0], gameState.mapGrid)
        }
      })
    }

    if (hospitals.length === 0) return // No hospitals available

    // Manage ambulance refilling
    ambulances.forEach(ambulance => {
      if (ambulance.medics < 4 && !ambulance.refillingTarget && !ambulance.healingTarget) {
        sendAmbulanceToHospital(ambulance, hospitals[0], gameState.mapGrid)
      }
    })
  })
}

/**
 * Assigns an ambulance to heal a unit that cannot move
 */
function assignAmbulanceToUnit(targetUnit, ambulances, hospital, mapGrid) {
  const engaged = requestAmbulanceSupport(targetUnit, ambulances, mapGrid)

  if (!engaged && hospital) {
    // If no ambulance available, attempt to direct unit to hospital when possible
    const canMove = targetUnit.crew && targetUnit.crew.driver && targetUnit.crew.commander
    if (canMove) {
      sendUnitToHospital(targetUnit, hospital, mapGrid, getNowTime())
    }
  }
}

export function handleAICrewLossEvent(unit, units, gameState, mapGrid) {
  if (!unit || !units) return
  const aiPlayers = getActiveAIPlayers(gameState)
  if (!aiPlayers.includes(unit.owner)) return
  if (!unit.crew || typeof unit.crew !== 'object') return
  if (!Object.values(unit.crew).some(alive => !alive)) return

  const aiUnits = units.filter(candidate => candidate.owner === unit.owner)
  if (aiUnits.length === 0) return

  const ambulances = aiUnits.filter(candidate => candidate.type === 'ambulance' && candidate.health > 0)
  if (ambulances.length === 0) return

  requestAmbulanceSupport(unit, ambulances, mapGrid)
}

/**
 * Sends a unit to hospital for crew restoration
 */
function sendUnitToHospital(unit, hospital, mapGrid, now) {
  // Don't send if already en route or recently assigned
  if (unit.returningToHospital || (unit.lastHospitalAssignment && now - unit.lastHospitalAssignment < 5000)) {
    return
  }

  // Mark unit as returning to hospital
  unit.returningToHospital = true
  unit.lastHospitalAssignment = now
  unit.hospitalTarget = hospital

  // Clear other objectives
  unit.target = null
  unit.moveTarget = null
  unit.path = []
  unit.isRetreating = false // Override retreat behavior

  // Calculate path to hospital refill area (3 tiles below hospital)
  const hospitalCenterX = hospital.x + Math.floor(hospital.width / 2)
  const refillY = hospital.y + hospital.height + 1

  const refillPositions = [
    { x: hospitalCenterX, y: refillY },
    { x: hospitalCenterX - 1, y: refillY },
    { x: hospitalCenterX + 1, y: refillY },
    { x: hospitalCenterX, y: refillY + 1 },
    { x: hospitalCenterX - 1, y: refillY + 1 },
    { x: hospitalCenterX + 1, y: refillY + 1 }
  ]

  // Find best position
  const startNode = { x: unit.tileX, y: unit.tileY, owner: unit.owner }
  for (const pos of refillPositions) {
    if (pos.x >= 0 && pos.y >= 0 && pos.x < mapGrid[0].length && pos.y < mapGrid.length) {
      const path = getCachedPath(startNode, pos, mapGrid, null, { unitOwner: unit.owner })
      if (path && path.length > 0) {
        unit.path = path
        unit.moveTarget = { x: pos.x * TILE_SIZE, y: pos.y * TILE_SIZE }
        break
      }
    }
  }
}

/**
 * Sends an ambulance to hospital for refilling
 */
function sendAmbulanceToHospital(ambulance, hospital, mapGrid) {
  ambulance.refillingTarget = hospital

  // Calculate path to hospital
  const hospitalCenterX = hospital.x + Math.floor(hospital.width / 2)
  const refillY = hospital.y + hospital.height + 1

  const startNode = { x: ambulance.tileX, y: ambulance.tileY, owner: ambulance.owner }
  const path = getCachedPath(startNode, { x: hospitalCenterX, y: refillY }, mapGrid, null, { unitOwner: ambulance.owner })
  if (path && path.length > 0) {
    ambulance.path = path
    ambulance.moveTarget = { x: hospitalCenterX * TILE_SIZE, y: refillY * TILE_SIZE }
  }
}
