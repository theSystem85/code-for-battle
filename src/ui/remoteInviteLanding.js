import { createRemoteConnection, RemoteConnectionStatus, getActiveRemoteConnection } from '../network/remoteConnection.js'
import { handleReceivedCommand, setClientPartyId, resetClientState, startGameStateSync, stopGameStateSync } from '../network/gameCommandSync.js'
import { parsePartyIdFromToken } from '../network/invites.js'
import { gameState } from '../gameState.js'
import { TILE_SIZE, MAP_TILES_X, MAP_TILES_Y } from '../config.js'
import { showHostNotification } from '../network/hostNotifications.js'
import { ensureMultiplayerState, generateRandomId } from '../network/multiplayerStore.js'
import { getStoredPlayerAlias, setStoredPlayerAlias } from './sidebarMultiplayer.js'

const STATUS_MESSAGES = {
  [RemoteConnectionStatus.IDLE]: 'Awaiting alias submission.',
  [RemoteConnectionStatus.CONNECTING]: 'Connecting to host...',
  [RemoteConnectionStatus.CONNECTED]: 'Connected. Waiting for data channel...',
  [RemoteConnectionStatus.FAILED]: 'Connection failed. Try again.',
  [RemoteConnectionStatus.DISCONNECTED]: 'Disconnected from host.'
}

const DEFAULT_STATUS = 'Enter your alias to claim the invited party.'

/**
 * Show the host paused banner
 */
function formatUnresponsiveTimer(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const mins = Math.floor(safeSeconds / 60).toString().padStart(2, '0')
  const secs = (safeSeconds % 60).toString().padStart(2, '0')
  return `${mins}:${secs}`
}

/**
 * Show the host paused banner
 */
function showHostPausedBanner(unresponsiveInfo = null) {
  const banner = document.getElementById('hostPausedBanner')
  const text = banner?.querySelector('.host-paused-banner__text')
  if (banner) {
    banner.classList.remove('host-paused-banner--hidden')
    banner.setAttribute('aria-hidden', 'false')
  }

  if (text) {
    if (unresponsiveInfo?.active) {
      const timer = formatUnresponsiveTimer(unresponsiveInfo.seconds)
      const alias = unresponsiveInfo.alias || 'A player'
      text.textContent = `${alias} is reconnecting (${timer})`
    } else {
      text.textContent = 'Host has paused the game'
    }
  }

  // Set flag to block commands (but allow scrolling)
  gameState.hostPausedByRemote = true
}

/**
 * Hide the host paused banner
 */
function hideHostPausedBanner() {
  const banner = document.getElementById('hostPausedBanner')
  const text = banner?.querySelector('.host-paused-banner__text')
  if (banner) {
    banner.classList.add('host-paused-banner--hidden')
    banner.setAttribute('aria-hidden', 'true')
  }
  if (text) {
    text.textContent = 'Host has paused the game'
  }
  // Clear the flag to allow commands again
  gameState.hostPausedByRemote = false
}

/**
 * Cancel the remote invite connection and return to normal game
 * @param {HTMLElement} overlay - The invite overlay element
 */
function cancelRemoteInvite(overlay) {
  // Stop any active connection
  const connection = getActiveRemoteConnection()
  if (connection) {
    connection.stop()
  }

  // Hide the overlay
  hideOverlay(overlay)

  // Hide the host paused banner if showing
  hideHostPausedBanner()

  // Show map settings again
  showMapSettings()

  // Remove invite token from URL
  if (typeof window !== 'undefined' && window.history) {
    const url = new URL(window.location.href)
    url.searchParams.delete('invite')
    window.history.replaceState({}, '', url.toString())
  }

  window.logger('[RemoteInviteLanding] Connection cancelled by user')
}

/**
 * Hide map settings UI for remote clients since map is determined by host
 * Also disables ore spread and shadow of war checkboxes since these are host-controlled
 */
