import {
  listPartyStates,
  generateInviteForParty,
  getHostInviteStatus,
  setHostInviteStatus,
  observePartyOwnershipChange,
  updateHostPartyAlias,
  setHostPartyAutomationMode,
  isHost
} from '../network/multiplayerStore.js'
import { watchHostInvite, kickPlayer } from '../network/webrtcSession.js'
import { showHostNotification } from '../network/hostNotifications.js'
import { gameState } from '../gameState.js'
import { observeMultiplayerSession } from '../network/multiplayerSessionEvents.js'
import { createQRCodeCanvas } from './qrCode.js'
import { getLlmSettings } from '../ai/llmSettings.js'

const PARTY_LIST_ID = 'multiplayerPartyList'
const PLAYER_ALIAS_STORAGE_KEY = 'rts-player-alias'
const PARTY_DISPLAY_NAMES = {
  player1: 'Green',
  player2: 'Red',
  player3: 'Blue',
  player4: 'Yellow'
}

const HOST_CONTROL_BUTTONS = [
  { id: 'pauseBtn', label: 'Start/Pause' },
  { id: 'cheatMenuBtn', label: 'Cheat Console' }
]

let partyListContainer = null
let sessionObserverCleanup = null
let partyOwnershipCleanup = null
let reconnectTimerHandle = null
let lastDefeatedPlayersSignature = ''
let llmModelPoolListenerBound = false

/**
 * Get the stored player alias from localStorage
 * @returns {string} The stored alias or empty string
 */
export function getStoredPlayerAlias() {
  try {
    return localStorage.getItem(PLAYER_ALIAS_STORAGE_KEY) || ''
  } catch (e) {
    window.logger.warn('Failed to read player alias from localStorage:', e)
    return ''
  }
}

/**
 * Save the player alias to localStorage
 * @param {string} alias - The alias to save
 */
export function setStoredPlayerAlias(alias) {
  try {
    if (alias && alias.trim()) {
      localStorage.setItem(PLAYER_ALIAS_STORAGE_KEY, alias.trim())
    } else {
      localStorage.removeItem(PLAYER_ALIAS_STORAGE_KEY)
    }
  } catch (e) {
    window.logger.warn('Failed to save player alias to localStorage:', e)
  }
}

/**
 * Setup alias input synchronization
 */
function setupAliasInput() {
  const aliasInput = document.getElementById('playerAliasInput')
  const remoteAliasInput = document.getElementById('remoteAliasInput')

  if (!aliasInput) {
    return
  }

  // Load stored alias on init
  const storedAlias = getStoredPlayerAlias()
  if (storedAlias) {
    aliasInput.value = storedAlias
  }

  // Ensure the host alias is reflected in multiplayer party state immediately on load
  updateHostPartyAlias(aliasInput.value)

  // Save on change and sync to remote input
  aliasInput.addEventListener('input', (e) => {
    const value = e.target.value
    setStoredPlayerAlias(value)
    updateHostPartyAlias(value)

    // Sync to remote join modal input if exists
    if (remoteAliasInput) {
      remoteAliasInput.value = value
    }
  })

  // Also save on blur
  aliasInput.addEventListener('blur', (e) => {
    const value = e.target.value
    setStoredPlayerAlias(value)
    updateHostPartyAlias(value)
  })
}

/**
 * Extract invite token from a URL or raw token string
 * @param {string} input - URL or token string
 * @returns {string|null} The extracted token or null if invalid
 */
function extractInviteToken(input) {
  if (!input || typeof input !== 'string') {
    return null
  }

  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  // Try to parse as URL first
  try {
    const url = new URL(trimmed)
    const token = url.searchParams.get('invite')
    if (token && token.trim()) {
      return token.trim()
    }
  } catch {
    // Not a valid URL, check if it's a raw token
  }

  // Check if it looks like a URL with invite param but missing protocol
  if (trimmed.includes('?invite=') || trimmed.includes('&invite=')) {
    try {
      // Add protocol and try again
      const url = new URL('https://' + trimmed)
      const token = url.searchParams.get('invite')
      if (token && token.trim()) {
        return token.trim()
      }
    } catch {
      // Still not valid
    }
  }

  // Check if it's just the raw token (alphanumeric with dashes/underscores)
  // Invite tokens are typically in format: partyId-timestamp-random
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed) && trimmed.length > 10) {
    return trimmed
  }

  return null
}

