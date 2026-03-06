import { TILE_COLORS, TILE_SIZE, USE_TEXTURES } from '../config.js'

const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aTranslation;
layout(location = 2) in vec4 aUVRect;
layout(location = 3) in vec4 aColor;
layout(location = 4) in float aTextureType;

uniform vec2 uResolution;
uniform vec2 uScroll;
uniform float uTileSize;
uniform float uTileStep;

out vec2 vUV;
out vec4 vColor;
out float vTextureType;

void main() {
  vec2 worldPos = aTranslation * uTileStep - uScroll + aPosition * uTileSize;
  vec2 zeroToOne = worldPos / uResolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  vUV = mix(aUVRect.xy, aUVRect.zw, aPosition);
  vColor = aColor;
  vTextureType = aTextureType;
}
`

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D uAtlas;
uniform sampler2D uWater;

in vec2 vUV;
in vec4 vColor;
in float vTextureType;

out vec4 outColor;

void main() {
  if (vTextureType > 1.5) {
    outColor = texture(uWater, vUV);
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
    this.waterTexture = null
    this.lastWaterFrame = null
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
    this.waterTexture = null
    this.lastWaterFrame = null
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
    gl.uniform1i(gl.getUniformLocation(this.program, 'uWater'), 1)
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

  syncWaterTexture() {
    if (!this.gl || !this.textureManager?.waterFrames?.length) return null

    const frame = this.textureManager.getCurrentWaterFrame()
    if (!frame) return null

    const gl = this.gl
    if (!this.waterTexture) {
      this.waterTexture = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, this.waterTexture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.waterTexture)
    }

    if (frame !== this.lastWaterFrame) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame)
      this.lastWaterFrame = frame
    }

    gl.bindTexture(gl.TEXTURE_2D, null)
    return this.waterTexture
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
        if (tile.type !== 'water') {
          instances.push(this.createInstance(tile.type, x, y, canUseTextures, false))
        }

        if (tile.seedCrystal) {
          instances.push(this.createInstance('seedCrystal', x, y, canUseTextures, false))
        } else if (tile.ore) {
          instances.push(this.createInstance('ore', x, y, canUseTextures, false))
        }
      }
    }

    return instances.filter(Boolean)
  }

  createInstance(type, tileX, tileY, canUseTextures) {
    const useTexture = canUseTextures && this.textureManager.tileTextureCache?.[type]?.length
    const isWaterAnimated = false
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
      textureType: isWaterAnimated ? 2 : useTexture ? 1 : 0
    }
  }

  ensureInstanceCapacity(count) {
    if (count <= this.instanceCapacity) return
    this.instanceCapacity = count
  }

  render(mapGrid, scrollOffset, canvas) {
    if (!this.gl || !mapGrid?.length || !canvas) return false
    if (!this.ensureInitialized()) return false
    this.syncAtlasTexture()
    this.syncWaterTexture()

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
    }

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(this.program)

    const resolutionLocation = gl.getUniformLocation(this.program, 'uResolution')
    const scrollLocation = gl.getUniformLocation(this.program, 'uScroll')
    const tileSizeLocation = gl.getUniformLocation(this.program, 'uTileSize')
    const tileStepLocation = gl.getUniformLocation(this.program, 'uTileStep')

    gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
    gl.uniform2f(scrollLocation, scrollX, scrollY)
    gl.uniform1f(tileSizeLocation, tileSize)
    gl.uniform1f(tileStepLocation, tileStep)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture)
    if (this.waterTexture) {
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.waterTexture)
    }

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

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instances.length)

    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.activeTexture(gl.TEXTURE0)
    gl.useProgram(null)

    return true
  }
}
