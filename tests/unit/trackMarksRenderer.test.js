import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/storage/indexedDbStorage.js', () => ({
  getStoredItem: vi.fn(() => null),
  setStoredItem: vi.fn()
}))

import { TrackMarkStore, TRACK_KIND, TRACK_SURFACE, TRACK_CHUNK_PX, trackMarkSettings } from '../../src/game/trackMarks.js'
import { TrackMarksRenderer } from '../../src/rendering/trackMarksRenderer.js'
import { MapRenderer } from '../../src/rendering/mapRenderer.js'

function fakeCtx() {
  const noop = () => {}
  return new Proxy({ canvas: { width: 800, height: 600 }, getTransform: () => ({ a: 1 }) }, {
    get(target, prop) { return prop in target ? target[prop] : noop },
    set(target, prop, value) { target[prop] = value; return true }
  })
}

describe('TrackMarksRenderer memory', () => {
  it('[U04485] bakes visible chunks and frees canvases of emptied chunks', () => {
    globalThis.HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCtx())
    trackMarkSettings.enabled = true
    trackMarkSettings.fade = true
    trackMarkSettings.fadeDelayS = 5
    const store = new TrackMarkStore(64)
    store.configureMap(32, 32)
    const renderer = new TrackMarksRenderer(store)
    store.add(TRACK_KIND.segment, 10, 10, 20, 10, 0, 0, TRACK_SURFACE.grass, 0, 8, 4)
    store.add(TRACK_KIND.segment, TRACK_CHUNK_PX + 10, 10, TRACK_CHUNK_PX + 20, 10, 0, 0, TRACK_SURFACE.sand, 0, 8, 4)
    const ctx = fakeCtx()
    renderer.render(ctx, { x: 0, y: 0 }, { simulationTime: 100 })
    expect(renderer.getStats().canvases).toBe(2)
    expect(renderer.getStats().canvasBytes).toBeGreaterThan(0)
    store.expire(60000)
    renderer.render(ctx, { x: 0, y: 0 }, { simulationTime: 60000 })
    expect(renderer.getStats().canvases).toBe(0)
    expect(renderer.getStats().canvasBytes).toBe(0)
    trackMarkSettings.fade = false
  })
})


describe('Ground trace visibility layering', () => {
  it.each([false, true])('[U05460] draws tracks after terrain and before shadow of war (GPU terrain: %s)', skipBaseLayer => {
    const renderer = new MapRenderer({})
    const order = []
    const ctx = fakeCtx()
    ctx.globalAlpha = 1
    const scroll = { x: 0, y: 0 }
    const state = { shadowOfWarEnabled: true, visibilityMap: [[{ discovered: true, visible: false }]] }
    vi.spyOn(renderer, 'renderTiles').mockImplementation(() => order.push('terrain'))
    vi.spyOn(renderer, 'renderSOTOverlays').mockImplementation(() => order.push('terrain'))
    vi.spyOn(renderer.trackMarksRenderer, 'render').mockImplementation(() => order.push('tracks'))
    vi.spyOn(renderer, 'renderGrid').mockImplementation(() => {})
    vi.spyOn(renderer, 'renderOccupancyMap').mockImplementation(() => {})
    ctx.fillRect = vi.fn(() => order.push('fog'))

    renderer.render(ctx, [[{ type: 'land' }]], scroll, ctx.canvas, state, null, { skipBaseLayer })

    expect(order).toEqual(['terrain', 'tracks', 'fog'])
    expect(renderer.trackMarksRenderer.render).toHaveBeenCalledOnce()
    const call = renderer.trackMarksRenderer.render.mock.calls[0]
    expect(call[0]).toBe(ctx)
    expect(call[1]).toBe(scroll)
    expect(call[2]).toBe(state)
  })

  it.each([0, 1, 2])('[U05461] preserves trace opacity at entity opacity level %s', entityImageOpacityLevel => {
    const renderer = new MapRenderer({})
    const ctx = fakeCtx()
    ctx.globalAlpha = 1
    vi.spyOn(renderer, 'renderTiles').mockImplementation(() => {})
    vi.spyOn(renderer, 'renderGrid').mockImplementation(() => {})
    vi.spyOn(renderer, 'renderOccupancyMap').mockImplementation(() => {})
    const tracks = vi.spyOn(renderer.trackMarksRenderer, 'render').mockImplementation(() => {
      expect(ctx.globalAlpha).toBe([1, 0.5, 0][entityImageOpacityLevel])
    })

    renderer.render(ctx, [[{ type: 'land' }]], { x: 0, y: 0 }, ctx.canvas, { entityImageOpacityLevel })

    expect(tracks).toHaveBeenCalledOnce()
  })
})
