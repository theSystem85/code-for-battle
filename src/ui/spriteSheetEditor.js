import {
  createSpriteSheetAnimationInstance,
  getAnimationFrameIndex,
  getSpriteSheetTexture,
  normalizeSpriteSheetBlendMode,
  parseSpriteSheetMetadataFromFilename
} from '../rendering/spriteSheetAnimation.js'

const DEFAULT_TILE_SIZE = 64
const DEFAULT_BORDER_WIDTH = 1
const SSE_SHEETS_INDEX = 'images/map/sprite_sheets/index.json'
const SSE_ANIMATION_SHEETS_INDEX = 'images/map/animations/index.json'
const SSE_METADATA_PREFIX = 'rts-sse-metadata:'
const SSE_ANIMATION_METADATA_PREFIX = 'rts-sse-animation-metadata:'
const SSE_LAST_SHEET_KEY = 'rts-sse-last-sheet'
const SSE_LAST_ANIMATION_SHEET_KEY = 'rts-sse-last-animation-sheet'
const SSE_MODE_STORAGE_KEY = 'rts-sse-mode'
const ANIMATION_DEFAULT_DURATION_MS = 1050
const SSE_PREVIEW_BACKGROUND_TILE = 'images/map/land01.webp'
const COMBAT_DECAL_SHEET_PATH = 'images/map/sprite_sheets/debris_craters_tracks.webp'
const COMBAT_DECAL_BLACK_KEY = Object.freeze({
  cutoffBrightness: 8,
  softenBrightness: 24
})

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
  'water',
  'group'
]

export const DEFAULT_SSE_ANIMATION_TAGS = ['explosion']

const fallbackSheets = [
  'images/map/sprite_sheets/grass.webp',
  'images/map/sprite_sheets/soil.webp',
  'images/map/sprite_sheets/snow.webp',
  'images/map/sprite_sheets/desert.webp',
  'images/map/sprite_sheets/water.webp',
  'images/map/sprite_sheets/multiTerrainSpriteSheet.webp',
  'images/map/sprite_sheets/debris_craters_tracks.webp'
]

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

function isTransientSheetPath(sheetPath) {
  return typeof sheetPath === 'string' && (sheetPath.startsWith('blob:') || sheetPath.startsWith('data:') || sheetPath.startsWith('local-upload:'))
}

function formatAspectRatio(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '--'
  }
  const ratio = width / height
  return `${ratio.toFixed(3)}:1`
}

function buildSheetMetadataText(data, image) {
  if (!data || !image) return ''
  const width = Number.isFinite(image.naturalWidth) && image.naturalWidth > 0 ? image.naturalWidth : image.width
  const height = Number.isFinite(image.naturalHeight) && image.naturalHeight > 0 ? image.naturalHeight : image.height
  const columns = Math.floor(width / Math.max(1, data.tileSize))
  const rows = Math.floor(height / Math.max(1, data.rowHeight || data.tileSize))
  const remainderX = width % Math.max(1, data.tileSize)
  const remainderY = height % Math.max(1, data.rowHeight || data.tileSize)
  const lines = [
    `Path: ${data.sheetPath}`,
    `Filename: ${data.sheetPath.split('/').pop() || data.sheetPath}`,
    `Image: ${width}x${height}px`,
    `Aspect ratio: ${formatAspectRatio(width, height)}`,
    `Decoded: ${image.complete ? 'yes' : 'no'}`,
    `Grid columns: ${columns}`,
    `Grid rows: ${rows}`,
    `Remainder pixels: ${remainderX}x${remainderY}`,
    `Tile width: ${data.tileSize}px`,
    `Row height: ${data.rowHeight || data.tileSize}px`,
    `Border width: ${data.borderWidth}px`
  ]
  try {
    const filenameMetadata = parseSpriteSheetMetadataFromFilename(data.sheetPath)
    lines.push(
      `Filename metadata: ${filenameMetadata.tileWidth}x${filenameMetadata.tileHeight}px tiles, ${filenameMetadata.columns}x${filenameMetadata.rows} grid, ${filenameMetadata.frameCount} frames`
    )
  } catch {
    lines.push('Filename metadata: not encoded in filename')
  }
  return lines.join('\n')
}

