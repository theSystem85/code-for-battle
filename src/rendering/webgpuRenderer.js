import { TILE_SIZE, WATER_EFFECT_SATURATION, WATER_EFFECT_TONE, WATER_EFFECT_ZOOM } from '../config.js'
import { PROFILER_SPAN_IDS } from '../performance/profilerIds.js'
import { RENDER_COUNTER_IDS } from '../performance/renderDiagnostics.js'
import {
  GameWebGLRenderer,
  WATER_INSTANCE_FLOATS,
  WATER_INSTANCE_STRIDE
} from './webglRenderer.js'
import { getCanvasPixelRatio } from './renderingUtils.js'

const BUFFER_USAGE = { COPY_DST: 8, VERTEX: 32, UNIFORM: 64 }
const QUERY_BUFFER_USAGE = { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, QUERY_RESOLVE: 512 }
const TEXTURE_USAGE = { COPY_DST: 2, TEXTURE_BINDING: 4 }

const SHADER = `
struct Uniforms {
  resolution: vec2f,
  scroll: vec2f,
  tile: vec2f,
  time: f32,
  zoom: f32,
  tone: f32,
  saturation: f32,
  padding: vec2f,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var atlasSampler: sampler;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var secondaryAtlas: texture_2d<f32>;

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) translation: vec2f,
  @location(2) uvRect: vec4f,
  @location(3) color: vec4f,
  @location(4) textureType: f32,
  @location(5) waterEdges: vec4f,
  @location(6) clipOrientation: f32,
  @location(7) textureSource: f32,
}
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
  @location(2) textureType: f32,
  @location(3) localPos: vec2f,
  @location(4) worldPos: vec2f,
  @location(5) waterEdges: vec4f,
  @location(6) clipOrientation: f32,
  @location(7) textureSource: f32,
}
@vertex fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let worldPos = input.translation * uniforms.tile.y - uniforms.scroll + input.position * uniforms.tile.x;
  let clip = worldPos / uniforms.resolution * 2.0 - 1.0;
  output.position = vec4f(clip * vec2f(1.0, -1.0), 0.0, 1.0);
  output.uv = mix(input.uvRect.xy, input.uvRect.zw, input.position);
  output.color = input.color;
  output.textureType = input.textureType;
  output.localPos = input.position;
  output.worldPos = input.translation * uniforms.tile.y + input.position * uniforms.tile.x;
  output.waterEdges = input.waterEdges;
  output.clipOrientation = input.clipOrientation;
  output.textureSource = input.textureSource;
  return output;
}
fn applySaturation(color: vec3f, saturation: f32) -> vec3f {
  let luma = dot(color, vec3f(0.2126, 0.7152, 0.0722));
  return mix(vec3f(luma), color, max(saturation, 0.0));
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  if (input.clipOrientation > 0.5) {
    var inside = true;
    if (input.clipOrientation < 1.5) { inside = input.localPos.x + input.localPos.y <= 1.0; }
    else if (input.clipOrientation < 2.5) { inside = input.localPos.x >= input.localPos.y; }
    else if (input.clipOrientation < 3.5) { inside = input.localPos.x <= input.localPos.y; }
    else { inside = input.localPos.x + input.localPos.y >= 1.0; }
    if (!inside) { discard; }
  }
  if (input.textureType > 1.5) {
    let t = uniforms.time * 0.001;
    let scale = 1.0 / max(uniforms.zoom, 0.001);
    let flow = vec2f(
      sin(input.worldPos.y * (0.031 * scale) + t * 0.82),
      cos(input.worldPos.x * (0.029 * scale) - t * 0.74)
    );
    let p = input.worldPos * (0.052 * scale) + flow * 1.15;
    let wave = (sin(p.x * 1.2 + t * 1.1) + cos(p.y * 1.35 - t * 1.25) + sin((p.x - p.y) * 0.92 + t * 0.63)) / 3.0;
    let shimmer = 0.5 + 0.5 * sin((p.x * 1.2 - p.y * 1.05) + t * 1.65);
    let toneBlend = clamp((uniforms.tone + 1.0) * 0.5, 0.0, 1.0);
    let deep = mix(vec3f(0.04, 0.18, 0.32), vec3f(0.09, 0.27, 0.30), toneBlend);
    let bright = mix(vec3f(0.08, 0.39, 0.58), vec3f(0.13, 0.52, 0.43), toneBlend);
    var color = mix(deep, bright, clamp(0.5 + wave * 0.45, 0.0, 1.0));
    color += vec3f(0.04, 0.08, 0.10) * shimmer * 0.42;
    color = applySaturation(color, uniforms.saturation);
    var edge = 1.0;
    if (input.waterEdges.x > 0.5) { edge = min(edge, input.localPos.y); }
    if (input.waterEdges.y > 0.5) { edge = min(edge, 1.0 - input.localPos.x); }
    if (input.waterEdges.z > 0.5) { edge = min(edge, 1.0 - input.localPos.y); }
    if (input.waterEdges.w > 0.5) { edge = min(edge, input.localPos.x); }
    if (edge < 0.09) { color += vec3f(0.03, 0.05, 0.05); }
    return vec4f(color, 1.0);
  }
  if (input.textureType > 0.5) {
    if (input.textureSource > 0.5) { return textureSample(secondaryAtlas, atlasSampler, input.uv); }
    return textureSample(atlas, atlasSampler, input.uv);
  }
  return input.color;
}`