/**
 * Setup the join via invite link input
 */
function setupJoinInviteLinkInput() {
  const input = document.getElementById('inviteLinkInput')
  const button = document.getElementById('joinInviteLinkBtn')
  const status = document.getElementById('joinInviteLinkStatus')

  if (!input || !button) {
    return
  }

  const showStatus = (message, isError = false, isSuccess = false) => {
    if (status) {
      status.textContent = message
      status.classList.toggle('error', isError)
      status.classList.toggle('success', isSuccess)
    }
  }

  const clearStatus = () => {
    if (status) {
      status.textContent = ''
      status.classList.remove('error', 'success')
    }
  }

  const handleJoin = () => {
    const inputValue = input.value
    const token = extractInviteToken(inputValue)

    if (!token) {
      showStatus('Invalid invite link or token', true)
      return
    }

    // Clear the input
    input.value = ''
    clearStatus()

    // Navigate to the URL with the invite token
    // This will trigger the remoteInviteLanding flow
    const baseUrl = window.location.origin + window.location.pathname
    const inviteUrl = `${baseUrl}?invite=${encodeURIComponent(token)}`

    showStatus('Connecting...', false, false)

    // Use location.href to navigate (this will reload the page with the invite token)
    window.location.href = inviteUrl
  }

  // Handle button click
  button.addEventListener('click', handleJoin)

  // Handle Enter key in input
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleJoin()
    }
  })

  // Clear status when user starts typing
  input.addEventListener('input', () => {
    clearStatus()
  })
}

// QR Scanner state
let qrScannerModal = null
let qrScannerStream = null
let qrScannerAnimationId = null

/**
 * Check if the BarcodeDetector API supports QR codes
 * @returns {Promise<boolean>}
 */
async function isQrScannerSupported() {
  if (!('BarcodeDetector' in window)) {
    return false
  }

  try {
    const formats = await BarcodeDetector.getSupportedFormats()
    return formats.includes('qr_code')
  } catch {
    return false
  }
}

/**
 * Get or create the QR scanner modal element
 * @returns {HTMLElement}
 */
function getOrCreateQrScannerModal() {
  if (qrScannerModal && document.body.contains(qrScannerModal)) {
    return qrScannerModal
  }

  qrScannerModal = document.createElement('div')
  qrScannerModal.className = 'qr-scanner-modal'
  qrScannerModal.setAttribute('aria-hidden', 'true')
  qrScannerModal.setAttribute('role', 'dialog')
  qrScannerModal.setAttribute('aria-modal', 'true')
  qrScannerModal.setAttribute('aria-labelledby', 'qr-scanner-title')

  qrScannerModal.innerHTML = `
    <div class="qr-scanner-modal__backdrop"></div>
    <div class="qr-scanner-modal__dialog">
      <div class="qr-scanner-modal__header">
        <h3 id="qr-scanner-title" class="qr-scanner-modal__title">Scan QR Code</h3>
        <button type="button" class="qr-scanner-modal__close" aria-label="Close">&times;</button>
      </div>
      <div class="qr-scanner-modal__body">
        <div class="qr-scanner-modal__video-container">
          <video class="qr-scanner-modal__video" autoplay playsinline muted></video>
          <div class="qr-scanner-modal__overlay">
            <div class="qr-scanner-modal__frame"></div>
          </div>
        </div>
        <p class="qr-scanner-modal__status">Point your camera at a QR code</p>
      </div>
    </div>
  `

  // Add event listeners
  const backdrop = qrScannerModal.querySelector('.qr-scanner-modal__backdrop')
  const closeBtn = qrScannerModal.querySelector('.qr-scanner-modal__close')

  backdrop.addEventListener('click', stopQrScanner)
  closeBtn.addEventListener('click', stopQrScanner)

  // Close on Escape key
  qrScannerModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      stopQrScanner()
    }
  })

  document.body.appendChild(qrScannerModal)
  return qrScannerModal
}

/**
 * Update the QR scanner status message
 * @param {string} message
 * @param {boolean} isError
 * @param {boolean} isSuccess
 */
function updateQrScannerStatus(message, isError = false, isSuccess = false) {
  const modal = getOrCreateQrScannerModal()
  const status = modal.querySelector('.qr-scanner-modal__status')
  if (status) {
    status.textContent = message
    status.classList.toggle('error', isError)
    status.classList.toggle('success', isSuccess)
  }
}

/**
 * Start the QR scanner
 */
