import {
  createSpriteSheetAnimationInstance,
  getAnimationFrameIndex,
  getSpriteSheetTexture
} from '../rendering/spriteSheetAnimation.js'

const DEFAULT_TILE_SIZE = 64
const DEFAULT_BORDER_WIDTH = 1
const SSE_SHEETS_INDEX = 'images/map/sprite_sheets/index.json'
const SSE_ANIMATIONS_INDEX = 'images/map/animations/index.json'
const SSE_METADATA_PREFIX = 'rts-sse-metadata:'
const SSE_ANIMATION_METADATA_PREFIX = 'rts-sse-animation-metadata:'
const SSE_LAST_SHEET_KEY = 'rts-sse-last-sheet'
const SSE_LAST_ANIMATION_SHEET_KEY = 'rts-sse-last-animation-sheet'

export const DEFAULT_SSE_TAGS = [
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

const fallbackSheets = [
  'images/map/sprite_sheets/grass.webp',
  'images/map/sprite_sheets/soil.webp',
  'images/map/sprite_sheets/snow.webp',
  'images/map/sprite_sheets/desert.webp',
  'images/map/sprite_sheets/water.webp',
  'images/map/sprite_sheets/multiTerrainSpriteSheet.webp'
]

const fallbackAnimationSheets = [
  'images/map/animations/64x64_9x9_q85_explosion.webp'
]

const DEFAULT_ANIMATION_TAGS = ['explosion']

function safeParseJson(raw, fallback) {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function hashCoord(x, y) {
  let hash = ((x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791)) >>> 0
  hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
  hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
  hash = (hash >>> 16) ^ hash
  return Math.abs(hash)
}

function buildMetaPath(sheetPath) {
  return sheetPath.replace(/\.(webp|png|jpg|jpeg)$/i, '.json')
}

function ensureTileRecord(data, tileKey) {
  if (!data.tiles[tileKey]) {
    data.tiles[tileKey] = { tags: [] }
  }
  if (!Array.isArray(data.tiles[tileKey].tags)) {
    data.tiles[tileKey].tags = []
  }
  return data.tiles[tileKey]
}

function normalizeSheetData(raw, sheetPath, defaultTags = DEFAULT_SSE_TAGS) {
  const tags = Array.isArray(raw?.tags)
    ? Array.from(new Set([...raw.tags.filter(Boolean), ...defaultTags]))
    : [...defaultTags]
  const data = {
    schemaVersion: 1,
    sheetPath,
    tileSize: Number.isFinite(raw?.tileSize) ? Math.max(8, Math.floor(raw.tileSize)) : DEFAULT_TILE_SIZE,
    borderWidth: Number.isFinite(raw?.borderWidth) ? Math.max(0, Math.floor(raw.borderWidth)) : DEFAULT_BORDER_WIDTH,
    tags: tags.length ? Array.from(new Set(tags)) : [...defaultTags],
    tiles: raw?.tiles && typeof raw.tiles === 'object' ? raw.tiles : {}
  }

  Object.keys(data.tiles).forEach((tileKey) => {
    const entry = data.tiles[tileKey]
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.tags)) {
      data.tiles[tileKey] = { tags: [] }
      return
    }
    entry.tags = entry.tags.filter(Boolean)
  })

  return data
}

function makeTileKey(col, row) {
  return `${col},${row}`
}

function parseTileKey(tileKey) {
  const [colStr, rowStr] = `${tileKey}`.split(',')
  return {
    col: Number.parseInt(colStr, 10) || 0,
    row: Number.parseInt(rowStr, 10) || 0
  }
}

function toSerializableData(data, image) {
  const columns = image ? Math.floor(image.width / Math.max(1, data.tileSize)) : 0
  const rows = image ? Math.floor(image.height / Math.max(1, data.tileSize)) : 0
  const sourceTile = Math.max(1, data.tileSize - (data.borderWidth * 2))
  const serializedTiles = {}

  Object.entries(data.tiles || {}).forEach(([tileKey, tileData]) => {
    if (!tileData?.tags?.length) return
    const { col, row } = parseTileKey(tileKey)
    const sx = (col * data.tileSize) + data.borderWidth
    const sy = (row * data.tileSize) + data.borderWidth
    serializedTiles[tileKey] = {
      tags: [...tileData.tags],
      rect: {
        x: sx,
        y: sy,
        width: sourceTile,
        height: sourceTile
      },
      col,
      row
    }
  })

  return {
    schemaVersion: 1,
    sheetPath: data.sheetPath,
    tileSize: data.tileSize,
    borderWidth: data.borderWidth,
    tags: data.tags,
    columns,
    rows,
    runtimeNormalization: {
      sourceTileSize: sourceTile,
      targetTileSize: 64,
      scale: sourceTile > 0 ? (64 / sourceTile) : 1,
      requiresUpscale: sourceTile < 64
    },
    tiles: serializedTiles
  }
}

