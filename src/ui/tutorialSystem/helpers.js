import { gameState } from '../../gameState.js'
import { productionQueue } from '../../productionQueue.js'
import { canPlaceBuilding } from '../../buildings.js'
import { selectedUnits } from '../../inputHandler.js'
import { unitCosts } from '../../units.js'
import { inputAwareStepText, isInputMethod } from '../inputMethodGuide.js'
import { TILE_SIZE } from '../../config.js'
import { getPlayableViewportHeight, getPlayableViewportWidth } from '../../utils/layoutMetrics.js'

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getIsTouchLayout() {
  return Boolean(document.body?.classList.contains('is-touch'))
}

// A player who skipped the input-method step has no preference yet. Use the
// method that matches the current layout so the copy (and its recorded
// narrator clip) is the input-aware variant instead of the legacy text.
export function resolveTutorialInputMethod(preferred) {
  if (isInputMethod(preferred)) return preferred
  return getIsTouchLayout() ? 'touch' : 'mouse-keyboard'
}

export function getTextForDevice(step, inputMethod) {
  const adapted = inputAwareStepText(step || {}, inputMethod)
  if (adapted) return adapted
  if (!step?.text) return ''
  if (typeof step.text === 'string') return step.text
  return getIsTouchLayout() ? step.text.mobile : step.text.desktop
}

export function getHintForDevice(step, inputMethod) {
  const hint = step?.hint || ''
  if (inputMethod === 'touch') return hint.replace(/\bClick\b/g, 'Tap')
  if (inputMethod === 'gamepad') return hint.replace(/\bClick\b/g, 'Use the controller pointer to click')
  return hint
}

export function getSpokenTextForStep(step, inputMethod) {
  const mainText = getTextForDevice(step, inputMethod).trim()
  const hintText = getHintForDevice(step, inputMethod).trim()
  if (mainText && hintText) {
    return `${mainText} ${hintText}`
  }
  return mainText || hintText
}

export function getBoundingCenter(element) {
  const rect = element.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  }
}

export function getCanvasPointForTile(tileX, tileY) {
  const canvas = document.getElementById('gameCanvas')
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const clientX = rect.left + (tileX * 32) - gameState.scrollOffset.x + 16
  const clientY = rect.top + (tileY * 32) - gameState.scrollOffset.y + 16
  return { x: clientX, y: clientY }
}

export function getPlayerCrewSnapshot() {
  return new Map((gameState.units || [])
    .filter(unit => unit.crew && typeof unit.crew === 'object' && isHumanOwner(unit.owner))
    .map(unit => [unit.id, { ...unit.crew }]))
}

export function focusCameraOnPoint(point) {
  if (!point) return
  const canvas = document.getElementById('gameCanvas')
  if (!canvas) return
  const mapGrid = gameState.mapGrid
  if (!mapGrid || mapGrid.length === 0) return
  const viewportWidth = getPlayableViewportWidth(canvas)
  const viewportHeight = getPlayableViewportHeight(canvas)
  if (!viewportWidth || !viewportHeight) return
  const mapWidth = mapGrid[0].length * TILE_SIZE
  const mapHeight = mapGrid.length * TILE_SIZE
  const maxScrollX = Math.max(0, mapWidth - viewportWidth)
  const maxScrollY = Math.max(0, mapHeight - viewportHeight)
  const targetX = Math.max(0, Math.min(point.x - viewportWidth / 2, maxScrollX))
  const targetY = Math.max(0, Math.min(point.y - viewportHeight / 2, maxScrollY))

  gameState.dragVelocity.x = 0
  gameState.dragVelocity.y = 0

  if (gameState.smoothScroll) {
    gameState.smoothScroll.targetX = targetX
    gameState.smoothScroll.targetY = targetY
    gameState.smoothScroll.active = true
  } else {
    gameState.scrollOffset.x = targetX
    gameState.scrollOffset.y = targetY
  }
}

export function focusCameraOnUnit(unit) {
  if (!unit) return
  const centerX = unit.x + TILE_SIZE / 2
  const centerY = unit.y + TILE_SIZE / 2
  focusCameraOnPoint({ x: centerX, y: centerY })
}

export function dispatchMouseEvent(target, type, point, options = {}) {
  if (!target || !point) return
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    button: options.button || 0,
    buttons: options.buttons || 1,
    shiftKey: options.shiftKey || false,
    ctrlKey: options.ctrlKey || false,
    metaKey: options.metaKey || false
  })
  target.dispatchEvent(event)
}

