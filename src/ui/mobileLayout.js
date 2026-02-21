// Mobile layout and sidebar management
import { gameState } from '../gameState.js'
import { updateEnergyBar } from './energyBar.js'

const PORTRAIT_SIDEBAR_STATE_KEY = 'mobilePortraitSidebarState'
const PORTRAIT_SIDEBAR_DEFAULT_STATE = 'condensed'
const PORTRAIT_SIDEBAR_STATES = new Set(['collapsed', 'condensed', 'expanded'])

const mobileLayoutState = {
  productionArea: null,
  originalParent: null,
  originalNextSibling: null,
  mobileContainer: null,
  sidebarToggle: null,
  sidebarToggleListenerAttached: false,
  actions: null,
  actionsOriginalParent: null,
  actionsOriginalNextSibling: null,
  mobileActionsContainer: null,
  portraitHud: null,
  portraitMinimapDock: null,
  portraitActionsContainer: null,
  portraitActionsLeft: null,
  minimap: null,
  minimapOriginalParent: null,
  minimapOriginalNextSibling: null,
  mobileControls: null,
  mobileJoystickContainer: null,
  mobileStatusBar: null,
  mobileMoneyValue: null,
  mobileMoneyBar: null,
  mobileEnergyBar: null,
  mobileEnergyValue: null,
  sidebarUtilityContainer: null,
  restartButton: null,
  restartOriginalParent: null,
  restartOriginalNextSibling: null,
  musicButton: null,
  musicOriginalParent: null,
  musicOriginalNextSibling: null,
  sidebarMenuButton: null,
  sidebarMenuButtonListenerAttached: false,
  sidebarExpandButton: null,
  sidebarExpandButtonListenerAttached: false,
  sidebarModal: null,
  sidebarModalContent: null,
  sidebarModalCloseButton: null,
  sidebarModalDismissListenerAttached: false,
  sidebarModalKeydownListenerAttached: false,
  sidebarModalVisible: false,
  isSidebarCondensed: null,
  saveLoadMenu: null,
  saveLoadOriginalParent: null,
  saveLoadOriginalNextSibling: null,
  statsSection: null,
  statsOriginalParent: null,
  statsOriginalNextSibling: null,
  sidebarSwipeHandlersAttached: false,
  sidebarSwipeState: null,
  sidebarSwipeHandlers: null,
  isSidebarCollapsed: null,
  portraitSidebarState: null,
  hasPortraitStateBeenSynced: false
}

let getGameInstance = () => null

export function setMobileLayoutGameAccessor(fn) {
  getGameInstance = typeof fn === 'function' ? fn : () => null
}

function getStoredPortraitSidebarState() {
  if (typeof localStorage === 'undefined') {
    return null
  }
  try {
    const stored = localStorage.getItem(PORTRAIT_SIDEBAR_STATE_KEY)
    return PORTRAIT_SIDEBAR_STATES.has(stored) ? stored : null
  } catch (error) {
    window?.logger?.warn('Failed to read portrait sidebar state from localStorage:', error)
    return null
  }
}

function persistPortraitSidebarState(state) {
  if (typeof localStorage === 'undefined' || !PORTRAIT_SIDEBAR_STATES.has(state)) {
    return
  }
  try {
    localStorage.setItem(PORTRAIT_SIDEBAR_STATE_KEY, state)
  } catch (error) {
    window?.logger?.warn('Failed to save portrait sidebar state to localStorage:', error)
  }
}

function getPortraitSidebarStateFromBody() {
  if (!document.body) {
    return PORTRAIT_SIDEBAR_DEFAULT_STATE
  }
  if (document.body.classList.contains('sidebar-collapsed')) {
    return 'collapsed'
  }
  if (document.body.classList.contains('sidebar-condensed')) {
    return 'condensed'
  }
  return 'expanded'
}

function applyPortraitSidebarState(state) {
  if (!document.body) {
    return
  }
  if (state === 'collapsed') {
    document.body.classList.add('sidebar-collapsed')
    document.body.classList.remove('sidebar-condensed')
  } else if (state === 'condensed') {
    document.body.classList.add('sidebar-condensed')
    document.body.classList.remove('sidebar-collapsed')
  } else {
    document.body.classList.remove('sidebar-collapsed')
    document.body.classList.remove('sidebar-condensed')
  }

  mobileLayoutState.isSidebarCollapsed = state === 'collapsed'
  mobileLayoutState.isSidebarCondensed = state === 'condensed'
  mobileLayoutState.portraitSidebarState = state
}

function syncPortraitSidebarState() {
  if (!document.body) {
    return
  }
  const storedState = getStoredPortraitSidebarState()
  const desiredState = storedState || mobileLayoutState.portraitSidebarState || PORTRAIT_SIDEBAR_DEFAULT_STATE
  applyPortraitSidebarState(desiredState)
  if (!storedState) {
    persistPortraitSidebarState(desiredState)
  }
}

