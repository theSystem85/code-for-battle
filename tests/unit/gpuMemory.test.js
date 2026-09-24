import { describe, expect, it } from 'vitest'
import {
  estimateTextureBytes,
  formatGpuBytes,
  formatVramInUse,
  formatVramLabel,
  GpuMemoryTracker
} from '../../src/rendering/gpuMemory.js'

describe('gpu memory accounting', () => {
  it('formats WebGPU maxBufferSize like 4.0 GB', () => {
    expect(formatGpuBytes(4294967292)).toBe('4.0 GB')
    expect(formatGpuBytes(1024 ** 3)).toBe('1.0 GB')
    expect(formatGpuBytes(12.4 * 1024 * 1024)).toBe('12.4 MB')
    expect(formatGpuBytes(512)).toBe('512 B')
    expect(formatGpuBytes(Number.NaN)).toBe('n/a')
  })

  it('labels VRAM from maxBufferSize and resident bytes', () => {
    expect(formatVramLabel(4294967292)).toBe('VRAM: 4.0 GB')
    expect(formatVramLabel(null)).toBe('VRAM: n/a')
    expect(formatVramInUse(12.4 * 1024 * 1024, 4294967292)).toBe('VRAM in use: 12.4 MB / 4.0 GB (0.3%)')
    expect(formatVramInUse(null, 4294967292)).toBe('VRAM in use: n/a')
    expect(formatVramInUse(2048, null)).toBe('VRAM in use: 2.0 KB')
  })

  it('estimates texture bytes from width, height, texel size, mips, and layers', () => {
    expect(estimateTextureBytes({ width: 64, height: 32 })).toBe(64 * 32 * 4)
    expect(estimateTextureBytes({ width: 8, height: 8, bytesPerPixel: 4, mipLevels: 2, layers: 3 })).toBe(8 * 8 * 4 * 2 * 3)
  })

  it('tracks, replaces, and releases resident GPU resources without double counting', () => {
    const tracker = new GpuMemoryTracker()
    const uniform = { id: 'uniform' }
    const texture = { id: 'texture' }
    const replacement = { id: 'texture-2' }

    expect(tracker.track(uniform, 48)).toBe(48)
    expect(tracker.track(uniform, 48)).toBe(48)
    expect(tracker.track(texture, 1024)).toBe(1072)
    expect(tracker.track(texture, 2048)).toBe(2096)
    expect(tracker.release(texture)).toBe(48)
    expect(tracker.release(texture)).toBe(48)
    tracker.track(replacement, 4096)
    expect(tracker.bytesInUse).toBe(4144)
    tracker.reset()
    expect(tracker.bytesInUse).toBe(0)
    expect(tracker.bytesByResource.size).toBe(0)
  })
})
