import { describe, expect, it, vi } from 'vitest'
import {
  getCanvasViewportRecord,
  publishCanvasViewport,
  updateCanvasWorldViewport
} from '../../src/rendering/prepared/canvasViewportRegistry.js'
import {
  getCanvasLogicalSize,
  getCanvasPixelRatio
} from '../../src/rendering/renderingUtils.js'

describe('rendering viewport cache', () => {
  it('reuses published logical dimensions without frame-path layout reads or result allocations', () => {
    const canvas = document.createElement('canvas')
    const layoutRead = vi.spyOn(canvas, 'getBoundingClientRect')
    canvas.width = 600
    canvas.height = 300

    const record = publishCanvasViewport(canvas, {
      logicalWidth: 300,
      logicalHeight: 150,
      backingWidth: 600,
      backingHeight: 300,
      density: 2,
      playableWidth: 280,
      playableHeight: 140,
      densityGeneration: 4
    })

    const first = getCanvasLogicalSize(canvas)
    const second = getCanvasLogicalSize(canvas)
    expect(second).toBe(first)
    expect(first).toMatchObject({ width: 300, height: 150, pixelRatio: 2 })
    expect(getCanvasPixelRatio(canvas)).toBe(2)
    expect(getCanvasViewportRecord(canvas)).toBe(record)
    expect(record.playableWidth).toBe(280)
    expect(record.densityGeneration).toBe(4)
    expect(layoutRead).not.toHaveBeenCalled()
  })

  it('updates the reusable FrameViewport identity when world coordinates change', () => {
    const canvas = document.createElement('canvas')
    const record = publishCanvasViewport(canvas, {
      logicalWidth: 200,
      logicalHeight: 100,
      backingWidth: 400,
      backingHeight: 200,
      density: 2
    })
    const viewport = record.viewport
    const revision = viewport.revision

    expect(updateCanvasWorldViewport(canvas, 64, 96)).toBe(true)
    expect(record.viewport).toBe(viewport)
    expect(viewport).toMatchObject({
      revision: revision + 1,
      worldLeft: 64,
      worldTop: 96,
      worldRight: 264,
      worldBottom: 196
    })
    expect(updateCanvasWorldViewport(canvas, 64, 96)).toBe(false)
  })

  it('uses style and backing dimensions for unmanaged canvases without a DOMRect read', () => {
    const canvas = document.createElement('canvas')
    canvas.style.width = '160px'
    canvas.style.height = '90px'
    canvas.width = 320
    canvas.height = 180
    const layoutRead = vi.spyOn(canvas, 'getBoundingClientRect')

    expect(getCanvasLogicalSize(canvas)).toMatchObject({
      width: 160,
      height: 90,
      pixelRatio: 2
    })
    expect(layoutRead).not.toHaveBeenCalled()
  })
})
