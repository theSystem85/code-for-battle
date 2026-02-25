// cursorManager.js
import { TILE_SIZE, CURSOR_METERS_PER_TILE } from '../config.js'
import { gameState } from '../gameState.js'
import { findWreckAtTile } from '../game/unitWreckManager.js'
import { isHelipadAvailableForUnit } from '../utils/helipadUtils.js'
import { hasBlockingBuilding } from '../utils/buildingPassability.js'
import { GAME_DEFAULT_CURSOR } from './cursorStyles.js'

const CURSOR_CLASS_NAMES = [
  'repair-mode',
  'repair-blocked-mode',
  'sell-mode',
  'sell-blocked-mode',
  'move-mode',
  'move-into-mode',
  'move-blocked-mode',
  'attack-mode',
  'attack-blocked-mode',
  'attack-out-of-range-mode',
  'guard-mode'
]

export class CursorManager {
  constructor() {
    this.isOverGameCanvas = false
    this.isOverEnemy = false
    this.isOverFriendlyUnit = false
    this.isOverBlockedTerrain = false
    this.isOverRepairableBuilding = false
    this.isOverSellableBuilding = false
    this.isOverPlayerWorkshop = false
    this.isOverOreTile = false
    this.isOverPlayerRefinery = false
    this.isOverHealableUnit = false
    this.isOverPlayerGasStation = false
    this.isOverRefuelableUnit = false
    this.isForceAttackMode = false
    this.isGuardMode = false
    this.lastMouseEvent = null
    this.isOverEnemyInRange = false
    this.isOverEnemyOutOfRange = false
    this.isInArtilleryRange = false
    this.isOutOfArtilleryRange = false
    this.activeCursorStyle = ''
    this.activeCursorClasses = new Set()
    this.rangeCursorInfo = null
    this.rangeCursorElements = this.createRangeCursorElements()
  }

  isPointInsideRect(x, y, rect) {
    if (!rect) return false
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }

  getSelectedHudBounds(centerX, centerY) {
    const hudPadding = 6
    const halfHudSize = (TILE_SIZE / 2) + hudPadding
    return {
      left: centerX - halfHudSize,
      right: centerX + halfHudSize,
      top: centerY - halfHudSize,
      bottom: centerY + halfHudSize,
      width: halfHudSize * 2,
      height: halfHudSize * 2
    }
  }

  getSelectionHudBarThickness() {
    const parsed = parseInt(gameState.selectionHudBarThickness, 10)
    if (!Number.isFinite(parsed)) {
      return 4
    }
    return Math.max(1, Math.min(8, parsed))
  }

  getSelectionHudMode() {
    return gameState.selectionHudMode || 'modern-donut'
  }

  isCursorOverSelectedUnitOrHud(worldX, worldY, selectedUnits) {
    if (!Array.isArray(selectedUnits) || selectedUnits.length === 0) {
      return false
    }

    const barThickness = this.getSelectionHudBarThickness()
    const barSpan = TILE_SIZE * 0.75
    const hudMode = this.getSelectionHudMode()

    for (const unit of selectedUnits) {
      if (!unit || unit.isBuilding || unit.health <= 0) continue
      if (typeof unit.x !== 'number' || typeof unit.y !== 'number') continue

      const altitudeLift = ((unit.type === 'apache' || unit.type === 'f22Raptor') && unit.altitude) ? unit.altitude * 0.4 : 0
      const centerX = unit.x + TILE_SIZE / 2
      const centerY = unit.y + TILE_SIZE / 2 - altitudeLift

      const unitBounds = {
        left: unit.x,
        right: unit.x + TILE_SIZE,
        top: unit.y,
        bottom: unit.y + TILE_SIZE
      }
      if (this.isPointInsideRect(worldX, worldY, unitBounds)) {
        return true
      }

      const hudBounds = this.getSelectedHudBounds(centerX, centerY)
      if (this.isPointInsideRect(worldX, worldY, hudBounds)) {
        return true
      }

      if (hudMode !== 'modern-donut') {
        const horizontalLeft = centerX - (barSpan / 2)
        const horizontalRight = centerX + (barSpan / 2)
        const verticalTop = centerY - (barSpan / 2)
        const verticalBottom = centerY + (barSpan / 2)

        const topBar = {
          left: horizontalLeft,
          right: horizontalRight,
          top: hudBounds.top - (barThickness / 2),
          bottom: hudBounds.top + (barThickness / 2)
        }
        const bottomBar = {
          left: horizontalLeft,
          right: horizontalRight,
          top: hudBounds.bottom - (barThickness / 2),
          bottom: hudBounds.bottom + (barThickness / 2)
        }
        const leftBar = {
          left: hudBounds.left - (barThickness / 2),
          right: hudBounds.left + (barThickness / 2),
          top: verticalTop,
          bottom: verticalBottom
        }
        const rightBar = {
          left: hudBounds.right - (barThickness / 2),
          right: hudBounds.right + (barThickness / 2),
          top: verticalTop,
          bottom: verticalBottom
        }

        if (this.isPointInsideRect(worldX, worldY, topBar) ||
            this.isPointInsideRect(worldX, worldY, bottomBar) ||
            this.isPointInsideRect(worldX, worldY, leftBar) ||
            this.isPointInsideRect(worldX, worldY, rightBar)) {
          return true
        }
      } else {
        const donutRadius = (Math.min(hudBounds.width, hudBounds.height) / 2) + 2
        const ringHalf = Math.max(1, (barThickness - 2) / 2)
        const distance = Math.hypot(worldX - centerX, worldY - centerY)
        if (Math.abs(distance - donutRadius) <= ringHalf + 1) {
          return true
        }
      }

      if (unit.type !== 'harvester' && unit.level > 0) {
        const starSize = 6
        const starSpacing = 8
        const totalWidth = (unit.level * starSpacing) - (starSpacing - starSize)
        const startX = (centerX - totalWidth / 2) + (hudMode === 'modern-donut' ? 2 : 0)
        const starY = hudMode === 'legacy'
          ? unit.y - 20
          : hudMode === 'modern-donut'
            ? hudBounds.top - 12
            : hudBounds.top - 3
        const starBounds = {
          left: startX - 1,
          right: startX + totalWidth + 1,
          top: starY - (starSize / 2) - 1,
          bottom: starY + (starSize / 2) + 1
        }
        if (this.isPointInsideRect(worldX, worldY, starBounds)) {
          return true
        }
      }
    }

    return false
  }