function toSerializableAnimationData(data, image) {
  const columns = image ? Math.floor(image.width / Math.max(1, data.tileSize)) : 0
  const rows = image ? Math.floor(image.height / Math.max(1, data.tileSize)) : 0
  const tiles = {}
  const framesByTag = {}

  Object.entries(data.tiles || {}).forEach(([tileKey, tileData]) => {
    if (!tileData?.tags?.length) return
    const { col, row } = parseTileKey(tileKey)
    const frameIndex = (row * columns) + col
    tiles[tileKey] = {
      col,
      row,
      frameIndex,
      tags: [...tileData.tags]
    }
    tileData.tags.forEach((tag) => {
      if (!framesByTag[tag]) {
        framesByTag[tag] = []
      }
      framesByTag[tag].push(frameIndex)
    })
  })

  Object.keys(framesByTag).forEach((tag) => {
    framesByTag[tag] = framesByTag[tag]
      .filter(index => Number.isFinite(index))
      .sort((a, b) => a - b)
  })

  return {
    schemaVersion: 1,
    kind: 'animation',
    sheetPath: data.sheetPath,
    tileSize: data.tileSize,
    borderWidth: data.borderWidth,
    tags: [...data.tags],
    columns,
    rows,
    activeTag: data.activeTag || DEFAULT_ANIMATION_TAGS[0],
    framesByTag,
    tiles
  }
}

function sortTags(tags, tiles, activeTag) {
  const used = new Set()
  Object.values(tiles).forEach((entry) => {
    if (!entry?.tags) return
    entry.tags.forEach(tag => used.add(tag))
  })

  return [...tags].sort((a, b) => {
    if (a === activeTag) return -1
    if (b === activeTag) return 1
    const aUsed = used.has(a) ? 1 : 0
    const bUsed = used.has(b) ? 1 : 0
    if (aUsed !== bUsed) return bUsed - aUsed
    return a.localeCompare(b)
  })
}

function getRelativeEventPos(element, event) {
  const rect = element.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }
}

function getTileAtCanvasPos(state, posX, posY) {
  if (!state.image) return null
  const tileSize = Math.max(1, state.activeData.tileSize)
  const unscaledX = (posX - state.panX) / state.zoomScale
  const unscaledY = (posY - state.panY) / state.zoomScale
  const col = Math.floor(unscaledX / tileSize)
  const row = Math.floor(unscaledY / tileSize)
  const maxCols = Math.floor(state.image.width / tileSize)
  const maxRows = Math.floor(state.image.height / tileSize)

  if (col < 0 || row < 0 || col >= maxCols || row >= maxRows) {
    return null
  }

  return { col, row }
}

function getAnimationFrameOrdinalMap(data, activeTag) {
  if (!data || !activeTag) return new Map()
  const ordered = []
  Object.entries(data.tiles || {}).forEach(([tileKey, tileData]) => {
    if (Array.isArray(tileData?.tags) && tileData.tags.includes(activeTag)) {
      const { col, row } = parseTileKey(tileKey)
      const frameIndex = (row * 100000) + col
      ordered.push({ tileKey, frameIndex })
    }
  })

  ordered.sort((a, b) => a.frameIndex - b.frameIndex)
  const ordinalMap = new Map()
  ordered.forEach((entry, index) => {
    ordinalMap.set(entry.tileKey, index + 1)
  })
  return ordinalMap
}

function drawSseCanvas(state) {
  const canvas = state.canvas
  const image = state.image
  const data = state.activeData
  if (!canvas || !data) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  if (!image) {
    canvas.width = 320
    canvas.height = 180
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#7f8b97'
    ctx.font = '14px sans-serif'
    ctx.fillText('No sprite sheet loaded', 12, 24)
    return
  }

  const tileSize = Math.max(1, data.tileSize)
  canvas.width = image.width
  canvas.height = image.height
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(image, 0, 0)

  const isAnimatedMode = state.activeMode === 'animated'
  const frameOrdinalMap = isAnimatedMode
    ? getAnimationFrameOrdinalMap(data, state.activeTag)
    : new Map()

  if (state.showTaggedOverlay) {
    Object.entries(data.tiles).forEach(([tileKey, tileData]) => {
      if (!tileData?.tags?.length) return
      const { col, row } = parseTileKey(tileKey)
      const x = col * tileSize
      const y = row * tileSize
      const isActiveTagTile = state.activeTag && tileData.tags.includes(state.activeTag)

      if (isActiveTagTile) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.33)'
        ctx.fillRect(x, y, tileSize, tileSize)
      }

      if (state.showLabels) {
        const tags = tileData.tags
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        tags.forEach((tag, index) => {
          const labelY = y + 2 + (index * 11)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.66)'
          const width = Math.min(tileSize - 4, Math.max(24, (tag.length * 6) + 6))
          ctx.fillRect(x + 2, labelY, width, 10)
          ctx.fillStyle = '#ffd6d6'
          ctx.fillText(tag, x + 4, labelY + 1)
        })

        if (isAnimatedMode && frameOrdinalMap.has(tileKey)) {
          const ordinal = frameOrdinalMap.get(tileKey)
          const label = `${ordinal}`
          const labelWidth = Math.max(14, (label.length * 6) + 4)
          const labelX = x + 2
          const labelY = y + tileSize - 12
          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
          ctx.fillRect(labelX, labelY, labelWidth, 10)
          ctx.fillStyle = '#ffffff'
          ctx.fillText(label, labelX + 2, labelY + 1)
        }
      }
    })
  }

  if (state.showGrid) {
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.85)'
    ctx.lineWidth = 1
    const cols = Math.floor(image.width / tileSize)
    const rows = Math.floor(image.height / tileSize)

    for (let col = 0; col <= cols; col++) {
      const x = (col * tileSize) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, rows * tileSize)
      ctx.stroke()
    }

    for (let row = 0; row <= rows; row++) {
      const y = (row * tileSize) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(cols * tileSize, y)
      ctx.stroke()
    }
  }
}

function updateZoomDisplay(state) {
  if (!state.zoomValueEl) return
  state.zoomValueEl.textContent = `${Math.round(state.zoomScale * 100)}%`
}

