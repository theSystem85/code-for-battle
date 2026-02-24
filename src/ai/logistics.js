// logistics.js - AI logistics management (tankers and ammunition)
import { getCachedPath } from '../game/pathfinding.js'
import { getUnitCommandsHandler } from '../inputHandler.js'

const AUTO_REFUEL_SCAN_INTERVAL = 10000

// Resolve active AI player IDs based on current game setup
function getAIPlayers(gameState) {
  const human = gameState.humanPlayer || 'player1'
  const playerCount = gameState.playerCount || 2
  const allPlayers = ['player1', 'player2', 'player3', 'player4'].slice(0, playerCount)
  return allPlayers.filter(p => p !== human)
}

/**
 * Manages tanker truck refueling and guard behavior for all AI players
 */
export function manageAITankerTrucks(units, gameState, mapGrid) {
  const unitCommands = getUnitCommandsHandler ? getUnitCommandsHandler() : null
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
  const aiPlayers = getAIPlayers(gameState)

  aiPlayers.forEach(aiPlayerId => {
    const aiUnits = units.filter(u => u.owner === aiPlayerId)
    const tankers = aiUnits.filter(u => u.type === 'tankerTruck')
    if (tankers.length === 0) return

    const harvesters = aiUnits.filter(u => u.type === 'harvester' && u.health > 0)
    const gasStations = (gameState.buildings || []).filter(
      b => b.owner === aiPlayerId && b.type === 'gasStation' && b.health > 0
    )
    const refineries = (gameState.buildings || []).filter(
      b => b.owner === aiPlayerId && b.type === 'oreRefinery' && b.health > 0
    )

    const activeAssignments = new Set()
    tankers.forEach(t => {
      if (t.refuelTarget) {
        activeAssignments.add(t.refuelTarget.id)
      }
      const queueState = t.utilityQueue
      if (queueState?.mode === 'refuel') {
        if (queueState.currentTargetId) {
          activeAssignments.add(queueState.currentTargetId)
        }
        if (Array.isArray(queueState.targets)) {
          queueState.targets.forEach(entry => {
            if (!entry) return
            const id = typeof entry === 'object' ? entry.id : entry
            if (id) {
              activeAssignments.add(id)
            }
          })
        }
      }
    })

    // Separate critical (gas <= 0) and low gas units for priority handling
    const criticalUnits = []
    const lowGasUnits = []
    aiUnits.forEach(u => {
      if (u.type === 'tankerTruck' || typeof u.maxGas !== 'number' || u.health <= 0) {
        return
      }
      if (u.gas <= 0) {
        criticalUnits.push(u)
      } else if (u.gas / u.maxGas < 0.5) { // Units below 50% fuel need service
        lowGasUnits.push(u)
      }
    })

    // Designate one tanker as the refinery station tanker if we have harvesters and refineries
    let refineryStationTanker = null
    if (refineries.length > 0 && harvesters.length > 0 && tankers.length > 0) {
      // Find the tanker closest to any refinery to be the station tanker
      let closestDistance = Infinity
      refineries.forEach(refinery => {
        const refineryX = refinery.x + Math.floor(refinery.width / 2)
        const refineryY = refinery.y + refinery.height + 1

        tankers.forEach(tanker => {
          const distance = Math.hypot(tanker.tileX - refineryX, tanker.tileY - refineryY)
          if (distance < closestDistance) {
            closestDistance = distance
            refineryStationTanker = tanker
          }
        })
      })
    }

    tankers.forEach(tanker => {
      // First priority: tanker needs refill
      const needsRefill =
        (typeof tanker.maxGas === 'number' && tanker.gas / tanker.maxGas < 0.2) ||
        (typeof tanker.maxSupplyGas === 'number' &&
          tanker.supplyGas / tanker.maxSupplyGas < 0.2)

      if (needsRefill && gasStations.length > 0) {
        if (unitCommands) {
          unitCommands.clearUtilityQueueState(tanker)
        }
        sendTankerToGasStation(tanker, gasStations[0], mapGrid)
        return
      }

      // Second priority: IMMEDIATE response to critical units (gas <= 0)
      if (criticalUnits.length > 0) {
        // Find the closest critical unit that doesn't already have a tanker assigned
        let target = null
        let bestDistance = Infinity

        criticalUnits.forEach(criticalUnit => {
          // Skip if another tanker is already handling this critical unit
          const alreadyAssigned = tankers.some(otherTanker =>
            otherTanker !== tanker &&
            (otherTanker.emergencyTarget?.id === criticalUnit.id ||
             otherTanker.refuelTarget?.id === criticalUnit.id)
          )
          if (alreadyAssigned) return

          const distance = Math.hypot(criticalUnit.tileX - tanker.tileX, criticalUnit.tileY - tanker.tileY)
          if (distance < bestDistance) {
            bestDistance = distance
            target = criticalUnit
          }
        })

        if (target) {
          // INTERRUPT current non-critical tasks for emergency response
          if (unitCommands) {
            unitCommands.cancelCurrentUtilityTask(tanker)
          }
          if (tanker.refuelTarget && tanker.refuelTarget.gas > 0) {
            tanker.refuelTarget = null
            tanker.refuelTimer = 0
          }
          tanker.guardTarget = null

          sendTankerToUnit(tanker, target, mapGrid, gameState.occupancyMap)
          tanker.emergencyTarget = target // Mark as emergency mission
          tanker.emergencyMode = true
          return
        }
      }

      // Third priority: low gas units
      const queueState = tanker.utilityQueue
      const queueActive = queueState && queueState.mode === 'refuel' && (
        queueState.currentTargetId || (Array.isArray(queueState.targets) && queueState.targets.length > 0)
      )
      if (queueState?.lockedByUser && !queueActive && !queueState.currentTargetId && (!queueState.targets || queueState.targets.length === 0)) {
        queueState.lockedByUser = false
        queueState.source = null
      }

      if (tanker.refuelTarget || queueActive) {
        return
      }

      if (unitCommands && lowGasUnits.length > 0) {
        const nextScan = tanker.nextAITankerScanTime || 0
        if (now >= nextScan) {
          const candidates = lowGasUnits
            .filter(unit => !activeAssignments.has(unit.id))
            .map(unit => ({
              unit,
              ratio: unit.gas / unit.maxGas,
              distance: Math.hypot(unit.tileX - tanker.tileX, unit.tileY - tanker.tileY)
            }))
            .sort((a, b) => {
              if (a.ratio !== b.ratio) return a.ratio - b.ratio
              return a.distance - b.distance
            })
            .map(entry => entry.unit)

          if (candidates.length > 0) {
            unitCommands.setUtilityQueue(tanker, candidates, 'refuel', mapGrid, {
              suppressNotifications: true,
              source: 'auto'
            })
          }
          tanker.nextAITankerScanTime = now + AUTO_REFUEL_SCAN_INTERVAL
        }
        if (queueState && queueState.currentTargetId) {
          return
        }
      } else if (lowGasUnits.length > 0) {
        // Apply cooldown mechanism to prevent frequent target changes
        const nextScan = tanker.nextAITankerScanTime || 0
        if (now < nextScan) {
          // Cooldown not expired, skip target assignment
          return
        }

        const target = lowGasUnits.reduce((best, unit) => {
          const unitRatio = unit.gas / unit.maxGas
          const bestRatio = best ? best.gas / best.maxGas : Infinity
          if (unitRatio < bestRatio) return unit
          if (unitRatio > bestRatio) return best

          const unitDistance = Math.hypot(unit.tileX - tanker.tileX, unit.tileY - tanker.tileY)
          const bestDistance = best
            ? Math.hypot(best.tileX - tanker.tileX, best.tileY - tanker.tileY)
            : Infinity
          return unitDistance < bestDistance ? unit : best
        }, null)

        if (target) {
          sendTankerToUnit(tanker, target, mapGrid, gameState.occupancyMap)
          tanker.nextAITankerScanTime = now + AUTO_REFUEL_SCAN_INTERVAL
          return
        }
      }

      // Fourth priority: station tanker at refinery, others guard harvesters
      if (tanker === refineryStationTanker && refineries.length > 0) {
        // Position the station tanker near the primary refinery
        const primaryRefinery = refineries[0]
        const refineryX = primaryRefinery.x + Math.floor(primaryRefinery.width / 2)
        const refineryY = primaryRefinery.y + primaryRefinery.height + 1
        const distance = Math.hypot(tanker.tileX - refineryX, tanker.tileY - refineryY)

        // If the tanker is far from the refinery, send it there
        if (distance > 5) {
          const startNode = { x: tanker.tileX, y: tanker.tileY, owner: tanker.owner }
          const path = getCachedPath(startNode, { x: refineryX, y: refineryY }, mapGrid, null, { unitOwner: tanker.owner })
          if (path && path.length > 1) {
            tanker.path = path.slice(1)
            tanker.moveTarget = { x: refineryX, y: refineryY }
          }
        }
        tanker.guardTarget = null
      } else if (harvesters.length > 0) {
        // Other tankers guard harvesters
        const guardTarget = harvesters.find(h => !lowGasUnits.includes(h) && !criticalUnits.includes(h)) || harvesters[0]
        if (!tanker.guardTarget || tanker.guardTarget.health <= 0 || tanker.guardTarget.id !== guardTarget.id) {
          tanker.guardTarget = guardTarget
        }
      }
    })
  })
}