function ensureMobileLayoutElements() {
  if (typeof document === 'undefined') {
    return
  }

  if (!mobileLayoutState.productionArea || !mobileLayoutState.productionArea.isConnected) {
    const productionArea = document.getElementById('productionArea')
    if (productionArea) {
      mobileLayoutState.productionArea = productionArea
      if (!mobileLayoutState.originalParent) {
        mobileLayoutState.originalParent = productionArea.parentNode || null
        mobileLayoutState.originalNextSibling = productionArea.nextSibling || null
      }
    }
  }

  if (!mobileLayoutState.mobileContainer || !mobileLayoutState.mobileContainer.isConnected) {
    mobileLayoutState.mobileContainer = document.getElementById('mobileBuildMenuContainer')
  }

  if (!mobileLayoutState.actions || !mobileLayoutState.actions.isConnected) {
    const actions = document.getElementById('actions')
    if (actions) {
      mobileLayoutState.actions = actions
      if (!mobileLayoutState.actionsOriginalParent) {
        mobileLayoutState.actionsOriginalParent = actions.parentNode || null
        mobileLayoutState.actionsOriginalNextSibling = actions.nextSibling || null
      }
    }
  }

  if (!mobileLayoutState.mobileActionsContainer || !mobileLayoutState.mobileActionsContainer.isConnected) {
    mobileLayoutState.mobileActionsContainer = document.getElementById('mobileActionsContainer')
  }

  if (!mobileLayoutState.portraitHud || !mobileLayoutState.portraitHud.isConnected) {
    mobileLayoutState.portraitHud = document.getElementById('mobilePortraitHud')
  }

  if (!mobileLayoutState.portraitMinimapDock || !mobileLayoutState.portraitMinimapDock.isConnected) {
    mobileLayoutState.portraitMinimapDock = document.getElementById('mobilePortraitMinimapDock')
  }

  if (!mobileLayoutState.portraitActionsContainer || !mobileLayoutState.portraitActionsContainer.isConnected) {
    mobileLayoutState.portraitActionsContainer = document.getElementById('mobilePortraitActions')
  }

  if (!mobileLayoutState.portraitActionsLeft || !mobileLayoutState.portraitActionsLeft.isConnected) {
    mobileLayoutState.portraitActionsLeft = document.getElementById('mobilePortraitActionsLeft')
  }

  if (!mobileLayoutState.minimap || !mobileLayoutState.minimap.isConnected) {
    const minimap = document.getElementById('minimap')
    if (minimap) {
      mobileLayoutState.minimap = minimap
      if (!mobileLayoutState.minimapOriginalParent) {
        mobileLayoutState.minimapOriginalParent = minimap.parentNode || null
        mobileLayoutState.minimapOriginalNextSibling = minimap.nextSibling || null
      }
    }
  }

  if (!mobileLayoutState.mobileControls || !mobileLayoutState.mobileControls.isConnected) {
    mobileLayoutState.mobileControls = document.getElementById('mobileSidebarControls')
  }

  if (!mobileLayoutState.mobileJoystickContainer || !mobileLayoutState.mobileJoystickContainer.isConnected) {
    mobileLayoutState.mobileJoystickContainer = document.getElementById('mobileJoystickContainer')
  }

  if (!mobileLayoutState.sidebarToggle || !mobileLayoutState.sidebarToggle.isConnected) {
    mobileLayoutState.sidebarToggle = document.getElementById('sidebarToggle')
    mobileLayoutState.sidebarToggleListenerAttached = false
  }

  if (!mobileLayoutState.sidebarUtilityContainer || !mobileLayoutState.sidebarUtilityContainer.isConnected) {
    mobileLayoutState.sidebarUtilityContainer = document.getElementById('sidebarUtilityButtons')
  }

  if (!mobileLayoutState.restartButton || !mobileLayoutState.restartButton.isConnected) {
    const restartButton = document.getElementById('restartBtn')
    if (restartButton) {
      mobileLayoutState.restartButton = restartButton
      if (!mobileLayoutState.restartOriginalParent) {
        mobileLayoutState.restartOriginalParent = restartButton.parentNode || null
        mobileLayoutState.restartOriginalNextSibling = restartButton.nextSibling || null
      }
    }
  }

  if (!mobileLayoutState.musicButton || !mobileLayoutState.musicButton.isConnected) {
    const musicButton = document.getElementById('musicControl')
    if (musicButton) {
      mobileLayoutState.musicButton = musicButton
      if (!mobileLayoutState.musicOriginalParent) {
        mobileLayoutState.musicOriginalParent = musicButton.parentNode || null
        mobileLayoutState.musicOriginalNextSibling = musicButton.nextSibling || null
      }
    }
  }

  if (!mobileLayoutState.sidebarMenuButton || !mobileLayoutState.sidebarMenuButton.isConnected) {
    mobileLayoutState.sidebarMenuButton = document.getElementById('mobileSidebarMenuBtn')
    mobileLayoutState.sidebarMenuButtonListenerAttached = false
  }

  if (!mobileLayoutState.sidebarModal || !mobileLayoutState.sidebarModal.isConnected) {
    mobileLayoutState.sidebarModal = document.getElementById('mobileSidebarModal')
  }

  if (!mobileLayoutState.sidebarModalContent || !mobileLayoutState.sidebarModalContent.isConnected) {
    mobileLayoutState.sidebarModalContent = document.getElementById('mobileSidebarModalContent')
  }

  if (!mobileLayoutState.sidebarModalCloseButton || !mobileLayoutState.sidebarModalCloseButton.isConnected) {
    mobileLayoutState.sidebarModalCloseButton = document.getElementById('mobileSidebarModalClose')
  }

  if (!mobileLayoutState.sidebarExpandButton || !mobileLayoutState.sidebarExpandButton.isConnected) {
    mobileLayoutState.sidebarExpandButton = document.getElementById('mobileSidebarExpandBtn')
    mobileLayoutState.sidebarExpandButtonListenerAttached = false
  }

  if (!mobileLayoutState.saveLoadMenu) {
    const saveLoadMenu = document.getElementById('saveLoadMenu')
    if (saveLoadMenu) {
      mobileLayoutState.saveLoadMenu = saveLoadMenu
      if (!mobileLayoutState.saveLoadOriginalParent) {
        mobileLayoutState.saveLoadOriginalParent = saveLoadMenu.parentNode || null
        mobileLayoutState.saveLoadOriginalNextSibling = saveLoadMenu.nextSibling || null
      }
    }
  }

  if (!mobileLayoutState.statsSection) {
    const statsSection = document.getElementById('stats')
    if (statsSection) {
      mobileLayoutState.statsSection = statsSection
      if (!mobileLayoutState.statsOriginalParent) {
        mobileLayoutState.statsOriginalParent = statsSection.parentNode || null
        mobileLayoutState.statsOriginalNextSibling = statsSection.nextSibling || null
      }
    }
  }

  if (mobileLayoutState.sidebarToggle && !mobileLayoutState.sidebarToggleListenerAttached) {
    mobileLayoutState.sidebarToggle.addEventListener('click', () => {
      if (
        !document.body ||
        (!document.body.classList.contains('mobile-landscape') &&
          !document.body.classList.contains('mobile-portrait'))
      ) {
        return
      }
      const currentlyCollapsed = document.body.classList.contains('sidebar-collapsed')
      setSidebarCollapsed(!currentlyCollapsed)
    })
    mobileLayoutState.sidebarToggleListenerAttached = true
  }

  if (mobileLayoutState.sidebarMenuButton && !mobileLayoutState.sidebarMenuButtonListenerAttached) {
    mobileLayoutState.sidebarMenuButton.addEventListener('click', event => {
      event.preventDefault()
      if (!document.body || (!document.body.classList.contains('mobile-landscape') && !document.body.classList.contains('mobile-portrait'))) {
        return
      }
      if (mobileLayoutState.sidebarModalVisible) {
        closeMobileSidebarModal()
      } else {
        openMobileSidebarModal()
      }
    })
    mobileLayoutState.sidebarMenuButtonListenerAttached = true
  }

  if (mobileLayoutState.sidebarExpandButton && !mobileLayoutState.sidebarExpandButtonListenerAttached) {
    mobileLayoutState.sidebarExpandButton.addEventListener('click', event => {
      event.preventDefault()
      if (!document.body || !document.body.classList.contains('mobile-portrait')) {
        return
      }
      const isCondensed = document.body.classList.contains('sidebar-condensed')
      if (isCondensed) {
        setSidebarCondensed(false)
      } else {
        setSidebarCondensed(true)
      }
    })
    mobileLayoutState.sidebarExpandButtonListenerAttached = true
  }

  if (mobileLayoutState.sidebarModal && !mobileLayoutState.sidebarModalDismissListenerAttached) {
    mobileLayoutState.sidebarModal.addEventListener('click', event => {
      const target = event.target
      if (!target || typeof target.closest !== 'function') {
        return
      }
      const dismissTrigger = target.closest('[data-modal-dismiss]')
      if (dismissTrigger) {
        event.preventDefault()
        closeMobileSidebarModal()
      }
    })
    mobileLayoutState.sidebarModalDismissListenerAttached = true
  }

  if (typeof document !== 'undefined' && !mobileLayoutState.sidebarModalKeydownListenerAttached) {
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && mobileLayoutState.sidebarModalVisible) {
        closeMobileSidebarModal()
      }
    })
    mobileLayoutState.sidebarModalKeydownListenerAttached = true
  }
}

