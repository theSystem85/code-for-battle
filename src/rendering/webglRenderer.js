import {
  TILE_COLORS,
  TILE_SIZE,
  USE_TEXTURES,
  WATER_EFFECT_TONE,
  WATER_EFFECT_SATURATION,
  WATER_EFFECT_ZOOM
} from '../config.js'
import { PROFILER_SPAN_IDS } from '../performance/profilerIds.js'
import { renderProfiler } from '../performance/renderProfiler.js'
import { RENDER_COUNTER_IDS, renderDiagnostics } from '../performance/renderDiagnostics.js'
import { getCanvasPixelRatio } from './renderingUtils.js'

export const WATER_INSTANCE_FLOATS = 17
export const WATER_INSTANCE_STRIDE = WATER_INSTANCE_FLOATS * 4

const WATER_CHUNK_SIZE = 16
const WATER_CHUNK_TILE_CAPACITY = WATER_CHUNK_SIZE * WATER_CHUNK_SIZE
const WATER_PLANES = 2
const TIMER_QUERY_LIMIT = 4
const WATER_ATTRIBUTES = Object.freeze([
  Object.freeze([1, 2, 0]),
  Object.freeze([2, 4, 8]),
  Object.freeze([3, 4, 24]),
  Object.freeze([4, 1, 40]),
  Object.freeze([5, 4, 44]),
  Object.freeze([6, 1, 60]),
  Object.freeze([7, 1, 64])
])

const SOT_CLIP_NONE = 0
const SOT_CLIP_TOP_LEFT = 1
const SOT_CLIP_TOP_RIGHT = 2
const SOT_CLIP_BOTTOM_LEFT = 3
const SOT_CLIP_BOTTOM_RIGHT = 4

function getSotClipOrientation(orientation) {
  switch (orientation) {
    case 'top-left':
      return SOT_CLIP_TOP_LEFT
    case 'top-right':
      return SOT_CLIP_TOP_RIGHT
    case 'bottom-left':
      return SOT_CLIP_BOTTOM_LEFT
    case 'bottom-right':
      return SOT_CLIP_BOTTOM_RIGHT
    default:
      return SOT_CLIP_NONE
  }
}

const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aTranslation;
layout(location = 2) in vec4 aUVRect;
layout(location = 3) in vec4 aColor;
layout(location = 4) in float aTextureType;
layout(location = 5) in vec4 aWaterEdges;
layout(location = 6) in float aClipOrientation;
layout(location = 7) in float aTextureSource;

uniform vec2 uResolution;
uniform vec2 uScroll;
uniform float uTileSize;
uniform float uTileStep;

out vec2 vUV;
out vec4 vColor;
out float vTextureType;
out vec2 vLocalPos;
out vec2 vWorldPos;
out vec4 vWaterEdges;
out float vClipOrientation;
out float vTextureSource;

void main() {
  vec2 worldPos = aTranslation * uTileStep - uScroll + aPosition * uTileSize;
  vec2 worldSamplePos = aTranslation * uTileStep + aPosition * uTileSize;
  vec2 zeroToOne = worldPos / uResolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  vUV = mix(aUVRect.xy, aUVRect.zw, aPosition);
  vColor = aColor;
  vTextureType = aTextureType;
  vLocalPos = aPosition;
  vWorldPos = worldSamplePos;
  vWaterEdges = aWaterEdges;
  vClipOrientation = aClipOrientation;
  vTextureSource = aTextureSource;
}
`

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D uAtlas;
uniform sampler2D uSecondaryAtlas;
uniform float uTime;
uniform float uWaterZoom;
uniform float uWaterTone;
uniform float uWaterSaturation;

in vec2 vUV;
in vec4 vColor;
in float vTextureType;
in vec2 vLocalPos;
in vec2 vWorldPos;
in vec4 vWaterEdges;
in float vClipOrientation;
in float vTextureSource;

out vec4 outColor;

vec3 applySaturation(vec3 color, float saturation) {
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(luma), color, max(saturation, 0.0));
}

void main() {
  if (vClipOrientation > 0.5) {
    bool insideClip = true;
    if (vClipOrientation < 1.5) {
      insideClip = vLocalPos.x + vLocalPos.y <= 1.0;
    } else if (vClipOrientation < 2.5) {
      insideClip = vLocalPos.x >= vLocalPos.y;
    } else if (vClipOrientation < 3.5) {
      insideClip = vLocalPos.x <= vLocalPos.y;
    } else {
      insideClip = vLocalPos.x + vLocalPos.y >= 1.0;
    }

    if (!insideClip) {
      discard;
    }
  }

  if (vTextureType > 1.5) {
    float t = uTime * 0.001;
    float worldScale = 1.0 / max(uWaterZoom, 0.001);
    vec2 flow = vec2(
      sin(vWorldPos.y * (0.031 * worldScale) + t * 0.82),
      cos(vWorldPos.x * (0.029 * worldScale) - t * 0.74)
    );
    vec2 p = vWorldPos * (0.052 * worldScale) + flow * 1.15;
    float waveA = sin(p.x * 1.2 + t * 1.1);
    float waveB = cos(p.y * 1.35 - t * 1.25);
    float waveC = sin((p.x - p.y) * 0.92 + t * 0.63);
    float wave = (waveA + waveB + waveC) / 3.0;
    float shimmer = 0.5 + 0.5 * sin((p.x * 1.2 - p.y * 1.05) + t * 1.65);
    float toneBlend = clamp((uWaterTone + 1.0) * 0.5, 0.0, 1.0);

    vec3 deepColor = mix(vec3(0.04, 0.18, 0.32), vec3(0.09, 0.27, 0.30), toneBlend);
    vec3 brightColor = mix(vec3(0.08, 0.39, 0.58), vec3(0.13, 0.52, 0.43), toneBlend);
    float contrast = clamp(0.5 + wave * 0.45, 0.0, 1.0);
    vec3 waterColor = mix(deepColor, brightColor, contrast);
    waterColor += vec3(0.04, 0.08, 0.10) * shimmer * 0.42;
    waterColor = applySaturation(waterColor, uWaterSaturation);

    float edgeDistance = 1.0;
    if (vWaterEdges.x > 0.5) edgeDistance = min(edgeDistance, vLocalPos.y);
    if (vWaterEdges.y > 0.5) edgeDistance = min(edgeDistance, 1.0 - vLocalPos.x);
    if (vWaterEdges.z > 0.5) edgeDistance = min(edgeDistance, 1.0 - vLocalPos.y);
    if (vWaterEdges.w > 0.5) edgeDistance = min(edgeDistance, vLocalPos.x);

    float shoreMask = edgeDistance < 0.09 ? 1.0 : 0.0;
    waterColor += vec3(0.03, 0.05, 0.05) * shoreMask;

    outColor = vec4(waterColor, 1.0);
  } else if (vTextureType > 0.5) {
    if (vTextureSource > 0.5) {
      outColor = texture(uSecondaryAtlas, vUV);
    } else {
      outColor = texture(uAtlas, vUV);
    }
  } else {
    outColor = vColor;
  }
}
`

