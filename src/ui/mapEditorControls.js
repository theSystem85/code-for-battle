import { gameState } from '../gameState.js'
import { getMapRenderer, getTextureManager } from '../rendering.js'
import { initializeOccupancyMap } from '../units.js'
import { observeMultiplayerSession } from '../network/multiplayerSessionEvents.js'
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
let integratedSpriteSheetSelectionContainer = null
let integratedSpriteSheetSelectionList = null
let sseImageConverterToggle = null
let sseImageConverterContent = null
let sseImageConverterToggleIcon = null
let sseImageConverterCompressionInput = null
let sseImageConverterWidthInput = null
let sseImageConverterHeightInput = null
let sseImageConverterFilenameSuffixCheckbox = null
let sseImageConverterDropZone = null
let sseImageConverterFileInput = null
let sseImageConverterStatus = null
const runtimeAppliedStaticMetadataBySheetPath = new Map()
const runtimeSheetDisplayLabelByPath = new Map()

const INTEGRATED_MODE_STORAGE_KEY = 'rts-integrated-spritesheet-mode'
const INTEGRATED_BIOME_STORAGE_KEY = 'rts-integrated-spritesheet-biome'
const INTEGRATED_SELECTED_SHEETS_STORAGE_KEY = 'rts-integrated-spritesheet-selected-sheets'
const SSE_APPLIED_METADATA_STORAGE_KEY = 'rts-sse-applied-metadata'
const SSE_APPLIED_ANIMATION_METADATA_STORAGE_KEY = 'rts-sse-applied-animation-metadata'
const SSE_SHEETS_INDEX = 'images/map/sprite_sheets/index.json'
const SSE_METADATA_PREFIX = 'rts-sse-metadata:'
const COMBAT_DECAL_SHEET_PATH = 'images/map/sprite_sheets/debris_craters_tracks.webp'
const COMBAT_DECAL_BLACK_KEY = Object.freeze({
  cutoffBrightness: 8,
  softenBrightness: 24
})
const DEFAULT_SSE_SHEETS = [
  'images/map/sprite_sheets/seasons_1024_q90_2.webp',
  'images/map/sprite_sheets/seasons_1024_q90_3.webp',
  'images/map/sprite_sheets/streets23_q90_1024x1024.webp',
  'images/map/sprite_sheets/crystals_q90_1024x1024.webp',
  'images/map/sprite_sheets/rocks_64x64_1024x1024_q85.webp',
  'images/map/sprite_sheets/rockCliffsMountains_64x64_1024x1024.webp',
  'images/map/sprite_sheets/debris_craters_tracks.webp'
]
const DEFAULT_ANIMATION_SHEET_PATH = 'images/map/animations/explosion.webp'
const DEFAULT_ANIMATION_METADATA_PATH = 'images/map/animations/explosion.json'
const RETIRED_EXPLOSION_SHEET_PATTERN = /^images\/map\/animations\/\d+x\d+_\d+x\d+_.*explosion\.(webp|png|jpg|jpeg)$/i
const SSE_CONVERTER_DEFAULT_QUALITY = 90
const SSE_CONVERTER_DEFAULT_RESOLUTION = 1024
const SSE_CONVERTER_MAX_RESOLUTION = 2048
const SSE_CONVERTER_ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const SSE_CONVERTER_ALLOWED_EXTENSIONS = /\.(png|jpe?g|webp)$/i

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

function normalizeBlackKeyForSheet(sheetPath, blackKey) {
  if (blackKey && Number.isFinite(blackKey.cutoffBrightness) && Number.isFinite(blackKey.softenBrightness)) {
    return {
      cutoffBrightness: Math.max(0, Math.floor(blackKey.cutoffBrightness)),
      softenBrightness: Math.max(Math.floor(blackKey.cutoffBrightness) + 1, Math.floor(blackKey.softenBrightness))
    }
  }

  if (sheetPath === COMBAT_DECAL_SHEET_PATH) {
    return { ...COMBAT_DECAL_BLACK_KEY }
  }

  return undefined
}

function normalizeMetadataForSheet(sheetPath, metadata) {
  if (!metadata || typeof metadata !== 'object') return metadata

  const blackKey = normalizeBlackKeyForSheet(sheetPath, metadata.blackKey)
  if (!blackKey) {
    return metadata
  }

  return {
    ...metadata,
    blackKey
  }
}