function sendTankerToGasStation(tanker, station, mapGrid) {
  const cx = station.x + Math.floor(station.width / 2)
  const cy = station.y + station.height + 1
  const startNode = { x: tanker.tileX, y: tanker.tileY, owner: tanker.owner }
  const path = getCachedPath(startNode, { x: cx, y: cy }, mapGrid, null, { unitOwner: tanker.owner })
  if (path && path.length > 1) {
    tanker.path = path.slice(1)
    tanker.moveTarget = { x: cx, y: cy }
  }
  tanker.guardTarget = null
}

function sendTankerToUnit(tanker, unit, mapGrid, occupancyMap) {
  // Set the refuel target BEFORE pathfinding, just like player tanker commands
  tanker.refuelTarget = unit
  tanker.refuelTimer = 0

  // Try to find an adjacent position to the target unit (like player tanker commands do)
  const targetTileX = unit.tileX
  const targetTileY = unit.tileY
  const directions = [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
  ]

  const startNode = { x: tanker.tileX, y: tanker.tileY, owner: tanker.owner }
  for (const dir of directions) {
    const destX = targetTileX + dir.x
    const destY = targetTileY + dir.y
    if (destX >= 0 && destY >= 0 && destX < mapGrid[0].length && destY < mapGrid.length) {
      const path = getCachedPath(startNode, { x: destX, y: destY }, mapGrid, occupancyMap, { unitOwner: tanker.owner })
      if (path && path.length > 0) {
        tanker.path = path.slice(1)
        tanker.moveTarget = { x: destX, y: destY }
        break
      }
    }
  }

  // Path not found - no fallback action needed

  tanker.guardTarget = null
}

