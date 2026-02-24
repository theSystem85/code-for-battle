import {
  APACHE_RANGE_REDUCTION,
  HOWITZER_FIRE_RANGE,
  SHADOW_OF_WAR_CONFIG,
  TANK_FIRE_RANGE,
  TILE_SIZE
} from '../config.js'
import { gameState } from '../gameState.js'
import { playSound, playPositionalSound } from '../sound.js'
import { showNotification } from '../ui/notifications.js'
import { isForceAttackModifierActive, isGuardModifierActive } from '../utils/inputUtils.js'
import { findWreckAtTile } from '../game/unitWreckManager.js'
import { initiateRetreat } from '../behaviours/retreat.js'
import * as mineInput from './mineInputHandler.js'
import { isWithinBaseRange } from '../utils/baseUtils.js'
import {
  isRallyPointTileBlocked,
  shouldStartUtilityQueueMode,
  isOverRecoveryTankAt,
  isOverDamagedUnitAt,
  selectWreck
} from './mouseHelpers.js'
import {
  handleForceAttackCommand,
  handleGuardCommand,
  handleServiceProviderClick,
  handleFallbackCommand
} from './mouseCommands.js'
import { getUnitSelectionCenter } from './selectionManager.js'

export function processUtilityQueueSelection(handler, units, mapGrid, selectedUnits, selectionManager, unitCommands) {
  if (!unitCommands) {
    return false
  }

  const x1 = Math.min(handler.selectionStart.x, handler.selectionEnd.x)
  const y1 = Math.min(handler.selectionStart.y, handler.selectionEnd.y)
  const x2 = Math.max(handler.selectionStart.x, handler.selectionEnd.x)
  const y2 = Math.max(handler.selectionStart.y, handler.selectionEnd.y)

  const selectedIds = new Set(selectedUnits.map(unit => unit.id))
  const healTargets = []
  const refuelTargets = []
  const repairTargets = []
  const ammoTargets = []
  const wreckTargets = []

  units.forEach(unit => {
    if (!unit || selectedIds.has(unit.id)) return
    if (!selectionManager.isHumanPlayerUnit(unit)) return
    if (unit.health <= 0) return

    const { centerX, centerY } = getUnitSelectionCenter(unit)
    if (centerX < x1 || centerX > x2 || centerY < y1 || centerY > y2) return

    if (unit.crew && typeof unit.crew === 'object' && Object.values(unit.crew).some(alive => !alive)) {
      healTargets.push(unit)
    }
    if (typeof unit.maxGas === 'number' && unit.gas < unit.maxGas) {
      refuelTargets.push(unit)
    }
    if (unit.health < unit.maxHealth) {
      repairTargets.push(unit)
    }
    const needsAmmo = (unit.type === 'apache'
      ? typeof unit.maxRocketAmmo === 'number' && unit.rocketAmmo < unit.maxRocketAmmo
      : typeof unit.maxAmmunition === 'number' && unit.ammunition < unit.maxAmmunition)
    if (needsAmmo) {
      ammoTargets.push(unit)
    }
  })

  const wrecks = gameState.unitWrecks || []
  wrecks.forEach(wreck => {
    const centerX = wreck.x + TILE_SIZE / 2
    const centerY = wreck.y + TILE_SIZE / 2
    if (centerX < x1 || centerX > x2 || centerY < y1 || centerY > y2) return
    if (wreck.isBeingRestored || wreck.towedBy || wreck.isBeingRecycled) return
    wreckTargets.push({ ...wreck, isWreckTarget: true, queueAction: 'tow' })
  })

  let anyQueued = false
  const ambulances = selectedUnits.filter(unit => unit.type === 'ambulance')
  if (ambulances.length > 0 && healTargets.length > 0) {
    if (unitCommands.queueUtilityTargets(ambulances, healTargets, 'heal', mapGrid)) {
      anyQueued = true
    }
  }

  const tankers = selectedUnits.filter(unit => unit.type === 'tankerTruck')
  if (tankers.length > 0 && refuelTargets.length > 0) {
    if (unitCommands.queueUtilityTargets(tankers, refuelTargets, 'refuel', mapGrid)) {
      anyQueued = true
    }
  }

  const ammoTrucks = selectedUnits.filter(unit => unit.type === 'ammunitionTruck')
  if (ammoTrucks.length > 0 && ammoTargets.length > 0) {
    if (unitCommands.queueUtilityTargets(ammoTrucks, ammoTargets, 'ammoResupply', mapGrid)) {
      anyQueued = true
    }
  }

  const recoveryTanks = selectedUnits.filter(unit => unit.type === 'recoveryTank')
  if (recoveryTanks.length > 0) {
    const combinedRepairTargets = [...repairTargets, ...wreckTargets]
    if (combinedRepairTargets.length > 0 && unitCommands.queueUtilityTargets(recoveryTanks, combinedRepairTargets, 'repair', mapGrid)) {
      anyQueued = true
    }
  }

  return anyQueued
}