function hasTaggedTiles(metadata) {
  if (!metadata?.tiles || typeof metadata.tiles !== 'object') return false
  return Object.values(metadata.tiles).some(tile => Array.isArray(tile?.tags) && tile.tags.length > 0 && tile.rect)
}

function cacheRuntimeIntegratedMetadata(metadata) {
  if (!metadata?.sheetPath || !hasTaggedTiles(metadata)) return
  runtimeAppliedStaticMetadataBySheetPath.set(metadata.sheetPath, metadata)
  if (typeof metadata.displayName === 'string' && metadata.displayName.trim()) {
    runtimeSheetDisplayLabelByPath.set(metadata.sheetPath, metadata.displayName.trim())
  }
}

function mergeSheetPaths(baseSheetPaths = [], additionalSheetPaths = []) {
  const merged = []
  const seen = new Set()
  ;[...baseSheetPaths, ...additionalSheetPaths].forEach((sheetPath) => {
    if (typeof sheetPath !== 'string' || !sheetPath.trim() || seen.has(sheetPath)) return
    seen.add(sheetPath)
    merged.push(sheetPath)
  })
  return merged
}

function ensureIntegratedSheetVisible(sheetPath, { autoSelect = true } = {}) {
  if (typeof sheetPath !== 'string' || !sheetPath.trim()) return
  const available = Array.isArray(gameState.availableStaticSpriteSheets)
    ? gameState.availableStaticSpriteSheets
    : []
  const nextAvailable = mergeSheetPaths(available, [sheetPath])
  gameState.availableStaticSpriteSheets = nextAvailable

  const selected = Array.isArray(gameState.activeSpriteSheetSelections)
    ? gameState.activeSpriteSheetSelections
    : []
  const selectedSet = new Set(selected)
  if (autoSelect) {
    selectedSet.add(sheetPath)
  }
  gameState.activeSpriteSheetSelections = nextAvailable.filter(path => selectedSet.has(path))
  try {
    localStorage.setItem(INTEGRATED_SELECTED_SHEETS_STORAGE_KEY, JSON.stringify(gameState.activeSpriteSheetSelections))
  } catch (err) {
    window.logger.warn('Failed to persist selected integrated sprite sheets:', err)
  }

  renderIntegratedSheetSelectionList(nextAvailable)
}

function isMultiplayerSessionActive() {
  const session = gameState.multiplayerSession || {}
  return Boolean(session.isRemote) || session.status === 'connected'
}

function clampInteger(value, min, max, fallback) {
  const normalized = Number.parseInt(value, 10)
  if (!Number.isFinite(normalized)) return fallback
  return Math.max(min, Math.min(max, normalized))
}

function setSseImageConverterStatus(message, tone = 'info') {
  if (!sseImageConverterStatus) return
  sseImageConverterStatus.textContent = message
  if (tone === 'error') sseImageConverterStatus.style.color = '#ff6b6b'
  else if (tone === 'success') sseImageConverterStatus.style.color = '#8fe58a'
  else sseImageConverterStatus.style.color = '#ccc'
}

function getSseConverterConfig() {
  const compression = clampInteger(
    sseImageConverterCompressionInput?.value,
    1,
    100,
    SSE_CONVERTER_DEFAULT_QUALITY
  )
  const width = clampInteger(
    sseImageConverterWidthInput?.value,
    1,
    SSE_CONVERTER_MAX_RESOLUTION,
    SSE_CONVERTER_DEFAULT_RESOLUTION
  )
  const height = clampInteger(
    sseImageConverterHeightInput?.value,
    1,
    SSE_CONVERTER_MAX_RESOLUTION,
    SSE_CONVERTER_DEFAULT_RESOLUTION
  )

  if (sseImageConverterCompressionInput) sseImageConverterCompressionInput.value = String(compression)
  if (sseImageConverterWidthInput) sseImageConverterWidthInput.value = String(width)
  if (sseImageConverterHeightInput) sseImageConverterHeightInput.value = String(height)

  return {
    compression,
    width,
    height,
    includeSuffix: Boolean(sseImageConverterFilenameSuffixCheckbox?.checked)
  }
}

function buildConvertedFilename(fileName, { compression, width, height, includeSuffix }) {
  const sourceName = typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'converted-image'
  const dotIndex = sourceName.lastIndexOf('.')
  const baseName = dotIndex > 0 ? sourceName.slice(0, dotIndex) : sourceName
  const suffix = includeSuffix ? `_q${compression}_${width}x${height}` : ''
  return `${baseName}${suffix}.webp`
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not decode image file'))
    }
    image.src = objectUrl
  })
}

