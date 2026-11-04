import { getCanvasPixelRatio } from '../renderingUtils.js'
import { TILE_SIZE } from '../../config.js'

// Immutable world-pixel terrain textures. The oversized-map streaming renderer
// already rasterizes ground at one texel per world pixel. Keep that exact
// sampling grid, upload it before play, and present at the native GPU viewport;
// do not resize source images on the Canvas render path or lower canvas DPR.
const QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1])
const BUFFER = Object.freeze({ MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, VERTEX: 32, UNIFORM: 64, QUERY_RESOLVE: 512 })
const TEXTURE = Object.freeze({ COPY_DST: 2, TEXTURE_BINDING: 4, RENDER_ATTACHMENT: 16 })
const RETAINED_OPTIONS = Object.freeze({ skipWaterBase: true, skipWaterSot: true, countHit: false, countMiss: false })
const VERTEX = `#version 300 es
in vec2 position;
uniform vec4 worldRect;
uniform vec2 viewport;
void main() {
  vec2 first = floor(worldRect.xy + 0.5);
  vec2 last = floor(worldRect.xy + worldRect.zw + 0.5);
  vec2 p = mix(first, last, position) / viewport;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D image;
uniform vec4 worldRect;
uniform vec2 viewport;
uniform vec2 scale;
out vec4 color;
void main() {
  vec2 position = vec2(gl_FragCoord.x, viewport.y - gl_FragCoord.y);
  // Match Canvas nearest sampling at exact texel boundaries (lower texel).
  ivec2 pixel = ivec2(floor((position - worldRect.xy) / scale - vec2(0.0001)));
  color = texelFetch(image, clamp(pixel, ivec2(0), textureSize(image, 0) - 1), 0);
}`
const WGSL = `
struct Uniforms { rect: vec4f, viewport: vec2f, scale: vec2f }
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var image: texture_2d<f32>;
@group(0) @binding(2) var imageSampler: sampler;
struct Output { @builtin(position) position: vec4f }
@vertex fn vertexMain(@location(0) position: vec2f) -> Output {
  let first = floor(uniforms.rect.xy + vec2f(0.5));
  let last = floor(uniforms.rect.xy + uniforms.rect.zw + vec2f(0.5));
  let p = mix(first, last, position) / uniforms.viewport;
  var output: Output;
  output.position = vec4f(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  return output;
}
@fragment fn fragmentMain(input: Output) -> @location(0) vec4f {
  let pixel = vec2i(floor((input.position.xy - uniforms.rect.xy) / uniforms.scale - vec2f(0.0001)));
  return textureLoad(image, clamp(pixel, vec2i(0), vec2i(textureDimensions(image)) - vec2i(1)), 0);
}`

export class StaticTerrainGpuPages {
  constructor(pages, budget) {
    this.pages = pages
    this.budget = budget
    this.records = new Map()
    this.visible = []
    this.uniforms = new Float32Array(8)
    this.dynamicOffset = new Uint32Array(1)
    this.stats = { bytes: 0, uploads: 0, uploadBytes: 0, rebuilds: 0, drawCalls: 0, active: false, gpuMilliseconds: null }
    this.glState = null
    this.gpuState = null
    for (const chunk of pages.pages.values()) this.records.set(chunk.key, { chunk, gl: null, gpu: null, glImage: null, gpuImage: null })
  }