export function dispatchClick(target) {
  if (!target) return
  const point = getBoundingCenter(target)
  dispatchMouseEvent(target, 'mousedown', point, { button: 0 })
  dispatchMouseEvent(target, 'mouseup', point, { button: 0, buttons: 0 })
  target.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX: point.x,
    clientY: point.y
  }))
}

export function dispatchCanvasDrag(start, end) {
  const canvas = document.getElementById('gameCanvas')
  if (!canvas || !start || !end) return
  dispatchMouseEvent(canvas, 'mousedown', start, { button: 0 })
  dispatchMouseEvent(canvas, 'mousemove', end, { button: 0, buttons: 1 })
  dispatchMouseEvent(canvas, 'mouseup', end, { button: 0, buttons: 0 })
}

export function dispatchCanvasClick(point, options = {}) {
  const canvas = document.getElementById('gameCanvas')
  if (!canvas || !point) return
  dispatchMouseEvent(canvas, 'mousedown', point, { button: options.button || 0 })
  dispatchMouseEvent(canvas, 'mouseup', point, { button: options.button || 0, buttons: 0 })
}

export function getHumanPlayer() {
  return gameState.humanPlayer || 'player1'
}

export function isHumanOwner(owner) {
  const human = getHumanPlayer()
  return owner === human || (human === 'player1' && owner === 'player')
}

export function countPlayerBuildings(type) {
  return (gameState.buildings || []).filter(building => building.type === type && isHumanOwner(building.owner)).length
}

export function countPlayerUnits(type) {
  return (gameState.units || []).filter(unit => unit.type === type && isHumanOwner(unit.owner)).length
}

export function findPlayerBuilding(type) {
  return (gameState.buildings || []).find(building => building.type === type && isHumanOwner(building.owner))
}

export function findPlayerUnit(type) {
  return (gameState.units || []).find(unit => unit.type === type && isHumanOwner(unit.owner))
}

export function findEnemyTarget() {
  return (gameState.buildings || []).find(building => !isHumanOwner(building.owner) && building.health > 0)
}

export function findBuildLocation(type) {
  const mapGrid = gameState.mapGrid
  if (!mapGrid || mapGrid.length === 0) return null
  const origin = findPlayerBuilding('constructionYard') || gameState.buildings?.find(b => isHumanOwner(b.owner))
  const baseX = origin ? origin.x : Math.floor(mapGrid[0].length / 2)
  const baseY = origin ? origin.y : Math.floor(mapGrid.length / 2)
  const maxRadius = 12
  for (let radius = 2; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const tileX = baseX + dx
        const tileY = baseY + dy
        if (canPlaceBuilding(type, tileX, tileY, mapGrid, gameState.units, gameState.buildings, gameState.factories, getHumanPlayer())) {
          return { x: tileX, y: tileY }
        }
      }
    }
  }
  return null
}

export function findNearestOreTile(fromTile) {
  const mapGrid = gameState.mapGrid
  if (!mapGrid || mapGrid.length === 0) return null
  let best = null
  let bestDist = Number.POSITIVE_INFINITY
  for (let y = 0; y < mapGrid.length; y += 1) {
    for (let x = 0; x < mapGrid[0].length; x += 1) {
      if (!mapGrid[y][x].ore) continue
      const dx = x - fromTile.x
      const dy = y - fromTile.y
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        best = { x, y }
      }
    }
  }
  return best
}

export function getUnitTile(unit) {
  if (!unit) return null
  return {
    x: Math.floor((unit.x + 16) / 32),
    y: Math.floor((unit.y + 16) / 32)
  }
}

export function ensureTutorialUnits(count, type = 'harvester') {
  const existing = countPlayerUnits(type)
  if (existing >= count) return
  const button = document.querySelector(`.production-button[data-unit-type="${type}"]`)
  if (!button) return
  const toCreate = count - existing
  for (let i = 0; i < toCreate; i += 1) {
    productionQueue.addItem(type, button, false)
    const unitCost = unitCosts?.[type] || 0
    if (unitCost) {
      gameState.money = Math.max(0, gameState.money - unitCost)
    }
    productionQueue.completeCurrentUnitProduction()
  }
}

export function hasSelectedUnits() {
  return selectedUnits.length > 0
}

export function selectedUnitCount() {
  return selectedUnits.length
}
