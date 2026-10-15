import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/storage/indexedDbStorage.js', () => ({
  getStoredItem: vi.fn(() => null),
  setStoredItem: vi.fn()
}))

import { TrackMarkStore, TRACK_KIND, TRACK_SURFACE, TRACK_CHUNK_PX, trackMarkSettings } from '../../src/game/trackMarks.js'
import { TrackMarksRenderer } from '../../src/rendering/trackMarksRenderer.js'

function fakeCtx() {
  const noop = () => {}
  return new Proxy({ canvas: { width: 800, height: 600 }, getTransform: () => ({ a: 1 }) }, {
    get(target, prop) { return prop in target ? target[prop] : noop },
    set(target, prop, value) { target[prop] = value; return true }
  })
}

describe('TrackMarksRenderer memory', () => {
  it('bakes visible chunks and frees canvases of emptied chunks', () => {
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