function canvasToWebpBlob(canvas, qualityPercent) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to encode WEBP blob'))
    }, 'image/webp', qualityPercent / 100)
  })
}

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function convertAndDownloadSseFile(file) {
  const isAllowedType = SSE_CONVERTER_ALLOWED_TYPES.has(file?.type)
  const isAllowedExtension = SSE_CONVERTER_ALLOWED_EXTENSIONS.test(file?.name || '')
  if (!file || (!isAllowedType && !isAllowedExtension)) {
    throw new Error('Only PNG, JPEG, and WEBP files are supported')
  }

  const config = getSseConverterConfig()
  const image = await loadImageFromFile(file)
  const canvas = document.createElement('canvas')
  canvas.width = config.width
  canvas.height = config.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context unavailable in this browser')
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, config.width, config.height)

  const blob = await canvasToWebpBlob(canvas, config.compression)
  const outputName = buildConvertedFilename(file.name, config)
  triggerBlobDownload(blob, outputName)
  return outputName
}

async function handleSseConverterFiles(fileList) {
  const files = Array.from(fileList || [])
  if (!files.length) {
    setSseImageConverterStatus('No files selected.', 'error')
    return
  }

  const converted = []
  for (const file of files) {
    try {
      const outputName = await convertAndDownloadSseFile(file)
      converted.push(outputName)
    } catch (err) {
      setSseImageConverterStatus(`${file.name}: ${err.message}`, 'error')
      return
    }
  }

  setSseImageConverterStatus(`Converted ${converted.length} file${converted.length === 1 ? '' : 's'} to WEBP.`, 'success')
}

function initSseImageConverterControls() {
  sseImageConverterToggle = document.getElementById('sseImageConverterToggle')
  sseImageConverterContent = document.getElementById('sseImageConverterContent')
  sseImageConverterToggleIcon = document.getElementById('sseImageConverterToggleIcon')
  sseImageConverterCompressionInput = document.getElementById('sseImageConverterCompression')
  sseImageConverterWidthInput = document.getElementById('sseImageConverterWidth')
  sseImageConverterHeightInput = document.getElementById('sseImageConverterHeight')
  sseImageConverterFilenameSuffixCheckbox = document.getElementById('sseImageConverterFilenameSuffix')
  sseImageConverterDropZone = document.getElementById('sseImageConverterDropZone')
  sseImageConverterFileInput = document.getElementById('sseImageConverterFileInput')
  sseImageConverterStatus = document.getElementById('sseImageConverterStatus')

  if (
    !sseImageConverterToggle
    || !sseImageConverterContent
    || !sseImageConverterToggleIcon
    || !sseImageConverterDropZone
    || !sseImageConverterFileInput
  ) {
    return
  }

  sseImageConverterToggle.addEventListener('click', () => {
    const isExpanded = !sseImageConverterContent.hidden
    sseImageConverterContent.hidden = isExpanded
    sseImageConverterToggle.setAttribute('aria-expanded', isExpanded ? 'false' : 'true')
    sseImageConverterToggleIcon.textContent = isExpanded ? '▼' : '▲'
  })

  const normalizeInput = () => getSseConverterConfig()
  const converterInputs = [
    sseImageConverterCompressionInput,
    sseImageConverterWidthInput,
    sseImageConverterHeightInput
  ]
  converterInputs.forEach((input) => {
    if (input) {
      input.addEventListener('change', normalizeInput)
      input.addEventListener('blur', normalizeInput)
    }
  })
  normalizeInput()

  sseImageConverterFileInput.addEventListener('change', async(e) => {
    await handleSseConverterFiles(e.target.files)
    e.target.value = ''
  })

  const setDragOver = (isDragOver) => {
    sseImageConverterDropZone.classList.toggle('is-dragover', isDragOver)
  }

  sseImageConverterDropZone.addEventListener('dragover', (event) => {
    event.preventDefault()
    setDragOver(true)
  })
  sseImageConverterDropZone.addEventListener('dragenter', (event) => {
    event.preventDefault()
    setDragOver(true)
  })
  sseImageConverterDropZone.addEventListener('dragleave', (event) => {
    if (!sseImageConverterDropZone.contains(event.relatedTarget)) {
      setDragOver(false)
    }
  })
  sseImageConverterDropZone.addEventListener('drop', async(event) => {
    event.preventDefault()
    setDragOver(false)
    const files = event.dataTransfer?.files
    await handleSseConverterFiles(files)
  })
}

