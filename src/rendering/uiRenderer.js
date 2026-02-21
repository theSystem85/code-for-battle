// rendering/uiRenderer.js
import { TILE_SIZE, MAX_BUILDING_GAP_TILES } from '../config.js'
import { buildingData, isTileValid, canPlaceBuilding } from '../buildings.js'
import { gameState } from '../gameState.js'
import { showNotification } from '../ui/notifications.js'
import { getCurrentGame } from '../main.js'
import { renderMapEditorOverlay } from '../mapEditor.js'
import {
  getCanvasLogicalHeight,
  getCanvasLogicalWidth,
  getMobileLandscapeRightUiWidth,
  getSafeAreaInset
} from '../utils/layoutMetrics.js'

export class UIRenderer {
  constructor() {
    this.gameOverEventListenerAdded = false
    this.lastGameOverLayout = null
  }


  getPlanningDisplayName(buildingType) {
    if (buildingType === 'concreteWall') {
      return 'Wall'
    }
    if (buildingType === 'radarStation') {
      return 'Radar'
    }

    return buildingData[buildingType]?.displayName || buildingType
  }

  isWithinPlanningGap(previousTile, nextTile) {
    if (!previousTile || !nextTile) {
      return true
    }

    return Math.max(
      Math.abs(nextTile.x - previousTile.x),
      Math.abs(nextTile.y - previousTile.y)
    ) <= MAX_BUILDING_GAP_TILES
  }