function clampPan(state) {
  if (!state.canvasWrap || !state.canvas || !state.image) return

  const viewportWidth = state.canvasWrap.clientWidth
  const viewportHeight = state.canvasWrap.clientHeight
  const scaledWidth = state.canvas.width * state.zoomScale
  const scaledHeight = state.canvas.height * state.zoomScale

  if (scaledWidth <= viewportWidth) {
    state.panX = Math.floor((viewportWidth - scaledWidth) / 2)
  } else {
    const minX = viewportWidth - scaledWidth
    state.panX = Math.max(minX, Math.min(0, state.panX))
  }

  if (scaledHeight <= viewportHeight) {
    state.panY = Math.floor((viewportHeight - scaledHeight) / 2)
  } else {
    const minY = viewportHeight - scaledHeight
    state.panY = Math.max(minY, Math.min(0, state.panY))
  }
}

function renderViewportTransform(state) {
  if (!state.canvasViewport) return
  state.canvasViewport.style.transform = `translate(${Math.round(state.panX)}px, ${Math.round(state.panY)}px) scale(${state.zoomScale})`
}

function applyCanvasZoom(state) {
  if (!state.canvas || !state.image || !state.canvasViewport) return
  clampPan(state)
  renderViewportTransform(state)
  updateZoomDisplay(state)
}

function setZoomScale(state, nextScale, { preserveCenter = true } = {}) {
  if (!Number.isFinite(nextScale)) return
  const prevScale = state.zoomScale
  const viewportWidth = state.canvasWrap?.clientWidth || 0
  const viewportHeight = state.canvasWrap?.clientHeight || 0
  const worldCenterX = preserveCenter ? ((viewportWidth / 2) - state.panX) / prevScale : 0
  const worldCenterY = preserveCenter ? ((viewportHeight / 2) - state.panY) / prevScale : 0

  state.zoomScale = Math.max(0.1, Math.min(8, nextScale))

  if (preserveCenter && viewportWidth > 0 && viewportHeight > 0) {
    state.panX = (viewportWidth / 2) - (worldCenterX * state.zoomScale)
    state.panY = (viewportHeight / 2) - (worldCenterY * state.zoomScale)
  }

  applyCanvasZoom(state)
}

function zoomByStep(state, delta) {
  const next = Math.round((state.zoomScale + delta) * 100) / 100
  setZoomScale(state, next)
}

function snapZoomToCanvas(state) {
  if (!state.canvasWrap || !state.canvas || !state.image) return
  const fitX = state.canvasWrap.clientWidth / state.canvas.width
  const fitY = state.canvasWrap.clientHeight / state.canvas.height
  const fitScale = Math.min(fitX, fitY)
  setZoomScale(state, fitScale, { preserveCenter: false })
}

function applyCurrentTagToAllTiles(state) {
  if (!state.activeData || !state.image || !state.activeTag) return 0
  const tileSize = Math.max(1, state.activeData.tileSize)
  const maxCols = Math.floor(state.image.width / tileSize)
  const maxRows = Math.floor(state.image.height / tileSize)
  let changed = 0

  for (let row = 0; row < maxRows; row++) {
    for (let col = 0; col < maxCols; col++) {
      const tileKey = makeTileKey(col, row)
      const entry = ensureTileRecord(state.activeData, tileKey)
      if (!entry.tags.includes(state.activeTag)) {
        entry.tags.push(state.activeTag)
        changed++
      }
    }
  }

  if (changed > 0) {
    drawSseCanvas(state)
    renderTagList(state)
    saveDataToLocalStorage(state.activeData, state.activeMode)
    if (state.image) {
      if (state.activeMode === 'animated') {
        const metadata = toSerializableAnimationData(state.activeData, state.image)
        state.onAnimationSheetDataChange?.(metadata)
        refreshAnimationPreviewMetrics(state)
        scheduleAnimationPreview(state)
      } else {
        state.onSheetDataChange?.(toSerializableData(state.activeData, state.image))
      }
    }
  }

  return changed
}

function renderTagList(state) {
  const tagList = state.tagList
  if (!tagList) return
  tagList.innerHTML = ''

  const sortedTags = sortTags(state.activeData.tags, state.activeData.tiles, state.activeTag)
  sortedTags.forEach((tag) => {
    const label = document.createElement('label')
    label.className = 'sprite-sheet-editor__tag-option'

    const input = document.createElement('input')
    input.type = 'radio'
    input.name = 'sse-active-tag'
    input.value = tag
    input.checked = state.activeTag === tag
    input.addEventListener('change', () => {
      state.activeTag = tag
      if (state.activeData) {
        state.activeData.activeTag = tag
      }
      renderTagList(state)
      drawSseCanvas(state)
      applyCanvasZoom(state)
      state.previewStartTime = performance.now()
      state.previewPlaying = true
      if (state.previewPlayPauseBtn) state.previewPlayPauseBtn.textContent = 'Pause'
      if (state.activeMode === 'animated' && state.activeData && state.image) {
        refreshAnimationPreviewMetrics(state)
      }
      scheduleAnimationPreview(state)
    })

    const usedCount = Object.values(state.activeData.tiles)
      .filter(entry => Array.isArray(entry.tags) && entry.tags.includes(tag)).length

    const text = document.createElement('span')
    text.textContent = usedCount > 0 ? `${tag} (${usedCount})` : tag

    label.appendChild(input)
    label.appendChild(text)
    tagList.appendChild(label)
  })
}

