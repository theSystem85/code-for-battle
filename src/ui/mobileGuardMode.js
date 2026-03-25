import { gameState } from '../gameState.js'
import {
  isMobileGuardModeActive,
  selectedUnits,
  setMobileGuardModeActive
} from '../inputHandler.js'
import { isReplayInteractionLocked, isReplayModeActive } from '../replaySystem.js'
import { showNotification } from './notifications.js'

const NON_COMBAT_UNIT_TYPES = new Set([
  'harvester',
  'ambulance',
  'tankerTruck',
  'ammunitionTruck',
  'recoveryTank',
  'mineLayer',
  'mineSweeper'
])

const mobileGuardState = {
  initialized: false,
  button: null
}

function getGuardButton() {
  if (!mobileGuardState.button || !mobileGuardState.button.isConnected) {
    mobileGuardState.button = document.getElementById('guardBtn')
  }
  return mobileGuardState.button
}

function hasSelectedCombatUnit() {
  return selectedUnits.some(unit => {
    if (!unit || unit.health <= 0 || unit.isBuilding) {
      return false
    }
    if (unit.owner !== gameState.humanPlayer) {
      return false
    }
    return !NON_COMBAT_UNIT_TYPES.has(unit.type)
  })
}

export function refreshMobileGuardButtonState() {
  const guardBtn = getGuardButton()
  if (!guardBtn) {
    return
  }

  const isCondensedPortrait = document.body.classList.contains('mobile-portrait')
    && document.body.classList.contains('sidebar-condensed')
  const canShowGuard = isCondensedPortrait && hasSelectedCombatUnit()

  if (!canShowGuard && isMobileGuardModeActive()) {
    setMobileGuardModeActive(false)
  }

  guardBtn.style.display = canShowGuard ? '' : 'none'

  const isActive = canShowGuard && isMobileGuardModeActive()
  guardBtn.classList.toggle('active', isActive)
  guardBtn.classList.toggle('guard-mode-active', isActive)
  guardBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false')
}

export function initMobileGuardMode() {
  if (mobileGuardState.initialized || typeof document === 'undefined') {
    return
  }

  const guardBtn = getGuardButton()
  if (!guardBtn) {
    return
  }

  guardBtn.addEventListener('click', () => {
    if (isReplayModeActive() || isReplayInteractionLocked()) {
      showNotification('Replay mode: guard commands are disabled.')
      return
    }

    if (!hasSelectedCombatUnit()) {
      setMobileGuardModeActive(false)
      refreshMobileGuardButtonState()
      return
    }

    setMobileGuardModeActive(!isMobileGuardModeActive())
    refreshMobileGuardButtonState()
  })

  document.addEventListener('mobile-guard-applied', () => {
    if (!isMobileGuardModeActive()) return
    setMobileGuardModeActive(false)
    refreshMobileGuardButtonState()
  })

  mobileGuardState.initialized = true
  refreshMobileGuardButtonState()
}
