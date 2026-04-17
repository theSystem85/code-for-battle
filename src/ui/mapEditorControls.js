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
import { observeMultiplayerSession } from '../network/multiplayerSessionEvents.js'
import { initSpriteSheetEditor } from './spriteSheetEditor.js'
import { normalizeSpriteSheetBlendMode } from '../rendering/spriteSheetAnimation.js'

let editButton = null
let tileSelect = null
let randomCheckbox = null
let statusEl = null
let integratedSpriteSheetModeCheckbox = null
let integratedSpriteSheetBiomeSelect = null
let integratedSpriteSheetListWrap = null
let integratedSpriteSheetList = null

const INTEGRATED_MODE_STORAGE_KEY = 'rts-integrated-spritesheet-mode'
const INTEGRATED_BIOME_STORAGE_KEY = 'rts-integrated-spritesheet-biome'
const INTEGRATED_SELECTED_SHEETS_STORAGE_KEY = 'rts-integrated-spritesheet-selected'
const SSE_SHEETS_INDEX = 'images/map/sprite_sheets/index.json'
const SSE_METADATA_PREFIX = 'rts-sse-metadata:'
const SSE_APPLIED_METADATA_STORAGE_KEY = 'rts-sse-applied-metadata'
const SSE_APPLIED_ANIMATION_METADATA_STORAGE_KEY = 'rts-sse-applied-animation-metadata'
const DEFAULT_ANIMATION_SHEET_PATH = 'images/map/animations/explosion.webp'
const DEFAULT_ANIMATION_METADATA_PATH = 'images/map/animations/explosion.json'
const RETIRED_EXPLOSION_SHEET_PATTERN = /^images\/map\/animations\/\d+x\d+_\d+x\d+_.*explosion\.(webp|png|jpg|jpeg)$/i
const DEFAULT_SSE_TAGS = [
  'passable',
  'decorative',
  'impassable',
  'intersection',
  'grass',
  'soil',
  'snow',
  'sand',
  'rocks',
  'concrete',
  'street',
  'water'
]