  createRangeCursorElements() {
    if (typeof document === 'undefined') {
      return null
    }

    if (!document.body) {
      return null
    }

    // Remove any existing element with old structure to ensure clean state
    const existing = document.querySelector('.range-cursor-info')
    if (existing) {
      const rangeText = existing.querySelector('.range-cursor-info__text')
      if (rangeText) {
        return { container: existing, rangeText }
      }
      // Old structure - remove and recreate
      existing.remove()
    }

    const container = document.createElement('div')
    container.className = 'range-cursor-info'

    const rangeText = document.createElement('div')
    rangeText.className = 'range-cursor-info__text'

    container.appendChild(rangeText)
    document.body.appendChild(container)

    return { container, rangeText }
  }

  formatRangeValue(value) {
    const rounded = Math.round(value * 10) / 10
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
  }

  updateRangeCursorDisplay(position, show) {
    if (!this.rangeCursorElements) {
      this.rangeCursorElements = this.createRangeCursorElements()
    }

    if (!this.rangeCursorElements) {
      return
    }

    const { container, rangeText } = this.rangeCursorElements
    if (!container || !rangeText) {
      return
    }

    if (!show || !this.rangeCursorInfo) {
      container.classList.remove('visible')
      return
    }

    const { distance: distanceValue, maxRange } = this.rangeCursorInfo
    const distanceMeters = (distanceValue / TILE_SIZE) * CURSOR_METERS_PER_TILE
    const maxRangeMeters = (maxRange / TILE_SIZE) * CURSOR_METERS_PER_TILE

    rangeText.textContent = `${Math.round(distanceMeters)}m/${Math.round(maxRangeMeters)}m`

    container.style.left = `${position.x}px`
    container.style.top = `${position.y}px`
    container.classList.add('visible')
  }

  applyCursor(gameCanvas, cursorStyle, classNames = []) {
    if (!gameCanvas) {
      return
    }

    const desiredClasses = new Set(
      classNames.filter((className) => CURSOR_CLASS_NAMES.includes(className))
    )

    for (const className of CURSOR_CLASS_NAMES) {
      const shouldHave = desiredClasses.has(className)
      const hasClass = gameCanvas.classList.contains(className)

      if (shouldHave && !hasClass) {
        gameCanvas.classList.add(className)
      } else if (!shouldHave && hasClass) {
        gameCanvas.classList.remove(className)
      }
    }

    this.activeCursorClasses = new Set(desiredClasses)

    const currentCursorStyle = gameCanvas.style.cursor || ''
    if (currentCursorStyle !== cursorStyle) {
      gameCanvas.style.cursor = cursorStyle
    }
    this.activeCursorStyle = cursorStyle
  }

