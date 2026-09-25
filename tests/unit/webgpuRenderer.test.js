import { describe, expect, it, vi } from 'vitest'
import {
  GameWebGPURenderer,
  WEBGPU_ATLAS_TEXTURE_USAGE,
  WEBGPU_TERRAIN_SHADER
} from '../../src/rendering/webgpuRenderer.js'

describe('GameWebGPURenderer', () => {
  it('samples both atlases before any per-fragment branch', () => {
    const fragment = WEBGPU_TERRAIN_SHADER.slice(WEBGPU_TERRAIN_SHADER.indexOf('@fragment'))
    const firstBranch = fragment.search(/\bif\s*\(/)
    const sampleIndexes = [...fragment.matchAll(/textureSample\s*\(/g)].map(match => match.index)

    expect(sampleIndexes).toHaveLength(2)
    expect(Math.max(...sampleIndexes)).toBeLessThan(firstBranch)
    expect(fragment).not.toMatch(/return\s+textureSample\s*\(/)
  })

  it('packs the WebGL-compatible tile instance layout for WebGPU instancing', () => {
    const renderer = new GameWebGPURenderer({}, null)
    const packed = renderer.packInstances([{
      translation: [2, 3],
      uvRect: [0.1, 0.2, 0.3, 0.4],
      color: [1, 0.5, 0.25, 1],
      textureType: 2,
      waterEdges: [1, 0, 1, 0],
      clipOrientation: 3,
      textureSource: 1
    }])

    expect(packed).toHaveLength(17)
    expect([...packed.slice(0, 2)]).toEqual([2, 3])
    expect([...packed.slice(2, 6)]).toEqual(expect.arrayContaining([
      expect.closeTo(0.1), expect.closeTo(0.2), expect.closeTo(0.3), expect.closeTo(0.4)
    ]))
    expect([...packed.slice(10)]).toEqual([2, 1, 0, 1, 0, 3, 1])
  })

  it('returns the fallback signal while WebGPU is unavailable', () => {
    const renderer = new GameWebGPURenderer({}, null)
    renderer.status = 'failed'

    expect(renderer.render([[{ type: 'land' }]], { x: 0, y: 0 }, {}, {})).toBe(false)
  })

  it('builds instances for every terrain asset class', () => {
    const textureManager = {
      allTexturesLoaded: true,
      primarySpriteSheetImage: {},
      getIntegratedTileForMapTile: () => ({ image: textureManager.primarySpriteSheetImage, rect: { x: 0, y: 0, width: 32, height: 32 } }),
      selectStreetTileByTags: () => ({ image: streetAtlas, rect: { x: 0, y: 0, width: 32, height: 32 } })
    }
    const streetAtlas = {}
    const renderer = new GameWebGPURenderer(textureManager, null)
    renderer.atlasSize = { width: 64, height: 32 }
    renderer.secondaryAtlasSize = { width: 32, height: 32 }
    renderer.secondaryAtlasImage = streetAtlas

    const instances = renderer.buildTileInstances([[
      { type: 'land' },
      { type: 'rock' },
      { type: 'water' },
      { type: 'street' }
    ]], 0, 0, 4, 1)
    const counts = renderer.countInstances(instances)

    expect(counts.primaryAtlas).toBeGreaterThanOrEqual(2)
    expect(counts.water).toBe(1)
    expect(counts.secondaryAtlas).toBe(1)
  })

  it('does not activate WebGPU until a submitted frame validates', () => {
    const renderer = new GameWebGPURenderer({}, null)
    renderer.validationPending = true

    expect(renderer.validationComplete).toBe(false)
    expect(renderer.getStatus()).toMatchObject({ validationPending: true, validationComplete: false })
  })

  it('uploads atlas images with the usage copyExternalImageToTexture requires', () => {
    const renderer = new GameWebGPURenderer({}, null)
    const created = []
    renderer.device = {
      createTexture: (descriptor) => {
        created.push(descriptor)
        return { label: descriptor.label }
      },
      queue: {
        copyExternalImageToTexture: (_source, destination) => {
          created.push({ uploaded: destination.texture })
        }
      }
    }

    const uploaded = renderer.createTextureFromImage({ width: 8, height: 4 }, 'terrain-primary-atlas')

    expect(WEBGPU_ATLAS_TEXTURE_USAGE & 0x02).toBe(0x02)
    expect(WEBGPU_ATLAS_TEXTURE_USAGE & 0x04).toBe(0x04)
    expect(WEBGPU_ATLAS_TEXTURE_USAGE & 0x10).toBe(0x10)
    expect(created[0]).toMatchObject({
      label: 'terrain-primary-atlas',
      size: [8, 4, 1],
      format: 'rgba8unorm',
      usage: WEBGPU_ATLAS_TEXTURE_USAGE
    })
    expect(created[1].uploaded).toBe(uploaded.texture)
  })

  it('logs the full frame-validation message in the console', async() => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const renderer = new GameWebGPURenderer({}, null)
    renderer.validationPending = true
    const detail = 'Destination texture needs to have CopyDst and RenderAttachment usage flags. The terrain-primary-atlas upload was rejected.'
    renderer.device = {
      popErrorScope: () => Promise.resolve({ message: detail }),
      queue: {
        onSubmittedWorkDone: () => Promise.resolve()
      }
    }

    renderer.finishFrameValidation()
    await Promise.resolve()
    await Promise.resolve()

    const logged = warn.mock.calls.map(call => call.join(' ')).join('\n')
    expect(logged).toContain(`[WebGPU] WebGPU frame validation failed: ${detail}`)
    expect(logged.includes('...')).toBe(false)
    warn.mockRestore()
  })

  function placeholderDevice() {
    const created = []
    const writes = []
    const device = {
      createTexture: (descriptor) => {
        const texture = {
          label: descriptor.label,
          destroy: vi.fn(),
          createView: () => texture
        }
        created.push({ descriptor, texture })
        return texture
      },
      createSampler: () => ({ sampler: true }),
      createBindGroup: (descriptor) => ({ descriptor }),
      queue: {
        writeTexture: (...args) => {
          writes.push(args)
        },
        copyExternalImageToTexture: vi.fn()
      }
    }
    return { device, created, writes }
  }

  it('binds one placeholder atlas when the default map has no sprite sheet', () => {
    const renderer = new GameWebGPURenderer({}, null)
    const { device, created, writes } = placeholderDevice()
    renderer.device = device
    renderer.pipeline = { getBindGroupLayout: () => ({}) }
    renderer.uniformBuffer = { buffer: true }

    expect(renderer.syncTextures()).toBe(true)
    expect(renderer.syncTextures()).toBe(true)

    expect(created).toHaveLength(1)
    expect(created[0].descriptor).toMatchObject({
      label: 'terrain-placeholder-atlas',
      size: [1, 1, 1],
      usage: WEBGPU_ATLAS_TEXTURE_USAGE
    })
    expect(writes).toHaveLength(1)
    expect(writes[0][2]).toMatchObject({ bytesPerRow: 256 })
    expect(writes[0][1]).toHaveLength(256)
    expect(renderer.bindGroup.descriptor.entries[2].resource).toBe(renderer.bindGroup.descriptor.entries[3].resource)
  })

  it('replaces the placeholder once a sprite sheet image exists', () => {
    const renderer = new GameWebGPURenderer({}, null)
    const { device } = placeholderDevice()
    renderer.device = device
    renderer.pipeline = { getBindGroupLayout: () => ({}) }
    renderer.uniformBuffer = { buffer: true }
    expect(renderer.syncTextures()).toBe(true)

    renderer.textureManager = { primarySpriteSheetImage: { width: 4, height: 2 } }
    expect(renderer.syncTextures()).toBe(true)

    expect(renderer.usingPlaceholderAtlas).toBe(false)
    expect(device.queue.copyExternalImageToTexture).toHaveBeenCalled()
    expect(renderer.uploadedPrimaryImage).toBe(renderer.textureManager.primarySpriteSheetImage)
  })

  it('does not leave validation pending when texture sync cannot start', () => {
    const renderer = new GameWebGPURenderer({}, null)
    renderer.status = 'ready'
    renderer.syncTextures = () => false
    renderer.device = { pushErrorScope: vi.fn() }

    expect(renderer.render([[{ type: 'water' }]], { x: 0, y: 0 }, { width: 32, height: 32 }, { waterOnly: true })).toBe(false)
    expect(renderer.frameFallbackReason).toBe('texture-sync-failed')
    expect(renderer.validationPending).toBe(false)
    expect(renderer.device.pushErrorScope).not.toHaveBeenCalled()
  })

  it('names a validation-pending frame without opening another scope', () => {
    const renderer = new GameWebGPURenderer({}, null)
    renderer.status = 'ready'
    renderer.validationPending = true
    renderer.device = { pushErrorScope: vi.fn() }

    expect(renderer.render([[{ type: 'water' }]], { x: 0, y: 0 }, { width: 8, height: 8 }, {})).toBe(false)
    expect(renderer.frameFallbackReason).toBe('validation-pending')
    expect(renderer.device.pushErrorScope).not.toHaveBeenCalled()
  })

  it('names restore, not-ready, and empty-instance skips', () => {
    const restoring = new GameWebGPURenderer({}, null)
    restoring.needsRestore = true
    restoring.restore = () => {}
    expect(restoring.render([[{ type: 'water' }]], { x: 0, y: 0 }, { width: 8, height: 8 }, {})).toBe(false)
    expect(restoring.frameFallbackReason).toBe('restore')

    const starting = new GameWebGPURenderer({}, null)
    starting.beginInitialize = () => {
      starting.status = 'initializing'
    }
    expect(starting.render([[{ type: 'water' }]], { x: 0, y: 0 }, { width: 8, height: 8 }, {})).toBe(false)
    expect(starting.frameFallbackReason).toBe('not-ready')

    const empty = new GameWebGPURenderer({}, null)
    empty.status = 'ready'
    empty.syncTextures = () => true
    empty.buildTileInstances = () => []
    empty.device = { pushErrorScope: vi.fn() }
    expect(empty.render([[{ type: 'land' }]], { x: 0, y: 0 }, { width: 8, height: 8 }, {})).toBe(false)
    expect(empty.frameFallbackReason).toBe('no-instances')
    expect(empty.validationPending).toBe(false)
    expect(empty.device.pushErrorScope).not.toHaveBeenCalled()
  })

  it('schedules only one completion check for a pending validation frame', () => {
    let completionChecks = 0
    const renderer = new GameWebGPURenderer({}, null)
    renderer.validationPending = true
    renderer.device = {
      queue: {
        onSubmittedWorkDone: () => {
          completionChecks += 1
          return new Promise(() => {})
        }
      }
    }

    renderer.finishFrameValidation()
    renderer.finishFrameValidation()

    expect(completionChecks).toBe(1)
  })
})
