import { expect, it, vi } from 'vitest'
import { StaticTerrainGpuPages } from '../../src/rendering/prepared/staticTerrainGpuPages.js'

it('[U07273] yields the terrain frame to the CPU when a visible page cannot be refreshed', () => {
  const chunk = { key: '0,0', chunkX: 0, chunkY: 0 }
  const pages = new StaticTerrainGpuPages({ pages: new Map([[chunk.key, chunk]]) }, null)
  pages.glState = { gl: { isContextLost: () => false } }
  const draw = vi.spyOn(pages, 'renderGl')
  const grid = [[{ type: 'land' }]]
  const mapRenderer = { chunkSize: 16, updateChunkCache: vi.fn(() => null) }

  expect(pages.render('webgl', {}, {}, { x: 0, y: 0 }, 32, 32, mapRenderer, grid)).toBe(false)
  expect(mapRenderer.updateChunkCache).toHaveBeenCalledOnce()
  expect(draw).not.toHaveBeenCalled()
})

it('[U07208] uploads visible terrain uniforms together and reuses them until the viewport changes', () => {
  const pages = new StaticTerrainGpuPages({ pages: new Map() }, null)
  const uploads = []
  const buffer = {}
  const renderPass = { setPipeline: vi.fn(), setVertexBuffer: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn(), end: vi.fn() }
  const encoder = { beginRenderPass: () => renderPass, finish: vi.fn() }
  const device = {
    createCommandEncoder: () => encoder,
    queue: {
      submit: vi.fn(),
      writeBuffer(target, offset, source, start, length) {
        expect(target).toBe(buffer)
        expect(offset).toBe(0)
        uploads.push(source.slice(start, start + length))
      }
    }
  }
  pages.gpuState = { device, uniforms: buffer, uniformData: new Float32Array(128) }
  for (const offsetX of [0, 512]) {
    pages.visible.push({ chunk: { offsetX, offsetY: 12, preparedRaster: { image: { width: 517, height: 517 } } } })
  }
  const canvas = { width: 1900, height: 1478 }
  const renderer = { context: { getCurrentTexture: () => ({ createView: vi.fn() }) } }
  const scroll = { x: 100.25, y: 93 }

  pages.renderGpu(renderer, canvas, scroll, 2)
  pages.renderGpu(renderer, canvas, scroll, 2)
  expect(uploads).toHaveLength(1)
  expect(uploads[0]).toHaveLength(128)
  expect(Array.from(uploads[0].slice(0, 8))).toEqual([-200.5, -162, 1034, 1034, 1900, 1478, 2, 2])
  expect(uploads[0][64]).toBe(823.5)
  expect(renderPass.draw).toHaveBeenCalledTimes(4)

  pages.renderGpu(renderer, canvas, { ...scroll, x: 101 }, 2)
  expect(uploads).toHaveLength(2)
  expect(uploads[1][0]).toBe(-202)
  expect(uploads[1][64]).toBe(822)

  pages.visible.shift()
  pages.renderGpu(renderer, { ...canvas, width: 1280 }, scroll, 1.5)
  expect(uploads).toHaveLength(3)
  expect(uploads[2]).toHaveLength(64)
  expect(Array.from(uploads[2].slice(0, 8))).toEqual([617.625, -121.5, 775.5, 775.5, 1280, 1478, 1.5, 1.5])
})