function updateSheetMetadataUi(state) {
  if (!state.sheetMetaRow || !state.sheetResolutionEl || !state.sheetInfoPopover) return
  if (!state.activeData || !state.image) {
    state.sheetMetaRow.hidden = true
    state.sheetResolutionEl.textContent = 'Resolution: --'
    state.sheetInfoPopover.textContent = ''
    return
  }

  const width = Number.isFinite(state.image.naturalWidth) && state.image.naturalWidth > 0 ? state.image.naturalWidth : state.image.width
  const height = Number.isFinite(state.image.naturalHeight) && state.image.naturalHeight > 0 ? state.image.naturalHeight : state.image.height
  state.sheetMetaRow.hidden = false
  state.sheetResolutionEl.textContent = `Resolution: ${width}x${height}px`
  state.sheetInfoPopover.textContent = buildSheetMetadataText(state.activeData, state.image)
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

function normalizeSheetDataForTags(raw, sheetPath, baseTags = DEFAULT_SSE_TAGS) {
  const normalizedTileSize = Number.isFinite(raw?.tileSize) ? Math.max(8, Math.floor(raw.tileSize)) : DEFAULT_TILE_SIZE
  const normalizedRowHeight = Number.isFinite(raw?.rowHeight) ? Math.max(8, Math.floor(raw.rowHeight)) : normalizedTileSize
  const tags = Array.isArray(raw?.tags)
    ? Array.from(new Set([...raw.tags.filter(Boolean), ...baseTags]))
    : [...baseTags]
  const data = {
    schemaVersion: 1,
    sheetPath,
    tileSize: normalizedTileSize,
    rowHeight: normalizedRowHeight,
    borderWidth: Number.isFinite(raw?.borderWidth) ? Math.max(0, Math.floor(raw.borderWidth)) : DEFAULT_BORDER_WIDTH,
    blendMode: normalizeSpriteSheetBlendMode(raw?.blendMode),
    blackKey: normalizeBlackKeyForSheet(sheetPath, raw?.blackKey),
    tags: tags.length ? Array.from(new Set(tags)) : [...baseTags],
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

function getGroupLabelTag(groupId) {
  return `group_${groupId}`
}

function clampGroupId(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.min(999, parsed))
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
  const rows = image ? Math.floor(image.height / Math.max(1, data.rowHeight || data.tileSize)) : 0
  const sourceTileWidth = Math.max(1, data.tileSize - (data.borderWidth * 2))
  const sourceTileHeight = Math.max(1, (data.rowHeight || data.tileSize) - (data.borderWidth * 2))
  const serializedTiles = {}

  Object.entries(data.tiles || {}).forEach(([tileKey, tileData]) => {
    if (!tileData?.tags?.length) return
    const { col, row } = parseTileKey(tileKey)
    const sx = (col * data.tileSize) + data.borderWidth
    const sy = (row * (data.rowHeight || data.tileSize)) + data.borderWidth
    serializedTiles[tileKey] = {
      tags: [...tileData.tags],
      rect: {
        x: sx,
        y: sy,
        width: sourceTileWidth,
        height: sourceTileHeight
      },
      col,
      row
    }
  })

  return {
    schemaVersion: 1,
    sheetPath: data.sheetPath,
    tileSize: data.tileSize,
    rowHeight: data.rowHeight || data.tileSize,
    borderWidth: data.borderWidth,
    blendMode: normalizeSpriteSheetBlendMode(data.blendMode),
    blackKey: data.blackKey,
    tags: data.tags,
    columns,
    rows,
    runtimeNormalization: {
      sourceTileSize: sourceTileWidth,
      targetTileSize: 64,
      scale: sourceTileWidth > 0 ? (64 / sourceTileWidth) : 1,
      requiresUpscale: sourceTileWidth < 64 || sourceTileHeight < 64
    },
    tiles: serializedTiles
  }
}

function getTagFrameSequence(data, image, tag) {
  if (!data || !image || !tag) return []
  const tileSize = Math.max(1, data.tileSize)
  const rowHeight = Math.max(1, data.rowHeight || data.tileSize)
  const sourceTileWidth = Math.max(1, tileSize - (data.borderWidth * 2))
  const sourceTileHeight = Math.max(1, rowHeight - (data.borderWidth * 2))
  const sequence = []

  Object.entries(data.tiles || {}).forEach(([tileKey, tileData]) => {
    if (!tileData?.tags?.includes(tag)) return
    const { col, row } = parseTileKey(tileKey)
    const sx = (col * tileSize) + data.borderWidth
    const sy = (row * rowHeight) + data.borderWidth
    const linearIndex = (row * Math.max(1, Math.floor(image.width / tileSize))) + col
    sequence.push({
      tileKey,
      col,
      row,
      linearIndex,
      rect: {
        x: sx,
        y: sy,
        width: sourceTileWidth,
        height: sourceTileHeight
      }
    })
  })

  sequence.sort((a, b) => a.linearIndex - b.linearIndex)
  return sequence
}

function toAnimationSerializableData(data, image) {
  const columns = image ? Math.floor(image.width / Math.max(1, data.tileSize)) : 0
  const rows = image ? Math.floor(image.height / Math.max(1, data.rowHeight || data.tileSize)) : 0
  const animations = {}
  const tags = Array.isArray(data.tags) ? data.tags : []
  tags.forEach((tag) => {
    const sequence = getTagFrameSequence(data, image, tag)
    if (!sequence.length) return
    animations[tag] = {
      tag,
      frameCount: sequence.length,
      frameIndices: sequence.map(frame => frame.linearIndex),
      frameRects: sequence.map(frame => frame.rect),
      durationMs: ANIMATION_DEFAULT_DURATION_MS
    }
  })

  return {
    schemaVersion: 1,
    mode: 'animated',
    sheetPath: data.sheetPath,
    tileSize: data.tileSize,
    rowHeight: data.rowHeight || data.tileSize,
    borderWidth: data.borderWidth,
    blendMode: normalizeSpriteSheetBlendMode(data.blendMode),
    columns,
    rows,
    tags,
    animations
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
  const rowHeight = Math.max(1, state.activeData.rowHeight || state.activeData.tileSize)
  const unscaledX = (posX - state.panX) / state.zoomScale
  const unscaledY = (posY - state.panY) / state.zoomScale
  const col = Math.floor(unscaledX / tileSize)
  const row = Math.floor(unscaledY / rowHeight)
  const maxCols = Math.floor(state.image.width / tileSize)
  const maxRows = Math.floor(state.image.height / rowHeight)

  if (col < 0 || row < 0 || col >= maxCols || row >= maxRows) {
    return null
  }

  return { col, row }
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
  const rowHeight = Math.max(1, data.rowHeight || data.tileSize)
  canvas.width = image.width
  canvas.height = image.height
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(image, 0, 0)

  const isAnimatedMode = state.mode === 'animated'

  if (state.showTaggedOverlay) {
    const tagSequencesByTag = {}
    if (isAnimatedMode) {
      data.tags.forEach((tag) => {
        const map = {}
        getTagFrameSequence(data, image, tag).forEach((frame, index) => {
          map[frame.tileKey] = index + 1
        })
        tagSequencesByTag[tag] = map
      })
    }

    Object.entries(data.tiles).forEach(([tileKey, tileData]) => {
      if (!tileData?.tags?.length) return
      const { col, row } = parseTileKey(tileKey)
      const x = col * tileSize
      const y = row * rowHeight
      const isGroupTile = Array.isArray(tileData.tags) && tileData.tags.some(tag => /^group_\d+$/.test(tag))
      const isActiveTagTile = state.activeTag === 'group'
        ? isGroupTile
        : (state.activeTag && tileData.tags.includes(state.activeTag))

      if (isActiveTagTile) {
        ctx.fillStyle = state.activeTag === 'group' ? 'rgba(255, 221, 0, 0.38)' : 'rgba(255, 0, 0, 0.33)'
        ctx.fillRect(x, y, tileSize, rowHeight)
      }

      if (state.showLabels) {
        if (isAnimatedMode) {
          const tileTagSequences = (tileData.tags || [])
            .map(tag => ({ tag, sequence: tagSequencesByTag[tag]?.[tileKey] }))
            .filter(entry => Number.isFinite(entry.sequence))
          tileTagSequences.forEach((entry, idx) => {
            const frameLabel = `${entry.sequence}`
            const labelX = x + 2
            const labelY = y + rowHeight - 2 - (idx * 11)
            ctx.font = '10px sans-serif'
            ctx.textAlign = 'left'
            ctx.textBaseline = 'bottom'
            const labelWidth = Math.max(14, frameLabel.length * 6 + 6)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
            ctx.fillRect(labelX - 1, labelY - 11, labelWidth, 11)
            ctx.fillStyle = '#ffffff'
            ctx.fillText(frameLabel, labelX + 1, labelY - 1)
          })
        }

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
      }
    })
  }

  if (state.showGrid) {
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.85)'
    const gridBorderWidth = Math.max(0, Number.isFinite(data.borderWidth) ? data.borderWidth : DEFAULT_BORDER_WIDTH)
    ctx.lineWidth = Math.max(1, gridBorderWidth)
    if (gridBorderWidth === 0) {
      ctx.setLineDash([10, 6])
    } else {
      ctx.setLineDash([])
    }
    const cols = Math.floor(image.width / tileSize)
    const rows = Math.floor(image.height / rowHeight)
    const halfLine = ctx.lineWidth / 2

    for (let col = 0; col <= cols; col++) {
      const x = (col * tileSize) + halfLine
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, rows * rowHeight)
      ctx.stroke()
    }

    for (let row = 0; row <= rows; row++) {
      const y = (row * rowHeight) + halfLine
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(cols * tileSize, y)
      ctx.stroke()
    }
    ctx.setLineDash([])
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

function getTileGridBounds(state) {
  if (!state.activeData || !state.image) {
    return { maxCols: 0, maxRows: 0, totalTiles: 0 }
  }
  const tileSize = Math.max(1, state.activeData.tileSize)
  const rowHeight = Math.max(1, state.activeData.rowHeight || state.activeData.tileSize)
  const maxCols = Math.floor(state.image.width / tileSize)
  const maxRows = Math.floor(state.image.height / rowHeight)
  return {
    maxCols,
    maxRows,
    totalTiles: maxCols * maxRows
  }
}

function countTilesWithActiveTag(state) {
  if (!state.activeData || !state.image || !state.activeTag) return 0
  const { maxCols, maxRows } = getTileGridBounds(state)
  let tagged = 0
  for (let row = 0; row < maxRows; row++) {
    for (let col = 0; col < maxCols; col++) {
      const entry = state.activeData.tiles?.[makeTileKey(col, row)]
      if (entry?.tags?.includes(state.activeTag)) {
        tagged++
      }
    }
  }
  return tagged
}

function updateApplyAllButtonLabel(state) {
  if (!state.applyCurrentTagAllBtn || !state.activeTag || !state.image || !state.activeData) return
  const { totalTiles } = getTileGridBounds(state)
  const taggedTiles = countTilesWithActiveTag(state)
  const shouldRemove = totalTiles > 0 && taggedTiles === totalTiles
  state.applyCurrentTagAllBtn.textContent = shouldRemove
    ? `Remove "${state.activeTag}" from all tiles`
    : `Apply "${state.activeTag}" to all tiles`
  state.applyCurrentTagAllBtn.dataset.mode = shouldRemove ? 'remove' : 'apply'
}

function toggleCurrentTagOnAllTiles(state) {
  if (!state.activeData || !state.image || !state.activeTag) return { changed: 0, mode: 'none' }
  const { maxCols, maxRows, totalTiles } = getTileGridBounds(state)
  const shouldRemove = totalTiles > 0 && countTilesWithActiveTag(state) === totalTiles
  let changed = 0

  for (let row = 0; row < maxRows; row++) {
    for (let col = 0; col < maxCols; col++) {
      const tileKey = makeTileKey(col, row)
      const entry = ensureTileRecord(state.activeData, tileKey)
      const tagIndex = entry.tags.indexOf(state.activeTag)
      if (shouldRemove && tagIndex >= 0) {
        entry.tags.splice(tagIndex, 1)
        if (!entry.tags.length) {
          delete state.activeData.tiles[tileKey]
        }
        changed++
      } else if (!shouldRemove && tagIndex < 0) {
        entry.tags.push(state.activeTag)
        changed++
      }
    }
  }

  if (changed > 0) {
    drawSseCanvas(state)
    renderTagList(state)
    saveDataToLocalStorage(state.activeData, state.mode)
    refreshAnimationPreview(state)
    if (state.image) {
      if (state.mode === 'animated') {
        state.onAnimationSheetDataChange?.(toAnimationSerializableData(state.activeData, state.image))
      } else {
        state.onSheetDataChange?.(toSerializableData(state.activeData, state.image))
      }
    }
  }

  updateApplyAllButtonLabel(state)
  return {
    changed,
    mode: shouldRemove ? 'removed' : 'applied'
  }
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
      state.previewStartTime = performance.now()
      state.previewPlaying = true
      if (state.previewPlayPauseBtn) {
        state.previewPlayPauseBtn.textContent = 'Pause'
      }
      renderTagList(state)
      drawSseCanvas(state)
      applyCanvasZoom(state)
      refreshAnimationPreview(state)
      startAnimationPreviewLoop(state)
      updateApplyAllButtonLabel(state)
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

function updateModeTabUi(state) {
  const isAnimated = state.mode === 'animated'
  state.modeStaticBtn?.classList.toggle('is-active', !isAnimated)
  state.modeAnimatedBtn?.classList.toggle('is-active', isAnimated)
  state.modeStaticBtn?.setAttribute('aria-selected', isAnimated ? 'false' : 'true')
  state.modeAnimatedBtn?.setAttribute('aria-selected', isAnimated ? 'true' : 'false')
  if (state.animationPreviewPanel) {
    state.animationPreviewPanel.hidden = !isAnimated
    state.animationPreviewPanel.style.display = isAnimated ? 'flex' : 'none'
  }
  if (!isAnimated && state.previewFrameHandle) {
    cancelAnimationFrame(state.previewFrameHandle)
    state.previewFrameHandle = null
  }
  if (!isAnimated && state.animationPreviewCanvas) {
    const ctx = state.animationPreviewCanvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, state.animationPreviewCanvas.width, state.animationPreviewCanvas.height)
    }
  }
}

function getActiveDefaultTags(state) {
  return state.mode === 'animated' ? DEFAULT_SSE_ANIMATION_TAGS : DEFAULT_SSE_TAGS
}

function refreshAnimationPreview(state) {
  if (state.mode !== 'animated' || !state.isModalOpen || state.animationPreviewPanel?.hidden) return
  if (!state.animationPreviewCanvas || !state.activeData || !state.image || !state.activeTag) return
  const ctx = state.animationPreviewCanvas.getContext('2d')
  if (!ctx) return
  const sequence = getTagFrameSequence(state.activeData, state.image, state.activeTag)
  const frameCount = sequence.length
  const durationMs = ANIMATION_DEFAULT_DURATION_MS
  state.previewDurationEl.textContent = `Duration: ${durationMs}ms (${frameCount} frames)`
  ctx.clearRect(0, 0, state.animationPreviewCanvas.width, state.animationPreviewCanvas.height)
  if (state.previewBackgroundEnabled) {
    const backgroundImage = state.previewBackgroundImage
    const backgroundReady = Boolean(backgroundImage && backgroundImage.complete && backgroundImage.naturalWidth > 0 && backgroundImage.naturalHeight > 0)
    if (backgroundReady) {
      if (!state.previewBackgroundPattern) {
        state.previewBackgroundPattern = ctx.createPattern(backgroundImage, 'repeat')
      }
      if (state.previewBackgroundPattern) {
        ctx.fillStyle = state.previewBackgroundPattern
        ctx.fillRect(0, 0, state.animationPreviewCanvas.width, state.animationPreviewCanvas.height)
      }
    } else {
      ctx.fillStyle = '#31572a'
      ctx.fillRect(0, 0, state.animationPreviewCanvas.width, state.animationPreviewCanvas.height)
    }
  }
  if (!frameCount) {
    ctx.fillStyle = '#999'
    ctx.font = '12px sans-serif'
    ctx.fillText('No frames tagged', 10, 20)
    return
  }

  const animation = createSpriteSheetAnimationInstance({
    assetPath: state.activeData.sheetPath,
    x: state.animationPreviewCanvas.width / 2,
    y: state.animationPreviewCanvas.height / 2,
    startTime: state.previewStartTime,
    duration: durationMs,
    loop: Boolean(state.previewLoop),
    scale: 2,
    frameSequence: sequence.map(frame => frame.linearIndex),
    frameRects: sequence.map(frame => frame.rect),
    blendMode: state.activeData.blendMode
  })
  const elapsed = Math.max(0, performance.now() - state.previewStartTime)
  if (!state.previewLoop && elapsed >= durationMs) {
    state.previewPlaying = false
    if (state.previewPlayPauseBtn) {
      state.previewPlayPauseBtn.textContent = 'Play'
    }
  }

  const texture = getSpriteSheetTexture(animation.assetPath, state.activeData.blendMode)
  const textureReady = Boolean(
    texture &&
    (
      (typeof window !== 'undefined' && typeof window.HTMLCanvasElement !== 'undefined' && texture instanceof window.HTMLCanvasElement && texture.width > 0 && texture.height > 0) ||
      (texture.complete && texture.naturalWidth > 0 && texture.naturalHeight > 0)
    )
  )
  if (!textureReady) return
  const sequenceIndex = getAnimationFrameIndex(animation, performance.now())
  const sourceRect = animation.frameRects[sequenceIndex]
  if (!sourceRect) return
  const drawWidth = 64
  const drawHeight = drawWidth * (sourceRect.height / sourceRect.width)
  const previousSmoothing = ctx.imageSmoothingEnabled
  const previousOperation = ctx.globalCompositeOperation
  ctx.globalCompositeOperation = state.activeData.blendMode === 'alpha' ? 'source-over' : 'lighter'
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    texture,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    (state.animationPreviewCanvas.width / 2) - (drawWidth / 2),
    (state.animationPreviewCanvas.height / 2) - (drawHeight / 2),
    drawWidth,
    drawHeight
  )
  ctx.imageSmoothingEnabled = previousSmoothing
  ctx.globalCompositeOperation = previousOperation
}

function startAnimationPreviewLoop(state) {
  if (!state.isModalOpen || state.mode !== 'animated') {
    if (state.previewFrameHandle) {
      cancelAnimationFrame(state.previewFrameHandle)
      state.previewFrameHandle = null
    }
    return
  }
  if (state.previewFrameHandle) {
    cancelAnimationFrame(state.previewFrameHandle)
  }
  const tick = () => {
    refreshAnimationPreview(state)
    if (state.previewPlaying && state.mode === 'animated' && state.isModalOpen && !state.animationPreviewPanel?.hidden) {
      state.previewFrameHandle = requestAnimationFrame(tick)
    } else {
      state.previewFrameHandle = null
    }
  }
  state.previewFrameHandle = requestAnimationFrame(tick)
}

function saveDataToLocalStorage(data, mode = 'static') {
  if (!data?.sheetPath || isTransientSheetPath(data.sheetPath)) {
    return
  }
  try {
    const prefix = mode === 'animated' ? SSE_ANIMATION_METADATA_PREFIX : SSE_METADATA_PREFIX
    const key = mode === 'animated' ? SSE_LAST_ANIMATION_SHEET_KEY : SSE_LAST_SHEET_KEY
    localStorage.setItem(`${prefix}${data.sheetPath}`, JSON.stringify(data))
    localStorage.setItem(key, data.sheetPath)
  } catch (err) {
    window.logger.warn('Failed to save SSE metadata to localStorage:', err)
  }
}

async function loadMetadataFromSourcesForMode(sheetPath, mode = 'static') {
  if (isTransientSheetPath(sheetPath)) {
    return normalizeSheetDataForTags(null, sheetPath, mode === 'animated' ? DEFAULT_SSE_ANIMATION_TAGS : DEFAULT_SSE_TAGS)
  }
  const metadataPrefix = mode === 'animated' ? SSE_ANIMATION_METADATA_PREFIX : SSE_METADATA_PREFIX
  const baseTags = mode === 'animated' ? DEFAULT_SSE_ANIMATION_TAGS : DEFAULT_SSE_TAGS
  const local = safeParseJson(localStorage.getItem(`${metadataPrefix}${sheetPath}`), null)
  if (local) return normalizeSheetDataForTags(local, sheetPath, baseTags)

  const sidecarPath = buildMetaPath(sheetPath)
  try {
    const res = await fetch(sidecarPath, { cache: 'no-store' })
    if (res.ok) {
      const parsed = await res.json()
      return normalizeSheetDataForTags(parsed, sheetPath, baseTags)
    }
  } catch {
    // Ignore missing sidecar files
  }

  return normalizeSheetDataForTags(null, sheetPath, baseTags)
}

async function loadImage(sheetPath) {
  return await new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    if (sheetPath.startsWith('/') || sheetPath.startsWith('blob:') || sheetPath.startsWith('data:') || /^https?:\/\//i.test(sheetPath)) {
      img.src = sheetPath
    } else {
      img.src = `/${sheetPath}`
    }
  })
}