export class GameWebGPURenderer extends GameWebGLRenderer {
  constructor(textureManager, mapRenderer = null, options = {}) {
    super(null, textureManager, mapRenderer, options)
    this.status = 'idle'
    this.failureReason = null
    this.device = null
    this.context = null
    this.pipeline = null
    this.bindGroup = null
    this.instanceBuffer = null
    this.instanceCapacity = 0
    this.primaryTexture = null
    this.secondaryTexture = null
    this.uploadedPrimaryImage = null
    this.uploadedSecondaryImage = null
    this.validationPending = false
    this.validationCheckScheduled = false
    this.validationComplete = false
    this.lastInstanceCounts = null
    this.timestampSupported = false
    this.timestampQuerySet = null
    this.timestampResolveBuffer = null
    this.timestampReadBuffer = null
    this.timestampReadPending = false
    this.uniformData = new Float32Array(12)
    this.gpuTiming = { available: false, reason: 'not-initialized', milliseconds: null }
    this.needsRestore = false
    this.capabilityUpdate.backend = 'webgpu'
  }

  getTopologyBuildSpanId() {
    return PROFILER_SPAN_IDS.WEBGPU_PACK
  }

  beginInitialize(canvas) {
    if (this.status !== 'idle') return
    this.status = 'initializing'
    this.initialize(canvas).catch(error => {
      this.status = 'failed'
      this.failureReason = error?.message || String(error)
      window.logger?.warn('WebGPU terrain initialization failed; using WebGL fallback:', error)
    })
  }

  async initialize(canvas) {
    if (!navigator?.gpu || !canvas?.getContext) throw new Error('WebGPU is unavailable')
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('No WebGPU adapter is available')
    this.timestampSupported = Boolean(adapter.features?.has?.('timestamp-query'))
    this.device = await adapter.requestDevice(this.timestampSupported
      ? { requiredFeatures: ['timestamp-query'] }
      : undefined)
    this.context = canvas.getContext('webgpu')
    if (!this.context) throw new Error('Could not create a WebGPU canvas context')
    this.format = navigator.gpu.getPreferredCanvasFormat()
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' })
    this.device.pushErrorScope('validation')
    this.createPipeline()
    this.createTimestampResources()
    const pipelineError = await this.device.popErrorScope()
    if (pipelineError) throw new Error(`WebGPU pipeline validation failed: ${pipelineError.message}`)
    this.status = 'ready'
    this.device.lost.then(info => {
      this.handleDeviceLost(info)
    })
  }