function hideMapSettingsForClient() {
  const mapSettingsContainer = document.querySelector('#mapSettingsContent')?.parentElement
  const mapSettingsToggle = document.getElementById('mapSettingsToggle')
  const mapSettingsContent = document.getElementById('mapSettingsContent')

  // Disable ore spread and shadow of war checkboxes - these settings come from host
  const oreCheckbox = document.getElementById('oreSpreadCheckbox')
  const oreSpreadIntervalInput = document.getElementById('mapOreSpreadIntervalSeconds')
  const shadowCheckbox = document.getElementById('shadowOfWarCheckbox')

  if (oreCheckbox) {
    oreCheckbox.disabled = true
    // Add visual indication that it's host-controlled
    const label = oreCheckbox.parentElement
    if (label && !label.querySelector('.host-controlled')) {
      const indicator = document.createElement('span')
      indicator.className = 'host-controlled'
      indicator.style.cssText = 'font-size: 10px; color: #888; margin-left: 5px;'
      indicator.textContent = '(host setting)'
      label.appendChild(indicator)
    }
  }

  if (oreSpreadIntervalInput) {
    oreSpreadIntervalInput.disabled = true
  }

  if (shadowCheckbox) {
    shadowCheckbox.disabled = true
    // Add visual indication that it's host-controlled
    const label = shadowCheckbox.parentElement
    if (label && !label.querySelector('.host-controlled')) {
      const indicator = document.createElement('span')
      indicator.className = 'host-controlled'
      indicator.style.cssText = 'font-size: 10px; color: #888; margin-left: 5px;'
      indicator.textContent = '(host setting)'
      label.appendChild(indicator)
    }
  }

  // Hide showEnemyResources checkbox for clients (host-only setting)
  const showEnemyResourcesLabel = document.getElementById('showEnemyResourcesLabel')
  if (showEnemyResourcesLabel) {
    showEnemyResourcesLabel.style.display = 'none'
  }

  if (mapSettingsContainer) {
    mapSettingsContainer.style.display = 'none'
  }
  if (mapSettingsToggle) {
    mapSettingsToggle.style.display = 'none'
  }
  if (mapSettingsContent) {
    mapSettingsContent.style.display = 'none'
  }

  window.logger('[RemoteInviteLanding] Map settings hidden for client, ore/shadow controls disabled')
}

/**
 * Show map settings UI (for when client disconnects)
 * Also re-enables ore spread and shadow of war checkboxes
 */
function showMapSettings() {
  const mapSettingsContainer = document.querySelector('#mapSettingsContent')?.parentElement
  const mapSettingsToggle = document.getElementById('mapSettingsToggle')

  // Re-enable ore spread and shadow of war checkboxes
  const oreCheckbox = document.getElementById('oreSpreadCheckbox')
  const oreSpreadIntervalInput = document.getElementById('mapOreSpreadIntervalSeconds')
  const shadowCheckbox = document.getElementById('shadowOfWarCheckbox')

  if (oreCheckbox) {
    oreCheckbox.disabled = false
    // Remove host-controlled indicator
    const label = oreCheckbox.parentElement
    const indicator = label?.querySelector('.host-controlled')
    if (indicator) {
      indicator.remove()
    }
  }

  if (oreSpreadIntervalInput) {
    oreSpreadIntervalInput.disabled = false
  }

  if (shadowCheckbox) {
    shadowCheckbox.disabled = false
    // Remove host-controlled indicator
    const label = shadowCheckbox.parentElement
    const indicator = label?.querySelector('.host-controlled')
    if (indicator) {
      indicator.remove()
    }
  }

  // Re-show showEnemyResources checkbox (host setting)
  const showEnemyResourcesLabel = document.getElementById('showEnemyResourcesLabel')
  if (showEnemyResourcesLabel) {
    showEnemyResourcesLabel.style.display = ''
  }

  if (mapSettingsContainer) {
    mapSettingsContainer.style.display = ''
  }
  if (mapSettingsToggle) {
    mapSettingsToggle.style.display = ''
  }

  window.logger('[RemoteInviteLanding] Map settings restored, ore/shadow controls re-enabled')
}

function getInviteTokenFromUrl() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const params = new URLSearchParams(window.location.search || '')
    const token = params.get('invite')
    return token ? token.trim() : null
  } catch (err) {
    window.logger.warn('Failed to parse invite token:', err)
    return null
  }
}

function updateStatus(element, message, isError) {
  if (!element) {
    return
  }
  element.textContent = message
  element.classList.toggle('remote-invite-status--error', !!isError)
}