/**
 * Manages ammunition supply truck deployment and resupply operations for all AI players
 * Implements FR-031, FR-034, FR-036
 */
export function manageAIAmmunitionTrucks(units, gameState, mapGrid) {
  const aiPlayers = getAIPlayers(gameState)

  aiPlayers.forEach(aiPlayerId => {
    const aiUnits = units.filter(u => u.owner === aiPlayerId)
    const ammoTrucks = aiUnits.filter(u => u.type === 'ammunitionTruck' && u.health > 0)
    if (ammoTrucks.length === 0) return

    const ammoFactories = (gameState.buildings || []).filter(
      b => b.owner === aiPlayerId && b.type === 'ammunitionFactory' && b.health > 0
    )

    // Separate critical (ammo <= 0) and low ammo units for priority handling
    const criticalUnits = []
    const lowAmmoUnits = []
    aiUnits.forEach(u => {
      if (u.type === 'ammunitionTruck' || u.health <= 0) return

      // Check for units with ammunition system (maxAmmunition or maxRocketAmmo)
      const hasAmmoSystem = typeof u.maxAmmunition === 'number' || typeof u.maxRocketAmmo === 'number'
      if (!hasAmmoSystem) return

      const maxAmmo = u.isAirUnit ? u.maxRocketAmmo : u.maxAmmunition
      const currentAmmo = u.isAirUnit ? u.rocketAmmo : u.ammunition

      if (currentAmmo <= 0) {
        criticalUnits.push(u)
      } else if (currentAmmo / maxAmmo < 0.2) { // 20% threshold for low ammunition
        lowAmmoUnits.push(u)
      }
    })

    ammoTrucks.forEach(truck => {
      // First priority: truck needs reload
      const needsReload = typeof truck.maxAmmoCargo === 'number' && truck.ammoCargo / truck.maxAmmoCargo < 0.2

      if (needsReload && ammoFactories.length > 0) {
        sendAmmoTruckToFactory(truck, ammoFactories[0], mapGrid)
        return
      }

      // Second priority: IMMEDIATE response to critical units (ammo <= 0)
      if (criticalUnits.length > 0 && truck.ammoCargo > 0) {
        let target = null
        let bestDistance = Infinity

        criticalUnits.forEach(criticalUnit => {
          // Skip if another truck is already handling this critical unit
          const alreadyAssigned = ammoTrucks.some(otherTruck =>
            otherTruck !== truck &&
            otherTruck.ammoResupplyTarget?.id === criticalUnit.id
          )
          if (alreadyAssigned) return

          const distance = Math.hypot(criticalUnit.tileX - truck.tileX, criticalUnit.tileY - truck.tileY)
          if (distance < bestDistance) {
            bestDistance = distance
            target = criticalUnit
          }
        })

        if (target) {
          sendAmmoTruckToUnit(truck, target, mapGrid, gameState.occupancyMap)
          return
        }
      }

      // Third priority: low ammo units
      if (lowAmmoUnits.length > 0 && truck.ammoCargo > 0) {
        let target = lowAmmoUnits[0]
        let best = Math.hypot(target.tileX - truck.tileX, target.tileY - truck.tileY)
        lowAmmoUnits.forEach(u => {
          const d = Math.hypot(u.tileX - truck.tileX, u.tileY - truck.tileY)
          if (d < best) {
            best = d
            target = u
          }
        })
        sendAmmoTruckToUnit(truck, target, mapGrid, gameState.occupancyMap)
        return
      }

      // Fourth priority: follow combat groups at safe distance
      const combatUnits = aiUnits.filter(u =>
        (u.type === 'tank_v1' || u.type === 'tank-v2' || u.type === 'tank-v3' || u.type === 'rocketTank') &&
        u.health > 0
      )
      if (combatUnits.length > 0) {
        // Find center of mass of combat group
        let centerX = 0
        let centerY = 0
        combatUnits.forEach(u => {
          centerX += u.tileX
          centerY += u.tileY
        })
        centerX = Math.floor(centerX / combatUnits.length)
        centerY = Math.floor(centerY / combatUnits.length)

        // Stay 3-5 tiles behind the combat group
        const distance = Math.hypot(truck.tileX - centerX, truck.tileY - centerY)
        if (distance > 7 || distance < 3) {
          // Move to maintain safe distance
          const angle = Math.atan2(truck.tileY - centerY, truck.tileX - centerX)
          const targetX = Math.floor(centerX + Math.cos(angle) * 5)
          const targetY = Math.floor(centerY + Math.sin(angle) * 5)

          if (targetX >= 0 && targetY >= 0 && targetX < mapGrid[0].length && targetY < mapGrid.length) {
            const startNode = { x: truck.tileX, y: truck.tileY, owner: truck.owner }
            const path = getCachedPath(startNode, { x: targetX, y: targetY }, mapGrid, null, { unitOwner: truck.owner })
            if (path && path.length > 1) {
              truck.path = path.slice(1)
              truck.moveTarget = { x: targetX, y: targetY }
            }
          }
        }
      }
    })
  })
}

