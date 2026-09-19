import { describe, expect, it, vi } from 'vitest'
import { decodePreparedImage, loadPreparedImage } from '../../src/rendering/prepared/imagePreparation.js'
import {
  createTerrainByteBudget,
  estimateAllResidentTerrainBytes,
  TerrainPreparationPipeline
} from '../../src/rendering/prepared/terrainPreparation.js'

const limits = (value = 1024 * 1024 * 1024) => ({
  terrainResident: value,
  terrainStaging: value,
  decodedSources: value,
  sprites: value,
  transfer: value,
  gpuStaging: value,
  minimap: value,
  effects: value
})

const gridOf = (width, height, type = 'land') => Array.from({ length: height }, (_, y) =>
  Array.from({ length: width }, (_, x) => ({
    type: x === 0 && y === 0 ? 'water' : type,
    biome: 'grass'
  })))

const assets = [
  { key: 'atlas', src: 'atlas' },
  { key: 'details', src: 'details' },
  { key: 'cliffs', src: 'cliffs' },
  { key: 'biome:grass', src: 'grass' }
]

describe('terrain preparation lifecycle', () => {
  it('waits for image decode rather than publishing at load', async() => {
    let finishDecode
    const decode = vi.fn(() => new Promise(resolve => { finishDecode = resolve }))
    const image = { naturalWidth: 16, naturalHeight: 8, decode }
    class MockImage {
      constructor() {
        Object.assign(this, image)
      }

      set src(value) {
        this.loadedSource = value
        this.onload()
      }
    }

    let settled = false
    const loading = loadPreparedImage('terrain.webp', { imageFactory: () => new MockImage() })
      .then(() => { settled = true })
    await Promise.resolve()
    expect(decode).toHaveBeenCalledOnce()
    expect(settled).toBe(false)
    finishDecode()
    await loading
    expect(settled).toBe(true)
  })

  it('publishes one complete generation and reports byte classes separately', async() => {
    const publish = vi.fn()
    const pipeline = new TerrainPreparationPipeline({
      byteBudget: createTerrainByteBudget(limits()),
      assetLoader: vi.fn(async() => ({ naturalWidth: 8, naturalHeight: 4 })),
      canvasFactory: () => null,
      onPublish: publish
    })
    const grid = gridOf(3, 2)
    grid[1][1].biomeBlend = {
      biome: 'sand',
      alpha: 0.5,
      angle: Math.PI / 4,
      featherPixels: 5
    }

    const prepared = await pipeline.prepare({
      grid,
      generation: 7,
      assetGeneration: 3,
      density: 2,
      tileSize: 32,
      assets,
      transferBytes: 64,
      gpuStagingBytes: 128
    })

    expect(publish).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledWith(prepared)
    expect(prepared.resources.descriptors.animatedWater).toEqual({
      baked: false,
      source: 'live-water-pass'
    })
    expect(prepared.byteUsage).toMatchObject({
      decodedSourceBytes: 512,
      preparedRasterBytes: 0,
      transferBytes: 64,
      gpuStagingBytes: 128
    })
    expect(pipeline.getProgress()).toMatchObject({
      state: 'ready',
      completed: assets.length + grid.length,
      total: assets.length + grid.length
    })
  })

  it('cancels stale work, exposes failure, and retries without partial publication', async() => {
    let shouldFail = true
    const publish = vi.fn()
    const pipeline = new TerrainPreparationPipeline({
      byteBudget: createTerrainByteBudget(limits()),
      assetLoader: vi.fn(async(entry, { signal }) => {
        signal.throwIfAborted()
        if (shouldFail && entry.key === 'cliffs') throw new Error('cliff decode failed')
        return { naturalWidth: 4, naturalHeight: 4 }
      }),
      canvasFactory: () => null,
      onPublish: publish
    })
    const options = {
      grid: gridOf(2, 2),
      generation: 1,
      assetGeneration: 1,
      density: 1,
      tileSize: 32,
      assets
    }

    await expect(pipeline.prepare(options)).rejects.toThrow('cliff decode failed')
    expect(pipeline.state).toBe('failed')
    expect(publish).not.toHaveBeenCalled()
    shouldFail = false
    const retried = await pipeline.retry()
    expect(retried.state).toBe('ready')
    expect(publish).toHaveBeenCalledOnce()

    const controller = new AbortController()
    controller.abort()
    await expect(pipeline.prepare({
      ...options,
      generation: 2,
      signal: controller.signal
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(publish).toHaveBeenCalledOnce()
  })

  it('reuses one descriptor generation and releases the previous generation budget', async() => {
    const budget = createTerrainByteBudget(limits())
    const pipeline = new TerrainPreparationPipeline({
      byteBudget: budget,
      assetLoader: async() => ({ naturalWidth: 4, naturalHeight: 4 }),
      canvasFactory: () => null
    })
    const options = {
      grid: gridOf(4, 4),
      generation: 1,
      assetGeneration: 1,
      density: 2,
      tileSize: 32,
      assets
    }
    const first = await pipeline.prepare(options)
    expect(await pipeline.prepare(options)).toBe(first)
    const firstDescriptors = first.resources.descriptors

    const second = await pipeline.prepare({ ...options, generation: 2 })
    expect(second.resources.descriptors).not.toBe(firstDescriptors)
    expect(first.state).toBe('disposed')
    expect(budget.getUsage().decodedSources).toBe(second.byteUsage.decodedSourceBytes)
    pipeline.dispose()
    expect(Object.values(budget.getUsage()).every(bytes => bytes === 0)).toBe(true)
  })

  it('keeps a 200x200 DPR-2 map in retained-descriptor mode under the raster limit', async() => {
    const pipeline = new TerrainPreparationPipeline({
      byteBudget: createTerrainByteBudget(limits()),
      assetLoader: async() => ({ naturalWidth: 4, naturalHeight: 4 }),
      canvasFactory: () => null,
      maxAllResidentRasterBytes: 96 * 1024 * 1024
    })
    const prepared = await pipeline.prepare({
      grid: gridOf(200, 200),
      generation: 1,
      assetGeneration: 1,
      density: 2,
      tileSize: 32,
      assets,
      rasterPageFactory: vi.fn()
    })

    expect(estimateAllResidentTerrainBytes(200, 200, 32, 2)).toBe(655_360_000)
    expect(prepared.byteUsage.allResidentRasterEstimate).toBe(655_360_000)
    expect(prepared.resources.rasterMode).toBe('retained-descriptors')
    expect(prepared.resources.rasterPages).toBeNull()
  })

  it('rejects decoded images with unusable dimensions', async() => {
    await expect(decodePreparedImage({
      naturalWidth: 0,
      naturalHeight: 0,
      decode: async() => {}
    })).rejects.toThrow(/usable dimensions/)
  })
})