function showOverlay(overlay, statusEl) {
  if (!overlay) {
    return
  }
  overlay.classList.remove('remote-invite-overlay--hidden')
  overlay.setAttribute('aria-hidden', 'false')
  updateStatus(statusEl, DEFAULT_STATUS, false)
}

function hideOverlay(overlay) {
  if (!overlay) {
    return
  }
  overlay.classList.add('remote-invite-overlay--hidden')
  overlay.setAttribute('aria-hidden', 'true')
}

/**
 * Center the camera on the party's construction yard
 * @param {string} partyId - The partyId to center on
 */
function centerCameraOnPartyBase(partyId) {
  if (!partyId) {
    return
  }

  // Find the construction yard belonging to this party
  const factory = gameState.buildings?.find(b =>
    b.type === 'constructionYard' &&
    (b.owner === partyId || b.id === partyId)
  ) || gameState.factories?.find(f =>
    f.id === partyId || f.owner === partyId
  )

  if (!factory) {
    window.logger.warn('[RemoteInviteLanding] Could not find factory for party:', partyId)
    return
  }

  // Calculate pixel position
  const factoryPixelX = factory.x * TILE_SIZE
  const factoryPixelY = factory.y * TILE_SIZE

  // Get viewport dimensions
  const gameCanvas = document.getElementById('gameCanvas')
  if (!gameCanvas) {
    return
  }

  // Use a reasonable default viewport size if canvas dimensions aren't available
  const viewportWidth = gameCanvas.clientWidth || 800
  const viewportHeight = gameCanvas.clientHeight || 600

  // Center the camera on the factory
  gameState.scrollOffset.x = Math.max(0, Math.min(
    factoryPixelX - viewportWidth / 2,
    MAP_TILES_X * TILE_SIZE - viewportWidth
  ))
  gameState.scrollOffset.y = Math.max(0, Math.min(
    factoryPixelY - viewportHeight / 2,
    MAP_TILES_Y * TILE_SIZE - viewportHeight
  ))

  window.logger('[RemoteInviteLanding] Camera centered on party base:', partyId,
    'at', factory.x, factory.y,
    'scroll:', gameState.scrollOffset.x, gameState.scrollOffset.y)
}

/**
 * Handle being kicked from the session by the host
 * Shows a modal with options to continue with AI or start a new game
 * @param {Object} payload - The kick message payload
 * @param {HTMLElement} overlay - The invite overlay element
 */
function handleKickedFromSession(payload, overlay) {
  window.logger('[RemoteInviteLanding] Kicked from session:', payload)

  // Stop the remote connection
  const connection = getActiveRemoteConnection()
  if (connection) {
    connection.stop()
  }

  // Stop game state sync
  stopGameStateSync()
  resetClientState()

  // Hide the invite overlay
  hideOverlay(overlay)

  // Hide the host paused banner if showing
  hideHostPausedBanner()

  // Show map settings again since we're now the host
  showMapSettings()

  // Pause the game while modal is open
  gameState.gamePaused = true

  // Remove invite token from URL to prevent re-join attempts
  if (typeof window !== 'undefined' && window.history) {
    const url = new URL(window.location.href)
    url.searchParams.delete('invite')
    window.history.replaceState({}, '', url.toString())
  }

  // Show the kicked modal
  showKickedModal(payload)

  window.logger('[RemoteInviteLanding] Showing kicked modal')
}

/**
 * Show the kicked modal with options to continue or start new game
 * @param {Object} payload - The kick message payload
 */
