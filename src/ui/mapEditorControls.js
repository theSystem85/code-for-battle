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
let integratedSpriteSheetList = null

const INTEGRATED_MODE_STORAGE_KEY = 'rts-integrated-spritesheet-mode'
const INTEGRATED_BIOME_STORAGE_KEY = 'rts-integrated-spritesheet-biome'
const INTEGRATED_SELECTED_SHEETS_STORAGE_KEY = 'rts-integrated-spritesheet-selected-sheets'
const SSE_APPLIED_METADATA_STORAGE_KEY = 'rts-sse-applied-metadata'
const SSE_APPLIED_ANIMATION_METADATA_STORAGE_KEY = 'rts-sse-applied-animation-metadata'
const SSE_METADATA_PREFIX = 'rts-sse-metadata:'
const SSE_SHEETS_INDEX = 'images/map/sprite_sheets/index.json'
const DEFAULT_ANIMATION_SHEET_PATH = 'images/map/animations/explosion.webp'
const DEFAULT_ANIMATION_METADATA_PATH = 'images/map/animations/explosion.json'
const RETIRED_EXPLOSION_SHEET_PATTERN = /^images\/map\/animations\/\d+x\d+_\d+x\d+_.*explosion\.(webp|png|jpg|jpeg)$/i
const DEFAULT_STATIC_SSE_TAGS = [
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

function safeParseJson(raw, fallback = null) {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function buildMetaPath(sheetPath) {
  return sheetPath.replace(/\.(webp|png|jpg|jpeg)$/i, '.json')
}

function normalizeStaticSheetMetadata(raw, sheetPath) {
  const tileSize = Number.isFinite(raw?.tileSize) ? Math.max(8, Math.floor(raw.tileSize)) : 64
  const rowHeight = Number.isFinite(raw?.rowHeight) ? Math.max(8, Math.floor(raw.rowHeight)) : tileSize
  const borderWidth = Number.isFinite(raw?.borderWidth) ? Math.max(0, Math.floor(raw.borderWidth)) : 1
  const tiles = raw?.tiles && typeof raw.tiles === 'object' ? raw.tiles : {}
  const tags = Array.isArray(raw?.tags)
    ? Array.from(new Set([...raw.tags.filter(Boolean), ...DEFAULT_STATIC_SSE_TAGS]))
    : [...DEFAULT_STATIC_SSE_TAGS]

  const normalizedTiles = {}
  Object.entries(tiles).forEach(([tileKey, tileData]) => {
    const tileTags = Array.isArray(tileData?.tags) ? tileData.tags.filter(Boolean) : []
    if (!tileTags.length) return
    if (!tileData?.rect || typeof tileData.rect !== 'object') return
    normalizedTiles[tileKey] = {
      ...tileData,
      tags: tileTags
    }
  })

  return {
    schemaVersion: 1,
    sheetPath,
    tileSize,
    rowHeight,
    borderWidth,
    tags,
    tiles: normalizedTiles
  }
}

async function loadStaticSheetMetadata(sheetPath) {
  const local = safeParseJson(localStorage.getItem(`${SSE_METADATA_PREFIX}${sheetPath}`), null)
  if (local) return normalizeStaticSheetMetadata(local, sheetPath)

  try {
    const response = await fetch(buildMetaPath(sheetPath), { cache: 'no-store' })
    if (response.ok) {
      return normalizeStaticSheetMetadata(await response.json(), sheetPath)
    }
  } catch {
    // ignore missing sidecar
  }

  return normalizeStaticSheetMetadata(null, sheetPath)
}

function hasAnyTaggedTiles(metadata) {
  if (!metadata?.tiles || typeof metadata.tiles !== 'object') return false
  return Object.values(metadata.tiles).some(tile => Array.isArray(tile?.tags) && tile.tags.length > 0)
}

async function loadAvailableStaticSpriteSheets() {
  try {
    const response = await fetch(SSE_SHEETS_INDEX, { cache: 'no-store' })
    if (!response.ok) return []
    const payload = await response.json()
    if (Array.isArray(payload)) return payload
    if (Array.isArray(payload?.sheets)) return payload.sheets
  } catch (err) {
    window.logger.warn('Failed to load SSE sheets index:', err)
  }
  return []
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

  const multiplayerActive = Boolean(gameState.multiplayerSession?.active)
  const enabled = Boolean(gameState.useIntegratedSpriteSheetMode) && !multiplayerActive
  const selectedSheets = Array.isArray(gameState.integratedSelectedSpriteSheets)
    ? gameState.integratedSelectedSpriteSheets
    : []
  const availableSheets = Array.isArray(gameState.availableIntegratedSpriteSheets)
    ? gameState.availableIntegratedSpriteSheets
    : []
  const activeSheets = availableSheets.filter(sheetPath => selectedSheets.includes(sheetPath))
  const combinedSources = []

  for (const sheetPath of activeSheets) {
    const sourceMetadata = metadata && metadata.sheetPath === sheetPath
      ? metadata
      : await loadStaticSheetMetadata(sheetPath)
    if (!hasAnyTaggedTiles(sourceMetadata)) continue
    combinedSources.push({
      sheetPath,
      metadata: sourceMetadata
    })
  }

  await textureManager.setIntegratedSpriteSheetConfig({
    enabled,
    sheetPath: metadata?.sheetPath || gameState.activeSpriteSheetPath,
    metadata: metadata || gameState.activeSpriteSheetMetadata || null,
    sources: combinedSources,
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

function setIntegratedSheetSelectionVisibility() {
  if (!integratedSpriteSheetSelectionWrap) return
  integratedSpriteSheetSelectionWrap.style.display = integratedSpriteSheetModeCheckbox?.checked ? '' : 'none'
}

function persistIntegratedSheetSelection() {
  try {
    localStorage.setItem(
      INTEGRATED_SELECTED_SHEETS_STORAGE_KEY,
      JSON.stringify(gameState.integratedSelectedSpriteSheets || [])
    )
  } catch (err) {
    window.logger.warn('Failed to persist integrated sprite sheet selection:', err)
  }
}

function renderIntegratedSheetSelectionList() {
  if (!integratedSpriteSheetList) return
  integratedSpriteSheetList.innerHTML = ''

  const availableSheets = Array.isArray(gameState.availableIntegratedSpriteSheets)
    ? gameState.availableIntegratedSpriteSheets
    : []
  const selected = new Set(gameState.integratedSelectedSpriteSheets || [])

  if (!availableSheets.length) {
    const empty = document.createElement('div')
    empty.style.fontSize = '12px'
    empty.style.color = '#888'
    empty.textContent = 'No sprite sheets found'
    integratedSpriteSheetList.appendChild(empty)
    return
  }

  availableSheets.forEach((sheetPath) => {
    const row = document.createElement('label')
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '6px'
    row.style.fontSize = '12px'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = selected.has(sheetPath)
    checkbox.addEventListener('change', async() => {
      const existing = new Set(gameState.integratedSelectedSpriteSheets || [])
      if (checkbox.checked) {
        existing.add(sheetPath)
      } else {
        existing.delete(sheetPath)
      }
      gameState.integratedSelectedSpriteSheets = availableSheets.filter(path => existing.has(path))
      persistIntegratedSheetSelection()
      await applyIntegratedSpriteSheetRuntime()
    })

    const name = document.createElement('span')
    name.textContent = sheetPath.split('/').pop() || sheetPath
    name.title = sheetPath

    row.appendChild(checkbox)
    row.appendChild(name)
    integratedSpriteSheetList.appendChild(row)
  })
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
  const multiplayerActive = Boolean(gameState.multiplayerSession?.active)
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

  if (integratedSpriteSheetModeCheckbox) {
    integratedSpriteSheetModeCheckbox.disabled = multiplayerActive
    integratedSpriteSheetModeCheckbox.title = multiplayerActive
      ? 'Custom sprite sheets are disabled in multiplayer sessions'
      : ''
    if (multiplayerActive && integratedSpriteSheetModeCheckbox.checked) {
      integratedSpriteSheetModeCheckbox.checked = false
    }
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
  integratedSpriteSheetList = document.getElementById('integratedSpriteSheetList')

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

  gameState.integratedSelectedSpriteSheets = []
  gameState.availableIntegratedSpriteSheets = []
  try {
    const storedSheetSelection = safeParseJson(
      localStorage.getItem(INTEGRATED_SELECTED_SHEETS_STORAGE_KEY),
      []
    )
    if (Array.isArray(storedSheetSelection)) {
      gameState.integratedSelectedSpriteSheets = storedSheetSelection.filter(sheet => typeof sheet === 'string')
    }
  } catch (err) {
    window.logger.warn('Failed to load integrated sprite sheet selection:', err)
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
      setIntegratedSheetSelectionVisibility()
      await applyIntegratedSpriteSheetRuntime()
    })
  }
  setIntegratedSheetSelectionVisibility()

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

  loadAvailableStaticSpriteSheets().then((sheets) => {
    gameState.availableIntegratedSpriteSheets = sheets
    if (!Array.isArray(gameState.integratedSelectedSpriteSheets) || !gameState.integratedSelectedSpriteSheets.length) {
      gameState.integratedSelectedSpriteSheets = [...sheets]
    } else {
      const selected = new Set(gameState.integratedSelectedSpriteSheets)
      gameState.integratedSelectedSpriteSheets = sheets.filter(sheet => selected.has(sheet))
    }
    persistIntegratedSheetSelection()
    renderIntegratedSheetSelectionList()
    if (gameState.useIntegratedSpriteSheetMode) {
      applyIntegratedSpriteSheetRuntime()
    }
  }).catch((err) => {
    window.logger.warn('Failed to initialize integrated sprite sheet list:', err)
  })

  initSpriteSheetEditor({
    initialSheetPath: gameState.activeSpriteSheetPath,
    onSheetDataChange: (metadata) => {
      gameState.activeSpriteSheetPath = metadata?.sheetPath || gameState.activeSpriteSheetPath || null
      gameState.activeSpriteSheetMetadata = metadata
      if (metadata?.sheetPath && Array.isArray(gameState.availableIntegratedSpriteSheets) && gameState.availableIntegratedSpriteSheets.includes(metadata.sheetPath)) {
        const selected = new Set(gameState.integratedSelectedSpriteSheets || [])
        if (!selected.has(metadata.sheetPath)) {
          selected.add(metadata.sheetPath)
          gameState.integratedSelectedSpriteSheets = gameState.availableIntegratedSpriteSheets.filter(path => selected.has(path))
          persistIntegratedSheetSelection()
          renderIntegratedSheetSelectionList()
        }
      }
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
      if (metadata?.sheetPath && Array.isArray(gameState.availableIntegratedSpriteSheets) && gameState.availableIntegratedSpriteSheets.includes(metadata.sheetPath)) {
        const selected = new Set(gameState.integratedSelectedSpriteSheets || [])
        if (!selected.has(metadata.sheetPath)) {
          selected.add(metadata.sheetPath)
          gameState.integratedSelectedSpriteSheets = gameState.availableIntegratedSpriteSheets.filter(path => selected.has(path))
          persistIntegratedSheetSelection()
          renderIntegratedSheetSelectionList()
        }
      }
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