async function loadSheet(state, sheetPath, { saveCurrent = true, mode = 'static' } = {}) {
  if (!sheetPath) return

  if (saveCurrent && state.activeData) {
    saveDataToLocalStorage(state.activeData, state.mode)
  }

  const loadedData = await loadMetadataFromSourcesForMode(sheetPath, mode)
  const image = await loadImage(sheetPath)
  if (!image) {
    setStatus(state, `Failed to load sheet: ${sheetPath}`, 'error')
    return
  }

  state.activeData = loadedData
  state.image = image
  if (!state.activeData.tags.includes(state.activeTag)) {
    state.activeTag = state.activeData.tags[0] || getActiveDefaultTags(state)[0]
  }

  if (state.sheetSelect && state.sheetSelect.value !== sheetPath) {
    state.sheetSelect.value = sheetPath
  }

  if (state.tileSizeInput) {
    state.tileSizeInput.value = state.activeData.tileSize
  }

  if (state.rowHeightInput) {
    state.rowHeightInput.value = state.activeData.rowHeight || state.activeData.tileSize
  }

  if (state.borderWidthInput) {
    state.borderWidthInput.value = state.activeData.borderWidth
  }

  if (state.blendModeSelect) {
    state.blendModeSelect.value = normalizeSpriteSheetBlendMode(state.activeData.blendMode)
  }

  updateSheetMetadataUi(state)
  saveDataToLocalStorage(state.activeData, state.mode)
  drawSseCanvas(state)
  snapZoomToCanvas(state)
  renderTagList(state)
  updateApplyAllButtonLabel(state)

  if (state.mode === 'animated') {
    const animated = toAnimationSerializableData(state.activeData, state.image)
    const activeFrames = getTagFrameSequence(state.activeData, state.image, state.activeTag).length
    setStatus(state, `Loaded ${sheetPath} (${activeFrames} "${state.activeTag}" frames).`)
    state.onAnimationSheetDataChange?.(animated)
  } else {
    const serialized = toSerializableData(state.activeData, state.image)
    const sourceTileWidth = Math.max(1, serialized.tileSize - (serialized.borderWidth * 2))
    const sourceTileHeight = Math.max(1, (serialized.rowHeight || serialized.tileSize) - (serialized.borderWidth * 2))
    if (sourceTileWidth < 64 || sourceTileHeight < 64) {
      setStatus(state, `Warning: source tile ${sourceTileWidth}x${sourceTileHeight}px requires upscaling to 64px and may reduce quality.`, 'warn')
    } else {
      setStatus(state, `Loaded ${sheetPath}`)
    }
    state.onSheetDataChange?.(serialized)
  }
  refreshAnimationPreview(state)
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

function applyGroupTagToTile(state, col, row, groupId) {
  const data = state.activeData
  if (!data) return
  const tileKey = makeTileKey(col, row)
  const entry = ensureTileRecord(data, tileKey)
  const groupLabel = getGroupLabelTag(groupId)
  const nextTags = (entry.tags || []).filter(tag => tag !== 'group' && !/^group_\d+$/.test(tag))
  nextTags.push(groupLabel)
  entry.tags = Array.from(new Set(nextTags))
}

function removeGroupTagsFromTile(state, col, row) {
  const data = state.activeData
  if (!data) return false
  const tileKey = makeTileKey(col, row)
  const entry = data.tiles?.[tileKey]
  if (!entry?.tags?.length) return false
  const groupTag = entry.tags.find(tag => /^group_\d+$/.test(tag))
  if (!groupTag) return false

  let changed = false
  Object.entries(data.tiles || {}).forEach(([key, value]) => {
    if (!value?.tags?.includes(groupTag)) return
    const next = value.tags.filter(tag => tag !== 'group' && !/^group_\d+$/.test(tag))
    if (next.length !== value.tags.length) {
      changed = true
      if (next.length) {
        value.tags = next
      } else {
        delete data.tiles[key]
      }
    }
  })
  return changed
}

function applyGroupedRectangle(state) {
  if (!state.groupDragBounds || !state.activeData) return 0
  const { minCol, maxCol, minRow, maxRow } = state.groupDragBounds
  const groupId = clampGroupId(state.groupIdInput?.value || state.currentGroupId)
  let changed = 0
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      applyGroupTagToTile(state, col, row, groupId)
      changed++
    }
  }
  state.currentGroupId = groupId
  return changed
}