export function handleLeftMouseDown(handler, e, worldX, worldY, gameCanvas, selectedUnits, cursorManager) {
  handler.mouseDownTime = performance.now()
  handler.ctrlKeyPressed = e.ctrlKey

  handler.forceAttackClick = selectedUnits.length > 0 && isForceAttackModifierActive(e)
  handler.guardClick = selectedUnits.length > 0 && isGuardModifierActive(e)

  const isRecoveryTankInteraction = cursorManager && cursorManager.isOverRecoveryTank
  const hasSelectedDamagedUnits = selectedUnits.some(unit => unit.health < unit.maxHealth)
  const hasSelectedRecoveryTanks = selectedUnits.some(unit => unit.type === 'recoveryTank')

  handler.isRecoveryTankInteraction = isRecoveryTankInteraction ||
    (hasSelectedDamagedUnits && isOverRecoveryTankAt(handler, worldX, worldY)) ||
    (hasSelectedRecoveryTanks && isOverDamagedUnitAt(handler, worldX, worldY, selectedUnits))

  handler.attackGroupHandler.potentialAttackGroupStart = { x: worldX, y: worldY }
  handler.attackGroupHandler.hasSelectedCombatUnits = !handler.forceAttackClick && !handler.guardClick && !handler.isRecoveryTankInteraction && handler.attackGroupHandler.shouldStartAttackGroupMode(selectedUnits)

  handler.isSelecting = !handler.forceAttackClick && !handler.guardClick
  handler.utilityQueueCandidate = !handler.forceAttackClick && !handler.guardClick && shouldStartUtilityQueueMode(selectedUnits)

  if (selectedUnits.length === 1 && selectedUnits[0].isBuilding &&
      (selectedUnits[0].type === 'vehicleFactory' || selectedUnits[0].type === 'vehicleWorkshop')) {
    handler.isSelecting = false
  }

  gameState.selectionActive = handler.isSelecting
  handler.wasDragging = false
  handler.selectionStart = { x: worldX, y: worldY }
  handler.selectionEnd = { x: worldX, y: worldY }
  gameState.selectionStart = { ...handler.selectionStart }
  gameState.selectionEnd = { ...handler.selectionEnd }

  gameState.attackGroupMode = false
  handler.attackGroupHandler.isAttackGroupSelecting = false
  handler.attackGroupHandler.attackGroupWasDragging = false
  gameState.attackGroupStart = { x: 0, y: 0 }
  gameState.attackGroupEnd = { x: 0, y: 0 }
  gameState.disableAGFRendering = false

  const tileX = Math.floor(worldX / TILE_SIZE)
  const tileY = Math.floor(worldY / TILE_SIZE)
  const needsGas = selectedUnits.some(
    u => typeof u.maxGas === 'number' && u.gas < u.maxGas * 0.75
  )
  if (needsGas && gameState.buildings && Array.isArray(gameState.buildings)) {
    for (const building of gameState.buildings) {
      if (
        building.type === 'gasStation' &&
        building.owner === gameState.humanPlayer &&
        building.health > 0 &&
        tileX >= building.x && tileX < building.x + building.width &&
        tileY >= building.y && tileY < building.y + building.height
      ) {
        handler.isSelecting = false
        gameState.selectionActive = false
        gameState.disableAGFRendering = true
        break
      }
    }
  }
}

