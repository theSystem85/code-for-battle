import { describe, expect, it, vi } from 'vitest'
import { SPRITE_WORKER_OPERATIONS } from '../../src/rendering/spriteStreamingProtocol.js'
import { prepareTankRotationRequest } from '../../src/rendering/tankRotationWorker.js'

function canvasFactory(width, height) {
  const context = {
    setTransform: vi.fn(), clearRect: vi.fn(), translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn()
  }
  return { width, height, getContext: () => context, context }
}

describe('tank rotation worker', () => {
  it('[U05519] preserves all requested angles and transfers a complete part set', () => {
    const source = { close: vi.fn() }
    const bitmaps = []
    const result = prepareTankRotationRequest({
      operation: SPRITE_WORKER_OPERATIONS.PREPARE_ROTATIONS,
      generation: 4,
      steps: 4,
      supersample: 2,
      spriteSets: [{ variant: 'tankV1', sprites: [{ part: 'wagon', sourceIndex: 0, backingWidth: 12, backingHeight: 20 }] }]
    }, [source], {
      canvasFactory,
      bitmapFactory: () => {
        const bitmap = { close: vi.fn() }
        bitmaps.push(bitmap)
        return bitmap
      }
    })
    expect(result.entries[0].parts[0].frames).toEqual(bitmaps)
    expect(result.transfer).toEqual(bitmaps)
    expect(result.transfer).toHaveLength(4)
    expect(source.close).toHaveBeenCalledOnce()
  })

  it('[U05520] closes completed bitmaps and sources after a later part fails', () => {
    const firstBitmap = { close: vi.fn() }
    const source = { close: vi.fn() }
    let calls = 0
    expect(() => prepareTankRotationRequest({
      operation: SPRITE_WORKER_OPERATIONS.PREPARE_ROTATIONS,
      generation: 1,
      steps: 2,
      supersample: 2,
      spriteSets: [{ variant: 'tankV1', sprites: [{ part: 'wagon', sourceIndex: 0, backingWidth: 8, backingHeight: 8 }] }]
    }, [source], {
      canvasFactory,
      bitmapFactory: () => {
        if (calls++ > 0) throw new Error('bitmap failure')
        return firstBitmap
      }
    })).toThrow('bitmap failure')
    expect(firstBitmap.close).toHaveBeenCalledOnce()
    expect(source.close).toHaveBeenCalledOnce()
  })
})
