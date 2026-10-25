import { TILE_SIZE, MAX_BUILDING_GAP_TILES } from '../config.js'
import { findPath, createUnit } from '../units.js'
import { updateUnitSpeedModifier, getUnitCost } from '../utils.js'
import { gameState } from '../gameState.js'
import { playSound } from '../sound.js'
import { logPerformance } from '../performanceUtils.js'
import { getWreckById, removeWreckById } from './unitWreckManager.js'
import { getBaseStructures, isWithinBaseRange } from '../utils/baseUtils.js'
import { getServiceRadiusPixels } from '../utils/serviceRadius.js'
import { addMovableOccupancy } from './occupancyTags.js'

function initWorkshop(workshop) {
  if (!workshop.repairSlots) {
    workshop.repairSlots = []
    for (let x = workshop.x - 1; x <= workshop.x + workshop.width; x++) {
      for (let y = workshop.y - 1; y <= workshop.y + workshop.height; y++) {
        const around = x === workshop.x - 1 || x === workshop.x + workshop.width ||
                       y === workshop.y - 1 || y === workshop.y + workshop.height
        if (around) {
          workshop.repairSlots.push({ x, y, unit: null })
        }
      }
    }
    workshop.repairQueue = []
  }
}

function isTilePassable(tileX, tileY, mapGrid) {
  const row = mapGrid?.[tileY]
  if (!row) return false
  const tile = row[tileX]
  if (!tile) return false
  if (tile.type === 'water' || tile.type === 'rock') return false
  if (tile.seedCrystal) return false
  if (tile.building) return false
  return true
}

function isTileOccupied(tileX, tileY, occupancyMap, units) {
  if (occupancyMap && occupancyMap[tileY] && occupancyMap[tileY][tileX]) {
    if (occupancyMap[tileY][tileX] > 0) return true
  }

  if (Array.isArray(units)) {
    const occupiedByUnit = units.some(unit => {
      const centerTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
      const centerTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
      return centerTileX === tileX && centerTileY === tileY
    })
    if (occupiedByUnit) return true
  }

  if (Array.isArray(gameState.unitWrecks)) {
    const occupiedByWreck = gameState.unitWrecks.some(wreck => {
      const centerTileX = Math.floor((wreck.x + TILE_SIZE / 2) / TILE_SIZE)
      const centerTileY = Math.floor((wreck.y + TILE_SIZE / 2) / TILE_SIZE)
      return centerTileX === tileX && centerTileY === tileY
    })
    if (occupiedByWreck) return true
  }

  return false
}

function findNearestFreeTile(originX, originY, mapGrid, occupancyMap, units, maxDistance = 8, predicate = () => true, allowOccupied = false) {
  for (let distance = 0; distance <= maxDistance; distance++) {
    for (let dx = -distance; dx <= distance; dx++) {
      for (let dy = -distance; dy <= distance; dy++) {
        if (Math.abs(dx) !== distance && Math.abs(dy) !== distance) continue

        const tileX = originX + dx
        const tileY = originY + dy

        if (!predicate(tileX, tileY)) continue
        if (!isTilePassable(tileX, tileY, mapGrid)) continue
        if (!allowOccupied && isTileOccupied(tileX, tileY, occupancyMap, units)) continue

        return { x: tileX, y: tileY }
      }
    }
  }

  return null
}

function withdrawRepairFunds(unit, amount) {
  if (!unit || amount <= 0) {
    return 0
  }

  const owner = unit.owner
  if (owner === gameState.humanPlayer) {
    const available = typeof gameState.money === 'number' ? gameState.money : 0
    const paid = Math.min(amount, Math.max(0, available))
    if (paid > 0) {
      gameState.money -= paid
    }
    return paid
  }

  if (Array.isArray(gameState.factories)) {
    const factory = gameState.factories.find(f => f && (f.owner === owner || f.id === owner))
    if (factory && typeof factory.budget === 'number' && factory.budget > 0) {
      const paid = Math.min(amount, Math.max(0, factory.budget))
      if (paid > 0) {
        factory.budget -= paid
      }
      return paid
    }
  }

  return 0
}

function getWorkshopSpawnOrigin(workshop, mapGrid) {
  const maxY = Math.max(0, mapGrid.length - 1)
  const maxX = Math.max(0, mapGrid[0]?.length - 1 || 0)
  const centerX = Math.min(maxX, Math.max(0, Math.floor(workshop.x + workshop.width / 2)))
  const spawnY = Math.min(maxY, Math.max(0, workshop.y + workshop.height))
  return { x: centerX, y: spawnY }
}