function ensureMobileStatusBar(container, orientation) {
  if (!container) {
    return
  }

  let statusBar = mobileLayoutState.mobileStatusBar
  if (!statusBar || !statusBar.isConnected) {
    statusBar = document.getElementById('mobileStatusBar')
    if (statusBar) {
      mobileLayoutState.mobileStatusBar = statusBar
    }
  }

  if (!statusBar) {
    statusBar = document.createElement('div')
    statusBar.id = 'mobileStatusBar'

    const moneyRow = document.createElement('div')
    moneyRow.id = 'mobileMoneyDisplay'
    moneyRow.className = 'mobile-resource-row'

    const moneyTrack = document.createElement('div')
    moneyTrack.id = 'mobileMoneyTrack'

    const moneyBar = document.createElement('div')
    moneyBar.id = 'mobileMoneyBar'

    const moneyValue = document.createElement('span')
    moneyValue.id = 'mobileMoneyValue'
    moneyValue.className = 'mobile-resource-value'
    moneyValue.textContent = '$0'

    moneyTrack.appendChild(moneyBar)
    moneyTrack.appendChild(moneyValue)
    moneyRow.appendChild(moneyTrack)

    const energyContainer = document.createElement('div')
    energyContainer.id = 'mobileEnergyBarContainer'
    energyContainer.className = 'mobile-resource-row'

    const energyTrack = document.createElement('div')
    energyTrack.id = 'mobileEnergyTrack'

    const energyBar = document.createElement('div')
    energyBar.id = 'mobileEnergyBar'

    const energyValue = document.createElement('span')
    energyValue.id = 'mobileEnergyValue'
    energyValue.className = 'mobile-resource-value energy-bar-value'
    energyValue.textContent = '0 MW'

    energyTrack.appendChild(energyBar)
    energyTrack.appendChild(energyValue)
    energyContainer.appendChild(energyTrack)

    statusBar.appendChild(moneyRow)
    statusBar.appendChild(energyContainer)

    mobileLayoutState.mobileStatusBar = statusBar
    mobileLayoutState.mobileMoneyValue = moneyValue
    mobileLayoutState.mobileMoneyBar = moneyBar
    mobileLayoutState.mobileEnergyBar = energyBar
    mobileLayoutState.mobileEnergyValue = energyValue
  } else {
    mobileLayoutState.mobileMoneyValue = document.getElementById('mobileMoneyValue')
    mobileLayoutState.mobileMoneyBar = document.getElementById('mobileMoneyBar')
    mobileLayoutState.mobileEnergyBar = document.getElementById('mobileEnergyBar')
    mobileLayoutState.mobileEnergyValue = document.getElementById('mobileEnergyValue')
    statusBar = mobileLayoutState.mobileStatusBar
  }

  if (statusBar) {
    statusBar.setAttribute('data-orientation', orientation || '')
  }

  if (statusBar.parentNode !== container) {
    container.insertBefore(statusBar, container.firstChild || null)
  }

  if (mobileLayoutState.mobileMoneyValue) {
    const currentMoney = Math.max(0, Math.floor(gameState.money || 0))
    mobileLayoutState.mobileMoneyValue.textContent = `$${currentMoney}`
  }

  if (typeof updateEnergyBar === 'function') {
    updateEnergyBar()
  }
}