export function updateEnemyHover(handler, worldX, worldY, units, factories, selectedUnits, cursorManager) {
  if (selectedUnits.length > 0) {
    let isOverEnemy = false
    let isOverFriendlyUnit = false
    let hoveredEnemyCenter = null

    for (const factory of factories) {
      const humanPlayer = gameState.humanPlayer || 'player1'
      if (factory.id !== humanPlayer && !(humanPlayer === 'player1' && factory.id === 'player')) {
        const factoryPixelX = factory.x * TILE_SIZE
        const factoryPixelY = factory.y * TILE_SIZE
        if (worldX >= factoryPixelX &&
            worldX < factoryPixelX + factory.width * TILE_SIZE &&
            worldY >= factoryPixelY &&
            worldY < factoryPixelY + factory.height * TILE_SIZE) {
          isOverEnemy = true
          hoveredEnemyCenter = {
            x: factoryPixelX + (factory.width * TILE_SIZE) / 2,
            y: factoryPixelY + (factory.height * TILE_SIZE) / 2
          }
          break
        }
      }
    }

    if (!isOverEnemy && gameState.buildings && gameState.buildings.length > 0) {
      const humanPlayer = gameState.humanPlayer || 'player1'
      for (const building of gameState.buildings) {
        if (building.owner !== humanPlayer && !(humanPlayer === 'player1' && building.owner === 'player')) {
          const buildingX = building.x * TILE_SIZE
          const buildingY = building.y * TILE_SIZE
          const buildingWidth = building.width * TILE_SIZE
          const buildingHeight = building.height * TILE_SIZE

          if (worldX >= buildingX &&
              worldX < buildingX + buildingWidth &&
              worldY >= buildingY &&
              worldY < buildingY + buildingHeight) {
            isOverEnemy = true
            hoveredEnemyCenter = {
              x: buildingX + buildingWidth / 2,
              y: buildingY + buildingHeight / 2
            }
            break
          }
        }
      }
    }

    if (!isOverEnemy && !isOverFriendlyUnit) {
      const humanPlayer = gameState.humanPlayer || 'player1'
      for (const unit of units) {
        if (unit.owner === humanPlayer || (humanPlayer === 'player1' && unit.owner === 'player')) {
          const { centerX, centerY } = getUnitSelectionCenter(unit)
          if (Math.hypot(worldX - centerX, worldY - centerY) < TILE_SIZE / 2) {
            isOverFriendlyUnit = true
            break
          }
        }
      }
    }

    if (!isOverEnemy && !isOverFriendlyUnit) {
      const humanPlayer = gameState.humanPlayer || 'player1'
      for (const unit of units) {
        if (unit.owner !== humanPlayer && !(humanPlayer === 'player1' && unit.owner === 'player')) {
          const { centerX, centerY } = getUnitSelectionCenter(unit)
          if (Math.hypot(worldX - centerX, worldY - centerY) < TILE_SIZE / 2) {
            isOverEnemy = true
            hoveredEnemyCenter = { x: centerX, y: centerY }
            break
          }
        }
      }
    }

    cursorManager.setIsOverEnemy(isOverEnemy)
    cursorManager.setIsOverFriendlyUnit(isOverFriendlyUnit)

    let enemyInRange = false
    let enemyOutOfRange = false
    let hasAttackers = false
    let closestDistance = Infinity
    let closestMaxRange = null

    const selectedArtilleryTurrets = selectedUnits.filter(unit =>
      unit.type === 'artilleryTurret'
    )

    let additionalArtilleryTurrets = []
    if (gameState.buildings) {
      additionalArtilleryTurrets = gameState.buildings.filter(b =>
        b.type === 'artilleryTurret' && b.selected && b.owner === gameState.humanPlayer
      )
    }

    const allArtilleryTurrets = [...selectedArtilleryTurrets, ...additionalArtilleryTurrets]

    const resolveUnitAttackRange = (unit) => {
      if (!unit) {
        return null
      }

      if (typeof unit.fireRange === 'number') {
        const minRange = typeof unit.minFireRange === 'number' ? unit.minFireRange * TILE_SIZE : 0
        return { maxRange: unit.fireRange * TILE_SIZE, minRange }
      }

      const baseRange = TANK_FIRE_RANGE * TILE_SIZE
      let range = baseRange

      if (unit.type === 'howitzer') {
        range = HOWITZER_FIRE_RANGE * TILE_SIZE
      } else if (unit.type === 'apache') {
        range = baseRange * APACHE_RANGE_REDUCTION
      }

      if (unit.level >= 1) {
        range *= unit.rangeMultiplier || 1.2
      }

      if (unit.type === 'rocketTank') {
        range *= SHADOW_OF_WAR_CONFIG.rocketRangeMultiplier || 1.5
      }

      const attackCapableTypes = new Set([
        'tank',
        'tank_v1',
        'tank-v2',
        'tank-v3',
        'rocketTank',
        'howitzer',
        'apache'
      ])

      if (!attackCapableTypes.has(unit.type)) {
        return null
      }

      return { maxRange: range, minRange: 0 }
    }

    if (isOverEnemy && hoveredEnemyCenter) {
      for (const unit of selectedUnits) {
        const rangeInfo = resolveUnitAttackRange(unit)
        if (!rangeInfo) {
          continue
        }

        hasAttackers = true
        let centerX, centerY
        if (unit.isBuilding) {
          centerX = (unit.x + unit.width / 2) * TILE_SIZE
          centerY = (unit.y + unit.height / 2) * TILE_SIZE
        } else {
          const unitCenter = getUnitSelectionCenter(unit)
          centerX = unitCenter.centerX
          centerY = unitCenter.centerY
        }
        const distance = Math.hypot(hoveredEnemyCenter.x - centerX, hoveredEnemyCenter.y - centerY)

        if (distance < closestDistance) {
          closestDistance = distance
          closestMaxRange = rangeInfo.maxRange
        }

        if (distance <= rangeInfo.maxRange && distance >= rangeInfo.minRange) {
          enemyInRange = true
        }
      }

      if (hasAttackers && !enemyInRange) {
        enemyOutOfRange = true
      }
    }

    if (allArtilleryTurrets.length > 0) {
      for (const turret of allArtilleryTurrets) {
        const turretCenterX = (turret.x + turret.width / 2) * TILE_SIZE
        const turretCenterY = (turret.y + turret.height / 2) * TILE_SIZE
        const targetX = hoveredEnemyCenter ? hoveredEnemyCenter.x : worldX
        const targetY = hoveredEnemyCenter ? hoveredEnemyCenter.y : worldY
        const distance = Math.hypot(targetX - turretCenterX, targetY - turretCenterY)
        const maxRange = turret.fireRange * TILE_SIZE
        const minRange = (turret.minFireRange || 0) * TILE_SIZE

        if (distance <= maxRange && distance >= minRange) {
          enemyInRange = true
        } else {
          enemyOutOfRange = true
        }
      }

      if (enemyInRange && enemyOutOfRange) {
        enemyInRange = true
        enemyOutOfRange = false
      } else if (!enemyInRange && enemyOutOfRange) {
        enemyInRange = false
        enemyOutOfRange = true
      }
    }

    cursorManager.setIsOverEnemyInRange(isOverEnemy && enemyInRange)
    cursorManager.setIsOverEnemyOutOfRange(isOverEnemy && enemyOutOfRange)
    cursorManager.setRangeCursorInfo(
      isOverEnemy && hasAttackers && closestMaxRange !== null
        ? { distance: closestDistance, maxRange: closestMaxRange }
        : null
    )

    if (allArtilleryTurrets.length > 0) {
      cursorManager.setIsInArtilleryRange(enemyInRange)
      cursorManager.setIsOutOfArtilleryRange(enemyOutOfRange)
    } else {
      cursorManager.setIsInArtilleryRange(false)
      cursorManager.setIsOutOfArtilleryRange(false)
    }
  } else {
    cursorManager.setIsOverEnemy(false)
    cursorManager.setIsOverFriendlyUnit(false)
    cursorManager.setIsOverEnemyInRange(false)
    cursorManager.setIsOverEnemyOutOfRange(false)
    cursorManager.setIsInArtilleryRange(false)
    cursorManager.setIsOutOfArtilleryRange(false)
    cursorManager.setRangeCursorInfo(null)
  }
}