function safeParseJson(raw, fallback = null) {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function normalizeSheetMetadata(raw, sheetPath) {
  const tags = Array.isArray(raw?.tags)
    ? Array.from(new Set([...raw.tags.filter(Boolean), ...DEFAULT_SSE_TAGS]))
    : [...DEFAULT_SSE_TAGS]
  const tiles = raw?.tiles && typeof raw.tiles === 'object' ? raw.tiles : {}
  const normalizedTiles = {}
  Object.entries(tiles).forEach(([tileKey, tile]) => {
    if (!tile?.rect || !Array.isArray(tile?.tags)) return
    const normalizedTags = tile.tags.filter(Boolean)
    if (!normalizedTags.length) return
    normalizedTiles[tileKey] = {
      ...tile,
      tags: normalizedTags
    }
  })
  return {
    ...raw,
    sheetPath,
    blendMode: normalizeSpriteSheetBlendMode(raw?.blendMode),
    tags,
    tiles: normalizedTiles
  }
}

function buildSidecarPath(sheetPath) {
  return sheetPath.replace(/\.(webp|png|jpg|jpeg)$/i, '.json')
}

function getDefaultSheetName(sheetPath) {
  return sheetPath?.split('/').pop() || sheetPath
}

async function fetchIndexedSpriteSheetPaths() {
  try {
    const response = await fetch(SSE_SHEETS_INDEX, { cache: 'no-store' })
    if (!response.ok) return []
    const parsed = await response.json()
    return Array.isArray(parsed?.sheets) ? parsed.sheets.filter(Boolean) : []
  } catch {
    return []
  }
}

async function loadSpriteSheetMetadata(sheetPath, { allowLocalOverride = true } = {}) {
  if (!sheetPath) return null
  if (allowLocalOverride) {
    const local = safeParseJson(localStorage.getItem(`${SSE_METADATA_PREFIX}${sheetPath}`), null)
    if (local) {
      return normalizeSheetMetadata(local, sheetPath)
    }
  }
  try {
    const response = await fetch(buildSidecarPath(sheetPath), { cache: 'no-store' })
    if (!response.ok) return null
    const parsed = await response.json()
    return normalizeSheetMetadata(parsed, sheetPath)
  } catch {
    return null
  }
}

async function resolveIntegratedSpriteSheetConfigs() {
  const indexedSheets = await fetchIndexedSpriteSheetPaths()
  if (!indexedSheets.length) {
    return []
  }
  const multiplayerDefaultsOnly = Boolean(gameState.multiplayerSession?.isRemote)
  const selectedSheets = Array.isArray(gameState.selectedIntegratedSpriteSheets) && gameState.selectedIntegratedSpriteSheets.length
    ? new Set(gameState.selectedIntegratedSpriteSheets)
    : new Set(indexedSheets)
  const sheetPathsToUse = indexedSheets.filter(path => selectedSheets.has(path))
  const metadataEntries = await Promise.all(sheetPathsToUse.map(async(sheetPath) => {
    const metadata = await loadSpriteSheetMetadata(sheetPath, {
      allowLocalOverride: !multiplayerDefaultsOnly
    })
    if (!metadata) return null
    const hasTaggedTiles = Object.values(metadata.tiles || {}).some(tile => Array.isArray(tile?.tags) && tile.tags.length)
    if (!hasTaggedTiles) return null
    return {
      sheetPath,
      metadata
    }
  }))
  return metadataEntries.filter(Boolean)
}

function setIntegratedSpriteSheetSelection(selection, availableSheets = null, { fallbackToAll = false } = {}) {
  const normalizedAvailableSheets = Array.isArray(availableSheets) && availableSheets.length
    ? availableSheets
    : gameState.availableIntegratedSpriteSheets || []
  const requested = Array.isArray(selection) ? selection.filter(Boolean) : []
  if (!requested.length && fallbackToAll) {
    gameState.selectedIntegratedSpriteSheets = [...normalizedAvailableSheets]
    return
  }
  const allowed = new Set(normalizedAvailableSheets)
  gameState.selectedIntegratedSpriteSheets = requested.filter(path => allowed.has(path))
}

function renderIntegratedSpriteSheetList() {
  if (!integratedSpriteSheetList || !integratedSpriteSheetListWrap) return
  integratedSpriteSheetList.textContent = ''
  const availableSheets = Array.isArray(gameState.availableIntegratedSpriteSheets)
    ? gameState.availableIntegratedSpriteSheets
    : []

  const isEnabled = Boolean(gameState.useIntegratedSpriteSheetMode)
  integratedSpriteSheetListWrap.hidden = !isEnabled

  if (!isEnabled) {
    return
  }

  if (!availableSheets.length) {
    const empty = document.createElement('div')
    empty.className = 'integrated-sprite-sheet-list__empty'
    empty.textContent = 'No sprite sheets found.'
    integratedSpriteSheetList.appendChild(empty)
    return
  }

  const selectedSet = new Set(gameState.selectedIntegratedSpriteSheets || [])
  availableSheets.forEach((sheetPath) => {
    const row = document.createElement('label')
    row.className = 'integrated-sprite-sheet-list__item'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = selectedSet.has(sheetPath)
    checkbox.addEventListener('change', async() => {
      const next = new Set(gameState.selectedIntegratedSpriteSheets || [])
      if (checkbox.checked) {
        next.add(sheetPath)
      } else {
        next.delete(sheetPath)
      }
      setIntegratedSpriteSheetSelection(Array.from(next), availableSheets)
      try {
        localStorage.setItem(INTEGRATED_SELECTED_SHEETS_STORAGE_KEY, JSON.stringify(gameState.selectedIntegratedSpriteSheets))
      } catch (err) {
        window.logger.warn('Failed to persist integrated sprite sheet selection:', err)
      }
      await applyIntegratedSpriteSheetRuntime()
    })
    const labelText = document.createElement('span')
    labelText.textContent = getDefaultSheetName(sheetPath)
    row.append(checkbox, labelText)
    integratedSpriteSheetList.appendChild(row)
  })
}

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
  const sheets = metadata
    ? [{ sheetPath: metadata.sheetPath || gameState.activeSpriteSheetPath, metadata }]
    : await resolveIntegratedSpriteSheetConfigs()

  await textureManager.setIntegratedSpriteSheetConfig({
    enabled: Boolean(gameState.useIntegratedSpriteSheetMode),
    sheetPath: metadata?.sheetPath || gameState.activeSpriteSheetPath,
    metadata: metadata || gameState.activeSpriteSheetMetadata || null,
    sheets,
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
  integratedSpriteSheetListWrap = document.getElementById('integratedSpriteSheetSelectionWrap')
  integratedSpriteSheetList = document.getElementById('integratedSpriteSheetSelectionList')

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

  gameState.availableIntegratedSpriteSheets = Array.isArray(gameState.availableIntegratedSpriteSheets)
    ? gameState.availableIntegratedSpriteSheets
    : []
  try {
    const storedSelectedSheets = safeParseJson(localStorage.getItem(INTEGRATED_SELECTED_SHEETS_STORAGE_KEY), null)
    setIntegratedSpriteSheetSelection(storedSelectedSheets, gameState.availableIntegratedSpriteSheets, { fallbackToAll: true })
  } catch (err) {
    window.logger.warn('Failed to load selected integrated sprite sheets:', err)
    setIntegratedSpriteSheetSelection(null, gameState.availableIntegratedSpriteSheets, { fallbackToAll: true })
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
      renderIntegratedSpriteSheetList()
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
        applyIntegratedSpriteSheetRuntime()
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
      await applyIntegratedSpriteSheetRuntime()
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
  observeMultiplayerSession(async() => {
    renderIntegratedSpriteSheetList()
    if (gameState.useIntegratedSpriteSheetMode) {
      await applyIntegratedSpriteSheetRuntime()
    }
  })
  updateLockState()
  renderIntegratedSpriteSheetList()
  syncControlsFromState()
  updatePauseIcon()

  fetchIndexedSpriteSheetPaths()
    .then((paths) => {
      gameState.availableIntegratedSpriteSheets = paths
      try {
        const storedSelectedSheets = safeParseJson(localStorage.getItem(INTEGRATED_SELECTED_SHEETS_STORAGE_KEY), null)
        setIntegratedSpriteSheetSelection(storedSelectedSheets, paths, { fallbackToAll: true })
      } catch {
        setIntegratedSpriteSheetSelection(null, paths, { fallbackToAll: true })
      }
      renderIntegratedSpriteSheetList()
      if (gameState.useIntegratedSpriteSheetMode) {
        applyIntegratedSpriteSheetRuntime()
      }
    })
    .catch(() => {})
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