function getCanvasManager() {
  const game = getGameInstance?.()
  return game?.canvasManager
}

export function setSidebarCollapsed(collapsed, options = {}) {
  if (!document.body) {
    return
  }

  const previouslyCollapsed = document.body.classList.contains('sidebar-collapsed')
  if (collapsed) {
    document.body.classList.remove('sidebar-condensed')
    mobileLayoutState.isSidebarCondensed = false
    clearPortraitCondensedLayout()
  }
  document.body.classList.toggle('sidebar-collapsed', collapsed)
  const nowCollapsed = document.body.classList.contains('sidebar-collapsed')
  if (!options.preservePreference) {
    mobileLayoutState.isSidebarCollapsed = collapsed
  }
  if (!options.preservePreference && document.body.classList.contains('mobile-portrait')) {
    persistPortraitSidebarState(getPortraitSidebarStateFromBody())
  }

  const toggleButton = mobileLayoutState.sidebarToggle
  if (toggleButton) {
    toggleButton.setAttribute('aria-expanded', (!collapsed).toString())
    toggleButton.setAttribute('aria-label', collapsed ? 'Open sidebar' : 'Collapse sidebar')
    const body = document.body
    const hideToggle = !!(body && body.classList.contains('mobile-portrait') && !collapsed)
    toggleButton.setAttribute('aria-hidden', hideToggle ? 'true' : 'false')
    if (hideToggle) {
      toggleButton.setAttribute('tabindex', '-1')
    } else {
      toggleButton.removeAttribute('tabindex')
    }
    toggleButton.classList.toggle('portrait-toggle-hidden', hideToggle)
  }

  if (
    previouslyCollapsed !== nowCollapsed &&
    getCanvasManager() &&
    typeof getCanvasManager().resizeCanvases === 'function'
  ) {
    getCanvasManager().resizeCanvases()
  }
}