async function startQrScanner() {
  const modal = getOrCreateQrScannerModal()
  const video = modal.querySelector('.qr-scanner-modal__video')

  // Show modal
  modal.classList.add('visible')
  modal.setAttribute('aria-hidden', 'false')

  // Focus close button for accessibility
  const closeBtn = modal.querySelector('.qr-scanner-modal__close')
  closeBtn.focus()

  updateQrScannerStatus('Requesting camera access...')

  try {
    // Request camera access
    qrScannerStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment', // Prefer back camera on mobile
        width: { ideal: 640 },
        height: { ideal: 640 }
      }
    })

    video.srcObject = qrScannerStream
    await video.play()

    updateQrScannerStatus('Point your camera at a QR code')

    // Create barcode detector
    const barcodeDetector = new BarcodeDetector({
      formats: ['qr_code']
    })

    // Start scanning loop
    const scanFrame = async() => {
      if (!qrScannerStream || video.readyState !== video.HAVE_ENOUGH_DATA) {
        qrScannerAnimationId = requestAnimationFrame(scanFrame)
        return
      }

      try {
        const barcodes = await barcodeDetector.detect(video)

        if (barcodes.length > 0) {
          const qrValue = barcodes[0].rawValue
          const token = extractInviteToken(qrValue)

          if (token) {
            updateQrScannerStatus('QR code detected! Connecting...', false, true)

            // Stop scanner and navigate
            stopQrScanner()

            // Navigate to the invite URL
            const baseUrl = window.location.origin + window.location.pathname
            const inviteUrl = `${baseUrl}?invite=${encodeURIComponent(token)}`
            window.location.href = inviteUrl
            return
          }
        }
      } catch (err) {
        // Detection failed, continue scanning
        window.logger.warn('QR detection error:', err)
      }

      qrScannerAnimationId = requestAnimationFrame(scanFrame)
    }

    qrScannerAnimationId = requestAnimationFrame(scanFrame)

  } catch (err) {
    window.logger.warn('Camera access failed:', err)

    if (err.name === 'NotAllowedError') {
      updateQrScannerStatus('Camera access denied. Please allow camera access.', true)
    } else if (err.name === 'NotFoundError') {
      updateQrScannerStatus('No camera found on this device.', true)
    } else {
      updateQrScannerStatus('Failed to access camera. Try again.', true)
    }
  }
}

/**
 * Stop the QR scanner and clean up
 */
function stopQrScanner() {
  // Stop animation loop
  if (qrScannerAnimationId) {
    cancelAnimationFrame(qrScannerAnimationId)
    qrScannerAnimationId = null
  }

  // Stop camera stream
  if (qrScannerStream) {
    qrScannerStream.getTracks().forEach(track => track.stop())
    qrScannerStream = null
  }

  // Hide modal
  if (qrScannerModal) {
    const video = qrScannerModal.querySelector('.qr-scanner-modal__video')
    if (video) {
      video.srcObject = null
    }
    qrScannerModal.classList.remove('visible')
    qrScannerModal.setAttribute('aria-hidden', 'true')
  }
}

/**
 * Setup the QR scanner button
 */
async function setupQrScanner() {
  const scanBtn = document.getElementById('scanQrBtn')

  if (!scanBtn) {
    return
  }

  // Check if QR scanning is supported
  const supported = await isQrScannerSupported()

  if (!supported) {
    // Hide button if not supported
    scanBtn.style.display = 'none'
    return
  }

  // Handle button click
  scanBtn.addEventListener('click', async() => {
    await startQrScanner()
  })
}

export function initSidebarMultiplayer() {
  partyListContainer = document.getElementById(PARTY_LIST_ID)
  lastDefeatedPlayersSignature = getDefeatedPlayersSignature()
  refreshSidebarMultiplayer()
  setupHostControlWatcher()
  setupPartyOwnershipWatcher()
  setupAliasInput()
  setupJoinInviteLinkInput()
  setupQrScanner()
  if (!llmModelPoolListenerBound && typeof document !== 'undefined') {
    document.addEventListener('llmModelPoolChanged', () => {
      refreshSidebarMultiplayer()
    })
    llmModelPoolListenerBound = true
  }
  // Note: Host polling is started only when user clicks "Invite" button (handleInviteClick)
  // This prevents unnecessary polling before a user actively shares an invite link

  if (!reconnectTimerHandle) {
    reconnectTimerHandle = setInterval(() => {
      const hasUnresponsive = listPartyStates().some(party => party.unresponsiveSince)
      const defeatedPlayersSignature = getDefeatedPlayersSignature()
      const defeatedPlayersChanged = defeatedPlayersSignature !== lastDefeatedPlayersSignature

      if (hasUnresponsive || defeatedPlayersChanged) {
        lastDefeatedPlayersSignature = defeatedPlayersSignature
        refreshSidebarMultiplayer()
      }
    }, 1000)
  }
}

