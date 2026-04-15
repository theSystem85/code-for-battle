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
      'images/map/animations/64x64_9x9_q85_explosion.webp'
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
      assetPath: 'images/map/animations/64x64_9x9_q85_explosion.webp',
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

  it('uses frame sequence length as frame count for tagged animation subsets', () => {
    const animation = createSpriteSheetAnimationInstance({
      assetPath: 'images/map/animations/64x64_9x9_q85_explosion.webp',
      x: 0,
      y: 0,
      startTime: 0,
      duration: 900,
      frameSequence: [10, 11, 12]
    })

    expect(animation.frameCount).toBe(3)
    expect(getAnimationFrameIndex(animation, 0)).toBe(0)
    expect(getAnimationFrameIndex(animation, 450)).toBe(1)
    expect(getAnimationFrameIndex(animation, 900)).toBe(2)
  })
})