const DEFAULT_ATLAS_SIZE = { width: 1, height: 1 }

function createShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('WebGL shader compilation failed', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl, vsSource, fsSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource)
  if (!vertexShader || !fragmentShader) return null

  const program = gl.createProgram()
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('WebGL program link failed', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }

  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  return program
}

function parseColor(color) {
  const defaultColor = [0, 0, 0, 1]
  if (!color || typeof color !== 'string') return defaultColor

  const hexMatch = color.trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
  if (hexMatch) {
    const hex = hexMatch[1]
    const hasAlpha = hex.length === 8
    const r = parseInt(hex.slice(0, 2), 16) / 255
    const g = parseInt(hex.slice(2, 4), 16) / 255
    const b = parseInt(hex.slice(4, 6), 16) / 255
    const a = hasAlpha ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    return [r, g, b, a]
  }

  const rgbaMatch = color.match(/rgba?\(([^)]+)\)/)
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map(p => parseFloat(p.trim()))
    if (parts.length >= 3) {
      const [r, g, b, a = 1] = parts
      return [r / 255, g / 255, b / 255, a]
    }
  }

  return defaultColor
}

function packInstance(data, offset, instance) {
  data[offset] = instance.translation[0]
  data[offset + 1] = instance.translation[1]
  data.set(instance.uvRect, offset + 2)
  data.set(instance.color, offset + 6)
  data[offset + 10] = instance.textureType
  data.set(instance.waterEdges, offset + 11)
  data[offset + 15] = instance.clipOrientation
  data[offset + 16] = instance.textureSource || 0
}

function getTopologyRanges(options) {
  const ranges = options.changedTopologyRanges || options.topologyChanges
  return Array.isArray(ranges) ? ranges : null
}

function normalizeTopologyRange(range, width, height) {
  const left = Number.isFinite(range?.left) ? range.left : range?.x
  const top = Number.isFinite(range?.top) ? range.top : range?.y
  const right = Number.isFinite(range?.right) ? range.right : left + (range?.width || 1)
  const bottom = Number.isFinite(range?.bottom) ? range.bottom : top + (range?.height || 1)
  if (![left, top, right, bottom].every(Number.isFinite)) return null
  return {
    left: Math.max(0, Math.floor(left) - 1),
    top: Math.max(0, Math.floor(top) - 1),
    right: Math.min(width, Math.ceil(right) + 1),
    bottom: Math.min(height, Math.ceil(bottom) + 1)
  }
}

export class GameWebGLRenderer {
  constructor(gl, textureManager, mapRenderer = null, {
    profiler = renderProfiler,
    diagnostics = renderDiagnostics
  } = {}) {
    this.gl = gl
    this.textureManager = textureManager
    this.mapRenderer = mapRenderer
    this.profiler = profiler
    this.diagnostics = diagnostics
    this.program = null
    this.uniformLocations = null
    this.buffers = {}
    this.instanceCapacity = 0
    this.atlasTexture = null
    this.atlasSize = { ...DEFAULT_ATLAS_SIZE }
    this.secondaryAtlasTexture = null
    this.secondaryAtlasImage = null
    this.secondaryAtlasSize = { ...DEFAULT_ATLAS_SIZE }
    this.colorCache = new Map()
    this.pixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    this.rendersWaterSot = true
    this.waterTopology = null
    this.uploadedWaterTopology = null
    this.uploadedWaterTopologyVersion = -1
    this.contextLost = false
    this.timerExtension = null
    this.timerQueries = []
    this.gpuTiming = { available: false, reason: 'not-initialized', milliseconds: null }
    this.boundCanvas = null
    this.capabilityUpdate = { backend: 'webgl', devicePixelRatio: null }
    this.onContextLost = event => {
      event?.preventDefault?.()
      this.handleContextLost()
    }
    this.onContextRestored = () => this.handleContextRestored(this.gl)
    this.stats = {
      topologyBuilds: 0,
      topologyUploadBytes: 0,
      textureUploadBytes: 0,
      uniformUploadBytes: 0,
      drawCalls: 0
    }
  }

  setContext(gl) {
    if (this.gl === gl) return
    this.gl = gl
    this.program = null
    this.uniformLocations = null
    this.buffers = {}
    this.instanceCapacity = 0
    this.atlasTexture = null
    this.atlasSize = { ...DEFAULT_ATLAS_SIZE }
    this.secondaryAtlasTexture = null
    this.secondaryAtlasImage = null
    this.secondaryAtlasSize = { ...DEFAULT_ATLAS_SIZE }
    this.uploadedWaterTopology = null
    this.uploadedWaterTopologyVersion = -1
    this.contextLost = false
    this.timerExtension = null
    this.timerQueries.length = 0
  }

  setMapRenderer(mapRenderer) {
    this.mapRenderer = mapRenderer
  }

  bindContextEvents(canvas) {
    if (!canvas?.addEventListener || this.boundCanvas === canvas) return
    if (this.boundCanvas?.removeEventListener) {
      this.boundCanvas.removeEventListener('webglcontextlost', this.onContextLost)
      this.boundCanvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    }
    this.boundCanvas = canvas
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
  }

  ensureInitialized() {
    if (
      !this.gl ||
      this.contextLost ||
      typeof WebGL2RenderingContext === 'undefined' ||
      !(this.gl instanceof WebGL2RenderingContext)
    ) {
      return false
    }
    if (this.program) return true

    const gl = this.gl
    this.program = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE)
    if (!this.program) return false

