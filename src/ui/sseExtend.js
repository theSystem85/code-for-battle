import { clearTargetTiles, encodeLosslessWebP, exportMetadata, exportOptions } from './sseExport.js'
import { bindSseSplit, bindSseViewport } from './sseViewport.js'
import { isolateComponent } from './sseIsolate.js'
import { findPackingRegion, MAX_SSE_PIXELS, validateGrid } from './ssePack.js'

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
  let source = null
  let status = 'Create or select a target, then upload a source.'
  let sequence = 0
  const targets = new Map()
  const checkTargetBudget = (path, pixels) => {
    let total = pixels
    for (const [key, target] of targets) {
      if (key !== path) total += target.image.width * target.image.height
    }
    if ((!targets.has(path) && targets.size >= 8) || total > MAX_SSE_PIXELS * 2) {
      throw new Error('Session target budget reached (8 targets / 32 megapixels). Download targets and reload the editor.')
    }
  }
  const panel = document.createElement('details')
  panel.id = 'sseExtendPanel'
  panel.innerHTML = `<summary>Extend sheet / Import sprites</summary>
    <p>Target: the main editor canvas. Source: the separate canvas below. Click each source sprite once.</p>
    <label>Name <input id="sseNewName" value="extended-sheet"></label>
    <label>Columns <input id="sseNewColumns" type="number" min="1" value="8"></label>
    <label>Rows <input id="sseNewRows" type="number" min="1" value="4"></label>
    <label>Tile width <input id="sseNewTile" type="number" min="8" value="64"></label>
    <button id="sseCreateBlank" type="button">New sheet</button>
    <button id="sseUseTarget" type="button">Use current sheet as target</button>
    <label>Source image (upload or drop below) <input id="sseSourceFile" type="file" accept="image/*"></label>
    <label>Near-black cutoff <input id="sseCutoff" type="number" min="0" max="255" value="16"></label>
    <label><input id="sseClearMode" type="checkbox"> Select tiles to clear (click, shift-click or drag)</label>
    <button id="sseClearTiles" type="button">Clear tiles</button>
    <p id="sseSelectionStatus" role="status">0 tiles selected</p>
    <details id="sseExportPanel" open><summary>Export</summary>
    <label><input id="sseLossless" type="checkbox" checked> Lossless</label>
    <label class="slider-control-label" for="sseQuality">Quality <output id="sseQualityValue">85%</output></label>
    <input id="sseQuality" class="volume-slider" type="range" min="0" max="100" value="85" disabled>
    <button id="sseDownloadExtended" type="button">Export</button></details>
    <p id="sseExtendStatus" role="status"></p>`
  state.root.querySelector('aside').appendChild(panel)
  const sourcePane = document.createElement('section')
  sourcePane.id = 'sseSourcePane'
  sourcePane.hidden = true
  panel.addEventListener('toggle', () => { sourcePane.hidden = !panel.open || !source })
  sourcePane.innerHTML = '<p>Source — click a sprite to isolate and pack into target</p><canvas id="sseSourceCanvas" aria-label="Source sprites"></canvas>'
  state.root.querySelector('.sprite-sheet-editor__workspace').appendChild(sourcePane)
  const sourceCanvas = sourcePane.querySelector('canvas')
  const workspace = sourcePane.parentElement
  const setSourceVisible = () => workspace.classList.toggle('sse-has-source', panel.open && Boolean(source))
  panel.addEventListener('toggle', setSourceVisible)
  const setSplitRatio = bindSseSplit(workspace, sourcePane, ratio => {
    window.dispatchEvent(new CustomEvent('sse:split-changed', { detail: { ratio } }))
  })
  let sourceView = { x: 0, y: 0, scale: 1 }
  const applySourceView = view => {
    sourceView = view
    sourceCanvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
    window.dispatchEvent(new CustomEvent('sse:viewport-changed', { detail: { pane: 'source', ...view } }))
  }
  const applyTargetView = view => {
    state.dragging = false
    state.panX = view.x
    state.panY = view.y
    state.zoomScale = view.scale
    state.canvasViewport.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
    if (state.zoomValueEl) state.zoomValueEl.textContent = `${Math.round(view.scale * 100)}%`
    window.dispatchEvent(new CustomEvent('sse:viewport-changed', { detail: { pane: 'target', ...view } }))
  }
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
    target = { data, image, occupied, imports: data.extension?.imports || [], columns, rows, tileSize: data.tileSize, rowHeight: data.rowHeight, borderWidth: data.borderWidth }
    targets.set(data.sheetPath, target)
    state.image = image
    return target
  }
  const sync = target => {
    state.image = target.image
    state.activeData.extension = { occupiedTiles: [...target.occupied], imports: target.imports }
    adapters.refresh()
  }
  const api = {
    setClearMode: guard(async enabled => setClearMode(enabled)),
    selectTiles: guard(async(cells, { append = false } = {}) => setSelectedCells(cells, append)),
    setExportOptions: guard(async options => setExportOptions(options)),
    setViewport: guard(async({ pane = 'target', x, y, scale }) => {
      if (!['source', 'target'].includes(pane) || ![x, y, scale].every(Number.isFinite) || scale < 0.1 || scale > 8) throw new Error('Invalid viewport.')
      const view = { x, y, scale }
      if (pane === 'source') applySourceView(view)
      else applyTargetView(view)
      return { pane, ...view }
    }),
    newSheet: options => api.createBlankSheet({ ...options, columns: options?.cols ?? 8, rowHeight: options?.tileSize ?? 64, borderWidth: 0 }),
    setSplitRatio: guard(async ratio => {
      if (!Number.isFinite(ratio)) throw new Error('Invalid split ratio.')
      return setSplitRatio(ratio)
    }),
    clearTiles: guard(async cells => {
      const target = currentTarget()
      const previousImports = target.imports
      const cleared = clearTargetTiles(target, cells)
      if (source) {
        for (const item of previousImports) {
          if (!target.imports.includes(item)) source.isolated.delete(`${item.bbox.x},${item.bbox.y},${item.bbox.width},${item.bbox.height}`)
        }
      }
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
      return { mode: 'extend', targetSheetPath: state.activeData?.sheetPath || null, sourceLoaded: Boolean(source),
        tileSize: state.activeData?.tileSize, rowHeight: state.activeData?.rowHeight, borderWidth: state.activeData?.borderWidth,
        columns: target?.columns, rows: target?.rows, occupiedTiles: target ? [...target.occupied] : [],
        pendingSprites: 0, importedSprites: target?.imports.length || 0, status }
    },
    createBlankSheet: guard(async({ columns = 8, rows = 4, tileSize = 64, rowHeight = tileSize, borderWidth = 1, name = 'extended-sheet' } = {}) => {
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
      sync(targets.get(path))
      selected.clear()
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
      selected.clear()
      selectionStatus()
      report(`Target selected: ${state.activeData.sheetPath}`)
      return api.getState()
    }),
    loadSourceImage: guard(async(input) => {
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
        source = { pixels, isolated: new Set() }
        sourceCanvas.width = image.width
        sourceCanvas.height = image.height
        sourceCanvas.getContext('2d').drawImage(staging, 0, 0)
        sourcePane.hidden = false
        panel.open = true
        sourceView = { x: 0, y: 0, scale: 1 }
        sourceCanvas.style.transform = ''
        setSourceVisible()
        report('Source loaded. Click a sprite in the source pane.')
        emit('source-loaded', { width: image.width, height: image.height })
        return api.getState()
      } finally {
        if (ownedUrl) URL.revokeObjectURL(ownedUrl)
      }
    }),
    isolateAt: guard(async({ x, y, cutoff = Number(field('sseCutoff').value) }) => {
      if (!source) throw new Error('Upload a source image first.')
      const target = currentTarget()
      const component = isolateComponent(source.pixels, x, y, cutoff)
      if (!component || component.area < 2) throw new Error('Click a non-black sprite containing at least two pixels.')
      const { bbox } = component
      const key = `${bbox.x},${bbox.y},${bbox.width},${bbox.height}`
      if (source.isolated.has(key)) throw new Error('This source sprite has already been imported.')
      const region = findPackingRegion({ ...target, width: bbox.width, height: bbox.height })
      checkTargetBudget(state.activeData.sheetPath, target.image.width * region.rows * target.rowHeight)
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
      target.image.getContext('2d').drawImage(crop, region.x * target.tileSize + target.borderWidth, region.y * target.rowHeight + target.borderWidth)
      for (let dy = 0; dy < region.spanY; dy++) {
        for (let dx = 0; dx < region.spanX; dx++) target.occupied.add(`${region.x + dx},${region.y + dy}`)
      }
      const result = { ok: true, bbox, tileSpan: { columns: region.spanX, rows: region.spanY }, placedAt: { column: region.x, row: region.y } }
      source.isolated.add(key)
      target.imports.push(result)
      sync(target)
      report(`Packed sprite at column ${region.x}, row ${region.y}. ${target.imports.length} imported.`)
      emit('isolated', result)
      if (target.rows !== oldRows) emit('sheet-grown', { previousRows: oldRows, rows: target.rows })
      emit('packed', result)
      return result
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
  bind('sseCreateBlank', () => api.newSheet({ name: field('sseNewName').value,
    cols: Number(field('sseNewColumns').value), rows: Number(field('sseNewRows').value),
    tileSize: Number(field('sseNewTile').value) }))
  bind('sseUseTarget', () => api.selectTargetSheet(state.sheetSelect.value))
  bind('sseDownloadExtended', () => api.exportSheet({ lossless: field('sseLossless').checked, quality: Number(field('sseQuality').value) }))
  bind('sseClearTiles', () => api.clearTiles([...selected.values()]))
  field('sseLossless').addEventListener('change', () => setExportOptions({ lossless: field('sseLossless').checked, quality: Number(field('sseQuality').value) }))
  field('sseQuality').addEventListener('input', () => setExportOptions({ lossless: field('sseLossless').checked, quality: Number(field('sseQuality').value) }))
  field('sseSourceFile').addEventListener('change', event => {
    adapters.loadFiles(event.target.files).catch(handleUiError)
  })
  sourcePane.addEventListener('click', event => {
    if (event.target.closest('p')) return
    const rect = sourceCanvas.getBoundingClientRect()
    api.isolateAt({ x: (event.clientX - rect.left) * sourceCanvas.width / rect.width,
      y: (event.clientY - rect.top) * sourceCanvas.height / rect.height }).catch(() => {})
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