function getDefeatedPlayersSignature() {
  if (!gameState.defeatedPlayers) {
    return ''
  }

  const defeatedPlayers = gameState.defeatedPlayers instanceof Set
    ? Array.from(gameState.defeatedPlayers)
    : Array.isArray(gameState.defeatedPlayers)
      ? gameState.defeatedPlayers
      : []

  return defeatedPlayers.slice().sort().join('|')
}

export function refreshSidebarMultiplayer() {
  if (!partyListContainer) {
    return
  }

  partyListContainer.innerHTML = ''
  const partyStates = listPartyStates()
  partyStates.forEach((partyState) => {
    partyListContainer.appendChild(createPartyRow(partyState))
  })
}

function setupPartyOwnershipWatcher() {
  if (partyOwnershipCleanup) {
    partyOwnershipCleanup()
  }
  partyOwnershipCleanup = observePartyOwnershipChange(() => {
    // Refresh the entire party list when any party ownership changes
    refreshSidebarMultiplayer()
  })
}

function setupHostControlWatcher() {
  if (sessionObserverCleanup) {
    sessionObserverCleanup()
  }
  updateHostControlAccessibility(gameState.multiplayerSession)
  sessionObserverCleanup = observeMultiplayerSession((event) => {
    updateHostControlAccessibility(event?.detail)
  })
}

function isLocalClientSession(session = {}) {
  return Boolean(session.isRemote && session.localRole === 'client')
}

function updateHostControlAccessibility(session) {
  HOST_CONTROL_BUTTONS.forEach(({ id, label }) => {
    const button = document.getElementById(id)
    if (!button) {
      return
    }

    if (!button.dataset.originalTitle) {
      button.dataset.originalTitle = button.title || ''
    }

    if (isLocalClientSession(session)) {
      button.disabled = true
      button.classList.add('multiplayer-locked')
      const fallbackTitle = button.dataset.originalTitle || label
      button.title = `${fallbackTitle || label} (host only)`
      button.setAttribute('aria-label', `${label} (host only)`)
      button.dataset.remoteLocked = 'true'
      if (!button.dataset.originalDisplay) {
        button.dataset.originalDisplay = button.style.display || ''
      }
      button.style.display = 'none'
    } else {
      button.disabled = false
      button.classList.remove('multiplayer-locked')
      button.title = button.dataset.originalTitle || label
      button.removeAttribute('aria-label')
      delete button.dataset.remoteLocked
      if (button.dataset.originalDisplay !== undefined) {
        button.style.display = button.dataset.originalDisplay
        delete button.dataset.originalDisplay
      } else {
        button.style.display = ''
      }
    }
  })
}

function getLocalPartyId() {
  return gameState.humanPlayer === 'player' ? 'player1' : gameState.humanPlayer
}

