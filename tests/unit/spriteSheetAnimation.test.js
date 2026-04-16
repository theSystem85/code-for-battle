import { describe, it, expect } from 'vitest'
import '../setup.js'
import {
  parseSpriteSheetMetadataFromFilename,
  createSpriteSheetAnimationInstance,
  getAnimationFrameIndex
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
})
