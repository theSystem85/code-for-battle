import { TILE_SIZE, WATER_EFFECT_SATURATION, WATER_EFFECT_TONE, WATER_EFFECT_ZOOM } from '../config.js'
import { GameWebGLRenderer } from './webglRenderer.js'
import { getCanvasPixelRatio } from './renderingUtils.js'

const INSTANCE_FLOATS = 17
const INSTANCE_STRIDE = INSTANCE_FLOATS * 4
const BUFFER_USAGE = { COPY_DST: 8, VERTEX: 32, UNIFORM: 64 }
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
    let p = input.worldPos * (0.052 * scale);
    let wave = (sin(p.x * 1.2 + t * 1.1) + cos(p.y * 1.35 - t * 1.25) + sin((p.x - p.y) * 0.92 + t * 0.63)) / 3.0;
    let toneBlend = clamp((uniforms.tone + 1.0) * 0.5, 0.0, 1.0);
    let deep = mix(vec3f(0.04, 0.18, 0.32), vec3f(0.09, 0.27, 0.30), toneBlend);
    let bright = mix(vec3f(0.08, 0.39, 0.58), vec3f(0.13, 0.52, 0.43), toneBlend);
    var color = applySaturation(mix(deep, bright, clamp(0.5 + wave * 0.45, 0.0, 1.0)), uniforms.saturation);
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
  constructor(textureManager, mapRenderer = null) {
    super(null, textureManager, mapRenderer)
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
    this.device = await adapter.requestDevice()
    this.context = canvas.getContext('webgpu')
    if (!this.context) throw new Error('Could not create a WebGPU canvas context')
    this.format = navigator.gpu.getPreferredCanvasFormat()
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' })
    this.device.pushErrorScope('validation')
    this.createPipeline()
    const pipelineError = await this.device.popErrorScope()
    if (pipelineError) throw new Error(`WebGPU pipeline validation failed: ${pipelineError.message}`)
    this.status = 'ready'
    this.device.lost.then(info => {
      this.status = 'failed'
      this.failureReason = info?.message || 'WebGPU device lost'
      window.logger?.warn('WebGPU device lost; using WebGL fallback:', this.failureReason)
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
          { arrayStride: INSTANCE_STRIDE, stepMode: 'instance', attributes: [
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
      size: this.instanceCapacity * INSTANCE_STRIDE,
      usage: BUFFER_USAGE.VERTEX | BUFFER_USAGE.COPY_DST
    })
  }

  packInstances(instances) {
    const data = new Float32Array(instances.length * INSTANCE_FLOATS)
    instances.forEach((instance, index) => {
      const offset = index * INSTANCE_FLOATS
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

  render(mapGrid, scrollOffset, canvas, options = {}) {
    if (!mapGrid?.length || !canvas) return false
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
    const instances = this.buildTileInstances(mapGrid, startX, startY, endX, endY, options)
    if (!instances.length) return false
    this.lastInstanceCounts = this.countInstances(instances)

    this.ensureInstanceBuffer(instances.length)
    this.device.queue.writeBuffer(this.instanceBuffer, 0, this.packInstances(instances))
    this.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array([
      canvas.width, canvas.height, scrollX, scrollY, tileSize, tileStep,
      performance.now(), WATER_EFFECT_ZOOM, WATER_EFFECT_TONE, WATER_EFFECT_SATURATION, 0, 0
    ]))
    const encoder = this.device.createCommandEncoder()
    const pass = encoder.beginRenderPass({ colorAttachments: [{
      view: this.context.getCurrentTexture().createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: 'clear',
      storeOp: 'store'
    }] })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bindGroup)
    pass.setVertexBuffer(0, this.quadBuffer)
    pass.setVertexBuffer(1, this.instanceBuffer)
    pass.draw(6, instances.length)
    pass.end()
    this.device.queue.submit([encoder.finish()])
    this.finishFrameValidation()
    return this.validationComplete
  }

  getStatus() {
    return {
      status: this.status,
      failureReason: this.failureReason,
      validationPending: this.validationPending,
      validationComplete: this.validationComplete,
      instanceCounts: this.lastInstanceCounts
    }
  }
}
