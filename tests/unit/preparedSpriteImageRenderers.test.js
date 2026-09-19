import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreparedSpriteRegistry } from '../../src/rendering/prepared/preparedSpriteRegistry.js'
import {
  AIRCRAFT_RESIZE_AUDIT_TAGS,
  classifyPreparedSpriteTransform,
  disposePreparedSpriteRegistry,
  drawPreparedSpriteCentered,
  getPreparedBuildingLayer,
  getPreparedSprite,
  getPreparedSpriteCacheKey,
  prepareSpriteRegistry,
  publishPreparedSpriteRegistry,
  setAircraftResizeAuditSink
} from '../../src/rendering/prepared/preparedSpritePipeline.js'
import { getJetRenderScale, getJetResizeAuditTag, LANDED_JET_SCALE } from '../../src/rendering/jetRenderScale.js'

function createPreparedSet(entries, density = 2, assetVersion = 'test-v1') {
  const manifest = { assetVersion, entries }
  const registry = new PreparedSpriteRegistry({
    assetGeneration: 1,
    density,
    byteBudget: 1024 * 1024
  })
  for (const entry of entries) {
    const sprite = {
      id: entry.id,
      assetVersion,
      density,
      image: { width: entry.backingWidth, height: entry.backingHeight },
      backingWidth: entry.backingWidth,
      backingHeight: entry.backingHeight,
      logicalWidth: entry.logicalWidth,
      logicalHeight: entry.logicalHeight,
      sourceWidth: entry.sourceWidth || 64,
      sourceHeight: entry.sourceHeight || 64,
      anchors: entry.anchors || {},
      audit: { prepared: true }
    }
    registry.register(
      getPreparedSpriteCacheKey(assetVersion, density, entry.id),
      sprite,
      { decodedBytes: entry.backingWidth * entry.backingHeight * 4 }
    )
  }
  return { registry, manifest, density }
}

function createCanvasContext() {
  return {
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    ellipse: vi.fn()
  }
}

afterEach(() => {
  setAircraftResizeAuditSink(null)
  disposePreparedSpriteRegistry()
})