function sendAmmoTruckToFactory(truck, factory, mapGrid) {
  const cx = factory.x + Math.floor(factory.width / 2)
  const cy = factory.y + factory.height + 1
  const startNode = { x: truck.tileX, y: truck.tileY, owner: truck.owner }
  const path = getCachedPath(startNode, { x: cx, y: cy }, mapGrid, null, { unitOwner: truck.owner })
  if (path && path.length > 1) {
    truck.path = path.slice(1)
    truck.moveTarget = { x: cx, y: cy }
  }
  // Clear any existing resupply target
  truck.ammoResupplyTarget = null
}

function sendAmmoTruckToUnit(truck, unit, mapGrid, occupancyMap) {
  // Set the resupply target BEFORE pathfinding
  truck.ammoResupplyTarget = unit
  truck.ammoResupplyTimer = 0

  // Try to find an adjacent position to the target unit
  const targetTileX = unit.tileX
  const targetTileY = unit.tileY
  const directions = [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
  ]

  const startNode = { x: truck.tileX, y: truck.tileY, owner: truck.owner }
  for (const dir of directions) {
    const destX = targetTileX + dir.x
    const destY = targetTileY + dir.y
    if (destX >= 0 && destY >= 0 && destX < mapGrid[0].length && destY < mapGrid.length) {
      const path = getCachedPath(startNode, { x: destX, y: destY }, mapGrid, occupancyMap, { unitOwner: truck.owner })
      if (path && path.length > 0) {
        truck.path = path.slice(1)
        truck.moveTarget = { x: destX, y: destY }
        break
      }
    }
  }
}