export function setSidebarCondensed(condensed, options = {}) {
  if (!document.body) {
    return
  }

  const wasCondensed = document.body.classList.contains('sidebar-condensed')
  if (condensed) {
    document.body.classList.add('sidebar-condensed')
    document.body.classList.remove('sidebar-collapsed')
    mobileLayoutState.isSidebarCondensed = true
    mobileLayoutState.isSidebarCollapsed = false
  } else {
    document.body.classList.remove('sidebar-condensed')
    mobileLayoutState.isSidebarCondensed = false
  }

  if (wasCondensed !== condensed && document.body.classList.contains('mobile-portrait')) {
    applyMobileSidebarLayout('portrait')
    document.dispatchEvent(new CustomEvent('sidebar-condensed-changed', {
      detail: { condensed, isPortrait: true }
    }))
    if (!options.preservePreference) {
      persistPortraitSidebarState(getPortraitSidebarStateFromBody())
    }
  }

  if (
    wasCondensed !== condensed &&
    getCanvasManager() &&
    typeof getCanvasManager().resizeCanvases === 'function'
  ) {
    getCanvasManager().resizeCanvases()
  }
}

export function ensureSidebarSwipeHandlers(enable) {
  if (typeof document === 'undefined') {
    return
  }

  if (!enable) {
    if (mobileLayoutState.sidebarSwipeHandlersAttached && mobileLayoutState.sidebarSwipeHandlers) {
      const { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel } = mobileLayoutState.sidebarSwipeHandlers
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchCancel)
    }
    mobileLayoutState.sidebarSwipeHandlersAttached = false
    mobileLayoutState.sidebarSwipeHandlers = null
    mobileLayoutState.sidebarSwipeState = null
    return
  }

  if (mobileLayoutState.sidebarSwipeHandlersAttached) {
    return
  }

  const handleTouchStart = (event) => {
    const body = document.body
    if (!body) {
      mobileLayoutState.sidebarSwipeState = null
      return
    }

    const isLandscape = body.classList.contains('mobile-landscape')
    const isPortrait = body.classList.contains('mobile-portrait')
    if (!isLandscape && !isPortrait) {
      mobileLayoutState.sidebarSwipeState = null
      return
    }

    if (!event.touches || event.touches.length !== 1) {
      mobileLayoutState.sidebarSwipeState = null
      return
    }

    const touch = event.touches[0]
    const collapsed = body.classList.contains('sidebar-collapsed')
    const condensed = body.classList.contains('sidebar-condensed')
    const edgeThreshold = 28
    const activeThreshold = 140
    const touchTarget = event.target
    const startedInsideSidebar = !!(touchTarget && typeof touchTarget.closest === 'function' && touchTarget.closest('#sidebar'))

    if (isLandscape) {
      if (collapsed && touch.clientX <= edgeThreshold) {
        mobileLayoutState.sidebarSwipeState = {
          type: 'open',
          identifier: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          lastX: touch.clientX,
          lastY: touch.clientY
        }
        return
      }

      if (!collapsed && touch.clientX <= activeThreshold) {
        mobileLayoutState.sidebarSwipeState = {
          type: 'close',
          identifier: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          lastX: touch.clientX,
          lastY: touch.clientY
        }
        return
      }

      mobileLayoutState.sidebarSwipeState = null
      return
    }

    if (isPortrait) {
      if (
        !collapsed &&
        !condensed &&
        startedInsideSidebar
      ) {
        mobileLayoutState.sidebarSwipeState = {
          type: 'condense',
          identifier: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          lastX: touch.clientX,
          lastY: touch.clientY
        }
        return
      }

      if (condensed) {
        const startedInBuildBar = !!(touchTarget && typeof touchTarget.closest === 'function' && touchTarget.closest('#mobileBuildMenuContainer'))
        if (startedInBuildBar) {
          mobileLayoutState.sidebarSwipeState = {
            type: 'hide-from-bar',
            identifier: touch.identifier,
            startX: touch.clientX,
            startY: touch.clientY,
            lastX: touch.clientX,
            lastY: touch.clientY
          }
          return
        }

        if (touch.clientX <= edgeThreshold) {
          mobileLayoutState.sidebarSwipeState = {
            type: 'expand',
            identifier: touch.identifier,
            startX: touch.clientX,
            startY: touch.clientY,
            lastX: touch.clientX,
            lastY: touch.clientY
          }
          return
        }
      }

      mobileLayoutState.sidebarSwipeState = null
    } else {
      mobileLayoutState.sidebarSwipeState = null
    }
  }

  const handleTouchMove = (event) => {
    const swipeState = mobileLayoutState.sidebarSwipeState
    if (!swipeState) {
      return
    }

    if (!event.touches) {
      mobileLayoutState.sidebarSwipeState = null
      return
    }

    const touch = Array.from(event.touches).find(t => t.identifier === swipeState.identifier)
    if (!touch) {
      return
    }

    swipeState.lastX = touch.clientX
    swipeState.lastY = touch.clientY

    const deltaX = Math.abs(touch.clientX - swipeState.startX)
    const deltaY = Math.abs(touch.clientY - swipeState.startY)
    if (swipeState.type === 'hide-from-bar' && deltaY > deltaX && deltaY > 10) {
      event.preventDefault()
    } else if (swipeState.type !== 'hide-from-bar' && deltaX > deltaY && deltaX > 10) {
      event.preventDefault()
    }
  }

  const endSwipe = (event) => {
    const swipeState = mobileLayoutState.sidebarSwipeState
    if (!swipeState) {
      return
    }

    if (!event.changedTouches) {
      mobileLayoutState.sidebarSwipeState = null
      return
    }

    const touch = Array.from(event.changedTouches).find(t => t.identifier === swipeState.identifier)
    if (!touch) {
      return
    }

    const deltaX = touch.clientX - swipeState.startX
    const deltaY = touch.clientY - swipeState.startY
    const absoluteDeltaY = Math.abs(deltaY)
    const horizontal = Math.abs(deltaX) > absoluteDeltaY
    const activationThreshold = 40

    if (horizontal) {
      if (swipeState.type === 'open' && deltaX > activationThreshold) {
        setSidebarCollapsed(false)
      } else if (swipeState.type === 'close' && deltaX < -activationThreshold) {
        setSidebarCollapsed(true)
      } else if (swipeState.type === 'condense' && deltaX < -activationThreshold) {
        setSidebarCondensed(true)
      } else if (swipeState.type === 'expand' && deltaX > activationThreshold) {
        setSidebarCondensed(false)
      }
    } else if (swipeState.type === 'hide-from-bar' && absoluteDeltaY > activationThreshold) {
      if (deltaY > 0) {
        setSidebarCollapsed(true)
      }
    }

    mobileLayoutState.sidebarSwipeState = null
  }

  const cancelSwipe = () => {
    mobileLayoutState.sidebarSwipeState = null
  }

  document.addEventListener('touchstart', handleTouchStart, { passive: true })
  document.addEventListener('touchmove', handleTouchMove, { passive: false })
  document.addEventListener('touchend', endSwipe)
  document.addEventListener('touchcancel', cancelSwipe)

  mobileLayoutState.sidebarSwipeHandlersAttached = true
  mobileLayoutState.sidebarSwipeHandlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: endSwipe,
    onTouchCancel: cancelSwipe
  }
}

