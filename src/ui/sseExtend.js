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
    <label>Row height <input id="sseNewHeight" type="number" min="8" value="64"></label>
    <label>Border inside cell <input id="sseNewBorder" type="number" min="0" value="1"></label>
    <button id="sseCreateBlank" type="button">Create blank black target</button>
    <button id="sseUseTarget" type="button">Use current sheet as target</button>
    <label>Source image (upload or drop below) <input id="sseSourceFile" type="file" accept="image/*"></label>
    <label>Near-black cutoff <input id="sseCutoff" type="number" min="0" max="255" value="16"></label>
    <button id="sseDownloadExtended" type="button">Download target WebP + JSON</button>
    <p id="sseExtendStatus" role="status"></p>`
  state.root.querySelector('aside').appendChild(panel)
  const sourcePane = document.createElement('section')
  sourcePane.id = 'sseSourcePane'
  sourcePane.hidden = true
  panel.addEventListener('toggle', () => { sourcePane.hidden = !panel.open })
  sourcePane.innerHTML = '<p>Source — click a sprite to isolate and pack into target</p><canvas id="sseSourceCanvas" aria-label="Source sprites"></canvas>'
  state.root.querySelector('.sprite-sheet-editor__workspace').appendChild(sourcePane)
  const sourceCanvas = sourcePane.querySelector('canvas')
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
      report(`Target created: ${name}`)
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
    downloadExtendedSheet: guard(async() => {
      const target = currentTarget()
      sync(target)
      const name = adapters.name().replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '-') || 'extended-sheet'
      const metadata = { ...adapters.serialize(), sheetPath: `${name}.webp`, extension: state.activeData.extension }
      const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
      const imageBlob = await new Promise(resolve => target.image.toBlob(resolve, 'image/webp', 0.85))
      if (!imageBlob || imageBlob.type !== 'image/webp') throw new Error('This browser cannot encode WebP. Use a browser with WebP export support.')
      download(imageBlob, `${name}.webp`)
      download(metadataBlob, `${name}.json`)
      report('Downloaded target WebP and JSON metadata.')
      emit('downloaded', { name, metadata })
      return { imageBlob, metadataBlob, metadata }
    }),
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
  bind('sseCreateBlank', () => api.createBlankSheet({ name: field('sseNewName').value,
    columns: Number(field('sseNewColumns').value), rows: Number(field('sseNewRows').value),
    tileSize: Number(field('sseNewTile').value), rowHeight: Number(field('sseNewHeight').value), borderWidth: Number(field('sseNewBorder').value) }))
  bind('sseUseTarget', () => api.selectTargetSheet(state.sheetSelect.value))
  bind('sseDownloadExtended', api.downloadExtendedSheet)
  field('sseSourceFile').addEventListener('change', event => {
    adapters.loadFiles(event.target.files).catch(handleUiError)
  })
  sourceCanvas.addEventListener('click', event => {
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