function createPartyRow(partyState) {
  const row = document.createElement('div')
  row.className = 'multiplayer-party-row'
  row.dataset.testid = `multiplayer-party-row-${partyState.partyId}`

  const info = document.createElement('div')
  info.className = 'multiplayer-party-info'

  const dot = document.createElement('span')
  dot.className = 'multiplayer-party-dot'
  dot.style.backgroundColor = partyState.color || '#999'
  dot.title = getPartyDisplayName(partyState.partyId, partyState.color)
  info.appendChild(dot)

  const label = document.createElement('span')
  label.className = 'multiplayer-party-label'
  label.textContent = partyState.owner
  label.dataset.testid = `multiplayer-party-label-${partyState.partyId}`
  info.appendChild(label)

  const controls = document.createElement('div')
  controls.className = 'multiplayer-party-controls'

  const status = document.createElement('span')
  status.className = 'multiplayer-party-status'
  status.setAttribute('aria-live', 'polite')
  status.dataset.testid = `multiplayer-party-status-${partyState.partyId}`

  const localPartyId = getLocalPartyId()
  const isLocalHostParty = partyState.partyId === localPartyId
  const isHumanConnected = !partyState.aiActive && !isLocalHostParty
  const canManageLocalHostParty = isLocalHostParty && isHost()

  if (isHumanConnected) {
    // Human player is connected - show empty status and kick button
    status.textContent = ''
    controls.appendChild(status)

    const kickButton = document.createElement('button')
    kickButton.type = 'button'
    kickButton.className = 'multiplayer-invite-button multiplayer-kick-button'
    kickButton.textContent = 'Kick'
    kickButton.dataset.testid = `multiplayer-kick-${partyState.partyId}`
    kickButton.addEventListener('click', () => handleKickClick(partyState, kickButton))
    controls.appendChild(kickButton)
  } else {
    updateStatusText(status, partyState)
    controls.appendChild(status)

    if (canManageLocalHostParty) {
      controls.appendChild(createPartyControlSelect(partyState, { includeManual: true }))
    } else {
      const isAiParty = partyState.aiActive !== false && partyState.partyId !== localPartyId
      if (isAiParty) {
        controls.appendChild(createPartyControlSelect(partyState, { includeManual: false }))
      }
    }

    if (!isLocalHostParty) {
      const inviteButton = document.createElement('button')
      inviteButton.type = 'button'
      inviteButton.className = 'multiplayer-invite-button'
      inviteButton.dataset.testid = `multiplayer-invite-${partyState.partyId}`
      updateInviteButtonState(inviteButton, partyState)
      inviteButton.addEventListener('click', () => handleInviteClick(partyState, inviteButton, status))

      controls.appendChild(inviteButton)
    }
  }

  row.append(info, controls)
  return row
}


function formatModelNameForUi(providerId, model) {
  if (providerId === 'inceptionlabs' && model === 'mercury-2') return 'Mercury 2'
  return model
}

function getAvailableLlmModels() {
  const settings = getLlmSettings()
  const fallbackTick = settings.strategic?.tickSeconds || 60
  const pool = Array.isArray(settings.strategicModelPool) ? settings.strategicModelPool : []
  return pool
    .filter(entry => entry?.provider && entry?.model)
    .map(entry => ({
      key: entry.key,
      label: `${formatModelNameForUi(entry.provider, entry.model)} (${entry.tickSeconds || fallbackTick}s)`
    }))
}

function createPartyControlSelect(partyState, { includeManual = false } = {}) {
  const select = document.createElement('select')
  select.className = 'multiplayer-llm-toggle'
  select.dataset.testid = `multiplayer-llm-select-${partyState.partyId}`

  if (includeManual) {
    const manualOption = document.createElement('option')
    manualOption.value = 'manual'
    manualOption.textContent = 'Take Over'
    select.appendChild(manualOption)
  }

  const localOption = document.createElement('option')
  localOption.value = 'local'
  localOption.textContent = '⚙️ Local AI'
  select.appendChild(localOption)

  const llmModels = getAvailableLlmModels()
  llmModels.forEach(model => {
    const option = document.createElement('option')
    option.value = model.key
    option.textContent = `🤖 ${model.label}`
    select.appendChild(option)
  })

  const selected = includeManual && partyState.aiActive === false
    ? 'manual'
    : (partyState.llmControlled === false ? 'local' : (partyState.llmModelKey || 'local'))
  select.value = Array.from(select.options).some(opt => opt.value === selected) ? selected : 'local'

  select.addEventListener('change', () => {
    const ps = gameState.partyStates?.find(p => p.partyId === partyState.partyId)
    if (!ps) return

    if (includeManual && select.value === 'manual') {
      setHostPartyAutomationMode('manual')
      return
    }

    if (includeManual && select.value === 'local') {
      setHostPartyAutomationMode('local')
      return
    }

    if (includeManual) {
      setHostPartyAutomationMode('llm', select.value)
      return
    }

    if (select.value === 'local') {
      ps.llmControlled = false
      ps.llmModelKey = null
    } else {
      ps.llmControlled = true
      ps.llmModelKey = select.value
    }
  })

  return select
}

function getPartyDisplayName(partyId, color) {
  return PARTY_DISPLAY_NAMES[partyId] || color || 'Party'
}