function restoreProductionArea() {
  const { productionArea, originalParent, originalNextSibling } = mobileLayoutState
  if (!productionArea || !originalParent) {
    return
  }

  if (productionArea.parentNode !== originalParent) {
    if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
      originalParent.insertBefore(productionArea, originalNextSibling)
    } else {
      originalParent.appendChild(productionArea)
    }
  }
}

function restoreMinimap() {
  const { minimap, minimapOriginalParent, minimapOriginalNextSibling } = mobileLayoutState
  if (!minimap || !minimapOriginalParent) {
    return
  }
  if (minimap.parentNode !== minimapOriginalParent) {
    if (minimapOriginalNextSibling && minimapOriginalNextSibling.parentNode === minimapOriginalParent) {
      minimapOriginalParent.insertBefore(minimap, minimapOriginalNextSibling)
    } else {
      minimapOriginalParent.appendChild(minimap)
    }
  }
}

function applyPortraitCondensedLayout() {
  const {
    productionArea,
    mobileContainer,
    actions,
    portraitActionsContainer: _portraitActionsContainer,
    portraitHud
  } = mobileLayoutState

  if (!productionArea || !mobileContainer) {
    return
  }

  if (productionArea.parentNode !== mobileContainer) {
    mobileContainer.appendChild(productionArea)
  }
  mobileContainer.setAttribute('aria-hidden', 'false')
  mobileContainer.setAttribute('data-orientation', 'portrait-condensed')

  ensureMobileStatusBar(mobileContainer, 'portrait-condensed')

  const { portraitActionsLeft } = mobileLayoutState
  if (actions && portraitActionsLeft && actions.parentNode !== portraitActionsLeft) {
    portraitActionsLeft.appendChild(actions)
  }

  if (portraitHud) {
    portraitHud.setAttribute('aria-hidden', 'false')
    portraitHud.setAttribute('data-orientation', 'portrait-condensed')
  }
}

