// inputHandler.js
import { gameState } from './gameState.js'
import { CursorManager } from './input/cursorManager.js'
import { MouseHandler } from './input/mouseHandler.js'
import { KeyboardHandler } from './input/keyboardHandler.js'
import { SelectionManager } from './input/selectionManager.js'
import { UnitCommandsHandler } from './input/unitCommands.js'
import { isForceAttackModifierActive, isGuardModifierActive } from './utils/inputUtils.js'
import { GAME_DEFAULT_CURSOR, preloadCursorAssets } from './input/cursorStyles.js'
import { observeMultiplayerSession } from './network/multiplayerSessionEvents.js'
import { showNotification } from './ui/notifications.js'

export const selectedUnits = []
export const selectionActive = false
export const selectionStartExport = { x: 0, y: 0 }
export const selectionEndExport = { x: 0, y: 0 }

const REMOTE_CHEAT_MESSAGE = 'Cheats are host-only for remote clients'
const isLocalClientSession = (session) => Boolean(session?.isRemote && session?.localRole === 'client')
let remoteControlsLocked = isLocalClientSession(gameState.multiplayerSession)

observeMultiplayerSession((event) => {
  remoteControlsLocked = isLocalClientSession(event?.detail)
})

function remoteCheatGuard(event) {
  if (!remoteControlsLocked) {
    return
  }
  const key = event.key?.toLowerCase()
  if (key !== 'c' || gameState.cheatDialogOpen || gameState.runtimeConfigDialogOpen) {
    return
  }
  event.preventDefault()
  event.stopImmediatePropagation()
  showNotification(REMOTE_CHEAT_MESSAGE, 2300)
}

document.addEventListener('keydown', remoteCheatGuard, { capture: true, passive: false })

// Initialize input system components
const cursorManager = new CursorManager()
const mouseHandler = new MouseHandler()
const keyboardHandler = new KeyboardHandler()
const selectionManager = new SelectionManager()
const unitCommands = new UnitCommandsHandler()
keyboardHandler.setUnitCommands(unitCommands)

export function setRenderScheduler(callback) {
  mouseHandler.setRenderScheduler(callback)
  keyboardHandler.setRenderScheduler(callback)
}

export function setupInputHandlers(units, factories, mapGrid) {
  preloadCursorAssets()

  // Store human player factory reference for later use
  const humanPlayer = gameState.humanPlayer || 'player1'
  const playerFactory = factories.find(factory => factory.id === humanPlayer) || factories.find(factory => factory.id === 'player')
  keyboardHandler.setPlayerFactory(playerFactory)

  // Store a reference to gameState for direct updates
  gameState.selectionActive = false
  gameState.selectionStart = { x: 0, y: 0 }
  gameState.selectionEnd = { x: 0, y: 0 }

  const gameCanvas = document.getElementById('gameCanvas')

  // Setup input handlers
  mouseHandler.setupMouseEvents(gameCanvas, units, factories, mapGrid, selectedUnits, selectionManager, unitCommands, cursorManager)
  keyboardHandler.setupKeyboardEvents(units, selectedUnits, mapGrid, factories)

  // Give keyboard handler access to mouse handler for ESC key functionality
  keyboardHandler.setMouseHandler(mouseHandler)

  // Make cheat system globally accessible for damage prevention
  window.cheatSystem = keyboardHandler.getCheatSystem()

  // Apply the initial state for the custom cursor
  // Set up the document-level mousemove event
  document.addEventListener('mousemove', (e) => {
    // Update Force Attack mode status based on the self-attack key
    cursorManager.updateForceAttackMode(isForceAttackModifierActive())

    // Update custom cursor position
    cursorManager.updateCustomCursor(e, gameState.mapGrid || [], gameState.factories || [], selectedUnits, units)

    // Detect if over sidebar to ensure cursor is hidden there
    const sidebar = document.getElementById('sidebar')
    if (sidebar) {
      const sidebarRect = sidebar.getBoundingClientRect()
      const isOverSidebar = (
        e.clientX >= sidebarRect.left &&
          e.clientX <= sidebarRect.right &&
          e.clientY >= sidebarRect.top &&
          e.clientY <= sidebarRect.bottom
      )

      // Always reset to the shared default cursor over the sidebar
      if (isOverSidebar) {
        document.body.style.cursor = GAME_DEFAULT_CURSOR
      }
    }
  })

  // Listen for modifier key presses to toggle force attack or guard cursor
  document.addEventListener('keydown', (e) => {
    if (isForceAttackModifierActive(e)) {
      cursorManager.updateForceAttackMode(true)
      cursorManager.refreshCursor(gameState.mapGrid || [], gameState.factories || [], selectedUnits)
    }
    if (isGuardModifierActive(e) && selectedUnits.length > 0) {
      cursorManager.updateGuardMode(true)
      cursorManager.refreshCursor(gameState.mapGrid || [], gameState.factories || [], selectedUnits)
    }
  })

  document.addEventListener('keyup', (e) => {
    if (e.key === 'Control') {
      isForceAttackModifierActive(e) // update cached state
      cursorManager.updateForceAttackMode(false)
      cursorManager.refreshCursor(gameState.mapGrid || [], gameState.factories || [], selectedUnits)
    }
    if (e.key === 'Meta') {
      isGuardModifierActive(e)
      cursorManager.updateGuardMode(false)
      cursorManager.refreshCursor(gameState.mapGrid || [], gameState.factories || [], selectedUnits)
    }
  })
}

// Safety function: Call this at the beginning of each frame update
// to remove any destroyed units from selection
export function cleanupDestroyedSelectedUnits() {
  selectionManager.cleanupDestroyedSelectedUnits(selectedUnits)
}

// Expose keyboard handler instance for modules that need to interact with it
export function getKeyboardHandler() {
  return keyboardHandler
}

// Provide access to unit command handler for other systems
export function getUnitCommandsHandler() {
  return unitCommands
}