async function loadStaticSheetPaths() {
  try {
    const response = await fetch(SSE_SHEETS_INDEX, { cache: 'no-store' })
    if (response.ok) {
      const parsed = await response.json()
      if (Array.isArray(parsed?.sheets) && parsed.sheets.length) {
        return parsed.sheets
      }
    }
  } catch (err) {
    window.logger.warn('Failed to load sprite sheet index:', err)
  }
  return [...DEFAULT_SSE_SHEETS]
}

async function loadMetadataForSheet(sheetPath, { allowLocalOverride = true } = {}) {
  if (!sheetPath) return null
  if (allowLocalOverride) {
    const local = safeParseJson(localStorage.getItem(`${SSE_METADATA_PREFIX}${sheetPath}`), null)
    if (local && typeof local === 'object') {
      return normalizeMetadataForSheet(sheetPath, local)
    }
  }

  const sidecarPath = buildMetaPath(sheetPath)
  try {
    const res = await fetch(sidecarPath, { cache: 'no-store' })
    if (res.ok) {
      return normalizeMetadataForSheet(sheetPath, await res.json())
    }
  } catch {
    // ignored: missing sidecar file
  }
  return null
}

function renderIntegratedSheetSelectionList(sheetPaths = []) {
  if (!integratedSpriteSheetSelectionList) return
  integratedSpriteSheetSelectionList.innerHTML = ''

  const selectedPaths = new Set(Array.isArray(gameState.activeSpriteSheetSelections) ? gameState.activeSpriteSheetSelections : sheetPaths)
  sheetPaths.forEach((sheetPath) => {
    const item = document.createElement('label')
    item.className = 'integrated-sheet-selection-item'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.dataset.sheetPath = sheetPath
    checkbox.checked = selectedPaths.has(sheetPath)
    checkbox.addEventListener('change', async() => {
      const currentSelected = new Set(Array.isArray(gameState.activeSpriteSheetSelections) ? gameState.activeSpriteSheetSelections : sheetPaths)
      if (checkbox.checked) currentSelected.add(sheetPath)
      else currentSelected.delete(sheetPath)
      gameState.activeSpriteSheetSelections = sheetPaths.filter(path => currentSelected.has(path))
      try {
        localStorage.setItem(INTEGRATED_SELECTED_SHEETS_STORAGE_KEY, JSON.stringify(gameState.activeSpriteSheetSelections))
      } catch (err) {
        window.logger.warn('Failed to persist selected integrated sprite sheets:', err)
      }
      await applyIntegratedSpriteSheetRuntime()
    })
    const name = document.createElement('span')
    const runtimeLabel = runtimeSheetDisplayLabelByPath.get(sheetPath)
    name.textContent = runtimeLabel || (sheetPath.split('/').pop() || sheetPath)
    item.append(checkbox, name)
    integratedSpriteSheetSelectionList.appendChild(item)
  })
}