function clearPortraitCondensedLayout() {
  const { mobileContainer, portraitHud } = mobileLayoutState
  restoreProductionArea()
  restoreActions()
  if (mobileContainer) {
    mobileContainer.setAttribute('aria-hidden', 'true')
    mobileContainer.removeAttribute('data-orientation')
  }
  if (portraitHud) {
    portraitHud.setAttribute('aria-hidden', 'true')
    portraitHud.removeAttribute('data-orientation')
  }
}

function restoreActions() {
  const { actions, actionsOriginalParent, actionsOriginalNextSibling } = mobileLayoutState
  if (!actions || !actionsOriginalParent) {
    return
  }

  if (actions.parentNode !== actionsOriginalParent) {
    if (actionsOriginalNextSibling && actionsOriginalNextSibling.parentNode === actionsOriginalParent) {
      actionsOriginalParent.insertBefore(actions, actionsOriginalNextSibling)
    } else {
      actionsOriginalParent.appendChild(actions)
    }
  }
}

function restoreUtilityButton(button, originalParent, originalNextSibling) {
  if (!button || !originalParent) {
    return
  }

  if (button.parentNode !== originalParent) {
    if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
      originalParent.insertBefore(button, originalNextSibling)
    } else {
      originalParent.appendChild(button)
    }
  }
}

function restoreSidebarSection(section, originalParent, originalNextSibling) {
  if (!section || !originalParent) {
    return
  }

  if (section.parentNode !== originalParent) {
    if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
      originalParent.insertBefore(section, originalNextSibling)
    } else {
      originalParent.appendChild(section)
    }
  }
}

function moveSidebarSectionToModal(section) {
  const { sidebarModalContent } = mobileLayoutState
  if (!section || !sidebarModalContent) {
    return
  }

  if (section.parentNode !== sidebarModalContent) {
    sidebarModalContent.appendChild(section)
  }
}

function setMobileSidebarModalVisible(visible) {
  mobileLayoutState.sidebarModalVisible = !!visible

  if (typeof document === 'undefined') {
    return
  }

  const { sidebarModal, sidebarMenuButton } = mobileLayoutState
  if (sidebarModal) {
    sidebarModal.setAttribute('aria-hidden', visible ? 'false' : 'true')
  }

  if (sidebarMenuButton) {
    sidebarMenuButton.setAttribute('aria-expanded', visible ? 'true' : 'false')
  }

  if (document.body) {
    document.body.classList.toggle('mobile-sidebar-modal-open', !!visible)
  }
}

export function openMobileSidebarModal() {
  if (typeof document === 'undefined' || !document.body || !document.body.classList.contains('mobile-landscape')) {
    return
  }

  moveSidebarSectionToModal(mobileLayoutState.saveLoadMenu)
  moveSidebarSectionToModal(mobileLayoutState.statsSection)
  setMobileSidebarModalVisible(true)

  const { sidebarModal, sidebarModalCloseButton } = mobileLayoutState
  if (sidebarModal) {
    const focusTarget = sidebarModal.querySelector('input, button, select, textarea, [tabindex]:not([tabindex="-1"])')
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus()
    } else if (sidebarModalCloseButton && typeof sidebarModalCloseButton.focus === 'function') {
      sidebarModalCloseButton.focus()
    }
  }
}

export function closeMobileSidebarModal() {
  setMobileSidebarModalVisible(false)
}

export function isMobileSidebarModalVisible() {
  return mobileLayoutState.sidebarModalVisible
}