function showKickedModal(payload) {
  const modal = document.getElementById('kickedModal')
  const messageEl = document.getElementById('kickedModalMessage')
  const continueBtn = document.getElementById('kickedContinueBtn')
  const newGameBtn = document.getElementById('kickedNewGameBtn')

  if (!modal) {
    // Fallback if modal doesn't exist - just continue with AI
    convertToStandaloneHost()
    gameState.gamePaused = false
    showHostNotification(payload.reason || 'You were kicked from the session.')
    showHostNotification('You are now the host of your own game. All other parties are AI.')
    return
  }

  // Set the kick message
  if (messageEl) {
    messageEl.textContent = payload.reason || 'You were kicked from the session by the host.'
  }

  // Show modal
  modal.classList.add('kicked-modal--open')
  modal.setAttribute('aria-hidden', 'false')
  document.body.classList.add('kicked-modal-open')

  // Handle continue button
  const handleContinue = () => {
    hideKickedModal()
    convertToStandaloneHost()
    gameState.gamePaused = false
    showHostNotification('You are now the host of your own game. All other parties are AI.')
    cleanup()
  }

  // Handle new game button
  const handleNewGame = () => {
    hideKickedModal()
    // Get the game instance and reset
    const gameInstance = window.gameInstance
    if (gameInstance && typeof gameInstance.resetGame === 'function') {
      gameInstance.resetGame()
    } else {
      // Fallback: reload the page
      window.location.href = window.location.origin + window.location.pathname
    }
    cleanup()
  }

  // Cleanup function to remove event listeners
  const cleanup = () => {
    if (continueBtn) continueBtn.removeEventListener('click', handleContinue)
    if (newGameBtn) newGameBtn.removeEventListener('click', handleNewGame)
  }

  // Add event listeners
  if (continueBtn) continueBtn.addEventListener('click', handleContinue)
  if (newGameBtn) newGameBtn.addEventListener('click', handleNewGame)
}

/**
 * Hide the kicked modal
 */
function hideKickedModal() {
  const modal = document.getElementById('kickedModal')
  if (modal) {
    modal.classList.remove('kicked-modal--open')
    modal.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('kicked-modal-open')
  }
}

/**
 * Convert the client to a standalone host with all AI parties
 */
function convertToStandaloneHost() {
  // Generate new game instance ID so this is a separate game
  gameState.gameInstanceId = generateRandomId('game-instance')
  gameState.hostId = generateRandomId('host')

  // Set up multiplayer session as host
  gameState.multiplayerSession = {
    isRemote: false,
    localRole: 'host',
    status: 'idle',
    alias: null,
    inviteToken: null,
    connectedAt: null
  }

  // Make all other parties AI-controlled
  // Keep the current humanPlayer as the player's party
  const currentParty = gameState.humanPlayer
  ensureMultiplayerState()

  if (gameState.partyStates) {
    gameState.partyStates.forEach(party => {
      if (party.partyId !== currentParty) {
        party.owner = 'AI'
        party.aiActive = true
        party.lastConnectedAt = null
        party.inviteToken = null
      } else {
        party.owner = 'You (Host)'
        party.aiActive = false
      }
    })
  }

  window.logger('[RemoteInviteLanding] Converted to standalone host mode')
}

