import { TILE_COLORS, TILE_SIZE, USE_TEXTURES } from '../config.js'

const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aTranslation;
layout(location = 2) in vec4 aUVRect;
layout(location = 3) in vec4 aColor;
layout(location = 4) in float aTextureType;
layout(location = 5) in vec4 aWaterEdges;

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

void main() {
  vec2 worldPos = aTranslation * uTileStep - uScroll + aPosition * uTileSize;
  vec2 zeroToOne = worldPos / uResolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  vUV = mix(aUVRect.xy, aUVRect.zw, aPosition);
  vColor = aColor;
  vTextureType = aTextureType;
  vLocalPos = aPosition;
  vWorldPos = worldPos;
  vWaterEdges = aWaterEdges;
}
`

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D uAtlas;
uniform float uTime;

in vec2 vUV;
in vec4 vColor;
in float vTextureType;
in vec2 vLocalPos;
in vec2 vWorldPos;
in vec4 vWaterEdges;

out vec4 outColor;

void main() {
  if (vTextureType > 1.5) {
    float t = uTime * 0.001;
    vec2 flow = vec2(
      sin(vWorldPos.y * 0.018 + t * 0.55),
      cos(vWorldPos.x * 0.016 - t * 0.48)
    );
    vec2 p = vWorldPos * 0.032 + flow * 2.4;
    float waveA = sin(p.x + t * 0.9);
    float waveB = cos(p.y * 1.2 - t * 1.15);
    float waveC = sin((p.x + p.y) * 0.65 + t * 0.45);
    float wave = (waveA + waveB + waveC) / 3.0;
    float shimmer = 0.5 + 0.5 * sin((p.x * 0.7 - p.y * 0.6) + t * 1.35);

    vec3 deepColor = vec3(0.05, 0.21, 0.35);
    vec3 shallowColor = vec3(0.11, 0.43, 0.56);
    vec3 waterColor = mix(deepColor, shallowColor, 0.45 + wave * 0.22);
    waterColor += vec3(0.03, 0.06, 0.08) * shimmer * 0.35;

    float edgeDistance = 1.0;
    if (vWaterEdges.x > 0.5) edgeDistance = min(edgeDistance, vLocalPos.y);
    if (vWaterEdges.y > 0.5) edgeDistance = min(edgeDistance, 1.0 - vLocalPos.x);
    if (vWaterEdges.z > 0.5) edgeDistance = min(edgeDistance, 1.0 - vLocalPos.y);
    if (vWaterEdges.w > 0.5) edgeDistance = min(edgeDistance, vLocalPos.x);

    float shoreBlend = 1.0 - smoothstep(0.0, 0.16, edgeDistance);
    float foam = shoreBlend * (0.35 + 0.65 * (0.5 + 0.5 * sin((p.x + p.y) * 1.8 - t * 1.8)));
    vec3 shoreColor = vec3(0.30, 0.56, 0.63);
    waterColor = mix(waterColor, shoreColor, shoreBlend * 0.65);
    waterColor += vec3(0.20, 0.24, 0.24) * foam * 0.28;

    outColor = vec4(waterColor, 1.0);
  } else if (vTextureType > 0.5) {
    outColor = texture(uAtlas, vUV);
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

export class GameWebGLRenderer {
  constructor(gl, textureManager) {
    this.gl = gl
    this.textureManager = textureManager
    this.program = null
    this.buffers = {}
    this.instanceCapacity = 0
    this.atlasTexture = null
    this.atlasSize = { ...DEFAULT_ATLAS_SIZE }
    this.colorCache = new Map()
    this.pixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
  }

  setContext(gl) {
    if (this.gl === gl) return
    this.gl = gl
    this.program = null
    this.buffers = {}
    this.instanceCapacity = 0
    this.atlasTexture = null
    this.atlasSize = { ...DEFAULT_ATLAS_SIZE }
  }

  ensureInitialized() {
    if (
      !this.gl ||
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

    gl.useProgram(this.program)
    gl.uniform1i(gl.getUniformLocation(this.program, 'uAtlas'), 0)
    gl.useProgram(null)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    return true
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
  }

  getColor(type) {
    if (!this.colorCache.has(type)) {
      this.colorCache.set(type, parseColor(TILE_COLORS[type]))
    }
    return this.colorCache.get(type)
  }

  buildTileInstances(mapGrid, startX, startY, endX, endY) {
    const instances = []
    const canUseTextures = USE_TEXTURES && this.textureManager?.allTexturesLoaded

    for (let y = startY; y < endY; y++) {
      const row = mapGrid[y]
      for (let x = startX; x < endX; x++) {
        const tile = row[x]
        if (!tile) continue
        instances.push(this.createInstance(tile.type, x, y, mapGrid, canUseTextures))

        if (tile.seedCrystal) {
          instances.push(this.createInstance('seedCrystal', x, y, mapGrid, canUseTextures))
        } else if (tile.ore) {
          instances.push(this.createInstance('ore', x, y, mapGrid, canUseTextures))
        }
      }
    }

    return instances.filter(Boolean)
  }

  createInstance(type, tileX, tileY, mapGrid, canUseTextures) {
    const useTexture = canUseTextures && this.textureManager.tileTextureCache?.[type]?.length
    const isWaterAnimated = type === 'water'
    let uvRect = [0, 0, 0, 0]
    if (isWaterAnimated) {
      uvRect = [0, 0, 1, 1]
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
      textureType: isWaterAnimated ? 2 : useTexture ? 1 : 0,
      waterEdges: isWaterAnimated ? this.computeWaterEdges(mapGrid, tileX, tileY) : [0, 0, 0, 0]
    }
  }

  computeWaterEdges(mapGrid, tileX, tileY) {
    const row = mapGrid[tileY]
    if (!row || row[tileX]?.type !== 'water') return [0, 0, 0, 0]

    const top = tileY <= 0 || mapGrid[tileY - 1]?.[tileX]?.type !== 'water' ? 1 : 0
    const right = tileX >= row.length - 1 || mapGrid[tileY]?.[tileX + 1]?.type !== 'water' ? 1 : 0
    const bottom = tileY >= mapGrid.length - 1 || mapGrid[tileY + 1]?.[tileX]?.type !== 'water' ? 1 : 0
    const left = tileX <= 0 || mapGrid[tileY]?.[tileX - 1]?.type !== 'water' ? 1 : 0

    return [top, right, bottom, left]
  }

  ensureInstanceCapacity(count) {
    if (count <= this.instanceCapacity) return
    this.instanceCapacity = count
  }

  render(mapGrid, scrollOffset, canvas) {
    if (!this.gl || !mapGrid?.length || !canvas) return false
    if (!this.ensureInitialized()) return false
    this.syncAtlasTexture()

    const gl = this.gl
    const pixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || this.pixelRatio || 1
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

    const instances = this.buildTileInstances(mapGrid, startTileX, startTileY, endTileX, endTileY)
    if (!instances.length) return false

    this.ensureInstanceCapacity(instances.length)

    const translations = new Float32Array(instances.length * 2)
    const uvData = new Float32Array(instances.length * 4)
    const colors = new Float32Array(instances.length * 4)
    const textureType = new Float32Array(instances.length)
    const waterEdges = new Float32Array(instances.length * 4)

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
      waterEdges[i * 4] = inst.waterEdges[0]
      waterEdges[i * 4 + 1] = inst.waterEdges[1]
      waterEdges[i * 4 + 2] = inst.waterEdges[2]
      waterEdges[i * 4 + 3] = inst.waterEdges[3]
    }

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(this.program)

    const resolutionLocation = gl.getUniformLocation(this.program, 'uResolution')
    const scrollLocation = gl.getUniformLocation(this.program, 'uScroll')
    const tileSizeLocation = gl.getUniformLocation(this.program, 'uTileSize')
    const tileStepLocation = gl.getUniformLocation(this.program, 'uTileStep')
    const timeLocation = gl.getUniformLocation(this.program, 'uTime')

    gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
    gl.uniform2f(scrollLocation, scrollX, scrollY)
    gl.uniform1f(tileSizeLocation, tileSize)
    gl.uniform1f(tileStepLocation, tileStep)
    gl.uniform1f(timeLocation, (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()))

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture)
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
    if (!this.buffers.waterEdges) {
      this.buffers.waterEdges = gl.createBuffer()
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.waterEdges)
    gl.bufferData(gl.ARRAY_BUFFER, waterEdges, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(5)
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(5, 1)

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instances.length)

    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.useProgram(null)

    return true
  }
}