function setStatus(state, message, kind = 'info') {
  if (!state.statusEl) return
  state.statusEl.textContent = message
  state.statusEl.style.color = kind === 'error' ? '#ff8c8c' : (kind === 'warn' ? '#ffcc66' : '#9fb3c8')
}

function saveDataToLocalStorage(data, mode = 'static') {
  const prefix = mode === 'animated' ? SSE_ANIMATION_METADATA_PREFIX : SSE_METADATA_PREFIX
  const lastKey = mode === 'animated' ? SSE_LAST_ANIMATION_SHEET_KEY : SSE_LAST_SHEET_KEY
  try {
    localStorage.setItem(`${prefix}${data.sheetPath}`, JSON.stringify(data))
    localStorage.setItem(lastKey, data.sheetPath)
  } catch (err) {
    window.logger.warn('Failed to save SSE metadata to localStorage:', err)
  }
}

async function loadMetadataFromSources(sheetPath, mode = 'static') {
  const storagePrefix = mode === 'animated' ? SSE_ANIMATION_METADATA_PREFIX : SSE_METADATA_PREFIX
  const defaultTags = mode === 'animated' ? DEFAULT_ANIMATION_TAGS : DEFAULT_SSE_TAGS
  const local = safeParseJson(localStorage.getItem(`${storagePrefix}${sheetPath}`), null)
  if (local) return normalizeSheetData(local, sheetPath, defaultTags)

  if (mode === 'animated') {
    return normalizeSheetData(null, sheetPath, defaultTags)
  }

  const sidecarPath = buildMetaPath(sheetPath)
  try {
    const res = await fetch(sidecarPath, { cache: 'no-store' })
    if (res.ok) {
      const parsed = await res.json()
      return normalizeSheetData(parsed, sheetPath, defaultTags)
    }
  } catch {
    // Ignore missing sidecar files
  }

  return normalizeSheetData(null, sheetPath, defaultTags)
}

async function loadImage(sheetPath) {
  return await new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = sheetPath.startsWith('/') ? sheetPath : `/${sheetPath}`
  })
}

async function loadSheet(state, sheetPath, { saveCurrent = true } = {}) {
  if (!sheetPath) return

  if (saveCurrent && state.activeData) {
    saveDataToLocalStorage(state.activeData, state.activeMode)
  }

  const loadedData = await loadMetadataFromSources(sheetPath, state.activeMode)
  const image = await loadImage(sheetPath)
  if (!image) {
    setStatus(state, `Failed to load sheet: ${sheetPath}`, 'error')
    return
  }

  state.activeData = loadedData
  state.image = image
  if (!state.activeData.tags.includes(state.activeTag)) {
    state.activeTag = state.activeData.tags[0] || (state.activeMode === 'animated' ? DEFAULT_ANIMATION_TAGS[0] : DEFAULT_SSE_TAGS[0])
  }

  if (state.sheetSelect && state.sheetSelect.value !== sheetPath) {
    state.sheetSelect.value = sheetPath
  }

  if (state.tileSizeInput) {
    state.tileSizeInput.value = state.activeData.tileSize
  }

  if (state.borderWidthInput) {
    state.borderWidthInput.value = state.activeData.borderWidth
  }

  state.activeData.activeTag = state.activeTag
  saveDataToLocalStorage(state.activeData, state.activeMode)
  drawSseCanvas(state)
  snapZoomToCanvas(state)
  renderTagList(state)

  const serialized = toSerializableData(state.activeData, state.image)
  const sourceTile = Math.max(1, serialized.tileSize - (serialized.borderWidth * 2))
  if (state.activeMode === 'static' && sourceTile < 64) {
    setStatus(state, `Warning: source tile ${sourceTile}px requires upscaling to 64px and may reduce quality.`, 'warn')
  } else {
    setStatus(state, `Loaded ${sheetPath}`)
  }

  if (state.activeMode === 'animated') {
    const animationMetadata = toSerializableAnimationData(state.activeData, state.image)
    refreshAnimationPreviewMetrics(state)
    state.previewStartTime = performance.now()
    state.previewPlaying = true
    if (state.previewPlayPauseBtn) {
      state.previewPlayPauseBtn.textContent = 'Pause'
    }
    state.onAnimationSheetDataChange?.(animationMetadata)
  } else {
    state.onSheetDataChange?.(serialized)
  }
  scheduleAnimationPreview(state)
}

function toggleTagOnTile(state, col, row) {
  const data = state.activeData
  if (!data || !state.activeTag) return

  const tileKey = makeTileKey(col, row)
  const entry = ensureTileRecord(data, tileKey)
  const currentIndex = entry.tags.indexOf(state.activeTag)
  if (currentIndex >= 0) {
    entry.tags.splice(currentIndex, 1)
  } else {
    entry.tags.push(state.activeTag)
  }

  if (!entry.tags.length) {
    delete data.tiles[tileKey]
  }
}

function addTag(state, tag) {
  const normalized = `${tag || ''}`.trim().toLowerCase()
  if (!normalized) return false
  if (state.activeData.tags.includes(normalized)) return false
  state.activeData.tags.push(normalized)
  state.activeData.activeTag = normalized
  state.activeTag = normalized
  renderTagList(state)
  drawSseCanvas(state)
  refreshAnimationPreviewMetrics(state)
  scheduleAnimationPreview(state)
  return true
}

