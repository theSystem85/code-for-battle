import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildTankRotationCache,
  estimateTankRotationBytes,
  getRotatedCellSize,
  getTankRotationCacheStats,
  getTankRotationFrame,
  resetTankRotationCache
} from '../../src/rendering/tankRotationCache.js'

function sprite(width = 12, height = 20) {
  return { image: {}, backingWidth: width, backingHeight: height }
}
function completeResult(request, close = vi.fn()) {
  return {
    entries: request.spriteSets.map(set => ({
      variant: set.variant,
      parts: set.sprites.map(part => ({
        part: part.part,
        cellSize: getRotatedCellSize(part.backingWidth, part.backingHeight),
        frames: Array.from({ length: request.steps }, () => ({ close }))
      }))
    }))
  }
}

afterEach(resetTankRotationCache)

describe('worker-backed tank rotation cache', () => {
  it('[U05513] reserves final and temporary bytes before staging and publishes a full variant atomically', async() => {
    const events = []
    const release = vi.fn()
    const cache = await buildTankRotationCache({
      density: 2,
      variants: ['tankV1'],
      steps: 4,
      getSprite: (_variant, part) => sprite(part === 'barrel' ? 4 : 12, 20),
      reserveBytes: estimate => {
        events.push(['reserve', estimate])
        return { release }
      },
      prepareRotations: ({ request }) => {
        events.push(['prepare', request])
        return completeResult(request)
      }
    })
    expect(events.map(([name]) => name)).toEqual(['reserve', 'prepare'])
    expect(events[0][1].stagingBytes).toBeGreaterThan(0)
    expect(cache.entries.size).toBe(3)
    expect(getTankRotationFrame('tankV1', 'wagon', 0)).not.toBeNull()
    expect(release).not.toHaveBeenCalled()
    resetTankRotationCache()
    expect(release).toHaveBeenCalledOnce()
  })

  it('[U05514] requests only variants with every required part', async() => {
    let request
    await buildTankRotationCache({
      density: 1,
      variants: ['tankV1', 'tankV2'],
      steps: 2,
      getSprite: (variant, part) => variant === 'tankV2' && part === 'barrel' ? null : sprite(),
      prepareRotations: options => {
        request = options.request
        return completeResult(options.request)
      }
    })
    expect(request.spriteSets.map(set => set.variant)).toEqual(['tankV1'])
    expect(request.spriteSets[0].sprites.map(item => item.part)).toEqual(['wagon', 'turret', 'barrel'])
  })

  it('[U05515] refuses staging when the reservation cannot be acquired', async() => {
    const prepareRotations = vi.fn()
    const result = await buildTankRotationCache({
      density: 3,
      variants: ['tankV1'],
      getSprite: () => sprite(100, 100),
      byteLimit: 1,
      prepareRotations
    })
    expect(result).toBeNull()
    expect(prepareRotations).not.toHaveBeenCalled()
    expect(getTankRotationCacheStats().ready).toBe(false)
  })

  it('[U05516] closes every staged frame and releases bytes after partial failure', async() => {
    const close = vi.fn()
    const release = vi.fn()
    await expect(buildTankRotationCache({
      density: 1,
      variants: ['tankV1'],
      steps: 2,
      getSprite: () => sprite(),
      reserveBytes: () => ({ release }),
      prepareRotations: ({ request }) => {
        const result = completeResult(request, close)
        result.entries[0].parts.pop()
        return result
      }
    })).rejects.toThrow('Incomplete tank rotation part set')
    expect(close).toHaveBeenCalledTimes(4)
    expect(release).toHaveBeenCalledOnce()
    expect(getTankRotationCacheStats().ready).toBe(false)
  })

  it('[U05517] closes all unpublished frames when a density generation is superseded', async() => {
    const close = vi.fn()
    let finish
    const pending = new Promise(resolve => { finish = resolve })
    const first = buildTankRotationCache({
      density: 1,
      variants: ['tankV1'],
      steps: 2,
      getSprite: () => sprite(),
      prepareRotations: async({ request }) => {
        await pending
        return completeResult(request, close)
      }
    })
    await Promise.resolve()
    resetTankRotationCache()
    finish()
    expect(await first).toBeNull()
    expect(close).toHaveBeenCalledTimes(6)
  })
})

describe('tank rotation byte estimates', () => {
  it('[U05518] accounts for supersampling separately from retained frames', () => {
    const sets = [{ sprites: [{ backingWidth: 12, backingHeight: 20 }] }]
    const estimate = estimateTankRotationBytes(sets, 64, 2)
    const size = getRotatedCellSize(12, 20)
    expect(estimate.residentBytes).toBe(size ** 2 * 4 * 64)
    expect(estimate.stagingBytes).toBe(size ** 2 * 4 * 5)
  })
})