export function initRemoteInviteLanding() {
  if (typeof document === 'undefined') {
    return
  }

  const overlay = document.getElementById('remoteInviteLanding')
  const form = document.getElementById('remoteInviteForm')
  const aliasInput = document.getElementById('remoteAliasInput')
  const statusElement = document.getElementById('remoteInviteStatus')
  const tokenText = document.getElementById('remoteInviteTokenText')
  const submitButton = document.getElementById('remoteInviteSubmit')
  const cancelButton = document.getElementById('remoteInviteCancel')
  const inviteToken = getInviteTokenFromUrl()

  // Flag to track if client was kicked (to prevent showing reconnect screen)
  let wasKicked = false

  if (!overlay || !form || !aliasInput || !statusElement || !submitButton || !inviteToken) {
    if (overlay) {
      hideOverlay(overlay)
    }
    return
  }

  // Hide map settings immediately when joining as a client
  // The host determines the map settings
  hideMapSettingsForClient()

  tokenText.textContent = inviteToken
  showOverlay(overlay, statusElement)

  // Pre-fill alias from localStorage if available
  const storedAlias = getStoredPlayerAlias()
  if (storedAlias) {
    aliasInput.value = storedAlias
  } else {
    aliasInput.value = ''
  }

  // Sync alias changes to localStorage and sidebar input
  aliasInput.addEventListener('input', (e) => {
    const value = e.target.value
    setStoredPlayerAlias(value)
    // Sync to sidebar alias input if exists
    const sidebarAliasInput = document.getElementById('playerAliasInput')
    if (sidebarAliasInput) {
      sidebarAliasInput.value = value
    }
  })

  aliasInput.focus()
  submitButton.disabled = false

  const setFormDisabled = (disabled) => {
    aliasInput.disabled = disabled
    submitButton.disabled = disabled
    // Enable/disable cancel button too
    if (cancelButton) {
      cancelButton.disabled = disabled
    }
  }

  // Handle cancel button click
  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      cancelRemoteInvite(overlay)
    })
  }

  const handleStatusChange = (status) => {
    const message = STATUS_MESSAGES[status] || STATUS_MESSAGES[RemoteConnectionStatus.CONNECTING]
    const isError = status === RemoteConnectionStatus.FAILED
    updateStatus(statusElement, message, isError)

    if (status === RemoteConnectionStatus.DISCONNECTED) {
      showOverlay(overlay, statusElement)
      setFormDisabled(false)
      aliasInput.focus()
      // Reset client state on disconnect
      resetClientState()
      // Hide the host paused banner on disconnect
      hideHostPausedBanner()
    }
  }

  // Parse the partyId from the invite token
  const partyId = parsePartyIdFromToken(inviteToken)

  const handleDataChannelOpen = () => {
    hideOverlay(overlay)
    updateStatus(statusElement, 'Connected. Remote controls are live.', false)

    // Hide map settings since client uses host's map
    hideMapSettingsForClient()

    // Set the client's partyId and humanPlayer when connected
    if (partyId) {
      setClientPartyId(partyId)
      gameState.humanPlayer = partyId
      window.logger('[RemoteInviteLanding] Client party set to:', partyId)

      // Start client state sync to send updates to host
      startGameStateSync()

      // Center camera on the client's base after a short delay to allow state sync
      setTimeout(() => {
        centerCameraOnPartyBase(partyId)
      }, 500)
    }
  }

  const handleDataChannelClose = () => {
    // Don't show reconnect screen if we were kicked - game continues standalone
    if (wasKicked) {
      return
    }

    showOverlay(overlay, statusElement)
    updateStatus(statusElement, 'Connection closed. Enter your alias to retry.', true)
    setFormDisabled(false)
    aliasInput.focus()
    // Stop client state sync and reset client state on disconnect
    stopGameStateSync()
    resetClientState()
    // Restore map settings UI
    showMapSettings()
    // Hide the host paused banner on disconnect
    hideHostPausedBanner()
  }

  const handleDataChannelMessage = (rawPayload) => {
    let payload = rawPayload
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch {
        return
      }
    }

    if (!payload) {
      return
    }

    // Handle kick message from host
    if (payload.type === 'kicked') {
      wasKicked = true
      handleKickedFromSession(payload, overlay)
      return
    }

    // Handle game command synchronization messages
    if (payload.type === 'game-command') {
      handleReceivedCommand(payload, 'host')
      return
    }

    if (payload.type === 'heartbeat-ping') {
      const connection = getActiveRemoteConnection()
      if (connection) {
        connection.send({ type: 'heartbeat-pong', timestamp: Date.now() })
      }
      return
    }

    // Handle host status messages
    if (payload.type !== 'host-status') {
      return
    }
    const running = Boolean(payload.running)
    const hasUnresponsiveClient = Boolean(payload.unresponsive?.active)
    const message = hasUnresponsiveClient
      ? `${payload.unresponsive.alias || 'Player'} is reconnecting...`
      : running ? 'Host resumed the game.' : 'Host paused the game.'
    updateStatus(statusElement, message, !running || hasUnresponsiveClient)

    // Show/hide the host paused banner based on running status or unresponsive clients
    if (running && !hasUnresponsiveClient) {
      hideHostPausedBanner()
    } else {
      showHostPausedBanner(payload.unresponsive || null)
    }
  }

  form.addEventListener('submit', async(event) => {
    event.preventDefault()
    const alias = aliasInput.value.trim()
    if (!alias) {
      updateStatus(statusElement, 'Alias is required to join.', true)
      aliasInput.focus()
      return
    }

    setFormDisabled(true)
    updateStatus(statusElement, STATUS_MESSAGES[RemoteConnectionStatus.CONNECTING], false)

    try {
      const connection = createRemoteConnection({
        inviteToken,
        alias,
        onStatusChange: handleStatusChange,
        onDataChannelOpen: handleDataChannelOpen,
        onDataChannelClose: handleDataChannelClose,
        onDataChannelMessage: handleDataChannelMessage
      })
      await connection.start()
    } catch (error) {
      updateStatus(statusElement, error?.message || 'Failed to connect to host.', true)
      setFormDisabled(false)
      aliasInput.focus()
    }
  })
}
