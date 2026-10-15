import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TANK_ROTATION_STEPS,
  buildTankRotationCache,
  getRotatedCellSize,
  getRotationStepIndex,
  getTankRotationCacheStats,
  getTankRotationFrame,
  resetTankRotationCache,
  snapToDevicePixel
} from '../../src/rendering/tankRotationCache.js'
import { resolveSpriteDensityFromEvent } from '../../src/rendering/prepared/renderingPipeline.js'
import { prepareSpriteRegistry } from '../../src/rendering/prepared/preparedSpritePipeline.js'

function fakeCanvasFactory(width, height) {
  const ctx = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn()
  }
  return { width, height, getContext: () => ctx, ctx }
}

function fakeSprite(backingWidth, backingHeight) {
  return { image: { width: backingWidth, height: backingHeight }, backingWidth, backingHeight }
}

afterEach(() => {
  resetTankRotationCache()
})

describe('device pixel snapping', () => {
  it('snaps logical coordinates to whole device pixels for each DPR', () => {
    expect(snapToDevicePixel(10.4, 1)).toBe(10)
    expect(snapToDevicePixel(10.3, 2)).toBe(10.5)
    expect(snapToDevicePixel(10.2, 3)).toBeCloseTo(10 + 1 / 3, 10)
    expect(snapToDevicePixel(10.2, 3) * 3).toBeCloseTo(31, 10)
  })

  it('falls back to 1x for invalid densities', () => {
    expect(snapToDevicePixel(4.6, 0)).toBe(5)
    expect(snapToDevicePixel(4.6, NaN)).toBe(5)
  })
})

describe('tank rotation cache', () => {
  it('maps angles to the nearest of 64 steps, wrapping negatives and full turns', () => {
    const step = Math.PI * 2 / TANK_ROTATION_STEPS
    expect(getRotationStepIndex(0)).toBe(0)
    expect(getRotationStepIndex(step * 0.49)).toBe(0)
    expect(getRotationStepIndex(step * 0.51)).toBe(1)
    expect(getRotationStepIndex(-step)).toBe(TANK_ROTATION_STEPS - 1)
    expect(getRotationStepIndex(Math.PI * 2)).toBe(0)
    expect(getRotationStepIndex(Math.PI)).toBe(32)
  })

  it('uses even square cells that hold the sprite at any angle', () => {
    const size = getRotatedCellSize(66, 96)
    expect(size % 2).toBe(0)
    expect(size).toBeGreaterThanOrEqual(Math.hypot(66, 96))
  })

  it('pre-renders every part at every step and serves frames for the published sprites only', async() => {
    const sprites = {
      'tankV1:wagon': fakeSprite(66, 96),
      'tankV1:turret': fakeSprite(54, 70),
      'tankV1:barrel': fakeSprite(6, 58)
    }
    const yieldFn = vi.fn(() => Promise.resolve())
    const cache = await buildTankRotationCache({
      density: 3,
      variants: ['tankV1'],
      getSprite: (variant, part) => sprites[`${variant}:${part}`],
      canvasFactory: fakeCanvasFactory,
      yieldFn,
      sliceMs: 0
    })
    expect(cache.entries.size).toBe(3)
    expect(yieldFn).toHaveBeenCalled()
    for (const entry of cache.entries.values()) {
      expect(entry.frames).toHaveLength(TANK_ROTATION_STEPS)
      expect(entry.frames.every(Boolean)).toBe(true)
    }
    const wagonCell = getRotatedCellSize(66, 96)
    const expectedBytes = [[66, 96], [54, 70], [6, 58]]
      .reduce((sum, [w, h]) => sum + getRotatedCellSize(w, h) ** 2 * 4 * TANK_ROTATION_STEPS, 0)
    expect(getTankRotationCacheStats()).toMatchObject({ ready: true, density: 3, entries: 3, bytes: expectedBytes })

    const frame = getTankRotationFrame('tankV1', 'wagon', Math.PI, sprites['tankV1:wagon'])
    expect(frame.image).toBe(cache.entries.get('tankV1:wagon').frames[32])
    expect(frame.logicalSize).toBeCloseTo(wagonCell / 3, 10)
    // High-quality supersampled rendering: the large canvas draws rotated, the cell downsamples.
    expect(frame.image.ctx.imageSmoothingQuality).toBe('high')
    // A different (newly published) sprite object never gets stale frames.
    expect(getTankRotationFrame('tankV1', 'wagon', 0, fakeSprite(66, 96))).toBeNull()
  })

  it('returns null and keeps the live-rotation fallback while no cache exists', () => {
    expect(getTankRotationFrame('tankV2', 'wagon', 0)).toBeNull()
    expect(getTankRotationCacheStats().ready).toBe(false)
  })

  it('abandons a running build when the cache is reset (density swap)', async() => {
    let release
    const gate = new Promise(resolve => { release = resolve })
    const promise = buildTankRotationCache({
      density: 2,
      variants: ['tankV1'],
      getSprite: () => fakeSprite(10, 10),
      canvasFactory: fakeCanvasFactory,
      yieldFn: () => gate,
      sliceMs: 0
    })
    resetTankRotationCache()
    release()
    expect(await promise).toBeNull()
    expect(getTankRotationCacheStats().ready).toBe(false)
  })
})