  createPipeline() {
    const module = this.device.createShaderModule({ code: SHADER })
    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vertexMain',
        buffers: [
          { arrayStride: 8, stepMode: 'vertex', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
          { arrayStride: WATER_INSTANCE_STRIDE, stepMode: 'instance', attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x2' },
            { shaderLocation: 2, offset: 8, format: 'float32x4' },
            { shaderLocation: 3, offset: 24, format: 'float32x4' },
            { shaderLocation: 4, offset: 40, format: 'float32' },
            { shaderLocation: 5, offset: 44, format: 'float32x4' },
            { shaderLocation: 6, offset: 60, format: 'float32' },
            { shaderLocation: 7, offset: 64, format: 'float32' }
          ] }
        ]
      },
      fragment: {
        module,
        entryPoint: 'fragmentMain',
        targets: [{ format: this.format, blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
        } }]
      },
      primitive: { topology: 'triangle-list' }
    })
    this.uniformBuffer = this.device.createBuffer({ size: 48, usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST })
    this.quadBuffer = this.device.createBuffer({ size: 48, usage: BUFFER_USAGE.VERTEX | BUFFER_USAGE.COPY_DST })
    this.device.queue.writeBuffer(this.quadBuffer, 0, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]))
    this.stats.topologyUploadBytes += 48
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.UPLOAD_BYTES, 48)
  }

  createTimestampResources() {
    if (!this.timestampSupported) {
      this.gpuTiming = { available: false, reason: 'timestamp-query-unavailable', milliseconds: null }
      this.diagnostics.setCapabilities({ backend: 'webgpu', gpuTiming: this.gpuTiming })
      return
    }
    this.timestampQuerySet = this.device.createQuerySet({ type: 'timestamp', count: 2 })
    this.timestampResolveBuffer = this.device.createBuffer({
      size: 16,
      usage: QUERY_BUFFER_USAGE.QUERY_RESOLVE | QUERY_BUFFER_USAGE.COPY_SRC
    })
    this.timestampReadBuffer = this.device.createBuffer({
      size: 16,
      usage: QUERY_BUFFER_USAGE.COPY_DST | QUERY_BUFFER_USAGE.MAP_READ
    })
    this.gpuTiming = { available: false, reason: 'pending-first-valid-sample', milliseconds: null }
    this.diagnostics.setCapabilities({ backend: 'webgpu', gpuTiming: this.gpuTiming })
  }

  handleDeviceLost(info = null) {
    this.status = 'failed'
    this.failureReason = info?.message || 'WebGPU device lost'
    this.needsRestore = true
    this.timestampReadPending = false
    this.gpuTiming = { available: false, reason: 'device-lost', milliseconds: null }
    this.diagnostics.setCapabilities({ backend: 'webgpu', gpuTiming: this.gpuTiming })
    if (typeof window !== 'undefined') {
      window.logger?.warn('WebGPU device lost; using WebGL fallback:', this.failureReason)
    }
  }

  restore(canvas) {
    this.status = 'idle'
    this.failureReason = null
    this.device = null
    this.context = null
    this.pipeline = null
    this.bindGroup = null
    this.instanceBuffer = null
    this.instanceCapacity = 0
    this.uploadedWaterTopology = null
    this.uploadedWaterTopologyVersion = -1
    this.primaryTexture = null
    this.secondaryTexture = null
    this.uploadedPrimaryImage = null
    this.uploadedSecondaryImage = null
    this.validationPending = false
    this.validationCheckScheduled = false
    this.validationComplete = false
    this.timestampReadPending = false
    this.needsRestore = false
    this.beginInitialize(canvas)
  }

  getTimestampWrites() {
    if (!this.timestampQuerySet || this.timestampReadPending) return undefined
    return {
      querySet: this.timestampQuerySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1
    }
  }

  resolveTimestampQuery(encoder, timestampWrites) {
    if (!timestampWrites) return
    encoder.resolveQuerySet(this.timestampQuerySet, 0, 2, this.timestampResolveBuffer, 0)
    encoder.copyBufferToBuffer(this.timestampResolveBuffer, 0, this.timestampReadBuffer, 0, 16)
    this.timestampReadPending = true
  }

  readTimestampQuery() {
    if (!this.timestampReadPending) return
    const readMode = globalThis.GPUMapMode?.READ ?? 1
    this.timestampReadBuffer.mapAsync(readMode).then(() => {
      const values = new BigUint64Array(this.timestampReadBuffer.getMappedRange())
      const elapsed = values[1] >= values[0] ? Number(values[1] - values[0]) : NaN
      this.timestampReadBuffer.unmap()
      this.timestampReadPending = false
      if (!Number.isFinite(elapsed) || elapsed < 0) {
        this.gpuTiming = { available: false, reason: 'invalid-reading-discarded', milliseconds: null }
      } else {
        this.gpuTiming = { available: true, reason: null, milliseconds: elapsed / 1e6 }
      }
      this.diagnostics.setCapabilities({ backend: 'webgpu', gpuTiming: this.gpuTiming })
    }).catch(() => {
      this.timestampReadPending = false
      this.gpuTiming = { available: false, reason: 'timestamp-read-failed', milliseconds: null }
      this.diagnostics.setCapabilities({ backend: 'webgpu', gpuTiming: this.gpuTiming })
    })
  }

  createTextureFromImage(image) {
    const width = image.width || image.naturalWidth || 1
    const height = image.height || image.naturalHeight || 1
    const texture = this.device.createTexture({
      size: [width, height, 1],
      format: 'rgba8unorm',
      usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST
    })
    this.device.queue.copyExternalImageToTexture({ source: image }, { texture }, [width, height])
    const uploadBytes = width * height * 4
    this.stats.textureUploadBytes += uploadBytes
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.UPLOAD_BYTES, uploadBytes)
    return { texture, width, height }
  }

  syncTextures() {
    const primaryImage = this.textureManager?.spriteImage
    if (!primaryImage) return false
    const secondaryImage = this.getSecondaryAtlasImage() || primaryImage
    let changed = false
    if (primaryImage !== this.uploadedPrimaryImage) {
      this.primaryTexture?.destroy?.()
      const uploaded = this.createTextureFromImage(primaryImage)
      this.primaryTexture = uploaded.texture
      this.atlasSize = { width: uploaded.width, height: uploaded.height }
      this.uploadedPrimaryImage = primaryImage
      changed = true
    }
    if (secondaryImage !== this.uploadedSecondaryImage) {
      this.secondaryTexture?.destroy?.()
      const uploaded = this.createTextureFromImage(secondaryImage)
      this.secondaryTexture = uploaded.texture
      this.secondaryAtlasSize = { width: uploaded.width, height: uploaded.height }
      this.secondaryAtlasImage = secondaryImage
      this.uploadedSecondaryImage = secondaryImage
      changed = true
    }
    if (changed || !this.bindGroup) {
      const sampler = this.device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' })
      this.bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: sampler },
          { binding: 2, resource: this.primaryTexture.createView() },
          { binding: 3, resource: this.secondaryTexture.createView() }
        ]
      })
    }
    return true
  }

  beginFrameValidation() {
    if (this.validationPending || this.validationComplete) return
    this.validationPending = true
    this.device.pushErrorScope('validation')
  }

  finishFrameValidation() {
    if (!this.validationPending || this.validationComplete || this.validationCheckScheduled) return
    this.validationCheckScheduled = true
    this.device.queue.onSubmittedWorkDone().then(async() => {
      const error = await this.device.popErrorScope()
      this.validationPending = false
      this.validationCheckScheduled = false
      if (error) {
        this.status = 'failed'
        this.failureReason = `WebGPU frame validation failed: ${error.message}`
        window.logger?.warn(`${this.failureReason}; using WebGL fallback`)
        return
      }
      this.validationComplete = true
    }).catch(error => {
      this.validationPending = false
      this.validationCheckScheduled = false
      this.status = 'failed'
      this.failureReason = error?.message || String(error)
    })
  }

  countInstances(instances) {
    return instances.reduce((counts, instance) => {
      const key = instance.textureType > 1.5
        ? 'water'
        : instance.textureSource > 0.5
          ? 'secondaryAtlas'
          : instance.textureType > 0.5 ? 'primaryAtlas' : 'color'
      counts[key] = (counts[key] || 0) + 1
      return counts
    }, { water: 0, primaryAtlas: 0, secondaryAtlas: 0, color: 0 })
  }

  ensureInstanceBuffer(count) {
    if (this.instanceBuffer && count <= this.instanceCapacity) return
    this.instanceBuffer?.destroy?.()
    this.instanceCapacity = Math.max(256, 2 ** Math.ceil(Math.log2(Math.max(1, count))))
    this.instanceBuffer = this.device.createBuffer({
      size: this.instanceCapacity * WATER_INSTANCE_STRIDE,
      usage: BUFFER_USAGE.VERTEX | BUFFER_USAGE.COPY_DST
    })
  }

  packInstances(instances) {
    const data = new Float32Array(instances.length * WATER_INSTANCE_FLOATS)
    instances.forEach((instance, index) => {
      const offset = index * WATER_INSTANCE_FLOATS
      data.set(instance.translation, offset)
      data.set(instance.uvRect, offset + 2)
      data.set(instance.color, offset + 6)
      data[offset + 10] = instance.textureType
      data.set(instance.waterEdges, offset + 11)
      data[offset + 15] = instance.clipOrientation
      data[offset + 16] = instance.textureSource || 0
    })
    return data
  }

  uploadRetainedWaterTopology(topology) {
    const requiredCapacity = topology.data.length / WATER_INSTANCE_FLOATS
    const uploadToken = this.profiler.startSpan(PROFILER_SPAN_IDS.WEBGPU_UPLOAD)
    const newAllocation = !this.instanceBuffer || this.instanceCapacity < requiredCapacity ||
      this.uploadedWaterTopology !== topology
    if (newAllocation) {
      this.instanceBuffer?.destroy?.()
      this.instanceCapacity = requiredCapacity
      this.instanceBuffer = this.device.createBuffer({
        size: requiredCapacity * WATER_INSTANCE_STRIDE,
        usage: BUFFER_USAGE.VERTEX | BUFFER_USAGE.COPY_DST
      })
      this.uploadedWaterTopology = topology
      this.uploadedWaterTopologyVersion = -1
    }
    if (this.uploadedWaterTopologyVersion === topology.version) {
      this.profiler.endSpan(uploadToken)
      return
    }

    const chunkCapacity = topology.slotsPerPlane / topology.chunkCount
    let uploadedBytes = 0
    const uploadChunk = chunkIndex => {
      const baseSlot = chunkIndex * chunkCapacity
      const baseCount = topology.baseCounts[chunkIndex]
      const sotSlot = topology.slotsPerPlane + baseSlot
      const sotCount = topology.sotCounts[chunkIndex]
      if (baseCount) {
        this.device.queue.writeBuffer(
          this.instanceBuffer,
          baseSlot * WATER_INSTANCE_STRIDE,
          topology.data,
          baseSlot * WATER_INSTANCE_FLOATS,
          baseCount * WATER_INSTANCE_FLOATS
        )
        uploadedBytes += baseCount * WATER_INSTANCE_STRIDE
      }
      if (sotCount) {
        this.device.queue.writeBuffer(
          this.instanceBuffer,
          sotSlot * WATER_INSTANCE_STRIDE,
          topology.data,
          sotSlot * WATER_INSTANCE_FLOATS,
          sotCount * WATER_INSTANCE_FLOATS
        )
        uploadedBytes += sotCount * WATER_INSTANCE_STRIDE
      }
    }
    if (newAllocation || this.uploadedWaterTopologyVersion < 0) {
      for (let index = 0; index < topology.chunkCount; index++) uploadChunk(index)
    } else {
      for (const chunkIndex of topology.dirtyChunks) uploadChunk(chunkIndex)
    }
    this.uploadedWaterTopologyVersion = topology.version
    this.stats.topologyUploadBytes += uploadedBytes
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.UPLOAD_BYTES, uploadedBytes)
    this.profiler.endSpan(uploadToken)
  }

  drawRetainedWaterPlane(pass, topology, firstChunkX, firstChunkY, lastChunkX, lastChunkY, overlay) {
    const chunkCapacity = topology.slotsPerPlane / topology.chunkCount
    const planeOffset = overlay ? topology.slotsPerPlane : 0
    const counts = overlay ? topology.sotCounts : topology.baseCounts
    let drawCalls = 0
    for (let chunkY = firstChunkY; chunkY <= lastChunkY; chunkY++) {
      for (let chunkX = firstChunkX; chunkX <= lastChunkX; chunkX++) {
        const chunkIndex = chunkY * topology.chunkColumns + chunkX
        const count = counts[chunkIndex]
        if (!count) continue
        const firstSlot = planeOffset + chunkIndex * chunkCapacity
        pass.setVertexBuffer(
          1,
          this.instanceBuffer,
          firstSlot * WATER_INSTANCE_STRIDE,
          count * WATER_INSTANCE_STRIDE
        )
        pass.draw(6, count)
        drawCalls++
      }
    }
    return drawCalls
  }

  renderRetainedWater(mapGrid, scrollOffset, canvas, options, dimensions) {
    const topology = this.prepareRetainedWaterTopology(mapGrid, options)
    this.uploadRetainedWaterTopology(topology)
    const sampledTime = Number.isFinite(options.time) ? options.time : performance.now()
    this.uniformData[0] = canvas.width
    this.uniformData[1] = canvas.height
    this.uniformData[2] = dimensions.scrollX
    this.uniformData[3] = dimensions.scrollY
    this.uniformData[4] = dimensions.tileSize
    this.uniformData[5] = dimensions.tileStep
    this.uniformData[6] = sampledTime
    this.uniformData[7] = WATER_EFFECT_ZOOM
    this.uniformData[8] = WATER_EFFECT_TONE
    this.uniformData[9] = WATER_EFFECT_SATURATION
    this.uniformData[10] = 0
    this.uniformData[11] = 0
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData)
    this.stats.uniformUploadBytes += this.uniformData.byteLength
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.UPLOAD_BYTES, this.uniformData.byteLength)
    this.capabilityUpdate.devicePixelRatio = dimensions.ratio
    this.diagnostics.setCapabilities(this.capabilityUpdate)

    const timestampWrites = this.getTimestampWrites()
    const encoder = this.device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      }],
      ...(timestampWrites ? { timestampWrites } : {})
    })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bindGroup)
    pass.setVertexBuffer(0, this.quadBuffer)

    const firstChunkX = Math.floor(dimensions.startX / 16)
    const firstChunkY = Math.floor(dimensions.startY / 16)
    const lastChunkX = Math.floor(Math.max(dimensions.startX, dimensions.endX - 1) / 16)
    const lastChunkY = Math.floor(Math.max(dimensions.startY, dimensions.endY - 1) / 16)
    const submitToken = this.profiler.startSpan(PROFILER_SPAN_IDS.WEBGPU_SUBMIT)
    let drawCalls = this.drawRetainedWaterPlane(
      pass,
      topology,
      firstChunkX,
      firstChunkY,
      lastChunkX,
      lastChunkY,
      false
    )
    drawCalls += this.drawRetainedWaterPlane(
      pass,
      topology,
      firstChunkX,
      firstChunkY,
      lastChunkX,
      lastChunkY,
      true
    )
    pass.end()
    this.resolveTimestampQuery(encoder, timestampWrites)
    this.device.queue.submit([encoder.finish()])
    this.profiler.endSpan(submitToken)
    if (timestampWrites) this.readTimestampQuery()
    this.stats.drawCalls += drawCalls
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.DRAW_CALLS, drawCalls)
    this.finishFrameValidation()
    return this.validationComplete
  }

  render(mapGrid, scrollOffset, canvas, options = {}) {
    if (!mapGrid?.length || !canvas) return false
    if (this.needsRestore) {
      this.restore(canvas)
      return false
    }
    if (this.status === 'idle') this.beginInitialize(canvas)
    if (this.status !== 'ready') return false
    this.beginFrameValidation()
    try {
      if (!this.syncTextures()) return false
    } catch (error) {
      this.status = 'failed'
      this.failureReason = error?.message || String(error)
      return false
    }
    const ratio = getCanvasPixelRatio(canvas)
    const tileStep = TILE_SIZE * ratio
    const tileSize = (TILE_SIZE + 1) * ratio
    const scrollX = (scrollOffset?.x || 0) * ratio
    const scrollY = (scrollOffset?.y || 0) * ratio
    const buffer = 2
    const startX = Math.max(0, Math.floor(scrollX / tileStep) - buffer)
    const startY = Math.max(0, Math.floor(scrollY / tileStep) - buffer)
    const endX = Math.min(mapGrid[0].length, startX + Math.ceil(canvas.width / tileStep) + buffer * 2 + 1)
    const endY = Math.min(mapGrid.length, startY + Math.ceil(canvas.height / tileStep) + buffer * 2 + 1)
    if (options.waterOnly) {
      return this.renderRetainedWater(mapGrid, scrollOffset, canvas, options, {
        ratio,
        tileStep,
        tileSize,
        scrollX,
        scrollY,
        startX,
        startY,
        endX,
        endY
      })
    }
    const instances = this.buildTileInstances(mapGrid, startX, startY, endX, endY, options)
    if (!instances.length) return false
    this.lastInstanceCounts = this.countInstances(instances)

    this.ensureInstanceBuffer(instances.length)
    const packed = this.packInstances(instances)
    this.device.queue.writeBuffer(this.instanceBuffer, 0, packed)
    this.uniformData.set([
      canvas.width, canvas.height, scrollX, scrollY, tileSize, tileStep,
      Number.isFinite(options.time) ? options.time : performance.now(),
      WATER_EFFECT_ZOOM, WATER_EFFECT_TONE, WATER_EFFECT_SATURATION, 0, 0
    ])
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData)
    const uploadBytes = packed.byteLength + this.uniformData.byteLength
    this.stats.topologyUploadBytes += packed.byteLength
    this.stats.uniformUploadBytes += this.uniformData.byteLength
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.UPLOAD_BYTES, uploadBytes)
    this.capabilityUpdate.devicePixelRatio = ratio
    this.diagnostics.setCapabilities(this.capabilityUpdate)
    const timestampWrites = this.getTimestampWrites()
    const encoder = this.device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      }],
      ...(timestampWrites ? { timestampWrites } : {})
    })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bindGroup)
    pass.setVertexBuffer(0, this.quadBuffer)
    pass.setVertexBuffer(1, this.instanceBuffer)
    pass.draw(6, instances.length)
    pass.end()
    this.resolveTimestampQuery(encoder, timestampWrites)
    this.device.queue.submit([encoder.finish()])
    if (timestampWrites) this.readTimestampQuery()
    this.stats.drawCalls++
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.DRAW_CALLS)
    this.finishFrameValidation()
    return this.validationComplete
  }

  getStatus() {
    return {
      status: this.status,
      failureReason: this.failureReason,
      validationPending: this.validationPending,
      validationComplete: this.validationComplete,
      instanceCounts: this.lastInstanceCounts,
      topologyRevision: this.waterTopology?.revision ?? null,
      topologyBuffer: this.instanceBuffer,
      topologyData: this.waterTopology?.data || null,
      timestampCapability: this.timestampSupported ? 'supported' : 'unsupported',
      gpuTiming: { ...this.gpuTiming },
      stats: { ...this.stats }
    }
  }
}
