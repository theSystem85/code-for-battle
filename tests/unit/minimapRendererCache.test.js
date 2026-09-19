import { afterEach, describe, expect, it, vi } from 'vitest'
import { MinimapRenderer } from '../../src/rendering/minimapRenderer.js'
import { publishCanvasViewport } from '../../src/rendering/prepared/canvasViewportRegistry.js'
import { renderProfiler } from '../../src/performance/renderProfiler.js'
import { PROFILER_SPAN_IDS } from '../../src/performance/profilerIds.js'
import { videoOverlay } from '../../src/ui/videoOverlay.js'

function createCanvas(width, height, density, playableWidth = width, playableHeight = height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * density)
  canvas.height = Math.round(height * density)
  publishCanvasViewport(canvas, {
    logicalWidth: width,
    logicalHeight: height,
    backingWidth: canvas.width,
    backingHeight: canvas.height,
    density,
    playableWidth,
    playableHeight,
    densityGeneration: 1
  })
  return canvas
}

function createMap() {
  return [
    [{ type: 'land', ore: false }, { type: 'water', ore: true }],
    [{ type: 'rock', ore: false }, { type: 'street', ore: false }]
  ]
}

function createVisibilityMap() {
  return [
    [{ discovered: true, visible: true }, { discovered: true, visible: false }],
    [{ discovered: false, visible: false }, { discovered: true, visible: true }]
  ]
}

describe('MinimapRenderer prepared caches', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps destination-size terrain, resource, and unchanged fog layers reusable', () => {
    const renderer = new MinimapRenderer()
    const minimapCanvas = createCanvas(160, 96, 2)
    const gameCanvas = createCanvas(400, 240, 2, 360, 220)
    const minimapCtx = minimapCanvas.getContext('2d')
    const mapGrid = createMap()
    const visibilityMap = createVisibilityMap()
    const state = {
      humanPlayer: 'player',
      radarActive: true,
      shadowOfWarEnabled: true,
      visibilityMap
    }
    const terrainFill = vi.spyOn(renderer.terrainCacheCtx, 'fillRect')
    const resourceFill = vi.spyOn(renderer.resourceCacheCtx, 'fillRect')
    const fogClear = vi.spyOn(renderer.visibilityCacheCtx, 'clearRect')
    const drawImage = vi.spyOn(minimapCtx, 'drawImage')
    const startSpan = vi.spyOn(renderProfiler, 'startSpan')

    renderer.render(
      minimapCtx,
      minimapCanvas,
      mapGrid,
      { x: 32, y: 16 },
      gameCanvas,
      [],
      [],
      state
    )

    expect(renderer.terrainCacheCanvas).toMatchObject({ width: 320, height: 192 })
    expect(renderer.resourceCacheCanvas).toMatchObject({ width: 320, height: 192 })
    expect(renderer.visibilityCacheCanvas).toMatchObject({ width: 320, height: 192 })
    const cacheDrawCalls = drawImage.mock.calls.filter(call => call[0] instanceof HTMLCanvasElement)
    expect(cacheDrawCalls.every(call => call.length === 3)).toBe(true)
    expect(startSpan).toHaveBeenCalledWith(PROFILER_SPAN_IDS.MINIMAP_BASE)
    expect(startSpan).toHaveBeenCalledWith(PROFILER_SPAN_IDS.MINIMAP_FOG)
    expect(startSpan).toHaveBeenCalledWith(PROFILER_SPAN_IDS.MINIMAP_ENTITIES)

    const terrainAfterFirstRender = terrainFill.mock.calls.length
    const resourceAfterFirstRender = resourceFill.mock.calls.length
    const fogAfterFirstRender = fogClear.mock.calls.length
    renderer.render(minimapCtx, minimapCanvas, mapGrid, { x: 64, y: 32 }, gameCanvas, [], [], state)
    expect(terrainFill).toHaveBeenCalledTimes(terrainAfterFirstRender)
    expect(resourceFill).toHaveBeenCalledTimes(resourceAfterFirstRender)
    expect(fogClear).toHaveBeenCalledTimes(fogAfterFirstRender)

    mapGrid[0][0].ore = true
    renderer.render(minimapCtx, minimapCanvas, mapGrid, { x: 64, y: 32 }, gameCanvas, [], [], state)
    expect(terrainFill).toHaveBeenCalledTimes(terrainAfterFirstRender)
    expect(resourceFill.mock.calls.length).toBeGreaterThan(resourceAfterFirstRender)
    const resourceAfterOre = resourceFill.mock.calls.length

    mapGrid[0][0].type = 'water'
    renderer.render(minimapCtx, minimapCanvas, mapGrid, { x: 64, y: 32 }, gameCanvas, [], [], state)
    expect(terrainFill.mock.calls.length).toBeGreaterThan(terrainAfterFirstRender)
    expect(resourceFill).toHaveBeenCalledTimes(resourceAfterOre)

    visibilityMap[0][0].visible = false
    visibilityMap[0][0].visible = true
    renderer.render(minimapCtx, minimapCanvas, mapGrid, { x: 64, y: 32 }, gameCanvas, [], [], state)
    expect(fogClear).toHaveBeenCalledTimes(fogAfterFirstRender)

    visibilityMap[0][0].visible = false
    renderer.render(minimapCtx, minimapCanvas, mapGrid, { x: 64, y: 32 }, gameCanvas, [], [], state)
    expect(fogClear).toHaveBeenCalledTimes(fogAfterFirstRender + 1)
  })

  it('attributes video rendering only to the minimap video span', () => {
    const renderer = new MinimapRenderer()
    const minimapCanvas = createCanvas(160, 96, 2)
    const gameCanvas = createCanvas(400, 240, 2)
    const minimapCtx = minimapCanvas.getContext('2d')
    vi.spyOn(videoOverlay, 'isVideoPlaying').mockReturnValue(true)
    vi.spyOn(videoOverlay, 'getCurrentVideo').mockReturnValue(null)
    const startSpan = vi.spyOn(renderProfiler, 'startSpan')

    renderer.render(
      minimapCtx,
      minimapCanvas,
      createMap(),
      { x: 0, y: 0 },
      gameCanvas,
      [],
      [],
      { radarActive: true }
    )

    expect(startSpan).toHaveBeenCalledWith(PROFILER_SPAN_IDS.MINIMAP_VIDEO)
    expect(startSpan).not.toHaveBeenCalledWith(PROFILER_SPAN_IDS.MINIMAP_BASE)
  })
})