function formatStatusText(statusKey, partyState) {
  const isDefeated = (gameState.defeatedPlayers instanceof Set && gameState.defeatedPlayers.has(partyState.partyId))
    || (Array.isArray(gameState.defeatedPlayers) && gameState.defeatedPlayers.includes(partyState.partyId))
  if (isDefeated) {
    return ''
  }

  if (partyState.unresponsiveSince) {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - partyState.unresponsiveSince) / 1000))
    const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')
    const seconds = (elapsedSeconds % 60).toString().padStart(2, '0')
    return `Reconnecting ${minutes}:${seconds}`
  }

  switch (statusKey) {
    case 'error':
      return 'Invite failed'
    default: {
      return partyState.aiActive ? '' : 'Available'
    }
  }
}

function updateStatusText(element, partyState) {
  const currentStatus = getHostInviteStatus(partyState.partyId)
  const isDefeated = (gameState.defeatedPlayers instanceof Set && gameState.defeatedPlayers.has(partyState.partyId))
    || (Array.isArray(gameState.defeatedPlayers) && gameState.defeatedPlayers.includes(partyState.partyId))
  element.textContent = formatStatusText(currentStatus, partyState)
  element.classList.toggle('defeated', isDefeated)
  element.dataset.status = currentStatus
}

function formatInviteButtonText(statusKey, partyState) {
  const isDefeated = (gameState.defeatedPlayers instanceof Set && gameState.defeatedPlayers.has(partyState.partyId))
    || (Array.isArray(gameState.defeatedPlayers) && gameState.defeatedPlayers.includes(partyState.partyId))
  if (isDefeated) return 'Defeated'
  if (statusKey === 'generating') return 'Generating…'
  if (statusKey === 'copied') return 'Copied!'
  return 'Invite'
}

function updateInviteButtonState(button, partyState) {
  if (!button) return
  const currentStatus = getHostInviteStatus(partyState.partyId)
  button.textContent = formatInviteButtonText(currentStatus, partyState)
  const isDefeated = (gameState.defeatedPlayers instanceof Set && gameState.defeatedPlayers.has(partyState.partyId))
    || (Array.isArray(gameState.defeatedPlayers) && gameState.defeatedPlayers.includes(partyState.partyId))
  button.disabled = isDefeated || currentStatus === 'generating'
}

async function handleInviteClick(partyState, button, status) {
  // If invite already exists, show the QR modal immediately
  if (partyState.inviteToken) {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
    const inviteUrl = `${baseUrl}?invite=${partyState.inviteToken}`
    await tryCopyToClipboard(inviteUrl)
    showHostNotification('Invite link copied to clipboard')
    showQRCodeModal(partyState, inviteUrl)
    return
  }

  button.disabled = true
  button.textContent = 'Generating…'
  status.classList.remove('success')
  setHostInviteStatus(partyState.partyId, 'generating')
  updateStatusText(status, partyState)

  try {
    const { url } = await generateInviteForParty(partyState.partyId)
    watchHostInvite({ partyId: partyState.partyId, inviteToken: partyState.inviteToken })
    status.classList.add('success')
    await tryCopyToClipboard(url)
    showHostNotification('Invite link copied to clipboard')
    button.title = url
    setHostInviteStatus(partyState.partyId, 'copied')
    updateStatusText(status, partyState)
    updateInviteButtonState(button, partyState)
    // Show QR code modal after generating invite
    showQRCodeModal(partyState, url)
  } catch (error) {
    setHostInviteStatus(partyState.partyId, 'error')
    status.classList.remove('success')
    updateStatusText(status, partyState)
    showHostNotification(`Invite creation failed: ${error?.message || 'unknown error'}`)
  } finally {
    updateInviteButtonState(button, partyState)
    setTimeout(() => {
      setHostInviteStatus(partyState.partyId, 'idle')
      updateStatusText(status, partyState)
      updateInviteButtonState(button, partyState)
      status.classList.remove('success')
    }, 2500)
  }
}

function handleKickClick(partyState, button) {
  button.disabled = true
  button.textContent = 'Kicking…'

  // kickPlayer is now async
  kickPlayer(partyState.partyId).then(success => {
    if (!success) {
      showHostNotification(`Failed to kick player from ${partyState.partyId}`)
      button.disabled = false
      button.textContent = 'Kick'
    }
    // If successful, the ownership change event will refresh the sidebar
  }).catch(err => {
    window.logger.warn('Kick failed:', err)
    showHostNotification(`Failed to kick player from ${partyState.partyId}`)
    button.disabled = false
    button.textContent = 'Kick'
  })
}