/**
 * Monitors AI unit ammunition levels and triggers resupply retreats
 * Implements FR-032, FR-033
 */
export function manageAIAmmunitionMonitoring(units, gameState, mapGrid) {
  const aiPlayers = getAIPlayers(gameState)

  aiPlayers.forEach(aiPlayerId => {
    const aiUnits = units.filter(u => u.owner === aiPlayerId && u.health > 0)
    const ammoFactories = (gameState.buildings || []).filter(
      b => b.owner === aiPlayerId && b.type === 'ammunitionFactory' && b.health > 0
    )
    const ammoTrucks = aiUnits.filter(u => u.type === 'ammunitionTruck' && u.health > 0)

    aiUnits.forEach(unit => {
      // Skip units without ammunition system
      const hasAmmoSystem = typeof unit.maxAmmunition === 'number' || typeof unit.maxRocketAmmo === 'number'
      if (!hasAmmoSystem || unit.type === 'ammunitionTruck') return

      const maxAmmo = unit.isAirUnit ? unit.maxRocketAmmo : unit.maxAmmunition
      const currentAmmo = unit.isAirUnit ? unit.rocketAmmo : unit.ammunition
      const ammoPercentage = currentAmmo / maxAmmo

      // FR-033: Retreat logic when ammunition falls below 20%
      if (ammoPercentage < 0.2 && !unit.retreatingForAmmo) {
        unit.retreatingForAmmo = true

        // Find nearest resupply point (factory or truck)
        let nearestResupply = null
        let nearestDistance = Infinity

        // Check ammunition factories
        ammoFactories.forEach(factory => {
          const distance = Math.hypot(
            unit.tileX - (factory.x + Math.floor(factory.width / 2)),
            unit.tileY - (factory.y + Math.floor(factory.height / 2))
          )
          if (distance < nearestDistance) {
            nearestDistance = distance
            nearestResupply = { type: 'factory', target: factory }
          }
        })

        // Check ammunition trucks with cargo
        ammoTrucks.forEach(truck => {
          if (truck.ammoCargo > 0) {
            const distance = Math.hypot(unit.tileX - truck.tileX, unit.tileY - truck.tileY)
            if (distance < nearestDistance) {
              nearestDistance = distance
              nearestResupply = { type: 'truck', target: truck }
            }
          }
        })

        // Path to nearest resupply point
        if (nearestResupply) {
          let targetX, targetY
          if (nearestResupply.type === 'factory') {
            targetX = nearestResupply.target.x + Math.floor(nearestResupply.target.width / 2)
            targetY = nearestResupply.target.y + nearestResupply.target.height + 1
          } else {
            targetX = nearestResupply.target.tileX
            targetY = nearestResupply.target.tileY
          }

          const startNode = { x: unit.tileX, y: unit.tileY, owner: unit.owner }
          const path = getCachedPath(startNode, { x: targetX, y: targetY }, mapGrid, gameState.occupancyMap, { unitOwner: unit.owner })
          if (path && path.length > 1) {
            // Cancel current attack/move commands
            unit.target = null
            unit.path = path.slice(1)
            unit.moveTarget = { x: targetX, y: targetY }
          }
        }
      } else if (ammoPercentage >= 0.8 && unit.retreatingForAmmo) {
        // Resume normal operations after resupply
        unit.retreatingForAmmo = false
      }
    })
  })
}