function addTag(state, tag) {
  const normalized = `${tag || ''}`.trim().toLowerCase()
  if (!normalized) return false
  if (state.activeData.tags.includes(normalized)) return false
  state.activeData.tags.push(normalized)
  state.activeTag = normalized
  renderTagList(state)
  drawSseCanvas(state)
  refreshAnimationPreview(state)
  updateApplyAllButtonLabel(state)
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
    const isGroupMode = state.activeTag === 'group'
    state.dragMode = isGroupMode ? 'group' : 'tag'
    if (isGroupMode) {
      const key = makeTileKey(tile.col, tile.row)
      const existing = state.activeData.tiles?.[key]
      state.groupStartHadGroupTag = Boolean(existing?.tags?.some(tag => /^group_\d+$/.test(tag)))
      state.groupDragStartTile = { col: tile.col, row: tile.row }
      state.groupDragBounds = {
        minCol: tile.col,
        maxCol: tile.col,
        minRow: tile.row,
        maxRow: tile.row
      }
    } else {
      const key = makeTileKey(tile.col, tile.row)
      state.dragVisited.add(key)
      toggleTagOnTile(state, tile.col, tile.row)
    }
    drawSseCanvas(state)
    renderTagList(state)
    refreshAnimationPreview(state)
    updateApplyAllButtonLabel(state)
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

    if (state.dragMode === 'group') {
      const bounds = state.groupDragBounds
      if (!bounds) return
      bounds.minCol = Math.min(bounds.minCol, tile.col)
      bounds.maxCol = Math.max(bounds.maxCol, tile.col)
      bounds.minRow = Math.min(bounds.minRow, tile.row)
      bounds.maxRow = Math.max(bounds.maxRow, tile.row)
      const width = bounds.maxCol - bounds.minCol + 1
      const height = bounds.maxRow - bounds.minRow + 1
      if ((width * height) >= 2) {
        applyGroupedRectangle(state)
      }
    } else {
      const key = makeTileKey(tile.col, tile.row)
      if (state.dragVisited.has(key)) return
      state.dragVisited.add(key)
      toggleTagOnTile(state, tile.col, tile.row)
    }
    drawSseCanvas(state)
    renderTagList(state)
    refreshAnimationPreview(state)
    updateApplyAllButtonLabel(state)
  }

  const endPaint = () => {
    if (!state.dragging) return
    if (state.dragMode === 'group' && state.groupIdInput) {
      const bounds = state.groupDragBounds
      const width = bounds ? (bounds.maxCol - bounds.minCol + 1) : 0
      const height = bounds ? (bounds.maxRow - bounds.minRow + 1) : 0
      const groupedTileCount = width * height
      if (groupedTileCount >= 2) {
        const nextGroupId = Math.min(999, clampGroupId(state.groupIdInput.value) + 1)
        state.groupIdInput.value = `${nextGroupId}`
        state.currentGroupId = nextGroupId
      } else if (state.groupStartHadGroupTag && state.groupDragStartTile) {
        removeGroupTagsFromTile(state, state.groupDragStartTile.col, state.groupDragStartTile.row)
      }
      drawSseCanvas(state)
      renderTagList(state)
      refreshAnimationPreview(state)
      updateApplyAllButtonLabel(state)
    }
    state.dragging = false
    state.dragMode = null
    state.groupDragBounds = null
    state.groupDragStartTile = null
    state.groupStartHadGroupTag = false
    saveDataToLocalStorage(state.activeData, state.mode)
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
  state.isModalOpen = true
  state.modal.classList.add('config-modal--open')
  state.modal.setAttribute('aria-hidden', 'false')
  document.body.classList.add('config-modal-open')
  drawSseCanvas(state)
  snapZoomToCanvas(state)
  if (state.mode === 'animated') {
    refreshAnimationPreview(state)
  }
  if (state.previewPlaying && state.mode === 'animated') {
    startAnimationPreviewLoop(state)
  }
}