export function applyMobileSidebarLayout(mode, _options = {}) {
  ensureMobileLayoutElements()

  const {
    productionArea,
    mobileContainer,
    actions,
    mobileActionsContainer,
    mobileControls,
    mobileJoystickContainer,
    sidebarUtilityContainer,
    restartButton,
    musicButton,
    sidebarMenuButton,
    sidebarModal,
    saveLoadMenu,
    statsSection
  } = mobileLayoutState

  if (!productionArea || !mobileContainer || !document.body) {
    return
  }

  const isLandscape = mode === 'landscape'
  const isPortrait = mode === 'portrait'
  const isMobile = isLandscape || isPortrait

  if (isPortrait && !mobileLayoutState.hasPortraitStateBeenSynced) {
    syncPortraitSidebarState()
    mobileLayoutState.hasPortraitStateBeenSynced = true
  }

  const isCondensed = isPortrait && document.body.classList.contains('sidebar-condensed')

  if (isLandscape) {
    restoreMinimap()
    if (mobileLayoutState.portraitHud) {
      mobileLayoutState.portraitHud.setAttribute('aria-hidden', 'true')
      mobileLayoutState.portraitHud.removeAttribute('data-orientation')
    }
    ensureMobileStatusBar(mobileContainer, mode)
    if (productionArea.parentNode !== mobileContainer) {
      mobileContainer.appendChild(productionArea)
    }
    mobileContainer.setAttribute('aria-hidden', 'false')
    mobileContainer.setAttribute('data-orientation', mode)
    if (mobileActionsContainer && actions && actions.parentNode !== mobileActionsContainer) {
      mobileActionsContainer.appendChild(actions)
    }
    if (sidebarUtilityContainer) {
      sidebarUtilityContainer.setAttribute('aria-hidden', 'false')
      if (restartButton && restartButton.parentNode !== sidebarUtilityContainer) {
        sidebarUtilityContainer.appendChild(restartButton)
      }
      if (musicButton && musicButton.parentNode !== sidebarUtilityContainer) {
        sidebarUtilityContainer.appendChild(musicButton)
      }
    }
    moveSidebarSectionToModal(saveLoadMenu)
    moveSidebarSectionToModal(statsSection)
    if (sidebarMenuButton) {
      sidebarMenuButton.removeAttribute('aria-hidden')
      sidebarMenuButton.removeAttribute('tabindex')
      sidebarMenuButton.setAttribute('aria-expanded', mobileLayoutState.sidebarModalVisible ? 'true' : 'false')
    }
    if (sidebarModal) {
      sidebarModal.setAttribute('data-orientation', mode)
    }
    setMobileSidebarModalVisible(mobileLayoutState.sidebarModalVisible)
    const shouldCollapse = typeof mobileLayoutState.isSidebarCollapsed === 'boolean'
      ? mobileLayoutState.isSidebarCollapsed
      : true
    setSidebarCollapsed(shouldCollapse)
  } else {
    if (isCondensed) {
      applyPortraitCondensedLayout()
    } else {
      clearPortraitCondensedLayout()
    }
    if (sidebarUtilityContainer) {
      sidebarUtilityContainer.setAttribute('aria-hidden', 'true')
    }
    restoreUtilityButton(
      mobileLayoutState.restartButton,
      mobileLayoutState.restartOriginalParent,
      mobileLayoutState.restartOriginalNextSibling
    )
    restoreUtilityButton(
      mobileLayoutState.musicButton,
      mobileLayoutState.musicOriginalParent,
      mobileLayoutState.musicOriginalNextSibling
    )
    closeMobileSidebarModal()
    if (sidebarModal) {
      sidebarModal.removeAttribute('data-orientation')
    }
    restoreSidebarSection(
      mobileLayoutState.saveLoadMenu,
      mobileLayoutState.saveLoadOriginalParent,
      mobileLayoutState.saveLoadOriginalNextSibling
    )
    restoreSidebarSection(
      mobileLayoutState.statsSection,
      mobileLayoutState.statsOriginalParent,
      mobileLayoutState.statsOriginalNextSibling
    )
    if (sidebarMenuButton) {
      sidebarMenuButton.setAttribute('aria-expanded', 'false')
      sidebarMenuButton.setAttribute('aria-hidden', 'true')
      sidebarMenuButton.setAttribute('tabindex', '-1')
    }
    const shouldCollapse = isPortrait
      ? document.body.classList.contains('sidebar-collapsed')
      : false
    setSidebarCollapsed(shouldCollapse, { preservePreference: !isPortrait })
    if (mobileLayoutState.mobileStatusBar) {
      mobileLayoutState.mobileStatusBar.removeAttribute('data-orientation')
    }
  }

  ensureSidebarSwipeHandlers(isMobile)

  if (mobileControls) {
    if (isMobile) {
      mobileControls.setAttribute('aria-hidden', 'false')
      mobileControls.setAttribute('data-orientation', mode)
    } else {
      mobileControls.setAttribute('aria-hidden', 'true')
      mobileControls.removeAttribute('data-orientation')
    }
  }

  if (mobileJoystickContainer) {
    if (isLandscape) {
      mobileJoystickContainer.setAttribute('aria-hidden', 'false')
      mobileJoystickContainer.setAttribute('data-orientation', mode)
    } else {
      mobileJoystickContainer.setAttribute('aria-hidden', 'true')
      mobileJoystickContainer.removeAttribute('data-orientation')
    }
  }
}

export { mobileLayoutState }