describe('DPR variant selection', () => {
  it('reads the overlay pixel ratio from canvas-density-changed events', () => {
    expect(resolveSpriteDensityFromEvent({ pixelRatio: 2, overlayPixelRatio: 3, rawPixelRatio: 3 })).toBe(3)
    expect(resolveSpriteDensityFromEvent({ pixelRatio: 1.5 })).toBe(1.5)
    expect(Number.isNaN(resolveSpriteDensityFromEvent({}))).toBe(true)
  })

  async function prepareWith(density) {
    const manifest = {
      schemaVersion: 1,
      assetVersion: 'v-test',
      entries: [{
        id: 'unit:tankV1:wagon',
        source: '/images/map/units/tankV1_wagon.webp',
        logicalWidth: 22,
        logicalHeight: 32,
        variants: [1, 2, 3].map(d => ({ density: d, path: `/images/prepared/unit/tankV1/wagon@${d}x.webp` }))
      }]
    }
    const requested = []
    const imageFactory = () => {
      const image = { naturalWidth: 0, naturalHeight: 0 }
      Object.defineProperty(image, 'src', {
        set(url) {
          requested.push(url)
          const d = Number(/@(\d)x/.exec(url)?.[1] || 6)
          image.naturalWidth = Math.round(22 * d)
          image.naturalHeight = Math.round(32 * d)
          Promise.resolve().then(() => image.onload?.())
        },
        get() { return requested[requested.length - 1] }
      })
      return image
    }
    const prepared = await prepareSpriteRegistry({
      density,
      fetchImpl: async() => ({ ok: true, json: async() => manifest }),
      imageFactory,
      createBitmap: async(_image, options) => ({ width: options.resizeWidth, height: options.resizeHeight, close() {} })
    })
    prepared.registry.dispose() // disposal clears image.src to ''
    return requested.filter(Boolean)
  }

  it('fetches only the prepared variant matching the device pixel ratio', async() => {
    expect(await prepareWith(1)).toEqual(['/images/prepared/unit/tankV1/wagon@1x.webp'])
    expect(await prepareWith(2)).toEqual(['/images/prepared/unit/tankV1/wagon@2x.webp'])
    expect(await prepareWith(3)).toEqual(['/images/prepared/unit/tankV1/wagon@3x.webp'])
  })

  it('uses the nearest higher prepared variant (never the full-size source) for fractional DPRs', async() => {
    expect(await prepareWith(2.625)).toEqual(['/images/prepared/unit/tankV1/wagon@3x.webp'])
    expect(await prepareWith(1.5)).toEqual(['/images/prepared/unit/tankV1/wagon@2x.webp'])
  })

  it('ships @1x/@2x/@3x prepared variants for every tank part', async() => {
    const root = path.resolve(import.meta.dirname, '../..')
    const manifest = JSON.parse(await readFile(path.join(root, 'public/images/prepared/sprite-manifest.json'), 'utf8'))
    for (const variant of ['tankV1', 'tankV2', 'tankV3']) {
      for (const part of ['wagon', 'turret', 'barrel']) {
        const entry = manifest.entries.find(candidate => candidate.id === `unit:${variant}:${part}`)
        expect(entry, `${variant}:${part}`).toBeTruthy()
        expect(entry.variants.map(v => v.density).sort()).toEqual([1, 2, 3])
      }
    }
  })
})