export function updateSelectionRectangle(handler, worldX, worldY, cursorManager) {
  const isRecoveryTankInteraction = handler.isRecoveryTankInteraction || (cursorManager && cursorManager.isOverRecoveryTank)

  if (!handler.attackGroupHandler.isAttackGroupSelecting &&
      handler.attackGroupHandler.hasSelectedCombatUnits &&
      handler.isSelecting &&
      !isRecoveryTankInteraction) {
    const dragDistance = Math.hypot(
      worldX - handler.attackGroupHandler.potentialAttackGroupStart.x,
      worldY - handler.attackGroupHandler.potentialAttackGroupStart.y
    )

    if (dragDistance > 3) {
      handler.attackGroupHandler.isAttackGroupSelecting = true
      handler.isSelecting = false
      gameState.selectionActive = false
      gameState.attackGroupMode = true
      handler.attackGroupHandler.attackGroupStartWorld = { ...handler.attackGroupHandler.potentialAttackGroupStart }
      gameState.attackGroupStart = { ...handler.attackGroupHandler.potentialAttackGroupStart }
      gameState.attackGroupEnd = { x: worldX, y: worldY }
      handler.attackGroupHandler.attackGroupWasDragging = true

      gameState.selectionStart = { x: 0, y: 0 }
      gameState.selectionEnd = { x: 0, y: 0 }
      return
    }
  }

  if (handler.attackGroupHandler.isAttackGroupSelecting) {
    gameState.attackGroupEnd = { x: worldX, y: worldY }
    handler.attackGroupHandler.attackGroupWasDragging = true
  } else if (handler.isSelecting && !isRecoveryTankInteraction) {
    handler.selectionEnd = { x: worldX, y: worldY }
    gameState.selectionEnd = { ...handler.selectionEnd }

    if (!handler.wasDragging && (Math.abs(handler.selectionEnd.x - handler.selectionStart.x) > 3 || Math.abs(handler.selectionEnd.y - handler.selectionStart.y) > 3)) {
      handler.wasDragging = true
    }

    if (handler.wasDragging) {
      const selectedUnits = gameState.selectedUnits || []

      if (mineInput.hasMineLayerSelected(selectedUnits)) {
        const area = {
          startX: Math.floor(handler.selectionStart.x / TILE_SIZE),
          startY: Math.floor(handler.selectionStart.y / TILE_SIZE),
          endX: Math.floor(handler.selectionEnd.x / TILE_SIZE),
          endY: Math.floor(handler.selectionEnd.y / TILE_SIZE)
        }
        gameState.mineDeploymentPreview = area
        gameState.sweepAreaPreview = null
        gameState.mineFreeformPaint = null
      } else if (mineInput.hasMineSweeperSelected(selectedUnits)) {
        if (handler.ctrlKeyPressed) {
          if (!gameState.mineFreeformPaint) {
            gameState.mineFreeformPaint = new Set()
          }

          const currentTileX = Math.floor(handler.selectionEnd.x / TILE_SIZE)
          const currentTileY = Math.floor(handler.selectionEnd.y / TILE_SIZE)
          const tileKey = `${currentTileX},${currentTileY}`
          gameState.mineFreeformPaint.add(tileKey)

          gameState.sweepAreaPreview = null
          gameState.mineDeploymentPreview = null
        } else {
          const area = {
            startX: Math.floor(handler.selectionStart.x / TILE_SIZE),
            startY: Math.floor(handler.selectionStart.y / TILE_SIZE),
            endX: Math.floor(handler.selectionEnd.x / TILE_SIZE),
            endY: Math.floor(handler.selectionEnd.y / TILE_SIZE)
          }
          gameState.sweepAreaPreview = area
          gameState.mineDeploymentPreview = null
          gameState.mineFreeformPaint = null
        }
      }
    }
  }
}