function bindCanvasInteractions(state) {
  const canvas = state.canvas
  const canvasWrap = state.canvasWrap
  if (!canvas || !canvasWrap) return

  const stopInertia = () => {
    if (state.inertiaFrame) {
      cancelAnimationFrame(state.inertiaFrame)
      state.inertiaFrame = null
    }
  }

  const startInertia = () => {
    stopInertia()

    const tick = () => {
      state.panX += state.panVelocityX
      state.panY += state.panVelocityY
      state.panVelocityX *= 0.93
      state.panVelocityY *= 0.93
      applyCanvasZoom(state)

      if (Math.abs(state.panVelocityX) < 0.08 && Math.abs(state.panVelocityY) < 0.08) {
        state.inertiaFrame = null
        return
      }
      state.inertiaFrame = requestAnimationFrame(tick)
    }

    state.inertiaFrame = requestAnimationFrame(tick)
  }

  const beginPaint = (event) => {
    if (!state.activeData || !state.image) return
    if (event.button !== 0) return
    const { x, y } = getRelativeEventPos(canvasWrap, event)
    const tile = getTileAtCanvasPos(state, x, y)
    if (!tile) return

    state.dragging = true
    state.dragVisited.clear()
    const key = makeTileKey(tile.col, tile.row)
    state.dragVisited.add(key)
    toggleTagOnTile(state, tile.col, tile.row)
    drawSseCanvas(state)
    renderTagList(state)
    if (state.activeMode === 'animated') {
      refreshAnimationPreviewMetrics(state)
      state.previewStartTime = performance.now()
      scheduleAnimationPreview(state)
    }
  }

  const continuePaint = (event) => {
    if (!state.dragging || !state.activeData || !state.image) return
    if (!(event.buttons & 1)) {
      state.dragging = false
      return
    }

    const { x, y } = getRelativeEventPos(canvasWrap, event)
    const tile = getTileAtCanvasPos(state, x, y)
    if (!tile) return

    const key = makeTileKey(tile.col, tile.row)
    if (state.dragVisited.has(key)) return
    state.dragVisited.add(key)
    toggleTagOnTile(state, tile.col, tile.row)
    drawSseCanvas(state)
    renderTagList(state)
    if (state.activeMode === 'animated') {
      refreshAnimationPreviewMetrics(state)
      state.previewStartTime = performance.now()
      scheduleAnimationPreview(state)
    }
  }

  const endPaint = () => {
    if (!state.dragging) return
    state.dragging = false
    saveDataToLocalStorage(state.activeData, state.activeMode)
  }

  const beginPan = (event) => {
    if (event.button !== 2) return
    event.preventDefault()
    stopInertia()
    state.panning = true
    state.panLastX = event.clientX
    state.panLastY = event.clientY
    state.panLastTime = performance.now()
    state.panVelocityX = 0
    state.panVelocityY = 0
    canvasWrap.classList.add('panning')
  }

  const continuePan = (event) => {
    if (!state.panning) return
    event.preventDefault()

    const now = performance.now()
    const dt = Math.max(1, now - state.panLastTime)
    const dx = event.clientX - state.panLastX
    const dy = event.clientY - state.panLastY

    state.panX += dx
    state.panY += dy
    state.panVelocityX = dx * (16 / dt)
    state.panVelocityY = dy * (16 / dt)
    state.panLastX = event.clientX
    state.panLastY = event.clientY
    state.panLastTime = now

    applyCanvasZoom(state)
  }

  const endPan = () => {
    if (!state.panning) return
    state.panning = false
    canvasWrap.classList.remove('panning')
    startInertia()
  }

  canvas.addEventListener('mousedown', beginPaint)
  canvas.addEventListener('mousemove', continuePaint)
  canvasWrap.addEventListener('mousedown', beginPan)
  canvasWrap.addEventListener('mousemove', continuePan)
  canvasWrap.addEventListener('contextmenu', (event) => event.preventDefault())
  window.addEventListener('mouseup', endPaint)
  window.addEventListener('mouseup', endPan)
}

function openModal(state) {
  if (!state.modal) return
  state.modal.classList.add('config-modal--open')
  state.modal.setAttribute('aria-hidden', 'false')
  document.body.classList.add('config-modal-open')
  drawSseCanvas(state)
  snapZoomToCanvas(state)
  scheduleAnimationPreview(state)
}

function closeModal(state) {
  if (!state.modal) return
  state.modal.classList.remove('config-modal--open')
  state.modal.setAttribute('aria-hidden', 'true')
  document.body.classList.remove('config-modal-open')
  if (state.activeData) {
    saveDataToLocalStorage(state.activeData, state.activeMode)
  }
  if (state.previewFrameHandle) {
    cancelAnimationFrame(state.previewFrameHandle)
    state.previewFrameHandle = null
  }
}

async function loadSheetList(mode = 'static') {
  const listUrl = mode === 'animated' ? SSE_ANIMATIONS_INDEX : SSE_SHEETS_INDEX
  const fallback = mode === 'animated' ? fallbackAnimationSheets : fallbackSheets
  try {
    const response = await fetch(listUrl, { cache: 'no-store' })
    if (response.ok) {
      const data = await response.json()
      if (Array.isArray(data?.sheets) && data.sheets.length) {
        return data.sheets
      }
    }
  } catch {
    // Use fallback
  }
  return fallback
}

function renderSheetOptions(state) {
  if (!state.sheetSelect) return
  state.sheetSelect.innerHTML = ''
  const list = state.activeMode === 'animated' ? state.animationSheetPaths : state.sheetPaths
  list.forEach((sheetPath) => {
    const option = document.createElement('option')
    option.value = sheetPath
    option.textContent = sheetPath.split('/').pop() || sheetPath
    state.sheetSelect.appendChild(option)
  })
}

