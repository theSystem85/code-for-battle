import { describe, expect, it } from 'vitest'
import { setMobileCanvasPixelRatioCap } from '../../src/config.js'
import { CanvasManager } from '../../src/rendering/canvasManager.js'
import { MapRenderer } from '../../src/rendering/mapRenderer.js'
import {
  IOS_CANVAS_MEMORY_LIMIT_BYTES,
  IOS_MAX_CANVAS_PIXEL_RATIO,
  IOS_TERRAIN_RESIDENT_BUDGET_BYTES,
  chunkCanvasBytes,
  isIosWebKit,
  terrainCacheLimits
} from '../../src/rendering/iosCanvasBudget.js'

const IPHONE_13_PRO_MAX = { cssWidth: 428, cssHeight: 926, dpr: 3 }

describe('iOS canvas budget', () => {
  it('[U07266] recognises iPhone, iPad and iPadOS desktop user agents', () => {
    expect(isIosWebKit({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 })).toBe(true)
    expect(isIosWebKit({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 })).toBe(true)
    expect(isIosWebKit({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
    expect(isIosWebKit({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
    expect(isIosWebKit({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false)
  })

  it('[U07267] keeps iPhone 13 Pro Max canvases under the WebKit total canvas limit at the capped ratio', () => {
    const { cssWidth, cssHeight, dpr } = IPHONE_13_PRO_MAX
    const fullScreenBytes = (ratio) => cssWidth * ratio * cssHeight * ratio * 4
    const uncapped = fullScreenBytes(dpr) * 3
    expect(uncapped).toBeGreaterThan(40 * 1024 * 1024)

    const logicalChunk = 16 * 32 + 2 * 2 + 1
    const limits = terrainCacheLimits({
      logicalChunkPixels: logicalChunk,
      density: IOS_MAX_CANVAS_PIXEL_RATIO,
      maxCachedChunks: 56,
      ios: true
    })
    const pageBytes = chunkCanvasBytes(logicalChunk, IOS_MAX_CANVAS_PIXEL_RATIO)
    expect(limits.stagingBytes).toBe(pageBytes)
    expect(limits.maxCachedChunks).toBeLessThan(56)
    expect(limits.residentBytes).toBeLessThanOrEqual(IOS_TERRAIN_RESIDENT_BUDGET_BYTES)
    expect(fullScreenBytes(IOS_MAX_CANVAS_PIXEL_RATIO) * 3 + limits.residentBytes).toBeLessThan(IOS_CANVAS_MEMORY_LIMIT_BYTES)

    const densityThree = terrainCacheLimits({
      logicalChunkPixels: logicalChunk,
      density: dpr,
      maxCachedChunks: 56,
      ios: true
    })
    expect(densityThree.stagingBytes).toBeGreaterThan(limits.stagingBytes)
  })

  it('[U07268] leaves the desktop chunk budget on unscaled logical pixels', () => {
    const logicalChunk = 517
    const limits = terrainCacheLimits({
      logicalChunkPixels: logicalChunk,
      density: 1,
      maxCachedChunks: 48,
      ios: false
    })
    expect(limits.maxCachedChunks).toBe(48)
    expect(limits.stagingBytes).toBe(517 * 517 * 4)
    expect(limits.residentBytes).toBe(517 * 517 * 4 * 48 * 2)
  })

  it('[U07270] sizes an iPhone terrain cache for 2x pages inside the resident budget', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'userAgent')
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
    })
    try {
      const renderer = new MapRenderer({})
      const logicalChunk = 16 * 32 + 2 * 2 + 1
      expect(renderer.maxCachedChunks).toBeLessThan(56)
      expect(renderer.terrainByteBudget.limits.terrainStaging).toBe(chunkCanvasBytes(logicalChunk, IOS_MAX_CANVAS_PIXEL_RATIO))
      expect(renderer.terrainByteBudget.limits.terrainResident).toBeLessThanOrEqual(IOS_TERRAIN_RESIDENT_BUDGET_BYTES)
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'userAgent', descriptor)
    }
  })

  it('[U07269] caps terrain and overlay backing stores on an iPhone even when the saved cap is 3', () => {
    setMobileCanvasPixelRatioCap(3)
    try {
      const saved = Object.create(CanvasManager.prototype)
      saved.isTouchLayout = () => true
      saved.adaptivePixelRatioCap = 3
      saved.graphicsPixelRatioCap = Infinity
      saved.platformPixelRatioCap = Infinity
      expect(saved.resolvePixelRatio(3)).toBe(3)
      expect(saved.resolveOverlayPixelRatio(3)).toBe(3)

      const iphone = Object.create(CanvasManager.prototype)
      iphone.isTouchLayout = () => true
      iphone.adaptivePixelRatioCap = 3
      iphone.graphicsPixelRatioCap = Infinity
      iphone.platformPixelRatioCap = IOS_MAX_CANVAS_PIXEL_RATIO
      expect(iphone.resolvePixelRatio(3)).toBe(2)
      expect(iphone.resolveOverlayPixelRatio(3)).toBe(2)
    } finally {
      setMobileCanvasPixelRatioCap(2)
    }
  })
})
