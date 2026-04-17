import { gameState } from '../gameState.js'
import { getMapRenderer, getTextureManager } from '../rendering.js'
import { initializeOccupancyMap } from '../units.js'
import {
  activateMapEditMode,
  deactivateMapEditMode,
  describeBrush,
  getMapEditorState,
  handleWheel,
  isMapEditorLocked,
  lockMapEditor,
  unlockMapEditor,
  resetBrush,
  setBrushFromProduction,
  setTileBrushById,
  toggleRandomMode
} from '../mapEditor.js'
import { listPartyStates, observePartyOwnershipChange } from '../network/multiplayerStore.js'
import { initSpriteSheetEditor } from './spriteSheetEditor.js'

let editButton = null
let tileSelect = null
let randomCheckbox = null
let statusEl = null
let integratedSpriteSheetModeCheckbox = null
let integratedSpriteSheetBiomeSelect = null
let integratedSpriteSheetSelectionWrap = null
let integratedSpriteSheetSelectionList = null

const INTEGRATED_MODE_STORAGE_KEY = 'rts-integrated-spritesheet-mode'
const INTEGRATED_BIOME_STORAGE_KEY = 'rts-integrated-spritesheet-biome'
const INTEGRATED_SELECTION_STORAGE_KEY = 'rts-integrated-spritesheet-selected'
const SSE_APPLIED_METADATA_STORAGE_KEY = 'rts-sse-applied-metadata'
const SSE_APPLIED_ANIMATION_METADATA_STORAGE_KEY = 'rts-sse-applied-animation-metadata'
const SSE_METADATA_PREFIX = 'rts-sse-metadata:'
const SSE_SHEETS_INDEX = 'images/map/sprite_sheets/index.json'
const DEFAULT_ANIMATION_SHEET_PATH = 'images/map/animations/explosion.webp'
const DEFAULT_ANIMATION_METADATA_PATH = 'images/map/animations/explosion.json'
const RETIRED_EXPLOSION_SHEET_PATTERN = /^images\/map\/animations\/\d+x\d+_\d+x\d+_.*explosion\.(webp|png|jpg|jpeg)$/i

function isTransientAnimationSheetPath(sheetPath) {
  return typeof sheetPath === 'string' && (
    sheetPath.startsWith('blob:') ||
    sheetPath.startsWith('data:') ||
    sheetPath.startsWith('local-upload:')
  )
}

function normalizeAnimationMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null
  const sheetPath = typeof metadata.sheetPath === 'string' ? metadata.sheetPath : ''
  const normalizedSheetPath = !sheetPath || isTransientAnimationSheetPath(sheetPath) || RETIRED_EXPLOSION_SHEET_PATTERN.test(sheetPath)
    ? DEFAULT_ANIMATION_SHEET_PATH
    : sheetPath
  return {
    ...metadata,
    sheetPath: normalizedSheetPath
  }
}

function setActiveAnimationMetadata(metadata) {
  const normalized = normalizeAnimationMetadata(metadata)
  if (!normalized) return null
  gameState.activeAnimationSpriteSheetMetadata = normalized
  gameState.activeAnimationSpriteSheetPath = normalized.sheetPath || DEFAULT_ANIMATION_SHEET_PATH
  return normalized
}

async function loadDefaultAnimationMetadata() {
  try {
    const response = await fetch(DEFAULT_ANIMATION_METADATA_PATH, { cache: 'no-store' })
    if (!response.ok) return null
    const parsed = await response.json()
    return normalizeAnimationMetadata(parsed)
  } catch (err) {
    window.logger.warn('Failed to load default explosion animation metadata:', err)
    return null
  }
}

async function applyIntegratedSpriteSheetRuntime(metadata = null) {
  const textureManager = getTextureManager()
  if (!textureManager?.setIntegratedSpriteSheetConfig) return
  const runtimeSheets = await loadSelectedIntegratedRuntimeSheets()

  await textureManager.setIntegratedSpriteSheetConfig({
    enabled: Boolean(gameState.useIntegratedSpriteSheetMode),
    sheetPath: metadata?.sheetPath || gameState.activeSpriteSheetPath,
    metadata: metadata || gameState.activeSpriteSheetMetadata || null,
    sheets: runtimeSheets,
    biomeTag: gameState.activeSpriteSheetBiomeTag || 'grass'
  })

  const mapRenderer = getMapRenderer()
  if (mapRenderer) {
    mapRenderer.invalidateAllChunks()
  }

  if (Array.isArray(gameState.units) && Array.isArray(gameState.mapGrid)) {
    gameState.occupancyMap = initializeOccupancyMap(gameState.units, gameState.mapGrid, textureManager)
  }
}