async function switchEditorMode(state, mode) {
  if (mode !== 'static' && mode !== 'animated') return
  if (state.activeMode === mode) return

  if (state.activeData) {
    saveDataToLocalStorage(state.activeData, state.activeMode)
  }

  state.activeMode = mode
  state.activeTag = mode === 'animated' ? DEFAULT_ANIMATION_TAGS[0] : DEFAULT_SSE_TAGS[0]
  renderSheetOptions(state)

  state.modeTabs.forEach((tab) => {
    const tabMode = tab.getAttribute('data-sse-mode-tab')
    const active = tabMode === mode
    tab.classList.toggle('is-active', active)
    tab.setAttribute('aria-pressed', active ? 'true' : 'false')
  })
  state.modePanels.forEach((panel) => {
    const panelMode = panel.getAttribute('data-sse-mode-panel')
    panel.hidden = panelMode !== mode
  })

  if (state.previewBlock) {
    state.previewBlock.hidden = mode !== 'animated'
  }

  const targetSheet = mode === 'animated'
    ? (state.initialAnimationSheetPath || state.animationSheetPaths[0])
    : (localStorage.getItem(SSE_LAST_SHEET_KEY) || state.sheetPaths[0])

  if (targetSheet) {
    await loadSheet(state, targetSheet, { saveCurrent: false })
  }
  scheduleAnimationPreview(state)
}

