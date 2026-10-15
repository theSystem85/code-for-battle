import { afterEach, expect, it, vi } from 'vitest'
import { initSseExtend } from '../../src/ui/sseExtend.js'

afterEach(() => {
  document.body.replaceChildren()
  delete window.__SSE__
})

it('selects and removes full sprite spans, compacts tags and retains stable imported IDs', async() => {
  document.body.innerHTML = '<main><aside></aside><div class="sprite-sheet-editor__workspace"><div id="wrap"><div id="viewport"><canvas></canvas></div></div></div></main>'
  const root = document.querySelector('main')
  const image = document.querySelector('canvas')
  image.width = 48
  image.height = 48
  const data = {
    sheetPath: 'local:test', tileSize: 16, rowHeight: 16, borderWidth: 0,
    tiles: { '2,2': { tags: ['tree'], rect: { x: 32, y: 32, width: 16, height: 16 } } },
    extension: {
      occupiedTiles: ['0,1', '1,1', '2,2'],
      imports: [
        { id: 'sprite-1', bbox: { x: 2, y: 2, width: 24, height: 8 }, placedAt: { column: 0, row: 1 }, tileSpan: { columns: 2, rows: 1 } },
        { bbox: { x: 40, y: 2, width: 8, height: 8 }, placedAt: { column: 2, row: 2 }, tileSpan: { columns: 1, rows: 1 } }
      ]
    }
  }
  const state = { root, mode: 'static', activeData: data, image, canvas: image, canvasWrap: document.querySelector('#wrap'),
    canvasViewport: document.querySelector('#viewport'), panX: 0, panY: 0, zoomScale: 1 }
  const api = initSseExtend(state, { refresh: vi.fn(), staticMode: async() => {} })
  await api.selectTargetSheet()
  const ids = api.getState().sprites.map(item => item.id)
  expect(new Set(ids).size).toBe(2)
  const removed = vi.fn()
  const unsubscribe = api.on('sprite-removed', removed)
  await api.selectSprite(ids[0])
  expect(root.querySelectorAll('.sse-tile-selection span')).toHaveLength(2)
  root.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
  await vi.waitFor(() => expect(removed).toHaveBeenCalledWith({ id: ids[0] }))
  unsubscribe()
  expect(api.getState().occupiedTiles).toEqual(['2,2'])
  const packed = await api.compact()
  expect(packed.map(item => item.id)).toEqual([ids[1]])
  expect(packed[0].placedAt).toEqual({ column: 0, row: 0 })
  expect(data.tiles).toEqual({ '0,0': { tags: ['tree'], rect: { x: 0, y: 0, width: 16, height: 16 } } })
  expect(api.getState().occupiedTiles).toEqual(['0,0'])
  await api.selectSprite(ids[1])
  root.querySelector('#sseRemoveSprite').click()
  await vi.waitFor(() => expect(api.getState().importedSprites).toBe(0))
  expect(data.tiles).toEqual({})
  expect(api.getState().occupiedTiles).toEqual([])
})
