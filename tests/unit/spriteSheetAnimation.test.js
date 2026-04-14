import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseSpriteSheetMetadataFromFilename,
  spawnSpriteSheetAnimation,
  renderSpriteSheetAnimations
} from '../../src/rendering/spriteSheetAnimation.js'

describe('spriteSheetAnimation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('parses sprite sheet metadata from filename segments', () => {
    expect(
      parseSpriteSheetMetadataFromFilename('images/map/animations/64x64_9x9_q85_explosion.webp')
    ).toEqual({
      tileWidth: 64,
      tileHeight: 64,
      columns: 9,
      rows: 9,
      frameCount: 81
    })
  })

  it('spawns an animation instance with metadata derived from filename', () => {
    const gameState = { simulationTime: 1234, spriteSheetAnimations: [] }
    const anim = spawnSpriteSheetAnimation(gameState, {
      texture: 'images/map/animations/64x64_9x9_q85_explosion.webp',
      x: 320,
      y: 640
    })

    expect(anim).toMatchObject({
      x: 320,
      y: 640,
      tileWidth: 64,
      tileHeight: 64,
      columns: 9,
      rows: 9,
      frameCount: 81,
      duration: 1.05,
      loop: false,
      scale: 1,
      startTime: 1234
    })
    expect(gameState.spriteSheetAnimations).toHaveLength(1)
  })

  it('renders current frame with additive blending and removes completed one-shot animations', () => {
    const gameState = { simulationTime: 1999, spriteSheetAnimations: [] }
    const anim = spawnSpriteSheetAnimation(gameState, {
      texture: 'images/map/animations/64x64_9x9_q85_explosion.webp',
      x: 96,
      y: 96,
      duration: 1
    })
    anim.startTime = 1000
    anim.image = { complete: true }

    const ctx = {
      canvas: { width: 1024, height: 768 },
      globalCompositeOperation: 'source-over',
      drawImage: vi.fn()
    }

    renderSpriteSheetAnimations(ctx, gameState, { x: 0, y: 0 })

    expect(ctx.drawImage).toHaveBeenCalledTimes(1)
    expect(ctx.drawImage.mock.calls[0].slice(1, 5)).toEqual([512, 512, 64, 64])
    expect(ctx.globalCompositeOperation).toBe('source-over')

    gameState.simulationTime = 2101
    renderSpriteSheetAnimations(ctx, gameState, { x: 0, y: 0 })
    expect(gameState.spriteSheetAnimations).toHaveLength(0)
  })
})