function triggerJsonDownload(sheetPath, serialized) {
  const payload = JSON.stringify(serialized, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  const name = sheetPath.split('/').pop() || 'sheet'
  anchor.download = `${name.replace(/\.[^.]+$/, '')}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function getFrameSequenceForTag(data, image, tag) {
  if (!data || !image || !tag) return []
  const columns = Math.floor(image.width / Math.max(1, data.tileSize))
  const sequence = []
  Object.entries(data.tiles || {}).forEach(([tileKey, tileData]) => {
    if (!Array.isArray(tileData?.tags) || !tileData.tags.includes(tag)) return
    const { col, row } = parseTileKey(tileKey)
    sequence.push((row * columns) + col)
  })
  return sequence
    .filter(index => Number.isFinite(index))
    .sort((a, b) => a - b)
}

function refreshAnimationPreviewMetrics(state) {
  if (state.activeMode !== 'animated' || !state.activeData || !state.image) return
  const metadata = toSerializableAnimationData(state.activeData, state.image)
  const frameSequence = metadata.framesByTag?.[state.activeTag] || []
  state.previewDurationMs = Math.max(200, frameSequence.length * 55)
  if (state.previewDurationEl) {
    state.previewDurationEl.textContent = `${(state.previewDurationMs / 1000).toFixed(2)}s (${frameSequence.length} frames)`
  }
}

function updateAnimationPreview(state) {
  const previewCanvas = state.animationPreviewCanvas
  if (!previewCanvas) return
  const ctx = previewCanvas.getContext('2d')
  if (!ctx) return

  const width = previewCanvas.width
  const height = previewCanvas.height
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
  ctx.fillRect(0, 0, width, height)

  if (state.activeMode !== 'animated' || !state.image || !state.activeData || !state.activeTag) {
    return
  }

  const frameSequence = getFrameSequenceForTag(state.activeData, state.image, state.activeTag)
  if (!frameSequence.length) {
    ctx.fillStyle = '#9fb3c8'
    ctx.font = '12px sans-serif'
    ctx.fillText('No tagged frames for selected tag', 10, 20)
    return
  }

  const animation = createSpriteSheetAnimationInstance({
    assetPath: state.activeData.sheetPath,
    x: width / 2,
    y: height / 2,
    startTime: state.previewStartTime,
    duration: state.previewDurationMs,
    loop: state.previewLoop,
    frameSequence
  })
  const texture = getSpriteSheetTexture(animation.assetPath)
  if (!texture || !texture.complete || texture.naturalWidth <= 0 || texture.naturalHeight <= 0) {
    return
  }

  const frameIndex = getAnimationFrameIndex(animation, performance.now())
  const sheetFrame = animation.frameSequence?.[frameIndex] ?? frameIndex
  const sourceTileWidth = texture.naturalWidth / animation.columns
  const sourceTileHeight = texture.naturalHeight / animation.rows
  const column = sheetFrame % animation.columns
  const row = Math.floor(sheetFrame / animation.columns)
  const sourceX = Math.floor(column * sourceTileWidth)
  const sourceY = Math.floor(row * sourceTileHeight)
  const drawSize = Math.floor(Math.min(width, height) * 0.7)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.drawImage(
    texture,
    sourceX,
    sourceY,
    Math.floor(sourceTileWidth),
    Math.floor(sourceTileHeight),
    Math.floor((width - drawSize) / 2),
    Math.floor((height - drawSize) / 2),
    drawSize,
    drawSize
  )
  ctx.restore()
}

function scheduleAnimationPreview(state) {
  if (state.previewFrameHandle) {
    cancelAnimationFrame(state.previewFrameHandle)
    state.previewFrameHandle = null
  }

  const tick = () => {
    updateAnimationPreview(state)
    if (state.activeMode === 'animated' && (state.previewLoop || state.previewPlaying)) {
      if (!state.previewLoop && performance.now() - state.previewStartTime > state.previewDurationMs) {
        state.previewPlaying = false
        if (state.previewPlayPauseBtn) state.previewPlayPauseBtn.textContent = 'Play'
      } else {
        state.previewFrameHandle = requestAnimationFrame(tick)
      }
    }
  }

  state.previewFrameHandle = requestAnimationFrame(tick)
}

export async function initSpriteSheetEditor(options = {}) {
  const state = {
    modal: document.getElementById('spriteSheetEditorModal'),
    closeBtn: document.getElementById('spriteSheetEditorCloseBtn'),
    openBtn: document.getElementById('openSpriteSheetEditorBtn'),
    sheetSelect: document.getElementById('sseSheetSelect'),
    tileSizeInput: document.getElementById('sseTileSizeInput'),
    borderWidthInput: document.getElementById('sseBorderWidthInput'),
    newTagInput: document.getElementById('sseNewTagInput'),
    addTagBtn: document.getElementById('sseAddTagBtn'),
    showGridCheckbox: document.getElementById('sseShowGridCheckbox'),
    showLabelsCheckbox: document.getElementById('sseShowLabelsCheckbox'),
    showTaggedOverlayCheckbox: document.getElementById('sseShowTaggedOverlayCheckbox'),
    modeTabs: Array.from(document.querySelectorAll('[data-sse-mode-tab]')),
    modePanels: Array.from(document.querySelectorAll('[data-sse-mode-panel]')),
    previewBlock: document.getElementById('sseAnimationPreviewBlock'),
    animationPreviewCanvas: document.getElementById('sseAnimationPreviewCanvas'),
    previewLoopCheckbox: document.getElementById('ssePreviewLoopCheckbox'),
    previewPlayPauseBtn: document.getElementById('ssePreviewPlayPauseBtn'),
    previewDurationEl: document.getElementById('ssePreviewDurationValue'),
    zoomInBtn: document.getElementById('sseZoomInBtn'),
    zoomOutBtn: document.getElementById('sseZoomOutBtn'),
    zoom100Btn: document.getElementById('sseZoom100Btn'),
    zoomFitBtn: document.getElementById('sseZoomFitBtn'),
    zoomValueEl: document.getElementById('sseZoomValue'),
    applyCurrentTagAllBtn: document.getElementById('sseApplyCurrentTagAllBtn'),
    applyTagsBtn: document.getElementById('sseApplyTagsBtn'),
    tagList: document.getElementById('sseTagList'),
    statusEl: document.getElementById('sseStatus'),
    canvasWrap: document.getElementById('sseCanvasWrap'),
    canvasViewport: document.getElementById('sseCanvasViewport'),
    canvas: document.getElementById('sseTileCanvas'),
    sheetPaths: [],
    animationSheetPaths: [],
    activeData: null,
    image: null,
    activeMode: 'static',
    activeTag: DEFAULT_SSE_TAGS[0],
    zoomScale: 1,
    panX: 0,
    panY: 0,
    panVelocityX: 0,
    panVelocityY: 0,
    panLastX: 0,
    panLastY: 0,
    panLastTime: 0,
    panning: false,
    inertiaFrame: null,
    dragging: false,
    dragVisited: new Set(),
    showGrid: true,
    showLabels: true,
    showTaggedOverlay: true,
    previewPlaying: true,
    previewLoop: false,
    previewDurationMs: 1050,
    previewStartTime: performance.now(),
    previewFrameHandle: null,
    onSheetDataChange: options.onSheetDataChange || null,
    onAnimationSheetDataChange: options.onAnimationSheetDataChange || null
  }

  if (!state.modal || !state.openBtn || !state.canvas) {
    return {
      open: () => {},
      close: () => {},
      getActiveSheetData: () => null,
      getActiveSheetPath: () => null,
      refreshRuntimeSheetData: () => {}
    }
  }

  state.sheetPaths = await loadSheetList('static')
  state.animationSheetPaths = await loadSheetList('animated')
  renderSheetOptions(state)

  const lastSheet = localStorage.getItem(SSE_LAST_SHEET_KEY)
  const lastAnimationSheet = localStorage.getItem(SSE_LAST_ANIMATION_SHEET_KEY)
  const initialSheetPath = options.initialSheetPath && state.sheetPaths.includes(options.initialSheetPath)
    ? options.initialSheetPath
    : (lastSheet && state.sheetPaths.includes(lastSheet) ? lastSheet : state.sheetPaths[0])
  state.initialAnimationSheetPath = lastAnimationSheet && state.animationSheetPaths.includes(lastAnimationSheet)
    ? lastAnimationSheet
    : state.animationSheetPaths[0]

  await loadSheet(state, initialSheetPath, { saveCurrent: false })
  state.modeTabs.forEach((tab) => {
    const mode = tab.getAttribute('data-sse-mode-tab')
    tab.addEventListener('click', async() => {
      await switchEditorMode(state, mode)
    })
    const active = mode === state.activeMode
    tab.classList.toggle('is-active', active)
    tab.setAttribute('aria-pressed', active ? 'true' : 'false')
  })
  state.modePanels.forEach((panel) => {
    panel.hidden = panel.getAttribute('data-sse-mode-panel') !== state.activeMode
  })
  if (state.previewBlock) {
    state.previewBlock.hidden = true
  }

  state.openBtn.addEventListener('click', () => openModal(state))
  state.closeBtn?.addEventListener('click', () => closeModal(state))

  state.modal.addEventListener('click', (event) => {
    if (event.target === state.modal) {
      closeModal(state)
    }
  })

  state.sheetSelect?.addEventListener('change', async(e) => {
    await loadSheet(state, e.target.value)
  })

  state.previewLoopCheckbox?.addEventListener('change', () => {
    state.previewLoop = Boolean(state.previewLoopCheckbox.checked)
    state.previewStartTime = performance.now()
    scheduleAnimationPreview(state)
  })

  state.previewPlayPauseBtn?.addEventListener('click', () => {
    state.previewPlaying = !state.previewPlaying
    state.previewStartTime = performance.now()
    state.previewPlayPauseBtn.textContent = state.previewPlaying ? 'Pause' : 'Play'
    if (state.previewPlaying) {
      scheduleAnimationPreview(state)
    } else {
      updateAnimationPreview(state)
    }
  })

  state.tileSizeInput?.addEventListener('change', () => {
    if (!state.activeData) return
    state.activeData.tileSize = Math.max(8, Number.parseInt(state.tileSizeInput.value, 10) || DEFAULT_TILE_SIZE)
    drawSseCanvas(state)
    applyCanvasZoom(state)
    saveDataToLocalStorage(state.activeData, state.activeMode)
  })

  state.borderWidthInput?.addEventListener('change', () => {
    if (!state.activeData) return
    state.activeData.borderWidth = Math.max(0, Number.parseInt(state.borderWidthInput.value, 10) || DEFAULT_BORDER_WIDTH)
    drawSseCanvas(state)
    applyCanvasZoom(state)
    saveDataToLocalStorage(state.activeData, state.activeMode)
  })

  state.addTagBtn?.addEventListener('click', () => {
    const added = addTag(state, state.newTagInput?.value)
    if (state.newTagInput) {
      state.newTagInput.value = ''
    }
    if (added) {
      saveDataToLocalStorage(state.activeData, state.activeMode)
      setStatus(state, 'Tag added')
    }
  })

  state.newTagInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    state.addTagBtn?.click()
  })

  state.showGridCheckbox?.addEventListener('change', () => {
    state.showGrid = Boolean(state.showGridCheckbox.checked)
    drawSseCanvas(state)
    applyCanvasZoom(state)
  })

  state.showLabelsCheckbox?.addEventListener('change', () => {
    state.showLabels = Boolean(state.showLabelsCheckbox.checked)
    drawSseCanvas(state)
    applyCanvasZoom(state)
  })

  state.showTaggedOverlayCheckbox?.addEventListener('change', () => {
    state.showTaggedOverlay = Boolean(state.showTaggedOverlayCheckbox.checked)
    drawSseCanvas(state)
    applyCanvasZoom(state)
  })

  state.zoomInBtn?.addEventListener('click', () => {
    zoomByStep(state, 0.1)
  })

  state.zoomOutBtn?.addEventListener('click', () => {
    zoomByStep(state, -0.1)
  })

  state.zoom100Btn?.addEventListener('click', () => {
    setZoomScale(state, 1)
  })

  state.zoomFitBtn?.addEventListener('click', () => {
    snapZoomToCanvas(state)
  })

  state.applyCurrentTagAllBtn?.addEventListener('click', () => {
    const changed = applyCurrentTagToAllTiles(state)
    if (changed > 0) {
      setStatus(state, `Applied tag "${state.activeTag}" to ${changed} tiles.`)
    } else {
      setStatus(state, `All tiles already contain tag "${state.activeTag}".`)
    }
  })

  updateZoomDisplay(state)

  state.applyTagsBtn?.addEventListener('click', async() => {
    if (!state.activeData || !state.image) return
    saveDataToLocalStorage(state.activeData, state.activeMode)
    if (state.activeMode === 'animated') {
      const serializedAnimation = toSerializableAnimationData(state.activeData, state.image)
      await Promise.resolve(options.onApplyAnimation?.(serializedAnimation))
      triggerJsonDownload(state.activeData.sheetPath, serializedAnimation)
      setStatus(state, `Applied animation tags for "${state.activeTag}".`)
    } else {
      const serialized = toSerializableData(state.activeData, state.image)
      const sourceTile = Math.max(1, serialized.tileSize - (serialized.borderWidth * 2))

      await Promise.resolve(options.onApply?.(serialized))
      triggerJsonDownload(state.activeData.sheetPath, serialized)

      if (sourceTile < 64) {
        setStatus(state, `Applied tags. Warning: source tile ${sourceTile}px upscales to 64px.`, 'warn')
      } else {
        setStatus(state, 'Applied tags and downloaded JSON metadata.')
      }
    }
  })

  bindCanvasInteractions(state)

  return {
    open: () => openModal(state),
    close: () => closeModal(state),
    getActiveSheetData: () => {
      if (!state.activeData || !state.image) return null
      return toSerializableData(state.activeData, state.image)
    },
    getActiveSheetPath: () => state.activeData?.sheetPath || null,
    refreshRuntimeSheetData: () => {
      if (!state.activeData || !state.image) return
      const serialized = toSerializableData(state.activeData, state.image)
      options.onApply?.(serialized)
    },
    suggestTileForMap(x, y, tagBuckets) {
      if (!tagBuckets || typeof tagBuckets !== 'object') return null
      const preferredTags = ['passable', 'decorative', 'impassable', 'street', 'intersection', 'concrete', 'grass', 'soil', 'sand', 'snow']
      for (const tag of preferredTags) {
        const list = tagBuckets[tag]
        if (Array.isArray(list) && list.length) {
          const index = hashCoord(x, y) % list.length
          return list[index]
        }
      }
      return null
    }
  }
}