function updateIntegratedSheetSelectionVisibility() {
  if (!integratedSpriteSheetSelectionContainer || !integratedSpriteSheetModeCheckbox) return
  integratedSpriteSheetSelectionContainer.hidden = !integratedSpriteSheetModeCheckbox.checked
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
  cacheRuntimeIntegratedMetadata(metadata)

  const allStaticSheets = Array.isArray(gameState.availableStaticSpriteSheets) && gameState.availableStaticSpriteSheets.length
    ? gameState.availableStaticSpriteSheets
    : await loadStaticSheetPaths()
  gameState.availableStaticSpriteSheets = allStaticSheets
  if (!Array.isArray(gameState.activeSpriteSheetSelections) || !gameState.activeSpriteSheetSelections.length) {
    gameState.activeSpriteSheetSelections = [...allStaticSheets]
  }

  const selectedSheetPaths = allStaticSheets.filter(path => gameState.activeSpriteSheetSelections.includes(path))
  const multiplayerActive = isMultiplayerSessionActive()
  const allowLocalOverride = !multiplayerActive
  const resolvedSheets = []
  for (const sheetPath of selectedSheetPaths) {
    const runtimeAppliedMetadata = runtimeAppliedStaticMetadataBySheetPath.get(sheetPath)
    const resolvedMetadata = metadata?.sheetPath === sheetPath
      ? metadata
      : (runtimeAppliedMetadata || await loadMetadataForSheet(sheetPath, { allowLocalOverride }))
    if (!hasTaggedTiles(resolvedMetadata)) continue
    resolvedSheets.push({
      sheetPath,
      metadata: resolvedMetadata
    })
  }

  const primarySheet = resolvedSheets[0] || null

  await textureManager.setIntegratedSpriteSheetConfig({
    enabled: Boolean(gameState.useIntegratedSpriteSheetMode),
    sheetPath: primarySheet?.sheetPath || null,
    metadata: primarySheet?.metadata || null,
    sheets: resolvedSheets,
    biomeTag: gameState.activeSpriteSheetBiomeTag || 'grass'
  })

  const mapRenderer = getMapRenderer()
  if (mapRenderer) {
    if (Array.isArray(gameState.mapGrid)) {
      mapRenderer.computeSOTMask(gameState.mapGrid)
    }
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
  integratedSpriteSheetSelectionContainer = document.getElementById('integratedSpriteSheetSelectionContainer')
  integratedSpriteSheetSelectionList = document.getElementById('integratedSpriteSheetSelectionList')
  initSseImageConverterControls()

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
        cacheRuntimeIntegratedMetadata(parsed)
      }
    }
  } catch (err) {
    window.logger.warn('Failed to load applied SSE metadata from localStorage:', err)
  }

  gameState.availableStaticSpriteSheets = mergeSheetPaths(
    DEFAULT_SSE_SHEETS,
    [gameState.activeSpriteSheetMetadata?.sheetPath, gameState.activeSpriteSheetPath]
  )

  try {
    const storedSelected = safeParseJson(localStorage.getItem(INTEGRATED_SELECTED_SHEETS_STORAGE_KEY), [])
    if (Array.isArray(storedSelected) && storedSelected.length) {
      gameState.activeSpriteSheetSelections = gameState.availableStaticSpriteSheets.filter(path => storedSelected.includes(path))
    }
  } catch (err) {
    window.logger.warn('Failed to load selected integrated sprite sheets:', err)
  }
  if (!Array.isArray(gameState.activeSpriteSheetSelections) || !gameState.activeSpriteSheetSelections.length) {
    gameState.activeSpriteSheetSelections = [...gameState.availableStaticSpriteSheets]
  }
  renderIntegratedSheetSelectionList(gameState.availableStaticSpriteSheets)
  loadStaticSheetPaths().then(async(sheetPaths) => {
    gameState.availableStaticSpriteSheets = mergeSheetPaths(
      sheetPaths,
      [gameState.activeSpriteSheetMetadata?.sheetPath, gameState.activeSpriteSheetPath]
    )
    const availablePaths = gameState.availableStaticSpriteSheets
    if (!Array.isArray(gameState.activeSpriteSheetSelections) || !gameState.activeSpriteSheetSelections.length) {
      gameState.activeSpriteSheetSelections = [...availablePaths]
    } else {
      gameState.activeSpriteSheetSelections = availablePaths.filter(path => gameState.activeSpriteSheetSelections.includes(path))
      if (!gameState.activeSpriteSheetSelections.length) {
        gameState.activeSpriteSheetSelections = [...availablePaths]
      }
    }
    renderIntegratedSheetSelectionList(availablePaths)
    if (gameState.useIntegratedSpriteSheetMode) {
      await applyIntegratedSpriteSheetRuntime()
    }
  }).catch((err) => {
    window.logger.warn('Failed to hydrate static sprite sheet list:', err)
  })

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
    updateIntegratedSheetSelectionVisibility()
    integratedSpriteSheetModeCheckbox.addEventListener('change', async(e) => {
      const enabled = Boolean(e.target.checked)
      gameState.useIntegratedSpriteSheetMode = enabled
      updateIntegratedSheetSelectionVisibility()
      try {
        localStorage.setItem(INTEGRATED_MODE_STORAGE_KEY, enabled ? 'true' : 'false')
      } catch (err) {
        window.logger.warn('Failed to persist integrated sprite sheet mode:', err)
      }
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
      cacheRuntimeIntegratedMetadata(metadata)
      if (metadata?.sheetPath && hasTaggedTiles(metadata)) {
        ensureIntegratedSheetVisible(metadata.sheetPath, { autoSelect: false })
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
      cacheRuntimeIntegratedMetadata(metadata)
      if (metadata?.sheetPath && hasTaggedTiles(metadata)) {
        ensureIntegratedSheetVisible(metadata.sheetPath, { autoSelect: true })
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
  observeMultiplayerSession(() => {
    applyIntegratedSpriteSheetRuntime()
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
