import { describe, it, expect, vi } from 'vitest'
import '../setup.js'
import {
  parseSpriteSheetMetadataFromFilename,
  createSpriteSheetAnimationInstance,
  getAnimationFrameIndex,
  getImageTextureWithBlendMode
} from '../../src/rendering/spriteSheetAnimation.js'

describe('spriteSheetAnimation', () => {
  it('parses sprite sheet metadata from filename segments', () => {
    const metadata = parseSpriteSheetMetadataFromFilename(
      'images/map/animations/64x64_9x9_generic.webp'
    )

    expect(metadata).toEqual({
      tileWidth: 64,
      tileHeight: 64,
      columns: 9,
      rows: 9,
      frameCount: 81
    })
  })

  it('throws for invalid filename conventions', () => {
    expect(() => parseSpriteSheetMetadataFromFilename('images/map/animations/explosion.webp'))
      .toThrow(/Invalid sprite sheet filename format/)
  })

  it('advances frame index by elapsed time, independent of fps', () => {
    const animation = createSpriteSheetAnimationInstance({
      assetPath: 'images/map/animations/64x64_9x9_generic.webp',
      x: 0,
      y: 0,
      startTime: 1000,
      duration: 1000,
      loop: false
    })

    expect(getAnimationFrameIndex(animation, 1000)).toBe(0)
    expect(getAnimationFrameIndex(animation, 1500)).toBe(40)
    expect(getAnimationFrameIndex(animation, 2000)).toBe(80)
    expect(getAnimationFrameIndex(animation, 3000)).toBe(80)
  })

  it('supports non-filename asset paths (e.g. dropped blob urls) when frame rects are provided', () => {
    const animation = createSpriteSheetAnimationInstance({
      assetPath: 'blob:https://example.com/1234-5678',
      x: 0,
      y: 0,
      startTime: 0,
      duration: 1000,
      loop: false,
      frameRects: [
        { x: 0, y: 0, width: 64, height: 64 },
        { x: 64, y: 0, width: 64, height: 64 },
        { x: 128, y: 0, width: 64, height: 64 }
      ]
    })

    expect(animation.columns).toBe(1)
    expect(animation.rows).toBe(1)
    expect(animation.frameCount).toBe(3)
    expect(getAnimationFrameIndex(animation, 0)).toBe(0)
    expect(getAnimationFrameIndex(animation, 500)).toBe(1)
    expect(getAnimationFrameIndex(animation, 1000)).toBe(2)
  })

  it('defaults sprite-sheet animations to black-key blending and allows alpha override', () => {
    const defaultAnimation = createSpriteSheetAnimationInstance({
      assetPath: 'images/map/animations/64x64_2x1_generic.webp',
      x: 0,
      y: 0,
      startTime: 0
    })
    const alphaAnimation = createSpriteSheetAnimationInstance({
      assetPath: 'images/map/animations/64x64_2x1_generic.webp',
      x: 0,
      y: 0,
      startTime: 0,
      blendMode: 'alpha'
    })

    expect(defaultAnimation.blendMode).toBe('black')
    expect(alphaAnimation.blendMode).toBe('alpha')
  })

  it('returns native image textures unchanged for alpha mode', () => {
    const image = {
      complete: true,
      naturalWidth: 8,
      naturalHeight: 8
    }

    expect(getImageTextureWithBlendMode(image, 'alpha')).toBe(image)
  })

  it('supports sheet-specific black-key thresholds for dark decal textures', () => {
    const originalCreateElement = document.createElement.bind(document)
    const image = {
      complete: true,
      naturalWidth: 1,
      naturalHeight: 1
    }
    const writes = []
    const contexts = [
      createMockCanvasContext([12, 12, 12, 255], writes),
      createMockCanvasContext([12, 12, 12, 255], writes)
    ]

    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      if (`${tagName}`.toLowerCase() !== 'canvas') {
        return originalCreateElement(tagName, options)
      }

      return {
        width: 0,
        height: 0,
        getContext: () => contexts.shift() || null
      }
    })

    const defaultTexture = getImageTextureWithBlendMode(image, 'black')
    const tunedTexture = getImageTextureWithBlendMode(image, 'black', {
      cutoffBrightness: 8,
      softenBrightness: 24
    })

    expect(defaultTexture).not.toBe(image)
    expect(tunedTexture).not.toBe(image)
    expect(defaultTexture).not.toBe(tunedTexture)
    expect(writes).toHaveLength(2)
    expect(writes[0][3]).toBe(0)
    expect(writes[1][3]).toBeGreaterThan(0)
  })
})

function createMockCanvasContext(rgba, writes) {
  const imageData = {
    data: new Uint8ClampedArray(rgba),
    width: 1,
    height: 1
  }

  return {
    drawImage() {},
    getImageData() {
      return {
        data: imageData.data.slice(),
        width: imageData.width,
        height: imageData.height
      }
    },
    putImageData(nextImageData) {
      writes.push(Array.from(nextImageData.data))
    }
  }
}