export function handleLeftMouseUp(handler, e, units, factories, mapGrid, selectedUnits, selectionManager, unitCommands, cursorManager) {
  const rect = e.target.getBoundingClientRect()
  const worldX = e.clientX - rect.left + gameState.scrollOffset.x
  const worldY = e.clientY - rect.top + gameState.scrollOffset.y
  const rallyTileX = Math.floor(worldX / TILE_SIZE)
  const rallyTileY = Math.floor(worldY / TILE_SIZE)

  const selectedFactory = factories.find(f => f.selected && f.id === gameState.humanPlayer)
  if (selectedFactory && !handler.wasDragging && !gameState.repairMode) {
    if (isRallyPointTileBlocked(rallyTileX, rallyTileY)) {
      showNotification('Cannot set rally point on occupied tile', 1500)
      cursorManager.updateCustomCursor(e, gameState.mapGrid || [], factories, selectedUnits, units)
      return
    }

    selectedFactory.rallyPoint = { x: rallyTileX, y: rallyTileY }
    playPositionalSound('movement', worldX, worldY, 0.5)

    selectedFactory.selected = false
    const factoryIndex = selectedUnits.indexOf(selectedFactory)
    if (factoryIndex > -1) {
      selectedUnits.splice(factoryIndex, 1)
    }
    handler.updateAGFCapability(selectedUnits)
    showNotification('Rally point set for Construction Yard', 1500)
    cursorManager.updateCustomCursor(e, gameState.mapGrid || [], factories, selectedUnits, units)
    return
  }

  const selectedBuilding = gameState.buildings && gameState.buildings.find(building =>
    building.selected &&
    building.owner === gameState.humanPlayer &&
    (building.type === 'vehicleFactory' || building.type === 'vehicleWorkshop')
  )
  if (selectedBuilding && !handler.wasDragging && !gameState.repairMode) {
    if (isRallyPointTileBlocked(rallyTileX, rallyTileY)) {
      showNotification('Cannot set rally point on occupied tile', 1500)
      cursorManager.updateCustomCursor(e, gameState.mapGrid || [], factories, selectedUnits, units)
      return
    }

    if (selectedBuilding.type === 'vehicleWorkshop') {
      const owner = selectedBuilding.owner || gameState.humanPlayer
      if (!isWithinBaseRange(rallyTileX, rallyTileY, owner)) {
        showNotification('Workshop rally point must stay near your base', 2000)
        cursorManager.updateCustomCursor(e, gameState.mapGrid || [], factories, selectedUnits, units)
        return
      }
    }

    selectedBuilding.rallyPoint = { x: rallyTileX, y: rallyTileY }
    playPositionalSound('movement', worldX, worldY, 0.5)

    if (selectedUnits.indexOf(selectedBuilding) === -1) {
      selectedUnits.push(selectedBuilding)
    }
    handler.updateAGFCapability(selectedUnits)

    let buildingName = 'Factory'
    if (selectedBuilding.type === 'vehicleFactory') {
      buildingName = 'Vehicle Factory'
    } else if (selectedBuilding.type === 'vehicleWorkshop') {
      buildingName = 'Vehicle Workshop'
    }
    showNotification(`Rally point set for ${buildingName}`, 1500)
    cursorManager.updateCustomCursor(e, gameState.mapGrid || [], factories, selectedUnits, units)
    return
  }

  let handledUtilityQueue = false
  if (handler.utilityQueueCandidate && handler.wasDragging) {
    handledUtilityQueue = processUtilityQueueSelection(handler, units, mapGrid, selectedUnits, selectionManager, unitCommands)
  }

  if (handledUtilityQueue) {
    handler.isSelecting = false
    gameState.selectionActive = false
    handler.wasDragging = false
    handler.attackGroupHandler.hasSelectedCombatUnits = false
    handler.utilityQueueCandidate = false
    if (cursorManager) {
      cursorManager.updateCustomCursor(e, gameState.mapGrid || [], factories, selectedUnits, units)
    }
    return
  }

  if (handler.attackGroupHandler.isAttackGroupSelecting && gameState.attackGroupMode) {
    handler.attackGroupHandler.handleMouseUp(worldX, worldY, units, selectedUnits, unitCommands, mapGrid,
      handler.handleStandardCommands.bind(handler))
    return
  }

  let forceAttackHandled = false
  let guardHandled = false

  if (selectedUnits.length > 0 && !handler.wasDragging && (handler.forceAttackClick || isForceAttackModifierActive(e))) {
    forceAttackHandled = handleForceAttackCommand(handler, worldX, worldY, units, selectedUnits, unitCommands, mapGrid, selectionManager)
  }

  if (selectedUnits.length > 0 && !handler.wasDragging && (handler.guardClick || isGuardModifierActive(e))) {
    guardHandled = handleGuardCommand(handler, worldX, worldY, units, selectedUnits, unitCommands, selectionManager, mapGrid)
  }

  let mineDeploymentHandled = false
  if (selectedUnits.length > 0 && !handler.wasDragging && e.ctrlKey && mineInput.hasMineLayerSelected(selectedUnits)) {
    window.logger('Mine deployment triggered: ctrlKey=', e.ctrlKey, 'hasMineLayerSelected=', mineInput.hasMineLayerSelected(selectedUnits))
    const tileX = Math.floor(worldX / TILE_SIZE)
    const tileY = Math.floor(worldY / TILE_SIZE)
    window.logger('Deploying mine at tile:', tileX, tileY)
    mineInput.handleMineLayerClick(selectedUnits, tileX, tileY, e.shiftKey)
    mineDeploymentHandled = true
    playSound('movement', 0.5)
  }

  let mineAreaHandled = false
  if (handler.wasDragging && selectedUnits.length > 0) {
    const area = {
      startX: Math.floor(handler.selectionStart.x / TILE_SIZE),
      startY: Math.floor(handler.selectionStart.y / TILE_SIZE),
      endX: Math.floor(handler.selectionEnd.x / TILE_SIZE),
      endY: Math.floor(handler.selectionEnd.y / TILE_SIZE)
    }

    if (!e.ctrlKey && mineInput.hasMineLayerSelected(selectedUnits)) {
      mineInput.handleMineLayerAreaDeploy(selectedUnits, area, e.shiftKey)
      mineAreaHandled = true
      playSound('movement', 0.5)
    } else if (!e.ctrlKey && mineInput.hasMineSweeperSelected(selectedUnits)) {
      mineInput.handleMineSweeperRectangleSweep(selectedUnits, area, e.shiftKey)
      mineAreaHandled = true
      playSound('movement', 0.5)
    } else if (e.ctrlKey && mineInput.hasMineSweeperSelected(selectedUnits) && gameState.mineFreeformPaint) {
      mineInput.handleMineSweeperFreeformSweep(selectedUnits, gameState.mineFreeformPaint, e.shiftKey)
      mineAreaHandled = true
      playSound('movement', 0.5)
      gameState.mineFreeformPaint = null
    }
  }

  if (gameState.mineDeploymentPreview) {
    gameState.mineDeploymentPreview = null
  }
  if (gameState.sweepAreaPreview) {
    gameState.sweepAreaPreview = null
  }

  if (!forceAttackHandled && !guardHandled && !mineDeploymentHandled && !mineAreaHandled) {
    if (handler.wasDragging) {
      selectionManager.handleBoundingBoxSelection(units, factories, selectedUnits, handler.selectionStart, handler.selectionEnd)
      handler.updateAGFCapability(selectedUnits)
    } else {
      handleSingleClick(handler, worldX, worldY, e, units, factories, selectedUnits, selectionManager, unitCommands, mapGrid)
    }
  }

  handler.isSelecting = false
  gameState.selectionActive = false
  handler.wasDragging = false
  handler.attackGroupHandler.hasSelectedCombatUnits = false
  handler.attackGroupHandler.potentialAttackGroupStart = { x: 0, y: 0 }
  handler.forceAttackClick = false
  handler.guardClick = false
  handler.isRecoveryTankInteraction = false
  handler.utilityQueueCandidate = false

  if (!handler.attackGroupHandler.isAttackGroupSelecting) {
    gameState.attackGroupMode = false
    gameState.attackGroupStart = { x: 0, y: 0 }
    gameState.attackGroupEnd = { x: 0, y: 0 }
    gameState.disableAGFRendering = false
  }
}

