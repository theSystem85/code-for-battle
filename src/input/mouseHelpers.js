import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { showNotification } from '../ui/notifications.js'
import { GAME_DEFAULT_CURSOR } from './cursorStyles.js'
import { getUnitSelectionCenter } from './selectionManager.js'

function normalizeOwner(owner) {
  return owner === 'player' ? 'player1' : owner
}

function isEnemyRelativeToHuman(owner) {
  const humanPlayer = normalizeOwner(gameState.humanPlayer || 'player1')
  return normalizeOwner(owner) !== humanPlayer
}

export function isRallyPointTileBlocked(tileX, tileY) {
  const occupancyMap = gameState.occupancyMap
  if (!occupancyMap || occupancyMap.length === 0) {
    return false
  }

  if (tileY < 0 || tileY >= occupancyMap.length) {
    return true
  }

  const row = occupancyMap[tileY]
  if (!row || tileX < 0 || tileX >= row.length) {
    return true
  }

  return Boolean(row[tileX])
}

export function isUtilityUnit(unit) {
  if (!unit) return false
  if (unit.isUtilityUnit) return true
  return unit.type === 'ambulance' || unit.type === 'tankerTruck' || unit.type === 'recoveryTank' || unit.type === 'ammunitionTruck'
}

export function shouldStartUtilityQueueMode(selectedUnits) {
  if (!selectedUnits || selectedUnits.length === 0) {
    return false
  }
  const utilityUnits = selectedUnits.filter(unit => isUtilityUnit(unit))
  return utilityUnits.length > 0
}

export function createSyntheticMouseEvent(event, target, button = 0) {
  return {
    button,
    buttons: button === 2 ? 2 : 1,
    clientX: event.clientX,
    clientY: event.clientY,
    ctrlKey: event.ctrlKey || false,
    metaKey: event.metaKey || false,
    shiftKey: event.shiftKey || false,
    altKey: event.altKey || false,
    target,
    currentTarget: target,
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation && event.stopPropagation()
  }
}

export function createSyntheticMouseEventFromCoords(target, x, y, button = 0) {
  return {
    button,
    buttons: button === 2 ? 2 : 1,
    clientX: x,
    clientY: y,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target,
    currentTarget: target,
    preventDefault: () => {},
    stopPropagation: () => {}
  }
}

export function getTouchCenter(pointerIds, activePointers) {
  if (!pointerIds || pointerIds.length === 0) {
    return { x: 0, y: 0 }
  }
  const sum = pointerIds.reduce((acc, id) => {
    const state = activePointers.get(id)
    if (!state) {
      return acc
    }
    const evt = state.lastEvent
    acc.x += evt?.clientX ?? state.startX
    acc.y += evt?.clientY ?? state.startY
    return acc
  }, { x: 0, y: 0 })
  return {
    x: sum.x / pointerIds.length,
    y: sum.y / pointerIds.length
  }
}

export function handleContextMenu(e, gameCanvas) {
  e.preventDefault()

  let modeWasCanceled = false

  if (gameState.repairMode) {
    gameState.repairMode = false
    const repairBtn = document.getElementById('repairBtn')
    if (repairBtn) {
      repairBtn.classList.remove('active')
    }
    gameCanvas.classList.remove('repair-mode', 'repair-blocked-mode')
    modeWasCanceled = true
  }

  if (gameState.sellMode) {
    gameState.sellMode = false
    const sellBtn = document.getElementById('sellBtn')
    if (sellBtn) {
      sellBtn.classList.remove('active')
    }
    gameCanvas.classList.remove('sell-mode', 'sell-blocked-mode')
    modeWasCanceled = true
  }

  if (modeWasCanceled) {
    gameCanvas.style.cursor = GAME_DEFAULT_CURSOR
    showNotification('Action mode canceled')
  }

  return false
}

export function findEnemyTarget(worldX, worldY, gameFactories, units) {
  if (gameState.buildings && gameState.buildings.length > 0) {
    for (const building of gameState.buildings) {
      if (isEnemyRelativeToHuman(building.owner)) {
        const buildingX = building.x * TILE_SIZE
        const buildingY = building.y * TILE_SIZE
        const buildingWidth = building.width * TILE_SIZE
        const buildingHeight = building.height * TILE_SIZE

        if (worldX >= buildingX &&
            worldX < buildingX + buildingWidth &&
            worldY >= buildingY &&
            worldY < buildingY + buildingHeight) {
          return building
        }
      }
    }
  }

  for (const factory of gameFactories) {
    if (isEnemyRelativeToHuman(factory.id) &&
        worldX >= factory.x * TILE_SIZE &&
        worldX < (factory.x + factory.width) * TILE_SIZE &&
        worldY >= factory.y * TILE_SIZE &&
        worldY < (factory.y + factory.height) * TILE_SIZE) {
      return factory
    }
  }

  for (const unit of units) {
    if (isEnemyRelativeToHuman(unit.owner)) {
      const { centerX, centerY } = getUnitSelectionCenter(unit)
      const distance = Math.hypot(worldX - centerX, worldY - centerY)
      if (distance < TILE_SIZE / 2) {
        return unit
      }
    }
  }

  return null
}

export function selectWreck(wreck, selectedUnits, factories, selectionManager) {
  if (!wreck || !selectionManager) {
    return
  }

  selectedUnits.forEach(unit => {
    if (unit && typeof unit === 'object') {
      unit.selected = false
    }
  })
  selectedUnits.length = 0

  if (factories) {
    factories.forEach(factory => { factory.selected = false })
  }

  if (gameState.buildings && Array.isArray(gameState.buildings)) {
    gameState.buildings.forEach(building => { building.selected = false })
  }

  selectionManager.clearAttackGroupTargets()
  gameState.selectedWreckId = wreck.id
  gameState.attackGroupMode = false
  gameState.disableAGFRendering = false
}

export function isOverRecoveryTankAt(handler, worldX, worldY) {
  if (!handler.gameUnits) return false

  const tileX = Math.floor(worldX / TILE_SIZE)
  const tileY = Math.floor(worldY / TILE_SIZE)

  return handler.gameUnits.some(unit => {
    if (unit.type === 'recoveryTank' && unit.owner === gameState.humanPlayer) {
      const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
      const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
      return unitTileX === tileX && unitTileY === tileY
    }
    return false
  })
}

export function isOverDamagedUnitAt(handler, worldX, worldY, selectedUnits) {
  if (!handler.gameUnits) return false

  const tileX = Math.floor(worldX / TILE_SIZE)
  const tileY = Math.floor(worldY / TILE_SIZE)

  return handler.gameUnits.some(unit => {
    if (unit.owner === gameState.humanPlayer &&
        unit.type !== 'recoveryTank' &&
        unit.health < unit.maxHealth &&
        !selectedUnits.includes(unit)) {
      const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
      const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
      return unitTileX === tileX && unitTileY === tileY
    }
    return false
  })
}

export function updateAGFCapability(handler, selectedUnits) {
  handler.attackGroupHandler.updateAGFCapability(selectedUnits)
}