  canRenderPlannedTile(type, tileX, tileY, mapGrid, units, buildings, factories, occupiedTiles) {
    const info = buildingData[type]
    if (!info) {
      return false
    }

    if (!canPlaceBuilding(type, tileX, tileY, mapGrid, units, buildings, factories, gameState.humanPlayer)) {
      return false
    }

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (occupiedTiles.has(`${tileX + x},${tileY + y}`)) {
          return false
        }
      }
    }

    return true
  }

  addPlannedFootprintToOccupiedTiles(type, tileX, tileY, occupiedTiles) {
    const info = buildingData[type]
    if (!info) {
      return
    }

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        occupiedTiles.add(`${tileX + x},${tileY + y}`)
      }
    }
  }
  renderSelectionRectangle(ctx, selectionActive, selectionStart, selectionEnd, scrollOffset) {
    // Draw normal selection rectangle if active
    if (selectionActive && selectionStart && selectionEnd) {
      const rectX = Math.min(selectionStart.x, selectionEnd.x) - scrollOffset.x
      const rectY = Math.min(selectionStart.y, selectionEnd.y) - scrollOffset.y
      const rectWidth = Math.abs(selectionEnd.x - selectionStart.x)
      const rectHeight = Math.abs(selectionEnd.y - selectionStart.y)
      ctx.strokeStyle = '#FF0'
      ctx.lineWidth = 2
      ctx.strokeRect(rectX, rectY, rectWidth, rectHeight)
    }

    // Draw attack group rectangle in red - with debug logging and disable check
    const shouldDrawAGF = !gameState.disableAGFRendering &&
        gameState.attackGroupMode &&
        gameState.attackGroupStart && gameState.attackGroupEnd &&
        (gameState.attackGroupStart.x !== gameState.attackGroupEnd.x ||
         gameState.attackGroupStart.y !== gameState.attackGroupEnd.y)

    if (shouldDrawAGF) {
      const rectX = Math.min(gameState.attackGroupStart.x, gameState.attackGroupEnd.x) - scrollOffset.x
      const rectY = Math.min(gameState.attackGroupStart.y, gameState.attackGroupEnd.y) - scrollOffset.y
      const rectWidth = Math.abs(gameState.attackGroupEnd.x - gameState.attackGroupStart.x)
      const rectHeight = Math.abs(gameState.attackGroupEnd.y - gameState.attackGroupStart.y)

      ctx.strokeStyle = '#FF0000'
      ctx.lineWidth = 2
      ctx.strokeRect(rectX, rectY, rectWidth, rectHeight)

      // Add a subtle red fill
      ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'
      ctx.fillRect(rectX, rectY, rectWidth, rectHeight)
    }
  }

  renderRallyPoints(ctx, factories, scrollOffset) {
    // Draw rally point flags only for selected unit-producing factories/buildings

    // Check selected factories
    factories.forEach(factory => {
      if (factory.rallyPoint && factory.id === gameState.humanPlayer && factory.selected) {
        this.drawRallyPointFlag(ctx, factory.rallyPoint, scrollOffset)
      }
    })

    // Check selected buildings that can produce units
    // Vehicle factory and vehicle workshop should show rally points, not construction yard
    if (gameState.buildings) {
      gameState.buildings.forEach(building => {
        if (building.rallyPoint &&
            building.owner === gameState.humanPlayer &&
            building.selected &&
            (building.type === 'vehicleFactory' || building.type === 'vehicleWorkshop')) {
          this.drawRallyPointFlag(ctx, building.rallyPoint, scrollOffset)
        }
      })
    }
  }

  drawRallyPointFlag(ctx, rallyPoint, scrollOffset) {
    const flagX = rallyPoint.x * TILE_SIZE - scrollOffset.x
    const flagY = rallyPoint.y * TILE_SIZE - scrollOffset.y

    // Draw flag pole
    ctx.strokeStyle = '#8B4513' // Brown color for pole
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(flagX + TILE_SIZE / 2, flagY + TILE_SIZE)
    ctx.lineTo(flagX + TILE_SIZE / 2, flagY)
    ctx.stroke()

    // Draw triangular flag
    ctx.fillStyle = '#FFFF00' // Yellow flag
    ctx.beginPath()
    ctx.moveTo(flagX + TILE_SIZE / 2, flagY)
    ctx.lineTo(flagX + TILE_SIZE, flagY + TILE_SIZE / 3)
    ctx.lineTo(flagX + TILE_SIZE / 2, flagY + TILE_SIZE / 2)
    ctx.closePath()
    ctx.fill()

    // Draw outline around the rally point tile
    ctx.strokeStyle = '#FFFF00'
    ctx.lineWidth = 1
    ctx.strokeRect(flagX, flagY, TILE_SIZE, TILE_SIZE)
  }

  renderBlueprints(ctx, blueprints, scrollOffset) {
    blueprints.forEach(bp => {
      const info = buildingData[bp.type]
      if (!info) return
      const x = bp.x * TILE_SIZE - scrollOffset.x
      const y = bp.y * TILE_SIZE - scrollOffset.y
      ctx.fillStyle = 'rgba(0, 0, 255, 0.3)'
      ctx.fillRect(x, y, info.width * TILE_SIZE, info.height * TILE_SIZE)
      ctx.strokeStyle = '#0000FF'
      ctx.strokeRect(x, y, info.width * TILE_SIZE, info.height * TILE_SIZE)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = '12px "Rajdhani", "Arial Narrow", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(info.displayName, x + (info.width * TILE_SIZE) / 2, y + (info.height * TILE_SIZE) / 2)
    })
  }

  renderBuildingPlacement(ctx, gameState, scrollOffset, buildings, factories, mapGrid, units) {
    // Draw building placement overlay if in placement mode
    if (gameState.buildingPlacementMode && gameState.currentBuildingType && !gameState.mobileBuildPaintMode) {
      const buildingInfo = buildingData[gameState.currentBuildingType]

      if (buildingInfo) {
        const mouseX = gameState.cursorX
        const mouseY = gameState.cursorY

        // Get tile position based on mouse coordinates
        const tileX = Math.floor(mouseX / TILE_SIZE)
        const tileY = Math.floor(mouseY / TILE_SIZE)

        const isPlacementAllowed = canPlaceBuilding(
          gameState.currentBuildingType,
          tileX,
          tileY,
          gameState.mapGrid || mapGrid,
          units,
          buildings,
          factories,
          gameState.humanPlayer
        )

        // Draw placement grid
        for (let y = 0; y < buildingInfo.height; y++) {
          for (let x = 0; x < buildingInfo.width; x++) {
            const currentTileX = tileX + x
            const currentTileY = tileY + y

            // Calculate screen coordinates
            const screenX = currentTileX * TILE_SIZE - scrollOffset.x
            const screenY = currentTileY * TILE_SIZE - scrollOffset.y

            // Check if valid placement for this tile (terrain/units check only)
            const isValid = isTileValid(
              currentTileX,
              currentTileY,
              mapGrid,
              units,
              buildings,
              factories,
              gameState.currentBuildingType
            )

            // Determine final color
            ctx.fillStyle = isValid && isPlacementAllowed ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)'
            ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE)

            // Draw tile outline
            ctx.strokeStyle = '#fff'
            ctx.lineWidth = 1
            ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE)
          }
        }

        // Draw building name above cursor
        ctx.fillStyle = '#fff'
        ctx.font = '14px "Rajdhani", "Arial Narrow", sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(
          this.getPlanningDisplayName(gameState.currentBuildingType),
          tileX * TILE_SIZE + (buildingInfo.width * TILE_SIZE / 2) - scrollOffset.x,
          tileY * TILE_SIZE - 10 - scrollOffset.y
        )
      }
    }
  }

  computeChainPositions(startX, startY, endX, endY, info) {
    const dx = endX - startX
    const dy = endY - startY
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    const stepX = horizontal ? (dx >= 0 ? info.width : -info.width) : 0
    const stepY = horizontal ? 0 : (dy >= 0 ? info.height : -info.height)
    const count = horizontal
      ? Math.floor(Math.abs(dx) / info.width)
      : Math.floor(Math.abs(dy) / info.height)
    const positions = []
    for (let i = 1; i <= count; i++) {
      positions.push({ x: startX + stepX * i, y: startY + stepY * i })
    }
    return positions
  }


  renderMobileBuildPaintPlacement(ctx, gameState, scrollOffset, mapGrid, units) {
    if (!gameState.mobileBuildPaintMode || !gameState.mobileBuildPaintType) return

    const buildingType = gameState.mobileBuildPaintType
    const info = buildingData[buildingType]
    const tiles = Array.isArray(gameState.mobileBuildPaintTiles) ? gameState.mobileBuildPaintTiles : []
    if (!info || tiles.length === 0) return

    const occupiedTiles = new Set()
    ;(gameState.blueprints || []).forEach(bp => {
      this.addPlannedFootprintToOccupiedTiles(bp.type, bp.x, bp.y, occupiedTiles)
    })

    const planningFactories = getCurrentGame()?.factories || []
    let lastValidTile = null
    tiles.forEach((pos, index) => {
      const isNearPrevious = this.isWithinPlanningGap(lastValidTile, pos)
      const isValid = isNearPrevious && this.canRenderPlannedTile(
        buildingType,
        pos.x,
        pos.y,
        mapGrid,
        units,
        gameState.buildings || [],
        planningFactories,
        occupiedTiles
      )

      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const tx = pos.x + x
          const ty = pos.y + y
          const screenX = tx * TILE_SIZE - scrollOffset.x
          const screenY = ty * TILE_SIZE - scrollOffset.y
          ctx.fillStyle = isValid ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)'
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE)
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1
          ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE)
        }
      }

      const tileWidth = info.width * TILE_SIZE
      const tileHeight = info.height * TILE_SIZE
      const anchorX = pos.x * TILE_SIZE - scrollOffset.x
      const anchorY = pos.y * TILE_SIZE - scrollOffset.y

      ctx.save()
      ctx.font = 'bold 12px "Rajdhani", "Arial Narrow", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'
      ctx.lineWidth = 3
      const textX = anchorX + tileWidth / 2
      const textY = anchorY + tileHeight * 0.75
      ctx.strokeText(String(index + 1), textX, textY)
      ctx.fillStyle = '#fff'
      ctx.fillText(String(index + 1), textX, textY)
      ctx.restore()

      if (isValid) {
        this.addPlannedFootprintToOccupiedTiles(buildingType, pos.x, pos.y, occupiedTiles)
        lastValidTile = pos
      }
    })

    const firstTile = tiles[0]
    if (firstTile) {
      ctx.fillStyle = '#fff'
      ctx.font = '14px "Rajdhani", "Arial Narrow", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(
        this.getPlanningDisplayName(buildingType),
        firstTile.x * TILE_SIZE + (info.width * TILE_SIZE / 2) - scrollOffset.x,
        firstTile.y * TILE_SIZE - 10 - scrollOffset.y
      )
    }
  }


  renderChainPlacement(ctx, gameState, scrollOffset, mapGrid, units) {
    if (gameState.chainBuildMode && gameState.chainBuildingType) {
      const info = buildingData[gameState.chainBuildingType]
      const startX = gameState.chainStartX
      const startY = gameState.chainStartY
      const endX = Math.floor(gameState.cursorX / TILE_SIZE)
      const endY = Math.floor(gameState.cursorY / TILE_SIZE)
      const positions = this.computeChainPositions(startX, startY, endX, endY, info)

      positions.forEach(pos => {
        for (let y = 0; y < info.height; y++) {
          for (let x = 0; x < info.width; x++) {
            const tx = pos.x + x
            const ty = pos.y + y
            const screenX = tx * TILE_SIZE - scrollOffset.x
            const screenY = ty * TILE_SIZE - scrollOffset.y
            const isValid = isTileValid(
              tx,
              ty,
              mapGrid,
              units,
              [],
              [],
              gameState.chainBuildingType
            )
            ctx.fillStyle = isValid ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)'
            ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE)
            ctx.strokeStyle = '#fff'
            ctx.lineWidth = 1
            ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE)
          }
        }
      })
    }
  }

  calculateGameOverLayout(gameCanvas, isMultiplayerDefeat = false) {
    if (!gameCanvas) {
      return null
    }

    const logicalWidth = getCanvasLogicalWidth(gameCanvas)
    const logicalHeight = getCanvasLogicalHeight(gameCanvas)

    if (!Number.isFinite(logicalWidth) || !Number.isFinite(logicalHeight) ||
        logicalWidth <= 0 || logicalHeight <= 0) {
      return null
    }

    const safeLeft = getSafeAreaInset('left')
    const safeRight = getSafeAreaInset('right')
    const safeTop = getSafeAreaInset('top')
    const safeBottom = getSafeAreaInset('bottom')
    const rightUiWidth = getMobileLandscapeRightUiWidth()
    const rightObstruction = Math.max(safeRight, rightUiWidth)

    const adjustedWidth = logicalWidth - safeLeft - rightObstruction
    const adjustedHeight = logicalHeight - safeTop - safeBottom

    // Modal dimensions - centered with max size
    const maxModalWidth = Math.min(adjustedWidth * 0.9, 480)
    const maxModalHeight = Math.min(adjustedHeight * 0.9, 520)

    const modalWidth = Math.max(280, maxModalWidth)
    const modalHeight = Math.max(320, maxModalHeight)

    const modalX = safeLeft + (adjustedWidth - modalWidth) / 2
    const modalY = safeTop + (adjustedHeight - modalHeight) / 2

    // Dynamic font sizing based on modal size
    const headingFontSize = Math.round(Math.max(20, Math.min(
      modalWidth * 0.065,
      modalHeight * 0.06,
      36
    )))
    const statsFontSize = Math.round(Math.max(12, Math.min(
      modalWidth * 0.04,
      modalHeight * 0.035,
      18
    )))

    const padding = Math.max(16, modalWidth * 0.05)
    const headingY = modalY + padding

    // Button sizing
    const buttonHeight = Math.max(40, Math.min(modalHeight * 0.1, 52))
    const buttonWidth = Math.min(modalWidth - padding * 2, 280)
    const buttonGap = Math.max(10, buttonHeight * 0.25)
    const buttonFontSize = Math.round(Math.max(14, Math.min(statsFontSize + 2, 18)))

    // Calculate how many buttons we need
    const numButtons = isMultiplayerDefeat ? 2 : 1
    const totalButtonsHeight = numButtons * buttonHeight + (numButtons - 1) * buttonGap

    // Stats layout
    const statsStartY = headingY + headingFontSize + padding * 0.5
    const statsSpacing = Math.max(statsFontSize * 1.3, 20)
    // statsTotalHeight not needed here; stats startY will be adjusted dynamically during rendering

    // Position buttons at bottom of modal
    const buttonsStartY = modalY + modalHeight - padding - totalButtonsHeight
    const buttonX = modalX + (modalWidth - buttonWidth) / 2

    return {
      modal: {
        x: modalX,
        y: modalY,
        width: modalWidth,
        height: modalHeight
      },
      overlay: {
        x: 0,
        y: 0,
        width: logicalWidth,
        height: logicalHeight
      },
      heading: {
        x: modalX + modalWidth / 2,
        y: headingY,
        fontSize: headingFontSize
      },
      stats: {
        x: modalX + modalWidth / 2,
        startY: statsStartY,
        fontSize: statsFontSize,
        spacing: statsSpacing
      },
      buttons: {
        x: buttonX,
        startY: buttonsStartY,
        width: buttonWidth,
        height: buttonHeight,
        gap: buttonGap,
        fontSize: buttonFontSize,
        centerX: modalX + modalWidth / 2
      },
      padding
    }
  }

  renderGameOver(ctx, gameCanvas, gameState) {
    // Check if we should show the defeat modal for multiplayer
    const isMultiplayerDefeat = gameState?.localPlayerDefeated && !gameState?.isSpectator && !gameState?.gameOver

    // If game over or multiplayer defeat, render win/lose overlay
    if ((gameState?.gameOver && gameState?.gameOverMessage) || isMultiplayerDefeat) {
      const layout = this.calculateGameOverLayout(gameCanvas, isMultiplayerDefeat)

      if (!layout) {
        return false
      }

      this.lastGameOverLayout = layout

      // Draw semi-transparent overlay over entire screen
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
      ctx.fillRect(0, 0, layout.overlay.width, layout.overlay.height)

      // Draw modal background with rounded corners effect
      const { modal } = layout

      // Modal shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fillRect(modal.x + 4, modal.y + 4, modal.width, modal.height)

      // Modal background - gradient effect
      const gradient = ctx.createLinearGradient(modal.x, modal.y, modal.x, modal.y + modal.height)
      gradient.addColorStop(0, '#2a2a3a')
      gradient.addColorStop(1, '#1a1a2a')
      ctx.fillStyle = gradient
      ctx.fillRect(modal.x, modal.y, modal.width, modal.height)

      // Modal border
      ctx.strokeStyle = gameState.gameResult === 'victory' ? '#4CAF50' :
        gameState.gameResult === 'defeat' ? '#f44336' : '#666'
      ctx.lineWidth = 2
      ctx.strokeRect(modal.x, modal.y, modal.width, modal.height)

      // Render game over message with glow effect and text wrapping
      const message = gameState.gameResult === 'victory' ? 'VICTORY' : 'DEFEAT'
      const subMessage = gameState.gameResult === 'victory'
        ? 'All enemy buildings destroyed!'
        : 'All your buildings have been destroyed!'

      ctx.font = `bold ${layout.heading.fontSize}px "Rajdhani", "Arial Narrow", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      // Text glow for main title
      ctx.shadowColor = gameState.gameResult === 'victory' ? '#4CAF50' : '#f44336'
      ctx.shadowBlur = 10
      ctx.fillStyle = gameState.gameResult === 'victory' ? '#4CAF50' : '#f44336'
      ctx.fillText(message, layout.heading.x, layout.heading.y)
      ctx.shadowBlur = 0

      // Render subtitle (wrapped if needed) below the main title
      const subtitleY = layout.heading.y + layout.heading.fontSize + 8
      const subtitleFontSize = Math.max(12, layout.heading.fontSize * 0.6)
      ctx.font = `${subtitleFontSize}px "Rajdhani", "Arial Narrow", sans-serif`
      ctx.fillStyle = '#ccc'

      // Wrap subtitle text into lines (don't rely on layout.stats.startY yet)
      const maxTextWidth = modal.width - layout.padding * 2
      const words = subMessage.split(' ')
      const subtitleLines = []
      let currentLine = ''
      let measured

      for (let i = 0; i < words.length; i++) {
        const testLine = (currentLine + words[i] + ' ').trimEnd() + ' '
        measured = ctx.measureText(testLine)
        if (measured.width > maxTextWidth && currentLine.length > 0) {
          subtitleLines.push(currentLine.trim())
          currentLine = words[i] + ' '
        } else {
          currentLine = (currentLine + words[i] + ' ').trimEnd() + ' '
        }
      }
      if (currentLine.trim().length > 0) subtitleLines.push(currentLine.trim())

      // Draw subtitle lines and compute final Y for stats layout
      let lineY = subtitleY
      const subtitleLineSpacing = subtitleFontSize + 4
      subtitleLines.forEach((ln) => {
        ctx.fillText(ln, layout.heading.x, lineY)
        lineY += subtitleLineSpacing
      })

      // Ensure statistics block starts below subtitle (with a comfortable gap)
      const minStatsStart = lineY + Math.max(8, layout.padding * 0.25)
      if (layout.stats && typeof layout.stats.startY === 'number') {
        layout.stats.startY = Math.max(layout.stats.startY, minStatsStart)
      }

      // Render statistics with icons/styling
      ctx.font = `${layout.stats.fontSize}px "Rajdhani", "Arial Narrow", sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#ddd'

      const statsLines = [
        { icon: '🎖️', label: 'Your Units Lost', value: gameState.playerUnitsDestroyed || 0 },
        { icon: '💀', label: 'Enemy Units Destroyed', value: gameState.enemyUnitsDestroyed || 0 },
        { icon: '🏠', label: 'Your Buildings Lost', value: gameState.playerBuildingsDestroyed || 0 },
        { icon: '💥', label: 'Enemy Buildings Destroyed', value: gameState.enemyBuildingsDestroyed || 0 },
        { icon: '💰', label: 'Total Money Earned', value: `$${(gameState.totalMoneyEarned || 0).toLocaleString()}` }
      ]

      statsLines.forEach((stat, index) => {
        const lineY = layout.stats.startY + index * layout.stats.spacing
        // Icon and label
        ctx.textAlign = 'left'
        ctx.fillStyle = '#aaa'
        ctx.fillText(`${stat.icon} ${stat.label}:`, layout.modal.x + layout.padding, lineY)
        // Value
        ctx.textAlign = 'right'
        ctx.fillStyle = '#fff'
        ctx.fillText(String(stat.value), layout.modal.x + layout.modal.width - layout.padding, lineY)
      })

      // Render buttons
      const { buttons } = layout

      if (isMultiplayerDefeat) {
        // Two buttons for multiplayer defeat: New Game and Spectator Mode

        // New Game button
        const newGameY = buttons.startY
        this.renderButton(ctx, buttons.x, newGameY, buttons.width, buttons.height,
          '🔄 New Game', buttons.fontSize, '#f44336', '#fff')

        // Spectator Mode button
        const spectatorY = buttons.startY + buttons.height + buttons.gap
        this.renderButton(ctx, buttons.x, spectatorY, buttons.width, buttons.height,
          '👁️ Watch as Spectator', buttons.fontSize, '#2196F3', '#fff')

        // Store button positions for click handling
        this.newGameButton = { x: buttons.x, y: newGameY, width: buttons.width, height: buttons.height }
        this.spectatorButton = { x: buttons.x, y: spectatorY, width: buttons.width, height: buttons.height }
      } else {
        // Single button for regular game over
        this.renderButton(ctx, buttons.x, buttons.startY, buttons.width, buttons.height,
          '🔄 Reset Game', buttons.fontSize, '#f44336', '#fff')
        this.newGameButton = { x: buttons.x, y: buttons.startY, width: buttons.width, height: buttons.height }
        this.spectatorButton = null
      }

      ctx.textBaseline = 'alphabetic'

      // Handle button clicks - only add listener once
      if (!this.gameOverEventListenerAdded) {
        this.gameOverClickHandler = (event) => {
          const rect = gameCanvas.getBoundingClientRect()
          const scaleX = gameCanvas.width / rect.width / (window.devicePixelRatio || 1)
          const scaleY = gameCanvas.height / rect.height / (window.devicePixelRatio || 1)
          const clickX = (event.clientX - rect.left) * scaleX
          const clickY = (event.clientY - rect.top) * scaleY

          // Check New Game button
          if (this.newGameButton && this.isClickInButton(clickX, clickY, this.newGameButton)) {
            this.handleNewGame()
            return
          }

          // Check Spectator button (only in multiplayer defeat)
          if (this.spectatorButton && this.isClickInButton(clickX, clickY, this.spectatorButton)) {
            this.handleSpectatorMode()
            return
          }
        }

        gameCanvas.addEventListener('click', this.gameOverClickHandler)
        this.gameOverEventListenerAdded = true
      }

      return true // Signal that game over was rendered
    } else {
      // Game is not over, remove event listener if it was added
      if (this.gameOverEventListenerAdded) {
        const gameCanvas = document.getElementById('gameCanvas')
        if (gameCanvas) {
          gameCanvas.removeEventListener('click', this.gameOverClickHandler)
        }
        this.gameOverEventListenerAdded = false
        this.gameOverClickHandler = null
      }
      this.lastGameOverLayout = null
      this.newGameButton = null
      this.spectatorButton = null
    }
    return false
  }

  renderButton(ctx, x, y, width, height, text, fontSize, bgColor, textColor) {
    // Button shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.fillRect(x + 2, y + 2, width, height)

    // Button background with gradient
    const gradient = ctx.createLinearGradient(x, y, x, y + height)
    gradient.addColorStop(0, bgColor)
    gradient.addColorStop(1, this.darkenColor(bgColor, 30))
    ctx.fillStyle = gradient
    ctx.fillRect(x, y, width, height)

    // Button border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, width, height)

    // Button text
    ctx.font = `bold ${fontSize}px "Rajdhani", "Arial Narrow", sans-serif`
    ctx.fillStyle = textColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + width / 2, y + height / 2)
  }

  darkenColor(hex, percent) {
    // Simple color darkening for gradient effect
    const num = parseInt(hex.replace('#', ''), 16)
    const amt = Math.round(2.55 * percent)
    const R = Math.max((num >> 16) - amt, 0)
    const G = Math.max((num >> 8 & 0x00FF) - amt, 0)
    const B = Math.max((num & 0x0000FF) - amt, 0)
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)
  }

  isClickInButton(clickX, clickY, button) {
    return clickX >= button.x && clickX <= button.x + button.width &&
           clickY >= button.y && clickY <= button.y + button.height
  }

  handleNewGame() {
    (async() => {
      try {
        const gameInstance = getCurrentGame()

        if (gameInstance && typeof gameInstance.resetGame === 'function') {
          await gameInstance.resetGame()
          showNotification('Game restarted while preserving win/loss statistics')
        } else {
          window.logger.warn('Game instance not found or resetGame method missing, falling back to page reload')
          window.location.reload()
        }
      } catch (err) {
        console.error('Could not import game instance, falling back to page reload:', err)
        window.location.reload()
      }
    })()
  }

  handleSpectatorMode() {
    // Enable spectator mode - player can watch but not interact
    gameState.isSpectator = true
    gameState.localPlayerDefeated = false // Clear the defeat flag so modal disappears

    // Disable shadow of war so spectator can see the whole map
    gameState.spectatorShadowOfWarDisabled = gameState.shadowOfWarEnabled
    gameState.shadowOfWarEnabled = false

    // Deselect all units
    if (gameState.units) {
      gameState.units.forEach(unit => { unit.selected = false })
    }

    showNotification('👁️ Spectator Mode - You can now watch the remaining players', 4000)
  }

  render(ctx, gameCanvas, gameState, selectionActive, selectionStart, selectionEnd, scrollOffset, factories, buildings, mapGrid, units) {
    // Check for game over first
    if (this.renderGameOver(ctx, gameCanvas, gameState)) {
      return // Stop rendering if game is over
    }

    this.renderSelectionRectangle(ctx, selectionActive, selectionStart, selectionEnd, scrollOffset)
    this.renderRallyPoints(ctx, factories, scrollOffset)
    this.renderBlueprints(ctx, gameState.blueprints || [], scrollOffset)
    this.renderBuildingPlacement(ctx, gameState, scrollOffset, buildings, factories, mapGrid, units)
    this.renderChainPlacement(ctx, gameState, scrollOffset, mapGrid, units)
    this.renderMobileBuildPaintPlacement(ctx, gameState, scrollOffset, mapGrid, units)
    renderMapEditorOverlay(ctx, scrollOffset)
  }
}