  prepareGl(gl) {
    if (this.glState?.gl === gl && !gl.isContextLost()) return
    if (!gl || gl.isContextLost()) throw new Error('WebGL terrain upload unavailable')
    this.releaseGl()
    const bytes = this.pages.bytes + QUAD.byteLength
    const token = this.budget.reserve('gpuTerrain', bytes)
    const state = { gl, token, bytes, program: null, buffer: null, vao: null, shaders: [] }
    this.glState = state
    state.onLost = () => { state.lost = true }
    state.onRestore = () => this.releaseGl()
    gl.canvas.addEventListener('webglcontextlost', state.onLost)
    gl.canvas.addEventListener('webglcontextrestored', state.onRestore)
    try {
      const compile = (type, source) => {
        const shader = gl.createShader(type)
        state.shaders.push(shader)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
        return shader
      }
      state.program = gl.createProgram()
      gl.attachShader(state.program, compile(gl.VERTEX_SHADER, VERTEX))
      gl.attachShader(state.program, compile(gl.FRAGMENT_SHADER, FRAGMENT))
      gl.linkProgram(state.program)
      if (!gl.getProgramParameter(state.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(state.program))
      state.rect = gl.getUniformLocation(state.program, 'worldRect')
      state.viewport = gl.getUniformLocation(state.program, 'viewport')
      state.scale = gl.getUniformLocation(state.program, 'scale')
      state.image = gl.getUniformLocation(state.program, 'image')
      state.vao = gl.createVertexArray()
      state.buffer = gl.createBuffer()
      gl.bindVertexArray(state.vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer)
      gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW)
      const position = gl.getAttribLocation(state.program, 'position')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      for (const record of this.records.values()) {
        record.gl = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, record.gl)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        this.uploadGl(record, true)
      }
      gl.bindVertexArray(null)
      this.stats.bytes = bytes + (this.gpuState?.bytes || 0)
    } catch (error) { this.releaseGl(); throw error }
  }

  async waitGlReady() {
    const state = this.glState
    if (!state) throw new Error('WebGL terrain upload unavailable')
    const gl = state.gl
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    if (!fence) throw new Error('WebGL terrain upload fence unavailable')
    gl.flush()
    const deadline = performance.now() + 10000
    try {
      for (;;) {
        if (this.glState !== state || gl.isContextLost()) throw new Error('WebGL terrain upload interrupted')
        const status = gl.clientWaitSync(fence, 0, 0)
        if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) return
        if (status === gl.WAIT_FAILED || performance.now() > deadline) throw new Error('WebGL terrain upload did not complete')
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    } finally { gl.deleteSync(fence) }
  }

  prepareGpu(renderer) {
    const { device, format } = renderer
    if (!device || renderer.status !== 'ready') throw new Error('WebGPU terrain upload unavailable')
    if (this.gpuState?.device === device) return
    this.releaseGpu()
    const timing = renderer.timestampSupported && globalThis.__CFB_TERRAIN_GPU_TIMING__
    const bytes = this.pages.bytes + this.records.size * 256 + QUAD.byteLength + (timing ? 48 : 0)
    const token = this.budget.reserve('gpuTerrain', bytes)
    const state = { device, token, bytes, buffer: null, uniforms: null }
    this.gpuState = state
    try {
      const module = device.createShaderModule({ code: WGSL })
      state.layout = device.createBindGroupLayout({ entries: [
        { binding: 0, visibility: 3, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 32 } },
        { binding: 1, visibility: 2, texture: { sampleType: 'float' } },
        { binding: 2, visibility: 2, sampler: { type: 'filtering' } }
      ] })
      state.pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [state.layout] }),
        vertex: { module, entryPoint: 'vertexMain', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
        fragment: { module, entryPoint: 'fragmentMain', targets: [{ format, blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
        } }] },
        primitive: { topology: 'triangle-list' }
      })
      state.buffer = device.createBuffer({ size: QUAD.byteLength, usage: BUFFER.VERTEX | BUFFER.COPY_DST })
      device.queue.writeBuffer(state.buffer, 0, QUAD)
      // One aligned uniform slot per retained page also covers arbitrary camera jumps.
      state.uniforms = device.createBuffer({ size: this.records.size * 256, usage: BUFFER.UNIFORM | BUFFER.COPY_DST })
      if (timing) {
        state.query = device.createQuerySet({ type: 'timestamp', count: 2 })
        state.resolve = device.createBuffer({ size: 16, usage: BUFFER.QUERY_RESOLVE | BUFFER.COPY_SRC })
        state.read = device.createBuffer({ size: 16, usage: BUFFER.COPY_DST | BUFFER.MAP_READ })
        state.timestampWrites = { querySet: state.query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 }
      }
      state.sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' })
      for (const record of this.records.values()) {
        const image = record.chunk.preparedRaster.image
        record.gpu = device.createTexture({ size: [image.width, image.height], format: 'rgba8unorm', usage: TEXTURE.COPY_DST | TEXTURE.TEXTURE_BINDING | TEXTURE.RENDER_ATTACHMENT })
        record.group = device.createBindGroup({ layout: state.layout, entries: [
          { binding: 0, resource: { buffer: state.uniforms, size: 32 } },
          { binding: 1, resource: record.gpu.createView() },
          { binding: 2, resource: state.sampler }
        ] })
        this.uploadGpu(record)
      }
      this.stats.bytes = bytes + (this.glState?.bytes || 0)
    } catch (error) { this.releaseGpu(); throw error }
  }

  uploadGl(record, initial = false) {
    const { gl } = this.glState
    const image = record.chunk.preparedRaster.image
    gl.bindTexture(gl.TEXTURE_2D, record.gl)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    if (initial) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image)
    record.glImage = image
    record.glRevision = record.chunk.preparedRaster.revision
    this.stats.uploads++
    this.stats.uploadBytes += image.width * image.height * 4
  }

  uploadGpu(record) {
    const image = record.chunk.preparedRaster.image
    this.gpuState.device.queue.copyExternalImageToTexture({ source: image }, { texture: record.gpu, premultipliedAlpha: false }, [image.width, image.height])
    record.gpuImage = image
    record.gpuRevision = record.chunk.preparedRaster.revision
    this.stats.uploads++
    this.stats.uploadBytes += image.width * image.height * 4
  }

  render(backend, renderer, canvas, scroll, width, height, mapRenderer, grid) {
    if ((backend === 'webgl' && (!this.glState || this.glState.gl.isContextLost())) ||
        (backend === 'webgpu' && this.gpuState?.device !== renderer.device) || backend === 'cpu') return false
    this.visible.length = 0
    const chunkSize = mapRenderer.chunkSize
    const left = Math.max(0, Math.floor(scroll.x / TILE_SIZE))
    const top = Math.max(0, Math.floor(scroll.y / TILE_SIZE))
    const right = Math.min(grid[0].length, left + Math.ceil(width / TILE_SIZE) + 1)
    const bottom = Math.min(grid.length, top + Math.ceil(height / TILE_SIZE) + 1)
    const firstX = Math.floor(left / chunkSize), firstY = Math.floor(top / chunkSize)
    const lastX = Math.floor((right - 1) / chunkSize), lastY = Math.floor((bottom - 1) / chunkSize)
    for (const record of this.records.values()) {
      const chunk = record.chunk
      if (chunk.chunkX < firstX || chunk.chunkX > lastX || chunk.chunkY < firstY || chunk.chunkY > lastY) continue
      if (mapRenderer.updateChunkCache(chunk, grid, true, null, RETAINED_OPTIONS)) this.stats.rebuilds++
      if (this.glState && (record.glImage !== chunk.preparedRaster.image || record.glRevision !== chunk.preparedRaster.revision)) this.uploadGl(record)
      if (this.gpuState && (record.gpuImage !== chunk.preparedRaster.image || record.gpuRevision !== chunk.preparedRaster.revision)) this.uploadGpu(record)
      this.visible.push(record)
    }
    const density = getCanvasPixelRatio(canvas, canvas.width / width)
    if (backend === 'webgl') this.renderGl(canvas, scroll, density)
    else this.renderGpu(renderer, canvas, scroll, density)
    this.stats.drawCalls = this.visible.length
    return true
  }

  renderGl(canvas, scroll, density) {
    const s = this.glState, gl = s.gl
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(s.program)
    gl.bindVertexArray(s.vao)
    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.uniform2f(s.viewport, canvas.width, canvas.height)
    // Preserve the full fractional destination transform. The fragment stage
    // matches Canvas's lower-texel tie rule rather than quantizing the camera.
    gl.uniform2f(s.scale, density, density)
    gl.uniform1i(s.image, 0)
    gl.activeTexture(gl.TEXTURE0)
    for (const { chunk, gl: texture } of this.visible) {
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform4f(s.rect, (chunk.offsetX - scroll.x) * density,
        (chunk.offsetY - scroll.y) * density,
        chunk.preparedRaster.image.width * density, chunk.preparedRaster.image.height * density)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    gl.bindVertexArray(null)
  }

  renderGpu(renderer, canvas, scroll, density) {
    const s = this.gpuState, device = s.device, encoder = device.createCommandEncoder()
    const timed = Boolean(s.query && !s.readPending)
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: renderer.context.getCurrentTexture().createView(), loadOp: 'load', storeOp: 'store' }],
      timestampWrites: timed ? s.timestampWrites : undefined })
    pass.setPipeline(s.pipeline)
    pass.setVertexBuffer(0, s.buffer)
    for (let i = 0; i < this.visible.length; i++) {
      const record = this.visible[i], chunk = record.chunk, u = this.uniforms
      u[0] = (chunk.offsetX - scroll.x) * density
      u[1] = (chunk.offsetY - scroll.y) * density
      u[2] = chunk.preparedRaster.image.width * density; u[3] = chunk.preparedRaster.image.height * density
      u[4] = canvas.width; u[5] = canvas.height; u[6] = density; u[7] = density
      device.queue.writeBuffer(s.uniforms, i * 256, u)
      this.dynamicOffset[0] = i * 256
      pass.setBindGroup(0, record.group, this.dynamicOffset)
      pass.draw(6)
    }
    pass.end()
    if (timed) {
      encoder.resolveQuerySet(s.query, 0, 2, s.resolve, 0)
      encoder.copyBufferToBuffer(s.resolve, 0, s.read, 0, 16)
      s.readPending = true
    }
    device.queue.submit([encoder.finish()])
    if (timed) s.read.mapAsync(1).then(() => {
      const values = new BigUint64Array(s.read.getMappedRange())
      const elapsed = Number(values[1] - values[0]) / 1e6
      s.read.unmap()
      s.readPending = false
      if (this.gpuState === s && Number.isFinite(elapsed) && elapsed >= 0) this.stats.gpuMilliseconds = elapsed
    }).catch(() => { s.readPending = false })
  }

  releaseGl() {
    const s = this.glState
    if (!s) return
    s.gl.canvas.removeEventListener('webglcontextlost', s.onLost)
    s.gl.canvas.removeEventListener('webglcontextrestored', s.onRestore)
    for (const record of this.records.values()) { if (record.gl) s.gl.deleteTexture(record.gl); record.gl = record.glImage = null }
    s.gl.deleteBuffer(s.buffer)
    s.gl.deleteVertexArray(s.vao)
    s.gl.deleteProgram(s.program)
    for (const shader of s.shaders) s.gl.deleteShader(shader)
    s.token.release()
    this.glState = null
    this.stats.bytes = this.gpuState?.bytes || 0
  }

  releaseGpu() {
    const s = this.gpuState
    if (!s) return
    for (const record of this.records.values()) { record.gpu?.destroy(); record.gpu = record.gpuImage = record.group = null }
    s.buffer?.destroy()
    s.uniforms?.destroy()
    s.query?.destroy()
    s.resolve?.destroy()
    s.read?.destroy()
    s.token.release()
    this.gpuState = null
    this.stats.gpuMilliseconds = null
    this.stats.bytes = this.glState?.bytes || 0
  }

  close() { this.stats.active = false; this.releaseGl(); this.releaseGpu(); this.records.clear() }
}