    this.buffers.quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.quad)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        0, 1,
        1, 0,
        1, 1
      ]),
      gl.STATIC_DRAW
    )

    this.buffers.translation = gl.createBuffer()
    this.buffers.uv = gl.createBuffer()
    this.buffers.color = gl.createBuffer()
    this.buffers.textureType = gl.createBuffer()
    this.buffers.waterEdges = gl.createBuffer()
    this.buffers.clipOrientation = gl.createBuffer()
    this.buffers.textureSource = gl.createBuffer()
    this.buffers.waterTopology = gl.createBuffer()

    this.uniformLocations = {
      resolution: gl.getUniformLocation(this.program, 'uResolution'),
      scroll: gl.getUniformLocation(this.program, 'uScroll'),
      tileSize: gl.getUniformLocation(this.program, 'uTileSize'),
      tileStep: gl.getUniformLocation(this.program, 'uTileStep'),
      time: gl.getUniformLocation(this.program, 'uTime'),
      waterZoom: gl.getUniformLocation(this.program, 'uWaterZoom'),
      waterTone: gl.getUniformLocation(this.program, 'uWaterTone'),
      waterSaturation: gl.getUniformLocation(this.program, 'uWaterSaturation'),
      atlas: gl.getUniformLocation(this.program, 'uAtlas'),
      secondaryAtlas: gl.getUniformLocation(this.program, 'uSecondaryAtlas')
    }

    gl.useProgram(this.program)
    gl.uniform1i(this.uniformLocations.atlas, 0)
    gl.uniform1i(this.uniformLocations.secondaryAtlas, 1)
    gl.useProgram(null)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    this.initializeGpuTimer()

    return true
  }

  initializeGpuTimer() {
    const gl = this.gl
    this.timerExtension = gl?.getExtension?.('EXT_disjoint_timer_query_webgl2') || null
    this.gpuTiming = this.timerExtension
      ? { available: false, reason: 'pending-first-valid-sample', milliseconds: null }
      : { available: false, reason: 'EXT_disjoint_timer_query_webgl2-unavailable', milliseconds: null }
    this.diagnostics.setCapabilities({ backend: 'webgl', gpuTiming: this.gpuTiming })
  }

  pollGpuTimers() {
    const gl = this.gl
    const extension = this.timerExtension
    if (!gl || !extension || !this.timerQueries.length) return
    const disjoint = Boolean(gl.getParameter(extension.GPU_DISJOINT_EXT))
    for (let index = this.timerQueries.length - 1; index >= 0; index--) {
      const query = this.timerQueries[index]
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue
      this.timerQueries.splice(index, 1)
      if (disjoint) {
        gl.deleteQuery(query)
        this.gpuTiming = { available: false, reason: 'disjoint-reading-discarded', milliseconds: null }
        this.diagnostics.setCapabilities({ backend: 'webgl', gpuTiming: this.gpuTiming })
        continue
      }
      const nanoseconds = gl.getQueryParameter(query, gl.QUERY_RESULT)
      gl.deleteQuery(query)
      if (!Number.isFinite(nanoseconds) || nanoseconds < 0) {
        this.gpuTiming = { available: false, reason: 'invalid-reading-discarded', milliseconds: null }
      } else {
        this.gpuTiming = { available: true, reason: null, milliseconds: nanoseconds / 1e6 }
      }
      this.diagnostics.setCapabilities({ backend: 'webgl', gpuTiming: this.gpuTiming })
    }
  }

  beginGpuTimer() {
    const gl = this.gl
    if (!this.timerExtension || this.timerQueries.length >= TIMER_QUERY_LIMIT) return null
    const query = gl.createQuery()
    if (!query) return null
    gl.beginQuery(this.timerExtension.TIME_ELAPSED_EXT, query)
    return query
  }

  endGpuTimer(query) {
    if (!query) return
    this.gl.endQuery(this.timerExtension.TIME_ELAPSED_EXT)
    this.timerQueries.push(query)
  }

  handleContextLost() {
    this.contextLost = true
    this.program = null
    this.uniformLocations = null
    this.buffers = {}
    this.atlasTexture = null
    this.secondaryAtlasTexture = null
    this.uploadedWaterTopology = null
    this.uploadedWaterTopologyVersion = -1
    this.timerQueries.length = 0
    this.gpuTiming = { available: false, reason: 'context-lost', milliseconds: null }
    this.diagnostics.setCapabilities({ backend: 'webgl', gpuTiming: this.gpuTiming })
  }

  handleContextRestored(gl = this.gl) {
    this.gl = gl
    this.contextLost = false
    this.program = null
    this.uniformLocations = null
    this.buffers = {}
    this.atlasTexture = null
    this.secondaryAtlasTexture = null
    this.secondaryAtlasImage = null
    this.uploadedWaterTopology = null
    this.uploadedWaterTopologyVersion = -1
    return this.ensureInitialized()
  }

  getWaterTopologyRevision(options = {}) {
    return options.topologyRevision ?? this.mapRenderer?.sotMaskVersion ?? 0
  }

  getTopologyBuildSpanId() {
    return PROFILER_SPAN_IDS.WEBGL_BUILD
  }

  createWaterTopology(mapGrid, revision) {
    const height = mapGrid.length
    const width = mapGrid[0]?.length || 0
    const chunkColumns = Math.ceil(width / WATER_CHUNK_SIZE)
    const chunkRows = Math.ceil(height / WATER_CHUNK_SIZE)
    const chunkCount = chunkColumns * chunkRows
    const slotsPerPlane = chunkCount * WATER_CHUNK_TILE_CAPACITY
    return {
      mapGrid,
      revision,
      width,
      height,
      chunkColumns,
      chunkRows,
      chunkCount,
      slotsPerPlane,
      data: new Float32Array(slotsPerPlane * WATER_PLANES * WATER_INSTANCE_FLOATS),
      baseCounts: new Uint16Array(chunkCount),
      sotCounts: new Uint16Array(chunkCount),
      dirtyFlags: new Uint8Array(chunkCount),
      dirtyChunks: [],
      version: 0
    }
  }

  markAllWaterChunksDirty(topology) {
    topology.dirtyChunks.length = 0
    topology.dirtyFlags.fill(1)
    for (let index = 0; index < topology.chunkCount; index++) topology.dirtyChunks.push(index)
  }

  markWaterRangesDirty(topology, ranges) {
    topology.dirtyChunks.length = 0
    topology.dirtyFlags.fill(0)
    for (const sourceRange of ranges) {
      const range = normalizeTopologyRange(sourceRange, topology.width, topology.height)
      if (!range) continue
      const firstChunkX = Math.floor(range.left / WATER_CHUNK_SIZE)
      const firstChunkY = Math.floor(range.top / WATER_CHUNK_SIZE)
      const lastChunkX = Math.floor(Math.max(range.left, range.right - 1) / WATER_CHUNK_SIZE)
      const lastChunkY = Math.floor(Math.max(range.top, range.bottom - 1) / WATER_CHUNK_SIZE)
      for (let chunkY = firstChunkY; chunkY <= lastChunkY; chunkY++) {
        for (let chunkX = firstChunkX; chunkX <= lastChunkX; chunkX++) {
          const index = chunkY * topology.chunkColumns + chunkX
          if (topology.dirtyFlags[index]) continue
          topology.dirtyFlags[index] = 1
          topology.dirtyChunks.push(index)
        }
      }
    }
  }

  rebuildWaterChunk(topology, chunkIndex) {
    const chunkX = chunkIndex % topology.chunkColumns
    const chunkY = Math.floor(chunkIndex / topology.chunkColumns)
    const startX = chunkX * WATER_CHUNK_SIZE
    const startY = chunkY * WATER_CHUNK_SIZE
    const endX = Math.min(topology.width, startX + WATER_CHUNK_SIZE)
    const endY = Math.min(topology.height, startY + WATER_CHUNK_SIZE)
    const instances = this.buildTileInstances(topology.mapGrid, startX, startY, endX, endY, { waterOnly: true })
    let baseCount = 0
    let sotCount = 0
    const baseSlot = chunkIndex * WATER_CHUNK_TILE_CAPACITY
    const sotSlot = topology.slotsPerPlane + baseSlot
    for (const instance of instances) {
      if (instance.clipOrientation > SOT_CLIP_NONE) {
        if (sotCount >= WATER_CHUNK_TILE_CAPACITY) continue
        packInstance(topology.data, (sotSlot + sotCount++) * WATER_INSTANCE_FLOATS, instance)
      } else {
        if (baseCount >= WATER_CHUNK_TILE_CAPACITY) continue
        packInstance(topology.data, (baseSlot + baseCount++) * WATER_INSTANCE_FLOATS, instance)
      }
    }
    topology.baseCounts[chunkIndex] = baseCount
    topology.sotCounts[chunkIndex] = sotCount
  }

  prepareRetainedWaterTopology(mapGrid, options = {}) {
    this.getSotMask(mapGrid)
    const revision = this.getWaterTopologyRevision(options)
    const ranges = getTopologyRanges(options)
    const dimensionsChanged = !this.waterTopology ||
      this.waterTopology.width !== (mapGrid[0]?.length || 0) ||
      this.waterTopology.height !== mapGrid.length
    const mapChanged = !this.waterTopology || this.waterTopology.mapGrid !== mapGrid
    const revisionChanged = !this.waterTopology || this.waterTopology.revision !== revision

    if (dimensionsChanged || mapChanged) {
      this.waterTopology = this.createWaterTopology(mapGrid, revision)
      this.markAllWaterChunksDirty(this.waterTopology)
    } else if (revisionChanged) {
      this.waterTopology.revision = revision
      if (ranges?.length) this.markWaterRangesDirty(this.waterTopology, ranges)
      else this.markAllWaterChunksDirty(this.waterTopology)
    } else {
      this.waterTopology.dirtyChunks.length = 0
      return this.waterTopology
    }

    const buildToken = this.profiler.startSpan(this.getTopologyBuildSpanId())
    for (const chunkIndex of this.waterTopology.dirtyChunks) {
      this.rebuildWaterChunk(this.waterTopology, chunkIndex)
    }
    this.waterTopology.version++
    this.stats.topologyBuilds++
    this.profiler.endSpan(buildToken)
    return this.waterTopology
  }

  forEachVisibleWaterChunk(topology, startX, startY, endX, endY, callback) {
    const firstChunkX = Math.floor(startX / WATER_CHUNK_SIZE)
    const firstChunkY = Math.floor(startY / WATER_CHUNK_SIZE)
    const lastChunkX = Math.floor(Math.max(startX, endX - 1) / WATER_CHUNK_SIZE)
    const lastChunkY = Math.floor(Math.max(startY, endY - 1) / WATER_CHUNK_SIZE)
    for (let chunkY = firstChunkY; chunkY <= lastChunkY; chunkY++) {
      for (let chunkX = firstChunkX; chunkX <= lastChunkX; chunkX++) {
        callback(chunkY * topology.chunkColumns + chunkX)
      }
    }
  }

  syncAtlasTexture() {
    if (!this.gl || this.atlasTexture || !this.textureManager?.spriteImage) return

    const gl = this.gl
    this.atlasTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.textureManager.spriteImage
    )
    gl.bindTexture(gl.TEXTURE_2D, null)
    this.atlasSize = {
      width: this.textureManager.spriteImage.width || DEFAULT_ATLAS_SIZE.width,
      height: this.textureManager.spriteImage.height || DEFAULT_ATLAS_SIZE.height
    }
    const uploadBytes = this.atlasSize.width * this.atlasSize.height * 4
    this.stats.textureUploadBytes += uploadBytes
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.UPLOAD_BYTES, uploadBytes)
  }

  getSecondaryAtlasImage() {
    const streetTile = this.textureManager?.defaultStreetTagBuckets?.street?.find(tile => tile?.image && tile?.rect)
    return streetTile?.image || null
  }

  syncSecondaryAtlasTexture() {
    if (!this.gl) return
    const image = this.getSecondaryAtlasImage()
    if (!image) return

    const gl = this.gl
    if (this.secondaryAtlasTexture && this.secondaryAtlasImage === image) {
      return
    }

    if (this.secondaryAtlasTexture) {
      gl.deleteTexture(this.secondaryAtlasTexture)
    }

    this.secondaryAtlasImage = image
    this.secondaryAtlasTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.secondaryAtlasTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image
    )
    gl.bindTexture(gl.TEXTURE_2D, null)
    this.secondaryAtlasSize = {
      width: image.width || image.naturalWidth || DEFAULT_ATLAS_SIZE.width,
      height: image.height || image.naturalHeight || DEFAULT_ATLAS_SIZE.height
    }
    const uploadBytes = this.secondaryAtlasSize.width * this.secondaryAtlasSize.height * 4
    this.stats.textureUploadBytes += uploadBytes
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.UPLOAD_BYTES, uploadBytes)
  }

  getColor(type) {
    if (!this.colorCache.has(type)) {
      this.colorCache.set(type, parseColor(TILE_COLORS[type]))
    }
    return this.colorCache.get(type)
  }

  buildTileInstances(mapGrid, startX, startY, endX, endY, options = {}) {
    const { waterOnly = false } = options
    const baseInstances = []
    const overlayInstances = []
    const resourceInstances = []
    const canUseTextures = USE_TEXTURES && this.textureManager?.allTexturesLoaded
    const sotMask = this.getSotMask(mapGrid)

    for (let y = startY; y < endY; y++) {
      const row = mapGrid[y]
      for (let x = startX; x < endX; x++) {
        const tile = row[x]
        if (!tile) continue
        const visualTileType = tile?.airstripStreet ? 'land' : tile.type
        const streetWaterUnderlay = visualTileType === 'street' && this.mapRenderer?.isStreetWaterTransitionTile(mapGrid, x, y)
        if (!waterOnly || visualTileType === 'water' || streetWaterUnderlay) {
          if (!waterOnly && visualTileType === 'street') {
            baseInstances.push(this.createInstance(streetWaterUnderlay ? 'water' : 'land', x, y, mapGrid, canUseTextures, sotMask))
          }
          baseInstances.push(this.createInstance(waterOnly && streetWaterUnderlay ? 'water' : visualTileType, x, y, mapGrid, canUseTextures, sotMask))
        }

        const sotInfo = sotMask?.[y]?.[x]
        if (waterOnly) {
          if (sotInfo && sotInfo.type === 'water' && visualTileType !== 'water') {
            overlayInstances.push(this.createSotInstance(sotInfo.type, x, y, sotInfo.orientation, mapGrid, canUseTextures, sotMask))
          }
          continue
        }

        if (sotInfo && visualTileType !== 'street') {
          const adjacentStreet = (
            row[x - 1]?.type === 'street' ||
            row[x + 1]?.type === 'street' ||
            mapGrid[y - 1]?.[x]?.type === 'street' ||
            mapGrid[y + 1]?.[x]?.type === 'street'
          )
          if (!(sotInfo.type === 'land' && visualTileType === 'water' && adjacentStreet)) {
            overlayInstances.push(this.createSotInstance(sotInfo.type, x, y, sotInfo.orientation, mapGrid, canUseTextures, sotMask))
          }
        }

        if (tile.seedCrystal) {
          resourceInstances.push(this.createInstance('seedCrystal', x, y, mapGrid, canUseTextures, sotMask))
        } else if (tile.ore) {
          resourceInstances.push(this.createInstance('ore', x, y, mapGrid, canUseTextures, sotMask))
        }
      }
    }

    const validBaseInstances = baseInstances.filter(Boolean)
    const primaryBaseInstances = validBaseInstances.filter(instance => instance.textureSource <= 0.5)
    const secondaryBaseInstances = validBaseInstances.filter(instance => instance.textureSource > 0.5)
    return [
      ...primaryBaseInstances,
      ...secondaryBaseInstances,
      ...overlayInstances,
      ...resourceInstances
    ].filter(Boolean)
  }

  getSotMask(mapGrid) {
    if (!this.mapRenderer) return null
    if (!this.mapRenderer.sotMask) {
      this.mapRenderer.computeSOTMask(mapGrid)
    }
    return this.mapRenderer.sotMask
  }

  createWaterSotInstance(tileX, tileY, orientation) {
    return {
      translation: [tileX, tileY],
      uvRect: [0, 0, 1, 1],
      color: this.getColor('water'),
      textureType: 2,
      textureSource: 0,
      waterEdges: [0, 0, 0, 0],
      clipOrientation: getSotClipOrientation(orientation)
    }
  }

  createSotInstance(type, tileX, tileY, orientation, mapGrid, canUseTextures, sotMask = null) {
    if (type === 'water') {
      return this.createWaterSotInstance(tileX, tileY, orientation)
    }
    if (type === 'street') {
      return null
    }

    const instance = this.createInstance(type, tileX, tileY, mapGrid, canUseTextures, sotMask)
    return {
      ...instance,
      waterEdges: [0, 0, 0, 0],
      clipOrientation: getSotClipOrientation(orientation)
    }
  }

  getIntegratedResourceTile(type, tileX, tileY, mapGrid) {
    const tile = mapGrid?.[tileY]?.[tileX]
    if (!tile) {
      return null
    }

    if (type === 'ore') {
      const density = Math.max(1, Math.min(5, Number.isFinite(tile.oreDensity) ? Math.floor(tile.oreDensity) : 1))
      return this.textureManager.selectCrystalTileByTags(['ore', 'density_' + density], tileX, tileY)
    }

    if (type === 'seedCrystal') {
      const density = Math.max(
        1,
        Math.min(
          5,
          Number.isFinite(tile.seedCrystalDensity)
            ? Math.floor(tile.seedCrystalDensity)
            : (Number.isFinite(tile.oreDensity) ? Math.floor(tile.oreDensity) : 1)
        )
      )

      return this.textureManager.selectCrystalTileByTags(['red', 'density_' + density], tileX, tileY)
        || this.textureManager.selectCrystalTileByTags(['ore', 'red', 'density_' + density], tileX, tileY)
        || this.textureManager.selectCrystalTileByTags(['ore', 'density_' + density], tileX, tileY)
    }

    return null
  }

  getStreetTile(type, tileX, tileY, mapGrid) {
    if (type !== 'street') return null
    const selectedStreetTile = this.textureManager?.selectStreetTileByTags?.(['street'], tileX, tileY, mapGrid)
    if (!selectedStreetTile?.rect || selectedStreetTile.image !== this.secondaryAtlasImage) {
      return null
    }
    return selectedStreetTile
  }

  createInstance(type, tileX, tileY, mapGrid, canUseTextures, sotMask = null) {
    const integratedResourceTile = this.getIntegratedResourceTile(type, tileX, tileY, mapGrid)
    const canUseIntegratedResourceTile = Boolean(
      integratedResourceTile?.rect && integratedResourceTile?.image === this.textureManager.spriteImage
    )
    const isCrystalResource = type === 'ore' || type === 'seedCrystal'
    if (isCrystalResource && integratedResourceTile?.rect && !canUseIntegratedResourceTile) {
      return null
    }
    const useTexture = canUseIntegratedResourceTile || (canUseTextures && this.textureManager.tileTextureCache?.[type]?.length)
    const isWaterAnimated = type === 'water'
    const streetTile = this.getStreetTile(type, tileX, tileY, mapGrid)
    const useSecondaryTexture = Boolean(streetTile)
    let uvRect = [0, 0, 0, 0]
    if (isWaterAnimated) {
      uvRect = [0, 0, 1, 1]
    } else if (useSecondaryTexture) {
      const { rect } = streetTile
      const u0 = rect.x / this.secondaryAtlasSize.width
      const v0 = rect.y / this.secondaryAtlasSize.height
      const u1 = (rect.x + rect.width) / this.secondaryAtlasSize.width
      const v1 = (rect.y + rect.height) / this.secondaryAtlasSize.height
      uvRect = [u0, v0, u1, v1]
    } else if (canUseIntegratedResourceTile) {
      const { rect } = integratedResourceTile
      const u0 = rect.x / this.atlasSize.width
      const v0 = rect.y / this.atlasSize.height
      const u1 = (rect.x + rect.width) / this.atlasSize.width
      const v1 = (rect.y + rect.height) / this.atlasSize.height
      uvRect = [u0, v0, u1, v1]
    } else if (useTexture) {
      const cache = this.textureManager.tileTextureCache[type]
      const idx = this.textureManager.getTileVariation(type, tileX, tileY)
      const info = cache[idx % cache.length]
      if (info) {
        const u0 = info.x / this.atlasSize.width
        const v0 = info.y / this.atlasSize.height
        const u1 = (info.x + info.width) / this.atlasSize.width
        const v1 = (info.y + info.height) / this.atlasSize.height
        uvRect = [u0, v0, u1, v1]
      }
    }

    return {
      translation: [tileX, tileY],
      uvRect,
      color: this.getColor(type),
      textureType: isWaterAnimated ? 2 : (useTexture || useSecondaryTexture) ? 1 : 0,
      textureSource: useSecondaryTexture ? 1 : 0,
      waterEdges: isWaterAnimated ? this.computeWaterEdges(mapGrid, tileX, tileY, sotMask) : [0, 0, 0, 0],
      clipOrientation: SOT_CLIP_NONE
    }
  }

  createDecalInstance(tile, tileX, tileY) {
    const decalTag = tile?.decal?.tag
    if (!decalTag) return null

    const fallbackColors = {
      impact: [0.26, 0.23, 0.2, 0.28],
      crater: [0.17, 0.15, 0.14, 0.33],
      debris: [0.36, 0.33, 0.29, 0.4]
    }

    return {
      translation: [tileX, tileY],
      uvRect: [0, 0, 0, 0],
      color: fallbackColors[decalTag] || [0.22, 0.2, 0.19, 0.26],
      textureType: 0,
      textureSource: 0,
      waterEdges: [0, 0, 0, 0],
      clipOrientation: SOT_CLIP_NONE
    }
  }

  doesWaterSotTouchEdge(sotInfo, edge) {
    if (!sotInfo || sotInfo.type !== 'water') return false
    switch (edge) {
      case 'top':
        return sotInfo.orientation === 'top-left' || sotInfo.orientation === 'top-right'
      case 'right':
        return sotInfo.orientation === 'top-right' || sotInfo.orientation === 'bottom-right'
      case 'bottom':
        return sotInfo.orientation === 'bottom-left' || sotInfo.orientation === 'bottom-right'
      case 'left':
        return sotInfo.orientation === 'top-left' || sotInfo.orientation === 'bottom-left'
      default:
        return false
    }
  }

  computeWaterEdges(mapGrid, tileX, tileY, sotMask = null) {
    const row = mapGrid[tileY]
    if (!row || row[tileX]?.type !== 'water') return [0, 0, 0, 0]

    const topNeighbor = tileY > 0 ? mapGrid[tileY - 1]?.[tileX] : null
    const rightNeighbor = tileX < row.length - 1 ? mapGrid[tileY]?.[tileX + 1] : null
    const bottomNeighbor = tileY < mapGrid.length - 1 ? mapGrid[tileY + 1]?.[tileX] : null
    const leftNeighbor = tileX > 0 ? mapGrid[tileY]?.[tileX - 1] : null

    const topSot = tileY > 0 ? sotMask?.[tileY - 1]?.[tileX] : null
    const rightSot = tileX < row.length - 1 ? sotMask?.[tileY]?.[tileX + 1] : null
    const bottomSot = tileY < mapGrid.length - 1 ? sotMask?.[tileY + 1]?.[tileX] : null
    const leftSot = tileX > 0 ? sotMask?.[tileY]?.[tileX - 1] : null

    const top = tileY <= 0 || (topNeighbor?.type !== 'water' && !this.doesWaterSotTouchEdge(topSot, 'bottom')) ? 1 : 0
    const right = tileX >= row.length - 1 || (rightNeighbor?.type !== 'water' && !this.doesWaterSotTouchEdge(rightSot, 'left')) ? 1 : 0
    const bottom = tileY >= mapGrid.length - 1 || (bottomNeighbor?.type !== 'water' && !this.doesWaterSotTouchEdge(bottomSot, 'top')) ? 1 : 0
    const left = tileX <= 0 || (leftNeighbor?.type !== 'water' && !this.doesWaterSotTouchEdge(leftSot, 'right')) ? 1 : 0

    return [top, right, bottom, left]
  }

  ensureInstanceCapacity(count) {
    if (count <= this.instanceCapacity) return
    this.instanceCapacity = count
  }

  getCanvasPixelRatio(canvas) {
    return getCanvasPixelRatio(canvas, this.pixelRatio || 1)
  }

  uploadRetainedWaterTopology(topology) {
    const gl = this.gl
    const uploadToken = this.profiler.startSpan(PROFILER_SPAN_IDS.WEBGL_UPLOAD)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.waterTopology)
    const newAllocation = this.uploadedWaterTopology !== topology
    if (newAllocation) {
      gl.bufferData(gl.ARRAY_BUFFER, topology.data.byteLength, gl.DYNAMIC_DRAW)
      this.uploadedWaterTopology = topology
      this.uploadedWaterTopologyVersion = -1
    }
    if (this.uploadedWaterTopologyVersion === topology.version) {
      this.profiler.endSpan(uploadToken)
      return
    }

    let uploadedBytes = 0
    const uploadAll = newAllocation || this.uploadedWaterTopologyVersion < 0
    const uploadChunk = chunkIndex => {
      const baseSlot = chunkIndex * WATER_CHUNK_TILE_CAPACITY
      const baseCount = topology.baseCounts[chunkIndex]
      const sotSlot = topology.slotsPerPlane + baseSlot
      const sotCount = topology.sotCounts[chunkIndex]
      if (baseCount) {
        const start = baseSlot * WATER_INSTANCE_FLOATS
        const end = start + baseCount * WATER_INSTANCE_FLOATS
        const view = topology.data.subarray(start, end)
        gl.bufferSubData(gl.ARRAY_BUFFER, baseSlot * WATER_INSTANCE_STRIDE, view)
        uploadedBytes += view.byteLength
      }
      if (sotCount) {
        const start = sotSlot * WATER_INSTANCE_FLOATS
        const end = start + sotCount * WATER_INSTANCE_FLOATS
        const view = topology.data.subarray(start, end)
        gl.bufferSubData(gl.ARRAY_BUFFER, sotSlot * WATER_INSTANCE_STRIDE, view)
        uploadedBytes += view.byteLength
      }
    }
    if (uploadAll) {
      for (let index = 0; index < topology.chunkCount; index++) uploadChunk(index)
    } else {
      for (const chunkIndex of topology.dirtyChunks) uploadChunk(chunkIndex)
    }
    this.uploadedWaterTopologyVersion = topology.version
    this.stats.topologyUploadBytes += uploadedBytes
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.UPLOAD_BYTES, uploadedBytes)
    this.profiler.endSpan(uploadToken)
  }

  bindRetainedWaterAttributes(slotOffset) {
    const gl = this.gl
    const byteOffset = slotOffset * WATER_INSTANCE_STRIDE
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.waterTopology)
    for (const [location, size, offset] of WATER_ATTRIBUTES) {
      gl.enableVertexAttribArray(location)
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, WATER_INSTANCE_STRIDE, byteOffset + offset)
      gl.vertexAttribDivisor(location, 1)
    }
  }

  drawRetainedWaterPlane(topology, firstChunkX, firstChunkY, lastChunkX, lastChunkY, overlay) {
    const gl = this.gl
    let drawCalls = 0
    const planeOffset = overlay ? topology.slotsPerPlane : 0
    const counts = overlay ? topology.sotCounts : topology.baseCounts
    for (let chunkY = firstChunkY; chunkY <= lastChunkY; chunkY++) {
      for (let chunkX = firstChunkX; chunkX <= lastChunkX; chunkX++) {
        const chunkIndex = chunkY * topology.chunkColumns + chunkX
        const count = counts[chunkIndex]
        if (!count) continue
        this.bindRetainedWaterAttributes(planeOffset + chunkIndex * WATER_CHUNK_TILE_CAPACITY)
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count)
        drawCalls++
      }
    }
    return drawCalls
  }

  renderRetainedWater(mapGrid, scrollOffset, canvas, options, bounds) {
    const gl = this.gl
    const topology = this.prepareRetainedWaterTopology(mapGrid, options)
    this.uploadRetainedWaterTopology(topology)
    const {
      pixelRatio,
      tileStep,
      tileSize,
      scrollX,
      scrollY,
      startTileX,
      startTileY,
      endTileX,
      endTileY
    } = bounds
    const locations = this.uniformLocations
    const sampledTime = Number.isFinite(options.time)
      ? options.time
      : (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program)
    gl.uniform2f(locations.resolution, canvas.width, canvas.height)
    gl.uniform2f(locations.scroll, scrollX, scrollY)
    gl.uniform1f(locations.tileSize, tileSize)
    gl.uniform1f(locations.tileStep, tileStep)
    gl.uniform1f(locations.time, sampledTime)
    gl.uniform1f(locations.waterZoom, WATER_EFFECT_ZOOM)
    gl.uniform1f(locations.waterTone, WATER_EFFECT_TONE)
    gl.uniform1f(locations.waterSaturation, WATER_EFFECT_SATURATION)
    this.stats.uniformUploadBytes += 40
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.UPLOAD_BYTES, 40)
    this.capabilityUpdate.devicePixelRatio = pixelRatio
    this.diagnostics.setCapabilities(this.capabilityUpdate)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.secondaryAtlasTexture || this.atlasTexture)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.quad)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(0, 0)

    this.pollGpuTimers()
    const timerQuery = this.beginGpuTimer()
    const submitToken = this.profiler.startSpan(PROFILER_SPAN_IDS.WEBGL_SUBMIT)
    const firstChunkX = Math.floor(startTileX / WATER_CHUNK_SIZE)
    const firstChunkY = Math.floor(startTileY / WATER_CHUNK_SIZE)
    const lastChunkX = Math.floor(Math.max(startTileX, endTileX - 1) / WATER_CHUNK_SIZE)
    const lastChunkY = Math.floor(Math.max(startTileY, endTileY - 1) / WATER_CHUNK_SIZE)
    let drawCalls = this.drawRetainedWaterPlane(
      topology,
      firstChunkX,
      firstChunkY,
      lastChunkX,
      lastChunkY,
      false
    )
    drawCalls += this.drawRetainedWaterPlane(
      topology,
      firstChunkX,
      firstChunkY,
      lastChunkX,
      lastChunkY,
      true
    )
    this.profiler.endSpan(submitToken)
    this.endGpuTimer(timerQuery)
    this.stats.drawCalls += drawCalls
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.DRAW_CALLS, drawCalls)

    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.activeTexture(gl.TEXTURE0)
    gl.useProgram(null)
    return drawCalls > 0
  }

  render(mapGrid, scrollOffset, canvas, options = {}) {
    if (!this.gl || !mapGrid?.length || !canvas) return false
    this.bindContextEvents(canvas)
    if (!this.ensureInitialized()) return false
    this.syncAtlasTexture()
    this.syncSecondaryAtlasTexture()

    const gl = this.gl
    const pixelRatio = this.getCanvasPixelRatio(canvas)
    const tileStep = TILE_SIZE * pixelRatio
    const tileSize = (TILE_SIZE + 1) * pixelRatio
    const scrollX = (scrollOffset?.x || 0) * pixelRatio
    const scrollY = (scrollOffset?.y || 0) * pixelRatio

    const bufferTiles = 2
    const tilesX = Math.ceil(canvas.width / tileStep) + bufferTiles * 2 + 1
    const tilesY = Math.ceil(canvas.height / tileStep) + bufferTiles * 2 + 1
    const startTileX = Math.max(0, Math.floor(scrollX / tileStep) - bufferTiles)
    const startTileY = Math.max(0, Math.floor(scrollY / tileStep) - bufferTiles)
    const endTileX = Math.min(mapGrid[0].length, startTileX + tilesX)
    const endTileY = Math.min(mapGrid.length, startTileY + tilesY)

    if (options.waterOnly) {
      return this.renderRetainedWater(mapGrid, scrollOffset, canvas, options, {
        pixelRatio,
        tileStep,
        tileSize,
        scrollX,
        scrollY,
        startTileX,
        startTileY,
        endTileX,
        endTileY
      })
    }

    const instances = this.buildTileInstances(mapGrid, startTileX, startTileY, endTileX, endTileY, options)
    if (!instances.length) return false

    this.ensureInstanceCapacity(instances.length)

    const translations = new Float32Array(instances.length * 2)
    const uvData = new Float32Array(instances.length * 4)
    const colors = new Float32Array(instances.length * 4)
    const textureType = new Float32Array(instances.length)
    const textureSource = new Float32Array(instances.length)
    const waterEdges = new Float32Array(instances.length * 4)
    const clipOrientation = new Float32Array(instances.length)

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]
      translations[i * 2] = inst.translation[0]
      translations[i * 2 + 1] = inst.translation[1]
      uvData[i * 4] = inst.uvRect[0]
      uvData[i * 4 + 1] = inst.uvRect[1]
      uvData[i * 4 + 2] = inst.uvRect[2]
      uvData[i * 4 + 3] = inst.uvRect[3]
      colors[i * 4] = inst.color[0]
      colors[i * 4 + 1] = inst.color[1]
      colors[i * 4 + 2] = inst.color[2]
      colors[i * 4 + 3] = inst.color[3]
      textureType[i] = inst.textureType
      textureSource[i] = inst.textureSource || 0
      waterEdges[i * 4] = inst.waterEdges[0]
      waterEdges[i * 4 + 1] = inst.waterEdges[1]
      waterEdges[i * 4 + 2] = inst.waterEdges[2]
      waterEdges[i * 4 + 3] = inst.waterEdges[3]
      clipOrientation[i] = inst.clipOrientation
    }

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(this.program)

    const locations = this.uniformLocations
    gl.uniform2f(locations.resolution, canvas.width, canvas.height)
    gl.uniform2f(locations.scroll, scrollX, scrollY)
    gl.uniform1f(locations.tileSize, tileSize)
    gl.uniform1f(locations.tileStep, tileStep)
    gl.uniform1f(locations.time, Number.isFinite(options.time)
      ? options.time
      : (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()))
    gl.uniform1f(locations.waterZoom, WATER_EFFECT_ZOOM)
    gl.uniform1f(locations.waterTone, WATER_EFFECT_TONE)
    gl.uniform1f(locations.waterSaturation, WATER_EFFECT_SATURATION)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.secondaryAtlasTexture || this.atlasTexture)
    // Base quad vertices
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.quad)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(0, 0)

    // Instance translations
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.translation)
    gl.bufferData(gl.ARRAY_BUFFER, translations, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(1, 1)

    // UV rectangles
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.uv)
    gl.bufferData(gl.ARRAY_BUFFER, uvData, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(2, 1)

    // Colors
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color)
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(3)
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(3, 1)

    // Texture type flags
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.textureType)
    gl.bufferData(gl.ARRAY_BUFFER, textureType, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(4)
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(4, 1)

    // Water edge masks (top, right, bottom, left)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.waterEdges)
    gl.bufferData(gl.ARRAY_BUFFER, waterEdges, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(5)
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(5, 1)

    // SOT clip orientation (0 = full quad)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.clipOrientation)
    gl.bufferData(gl.ARRAY_BUFFER, clipOrientation, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(6)
    gl.vertexAttribPointer(6, 1, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(6, 1)

    // Texture source (0 = legacy atlas, 1 = secondary/default street atlas)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.textureSource)
    gl.bufferData(gl.ARRAY_BUFFER, textureSource, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(7)
    gl.vertexAttribPointer(7, 1, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(7, 1)

    this.pollGpuTimers()
    const timerQuery = this.beginGpuTimer()
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instances.length)
    this.endGpuTimer(timerQuery)
    const geometryUploadBytes = translations.byteLength + uvData.byteLength + colors.byteLength +
      textureType.byteLength + textureSource.byteLength + waterEdges.byteLength + clipOrientation.byteLength
    this.stats.topologyUploadBytes += geometryUploadBytes
    this.stats.uniformUploadBytes += 40
    this.stats.drawCalls++
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.UPLOAD_BYTES, geometryUploadBytes + 40)
    this.diagnostics.addCounter(RENDER_COUNTER_IDS.DRAW_CALLS)
    this.capabilityUpdate.devicePixelRatio = pixelRatio
    this.diagnostics.setCapabilities(this.capabilityUpdate)

    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.activeTexture(gl.TEXTURE0)
    gl.useProgram(null)

    return true
  }

  getStatus() {
    return {
      contextLost: this.contextLost,
      topologyRevision: this.waterTopology?.revision ?? null,
      topologyBuffer: this.buffers.waterTopology || null,
      topologyData: this.waterTopology?.data || null,
      gpuTiming: { ...this.gpuTiming },
      timerCapability: this.timerExtension ? 'supported' : 'unsupported',
      stats: { ...this.stats }
    }
  }
}