describe('prepared sprite generation and registry', () => {
  it('commits bounded WebP-85 variants with complete inventory metadata', async() => {
    const root = path.resolve(import.meta.dirname, '../..')
    const manifest = JSON.parse(await readFile(
      path.join(root, 'public/images/prepared/sprite-manifest.json'),
      'utf8'
    ))

    expect(manifest.webpQuality).toBe(85)
    expect(manifest.densities).toEqual([1, 2, 3])
    expect(manifest.inventory.entryCount).toBe(300)
    expect(manifest.entries).toHaveLength(300)
    expect(manifest.entries.every(entry =>
      entry.hasAlpha &&
      entry.alphaMode === 'straight' &&
      entry.logicalWidth > 0 &&
      entry.logicalHeight > 0 &&
      entry.variants.every(variant => variant.path.endsWith('.webp'))
    )).toBe(true)

    const apacheBodies = manifest.entries.filter(entry => entry.id.startsWith('aircraft:apache:body:'))
    expect(apacheBodies).toHaveLength(48 * 5)
    expect(new Set(apacheBodies.flatMap(entry => entry.variants.map(variant => variant.path))).size).toBe(3)

    const uniquePaths = new Set(manifest.entries.flatMap(entry => entry.variants.map(variant => variant.path)))
    await Promise.all([...uniquePaths].map(assetPath =>
      stat(path.join(root, 'public', assetPath.replace(/^\//, '')))
    ))
  })

  it('materializes a nonstandard density before publication and accounts disposal bytes', async() => {
    const closed = vi.fn()
    const manifest = {
      schemaVersion: 1,
      assetVersion: 'density-test',
      entries: [{
        id: 'unit:test:base',
        source: '/source.webp',
        sourceWidth: 10,
        sourceHeight: 20,
        logicalWidth: 10,
        logicalHeight: 20,
        hasAlpha: true,
        alphaMode: 'straight',
        anchors: {},
        states: ['base'],
        variants: [
          { density: 1, path: '/one.webp', backingWidth: 10, backingHeight: 20 },
          { density: 2, path: '/two.webp', backingWidth: 20, backingHeight: 40 }
        ]
      }]
    }
    const fakeImage = {
      naturalWidth: 10,
      naturalHeight: 20,
      width: 10,
      height: 20,
      decode: vi.fn(async() => {})
    }
    const preparedPromise = prepareSpriteRegistry({
      density: 1.25,
      byteBudget: 10_000,
      fetchImpl: vi.fn(async() => ({ ok: true, json: async() => manifest })),
      imageFactory: () => {
        const image = { ...fakeImage }
        Object.defineProperty(image, 'src', {
          set() { globalThis.queueMicrotask(() => image.onload()) }
        })
        return image
      },
      createBitmap: vi.fn(async(_image, options) => ({
        width: options.resizeWidth,
        height: options.resizeHeight,
        close: closed
      }))
    })
    const prepared = await preparedPromise

    expect(prepared.decodedBytes).toBe(13 * 25 * 4)
    publishPreparedSpriteRegistry(prepared)
    expect(getPreparedSprite('unit:test:base')).toMatchObject({
      backingWidth: 13,
      backingHeight: 25,
      density: 1.25
    })
    disposePreparedSpriteRegistry()
    expect(closed).toHaveBeenCalledOnce()
  })

  it('exposes allocation-free sprite and building-layer lookups after publication', () => {
    publishPreparedSpriteRegistry(createPreparedSet([{
      id: 'building:powerPlant:base',
      logicalWidth: 96,
      logicalHeight: 96,
      backingWidth: 192,
      backingHeight: 192
    }]))
    const first = getPreparedBuildingLayer('powerPlant')
    expect(getPreparedBuildingLayer('powerPlant')).toBe(first)
    expect(getPreparedSprite('building:powerPlant:base')).toBe(first)
  })

  it('uses native three-argument draws under the complete backing transform', () => {
    const sprite = {
      id: 'unit:test:base',
      image: {},
      logicalWidth: 32,
      logicalHeight: 16,
      backingWidth: 64,
      backingHeight: 32,
      audit: { prepared: true }
    }
    const context = createCanvasContext()
    drawPreparedSpriteCentered(context, sprite, 20, 30)

    expect(context.scale).toHaveBeenCalledWith(0.5, 0.5)
    expect(context.drawImage).toHaveBeenCalledWith(sprite.image, -32, -16)
    expect(classifyPreparedSpriteTransform({ a: 1, b: 0, c: 0, d: 1 }, sprite).native).toBe(true)
    expect(classifyPreparedSpriteTransform({ a: 1.25, b: 0, c: 0, d: 1.25 }, sprite).native).toBe(false)
  })
})

describe('prepared aircraft rendering states', () => {
  it('keeps ground and flight sizes stable and tags only real transitions', () => {
    const grounded = { airstripId: 'a', flightState: 'grounded', altitude: 0, maxAltitude: 128, f22State: 'parked' }
    const flight = { airstripId: 'a', flightState: 'airborne', altitude: 64, maxAltitude: 128, f22State: 'airborne' }
    const takeoff = { airstripId: 'a', flightState: 'takeoff', altitude: 64, maxAltitude: 128, f22State: 'liftoff' }
    const landing = { carrierId: 'c', flightState: 'landing', altitude: 64, maxAltitude: 128 }

    expect(getJetRenderScale(grounded)).toBe(LANDED_JET_SCALE)
    expect(getJetRenderScale(flight)).toBe(1)
    expect(getJetResizeAuditTag(flight)).toBeNull()
    expect(getJetResizeAuditTag(takeoff)).toBe(AIRCRAFT_RESIZE_AUDIT_TAGS.TAKEOFF)
    expect(getJetResizeAuditTag(landing)).toBe(AIRCRAFT_RESIZE_AUDIT_TAGS.LANDING)
    expect(getJetRenderScale(takeoff)).toBe((LANDED_JET_SCALE + 1) / 2)
  })

  it('renders stable F35 art natively and reports an authorized takeoff resize', async() => {
    publishPreparedSpriteRegistry(createPreparedSet([
      {
        id: 'aircraft:f35:ground',
        logicalWidth: 31.68,
        logicalHeight: 31.68,
        backingWidth: 64,
        backingHeight: 64
      },
      {
        id: 'aircraft:f35:flight',
        logicalWidth: 42.24,
        logicalHeight: 42.24,
        backingWidth: 84,
        backingHeight: 84
      }
    ]))
    const audit = vi.fn()
    setAircraftResizeAuditSink(audit)
    const { renderF35WithImage } = await import('../../src/rendering/f35ImageRenderer.js')
    const context = createCanvasContext()

    expect(renderF35WithImage(context, {
      airstripId: 'strip',
      flightState: 'grounded',
      manualFlightState: 'auto',
      direction: 0,
      altitude: 0,
      maxAltitude: 128
    }, 100, 100)).toBe(true)
    expect(audit).not.toHaveBeenCalled()
    expect(context.drawImage.mock.calls.at(-1)).toHaveLength(3)

    expect(renderF35WithImage(context, {
      airstripId: 'strip',
      flightState: 'takeoff',
      manualFlightState: 'takeoff',
      direction: 0,
      altitude: 64,
      maxAltitude: 128
    }, 100, 100)).toBe(true)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      id: 'aircraft:f35:flight',
      tag: AIRCRAFT_RESIZE_AUDIT_TAGS.TAKEOFF
    }))
  })
})