function handleSingleClick(handler, worldX, worldY, e, units, factories, selectedUnits, selectionManager, unitCommands, mapGrid) {
  let selectedFactory = null
  for (const factory of factories) {
    if (factory.id === gameState.humanPlayer) {
      const factoryPixelX = factory.x * TILE_SIZE
      const factoryPixelY = factory.y * TILE_SIZE

      if (worldX >= factoryPixelX &&
          worldX < factoryPixelX + factory.width * TILE_SIZE &&
          worldY >= factoryPixelY &&
          worldY < factoryPixelY + factory.height * TILE_SIZE) {
        selectedFactory = factory
        break
      }
    }
  }

  if (selectedFactory) {
    selectionManager.handleFactorySelection(selectedFactory, e, units, selectedUnits)
    handler.updateAGFCapability(selectedUnits)
    e.stopPropagation()
    return
  }

  const hasCommandableUnits = selectedUnits.some(unit => selectionManager.isCommandableUnit(unit))
  if (!hasCommandableUnits) {
    const tileX = Math.floor(worldX / TILE_SIZE)
    const tileY = Math.floor(worldY / TILE_SIZE)
    const wreck = findWreckAtTile(gameState, tileX, tileY)
    if (wreck) {
      selectWreck(wreck, selectedUnits, factories, selectionManager)
      handler.updateAGFCapability(selectedUnits)
      return
    }
  }

  handleUnitSelection(handler, worldX, worldY, e, units, factories, selectedUnits, selectionManager, unitCommands, mapGrid)
}