function findWorkshopSpawnTile(workshop, mapGrid, occupancyMap, units) {
  const origin = getWorkshopSpawnOrigin(workshop, mapGrid)
  const spawnTile = findNearestFreeTile(origin.x, origin.y, mapGrid, occupancyMap, units, 12)
  return spawnTile || origin
}

function validateWorkshopRallyPoint(workshop, mapGrid, occupancyMap, units) {
  const owner = workshop.owner || gameState.humanPlayer
  const spawnOrigin = getWorkshopSpawnOrigin(workshop, mapGrid)
  const current = workshop.rallyPoint

  if (current && isWithinBaseRange(current.x, current.y, owner) && isTilePassable(current.x, current.y, mapGrid)) {
    return current
  }

  const baseStructures = getBaseStructures(owner)
  if (baseStructures.length === 0) {
    return current && isTilePassable(current.x, current.y, mapGrid) ? current : spawnOrigin
  }

  for (const base of baseStructures) {
    const centerX = Math.floor(base.x + base.width / 2)
    const centerY = Math.floor(base.y + base.height / 2)
    const startPositions = [
      { x: centerX, y: base.y + base.height },
      { x: centerX, y: base.y - 1 },
      { x: base.x - 1, y: centerY },
      { x: base.x + base.width, y: centerY }
    ]

    for (const pos of startPositions) {
      const fallback = findNearestFreeTile(
        pos.x,
        pos.y,
        mapGrid,
        occupancyMap,
        units,
        MAX_BUILDING_GAP_TILES,
        (tileX, tileY) => isWithinBaseRange(tileX, tileY, owner),
        true
      )
      if (fallback) {
        return fallback
      }
    }
  }

  return spawnOrigin
}

function assignUnitsToSlots(workshop, mapGrid) {
  initWorkshop(workshop)

  // Process queue in order - only assign the first eligible unit to avoid congestion
  let index = 0
  while (index < workshop.repairQueue.length) {
    const slot = workshop.repairSlots.find(s => !s.unit)
    if (!slot) break // No available slots

    const unit = workshop.repairQueue[index]
    if (!unit || unit.health <= 0) {
      if (unit) {
        delete unit.workshopRepairCost
        delete unit.workshopRepairPaid
        delete unit.workshopStartHealth
        delete unit.targetWorkshop
      }
      workshop.repairQueue.splice(index, 1)
      continue
    }

    const distToWorkshop = Math.hypot(
      unit.tileX - (workshop.x + workshop.width / 2),
      unit.tileY - (workshop.y + workshop.height / 2)
    )

    if (distToWorkshop <= 3) {
      workshop.repairQueue.splice(index, 1)
      slot.unit = unit
      unit.repairSlot = slot

      const path = findPath(
        { x: unit.tileX, y: unit.tileY, owner: unit.owner },
        { x: slot.x, y: slot.y },
        mapGrid,
        gameState.occupancyMap,
        undefined,
        { unitOwner: unit.owner }
      )

      if (path && path.length > 1) {
        unit.path = path.slice(1)
        unit.moveTarget = { x: slot.x, y: slot.y }
      } else {
        unit.x = slot.x * TILE_SIZE
        unit.y = slot.y * TILE_SIZE
        unit.tileX = slot.x
        unit.tileY = slot.y
      }

      // Only assign one unit per update cycle to prevent congestion
      break
    } else {
      index++
    }
  }
}

