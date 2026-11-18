import { expect, it, vi } from 'vitest'
import { createAtlasCropper } from '../../src/rendering/prepared/atlasCrop.worker.js'

it('[U07209] decodes an atlas once and crops the distinct rectangles at final size', async() => {
  const atlas = { width: 128, height: 64, close: vi.fn() }
  const nextAtlas = { width: 128, height: 64, close: vi.fn() }
  const first = {}, second = {}, third = {}
  const createImageBitmap = vi.fn()
    .mockResolvedValueOnce(atlas).mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    .mockResolvedValueOnce(nextAtlas).mockResolvedValueOnce(third)
  const blob = {}
  const fetch = vi.fn(async() => ({ ok: true, blob: async() => blob }))
  const crop = createAtlasCropper({ fetch, createImageBitmap })
  const request = { url: '/atlas.webp', rect: { x: 0, y: 0, width: 64, height: 64 }, width: 48, height: 48, maxSourceBytes: 32768 }

  expect(await crop(request)).toBe(first)
  expect(await crop({ ...request, rect: { ...request.rect, x: 64 } })).toBe(second)
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/atlas.webp', { credentials: 'same-origin' })
  const options = { resizeWidth: 48, resizeHeight: 48, resizeQuality: 'high' }
  expect(createImageBitmap.mock.calls).toEqual([[blob], [atlas, 0, 0, 64, 64, options], [atlas, 64, 0, 64, 64, options]])
  expect(await crop({ ...request, url: '/another-atlas.webp' })).toBe(third)
  expect(atlas.close).toHaveBeenCalledOnce()
})

it('[U07210] closes and rejects an atlas larger than its reserved bytes', async() => {
  const atlas = { width: 2, height: 2, close: vi.fn() }
  const createImageBitmap = vi.fn(async() => atlas)
  const crop = createAtlasCropper({ fetch: async() => ({ ok: true, blob: async() => ({}) }), createImageBitmap })

  await expect(crop({ url: '/too-large.webp', maxSourceBytes: 15 })).rejects.toThrow('source budget')
  expect(atlas.close).toHaveBeenCalledOnce()
  expect(createImageBitmap).toHaveBeenCalledOnce()
})