async function tryCopyToClipboard(text) {
  if (navigator?.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      window.logger.warn('Clipboard write failed:', err)
    }
  }
  return false
}

// Store reference to QR modal element
let qrModal = null

/**
 * Get or create the QR code modal element
 * @returns {HTMLElement} The modal element
 */
function getOrCreateQRModal() {
  if (qrModal && document.body.contains(qrModal)) {
    return qrModal
  }

  // Create modal structure
  qrModal = document.createElement('div')
  qrModal.className = 'multiplayer-qr-modal'
  qrModal.setAttribute('aria-hidden', 'true')
  qrModal.setAttribute('role', 'dialog')
  qrModal.setAttribute('aria-modal', 'true')
  qrModal.setAttribute('aria-labelledby', 'qr-modal-title')

  qrModal.innerHTML = `
    <div class="multiplayer-qr-modal__backdrop"></div>
    <div class="multiplayer-qr-modal__dialog">
      <div class="multiplayer-qr-modal__header">
        <h3 id="qr-modal-title" class="multiplayer-qr-modal__title">Invite Player</h3>
        <button type="button" class="multiplayer-qr-modal__close" aria-label="Close">&times;</button>
      </div>
      <div class="multiplayer-qr-modal__body">
        <div class="multiplayer-qr-modal__qr-container"></div>
        <p class="multiplayer-qr-modal__instruction">Scan QR code or share the link below</p>
        <div class="multiplayer-qr-modal__link-container">
          <input type="text" class="multiplayer-qr-modal__link-input" readonly>
          <button type="button" class="multiplayer-qr-modal__copy-btn">Copy</button>
        </div>
      </div>
    </div>
  `

  // Add event listeners
  const backdrop = qrModal.querySelector('.multiplayer-qr-modal__backdrop')
  const closeBtn = qrModal.querySelector('.multiplayer-qr-modal__close')
  const copyBtn = qrModal.querySelector('.multiplayer-qr-modal__copy-btn')
  const linkInput = qrModal.querySelector('.multiplayer-qr-modal__link-input')

  backdrop.addEventListener('click', hideQRCodeModal)
  closeBtn.addEventListener('click', hideQRCodeModal)
  copyBtn.addEventListener('click', async() => {
    const success = await tryCopyToClipboard(linkInput.value)
    if (success) {
      copyBtn.textContent = 'Copied!'
      setTimeout(() => {
        copyBtn.textContent = 'Copy'
      }, 2000)
    }
  })

  // Close on Escape key
  qrModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideQRCodeModal()
    }
  })

  document.body.appendChild(qrModal)
  return qrModal
}

/**
 * Show QR code modal for a party's invite link
 * @param {Object} partyState - The party state object
 * @param {string} inviteUrl - The invite URL to display
 */
function showQRCodeModal(partyState, inviteUrl) {
  const modal = getOrCreateQRModal()

  // Update modal content
  const title = modal.querySelector('.multiplayer-qr-modal__title')
  const qrContainer = modal.querySelector('.multiplayer-qr-modal__qr-container')
  const linkInput = modal.querySelector('.multiplayer-qr-modal__link-input')
  const copyBtn = modal.querySelector('.multiplayer-qr-modal__copy-btn')

  // Set title with party color
  const partyName = getPartyDisplayName(partyState.partyId, partyState.color)
  title.textContent = `Invite to ${partyName}`

  // Clear and regenerate QR code
  qrContainer.innerHTML = ''
  try {
    const qrCanvas = createQRCodeCanvas(inviteUrl, 180)
    qrCanvas.className = 'multiplayer-qr-modal__qr-canvas'
    qrContainer.appendChild(qrCanvas)
  } catch (err) {
    window.logger.warn('Failed to generate QR code:', err)
    qrContainer.innerHTML = '<p class="multiplayer-qr-modal__error">Failed to generate QR code</p>'
  }

  // Set link input value
  linkInput.value = inviteUrl
  copyBtn.textContent = 'Copy'

  // Show modal
  modal.classList.add('visible')
  modal.setAttribute('aria-hidden', 'false')

  // Focus close button for accessibility
  const closeBtn = modal.querySelector('.multiplayer-qr-modal__close')
  closeBtn.focus()
}

/**
 * Hide QR code modal
 */
function hideQRCodeModal() {
  if (qrModal) {
    qrModal.classList.remove('visible')
    qrModal.setAttribute('aria-hidden', 'true')
  }
}