function processWorkshopRestoration(workshop, units, mapGrid, delta) {
  // Initialize restoration queue if not present
  if (!workshop.restorationQueue) {
    workshop.restorationQueue = []
  }

  // Check if workshop is currently restoring something
  if (workshop.currentRestoration) {
    const restoration = workshop.currentRestoration

    // Check if wreck still exists
    const wreck = getWreckById(gameState, restoration.wreckId)
    if (!wreck) {
      // Wreck was destroyed, cancel restoration
      workshop.currentRestoration = null
      workshop.restorationProgress = 0
      playSound('repairCancelled', 0.6)
      return
    }

    // Update restoration progress
    restoration.elapsed = (restoration.elapsed || 0) + delta
    const progress = Math.min(restoration.elapsed / restoration.buildDuration, 1)
    workshop.restorationProgress = progress

    // Position wreck on workshop center during restoration
    const centerTileX = Math.floor(workshop.x + workshop.width / 2)
    const centerTileY = Math.floor(workshop.y + workshop.height / 2)
    wreck.x = centerTileX * TILE_SIZE
    wreck.y = centerTileY * TILE_SIZE
    wreck.tileX = centerTileX
    wreck.tileY = centerTileY
    wreck.isBeingRestored = true

    // Check if restoration is complete
    if (progress >= 1) {
      const occupancyMap = gameState.occupancyMap
      const spawnTile = findWorkshopSpawnTile(workshop, mapGrid, occupancyMap, units)
      const rallyPoint = validateWorkshopRallyPoint(workshop, mapGrid, occupancyMap, units)
      if (rallyPoint) {
        workshop.rallyPoint = { x: rallyPoint.x, y: rallyPoint.y }
      }

      const restored = createUnit(
        { owner: workshop.owner },
        restoration.unitType,
        spawnTile.x,
        spawnTile.y,
        { buildDuration: restoration.buildDuration }
      )
      restored.isRestoredFromWreck = true

      // Remove crew and fuel for freshly restored units
      if (restored.crew) {
        Object.keys(restored.crew).forEach(role => {
          restored.crew[role] = false
        })
      }

      if (typeof restored.gas === 'number') {
        restored.gas = 0
        restored.outOfGasPlayed = false
        restored.needsEmergencyFuel = true
        restored.emergencyFuelRequestTime = performance.now()
      }

      restored.health = restored.maxHealth
      restored.x = spawnTile.x * TILE_SIZE
      restored.y = spawnTile.y * TILE_SIZE
      restored.tileX = spawnTile.x
      restored.tileY = spawnTile.y

      // Face south as units leave the workshop
      restored.direction = Math.PI / 2
      if (restored.turretDirection !== undefined) {
        restored.turretDirection = Math.PI / 2
      }

      const moveTarget = rallyPoint && (rallyPoint.x !== spawnTile.x || rallyPoint.y !== spawnTile.y)
        ? { x: rallyPoint.x, y: rallyPoint.y }
        : null

      if (moveTarget) {
        const path = findPath(
          { x: spawnTile.x, y: spawnTile.y, owner: restored.owner },
          moveTarget,
          mapGrid,
          occupancyMap,
          undefined,
          { unitOwner: restored.owner }
        )

        if (path && path.length > 1) {
          restored.path = path.slice(1)
          restored.moveTarget = { x: moveTarget.x, y: moveTarget.y }
        } else if (path && path.length === 1) {
          restored.path = []
          restored.moveTarget = { x: moveTarget.x, y: moveTarget.y }
        }
      }

      if (restored.moveTarget) {
        restored.restorationMoveOverride = true
        restored.restorationMoveTarget = { x: restored.moveTarget.x, y: restored.moveTarget.y }
      } else {
        restored.restorationMoveOverride = false
        restored.restorationMoveTarget = null
      }

      // Prevent freshly restored units that are automatically heading to the rally point
      // from being immediately targeted again by recovery tanks.
      restored.restorationProtectedFromRecovery = Boolean(restored.moveTarget)

      units.push(restored)

      if (occupancyMap) {
        const centerX = Math.floor((restored.x + TILE_SIZE / 2) / TILE_SIZE)
        const centerY = Math.floor((restored.y + TILE_SIZE / 2) / TILE_SIZE)
        if (
          centerY >= 0 &&
          centerY < occupancyMap.length &&
          centerX >= 0 &&
          centerX < occupancyMap[0].length
        ) {
          occupancyMap[centerY][centerX] = addMovableOccupancy(occupancyMap[centerY][centerX], 1)
        }
      }

      // Remove wreck
      removeWreckById(gameState, wreck.id)

      // Clear restoration state
      workshop.currentRestoration = null
      workshop.restorationProgress = 0

      // Play completion sound
      playSound('repairFinished', 0.8)
    }
  } else if (workshop.restorationQueue.length > 0) {
    // Start next restoration
    const nextInQueue = workshop.restorationQueue.shift()
    const wreck = getWreckById(gameState, nextInQueue.wreckId)

    if (wreck) {
      // Start restoration
      workshop.currentRestoration = {
        wreckId: nextInQueue.wreckId,
        unitType: nextInQueue.unitType,
        buildDuration: nextInQueue.buildDuration,
        elapsed: 0,
        startedAt: performance.now()
      }
      workshop.restorationProgress = 0

      // Position wreck on workshop center
      const centerTileX = Math.floor(workshop.x + workshop.width / 2)
      const centerTileY = Math.floor(workshop.y + workshop.height / 2)
      wreck.x = centerTileX * TILE_SIZE
      wreck.y = centerTileY * TILE_SIZE
      wreck.tileX = centerTileX
      wreck.tileY = centerTileY
      wreck.isBeingRestored = true

      // Update occupancy for wreck
      const occupancyMap = gameState.occupancyMap
      if (occupancyMap) {
        const centerX = Math.floor((wreck.x + TILE_SIZE / 2) / TILE_SIZE)
        const centerY = Math.floor((wreck.y + TILE_SIZE / 2) / TILE_SIZE)
        if (
          centerY >= 0 &&
          centerY < occupancyMap.length &&
          centerX >= 0 &&
          centerX < occupancyMap[0].length
        ) {
          // Note: We should use adjustWreckOccupancy from unitWreckManager but it's not exported
          // For now, we'll handle it directly
          if (wreck.occupancyTileX !== null && wreck.occupancyTileY !== null) {
            const prevY = wreck.occupancyTileY
            const prevX = wreck.occupancyTileX
            if (
              prevY >= 0 &&
              prevY < occupancyMap.length &&
              prevX >= 0 &&
              prevX < occupancyMap[prevY].length
            ) {
              occupancyMap[prevY][prevX] = addMovableOccupancy(occupancyMap[prevY][prevX], -1)
            }
          }
          occupancyMap[centerY][centerX] = addMovableOccupancy(occupancyMap[centerY][centerX], 1)
          wreck.occupancyTileX = centerX
          wreck.occupancyTileY = centerY
        }
      }

      playSound('unit_is_being_repaired', 0.7)
    }
  }
}