function isMultiplayerConnectedSession() {
  return Boolean(gameState.multiplayerSession?.connected)
}

function safeParseJson(raw, fallback = null) {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function buildMetaPath(sheetPath) {
  return `${sheetPath || ''}`.replace(/\.(webp|png|jpg|jpeg)$/i, '.json')
}

function normalizeRuntimeMetadata(sheetPath, parsed) {
  const source = parsed && typeof parsed === 'object' ? parsed : {}
  const tiles = {}
  Object.entries(source.tiles || {}).forEach(([tileKey, tile]) => {
    if (!tile?.rect || !Array.isArray(tile.tags) || !tile.tags.length) return
    tiles[tileKey] = {
      ...tile,
      tags: tile.tags.filter(Boolean)
    }
  })
  return {
    ...source,
    schemaVersion: Number.isFinite(source.schemaVersion) ? source.schemaVersion : 1,
    sheetPath,
    blendMode: source.blendMode === 'alpha' ? 'alpha' : 'black',
    tileSize: Number.isFinite(source.tileSize) ? source.tileSize : 64,
    borderWidth: Number.isFinite(source.borderWidth) ? source.borderWidth : 1,
    tiles
  }
}

async function loadRuntimeMetadataForSheet(sheetPath, { allowLocalOverrides = true } = {}) {
  if (!sheetPath) return normalizeRuntimeMetadata(sheetPath, null)

  if (allowLocalOverrides) {
    const local = safeParseJson(localStorage.getItem(`${SSE_METADATA_PREFIX}${sheetPath}`), null)
    if (local) {
      return normalizeRuntimeMetadata(sheetPath, local)
    }
  }

  const metaPath = buildMetaPath(sheetPath)
  try {
    const response = await fetch(metaPath, { cache: 'no-store' })
    if (response.ok) {
      return normalizeRuntimeMetadata(sheetPath, await response.json())
    }
  } catch {
    // Ignore missing sidecar metadata files.
  }

  return normalizeRuntimeMetadata(sheetPath, null)
}

async function loadAvailableIntegratedSheetPaths() {
  try {
    const response = await fetch(SSE_SHEETS_INDEX, { cache: 'no-store' })
    if (response.ok) {
      const parsed = await response.json()
      const sheets = Array.isArray(parsed?.sheets) ? parsed.sheets : []
      if (sheets.length) return sheets
    }
  } catch {
    // Fall through to runtime fallback list.
  }

  const fallback = []
  if (gameState.activeSpriteSheetPath) fallback.push(gameState.activeSpriteSheetPath)
  return fallback
}

function sanitizeSheetSelection(storedValue, availableSheets, { fallbackToAll = true } = {}) {
  const normalizedAvailable = Array.isArray(availableSheets) ? availableSheets : []
  if (!normalizedAvailable.length) return []
  const parsed = Array.isArray(storedValue) ? storedValue : []
  const selected = parsed.filter(path => normalizedAvailable.includes(path))
  if (!selected.length && fallbackToAll) return [...normalizedAvailable]
  return selected
}

function persistIntegratedSheetSelection(selectedSheets) {
  try {
    localStorage.setItem(INTEGRATED_SELECTION_STORAGE_KEY, JSON.stringify(selectedSheets))
  } catch (err) {
    window.logger.warn('Failed to persist integrated sprite sheet selection:', err)
  }
}

function updateIntegratedSpriteSheetSelectionVisibility() {
  if (!integratedSpriteSheetSelectionWrap) return
  integratedSpriteSheetSelectionWrap.hidden = !gameState.useIntegratedSpriteSheetMode
}

function renderIntegratedSpriteSheetSelectionList() {
  if (!integratedSpriteSheetSelectionList) return
  integratedSpriteSheetSelectionList.innerHTML = ''
  const available = Array.isArray(gameState.integratedSpriteSheetAvailablePaths) ? gameState.integratedSpriteSheetAvailablePaths : []
  const selectedSet = new Set(Array.isArray(gameState.integratedSpriteSheetSelectedPaths) ? gameState.integratedSpriteSheetSelectedPaths : [])
  available.forEach((sheetPath) => {
    const row = document.createElement('label')
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '6px'
    row.style.marginBottom = '4px'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = selectedSet.has(sheetPath)
    checkbox.addEventListener('change', async() => {
      const nextSet = new Set(gameState.integratedSpriteSheetSelectedPaths || [])
      if (checkbox.checked) {
        nextSet.add(sheetPath)
      } else {
        nextSet.delete(sheetPath)
      }
      gameState.integratedSpriteSheetSelectedPaths = sanitizeSheetSelection([...nextSet], available, { fallbackToAll: false })
      persistIntegratedSheetSelection(gameState.integratedSpriteSheetSelectedPaths)
      await applyIntegratedSpriteSheetRuntime()
      renderIntegratedSpriteSheetSelectionList()
    })

    const label = document.createElement('span')
    label.style.fontSize = '12px'
    label.style.wordBreak = 'break-word'
    label.textContent = sheetPath.split('/').pop() || sheetPath

    row.appendChild(checkbox)
    row.appendChild(label)
    integratedSpriteSheetSelectionList.appendChild(row)
  })
}

async function initializeIntegratedSpriteSheetSelectionState() {
  gameState.integratedSpriteSheetAvailablePaths = await loadAvailableIntegratedSheetPaths()
  const stored = safeParseJson(localStorage.getItem(INTEGRATED_SELECTION_STORAGE_KEY), [])
  gameState.integratedSpriteSheetSelectedPaths = sanitizeSheetSelection(stored, gameState.integratedSpriteSheetAvailablePaths)
  persistIntegratedSheetSelection(gameState.integratedSpriteSheetSelectedPaths)
  renderIntegratedSpriteSheetSelectionList()
  updateIntegratedSpriteSheetSelectionVisibility()
}

async function loadSelectedIntegratedRuntimeSheets() {
  const available = Array.isArray(gameState.integratedSpriteSheetAvailablePaths)
    ? gameState.integratedSpriteSheetAvailablePaths
    : await loadAvailableIntegratedSheetPaths()
  const selected = sanitizeSheetSelection(gameState.integratedSpriteSheetSelectedPaths, available, { fallbackToAll: false })
  gameState.integratedSpriteSheetAvailablePaths = available
  gameState.integratedSpriteSheetSelectedPaths = selected

  const allowLocalOverrides = !isMultiplayerConnectedSession()
  const runtimeSheets = []
  for (const sheetPath of selected) {
    const metadata = await loadRuntimeMetadataForSheet(sheetPath, { allowLocalOverrides })
    const taggedTileCount = Object.values(metadata?.tiles || {}).filter(tile => Array.isArray(tile?.tags) && tile.tags.length).length
    if (!taggedTileCount) continue
    runtimeSheets.push({ sheetPath, metadata })
  }
  return runtimeSheets
}

function updatePauseIcon() {
  const pauseBtn = document.getElementById('pauseBtn')
  const playPauseIcon = pauseBtn?.querySelector('.play-pause-icon')
  if (playPauseIcon) {
    playPauseIcon.textContent = gameState.gamePaused ? '▶' : '⏸'
  }
}

function updateLockState() {
  const isHost = !gameState.multiplayerSession?.isRemote || gameState.multiplayerSession?.localRole === 'host'
  const remoteHuman = listPartyStates().some(
    (party) => !party.aiActive && party.partyId !== gameState.humanPlayer
  )
  if (!isHost) {
    lockMapEditor('host-only')
  } else if (remoteHuman) {
    lockMapEditor('human-connected')
  } else {
    unlockMapEditor()
  }
  if (isMapEditorLocked() && getMapEditorState().active) {
    endMapEditOnPlay()
  }
  if (editButton) {
    editButton.disabled = isMapEditorLocked()
    editButton.title = isMapEditorLocked()
      ? 'Only available to host before other humans join'
      : 'Toggle map edit mode'
  }
}

function syncControlsFromState() {
  const state = getMapEditorState()
  if (randomCheckbox) {
    randomCheckbox.checked = state.randomMode
  }
  const entry = state.tilePalette[state.currentTileIndex] || state.tilePalette[0]
  if (!state.pipetteEntry && tileSelect && entry) {
    tileSelect.value = entry.id
  }
  if (statusEl) {
    statusEl.textContent = describeBrush()
  }
}

function toggleEditMode() {
  const state = getMapEditorState()
  if (state.active) {
    deactivateMapEditMode()
    resetBrush()
    if (editButton) editButton.textContent = 'Edit Mode'
  } else {
    activateMapEditMode()
    if (editButton) editButton.textContent = 'Exit Edit Mode'
  }
  syncControlsFromState()
  updatePauseIcon()
}

export function initMapEditorControls() {
  editButton = document.getElementById('mapEditModeBtn')
  tileSelect = document.getElementById('mapEditTileSelect')
  randomCheckbox = document.getElementById('mapEditRandomToggle')
  statusEl = document.getElementById('mapEditStatus')
  integratedSpriteSheetModeCheckbox = document.getElementById('integratedSpriteSheetModeCheckbox')
  integratedSpriteSheetBiomeSelect = document.getElementById('integratedSpriteSheetBiomeSelect')
  integratedSpriteSheetSelectionWrap = document.getElementById('integratedSpriteSheetSelectionWrap')
  integratedSpriteSheetSelectionList = document.getElementById('integratedSpriteSheetSelectionList')

  gameState.useIntegratedSpriteSheetMode = Boolean(gameState.useIntegratedSpriteSheetMode)
  try {
    const storedMode = localStorage.getItem(INTEGRATED_MODE_STORAGE_KEY)
    if (storedMode !== null) {
      gameState.useIntegratedSpriteSheetMode = storedMode === 'true'
    }
  } catch (err) {
    window.logger.warn('Failed to load integrated sprite sheet mode:', err)
  }

  gameState.activeSpriteSheetBiomeTag = gameState.activeSpriteSheetBiomeTag || 'grass'
  try {
    const storedBiome = localStorage.getItem(INTEGRATED_BIOME_STORAGE_KEY)
    if (storedBiome && ['soil', 'sand', 'grass', 'snow'].includes(storedBiome)) {
      gameState.activeSpriteSheetBiomeTag = storedBiome
    }
  } catch (err) {
    window.logger.warn('Failed to load integrated sprite sheet biome:', err)
  }

  try {
    const storedAppliedMetadata = localStorage.getItem(SSE_APPLIED_METADATA_STORAGE_KEY)
    if (storedAppliedMetadata) {
      const parsed = JSON.parse(storedAppliedMetadata)
      if (parsed && typeof parsed === 'object') {
        gameState.activeSpriteSheetMetadata = parsed
        gameState.activeSpriteSheetPath = parsed.sheetPath || gameState.activeSpriteSheetPath || null
      }
    }
  } catch (err) {
    window.logger.warn('Failed to load applied SSE metadata from localStorage:', err)
  }

  try {
    const storedAnimationMetadata = localStorage.getItem(SSE_APPLIED_ANIMATION_METADATA_STORAGE_KEY)
    if (storedAnimationMetadata) {
      const parsed = JSON.parse(storedAnimationMetadata)
      const normalized = setActiveAnimationMetadata(parsed)
      if (normalized) {
        localStorage.setItem(SSE_APPLIED_ANIMATION_METADATA_STORAGE_KEY, JSON.stringify(normalized))
      }
    }
  } catch (err) {
    window.logger.warn('Failed to load applied SSE animation metadata from localStorage:', err)
  }

  if (!gameState.activeAnimationSpriteSheetMetadata) {
    loadDefaultAnimationMetadata().then((metadata) => {
      if (!metadata || gameState.activeAnimationSpriteSheetMetadata) return
      setActiveAnimationMetadata(metadata)
    })
  }

  if (editButton) {
    editButton.addEventListener('click', () => {
      if (isMapEditorLocked()) return
      toggleEditMode()
    })
  }

  if (tileSelect) {
    tileSelect.addEventListener('change', (e) => {
      const value = e.target.value
      setTileBrushById(value)
      syncControlsFromState()
    })
  }

  if (randomCheckbox) {
    randomCheckbox.addEventListener('change', (e) => {
      toggleRandomMode(e.target.checked)
      gameState.mapEditRandomMode = e.target.checked
      syncControlsFromState()
    })
  }

  if (integratedSpriteSheetModeCheckbox) {
    integratedSpriteSheetModeCheckbox.checked = gameState.useIntegratedSpriteSheetMode
    integratedSpriteSheetModeCheckbox.addEventListener('change', async(e) => {
      const enabled = Boolean(e.target.checked)
      gameState.useIntegratedSpriteSheetMode = enabled
      try {
        localStorage.setItem(INTEGRATED_MODE_STORAGE_KEY, enabled ? 'true' : 'false')
      } catch (err) {
        window.logger.warn('Failed to persist integrated sprite sheet mode:', err)
      }
      updateIntegratedSpriteSheetSelectionVisibility()
      await applyIntegratedSpriteSheetRuntime()
    })
  }

  if (integratedSpriteSheetBiomeSelect) {
    integratedSpriteSheetBiomeSelect.value = gameState.activeSpriteSheetBiomeTag
    integratedSpriteSheetBiomeSelect.addEventListener('change', async(e) => {
      const biome = e.target.value
      gameState.activeSpriteSheetBiomeTag = ['soil', 'sand', 'grass', 'snow'].includes(biome) ? biome : 'grass'
      try {
        localStorage.setItem(INTEGRATED_BIOME_STORAGE_KEY, gameState.activeSpriteSheetBiomeTag)
      } catch (err) {
        window.logger.warn('Failed to persist integrated sprite sheet biome:', err)
      }
      await applyIntegratedSpriteSheetRuntime()
    })
  }

  initSpriteSheetEditor({
    initialSheetPath: gameState.activeSpriteSheetPath,
    onSheetDataChange: (metadata) => {
      gameState.activeSpriteSheetPath = metadata?.sheetPath || gameState.activeSpriteSheetPath || null
      gameState.activeSpriteSheetMetadata = metadata
      if (gameState.useIntegratedSpriteSheetMode) {
        applyIntegratedSpriteSheetRuntime(metadata)
      }
    },
    onAnimationSheetDataChange: (metadata) => {
      setActiveAnimationMetadata(metadata)
    },
    onApply: async(metadata) => {
      gameState.activeSpriteSheetPath = metadata?.sheetPath || gameState.activeSpriteSheetPath || null
      gameState.activeSpriteSheetMetadata = metadata
      try {
        localStorage.setItem(SSE_APPLIED_METADATA_STORAGE_KEY, JSON.stringify(metadata))
      } catch (err) {
        window.logger.warn('Failed to persist applied SSE metadata:', err)
      }
      await applyIntegratedSpriteSheetRuntime(metadata)
    },
    onApplyAnimation: async(metadata) => {
      const normalized = setActiveAnimationMetadata(metadata)
      try {
        localStorage.setItem(SSE_APPLIED_ANIMATION_METADATA_STORAGE_KEY, JSON.stringify(normalized))
      } catch (err) {
        window.logger.warn('Failed to persist applied SSE animation metadata:', err)
      }
    }
  }).then((controller) => {
    if (gameState.useIntegratedSpriteSheetMode) {
      controller.refreshRuntimeSheetData()
    }
  }).catch((err) => {
    window.logger.warn('Failed to initialize Sprite Sheet Editor:', err)
  })

  observePartyOwnershipChange(updateLockState)
  initializeIntegratedSpriteSheetSelectionState().then(() => {
    if (gameState.useIntegratedSpriteSheetMode) {
      applyIntegratedSpriteSheetRuntime()
    }
  })
  updateLockState()
  syncControlsFromState()
  updatePauseIcon()
}

export function applyProductionBrush(kind, payload) {
  setBrushFromProduction(kind, payload)
  syncControlsFromState()
}

export function notifyMapEditorWheel(deltaY) {
  handleWheel(deltaY)
  syncControlsFromState()
}

export function endMapEditOnPlay() {
  const state = getMapEditorState()
  if (state.active) {
    deactivateMapEditMode()
    resetBrush()
    if (editButton) {
      editButton.textContent = 'Edit Mode'
    }
  }
  syncControlsFromState()
}