function closeModal(state) {
  if (!state.modal) return
  state.isModalOpen = false
  state.modal.classList.remove('config-modal--open')
  state.modal.setAttribute('aria-hidden', 'true')
  document.body.classList.remove('config-modal-open')
  if (state.activeData) {
    saveDataToLocalStorage(state.activeData, state.mode)
  }
  if (state.previewFrameHandle) {
    cancelAnimationFrame(state.previewFrameHandle)
    state.previewFrameHandle = null
  }
}

function ensureSheetPathInMode(state, sheetPath, label, mode) {
  const targetList = mode === 'animated' ? state.animationSheetPaths : state.staticSheetPaths
  if (!targetList.includes(sheetPath)) {
    targetList.unshift(sheetPath)
  }
  state.customSheetLabels[sheetPath] = label
}

async function loadDroppedSheetFile(state, file) {
  if (!file) {
    setStatus(state, 'Drop an image or JSON metadata file into SSE.', 'warn')
    return
  }

  const isJsonFile = file.type === 'application/json' || /\.json$/i.test(file.name || '')
  if (isJsonFile) {
    await loadDroppedTagFile(state, file)
    return
  }

  if (!file.type.startsWith('image/')) {
    setStatus(state, 'Only image or JSON files can be dropped into SSE.', 'warn')
    return
  }

  const objectUrl = URL.createObjectURL(file)
  ensureSheetPathInMode(state, objectUrl, file.name || 'dropped-image', state.mode)
  state.sheetPaths = state.mode === 'animated' ? state.animationSheetPaths : state.staticSheetPaths
  renderSheetOptions(state)
  await loadSheet(state, objectUrl, { mode: state.mode })
  setStatus(state, `Loaded dropped image: ${file.name || 'image'}`)
}

