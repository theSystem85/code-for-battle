import { fitSprite, resetSourceImports, SPRITE_ANCHORS } from './sseFit.js'
import { clearTargetTiles, encodeLosslessWebP, exportMetadata, exportOptions } from './sseExport.js'
import { bindSseSplit, bindSseViewport, bindSseZoomInput } from './sseViewport.js'
import { detectSprites } from './sseDetect.js'
import { isolateComponent } from './sseIsolate.js'
import { compactSprites, findPackingRegion, MAX_SSE_PIXELS, validateGrid } from './ssePack.js'

function canvas(width, height) {
  if (width < 1 || height < 1 || width > 16383 || height > 16383 || width * height > MAX_SSE_PIXELS) throw new Error('Image exceeds the 16 megapixel limit.')
  const result = document.createElement('canvas')
  result.width = width
  result.height = height
  return result
}

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function initSseExtend(state, adapters) {
  const sources = new Map()
  let sourceSequence = 0
  let source = null
  let anchor = 'center'
  let sizeRatio = 1
  let activeTargetPath = null
  const spriteImages = new Map()
  let status = 'Create or select a target, then upload a source.'
  let sequence = 0
  let spriteSequence = 0
  let selectedSpriteId = null
  const targets = new Map()
  const checkSpriteBudget = (width, height) => {
    let pixels = width * height
    for (const { image } of spriteImages.values()) pixels += image.width * image.height
    if (pixels > MAX_SSE_PIXELS * 2) throw new Error('Sprite source budget reached (32 megapixels). Download targets and reload the editor.')
  }
  const checkTargetBudget = (path, pixels) => {
    let total = pixels
    for (const [key, target] of targets) {
      if (key !== path) total += target.image.width * target.image.height
    }
    if ((!targets.has(path) && targets.size >= 8) || total > MAX_SSE_PIXELS * 2) {
      throw new Error('Session target budget reached (8 targets / 32 megapixels). Download targets and reload the editor.')
    }
  }
  const panel = document.createElement('div')
  panel.id = 'sseExtendPanel'
  panel.className = 'sidebar-accordion'
  panel.innerHTML = `<button id="sseExtendToggle" class="action-button sidebar-accordion__toggle" type="button" data-sidebar-accordion-toggle aria-expanded="false" aria-controls="sseExtendContent"><span>Extend sheet / Import sprites</span><span class="sidebar-accordion__icon" data-sidebar-accordion-icon>▼</span></button>
    <div id="sseExtendContent" class="sidebar-accordion__content"><div class="sidebar-accordion__body">
    <p>Target: the main editor canvas. Source: the separate canvas below. Click each source sprite once.</p>
    <label>Name <input id="sseNewName" value="extended-sheet"></label>
    <label>Columns <input id="sseNewColumns" type="number" min="1" value="18"></label>
    <label>Rows <input id="sseNewRows" type="number" min="1" value="18"></label>
    <label>Tile width <input id="sseNewTile" type="number" min="8" value="64"></label>
    <output id="sseNewDimensions"></output>
    <button id="sseCreateBlank" type="button">New sheet</button>
    <button id="sseUseTarget" type="button">Use current sheet as target</button>
    <button id="sseAddSource" type="button">New source image</button><input id="sseSourceFile" type="file" accept="image/*" multiple hidden>
    <label>Anchor <select id="sseAnchor">${SPRITE_ANCHORS.map(value => `<option value="${value}" ${value === 'center' ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
    <label>Source-to-target size ratio <input id="sseSizeRatio" type="number" min="0.05" max="4" step="0.05" value="1"></label>
    <button id="sseExtractAll" type="button">Extract all</button>
    <button id="sseRemoveSprite" type="button">Remove sprite</button>
    <button id="sseCompact" type="button">Compact</button>
    <label>Near-black cutoff <input id="sseCutoff" type="number" min="0" max="255" value="16"></label>
    <label><input id="sseClearMode" type="checkbox"> Select tiles to clear (click, shift-click or drag)</label>
    <button id="sseClearTiles" type="button">Clear tiles</button>
    <p id="sseSelectionStatus" role="status">0 tiles selected</p>
    <details id="sseExportPanel" open><summary>Export</summary>
    <label><input id="sseLossless" type="checkbox" checked> Lossless</label>
    <label class="slider-control-label" for="sseQuality">Quality <output id="sseQualityValue">85%</output></label>
    <input id="sseQuality" class="volume-slider" type="range" min="0" max="100" value="85" disabled>
    <button id="sseDownloadExtended" type="button">Export</button></details>
    <p id="sseExtendStatus" role="status"></p></div></div>`
  panel.querySelectorAll('input:not([type="checkbox"]):not([type="range"]):not([type="file"]), select').forEach(input => {
    const label = input.parentElement
    const text = label.firstChild.textContent.trim()
    const wrapper = document.createElement('div')
    wrapper.className = 'floating-label-input sprite-sheet-editor__floating-input'
    label.replaceWith(wrapper)
    input.classList.add('sidebar-input')
    if (input.tagName === 'INPUT') input.placeholder = ' '
    wrapper.appendChild(input)
    const caption = document.createElement('label')
    caption.htmlFor = input.id
    caption.textContent = text
    wrapper.appendChild(caption)
  })
  state.root.querySelector('aside').appendChild(panel)
  const sourcePane = document.createElement('section')
  sourcePane.id = 'sseSourcePane'
  sourcePane.hidden = true
  panel.addEventListener('toggle', () => { sourcePane.hidden = !panel.open || !source })
  sourcePane.innerHTML = '<p>Sources — click a sprite to import or remove</p><div id="sseSources"></div>'
  state.root.querySelector('.sprite-sheet-editor__workspace').appendChild(sourcePane)
  let sourceCanvas = null
  const sourceStrip = sourcePane.querySelector('#sseSources')
  const drawSource = () => {
    for (const item of sources.values()) {
      const source = item
      const sourceCanvas = item.canvas
      const ctx = sourceCanvas.getContext('2d')
      ctx.putImageData(source.pixels, 0, 0)
      for (const { bbox, pixels } of source.masks.values()) {
        const overlay = new Uint8ClampedArray(pixels.length)
        for (let y = 0; y < bbox.height; y++) {
          for (let x = 0; x < bbox.width; x++) {
            const i = (y * bbox.width + x) * 4
            if (!pixels[i + 3]) continue
            const edge = x === 0 || y === 0 || x === bbox.width - 1 || y === bbox.height - 1
            || !pixels[i - 1] || !pixels[i + 7] || !pixels[i - bbox.width * 4 + 3] || !pixels[i + bbox.width * 4 + 3]
            overlay.set([70, 210, 255, edge ? 230 : 65], i)
          }
        }
        const layer = canvas(bbox.width, bbox.height)
        layer.getContext('2d').putImageData(new window.ImageData(overlay, bbox.width, bbox.height), 0, 0)
        ctx.drawImage(layer, bbox.x, bbox.y)
      }
    }
  }
  const workspace = sourcePane.parentElement
  const setSourceVisible = () => workspace.classList.toggle('sse-has-source', panel.open && Boolean(source))
  panel.addEventListener('toggle', setSourceVisible)
  const setSplitRatio = bindSseSplit(workspace, sourcePane, ratio => {
    window.dispatchEvent(new CustomEvent('sse:split-changed', { detail: { ratio } }))
  })
  const zoomControls = state.zoomValueEl?.parentElement?.parentElement || state.root.querySelector('aside')
  state.zoomScale ??= 1
  state.panX ??= 0
  state.panY ??= 0
  const addZoomInput = (name, id) => {
    const label = document.createElement('label')
    label.textContent = name + ' zoom (%) '
    const input = document.createElement('input')
    input.type = 'number'
    input.id = id
    label.appendChild(input)
    zoomControls.appendChild(label)
    return input
  }
  const targetZoomInput = addZoomInput('Target', 'sseZoomInput')
  const sourceZoomInput = addZoomInput('Source pane', 'sseSourceZoomInput')
  let syncTargetZoom = () => {}
  let syncSourceZoom = () => {}
  let sourceView = { x: 0, y: 0, scale: 1 }
  const applySourceView = view => {
    sourceView = view
    syncSourceZoom()
    sourceStrip.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
    window.dispatchEvent(new CustomEvent('sse:viewport-changed', { detail: { pane: 'source', ...view } }))
  }
  const applyTargetView = view => {
    state.dragging = false
    state.panX = view.x
    state.panY = view.y
    state.zoomScale = view.scale
    syncTargetZoom()
    state.canvasViewport.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
    if (state.zoomValueEl) state.zoomValueEl.textContent = `${Math.round(view.scale * 100)}%`
    window.dispatchEvent(new CustomEvent('sse:viewport-changed', { detail: { pane: 'target', ...view } }))
  }
  state.applyViewport = applyTargetView
  const readTarget = () => ({ x: state.panX, y: state.panY, scale: state.zoomScale })
  syncTargetZoom = bindSseZoomInput(targetZoomInput, state.canvasWrap, readTarget, applyTargetView)
  state.syncZoomInput = syncTargetZoom
  syncSourceZoom = bindSseZoomInput(sourceZoomInput, sourcePane, () => sourceView, applySourceView)
  bindSseViewport(sourcePane, () => sourceView, applySourceView)
  bindSseViewport(state.canvasWrap, () => ({ x: state.panX, y: state.panY, scale: state.zoomScale }), applyTargetView)
  const selectionLayer = document.createElement('div')
  selectionLayer.className = 'sse-tile-selection'
  selectionLayer.setAttribute('aria-hidden', 'true')
  state.canvasViewport.appendChild(selectionLayer)
  const selected = new Map()
  let selecting = false
  let selectionStart = null
  const selectionStatus = () => {
    selectionLayer.replaceChildren()
    if (state.activeData) {
      for (const { col, row } of selected.values()) {
        const marker = document.createElement('span')
        marker.style.cssText = `left:${col * state.activeData.tileSize}px;top:${row * state.activeData.rowHeight}px;width:${state.activeData.tileSize}px;height:${state.activeData.rowHeight}px`
        selectionLayer.appendChild(marker)
      }
    }
    panel.querySelector('#sseSelectionStatus').textContent = `${selected.size} tiles selected`
    state.canvasWrap.classList.toggle('sse-selecting', panel.querySelector('#sseClearMode').checked)
  }
  const setClearMode = enabled => {
    panel.querySelector('#sseClearMode').checked = Boolean(enabled)
    selectionStatus()
    window.dispatchEvent(new CustomEvent('sse:clear-mode-changed', { detail: { enabled: Boolean(enabled) } }))
  }
  const setSelectedCells = (cells, append = false) => {
    const target = currentTarget()
    for (const { col, row } of cells) {
      if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= target.columns || row >= target.rows) throw new Error('Tile outside target grid.')
    }
    if (!append) selected.clear()
    for (const cell of cells) selected.set(`${cell.col},${cell.row}`, cell)
    selectionStatus()
    const tiles = [...selected.values()]
    window.dispatchEvent(new CustomEvent('sse:selection-changed', { detail: { tiles } }))
    return tiles
  }
  const setExportOptions = options => {
    const compression = exportOptions(options)
    panel.querySelector('#sseLossless').checked = compression.lossless
    panel.querySelector('#sseQuality').disabled = compression.lossless
    if (!compression.lossless) panel.querySelector('#sseQuality').value = compression.quality
    panel.querySelector('#sseQualityValue').textContent = `${panel.querySelector('#sseQuality').value}%`
    window.dispatchEvent(new CustomEvent('sse:export-options-changed', { detail: compression }))
    return compression
  }
  const tileAt = event => {
    const rect = state.canvas.getBoundingClientRect()
    return { col: Math.floor((event.clientX - rect.left) / (state.zoomScale * state.activeData.tileSize)), row: Math.floor((event.clientY - rect.top) / (state.zoomScale * state.activeData.rowHeight)) }
  }
  state.canvasWrap.addEventListener('pointerdown', event => {
    if (!panel.querySelector('#sseClearMode').checked || !state.image || event.button !== 0) return
    selectionStart = tileAt(event)
    const target = currentTarget()
    if (selectionStart.col < 0 || selectionStart.row < 0 || selectionStart.col >= target.columns || selectionStart.row >= target.rows) return
    selecting = true
    state.canvasWrap.setPointerCapture(event.pointerId)
    setSelectedCells([selectionStart], event.shiftKey)
  })
  state.canvasWrap.addEventListener('pointermove', event => {
    if (!selecting || !selectionStart || event.pointerType === 'touch') return
    const end = tileAt(event)
    const target = currentTarget()
    const cells = []
    for (let row = Math.max(0, Math.min(end.row, selectionStart.row)); row <= Math.min(target.rows - 1, Math.max(end.row, selectionStart.row)); row++) {
      for (let col = Math.max(0, Math.min(end.col, selectionStart.col)); col <= Math.min(target.columns - 1, Math.max(end.col, selectionStart.col)); col++) cells.push({ col, row })
    }
    setSelectedCells(cells, true)
  })
  state.canvasWrap.addEventListener('pointerup', () => { selecting = false })
  state.canvasWrap.addEventListener('pointercancel', () => { selecting = false })
  for (const type of ['mousedown', 'mousemove', 'touchstart', 'touchmove']) {
    state.canvasWrap.addEventListener(type, event => {
      if (panel.querySelector('#sseClearMode').checked) { event.stopImmediatePropagation(); event.preventDefault() }
    }, { capture: true, passive: false })
  }
  panel.querySelector('#sseClearMode').addEventListener('change', event => setClearMode(event.target.checked))
  const sidebar = state.root.querySelector('aside')
  sidebar.classList.add('expanded-left-sidebar')
  sidebar.querySelectorAll('button').forEach(button => button.classList.add('action-button'))
  sidebar.querySelectorAll('input:not([type="checkbox"]):not([type="range"]), select').forEach(input => input.classList.add('sidebar-input'))
  panel.querySelectorAll('label').forEach(label => label.classList.add('sidebar-field'))
  sidebar.querySelectorAll('input[type="checkbox"]').forEach(input => input.closest('label')?.classList.add('sidebar-check-row'))
  panel.classList.add('sidebar-accordion')
  panel.querySelectorAll('summary').forEach(summary => summary.classList.add('sidebar-section-title', 'sidebar-accordion__toggle'))
  const field = id => panel.querySelector(`#${id}`)
  const emit = (name, detail) => {
    window.dispatchEvent(new CustomEvent(`sse:${name}`, { detail }))
  }
  const report = message => {
    status = message
    field('sseExtendStatus').textContent = message
  }
  const guard = fn => async(...args) => {
    try { return await fn(...args) } catch (error) {
      report(error.message)
      emit('error', { message: error.message })
      throw error
    }
  }
  const currentTarget = () => {
    if (state.mode !== 'static' || !state.activeData || !state.image) throw new Error('Select a static target sheet first.')
    const data = state.activeData
    if (activeTargetPath !== data.sheetPath) {
      activeTargetPath = data.sheetPath
      sources.forEach(resetSourceImports)
      drawSource()
    }
    const columns = Math.floor(state.image.width / data.tileSize)
    const rows = Math.floor(state.image.height / data.rowHeight)
    validateGrid({ ...data, columns, rows })
    let target = targets.get(data.sheetPath)
    if (target && target.data !== data) {
      targets.delete(data.sheetPath)
      target = null
    }
    if (target && (target.tileSize !== data.tileSize || target.rowHeight !== data.rowHeight || target.borderWidth !== data.borderWidth)) {
      throw new Error('Target grid changed. Select the target again to rebuild occupancy.')
    }
    if (target) return target
    if (state.image.width % data.tileSize || state.image.height % data.rowHeight) throw new Error('Target dimensions must be whole grid cells.')
    checkTargetBudget(data.sheetPath, state.image.width * state.image.height)
    const image = canvas(state.image.width, state.image.height)
    const context = image.getContext('2d')
    context.drawImage(state.image, 0, 0)
    const pixels = context.getImageData(0, 0, image.width, image.height)
    const occupied = new Set(data.extension?.occupiedTiles || [])
    for (const key of Object.keys(data.tiles)) occupied.add(key)
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const i = (y * image.width + x) * 4
        if (pixels.data[i + 3] && Math.max(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]) > 16) {
          occupied.add(`${Math.floor(x / data.tileSize)},${Math.floor(y / data.rowHeight)}`)
        }
      }
    }
    const imports = data.extension?.imports || []
    const ids = new Set(imports.map(item => item.id).filter(Boolean))
    const normalizedImports = imports.map(item => {
      if (item.id) return item
      let id
      do { id = `sprite-${++spriteSequence}` } while (ids.has(id))
      ids.add(id)
      return { ...item, id }
    })
    target = { data, image, occupied, imports: normalizedImports, columns, rows, tileSize: data.tileSize, rowHeight: data.rowHeight, borderWidth: data.borderWidth }
    targets.set(data.sheetPath, target)
    state.image = image
    return target
  }
  const sync = target => {
    state.image = target.image
    state.activeData.extension = { occupiedTiles: [...target.occupied], imports: target.imports }
    adapters.refresh()
  }
  const componentOverlaps = ({ bbox, pixels }) => [...source.masks.values()].some(mask => {
    const left = Math.max(bbox.x, mask.bbox.x)
    const top = Math.max(bbox.y, mask.bbox.y)
    const right = Math.min(bbox.x + bbox.width, mask.bbox.x + mask.bbox.width)
    const bottom = Math.min(bbox.y + bbox.height, mask.bbox.y + mask.bbox.height)
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        if (pixels[((y - bbox.y) * bbox.width + x - bbox.x) * 4 + 3]
      && mask.pixels[((y - mask.bbox.y) * mask.bbox.width + x - mask.bbox.x) * 4 + 3]) return true
      }
    }
    return false
  })
  const drawSprite = (target, sprite, image, ratio = sprite.sizeRatio ?? 1) => {
    const width = sprite.tileSpan.columns * target.tileSize
    const height = sprite.tileSpan.rows * target.rowHeight
    const border = sprite.anchor === 'stretch' ? 0 : target.borderWidth
    const fit = fitSprite(image.width * ratio, image.height * ratio,
      width - border * 2, height - border * 2, sprite.anchor || 'center')
    sprite.renderRect = { ...fit, x: fit.x + border, y: fit.y + border }
    const ctx = target.image.getContext('2d')
    const x = sprite.placedAt.column * target.tileSize
    const y = sprite.placedAt.row * target.rowHeight
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, width, height)
    ctx.clip()
    ctx.drawImage(image, x + sprite.renderRect.x, y + sprite.renderRect.y, fit.width, fit.height)
    ctx.restore()
  }
  const editSprite = (id, update) => {
    const target = currentTarget()
    const sprite = target.imports.find(item => item.id === id)
    if (!sprite) throw new Error('Sprite not found.')
    const next = { ...sprite, ...update }
    let image = spriteImages.get(`${target.data.sheetPath}:${id}`)?.image
    if (!image) {
      const rect = sprite.renderRect || { x: target.borderWidth, y: target.borderWidth, width: sprite.bbox.width, height: sprite.bbox.height }
      checkSpriteBudget(Math.ceil(rect.width), Math.ceil(rect.height))
      image = canvas(Math.max(1, Math.ceil(rect.width)), Math.max(1, Math.ceil(rect.height)))
      image.getContext('2d').drawImage(target.image, sprite.placedAt.column * target.tileSize + rect.x,
        sprite.placedAt.row * target.rowHeight + rect.y, rect.width, rect.height, 0, 0, image.width, image.height)
      spriteImages.set(`${target.data.sheetPath}:${id}`, { image, sizeRatio: 1 })
    }
    const tags = new Set(sprite.tags || [])
    for (let y = 0; y < sprite.tileSpan.rows; y++) {
      for (let x = 0; x < sprite.tileSpan.columns; x++) {
        const key = `${sprite.placedAt.column + x},${sprite.placedAt.row + y}`
        for (const tag of target.data.tiles[key]?.tags || []) tags.add(tag)
        delete target.data.tiles[key]
        target.occupied.delete(key)
      }
    }
    const ctx = target.image.getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillRect(sprite.placedAt.column * target.tileSize, sprite.placedAt.row * target.rowHeight,
      sprite.tileSpan.columns * target.tileSize, sprite.tileSpan.rows * target.rowHeight)
    Object.assign(sprite, next, { tags: [...tags] })
    for (let y = 0; y < sprite.tileSpan.rows; y++) {
      for (let x = 0; x < sprite.tileSpan.columns; x++) {
        const key = `${sprite.placedAt.column + x},${sprite.placedAt.row + y}`
        target.occupied.add(key)
        if (tags.size) target.data.tiles[key] = { tags: [...tags] }
      }
    }
    const ratio = update.tileSpan
      ? Math.min(sprite.tileSpan.columns * target.tileSize / image.width, sprite.tileSpan.rows * target.rowHeight / image.height)
      : spriteImages.get(`${target.data.sheetPath}:${id}`).sizeRatio
    spriteImages.get(`${target.data.sheetPath}:${id}`).sizeRatio = ratio
    drawSprite(target, sprite, image, ratio)
    sync(target)
    return sprite
  }
  const placeComponent = (component, target, redraw = true) => {
    const { bbox } = component
    const key = `${bbox.x},${bbox.y},${bbox.width},${bbox.height}`
    if (source.isolated.has(key) || componentOverlaps(component)) throw new Error('This source sprite has already been imported.')
    // Borders are insets within the reserved cells, not extra packing pitch.
    const region = findPackingRegion({ ...target, borderWidth: 0, width: Math.max(1, Math.ceil(bbox.width * sizeRatio)), height: Math.max(1, Math.ceil(bbox.height * sizeRatio)) })
    checkTargetBudget(state.activeData.sheetPath, target.image.width * region.rows * target.rowHeight)
    checkSpriteBudget(bbox.width, bbox.height)
    const crop = canvas(bbox.width, bbox.height)
    crop.getContext('2d').putImageData(new window.ImageData(component.pixels, bbox.width, bbox.height), 0, 0)
    const oldRows = target.rows
    if (region.rows > oldRows) {
      const grown = canvas(target.image.width, region.rows * target.rowHeight)
      const ctx = grown.getContext('2d')
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, grown.width, grown.height)
      ctx.drawImage(target.image, 0, 0)
      target.image = grown
      target.rows = region.rows
    }
    for (let dy = 0; dy < region.spanY; dy++) {
      for (let dx = 0; dx < region.spanX; dx++) target.occupied.add(`${region.x + dx},${region.y + dy}`)
    }
    let id
    do { id = `sprite-${++spriteSequence}` } while (target.imports.some(item => item.id === id))
    const result = { id, sourceId: source.id, ok: true, bbox, anchor, sizeRatio, tileSpan: { columns: region.spanX, rows: region.spanY }, placedAt: { column: region.x, row: region.y } }
    spriteImages.set(`${target.data.sheetPath}:${id}`, { image: crop, sizeRatio })
    drawSprite(target, result, crop)
    source.isolated.add(key)
    source.masks.set(key, { ...component, id: result.id, targetPath: target.data.sheetPath })
    if (redraw) drawSource()
    target.imports.push(result)
    sync(target)
    report(`Packed sprite at column ${region.x}, row ${region.y}. ${target.imports.length} imported.`)
    emit('isolated', result)
    if (target.rows !== oldRows) emit('sheet-grown', { previousRows: oldRows, rows: target.rows })
    emit('packed', result)
    return result
  }
  const api = {
    toggleTag: guard(async({ col, row, tag }) => {
      const target = currentTarget()
      if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= target.columns || row >= target.rows || typeof tag !== 'string' || !tag) throw new Error('Invalid tile or tag.')
      adapters.toggleTag(col, row, tag)
      return api.getState()
    }),
    targetChanged: () => {
      const path = state.activeData?.sheetPath
      if (path === activeTargetPath) return
      activeTargetPath = path
      sources.forEach(resetSourceImports)
      drawSource()
      selected.clear()
      selectedSpriteId = null
      selectionStatus()
      emit('target-changed', { path })
    },
    setAnchor: guard(async value => {
      if (!SPRITE_ANCHORS.includes(value)) throw new Error('Invalid anchor.')
      anchor = value
      field('sseAnchor').value = value
      emit('anchor-changed', { anchor })
      return anchor
    }),
    setSpriteAnchor: guard(async(id, value) => {
      if (!SPRITE_ANCHORS.includes(value)) throw new Error('Invalid anchor.')
      const sprite = editSprite(id, { anchor: value })
      if (selectedSpriteId === id) field('sseAnchor').value = value
      emit('sprite-anchor-changed', { id, anchor: value })
      return sprite
    }),
    setSizeRatio: guard(async value => {
      if (!Number.isFinite(value) || value < 0.05 || value > 4) throw new Error('Size ratio must be between 0.05 and 4.')
      sizeRatio = value
      field('sseSizeRatio').value = value
      emit('size-ratio-changed', { sizeRatio })
      return sizeRatio
    }),
    resizeSprite: guard(async(id, { columns, rows }) => {
      const target = currentTarget()
      const sprite = target.imports.find(item => item.id === id)
      if (!sprite) throw new Error('Sprite not found.')
      if (![columns, rows].every(value => Number.isInteger(value) && value >= 1)
        || sprite.placedAt.column + columns > target.columns) throw new Error('Tile span exceeds the sheet edge.')
      const own = (x, y) => x < sprite.tileSpan.columns && y < sprite.tileSpan.rows
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
          if (!own(x, y) && target.occupied.has(`${sprite.placedAt.column + x},${sprite.placedAt.row + y}`)) throw new Error('Tiles are occupied.')
        }
      }
      const needed = sprite.placedAt.row + rows
      const oldRows = target.rows
      if (needed > oldRows) {
        checkTargetBudget(target.data.sheetPath, target.image.width * needed * target.rowHeight)
        const grown = canvas(target.image.width, needed * target.rowHeight)
        const ctx = grown.getContext('2d')
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, grown.width, grown.height)
        ctx.drawImage(target.image, 0, 0)
        target.image = grown
        target.rows = needed
      }
      const result = editSprite(id, { tileSpan: { columns, rows }, anchor: sprite.anchor === 'stretch' ? 'center' : (sprite.anchor || 'center') })
      await api.selectSprite(id)
      if (target.rows !== oldRows) emit('sheet-grown', { previousRows: oldRows, rows: target.rows })
      emit('sprite-resized', { id, tileSpan: result.tileSpan })
      return result
    }),
    shrinkSprite: guard(async id => {
      const sprite = currentTarget().imports.find(item => item.id === id)
      if (!sprite) throw new Error('Sprite not found.')
      return api.resizeSprite(id, { columns: Math.max(1, sprite.tileSpan.columns - 1), rows: Math.max(1, sprite.tileSpan.rows - 1) })
    }),
    growSprite: guard(async id => {
      const sprite = currentTarget().imports.find(item => item.id === id)
      if (!sprite) throw new Error('Sprite not found.')
      return api.resizeSprite(id, { columns: sprite.tileSpan.columns + 1, rows: sprite.tileSpan.rows + 1 })
    }),
    extractAll: guard(async({ sourceId, ...options } = {}) => {
      const selectedSources = sourceId === undefined ? [...sources.values()] : [sources.get(sourceId)]
      if (!selectedSources.length || selectedSources.some(item => !item)) throw new Error('Upload a source image first.')
      const target = currentTarget()
      const results = []
      try {
        for (const item of selectedSources) {
          source = item
          const components = detectSprites(source.pixels, { cutoff: Number(field('sseCutoff').value), ...options })
          for (const component of components) {
            // A prior click may have extracted a subset of a gap-merged component.
            if (!componentOverlaps(component)) results.push(placeComponent(component, target, false))
          }
        }
      } finally { drawSource() }
      emit('extracted-all', { sprites: results })
      report(`Extracted ${results.length} sprites.`)
      return results
    }),
    selectSprite: guard(async id => {
      const sprite = currentTarget().imports.find(item => item.id === id)
      if (!sprite) throw new Error('Sprite not found.')
      selectedSpriteId = id
      field('sseAnchor').value = sprite.anchor || 'center'
      const cells = []
      for (let y = 0; y < sprite.tileSpan.rows; y++) {
        for (let x = 0; x < sprite.tileSpan.columns; x++) cells.push({ col: sprite.placedAt.column + x, row: sprite.placedAt.row + y })
      }
      setSelectedCells(cells)
      emit('sprite-selected', { id })
      return sprite
    }),
    removeSprite: guard(async id => {
      const sprite = currentTarget().imports.find(item => item.id === id)
      if (!sprite) throw new Error('Sprite not found.')
      const cells = []
      for (let y = 0; y < sprite.tileSpan.rows; y++) {
        for (let x = 0; x < sprite.tileSpan.columns; x++) cells.push({ col: sprite.placedAt.column + x, row: sprite.placedAt.row + y })
      }
      await api.clearTiles(cells)
      emit('sprite-removed', { id })
      return api.getState()
    }),
    compact: guard(async() => {
      const target = currentTarget()
      const fixed = new Set(target.occupied)
      for (const sprite of target.imports) {
        for (let y = 0; y < sprite.tileSpan.rows; y++) {
          for (let x = 0; x < sprite.tileSpan.columns; x++) fixed.delete(`${sprite.placedAt.column + x},${sprite.placedAt.row + y}`)
        }
      }
      const packed = compactSprites(target.imports, { ...target, occupied: fixed })
      checkTargetBudget(state.activeData.sheetPath, target.image.width * packed.rows * target.rowHeight)
      const image = canvas(target.image.width, packed.rows * target.rowHeight)
      const ctx = image.getContext('2d')
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, image.width, image.height)
      const tiles = {}
      for (const key of fixed) {
        const [x, y] = key.split(',').map(Number)
        ctx.drawImage(target.image, x * target.tileSize, y * target.rowHeight, target.tileSize, target.rowHeight,
          x * target.tileSize, y * target.rowHeight, target.tileSize, target.rowHeight)
        if (target.data.tiles[key]) tiles[key] = target.data.tiles[key]
      }
      for (const sprite of packed.placements) {
        const old = target.imports.find(item => item.id === sprite.id)
        const width = sprite.tileSpan.columns * target.tileSize
        const height = sprite.tileSpan.rows * target.rowHeight
        ctx.drawImage(target.image, old.placedAt.column * target.tileSize, old.placedAt.row * target.rowHeight, width, height,
          sprite.placedAt.column * target.tileSize, sprite.placedAt.row * target.rowHeight, width, height)
        for (let y = 0; y < sprite.tileSpan.rows; y++) {
          for (let x = 0; x < sprite.tileSpan.columns; x++) {
            const entry = target.data.tiles[`${old.placedAt.column + x},${old.placedAt.row + y}`]
            if (entry) {
              const dx = (sprite.placedAt.column - old.placedAt.column) * target.tileSize
              const dy = (sprite.placedAt.row - old.placedAt.row) * target.rowHeight
              tiles[`${sprite.placedAt.column + x},${sprite.placedAt.row + y}`] = { ...entry,
                ...(entry.rect ? { rect: { ...entry.rect, x: entry.rect.x + dx, y: entry.rect.y + dy } } : {}) }
            }
          }
        }
      }
      target.image = image
      target.rows = packed.rows
      target.imports = packed.placements
      target.occupied = packed.occupied
      target.data.tiles = tiles
      selected.clear()
      selectedSpriteId = null
      selectionStatus()
      sync(target)
      emit('compacted', { sprites: target.imports })
      report(`Compacted ${target.imports.length} sprites.`)
      return target.imports
    }),
    setClearMode: guard(async enabled => setClearMode(enabled)),
    selectTiles: guard(async(cells, { append = false } = {}) => setSelectedCells(cells, append)),
    setExportOptions: guard(async options => setExportOptions(options)),
    setViewport: guard(async({ pane = 'target', sourceId, x, y, scale }) => {
      if (!['source', 'target'].includes(pane) || ![x, y, scale].every(Number.isFinite) || scale < 0.1 || scale > 8) throw new Error('Invalid viewport.')
      const view = { x, y, scale }
      if (pane === 'source' && sourceId) {
        const item = sources.get(sourceId)
        if (!item) throw new Error('Source image not found.')
        item.applyView(view)
      } else if (pane === 'source') applySourceView(view)
      else applyTargetView(view)
      return { pane, ...view }
    }),
    newSheet: options => api.createBlankSheet({ ...options, columns: options?.cols ?? 18, rowHeight: options?.tileSize ?? 64, borderWidth: 0 }),
    setSplitRatio: guard(async ratio => {
      if (!Number.isFinite(ratio)) throw new Error('Invalid split ratio.')
      return setSplitRatio(ratio)
    }),
    clearTiles: guard(async cells => {
      const target = currentTarget()
      const previousImports = target.imports
      const cleared = clearTargetTiles(target, cells)
      for (const item of previousImports) {
        if (!target.imports.includes(item)) spriteImages.delete(`${target.data.sheetPath}:${item.id}`)
      }
      for (const source of sources.values()) {
        for (const item of previousImports) {
          if (!target.imports.includes(item)) {
            const key = `${item.bbox.x},${item.bbox.y},${item.bbox.width},${item.bbox.height}`
            if (source.masks.get(key)?.id === item.id && source.masks.get(key)?.targetPath === target.data.sheetPath) {
              source.isolated.delete(key)
              source.masks.delete(key)
            }
          }
        }
      }
      drawSource()
      selectedSpriteId = null
      sync(target)
      selected.clear()
      selectionStatus()
      report(`Cleared ${cleared.length} tiles.`)
      emit('tiles-cleared', { tiles: cleared })
      return api.getState()
    }),
    exportSheet: guard(async(options = {}) => {
      const target = currentTarget()
      sync(target)
      const compression = exportOptions(options)
      target.data.compression = compression
      adapters.refresh()
      const name = adapters.name().replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '-') || 'extended-sheet'
      const json = exportMetadata(adapters.serialize(), name, compression)
      const webpBlob = compression.lossless
        ? new Blob([encodeLosslessWebP(target.image.getContext('2d').getImageData(0, 0, target.image.width, target.image.height))], { type: 'image/webp' })
        : await new Promise(resolve => target.image.toBlob(resolve, 'image/webp', compression.quality / 100))
      if (!webpBlob || webpBlob.type !== 'image/webp') throw new Error('This browser cannot encode WebP.')
      const metadataBlob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
      download(webpBlob, `${name}.webp`)
      download(metadataBlob, `${name}.json`)
      report('Downloaded target WebP and JSON metadata.')
      emit('downloaded', { name, metadata: json })
      return { webpBlob, json, imageBlob: webpBlob, metadataBlob, metadata: json }
    }),
    getState: () => {
      const target = targets.get(state.activeData?.sheetPath)
      return { mode: 'extend', anchor, sizeRatio, targetSheetPath: state.activeData?.sheetPath || null, sourceLoaded: Boolean(source), sources: [...sources.values()].map(item => ({ sourceId: item.id, width: item.pixels.width, height: item.pixels.height })),
        tileSize: state.activeData?.tileSize, rowHeight: state.activeData?.rowHeight, borderWidth: state.activeData?.borderWidth,
        columns: target?.columns, rows: target?.rows, occupiedTiles: target ? [...target.occupied] : [],
        sprites: target?.imports || [], selectedSpriteId, pendingSprites: 0, importedSprites: target?.imports.length || 0, status }
    },
    createBlankSheet: guard(async({ columns = 18, rows = 18, tileSize = 64, rowHeight = tileSize, borderWidth = 1, name = 'extended-sheet' } = {}) => {
      validateGrid({ columns, rows, tileSize, rowHeight, borderWidth })
      const path = `local-upload:sse-${++sequence}`
      checkTargetBudget(path, columns * tileSize * rows * rowHeight)
      await adapters.staticMode()
      const image = canvas(columns * tileSize, rows * rowHeight)
      const ctx = image.getContext('2d')
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, image.width, image.height)
      const data = adapters.newData(path, { tileSize, rowHeight, borderWidth })
      adapters.register(path, name, image, data)
      targets.set(path, { data, image, columns, rows, tileSize, rowHeight, borderWidth, occupied: new Set(), imports: [] })
      activeTargetPath = path
      sources.forEach(resetSourceImports)
      drawSource()
      sync(targets.get(path))
      selected.clear()
      selectedSpriteId = null
      selectionStatus()
      report(`Target created: ${name}`)
      emit('sheet-created', { name, ...api.getState() })
      return api.getState()
    }),
    selectTargetSheet: guard(async(path) => {
      await adapters.staticMode()
      if (path && path !== state.activeData?.sheetPath) await adapters.select(path)
      if (!state.image || (path && state.activeData?.sheetPath !== path)) throw new Error('Target sheet could not be loaded.')
      const existing = targets.get(state.activeData.sheetPath)
      if (existing && (existing.tileSize !== state.activeData.tileSize || existing.rowHeight !== state.activeData.rowHeight || existing.borderWidth !== state.activeData.borderWidth)) {
        targets.delete(state.activeData.sheetPath)
        state.activeData.extension = undefined
      }
      sync(currentTarget())
      sources.forEach(resetSourceImports)
      drawSource()
      selected.clear()
      selectedSpriteId = null
      selectionStatus()
      emit('target-selected', { path: state.activeData.sheetPath })
      report(`Target selected: ${state.activeData.sheetPath}`)
      return api.getState()
    }),
    loadSourceImage: guard(async input => {
      await api.addSourceImage(input, { replace: true })
      return api.getState()
    }),
    addSourceImage: guard(async(input, { replace = false } = {}) => {
      let blob = input
      let ownedUrl = null
      if (input instanceof ArrayBuffer) blob = new Blob([input])
      const url = typeof input === 'string' ? input : (ownedUrl = URL.createObjectURL(blob))
      if (typeof input === 'string' && !/^(data:image\/|blob:)/.test(input)) throw new Error('Source must be an image data URL, blob URL, Blob, File or ArrayBuffer.')
      try {
        const image = new Image()
        await new Promise((resolve, reject) => {
          image.onload = resolve
          image.onerror = () => reject(new Error('Could not decode source image.'))
          image.src = url
        })
        const staging = canvas(image.width, image.height)
        staging.getContext('2d').drawImage(image, 0, 0)
        const pixels = staging.getContext('2d').getImageData(0, 0, image.width, image.height)
        let total = pixels.width * pixels.height
        if (!replace) for (const item of sources.values()) total += item.pixels.width * item.pixels.height
        if (total > MAX_SSE_PIXELS * 2) throw new Error('Source budget reached (32 megapixels).')
        if (replace) { sources.clear(); sourceStrip.replaceChildren() }
        sourceCanvas = canvas(image.width, image.height)
        sourceCanvas.id = sources.size ? `sseSourceCanvas-${sourceSequence + 1}` : 'sseSourceCanvas'
        sourceCanvas.setAttribute('aria-label', 'Source sprites')
        const frame = document.createElement('div')
        frame.className = 'sse-source-frame'
        frame.style.width = `${image.width}px`
        frame.style.height = `${image.height}px`
        frame.appendChild(sourceCanvas)
        sourceStrip.appendChild(frame)
        source = { id: `source-${++sourceSequence}`, canvas: sourceCanvas, pixels, isolated: new Set(), masks: new Map() }
        sources.set(source.id, source)
        const sourceId = source.id
        sourceCanvas.dataset.sourceId = sourceId
        const item = source
        item.view = { x: 0, y: 0, scale: 1 }
        const input = addZoomInput(sourceId, 'sseZoom-' + sourceId)
        let syncZoom = () => {}
        item.applyView = view => {
          item.view = view
          syncZoom()
          item.canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
          emit('viewport-changed', { pane: 'source', sourceId, ...view })
        }
        syncZoom = bindSseZoomInput(input, frame, () => item.view, item.applyView)
        bindSseViewport(frame, () => item.view, view => api.setViewport({ pane: 'source', sourceId, ...view }).catch(() => {}))
        frame.addEventListener('wheel', event => event.stopPropagation())
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) frame.addEventListener(type, event => event.stopPropagation())
        sourceCanvas.addEventListener('click', event => {
          const element = event.currentTarget
          const rect = element.getBoundingClientRect()
          api.toggleSourceSprite({ sourceId, x: (event.clientX - rect.left) * element.width / rect.width,
            y: (event.clientY - rect.top) * element.height / rect.height }).catch(() => {})
        })
        sourceCanvas.width = image.width
        sourceCanvas.height = image.height
        sourceCanvas.getContext('2d').drawImage(staging, 0, 0)
        sourcePane.hidden = false
        await api.setExtendOpen(true)
        setSourceVisible()
        applySourceView({ x: 0, y: 0, scale: Math.min(1, sourcePane.clientWidth / image.width || 1,
          (sourcePane.clientHeight ? Math.max(1, sourcePane.clientHeight - sourcePane.querySelector('p').offsetHeight) / image.height : 1)) })
        report('Source loaded. Click a sprite in the source pane.')
        emit('source-loaded', { sourceId, width: image.width, height: image.height })
        return sourceId
      } finally {
        if (ownedUrl) URL.revokeObjectURL(ownedUrl)
      }
    }),
    isolateAt: guard(async({ sourceId = [...sources.keys()].at(-1), x, y, cutoff = Number(field('sseCutoff').value) }) => {
      source = sources.get(sourceId)
      if (!source) throw new Error('Source image not found.')
      const target = currentTarget()
      const component = isolateComponent(source.pixels, x, y, cutoff)
      if (!component || component.area < 2) throw new Error('Click a non-black sprite containing at least two pixels.')
      return placeComponent(component, target)
    }),
    toggleSourceSprite: guard(async({ sourceId = [...sources.keys()].at(-1), x, y, cutoff }) => {
      source = sources.get(sourceId)
      if (!source) throw new Error('Source image not found.')
      currentTarget()
      for (const mask of source.masks.values()) {
        const dx = Math.floor(x) - mask.bbox.x
        const dy = Math.floor(y) - mask.bbox.y
        if (dx >= 0 && dy >= 0 && dx < mask.bbox.width && dy < mask.bbox.height && mask.pixels[(dy * mask.bbox.width + dx) * 4 + 3]) {
          await api.removeSprite(mask.id)
          return { removed: true, id: mask.id }
        }
      }
      return api.isolateAt({ sourceId, x, y, cutoff })
    }),
    downloadExtendedSheet: () => api.exportSheet(),
    on: (event, handler) => {
      const name = event.startsWith('sse:') ? event : `sse:${event}`
      const listener = e => handler(e.detail)
      window.addEventListener(name, listener)
      return () => window.removeEventListener(name, listener)
    }
  }
  const handleUiError = error => {
    if (status === error.message) return
    report(error.message)
    emit('error', { message: error.message })
  }
  const bind = (id, fn) => field(id).addEventListener('click', () => { fn().catch(() => {}) })
  api.chooseSourceImages = guard(async() => { field('sseSourceFile').click(); emit('source-chooser-opened', {}) })
  bind('sseAddSource', () => api.chooseSourceImages())
  api.setExtendOpen = guard(async open => {
    panel.open = Boolean(open)
    field('sseExtendToggle').setAttribute('aria-expanded', String(panel.open))
    field('sseExtendContent').classList.toggle('is-open', panel.open)
    field('sseExtendContent').inert = !panel.open
    panel.dispatchEvent(new Event('toggle'))
    emit('extend-toggled', { open: panel.open })
    return panel.open
  })
  field('sseExtendContent').inert = true
  field('sseExtendToggle').addEventListener('click', () => { api.setExtendOpen(!panel.open).catch(() => {}) })
  api.setNewSheetOptions = guard(async options => {
    const fields = { columns: 'sseNewColumns', rows: 'sseNewRows', tileSize: 'sseNewTile', name: 'sseNewName' }
    for (const [key, id] of Object.entries(fields)) if (options[key] !== undefined) field(id).value = options[key]
    const width = Number(field('sseNewColumns').value) * Number(field('sseNewTile').value)
    const height = Number(field('sseNewRows').value) * Number(field('sseNewTile').value)
    field('sseNewDimensions').textContent = `${width} × ${height} px`
    emit('new-sheet-options-changed', { width, height })
    return { width, height }
  })
  for (const id of ['sseNewColumns', 'sseNewRows', 'sseNewTile', 'sseNewName']) field(id).addEventListener('input', () => { api.setNewSheetOptions({}).catch(() => {}) })
  api.setNewSheetOptions({}).catch(() => {})
  bind('sseCreateBlank' , () => api.newSheet({ name: field('sseNewName').value,
    cols: Number(field('sseNewColumns').value), rows: Number(field('sseNewRows').value),
    tileSize: Number(field('sseNewTile').value) }))
  bind('sseUseTarget', () => api.selectTargetSheet(state.sheetSelect.value))
  bind('sseDownloadExtended', () => api.exportSheet({ lossless: field('sseLossless').checked, quality: Number(field('sseQuality').value) }))
  field('sseAnchor').addEventListener('change', async event => {
    const value = event.target.value
    try {
      await api.setAnchor(value)
      if (selectedSpriteId) await api.setSpriteAnchor(selectedSpriteId, value)
    } catch { /* Controller reports errors. */ }
  })
  field('sseSizeRatio').addEventListener('change', event => { api.setSizeRatio(Number(event.target.value)).catch(() => {}) })
  bind('sseExtractAll', () => api.extractAll())
  bind('sseCompact', () => api.compact())
  bind('sseRemoveSprite', () => api.removeSprite(selectedSpriteId))
  state.canvas.addEventListener('click', event => {
    if (panel.querySelector('#sseClearMode').checked || !targets.has(state.activeData?.sheetPath)) return
    const cell = tileAt(event)
    const sprite = currentTarget().imports.find(item => cell.col >= item.placedAt.column && cell.row >= item.placedAt.row
      && cell.col < item.placedAt.column + item.tileSpan.columns && cell.row < item.placedAt.row + item.tileSpan.rows)
    if (sprite) api.selectSprite(sprite.id).catch(() => {})
    else { selectedSpriteId = null; selected.clear(); selectionStatus() }
  })
  const menu = document.createElement('div')
  menu.id = 'sseSpriteContextMenu'
  menu.hidden = true
  menu.setAttribute('role', 'dialog')
  menu.setAttribute('aria-label', 'Resize sprite')
  menu.style.cssText = 'position:fixed;z-index:10000;padding:8px;background:#202820;border:1px solid #6efc4b;max-width:260px'
  menu.innerHTML = `<div class="sse-resize-row">${[['Columns', 'sseResizeColumns'], ['Rows', 'sseResizeRows']].map(([label, id]) => `<div class="floating-label-input"><input id="${id}" type="number" min="1" class="sidebar-input" placeholder=" "><label for="${id}">${label}</label></div>`).join('')}<button type="button" class="action-button" id="sseResizeApply">Resize</button></div><div class="sse-resize-row"><button type="button" class="action-button" id="sseShrink">Shrink</button><button type="button" class="action-button" id="sseGrow">Grow</button></div><button type="button" class="action-button" id="sseResizeClose">Close</button>`
  for (const [id, method] of [['sseShrink', 'shrinkSprite'], ['sseGrow', 'growSprite']]) {
    menu.querySelector(`#${id}`).addEventListener('click', async() => {
      try { await api[method](selectedSpriteId); await api.openSpriteMenu(selectedSpriteId, { x: parseFloat(menu.style.left), y: parseFloat(menu.style.top) }) } catch { /* Controller reports errors. */ }
    })
  }
  state.root.appendChild(menu)
  const closeMenu = () => {
    menu.hidden = true
    emit('sprite-menu-closed', {})
  }
  api.closeSpriteMenu = guard(async() => closeMenu())
  api.openSpriteMenu = guard(async(id, { x = 0, y = 0 } = {}) => {
    if (![x, y].every(Number.isFinite)) throw new Error('Invalid menu position.')
    const sprite = await api.selectSprite(id)
    menu.querySelector('#sseResizeColumns').value = sprite.tileSpan.columns
    menu.querySelector('#sseResizeRows').value = sprite.tileSpan.rows
    menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - 280))}px`
    menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - 180))}px`
    menu.hidden = false
    menu.querySelector('input').focus()
    emit('sprite-menu-opened', { id })
  })
  menu.querySelector('#sseResizeClose').addEventListener('click', () => { api.closeSpriteMenu().catch(() => {}) })
  menu.querySelector('#sseResizeApply').addEventListener('click', async() => {
    try {
      await api.resizeSprite(selectedSpriteId, { columns: Number(menu.querySelector('#sseResizeColumns').value), rows: Number(menu.querySelector('#sseResizeRows').value) })
      await api.closeSpriteMenu()
    } catch { /* Controller reports validation errors. */ }
  })
  const spriteAt = event => {
    if (!state.activeData || !targets.has(state.activeData.sheetPath)) return null
    const cell = tileAt(event)
    return currentTarget().imports.find(item => cell.col >= item.placedAt.column && cell.row >= item.placedAt.row
      && cell.col < item.placedAt.column + item.tileSpan.columns && cell.row < item.placedAt.row + item.tileSpan.rows)
  }
  state.canvas.addEventListener('contextmenu', event => {
    const sprite = spriteAt(event)
    if (!sprite) return
    event.preventDefault()
    api.openSpriteMenu(sprite.id, { x: event.clientX, y: event.clientY }).catch(() => {})
  })
  let pressTimer = null
  let pressPoint = null
  const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null }
  state.canvasWrap.addEventListener('pointerdown', event => {
    cancelPress()
    if (event.pointerType !== 'touch' || !event.isPrimary) return
    const sprite = spriteAt(event)
    if (!sprite) return
    pressPoint = { x: event.clientX, y: event.clientY }
    pressTimer = setTimeout(() => {
      state.dragging = false
      api.openSpriteMenu(sprite.id, pressPoint).catch(() => {})
    }, 550)
  })
  state.canvasWrap.addEventListener('pointermove', event => {
    if (pressPoint && Math.hypot(event.clientX - pressPoint.x, event.clientY - pressPoint.y) > 8) cancelPress()
  })
  state.canvasWrap.addEventListener('pointerup', cancelPress)
  state.canvasWrap.addEventListener('pointercancel', cancelPress)
  state.root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) api.closeSpriteMenu().catch(() => {})
    if (event.key !== 'Delete' || event.target.closest('input, textarea, select, [contenteditable="true"]') || !selectedSpriteId) return
    event.preventDefault()
    api.removeSprite(selectedSpriteId).catch(() => {})
  })
  bind('sseClearTiles', () => api.clearTiles([...selected.values()]))
  field('sseLossless').addEventListener('change', () => setExportOptions({ lossless: field('sseLossless').checked, quality: Number(field('sseQuality').value) }))
  field('sseQuality').addEventListener('input', () => setExportOptions({ lossless: field('sseLossless').checked, quality: Number(field('sseQuality').value) }))
  field('sseSourceFile').addEventListener('change', event => {
    adapters.loadFiles(event.target.files).catch(handleUiError)
  })
  panel.addEventListener('dragover', event => event.preventDefault())
  panel.addEventListener('drop', event => {
    event.preventDefault()
    event.stopPropagation()
    adapters.loadFiles(event.dataTransfer?.files).catch(handleUiError)
  })
  sourcePane.addEventListener('dragover', event => { event.preventDefault(); event.stopPropagation() })
  sourcePane.addEventListener('drop', event => {
    event.preventDefault()
    event.stopPropagation()
    adapters.loadFiles(event.dataTransfer?.files).catch(handleUiError)
  })
  report(status)
  window.__SSE__ = api
  return api
}