export const updateWorkshopLogic = logPerformance(function updateWorkshopLogic(units, buildings, mapGrid, delta) {
  const workshops = buildings.filter(b => b.type === 'vehicleWorkshop')
  workshops.forEach(workshop => {
    initWorkshop(workshop)

    // Process workshop restoration queue
    processWorkshopRestoration(workshop, units, mapGrid, delta)

    const serviceRadius = getServiceRadiusPixels(workshop)
    if (serviceRadius > 0) {
      const workshopCenterX = (workshop.x + workshop.width / 2) * TILE_SIZE
      const workshopCenterY = (workshop.y + workshop.height / 2) * TILE_SIZE

      units.forEach(unit => {
        if (!unit || unit.health <= 0) return
        if (unit.owner !== workshop.owner) return
        if (typeof unit.maxHealth !== 'number' || unit.health >= unit.maxHealth) return
        if (unit.repairingAtWorkshop) return
        if (unit.returningToWorkshop) return
        if (unit.targetWorkshop && unit.targetWorkshop !== workshop) return
        if (workshop.repairQueue.includes(unit)) return
        if (unit.movement && unit.movement.isMoving) return

        const unitX = typeof unit.x === 'number' ? unit.x : unit.tileX * TILE_SIZE
        const unitY = typeof unit.y === 'number' ? unit.y : unit.tileY * TILE_SIZE
        const unitCenterX = unitX + TILE_SIZE / 2
        const unitCenterY = unitY + TILE_SIZE / 2
        const distance = Math.hypot(unitCenterX - workshopCenterX, unitCenterY - workshopCenterY)

        if (distance <= serviceRadius) {
          workshop.repairQueue.push(unit)
          unit.targetWorkshop = workshop
          if (!unit.returnTile) {
            unit.returnTile = { x: unit.tileX, y: unit.tileY }
          }
        }
      })
    }

    assignUnitsToSlots(workshop, mapGrid)
    workshop.repairSlots.forEach(slot => {
      const unit = slot.unit
      if (!unit) return
      if (unit.health <= 0) {
        // Clean up repair cost tracking and workshop assignment
        delete unit.workshopRepairCost
        delete unit.workshopRepairPaid
        delete unit.workshopStartHealth
        delete unit.targetWorkshop
        slot.unit = null
        return
      }
      const dist = Math.hypot(unit.x - slot.x * TILE_SIZE, unit.y - slot.y * TILE_SIZE)

      // Check if unit has been moved away from workshop (new path or move target)
      if (unit.repairingAtWorkshop && (
        unit.path.length > 0 ||
          (unit.moveTarget && (unit.moveTarget.x !== slot.x || unit.moveTarget.y !== slot.y)) ||
          (unit.movement && unit.movement.isMoving)
      )) {
        // Unit is being moved away, clean up repair state and workshop assignment
        unit.repairingAtWorkshop = false
        unit.returningToWorkshop = false
        slot.unit = null
        unit.repairSlot = null
        delete unit.workshopRepairCost
        delete unit.workshopRepairPaid
        delete unit.workshopStartHealth
        delete unit.targetWorkshop
        return
      }
      if (!unit.repairingAtWorkshop) {
        if (dist < TILE_SIZE / 3 && !(unit.movement && unit.movement.isMoving)) {
          unit.repairingAtWorkshop = true
          unit.path = []
          unit.moveTarget = null

          // Calculate repair cost (30% of unit cost based on missing health)
          const unitCost = getUnitCost(unit.type)
          const healthPercentageMissing = (unit.maxHealth - unit.health) / unit.maxHealth
          const totalRepairCost = Math.ceil(unitCost * 0.3 * healthPercentageMissing)

          // Initialize repair cost tracking
          unit.workshopRepairCost = totalRepairCost
          unit.workshopRepairPaid = 0
          unit.workshopStartHealth = unit.health

          // Play repair sound when repair starts
          playSound('unit_is_being_repaired', 0.7)

          if (unit.movement) {
            unit.movement.velocity = { x: 0, y: 0 }
            unit.movement.targetVelocity = { x: 0, y: 0 }
            unit.movement.isMoving = false
            unit.movement.currentSpeed = 0
          }
        }
      } else {
        if (unit.health < unit.maxHealth) {
          const previousHealth = unit.health
          const healthIncrease = unit.maxHealth * 0.06 * (delta / 1000)
          const desiredHealth = Math.min(previousHealth + healthIncrease, unit.maxHealth)

          const startHealth = typeof unit.workshopStartHealth === 'number'
            ? unit.workshopStartHealth
            : previousHealth
          const totalHealthToRepair = Math.max(0, unit.maxHealth - startHealth)

          let costThisFrame = 0
          if (unit.workshopRepairCost && unit.workshopRepairPaid < unit.workshopRepairCost) {
            const repairedHealth = Math.max(0, desiredHealth - startHealth)
            const repairProgress = totalHealthToRepair > 0 ? repairedHealth / totalHealthToRepair : 1
            const expectedPaid = Math.min(repairProgress * unit.workshopRepairCost, unit.workshopRepairCost)
            costThisFrame = expectedPaid - (unit.workshopRepairPaid || 0)

            if (costThisFrame > 0) {
              const paid = withdrawRepairFunds(unit, costThisFrame)
              if (paid > 0) {
                unit.workshopRepairPaid = (unit.workshopRepairPaid || 0) + paid
                unit.totalRepairPaid = (unit.totalRepairPaid || 0) + paid
              }
            }
          }

          let allowedHealth = desiredHealth
          if (unit.workshopRepairCost && unit.workshopRepairCost > 0 && totalHealthToRepair > 0) {
            const paidProgress = Math.min(1, (unit.workshopRepairPaid || 0) / unit.workshopRepairCost)
            const paidHealth = startHealth + totalHealthToRepair * paidProgress
            allowedHealth = Math.min(allowedHealth, paidHealth)
          }

          unit.health = Math.max(previousHealth, Math.min(allowedHealth, unit.maxHealth))
          updateUnitSpeedModifier(unit)
        } else {
          // Repair complete - clean up cost tracking and workshop assignment
          unit.repairingAtWorkshop = false
          unit.returningToWorkshop = false
          slot.unit = null
          unit.repairSlot = null
          delete unit.workshopRepairCost
          delete unit.workshopRepairPaid
          delete unit.workshopStartHealth
          delete unit.targetWorkshop // Clear workshop assignment

          if (unit.returnTile) {
            const path = findPath(
              { x: unit.tileX, y: unit.tileY, owner: unit.owner },
              unit.returnTile,
              mapGrid,
              gameState.occupancyMap,
              undefined,
              { unitOwner: unit.owner }
            )
            if (path && path.length > 1) {
              unit.path = path.slice(1)
              unit.moveTarget = { x: unit.returnTile.x, y: unit.returnTile.y }
              unit.returningFromWorkshop = true
            } else {
              unit.returningFromWorkshop = false
              unit.returnTile = null
            }
          } else if (workshop.rallyPoint) {
            const path = findPath(
              { x: unit.tileX, y: unit.tileY, owner: unit.owner },
              workshop.rallyPoint,
              mapGrid,
              gameState.occupancyMap,
              undefined,
              { unitOwner: unit.owner }
            )
            if (path && path.length > 1) {
              unit.path = path.slice(1)
              unit.moveTarget = { x: workshop.rallyPoint.x, y: workshop.rallyPoint.y }
            }
          }
          assignUnitsToSlots(workshop, mapGrid)
        }
      }
    })
  })
}, false)