async function readFileAsText(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

function buildTilesFromAnimatedImport(raw, sheetMeta) {
  const tiles = {}
  const tileSize = Math.max(1, Number.isFinite(sheetMeta?.tileSize) ? sheetMeta.tileSize : DEFAULT_TILE_SIZE)
  const rowHeight = Math.max(1, Number.isFinite(sheetMeta?.rowHeight) ? sheetMeta.rowHeight : tileSize)
  const columns = Math.max(1, Number.parseInt(raw?.columns, 10) || 1)

  Object.entries(raw?.animations || {}).forEach(([tag, animation]) => {
    if (!tag) return
    const frameIndices = Array.isArray(animation?.frameIndices) ? animation.frameIndices : []
    frameIndices.forEach((frameIndex) => {
      const parsed = Number.parseInt(frameIndex, 10)
      if (!Number.isFinite(parsed) || parsed < 0) return
      const col = parsed % columns
      const row = Math.floor(parsed / columns)
      const tileKey = makeTileKey(col, row)
      if (!tiles[tileKey]) {
        tiles[tileKey] = { tags: [] }
      }
      if (!tiles[tileKey].tags.includes(tag)) {
        tiles[tileKey].tags.push(tag)
      }
    })
  })

  if (!Object.keys(tiles).length) {
    Object.entries(raw?.animations || {}).forEach(([tag, animation]) => {
      if (!tag) return
      const frameRects = Array.isArray(animation?.frameRects) ? animation.frameRects : []
      frameRects.forEach((rect) => {
        if (!rect || typeof rect !== 'object') return
        const col = Math.floor(((Number(rect.x) || 0) - (sheetMeta?.borderWidth || 0)) / tileSize)
        const row = Math.floor(((Number(rect.y) || 0) - (sheetMeta?.borderWidth || 0)) / rowHeight)
        if (col < 0 || row < 0) return
        const tileKey = makeTileKey(col, row)
        if (!tiles[tileKey]) {
          tiles[tileKey] = { tags: [] }
        }
        if (!tiles[tileKey].tags.includes(tag)) {
          tiles[tileKey].tags.push(tag)
        }
      })
    })
  }

  return tiles
}

function notifyActiveDataChange(state) {
  if (!state.activeData || !state.image) return
  if (state.mode === 'animated') {
    state.onAnimationSheetDataChange?.(toAnimationSerializableData(state.activeData, state.image))
    return
  }
  state.onSheetDataChange?.(toSerializableData(state.activeData, state.image))
}

async function loadDroppedTagFile(state, file) {
  if (!state.activeData || !state.image) {
    setStatus(state, 'Load a sprite sheet first, then drop JSON tag metadata.', 'warn')
    return
  }

  try {
    const rawText = await readFileAsText(file)
    const parsed = safeParseJson(rawText, null)
    if (!parsed || typeof parsed !== 'object') {
      setStatus(state, 'Invalid JSON metadata file.', 'error')
      return
    }

    const sheetPath = state.activeData.sheetPath
    const baseTags = getActiveDefaultTags(state)
    const imported = { ...parsed, sheetPath }
    if (state.mode === 'animated' && (!imported.tiles || typeof imported.tiles !== 'object')) {
      imported.tiles = buildTilesFromAnimatedImport(imported, {
        tileSize: imported.tileSize,
        rowHeight: imported.rowHeight,
        borderWidth: imported.borderWidth
      })
    }

    state.activeData = normalizeSheetDataForTags(imported, sheetPath, baseTags)
    if (!state.activeData.tags.includes(state.activeTag)) {
      state.activeTag = state.activeData.tags[0] || baseTags[0]
    }

    if (state.tileSizeInput) state.tileSizeInput.value = state.activeData.tileSize
    if (state.rowHeightInput) state.rowHeightInput.value = state.activeData.rowHeight || state.activeData.tileSize
    if (state.borderWidthInput) state.borderWidthInput.value = state.activeData.borderWidth
    if (state.blendModeSelect) state.blendModeSelect.value = normalizeSpriteSheetBlendMode(state.activeData.blendMode)

    saveDataToLocalStorage(state.activeData, state.mode)
    drawSseCanvas(state)
    renderTagList(state)
    updateApplyAllButtonLabel(state)
    refreshAnimationPreview(state)
    notifyActiveDataChange(state)
    setStatus(state, `Loaded tag metadata from ${file.name || 'JSON file'}.`)
  } catch {
    setStatus(state, 'Failed to read dropped JSON metadata file.', 'error')
  }
}

function positionSheetInfoPopover(state) {
  if (!state.sheetInfoBtn || !state.sheetInfoPopover) return
  const rect = state.sheetInfoBtn.getBoundingClientRect()
  const gap = 10
  const desiredLeft = rect.right + gap
  const maxLeft = Math.max(8, window.innerWidth - state.sheetInfoPopover.offsetWidth - 8)
  const left = Math.min(desiredLeft, maxLeft)
  const top = Math.max(8, rect.bottom + 6)
  state.sheetInfoPopover.style.left = `${left}px`
  state.sheetInfoPopover.style.top = `${top}px`
}

async function loadSheetList() {
  try {
    const response = await fetch(SSE_SHEETS_INDEX, { cache: 'no-store' })
    if (response.ok) {
      const data = await response.json()
      if (Array.isArray(data?.sheets) && data.sheets.length) {
        return data.sheets
      }
    }
  } catch {
    // Use fallback
  }
  return fallbackSheets
}

async function loadAnimationSheetList() {
  try {
    const response = await fetch(SSE_ANIMATION_SHEETS_INDEX, { cache: 'no-store' })
    if (response.ok) {
      const data = await response.json()
      if (Array.isArray(data?.sheets) && data.sheets.length) {
        return data.sheets
      }
    }
  } catch {
    // fallback below
  }
  return ['images/map/animations/explosion.webp']
}

function renderSheetOptions(state) {
  if (!state.sheetSelect) return
  state.sheetSelect.innerHTML = ''
  state.sheetPaths.forEach((sheetPath) => {
    const option = document.createElement('option')
    option.value = sheetPath
    option.textContent = state.customSheetLabels[sheetPath] || (sheetPath.split('/').pop() || sheetPath)
    state.sheetSelect.appendChild(option)
  })
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

function resolveSheetDisplayLabel(state, sheetPath) {
  const explicit = state.customSheetLabels?.[sheetPath]
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim()
  }
  return sheetPath?.split('/').pop() || sheetPath || ''
}

export async function initSpriteSheetEditor(options = {}) {
  const state = {
    modal: document.getElementById('spriteSheetEditorModal'),
    closeBtn: document.getElementById('spriteSheetEditorCloseBtn'),
    openBtn: document.getElementById('openSpriteSheetEditorBtn'),
    modeStaticBtn: document.getElementById('sseModeStaticBtn'),
    modeAnimatedBtn: document.getElementById('sseModeAnimatedBtn'),
    animationPreviewPanel: document.getElementById('sseAnimationPreviewPanel'),
    animationPreviewCanvas: document.getElementById('sseAnimationPreviewCanvas'),
    previewLoopCheckbox: document.getElementById('ssePreviewLoopCheckbox'),
    previewBackgroundCheckbox: document.getElementById('ssePreviewBackgroundCheckbox'),
    previewPlayPauseBtn: document.getElementById('ssePreviewPlayPauseBtn'),
    previewDurationEl: document.getElementById('ssePreviewDuration'),
    sheetSelect: document.getElementById('sseSheetSelect'),
    sheetMetaRow: document.getElementById('sseSheetMetaRow'),
    sheetResolutionEl: document.getElementById('sseSheetResolution'),
    sheetInfoWrap: document.getElementById('sseSheetInfoWrap'),
    sheetInfoBtn: document.getElementById('sseSheetInfoBtn'),
    sheetInfoPopover: document.getElementById('sseSheetInfoPopover'),
    tileSizeInput: document.getElementById('sseTileSizeInput'),
    rowHeightInput: document.getElementById('sseRowHeightInput'),
    borderWidthInput: document.getElementById('sseBorderWidthInput'),
    blendModeSelect: document.getElementById('sseBlendModeSelect'),
    newTagInput: document.getElementById('sseNewTagInput'),
    addTagBtn: document.getElementById('sseAddTagBtn'),
    groupIdInput: document.getElementById('sseGroupIdInput'),
    showGridCheckbox: document.getElementById('sseShowGridCheckbox'),
    showLabelsCheckbox: document.getElementById('sseShowLabelsCheckbox'),
    showTaggedOverlayCheckbox: document.getElementById('sseShowTaggedOverlayCheckbox'),
    zoomInBtn: document.getElementById('sseZoomInBtn'),
    zoomOutBtn: document.getElementById('sseZoomOutBtn'),
    zoom100Btn: document.getElementById('sseZoom100Btn'),
    zoomFitBtn: document.getElementById('sseZoomFitBtn'),
    zoomValueEl: document.getElementById('sseZoomValue'),
    applyCurrentTagAllBtn: document.getElementById('sseApplyCurrentTagAllBtn'),
    resetAllTagsBtn: document.getElementById('sseResetAllTagsBtn'),
    applyTagsBtn: document.getElementById('sseApplyTagsBtn'),
    tagList: document.getElementById('sseTagList'),
    statusEl: document.getElementById('sseStatus'),
    canvasWrap: document.getElementById('sseCanvasWrap'),
    canvasViewport: document.getElementById('sseCanvasViewport'),
    canvas: document.getElementById('sseTileCanvas'),
    sheetPaths: [],
    customSheetLabels: {},
    staticSheetPaths: [],
    animationSheetPaths: [],
    activeData: null,
    image: null,
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
    dragMode: null,
    groupDragBounds: null,
    groupDragStartTile: null,
    groupStartHadGroupTag: false,
    currentGroupId: 1,
    showGrid: true,
    showLabels: true,
    showTaggedOverlay: true,
    mode: 'static',
    previewLoop: false,
    previewBackgroundEnabled: true,
    previewBackgroundImage: null,
    previewBackgroundPattern: null,
    previewPlaying: true,
    previewStartTime: performance.now(),
    previewFrameHandle: null,
    isModalOpen: false,
    staticModeSnapshot: null,
    animatedModeSnapshot: null,
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

  try {
    const storedMode = localStorage.getItem(SSE_MODE_STORAGE_KEY)
    if (storedMode === 'animated' || storedMode === 'static') {
      state.mode = storedMode
    }
  } catch {
    // ignore
  }

  state.staticSheetPaths = await loadSheetList()
  state.animationSheetPaths = await loadAnimationSheetList()
  state.previewBackgroundImage = new Image()
  state.previewBackgroundImage.onload = () => {
    state.previewBackgroundPattern = null
    if (state.isModalOpen && state.mode === 'animated') {
      refreshAnimationPreview(state)
    }
  }
  state.previewBackgroundImage.src = `/${SSE_PREVIEW_BACKGROUND_TILE}`
  state.sheetPaths = state.mode === 'animated' ? state.animationSheetPaths : state.staticSheetPaths
  renderSheetOptions(state)
  updateModeTabUi(state)

  const lastSheet = localStorage.getItem(SSE_LAST_SHEET_KEY)
  const lastAnimationSheet = localStorage.getItem(SSE_LAST_ANIMATION_SHEET_KEY)
  const initialSheetPath = state.mode === 'animated'
    ? (lastAnimationSheet && state.sheetPaths.includes(lastAnimationSheet) ? lastAnimationSheet : state.sheetPaths[0])
    : (options.initialSheetPath && state.sheetPaths.includes(options.initialSheetPath)
      ? options.initialSheetPath
      : (lastSheet && state.sheetPaths.includes(lastSheet) ? lastSheet : state.sheetPaths[0]))

  await loadSheet(state, initialSheetPath, { saveCurrent: false, mode: state.mode })

  const switchMode = async(nextMode) => {
    if (state.mode === nextMode) return
    if (state.mode === 'static') {
      state.staticModeSnapshot = { sheetPath: state.activeData?.sheetPath, activeTag: state.activeTag }
    } else {
      state.animatedModeSnapshot = { sheetPath: state.activeData?.sheetPath, activeTag: state.activeTag }
    }

    state.mode = nextMode
    state.sheetPaths = nextMode === 'animated' ? state.animationSheetPaths : state.staticSheetPaths
    renderSheetOptions(state)
    updateModeTabUi(state)
    try {
      localStorage.setItem(SSE_MODE_STORAGE_KEY, nextMode)
    } catch {
      // ignore
    }

    const snapshot = nextMode === 'animated' ? state.animatedModeSnapshot : state.staticModeSnapshot
    const selectedPath = snapshot?.sheetPath && state.sheetPaths.includes(snapshot.sheetPath)
      ? snapshot.sheetPath
      : state.sheetPaths[0]
    await loadSheet(state, selectedPath, { saveCurrent: true, mode: nextMode })
    if (snapshot?.activeTag && state.activeData?.tags?.includes(snapshot.activeTag)) {
      state.activeTag = snapshot.activeTag
    }
    renderTagList(state)
    drawSseCanvas(state)
    refreshAnimationPreview(state)
    if (state.previewPlaying && state.isModalOpen) startAnimationPreviewLoop(state)
  }

  state.openBtn.addEventListener('click', () => openModal(state))
  state.closeBtn?.addEventListener('click', () => closeModal(state))

  state.modal.addEventListener('click', (event) => {
    if (event.target === state.modal) {
      closeModal(state)
    }
  })

  state.modeStaticBtn?.addEventListener('click', () => {
    switchMode('static')
  })
  state.modeAnimatedBtn?.addEventListener('click', () => {
    switchMode('animated')
  })

  state.previewLoopCheckbox?.addEventListener('change', () => {
    state.previewLoop = Boolean(state.previewLoopCheckbox.checked)
    state.previewStartTime = performance.now()
    refreshAnimationPreview(state)
  })

  state.previewBackgroundCheckbox?.addEventListener('change', () => {
    state.previewBackgroundEnabled = Boolean(state.previewBackgroundCheckbox.checked)
    refreshAnimationPreview(state)
  })

  state.previewPlayPauseBtn?.addEventListener('click', () => {
    state.previewPlaying = !state.previewPlaying
    state.previewPlayPauseBtn.textContent = state.previewPlaying ? 'Pause' : 'Play'
    if (state.previewPlaying) {
      state.previewStartTime = performance.now()
      startAnimationPreviewLoop(state)
    }
  })

  state.sheetSelect?.addEventListener('change', async(e) => {
    await loadSheet(state, e.target.value, { mode: state.mode })
  })

  state.sheetInfoBtn?.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const isOpen = state.sheetInfoWrap?.classList.toggle('is-open')
    state.sheetInfoBtn?.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
    if (isOpen) {
      positionSheetInfoPopover(state)
    }
  })

  state.sheetInfoWrap?.addEventListener('mouseenter', () => {
    positionSheetInfoPopover(state)
  })

  state.sheetInfoWrap?.addEventListener('focusin', () => {
    positionSheetInfoPopover(state)
  })

  window.addEventListener('resize', () => {
    if (state.sheetInfoWrap?.classList.contains('is-open')) {
      positionSheetInfoPopover(state)
    }
  })

  document.addEventListener('click', (event) => {
    if (!state.sheetInfoWrap || !state.sheetInfoBtn) return
    if (state.sheetInfoWrap.contains(event.target)) return
    state.sheetInfoWrap.classList.remove('is-open')
    state.sheetInfoBtn.setAttribute('aria-expanded', 'false')
  })

  state.canvasWrap?.addEventListener('dragover', (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  })

  state.canvasWrap?.addEventListener('drop', async(event) => {
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0]
    await loadDroppedSheetFile(state, file)
  })

  state.tileSizeInput?.addEventListener('change', () => {
    if (!state.activeData) return
    state.activeData.tileSize = Math.max(8, Number.parseInt(state.tileSizeInput.value, 10) || DEFAULT_TILE_SIZE)
    updateSheetMetadataUi(state)
    drawSseCanvas(state)
    applyCanvasZoom(state)
    saveDataToLocalStorage(state.activeData, state.mode)
  })

  state.rowHeightInput?.addEventListener('change', () => {
    if (!state.activeData) return
    const parsed = Number.parseInt(state.rowHeightInput.value, 10)
    state.activeData.rowHeight = Number.isFinite(parsed) ? Math.max(8, parsed) : state.activeData.tileSize
    updateSheetMetadataUi(state)
    drawSseCanvas(state)
    applyCanvasZoom(state)
    saveDataToLocalStorage(state.activeData, state.mode)
  })

  state.borderWidthInput?.addEventListener('change', () => {
    if (!state.activeData) return
    const parsed = Number.parseInt(state.borderWidthInput.value, 10)
    state.activeData.borderWidth = Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_BORDER_WIDTH
    updateSheetMetadataUi(state)
    drawSseCanvas(state)
    applyCanvasZoom(state)
    saveDataToLocalStorage(state.activeData, state.mode)
  })

  state.blendModeSelect?.addEventListener('change', () => {
    if (!state.activeData) return
    state.activeData.blendMode = normalizeSpriteSheetBlendMode(state.blendModeSelect.value)
    drawSseCanvas(state)
    refreshAnimationPreview(state)
    saveDataToLocalStorage(state.activeData, state.mode)
  })

  state.addTagBtn?.addEventListener('click', () => {
    const added = addTag(state, state.newTagInput?.value)
    if (state.newTagInput) {
      state.newTagInput.value = ''
    }
    if (added) {
      saveDataToLocalStorage(state.activeData, state.mode)
      setStatus(state, 'Tag added')
    }
  })

  state.newTagInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    state.addTagBtn?.click()
  })

  if (state.groupIdInput) {
    state.groupIdInput.value = `${state.currentGroupId}`
    state.groupIdInput.addEventListener('change', () => {
      state.currentGroupId = clampGroupId(state.groupIdInput.value)
      state.groupIdInput.value = `${state.currentGroupId}`
    })
  }

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
    const result = toggleCurrentTagOnAllTiles(state)
    if (result.changed > 0) {
      if (result.mode === 'removed') {
        setStatus(state, `Removed tag "${state.activeTag}" from ${result.changed} tiles.`)
      } else {
        setStatus(state, `Applied tag "${state.activeTag}" to ${result.changed} tiles.`)
      }
    } else {
      setStatus(state, `No tile changes for tag "${state.activeTag}".`)
    }
  })

  state.resetAllTagsBtn?.addEventListener('click', () => {
    if (!state.activeData) return
    state.activeData.tiles = {}
    drawSseCanvas(state)
    renderTagList(state)
    updateApplyAllButtonLabel(state)
    refreshAnimationPreview(state)
    saveDataToLocalStorage(state.activeData, state.mode)
    notifyActiveDataChange(state)
    setStatus(state, 'Reset all tags for the current sprite sheet.')
  })

  updateZoomDisplay(state)

  state.applyTagsBtn?.addEventListener('click', async() => {
    if (!state.activeData || !state.image) return
    saveDataToLocalStorage(state.activeData, state.mode)
    if (state.mode === 'animated') {
      const serializedAnimation = toAnimationSerializableData(state.activeData, state.image)
      serializedAnimation.displayName = resolveSheetDisplayLabel(state, state.activeData.sheetPath)
      await Promise.resolve(options.onApplyAnimation?.(serializedAnimation))
      triggerJsonDownload(state.activeData.sheetPath, serializedAnimation)
      const currentFrames = getTagFrameSequence(state.activeData, state.image, state.activeTag).length
      setStatus(state, `Applied animated tags. ${state.activeTag}: ${currentFrames} frames.`)
    } else {
      const serialized = toSerializableData(state.activeData, state.image)
      serialized.displayName = resolveSheetDisplayLabel(state, state.activeData.sheetPath)
      const sourceTileWidth = Math.max(1, serialized.tileSize - (serialized.borderWidth * 2))
      const sourceTileHeight = Math.max(1, (serialized.rowHeight || serialized.tileSize) - (serialized.borderWidth * 2))

      await Promise.resolve(options.onApply?.(serialized))
      triggerJsonDownload(state.activeData.sheetPath, serialized)

      if (sourceTileWidth < 64 || sourceTileHeight < 64) {
        setStatus(state, `Applied tags. Warning: source tile ${sourceTileWidth}x${sourceTileHeight}px upscales to 64px.`, 'warn')
      } else {
        setStatus(state, 'Applied tags and downloaded JSON metadata.')
      }
    }
  })

  bindCanvasInteractions(state)
  refreshAnimationPreview(state)
  if (state.previewPlaying && state.isModalOpen) {
    startAnimationPreviewLoop(state)
  }

  return {
    open: () => openModal(state),
    close: () => closeModal(state),
    getActiveSheetData: () => {
      if (!state.activeData || !state.image) return null
      return state.mode === 'animated'
        ? toAnimationSerializableData(state.activeData, state.image)
        : toSerializableData(state.activeData, state.image)
    },
    getActiveSheetPath: () => state.activeData?.sheetPath || null,
    refreshRuntimeSheetData: () => {
      if (!state.activeData || !state.image) return
      if (state.mode === 'animated') {
        const serialized = toAnimationSerializableData(state.activeData, state.image)
        serialized.displayName = resolveSheetDisplayLabel(state, state.activeData.sheetPath)
        options.onApplyAnimation?.(serialized)
      } else {
        const serialized = toSerializableData(state.activeData, state.image)
        serialized.displayName = resolveSheetDisplayLabel(state, state.activeData.sheetPath)
        options.onApply?.(serialized)
      }
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
