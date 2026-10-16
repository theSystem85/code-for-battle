import { afterEach, describe, expect, it, vi } from 'vitest'
import { initSseExtend } from '../../src/ui/sseExtend.js'

function controller(sourcePixels) {
  document.body.innerHTML = '<div id="editor"><aside></aside><div class="sprite-sheet-editor__workspace"><div id="wrap"><div id="viewport"><canvas id="target"></canvas></div></div></div></div>'
  const pixels = { width: 20, height: 20, data: new Uint8ClampedArray(20 * 20 * 4) }
  for (let y = 1; y < 19; y++) {
    for (let x = 1; x < 19; x++) pixels.data.set([255, 0, 0, 255], (y * 20 + x) * 4)
  }
  const context = { drawImage: vi.fn(), putImageData: vi.fn(), getImageData: () => sourcePixels || pixels,
    fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn() }
  // The shared setup installs getContext on each newly created canvas.
  // Override those instances too, so staging canvases read the source fixture.
  vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  const createElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
    const element = createElement(tagName, options)
    if (tagName.toLowerCase() === 'canvas') element.getContext = () => context
    return element
  })
  for (const canvas of document.querySelectorAll('canvas')) canvas.getContext = () => context
  vi.stubGlobal('Image', class {
    width = 20
    height = 20
    set src(_value) { Promise.resolve().then(() => this.onload()) }
  })
  vi.stubGlobal('ImageData', class {
    constructor(data, width, height) { Object.assign(this, { data, width, height }) }
  })
  const state = { root: document.querySelector('#editor'), canvasWrap: document.querySelector('#wrap'),
    canvasViewport: document.querySelector('#viewport'), canvas: document.querySelector('#target'), mode: 'static' }
  const sheets = new Map()
  const adapters = {
    staticMode: async() => {},
    newData: (sheetPath, data) => ({ ...data, sheetPath, tiles: {} }),
    register: (path, name, image, data) => { sheets.set(path, { image, data }); Object.assign(state, { image, activeData: data }) },
    refresh: () => {},
    select: async path => { const sheet = sheets.get(path); Object.assign(state, { image: sheet.image, activeData: sheet.data }); state.extendApi.targetChanged() }
  }
  const api = initSseExtend(state, adapters)
  state.extendApi = api
  return { api, state, context }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren() })

describe('SSE placement controller', () => {
  it('allows reimporting after newSheet, createBlankSheet and target selection, and redraws source overlays', async() => {
    const { api, context } = controller()
    const first = await api.newSheet({ cols: 4, rows: 2, tileSize: 16 })
    await api.loadSourceImage('data:image/png;base64,test')
    await api.isolateAt({ x: 2, y: 2 })
    await expect(api.isolateAt({ x: 2, y: 2 })).rejects.toThrow('already')
    const draws = context.putImageData.mock.calls.length
    await api.newSheet({ cols: 4, tileSize: 16 })
    expect(context.putImageData.mock.calls.length).toBeGreaterThan(draws)
    await api.isolateAt({ x: 2, y: 2 })
    await api.createBlankSheet({ columns: 4, tileSize: 16 })
    await api.isolateAt({ x: 2, y: 2 })
    await api.selectTargetSheet(first.targetSheetPath)
    await expect(api.isolateAt({ x: 2, y: 2 })).resolves.toMatchObject({ ok: true })
    expect(api.getState().sprites).toHaveLength(2)
  })

  it('shares anchor and ratio controls, shrinks occupancy and merges released tile tags', async() => {
    const { api, state } = controller()
    await api.newSheet({ cols: 4, rows: 2, tileSize: 16 })
    await api.loadSourceImage('data:image/png;base64,test')
    const changed = vi.fn()
    api.on('size-ratio-changed', changed)
    const input = document.querySelector('#sseSizeRatio')
    input.value = '1.5'
    input.dispatchEvent(new Event('change'))
    expect(changed).toHaveBeenCalledWith({ sizeRatio: 1.5 })
    const sprite = await api.isolateAt({ x: 2, y: 2 })
    expect(sprite.tileSpan).toEqual({ columns: 2, rows: 2 })
    expect(sprite.anchor).toBe('center')
    state.activeData.tiles['1,1'] = { tags: ['tree'] }
    state.activeData.tiles['0,0'] = { tags: ['forest'] }
    await api.setSpriteAnchor(sprite.id, 'bottom-right')
    await api.resizeSprite(sprite.id, { columns: 1, rows: 1 })
    expect(api.getState().occupiedTiles).toEqual(['0,0'])
    expect(sprite.tags).toEqual(['forest', 'tree'])
    expect(state.activeData.tiles['0,0'].tags).toEqual(['forest', 'tree'])
    expect(state.activeData.tiles['1,1']).toBeUndefined()
    expect(sprite.renderRect).toEqual({ x: 0, y: 0, width: 16, height: 16 })
    await expect(api.setSizeRatio(0)).rejects.toThrow()
    await expect(api.resizeSprite(sprite.id, { columns: 2, rows: 1 })).rejects.toThrow()
  })
})

function sourceFixture(rectangles) {
  const pixels = { width: 80, height: 40, data: new Uint8ClampedArray(80 * 40 * 4) }
  for (const [left, top, width, height] of rectangles) {
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) pixels.data.set([255, 0, 0, 255], (y * pixels.width + x) * 4)
    }
  }
  return pixels
}

it('imports a direct canvas click using transformed bounds and reports the import', async() => {
  const { api } = controller(sourceFixture([[3, 5, 10, 8]]))
  await api.newSheet({ cols: 1, rows: 1, tileSize: 16 })
  await api.loadSourceImage('data:image/png;base64,test')
  await api.setViewport({ pane: 'source', x: -5, y: -2, scale: 2 })
  const canvas = document.querySelector('#sseSourceCanvas')
  canvas.getBoundingClientRect = () => ({ left: 30, top: 70, width: 40, height: 40 })
  canvas.dispatchEvent(new MouseEvent('click', { clientX: 40, clientY: 84 }))
  await vi.waitFor(() => expect(document.querySelector('#sseExtendStatus').textContent).toContain('1 imported'))
  expect(api.getState().sprites[0].bbox).toEqual({ x: 3, y: 5, width: 10, height: 8 })
})

it('packs default-ratio extractions in adjacent single cells', async() => {
  const { api } = controller(sourceFixture([[2, 3, 8, 8], [25, 3, 8, 8], [50, 3, 8, 8]]))
  await api.newSheet({ cols: 3, rows: 2, tileSize: 16 })
  await api.loadSourceImage('data:image/png;base64,test')
  const sprites = await api.extractAll()
  expect(sprites.map(sprite => sprite.placedAt)).toEqual([{ column: 0, row: 0 }, { column: 1, row: 0 }, { column: 2, row: 0 }])
  expect(sprites.map(sprite => sprite.tileSpan)).toEqual(Array(3).fill({ columns: 1, rows: 1 }))
})

it('uses the configured ratio for rectangular sprite spans through UI and API', async() => {
  const { api } = controller(sourceFixture([[2, 2, 18, 10]]))
  await api.newSheet({ cols: 4, rows: 2, tileSize: 16 })
  await api.loadSourceImage('data:image/png;base64,test')
  const ratio = document.querySelector('#sseSizeRatio')
  ratio.value = '1.5'
  ratio.dispatchEvent(new Event('change'))
  const sprite = await api.isolateAt({ x: 3, y: 3 })
  expect(sprite.tileSpan).toEqual({ columns: 2, rows: 1 })
})
