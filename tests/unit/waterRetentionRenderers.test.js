import { describe, expect, it, vi } from 'vitest'
import { GameWebGLRenderer } from '../../src/rendering/webglRenderer.js'
import { GameWebGPURenderer } from '../../src/rendering/webgpuRenderer.js'

function makeMapRenderer(sotMask) {
  return {
    sotMask,
    sotMaskVersion: 1,
    isStreetWaterTransitionTile(mapGrid, x, y) {
      return mapGrid[y]?.[x]?.type === 'street' && mapGrid[y]?.some(tile => tile.type === 'water')
    },
    computeSOTMask: vi.fn()
  }
}

function makeMap() {
  return [
    [{ type: 'water' }, { type: 'land' }, { type: 'street' }],
    [{ type: 'water' }, { type: 'land' }, { type: 'water' }]
  ]
}

describe('retained GPU water topology', () => {
  it('retains CPU topology buffers across camera/time-only frames', () => {
    const sotMask = [
      [null, { type: 'water', orientation: 'top-left' }, null],
      [null, null, null]
    ]
    const renderer = new GameWebGLRenderer(null, {}, makeMapRenderer(sotMask))
    const map = makeMap()

    const first = renderer.prepareRetainedWaterTopology(map, { waterOnly: true, time: 100 })
    const data = first.data
    const firstVersion = first.version
    const builds = renderer.getStatus().stats.topologyBuilds
    const second = renderer.prepareRetainedWaterTopology(map, { waterOnly: true, time: 900 })

    expect(second).toBe(first)
    expect(second.data).toBe(data)
    expect(second.version).toBe(firstVersion)
    expect(second.dirtyChunks).toHaveLength(0)
    expect(renderer.getStatus().stats.topologyBuilds).toBe(builds)
  })

  it('updates only changed topology chunks while preserving buffer identity', () => {
    const mapRenderer = makeMapRenderer([
      [null, null, null],
      [null, null, null]
    ])
    const renderer = new GameWebGLRenderer(null, {}, mapRenderer)
    const map = makeMap()
    const topology = renderer.prepareRetainedWaterTopology(map, { topologyRevision: 1 })
    const data = topology.data
    const unchangedChunkCopy = data.slice()

    map[0][0].type = 'land'
    mapRenderer.sotMaskVersion = 2
    const updated = renderer.prepareRetainedWaterTopology(map, {
      topologyRevision: 2,
      changedTopologyRanges: [{ left: 0, top: 0, right: 1, bottom: 1 }]
    })

    expect(updated).toBe(topology)
    expect(updated.data).toBe(data)
    expect(updated.dirtyChunks).toEqual([0])
    expect(updated.version).toBe(2)
    expect(updated.data).not.toEqual(unchangedChunkCopy)
  })

  it('keeps the WebGL topology buffer upload-free on clean scrolling frames', () => {
    const mapRenderer = makeMapRenderer([
      [null, null, null],
      [null, null, null]
    ])
    const renderer = new GameWebGLRenderer(null, {}, mapRenderer)
    const gl = {
      ARRAY_BUFFER: 1,
      DYNAMIC_DRAW: 2,
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      bufferSubData: vi.fn()
    }
    renderer.gl = gl
    renderer.buffers.waterTopology = { id: 'retained-water-buffer' }
    const map = makeMap()
    const first = renderer.prepareRetainedWaterTopology(map, { topologyRevision: 1 })

    renderer.uploadRetainedWaterTopology(first)
    const initialUploads = gl.bufferSubData.mock.calls.length
    const initialUploadBytes = renderer.getStatus().stats.topologyUploadBytes
    const clean = renderer.prepareRetainedWaterTopology(map, { topologyRevision: 1 })
    renderer.uploadRetainedWaterTopology(clean)

    expect(gl.bufferData).toHaveBeenCalledTimes(1)
    expect(gl.bufferSubData).toHaveBeenCalledTimes(initialUploads)
    expect(renderer.getStatus().stats.topologyUploadBytes).toBe(initialUploadBytes)

    map[0][1].type = 'water'
    const changed = renderer.prepareRetainedWaterTopology(map, {
      topologyRevision: 2,
      changedTopologyRanges: [{ x: 1, y: 0, width: 1, height: 1 }]
    })
    renderer.uploadRetainedWaterTopology(changed)

    expect(renderer.buffers.waterTopology).toEqual({ id: 'retained-water-buffer' })
    expect(gl.bufferData).toHaveBeenCalledTimes(1)
    expect(gl.bufferSubData.mock.calls.length).toBeGreaterThan(initialUploads)
  })

  it('retains topology independently for the WebGPU backend', () => {
    const renderer = new GameWebGPURenderer({}, makeMapRenderer([[null]]))
    const map = [[{ type: 'water' }]]
    const first = renderer.prepareRetainedWaterTopology(map, { topologyRevision: 7, time: 0 })
    const second = renderer.prepareRetainedWaterTopology(map, { topologyRevision: 7, time: 5000 })

    expect(second.data).toBe(first.data)
    expect(second.version).toBe(1)
    expect(renderer.getTopologyBuildSpanId()).not.toBe(
      new GameWebGLRenderer(null, {}, null).getTopologyBuildSpanId()
    )
  })

  it('invalidates only device resources across WebGL context loss and restoration', () => {
    const renderer = new GameWebGLRenderer(null, {}, makeMapRenderer([[null]]))
    const topology = renderer.prepareRetainedWaterTopology([[{ type: 'water' }]], { topologyRevision: 1 })
    renderer.program = {}
    renderer.buffers.waterTopology = { id: 'old-buffer' }

    renderer.handleContextLost()

    expect(renderer.getStatus()).toMatchObject({
      contextLost: true,
      topologyData: topology.data,
      gpuTiming: { available: false, reason: 'context-lost', milliseconds: null }
    })
    expect(renderer.program).toBeNull()
    expect(renderer.buffers).toEqual({})

    renderer.ensureInitialized = vi.fn(() => true)
    expect(renderer.handleContextRestored({ id: 'restored-context' })).toBe(true)
    expect(renderer.contextLost).toBe(false)
    expect(renderer.ensureInitialized).toHaveBeenCalledOnce()
  })

  it('binds WebGL context lifecycle listeners once', () => {
    const renderer = new GameWebGLRenderer(null, {}, null)
    const listeners = new Map()
    const canvas = {
      addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
      removeEventListener: vi.fn()
    }
    const preventDefault = vi.fn()

    renderer.bindContextEvents(canvas)
    renderer.bindContextEvents(canvas)
    listeners.get('webglcontextlost')({ preventDefault })

    expect(canvas.addEventListener).toHaveBeenCalledTimes(2)
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(renderer.getStatus()).toMatchObject({
      contextLost: true,
      gpuTiming: { available: false, reason: 'context-lost', milliseconds: null }
    })
  })

  it('labels unsupported WebGPU timestamp queries as unavailable', () => {
    const renderer = new GameWebGPURenderer({}, null)
    renderer.timestampSupported = false
    renderer.createTimestampResources()

    expect(renderer.getStatus()).toMatchObject({
      timestampCapability: 'unsupported',
      gpuTiming: {
        available: false,
        reason: 'timestamp-query-unavailable',
        milliseconds: null
      }
    })
  })

  it('requests WebGPU reinitialization on the first frame after device loss', () => {
    const renderer = new GameWebGPURenderer({}, null)
    renderer.handleDeviceLost({ message: 'device removed' })
    renderer.restore = vi.fn()

    expect(renderer.render([[{ type: 'water' }]], { x: 0, y: 0 }, {}, { waterOnly: true })).toBe(false)
    expect(renderer.restore).toHaveBeenCalledOnce()
  })
})