  // Function to check if a location is a blocked tile (water, rock, building)
  isBlockedTerrain(tileX, tileY, mapGrid) {
    // First check if mapGrid is defined and properly structured
    if (!Array.isArray(mapGrid) || mapGrid.length === 0) {
      return false // Can't determine if blocked, assume not blocked
    }

    const height = mapGrid.length
    const firstRow = mapGrid[0]
    const width = Array.isArray(firstRow) ? firstRow.length : 0
    if (width === 0) {
      return false
    }

    // Check if tile coordinates are valid
    if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) {
      return true
    }

    // Ensure we have a valid row before accessing the tile
    const row = mapGrid[tileY]
    if (!Array.isArray(row) || !row[tileX]) {
      return false // Can't determine if blocked, assume not blocked
    }

    // Check if the tile type is impassable
    const tile = row[tileX]
    const tileType = tile.type
    const hasBuilding = hasBlockingBuilding(tile)
    const hasSeedCrystal = tile.seedCrystal
    const occupancyMap = gameState.occupancyMap
    const occupied =
      occupancyMap &&
      occupancyMap[tileY] &&
      occupancyMap[tileY][tileX]

    return (
      tileType === 'water' ||
      tileType === 'rock' ||
      hasBuilding ||
      hasSeedCrystal ||
      occupied
    )
  }

  // Function to update custom cursor position and visibility
  updateCustomCursor(e, mapGrid, factories, selectedUnits, units = []) {
    // Store last mouse event for later refreshes
    this.lastMouseEvent = e
    const gameCanvas = document.getElementById('gameCanvas')
    const rect = gameCanvas.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    const rangeCursorPosition = { x, y }

    const setCursor = (style, classes = []) => {
      const resolvedStyle =
        style === 'default' || style === undefined || style === null || style === ''
          ? GAME_DEFAULT_CURSOR
          : style === 'none'
            ? GAME_DEFAULT_CURSOR
            : style
      const classList = Array.isArray(classes) ? classes.filter(Boolean) : [classes].filter(Boolean)
      this.applyCursor(gameCanvas, resolvedStyle, classList)
    }

    const setOutOfRangeCursor = () => {
      setCursor('none', 'attack-out-of-range-mode')
      this.updateRangeCursorDisplay(rangeCursorPosition, true)
    }

    this.updateRangeCursorDisplay(rangeCursorPosition, false)

    // Check if cursor is over the game canvas
    this.isOverGameCanvas = (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    )

    const edgeScrollState = gameState.desktopEdgeScroll
    if (edgeScrollState) {
      edgeScrollState.clientX = x
      edgeScrollState.clientY = y
      edgeScrollState.overCanvas = this.isOverGameCanvas
      edgeScrollState.lastMoveTime = performance.now()
      if (!this.isOverGameCanvas) {
        edgeScrollState.edgeHoverStart = null
        edgeScrollState.lastAutoScrollTime = null
      }
    }

    // Calculate mouse position in world coordinates
    const worldX = x - rect.left + gameState.scrollOffset.x
    const worldY = y - rect.top + gameState.scrollOffset.y

    // Update global cursor position for other systems like cheats
    gameState.cursorX = worldX
    gameState.cursorY = worldY

    if (this.isCursorOverSelectedUnitOrHud(worldX, worldY, selectedUnits)) {
      setCursor('default')
      this.updateRangeCursorDisplay(rangeCursorPosition, false)
      return
    }

    // Convert to tile coordinates
    const tileX = Math.floor(worldX / TILE_SIZE)
    const tileY = Math.floor(worldY / TILE_SIZE)

    const gridReady = Array.isArray(mapGrid) && mapGrid.length > 0 && Array.isArray(mapGrid[0])
    const gridWidth = gridReady ? mapGrid[0].length : 0
    const gridHeight = gridReady ? mapGrid.length : 0
    const tileWithinBounds = gridReady && tileX >= 0 && tileY >= 0 && tileX < gridWidth && tileY < gridHeight
    const hoveredTile = tileWithinBounds && mapGrid[tileY] ? mapGrid[tileY][tileX] : null

    // Check if mouse is over blocked terrain when in game canvas, with added safety check
    this.isOverBlockedTerrain = this.isOverGameCanvas &&
      gridReady &&
      this.isBlockedTerrain(tileX, tileY, mapGrid)

    // Check if mouse is over a player refinery when harvesters are selected
    this.isOverPlayerRefinery = false
    // Check if mouse is over a healable unit when ambulances are selected
    this.isOverHealableUnit = false
    this.isOverPlayerGasStation = false
    // Check if mouse is over a hospital when ambulances are selected and not fully loaded
    this.isOverPlayerHospital = false
    // Check if mouse is over a repairable unit when recovery tanks are selected
    this.isOverRepairableUnit = false
    // Check if mouse is over a recovery tank when damaged units are selected
    this.isOverRecoveryTank = false
    // Check if mouse is over a wreck when recovery tanks are selected
    this.isOverWreck = false
    this.isOverFriendlyHelipad = false
    this.isOverBlockedHelipad = false
    // Check if mouse is over ammo-receivable units/buildings when ammo trucks are selected
    this.isOverAmmoReceivableTarget = false
    this.isOverServiceProvider = false
    if (this.isOverGameCanvas && gridReady && tileWithinBounds &&
      gameState.buildings && Array.isArray(gameState.buildings)) {
      // Only show refinery cursor if harvesters are selected
      const hasSelectedHarvesters = selectedUnits.some(unit => unit.type === 'harvester')
      // Check for ambulance healing
      const hasSelectedAmbulancesWithMedics = selectedUnits.some(
        unit => unit.type === 'ambulance' && unit.medics > 0
      )
      const hasSelectedNotFullyLoadedAmbulances = selectedUnits.some(unit => unit.type === 'ambulance' && unit.medics < 4)
      // Check for recovery tank interactions
      const hasSelectedRecoveryTanks = selectedUnits.some(unit => unit.type === 'recoveryTank')
      const hasSelectedDamagedUnits = selectedUnits.some(unit => unit.health < unit.maxHealth)
      const hasSelectedApaches = selectedUnits.some(unit => unit.type === 'apache')
      const hasSelectedF22 = selectedUnits.some(unit => unit.type === 'f22Raptor')
      const selectedApacheIds = hasSelectedApaches
        ? selectedUnits.filter(unit => unit.type === 'apache' && unit.id).map(unit => unit.id)
        : []

      if (hasSelectedHarvesters) {
        for (const building of gameState.buildings) {
          if (building.type === 'oreRefinery' &&
              building.owner === gameState.humanPlayer &&
              building.health > 0 &&
              tileX >= building.x && tileX < building.x + building.width &&
              tileY >= building.y && tileY < building.y + building.height) {
            this.isOverPlayerRefinery = true
            break
          }
        }
      }

      // Check for hospital when ambulances that are not fully loaded are selected
      if (hasSelectedNotFullyLoadedAmbulances) {
        for (const building of gameState.buildings) {
          if (building.type === 'hospital' &&
              building.owner === gameState.humanPlayer &&
              building.health > 0 &&
              tileX >= building.x && tileX < building.x + building.width &&
              tileY >= building.y && tileY < building.y + building.height) {
            this.isOverPlayerHospital = true
            break
          }
        }
      }

      const hasUnitsNeedingGas = selectedUnits.some(
        u => typeof u.maxGas === 'number' && u.gas < u.maxGas * 0.75
      )
      if (hasUnitsNeedingGas) {
        for (const building of gameState.buildings) {
          if (building.type === 'gasStation' &&
                building.owner === gameState.humanPlayer &&
                building.health > 0 &&
                tileX >= building.x && tileX < building.x + building.width &&
                tileY >= building.y && tileY < building.y + building.height) {
            this.isOverPlayerGasStation = true
            break
          }
        }
      }

      if (hasSelectedApaches) {
        for (const building of gameState.buildings) {
          if (building.type === 'helipad' &&
                building.owner === gameState.humanPlayer &&
                building.health > 0 &&
                tileX >= building.x && tileX < building.x + building.width &&
                tileY >= building.y && tileY < building.y + building.height) {
            this.isOverFriendlyHelipad = true
            this.isOverBlockedHelipad = !isHelipadAvailableForUnit(building, units, selectedApacheIds)
            break
          }
        }
      }

      if (!this.isOverFriendlyHelipad && hasSelectedF22) {
        for (const building of gameState.buildings) {
          if (building.type === 'airstrip' &&
                building.owner === gameState.humanPlayer &&
                building.health > 0 &&
                tileX >= building.x && tileX < building.x + building.width &&
                tileY >= building.y && tileY < building.y + building.height) {
            this.isOverFriendlyHelipad = true
            this.isOverBlockedHelipad = false
            break
          }
        }
      }

      // Check for healable units when fully loaded ambulances are selected
      if (hasSelectedAmbulancesWithMedics && units && Array.isArray(units)) {
        for (const unit of units) {
          if (unit.owner === gameState.humanPlayer &&
              unit.crew && typeof unit.crew === 'object') {
            const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
            const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

            if (unitTileX === tileX && unitTileY === tileY) {
              // Check if unit has missing crew members
              const missingCrew = Object.entries(unit.crew).filter(([_, alive]) => !alive)
              if (missingCrew.length > 0) {
                this.isOverHealableUnit = true
                break
              }
            }
          }
        }
      }

      // Check for refuelable units when tanker trucks are selected
      this.isOverRefuelableUnit = false
      const hasSelectedTankers = selectedUnits.some(unit => unit.type === 'tankerTruck')
      if (hasSelectedTankers && units && Array.isArray(units)) {
        for (const unit of units) {
          if (unit.owner === gameState.humanPlayer && typeof unit.maxGas === 'number') {
            const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
            const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
            if (unitTileX === tileX && unitTileY === tileY && unit.gas < unit.maxGas) {
              this.isOverRefuelableUnit = true
              break
            }
          }
        }
      }

      // Check for ammo-receivable units/buildings when ammo trucks are selected
      this.isOverAmmoReceivableTarget = false
      const hasSelectedAmmoTrucks = selectedUnits.some(unit => unit.type === 'ammunitionTruck')
      if (hasSelectedAmmoTrucks && units && Array.isArray(units)) {
        // Check units that can receive ammo
        for (const unit of units) {
          if (unit.owner === gameState.humanPlayer && typeof unit.maxAmmunition === 'number') {
            const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
            const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
            if (unitTileX === tileX && unitTileY === tileY && unit.ammunition < unit.maxAmmunition) {
              this.isOverAmmoReceivableTarget = true
              break
            }
          }
        }
        // Check buildings that can receive ammo
        if (!this.isOverAmmoReceivableTarget && gameState.buildings && Array.isArray(gameState.buildings)) {
          for (const building of gameState.buildings) {
            if (building.owner === gameState.humanPlayer) {
              const isAmmoHungryBuilding = typeof building.maxAmmo === 'number' && building.ammo < building.maxAmmo
              const isAmmoFactory = building.type === 'ammunitionFactory'
              if (!isAmmoHungryBuilding && !isAmmoFactory) {
                continue
              }

              if (tileX >= building.x && tileX < building.x + building.width &&
                  tileY >= building.y && tileY < building.y + building.height) {
                this.isOverAmmoReceivableTarget = true
                break
              }
            }
          }
        }
      }
      // Check for service providers when units in need are selected
      this.isOverServiceProvider = false
      if (units && Array.isArray(units)) {
        const needsCrew = selectedUnits.some(unit =>
          unit.owner === gameState.humanPlayer && unit.crew && typeof unit.crew === 'object' &&
          Object.values(unit.crew).some(alive => !alive)
        )
        const needsFuel = selectedUnits.some(unit =>
          unit.owner === gameState.humanPlayer && typeof unit.maxGas === 'number' && unit.gas < unit.maxGas
        )
        const needsRepair = selectedUnits.some(unit =>
          unit.owner === gameState.humanPlayer && unit.health < unit.maxHealth
        )
        const needsAmmo = selectedUnits.some(unit => {
          if (unit.owner !== gameState.humanPlayer) return false
          if (unit.isBuilding) {
            return typeof unit.maxAmmo === 'number' && unit.ammo < unit.maxAmmo
          }
          if (unit.type === 'apache') {
            return typeof unit.maxRocketAmmo === 'number' && unit.rocketAmmo < unit.maxRocketAmmo
          }
          return typeof unit.maxAmmunition === 'number' && unit.ammunition < unit.maxAmmunition
        })

        for (const unit of units) {
          if (unit.owner !== gameState.humanPlayer) continue

          const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
          const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
          if (unitTileX !== tileX || unitTileY !== tileY) {
            continue
          }

          if (unit.type === 'ambulance' && needsCrew && unit.medics > 0) {
            this.isOverServiceProvider = true
            break
          }
          if (unit.type === 'tankerTruck' && needsFuel && (!unit.crew || unit.crew.loader !== false)) {
            this.isOverServiceProvider = true
            break
          }
          if (unit.type === 'recoveryTank' && needsRepair && (!unit.crew || unit.crew.loader !== false)) {
            this.isOverServiceProvider = true
            break
          }
          if (unit.type === 'ammunitionTruck' && needsAmmo && unit.ammoCargo > 0) {
            this.isOverServiceProvider = true
            break
          }
        }
      }
      // Check for repairable units when recovery tanks are selected
      if (hasSelectedRecoveryTanks && units && Array.isArray(units)) {
        for (const unit of units) {
          if (unit.owner === gameState.humanPlayer && unit.type !== 'recoveryTank') {
            const needsRepair = unit.health < unit.maxHealth
            const needsTow = unit.crew && (!unit.crew.driver || !unit.crew.commander)
            if (!needsRepair && !needsTow) continue
            const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
            const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

            if (unitTileX === tileX && unitTileY === tileY) {
              this.isOverRepairableUnit = true
              break
            }
          }
        }
      }

      // Check for recovery tanks when damaged units are selected
      if (hasSelectedDamagedUnits && units && Array.isArray(units)) {
        for (const unit of units) {
          if (unit.owner === gameState.humanPlayer && unit.type === 'recoveryTank') {
            const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
            const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

            if (unitTileX === tileX && unitTileY === tileY) {
              this.isOverRecoveryTank = true
              break
            }
          }
        }
      }

      // Check for wrecks when recovery tanks are selected
      if (hasSelectedRecoveryTanks) {
        const wreck = findWreckAtTile(gameState, tileX, tileY)
        if (wreck) {
          const assignedTankSelected = wreck.assignedTankId && selectedUnits.some(unit => unit.id === wreck.assignedTankId)
          const isRecoverable = !wreck.isBeingRestored && !wreck.towedBy && !wreck.isBeingRecycled &&
            (!wreck.assignedTankId || assignedTankSelected)
          if (isRecoverable) {
            this.isOverWreck = true
          }
        }
      }
    }

    // Check if mouse is over an ore tile when harvesters are selected
    this.isOverOreTile = false
    if (this.isOverGameCanvas && gridReady && tileWithinBounds && hoveredTile) {
      // Only show ore tile cursor if harvesters are selected
      const hasSelectedHarvesters = selectedUnits.some(unit => unit.type === 'harvester')
      if (hasSelectedHarvesters && hoveredTile.ore) {
        this.isOverOreTile = true
      }
    }

    // Check if mouse is over player vehicle workshop when a repairable unit is
    // selected (damaged or tanker truck)
    this.isOverPlayerWorkshop = false
    if (
      this.isOverGameCanvas &&
      gameState.buildings &&
      Array.isArray(gameState.buildings) &&
      gridReady &&
      tileWithinBounds
    ) {
      const needsWorkshop = selectedUnits.some(
        unit => unit.health < unit.maxHealth || unit.type === 'tankerTruck'
      )
      if (needsWorkshop) {
        for (const building of gameState.buildings) {
          if (
            building.type === 'vehicleWorkshop' &&
            building.owner === gameState.humanPlayer &&
            building.health > 0 &&
            tileX >= building.x &&
            tileX < building.x + building.width &&
            tileY >= building.y &&
            tileY < building.y + building.height
          ) {
            this.isOverPlayerWorkshop = true
            break
          }
        }
      }
    }

    // Check if mouse is over a repairable building (when in repair mode)
    this.isOverRepairableBuilding = false
    if (gameState.repairMode && this.isOverGameCanvas) {
      // Check player factory first - Added null check for factories
      if (factories && Array.isArray(factories)) {
        const playerFactory = factories.find(factory => factory && factory.id === gameState.humanPlayer)
        if (playerFactory &&
            tileX >= playerFactory.x && tileX < (playerFactory.x + playerFactory.width) &&
            tileY >= playerFactory.y && tileY < (playerFactory.y + playerFactory.height)) {
          // Factory is repairable if it's not at full health
          this.isOverRepairableBuilding = playerFactory.health < playerFactory.maxHealth
        }
      }

      // Check player buildings
      if (!this.isOverRepairableBuilding && gameState.buildings && gameState.buildings.length > 0) {
        for (const building of gameState.buildings) {
          if (building.owner === gameState.humanPlayer &&
              tileX >= building.x && tileX < (building.x + building.width) &&
              tileY >= building.y && tileY < (building.y + building.height)) {
            // Building is repairable if it's not at full health
            // Concrete walls cannot be repaired
            this.isOverRepairableBuilding = (building.health < building.maxHealth) && building.type !== 'concreteWall'
            break
          }
        }
      }
    }

    // Check if mouse is over a sellable building (when in sell mode)
    this.isOverSellableBuilding = false
    if (gameState.sellMode && this.isOverGameCanvas) {
      // Check player factory first - Player factory can't be sold

      // Check player buildings
      if (gameState.buildings && gameState.buildings.length > 0 && gridReady && tileWithinBounds) {
        for (const building of gameState.buildings) {
          if (building.owner === gameState.humanPlayer &&
              tileX >= building.x && tileX < (building.x + building.width) &&
              tileY >= building.y && tileY < (building.y + building.height) &&
              !building.isBeingSold) {
            // All player buildings can be sold if not currently being sold
            this.isOverSellableBuilding = true
            break
          }
        }
      }
    }

    // If not over the game canvas, just use default cursor
    if (!this.isOverGameCanvas) {
      setCursor('default')
      return
    }

    // REPAIR MODE TAKES PRIORITY
    if (gameState.repairMode) {
      // Use CSS class for cursors and hide system cursor
      const cursorClass = this.isOverRepairableBuilding ? 'repair-mode' : 'repair-blocked-mode'
      setCursor('none', cursorClass)
      return // Exit early to prevent other cursors from showing
    }

    // SELL MODE TAKES SECOND PRIORITY
    if (gameState.sellMode) {
      // Use CSS class for cursors and hide system cursor
      const cursorClass = this.isOverSellableBuilding ? 'sell-mode' : 'sell-blocked-mode'
      setCursor('none', cursorClass)
      return // Exit early to prevent other cursors from showing
    }

    // Default cursor behavior for regular movement/attack
    if (selectedUnits.length > 0) {
      // If only enemy units are selected, use default cursor
      // (player can select enemy units to view them, but can't command them)
      const hasOwnUnits = selectedUnits.some(u => u.owner === gameState.humanPlayer)
      if (!hasOwnUnits) {
        setCursor('default')
        return
      }

      const hasNonBuildingSelected = selectedUnits.some(u => !u.isBuilding)
      const selectedBuildings = selectedUnits.filter(u => u.isBuilding)
      const hasSelectedTankers = selectedUnits.some(unit => unit.type === 'tankerTruck')

      const setMoveIntoCursor = () => setCursor('none', 'move-into-mode')
      const setAttackCursor = () => {
        setCursor('none', 'attack-mode')
        // Show range info for attack cursor when hovering over enemy
        if (this.rangeCursorInfo) {
          this.updateRangeCursorDisplay(rangeCursorPosition, true)
        }
      }
      const setAttackBlockedCursor = () => setCursor('none', 'attack-blocked-mode')
      const setAttackOutOfRangeCursor = () => setOutOfRangeCursor()
      const setMoveBlockedCursor = () => setCursor('none', 'move-blocked-mode')
      const setMoveCursor = () => setCursor('none', 'move-mode')
      const setDefaultCursor = () => setCursor('default')
      const setGrabbingCursor = () => setCursor('grabbing')

      const isArtilleryTurretSelected = (() => {
        if (selectedBuildings.some(b => b.type === 'artilleryTurret')) {
          return true
        }
        if (gameState.buildings) {
          const hasSelectedTurret = gameState.buildings.some(b =>
            b.type === 'artilleryTurret' && b.selected && b.owner === gameState.humanPlayer
          )
          if (hasSelectedTurret) {
            return true
          }
        }
        return selectedUnits.some(u => u.type === 'artilleryTurret')
      })()

      const applyArtilleryTargeting = () => {
        if (!isArtilleryTurretSelected) {
          return false
        }

        if (this.isOverEnemyInRange) {
          setAttackCursor()
          return true
        }

        if (this.isOverEnemyOutOfRange) {
          setAttackOutOfRangeCursor()
          return true
        }

        if (this.isOverEnemy) {
          setAttackCursor()
          return true
        }

        return false
      }

      // CHECK FOR AGF MODE CAPABILITY FIRST - but allow recovery tank interactions to override
      const hasSelectedUnits = selectedUnits.length > 0
      const hasCombatUnits = hasSelectedUnits && selectedUnits.some(unit =>
        unit.type !== 'harvester' && unit.owner === gameState.humanPlayer && !unit.isBuilding
      )
      const hasSelectedFactory = hasSelectedUnits && selectedUnits.some(unit =>
        (unit.isBuilding && (unit.type === 'vehicleFactory' || unit.type === 'constructionYard')) ||
        (unit.id && (unit.id === gameState.humanPlayer))
      )
      const isAGFCapable = hasSelectedUnits && hasCombatUnits && !hasSelectedFactory &&
                          !gameState.buildingPlacementMode &&
                          !gameState.repairMode &&
                          !gameState.sellMode &&
                          !gameState.attackGroupMode

      const hasImmediateMoveIntoTarget = this.isOverWreck ||
          this.isOverRepairableUnit ||
          this.isOverRecoveryTank ||
          this.isOverPlayerWorkshop ||
          this.isOverFriendlyHelipad ||
          this.isOverAmmoReceivableTarget ||
          this.isOverServiceProvider

      if (this.isOverBlockedHelipad) {
        setMoveBlockedCursor()
        return
      }

      if (hasImmediateMoveIntoTarget) {
        setMoveIntoCursor()
        return
      }

      if (isAGFCapable && !this.isGuardMode && !this.isForceAttackMode) {
        const isSupportTarget = this.isOverHealableUnit ||
            this.isOverRefuelableUnit ||
            this.isOverPlayerHospital ||
            this.isOverPlayerGasStation ||
            this.isOverPlayerWorkshop ||
            this.isOverFriendlyHelipad ||
            this.isOverAmmoReceivableTarget ||
            this.isOverServiceProvider

        if (isSupportTarget) {
          setMoveIntoCursor()
        } else if (this.isOverEnemyInRange) {
          setAttackCursor()
        } else if (this.isOverEnemyOutOfRange) {
          setAttackOutOfRangeCursor()
        } else if (this.isOverEnemy) {
          setAttackCursor()
        } else if (this.isOverBlockedTerrain) {
          setMoveBlockedCursor()
        } else if (this.isOverFriendlyUnit) {
          setAttackBlockedCursor()
        } else if (!gameState.isRightDragging) {
          setMoveCursor()
        } else {
          setGrabbingCursor()
        }
        return
      }

      if (hasSelectedTankers && this.isOverEnemy) {
        setAttackCursor()
        return
      }

      if (!hasNonBuildingSelected) {
        const singleBuilding = selectedBuildings.length === 1 ? selectedBuildings[0] : null
        const isVehicleFactory = singleBuilding && singleBuilding.type === 'vehicleFactory'
        const hasSelectedDefenseBuilding = selectedBuildings.some(b =>
          b && (b.type === 'rocketTurret' || b.type === 'artilleryTurret' || b.type === 'teslaCoil' || b.type?.startsWith('turretGun'))
        )

        if (isVehicleFactory) {
          if (this.isOverBlockedTerrain) {
            setMoveBlockedCursor()
          } else if (!gameState.isRightDragging) {
            setMoveCursor()
          } else {
            setGrabbingCursor()
          }
        } else if (applyArtilleryTargeting()) {
          // Artillery targeting already applied
        } else if (hasSelectedDefenseBuilding && this.isOverEnemyOutOfRange) {
          setAttackOutOfRangeCursor()
        } else if (hasSelectedDefenseBuilding && this.isOverEnemy) {
          setAttackCursor()
        } else {
          setDefaultCursor()
        }
        return
      }

      if (this.isGuardMode) {
        setCursor('none', 'guard-mode')
        return
      }

      if (this.isForceAttackMode) {
        if (isArtilleryTurretSelected) {
          if (this.isInArtilleryRange) {
            setAttackCursor()
          } else if (this.isOutOfArtilleryRange) {
            setAttackOutOfRangeCursor()
          } else {
            setAttackCursor()
          }
        } else {
          if (this.isOverEnemyOutOfRange) {
            setAttackOutOfRangeCursor()
          } else {
            setAttackCursor()
          }
        }
        return
      }

      const isLogisticsTarget = this.isOverHealableUnit ||
        this.isOverRefuelableUnit ||
        this.isOverPlayerHospital ||
        this.isOverPlayerGasStation ||
        this.isOverPlayerRefinery ||
        this.isOverAmmoReceivableTarget ||
        this.isOverServiceProvider

      if (isLogisticsTarget) {
        setMoveIntoCursor()
        return
      }

      if (this.isOverFriendlyUnit) {
        setAttackBlockedCursor()
        return
      }

      if (applyArtilleryTargeting()) {
        return
      }

      if (this.isOverEnemyInRange) {
        setAttackCursor()
        return
      }

      if (this.isOverEnemyOutOfRange) {
        setAttackOutOfRangeCursor()
        return
      }

      if (this.isOverEnemy) {
        setAttackCursor()
        return
      }

      if (this.isOverOreTile) {
        setAttackCursor()
        return
      }

      if (this.isOverBlockedTerrain) {
        setMoveBlockedCursor()
        return
      }

      if (gameState.isRightDragging) {
        setGrabbingCursor()
        return
      }

      setMoveCursor()
    } else {
      // No units selected - use default cursor
      setCursor('default')
    }
  }

  updateForceAttackMode(isActive) {
    this.isForceAttackMode = isActive
  }

  updateGuardMode(isActive) {
    if (this.isGuardMode !== isActive) {
      this.isGuardMode = isActive
      window.logger(`[GMF] Guard mode ${isActive ? 'ENABLED' : 'DISABLED'}`)
    }
  }

  // Reapply cursor appearance using the last known mouse position
  refreshCursor(mapGrid, factories, selectedUnits, units = []) {
    if (this.lastMouseEvent) {
      this.updateCustomCursor(this.lastMouseEvent, mapGrid, factories, selectedUnits, units)
    }
  }

  setIsOverEnemy(value) {
    this.isOverEnemy = value
  }

  setIsOverFriendlyUnit(value) {
    this.isOverFriendlyUnit = value
  }

  setIsOverEnemyInRange(value) {
    this.isOverEnemyInRange = value
  }

  setIsOverEnemyOutOfRange(value) {
    this.isOverEnemyOutOfRange = value
  }

  setIsInArtilleryRange(value) {
    this.isInArtilleryRange = value
  }

  setIsOutOfArtilleryRange(value) {
    this.isOutOfArtilleryRange = value
  }

  setRangeCursorInfo(value) {
    this.rangeCursorInfo = value
  }
}