function handleUnitSelection(handler, worldX, worldY, e, units, factories, selectedUnits, selectionManager, unitCommands, mapGrid) {
  selectionManager.clearWreckSelection()
  const appendToUtilityQueue = e.altKey || gameState.altKeyDown
  if (selectedUnits.length > 0) {
    const commandableUnits = selectedUnits.filter(u => selectionManager.isCommandableUnit(u))
    const hasSelectedApaches = commandableUnits.some(unit => unit.type === 'apache')
    const hasSelectedHarvesters = commandableUnits.some(unit => unit.type === 'harvester')

    if (hasSelectedHarvesters) {
      const tileX = Math.floor(worldX / TILE_SIZE)
      const tileY = Math.floor(worldY / TILE_SIZE)

      if (gameState.buildings && Array.isArray(gameState.buildings)) {
        for (const building of gameState.buildings) {
          if (building.type === 'oreRefinery' &&
              building.owner === gameState.humanPlayer &&
              building.health > 0 &&
              tileX >= building.x && tileX < building.x + building.width &&
              tileY >= building.y && tileY < building.y + building.height) {
            unitCommands.handleRefineryUnloadCommand(commandableUnits, building, mapGrid)
            return
          }
        }
      }
    }

    const tileX = Math.floor(worldX / TILE_SIZE)
    const tileY = Math.floor(worldY / TILE_SIZE)

    if (gameState.buildings && Array.isArray(gameState.buildings)) {
      for (const building of gameState.buildings) {
        if (building.type === 'vehicleWorkshop' &&
            building.owner === gameState.humanPlayer &&
            building.health > 0 &&
            tileX >= building.x && tileX < building.x + building.width &&
            tileY >= building.y && tileY < building.y + building.height) {
          unitCommands.handleRepairWorkshopCommand(commandableUnits, building, mapGrid)
          return
        }
      }
    }

    const hasSelectedTankers = commandableUnits.some(unit => unit.type === 'tankerTruck')
    if (hasSelectedTankers) {
      for (const unit of units) {
        if (unit.owner === gameState.humanPlayer && typeof unit.maxGas === 'number') {
          const uX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
          const uY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
          if (uX === tileX && uY === tileY && unit.gas < unit.maxGas) {
            unitCommands.handleTankerRefuelCommand(commandableUnits, unit, mapGrid, { append: appendToUtilityQueue })
            return
          }
        }
      }
    }

    const hasSelectedAmmoTrucks = commandableUnits.some(unit => unit.type === 'ammunitionTruck')
    if (hasSelectedAmmoTrucks) {
      for (const unit of units) {
        if (unit.owner === gameState.humanPlayer && typeof unit.maxAmmunition === 'number') {
          const uX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
          const uY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
          if (uX === tileX && uY === tileY && unit.ammunition < unit.maxAmmunition) {
            unitCommands.handleAmmunitionTruckResupplyCommand(commandableUnits, unit, mapGrid, { append: appendToUtilityQueue })
            return
          }
        }
      }
      if (gameState.buildings && Array.isArray(gameState.buildings)) {
        for (const building of gameState.buildings) {
          if (building.owner !== gameState.humanPlayer) {
            continue
          }

          const withinFootprint = tileX >= building.x && tileX < building.x + building.width &&
            tileY >= building.y && tileY < building.y + building.height
          if (!withinFootprint) {
            continue
          }

          if (typeof building.maxAmmo === 'number' && building.ammo < building.maxAmmo) {
            unitCommands.handleAmmunitionTruckResupplyCommand(commandableUnits, building, mapGrid, { append: appendToUtilityQueue })
            return
          }

          if (building.type === 'ammunitionFactory') {
            unitCommands.handleAmmunitionTruckReloadCommand(commandableUnits, building, mapGrid, { append: appendToUtilityQueue })
            return
          }
        }
      }
    }

    const hasSelectedAmbulances = commandableUnits.some(unit => unit.type === 'ambulance' && unit.medics > 0)

    if (hasSelectedAmbulances) {
      for (const unit of units) {
        if (unit.owner === gameState.humanPlayer &&
            unit.crew && typeof unit.crew === 'object') {
          const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
          const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

          if (unitTileX === tileX && unitTileY === tileY) {
            const missingCrew = Object.entries(unit.crew).filter(([_, alive]) => !alive)
            if (missingCrew.length > 0) {
              unitCommands.handleAmbulanceHealCommand(commandableUnits, unit, mapGrid, { append: appendToUtilityQueue })
              return
            }
          }
        }
      }
    }

    const hasSelectedRecoveryTanks = commandableUnits.some(unit => unit.type === 'recoveryTank')

    if (hasSelectedRecoveryTanks) {
      const wreck = findWreckAtTile(gameState, tileX, tileY)
      if (wreck) {
        if (gameState.shiftKeyDown || e.shiftKey) {
          unitCommands.handleRecoveryWreckRecycleCommand(commandableUnits, wreck, mapGrid, { append: appendToUtilityQueue })
        } else {
          unitCommands.handleRecoveryWreckTowCommand(commandableUnits, wreck, mapGrid, { append: appendToUtilityQueue })
        }
        return
      }

      for (const unit of units) {
        if (unit.owner === gameState.humanPlayer &&
            unit.type !== 'recoveryTank' &&
            unit.health < unit.maxHealth) {
          const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
          const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

          if (unitTileX === tileX && unitTileY === tileY) {
            unitCommands.handleRecoveryTankRepairCommand(commandableUnits, unit, mapGrid, { append: appendToUtilityQueue })
            return
          }
        }
      }
    }

    const hasSelectedDamagedUnits = commandableUnits.some(unit => unit.health < unit.maxHealth)

    if (hasSelectedDamagedUnits) {
      for (const unit of units) {
        if (unit.owner === gameState.humanPlayer && unit.type === 'recoveryTank') {
          const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
          const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

          if (unitTileX === tileX && unitTileY === tileY) {
            unitCommands.handleDamagedUnitToRecoveryTankCommand(commandableUnits, unit, mapGrid)
            return
          }
        }
      }
    }

    const hasSelectedRecovery = commandableUnits.some(unit => unit.type === 'recoveryTank')
    if (hasSelectedRecovery) {
      for (const unit of units) {
        if (unit.owner === gameState.humanPlayer) {
          const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
          const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
          if (unitTileX === tileX && unitTileY === tileY) {
            if (unit.crew && (!unit.crew.driver || !unit.crew.commander)) {
              unitCommands.handleRecoveryTowCommand(commandableUnits, unit)
              return
            }
          }
        }
      }
    }

    const hasSelectedNotFullyLoadedAmbulances = commandableUnits.some(unit => unit.type === 'ambulance' && unit.medics < 4)

    if (hasSelectedNotFullyLoadedAmbulances) {
      for (const building of gameState.buildings) {
        if (building.type === 'hospital' &&
            building.owner === gameState.humanPlayer &&
            building.health > 0 &&
            tileX >= building.x && tileX < building.x + building.width &&
            tileY >= building.y && tileY < building.y + building.height) {
          unitCommands.handleAmbulanceRefillCommand(commandableUnits, building, mapGrid)
          return
        }
      }
    }

    const needsGas = commandableUnits.some(
      u => typeof u.maxGas === 'number' && u.gas < u.maxGas * 0.75
    )
    if (needsGas) {
      for (const building of gameState.buildings) {
        if (building.type === 'gasStation' &&
            building.owner === gameState.humanPlayer &&
            building.health > 0 &&
            tileX >= building.x && tileX < building.x + building.width &&
            tileY >= building.y && tileY < building.y + building.height) {
          unitCommands.handleGasStationRefillCommand(commandableUnits, building, mapGrid)
          return
        }
      }
    }

    if (
      hasSelectedApaches &&
      commandableUnits.every(unit => unit.type === 'apache') &&
      gameState.buildings && Array.isArray(gameState.buildings)
    ) {
      for (const building of gameState.buildings) {
        if (building.type === 'helipad' &&
            building.owner === gameState.humanPlayer &&
            building.health > 0 &&
            tileX >= building.x && tileX < building.x + building.width &&
            tileY >= building.y && tileY < building.y + building.height) {
          unitCommands.handleApacheHelipadCommand(commandableUnits, building, mapGrid)
          return
        }
      }
    }
  }

  let clickedBuilding = null
  if (gameState.buildings && gameState.buildings.length > 0) {
    for (const building of gameState.buildings) {
      if (!building || building.health <= 0) continue

      const buildingX = building.x * TILE_SIZE
      const buildingY = building.y * TILE_SIZE
      const buildingWidth = building.width * TILE_SIZE
      const buildingHeight = building.height * TILE_SIZE

      if (
        worldX >= buildingX &&
        worldX < buildingX + buildingWidth &&
        worldY >= buildingY &&
        worldY < buildingY + buildingHeight
      ) {
        clickedBuilding = building
        break
      }
    }
  }

  if (clickedBuilding) {
    const hasFriendlyUnitsSelected = selectedUnits.some(unit =>
      selectionManager.isHumanPlayerUnit(unit) && unit.isBuilding !== true
    )

    if (hasFriendlyUnitsSelected) {
      if (!gameState.buildingPlacementMode && !gameState.repairMode && !gameState.sellMode) {
        const commandableUnits = selectedUnits.filter(unit =>
          selectionManager.isHumanPlayerUnit(unit) && unit.isBuilding !== true
        )

        if (commandableUnits.length > 0) {
          if (e.shiftKey) {
            initiateRetreat(commandableUnits, worldX, worldY, mapGrid)
          } else if (e.altKey) {
            handler.handleStandardCommands(worldX, worldY, commandableUnits, unitCommands, mapGrid, true)
          } else if (!isForceAttackModifierActive(e)) {
            handler.handleStandardCommands(worldX, worldY, commandableUnits, unitCommands, mapGrid, false)
          }
        }
      }
      return
    }

    selectionManager.handleBuildingSelection(clickedBuilding, e, units, selectedUnits)
    handler.updateAGFCapability(selectedUnits)
    e.stopPropagation()
    return
  }

  let clickedUnit = null
  for (const unit of units) {
    if (selectionManager.isSelectableUnit(unit)) {
      const { centerX, centerY } = getUnitSelectionCenter(unit)
      const dx = worldX - centerX
      const dy = worldY - centerY
      if (Math.hypot(dx, dy) < TILE_SIZE / 2) {
        clickedUnit = unit
        break
      }
    }
  }

  const friendlySelected = selectedUnits.some(u => selectionManager.isHumanPlayerUnit(u) || selectionManager.isHumanPlayerBuilding(u))
  const clickedIsEnemy = clickedUnit && !selectionManager.isHumanPlayerUnit(clickedUnit)

  if (clickedUnit && !(friendlySelected && clickedIsEnemy)) {
    const handledService = friendlySelected && handleServiceProviderClick(handler, clickedUnit, selectedUnits, unitCommands, mapGrid)
    if (handledService) {
      return
    }

    selectionManager.handleUnitSelection(clickedUnit, e, units, factories, selectedUnits)
    handler.updateAGFCapability(selectedUnits)
  } else {
    handleFallbackCommand(handler, worldX, worldY, selectedUnits, unitCommands, mapGrid, e, units, factories)
  }
}
