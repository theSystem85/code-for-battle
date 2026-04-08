import {
  TILE_COLORS,
  TILE_SIZE,
  USE_TEXTURES,
  SHORELINE_MASK_DEBUG_VIEW,
  WATER_EFFECT_TONE,
  WATER_EFFECT_SATURATION,
  WATER_EFFECT_ZOOM
} from '../config.js'

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
layout(location = 7) in vec4 aShorelineEdges;
layout(location = 8) in vec2 aShorelineMeta;
layout(location = 9) in vec4 aShorelineLandUV;
layout(location = 10) in vec4 aShorelineLandColor;

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
out vec4 vShorelineEdges;
out vec2 vShorelineMeta;
out vec4 vShorelineLandUV;
out vec4 vShorelineLandColor;

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
  vShorelineEdges = aShorelineEdges;
  vShorelineMeta = aShorelineMeta;
  vShorelineLandUV = aShorelineLandUV;
  vShorelineLandColor = aShorelineLandColor;
}
`

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D uAtlas;
uniform float uTime;
uniform float uWaterZoom;
uniform float uWaterTone;
uniform float uWaterSaturation;
uniform float uShorelineMaskDebugView;

in vec2 vUV;
in vec4 vColor;
in float vTextureType;
in vec2 vLocalPos;
in vec2 vWorldPos;
in vec4 vWaterEdges;
in float vClipOrientation;
in vec4 vShorelineEdges;
in vec2 vShorelineMeta;
in vec4 vShorelineLandUV;
in vec4 vShorelineLandColor;

out vec4 outColor;

vec3 applySaturation(vec3 color, float saturation) {
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(luma), color, max(saturation, 0.0));
}

vec3 sampleProceduralWater(vec2 worldPos, vec2 localPos, vec4 edgeMask) {
  float t = uTime * 0.001;
  float worldScale = 1.0 / max(uWaterZoom, 0.001);
  vec2 flow = vec2(
    sin(worldPos.y * (0.031 * worldScale) + t * 0.82),
    cos(worldPos.x * (0.029 * worldScale) - t * 0.74)
  );
  vec2 p = worldPos * (0.052 * worldScale) + flow * 1.15;
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
  if (edgeMask.x > 0.5) edgeDistance = min(edgeDistance, localPos.y);
  if (edgeMask.y > 0.5) edgeDistance = min(edgeDistance, 1.0 - localPos.x);
  if (edgeMask.z > 0.5) edgeDistance = min(edgeDistance, 1.0 - localPos.y);
  if (edgeMask.w > 0.5) edgeDistance = min(edgeDistance, localPos.x);
  float shoreMask = edgeDistance < 0.09 ? 1.0 : 0.0;
  waterColor += vec3(0.03, 0.05, 0.05) * shoreMask;
  return waterColor;
}

float computeShorelineBlendMask(vec2 localPos, vec4 edgeMask) {
  float edgeDistance = 1.0;
  if (edgeMask.x > 0.5) edgeDistance = min(edgeDistance, localPos.y);
  if (edgeMask.y > 0.5) edgeDistance = min(edgeDistance, 1.0 - localPos.x);
  if (edgeMask.z > 0.5) edgeDistance = min(edgeDistance, 1.0 - localPos.y);
  if (edgeMask.w > 0.5) edgeDistance = min(edgeDistance, localPos.x);
  return 1.0 - smoothstep(0.08, 0.42, edgeDistance);
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

  vec3 baseColor = vColor.rgb;
  bool isWaterBase = vTextureType > 1.5;

  if (isWaterBase) {
    baseColor = sampleProceduralWater(vWorldPos, vLocalPos, vWaterEdges);
  } else if (vTextureType > 0.5) {
    outColor = texture(uAtlas, vUV);
    baseColor = outColor.rgb;
  }

  if (vShorelineMeta.x > 0.5) {
    float shoreMask = computeShorelineBlendMask(vLocalPos, vShorelineEdges);
    if (uShorelineMaskDebugView > 0.5) {
      outColor = vec4(vec3(shoreMask), 1.0);
      return;
    }

    vec3 waterColor = sampleProceduralWater(vWorldPos, vLocalPos, vWaterEdges);
    vec3 landColor = vShorelineLandColor.rgb;
    if (vShorelineLandUV.z > vShorelineLandUV.x && vShorelineLandUV.w > vShorelineLandUV.y) {
      landColor = texture(uAtlas, mix(vShorelineLandUV.xy, vShorelineLandUV.zw, vLocalPos)).rgb;
    }

    if (vShorelineMeta.y > 0.5) {
      baseColor = mix(waterColor, landColor, shoreMask);
    } else {
      baseColor = mix(baseColor, waterColor, shoreMask);
    }
  } else if (uShorelineMaskDebugView > 0.5) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  if (!isWaterBase && vTextureType <= 0.5) {
    outColor = vec4(baseColor, vColor.a);
  } else {
    outColor = vec4(baseColor, 1.0);
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
  constructor(gl, textureManager, mapRenderer = null) {
    this.gl = gl
    this.textureManager = textureManager
    this.mapRenderer = mapRenderer
    this.program = null
    this.buffers = {}
    this.instanceCapacity = 0
    this.atlasTexture = null
    this.atlasSize = { ...DEFAULT_ATLAS_SIZE }
    this.colorCache = new Map()
    this.pixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    this.rendersWaterSot = true
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

  setMapRenderer(mapRenderer) {
    this.mapRenderer = mapRenderer
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
    this.buffers.clipOrientation = gl.createBuffer()
    this.buffers.shorelineEdges = gl.createBuffer()
    this.buffers.shorelineMeta = gl.createBuffer()
    this.buffers.shorelineLandUV = gl.createBuffer()
    this.buffers.shorelineLandColor = gl.createBuffer()

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
        baseInstances.push(this.createInstance(visualTileType, x, y, mapGrid, canUseTextures, sotMask))

        const sotInfo = sotMask?.[y]?.[x]
        if (sotInfo) {
          overlayInstances.push(this.createSotInstance(sotInfo.type, x, y, sotInfo.orientation, mapGrid, canUseTextures, sotMask))
        }

        if (tile.seedCrystal) {
          resourceInstances.push(this.createInstance('seedCrystal', x, y, mapGrid, canUseTextures, sotMask))
        } else if (tile.ore) {
          resourceInstances.push(this.createInstance('ore', x, y, mapGrid, canUseTextures, sotMask))
        }
      }
    }

    return [...baseInstances, ...overlayInstances, ...resourceInstances].filter(Boolean)
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
      waterEdges: [0, 0, 0, 0],
      clipOrientation: getSotClipOrientation(orientation),
      shorelineEdges: [0, 0, 0, 0],
      shorelineMeta: [0, 0],
      shorelineLandUV: [0, 0, 0, 0],
      shorelineLandColor: this.getColor('land')
    }
  }

  createSotInstance(type, tileX, tileY, orientation, mapGrid, canUseTextures, sotMask = null) {
    if (type === 'water') {
      return this.createWaterSotInstance(tileX, tileY, orientation)
    }

    const instance = this.createInstance(type, tileX, tileY, mapGrid, canUseTextures, sotMask)
    return {
      ...instance,
      waterEdges: [0, 0, 0, 0],
      clipOrientation: getSotClipOrientation(orientation),
      shorelineEdges: [0, 0, 0, 0],
      shorelineMeta: [0, 0],
      shorelineLandUV: [0, 0, 0, 0],
      shorelineLandColor: this.getColor('land')
    }
  }

  getLandBlendSource(tileX, tileY, canUseTextures) {
    const useTexture = canUseTextures && this.textureManager.tileTextureCache?.land?.length
    if (!useTexture) {
      return { uvRect: [0, 0, 0, 0], color: this.getColor('land') }
    }
    const cache = this.textureManager.tileTextureCache.land
    const idx = this.textureManager.getTileVariation('land', tileX, tileY)
    const info = cache[idx % cache.length]
    if (!info) {
      return { uvRect: [0, 0, 0, 0], color: this.getColor('land') }
    }
    return {
      uvRect: [
        info.x / this.atlasSize.width,
        info.y / this.atlasSize.height,
        (info.x + info.width) / this.atlasSize.width,
        (info.y + info.height) / this.atlasSize.height
      ],
      color: this.getColor('land')
    }
  }

  createInstance(type, tileX, tileY, mapGrid, canUseTextures, sotMask = null) {
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

    const shorelineInfo = (type === 'water' || type === 'land' || type === 'street')
      ? this.getShorelineInfo(mapGrid, tileX, tileY, type, canUseTextures)
      : {
        shorelineEdges: [0, 0, 0, 0],
        shorelineMeta: [0, 0],
        shorelineLandUV: [0, 0, 0, 0],
        shorelineLandColor: this.getColor('land')
      }

    return {
      translation: [tileX, tileY],
      uvRect,
      color: this.getColor(type),
      textureType: isWaterAnimated ? 2 : useTexture ? 1 : 0,
      waterEdges: isWaterAnimated ? this.computeWaterEdges(mapGrid, tileX, tileY, sotMask) : [0, 0, 0, 0],
      clipOrientation: SOT_CLIP_NONE,
      shorelineEdges: shorelineInfo.shorelineEdges,
      shorelineMeta: shorelineInfo.shorelineMeta,
      shorelineLandUV: shorelineInfo.shorelineLandUV,
      shorelineLandColor: shorelineInfo.shorelineLandColor
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

  getShorelineInfo(mapGrid, tileX, tileY, type, canUseTextures) {
    if (!this.mapRenderer || !mapGrid?.length) {
      return {
        shorelineEdges: [0, 0, 0, 0],
        shorelineMeta: [0, 0],
        shorelineLandUV: [0, 0, 0, 0],
        shorelineLandColor: this.getColor('land')
      }
    }
    const edges = this.mapRenderer.getShorelineMaskForTile(mapGrid, tileX, tileY) || [0, 0, 0, 0]
    const isShoreline = edges[0] || edges[1] || edges[2] || edges[3]
    const isWaterBase = type === 'water'
    const landBlend = this.getLandBlendSource(tileX, tileY, canUseTextures)
    return {
      shorelineEdges: edges,
      shorelineMeta: [isShoreline ? 1 : 0, isWaterBase ? 1 : 0],
      shorelineLandUV: landBlend.uvRect,
      shorelineLandColor: landBlend.color
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
    const clipOrientation = new Float32Array(instances.length)
    const shorelineEdges = new Float32Array(instances.length * 4)
    const shorelineMeta = new Float32Array(instances.length * 2)
    const shorelineLandUV = new Float32Array(instances.length * 4)
    const shorelineLandColor = new Float32Array(instances.length * 4)

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
      clipOrientation[i] = inst.clipOrientation
      shorelineEdges[i * 4] = inst.shorelineEdges[0]
      shorelineEdges[i * 4 + 1] = inst.shorelineEdges[1]
      shorelineEdges[i * 4 + 2] = inst.shorelineEdges[2]
      shorelineEdges[i * 4 + 3] = inst.shorelineEdges[3]
      shorelineMeta[i * 2] = inst.shorelineMeta[0]
      shorelineMeta[i * 2 + 1] = inst.shorelineMeta[1]
      shorelineLandUV[i * 4] = inst.shorelineLandUV[0]
      shorelineLandUV[i * 4 + 1] = inst.shorelineLandUV[1]
      shorelineLandUV[i * 4 + 2] = inst.shorelineLandUV[2]
      shorelineLandUV[i * 4 + 3] = inst.shorelineLandUV[3]
      shorelineLandColor[i * 4] = inst.shorelineLandColor[0]
      shorelineLandColor[i * 4 + 1] = inst.shorelineLandColor[1]
      shorelineLandColor[i * 4 + 2] = inst.shorelineLandColor[2]
      shorelineLandColor[i * 4 + 3] = inst.shorelineLandColor[3]
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
    const waterZoomLocation = gl.getUniformLocation(this.program, 'uWaterZoom')
    const waterToneLocation = gl.getUniformLocation(this.program, 'uWaterTone')
    const waterSaturationLocation = gl.getUniformLocation(this.program, 'uWaterSaturation')
    const shorelineMaskDebugViewLocation = gl.getUniformLocation(this.program, 'uShorelineMaskDebugView')

    gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
    gl.uniform2f(scrollLocation, scrollX, scrollY)
    gl.uniform1f(tileSizeLocation, tileSize)
    gl.uniform1f(tileStepLocation, tileStep)
    gl.uniform1f(timeLocation, (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()))
    gl.uniform1f(waterZoomLocation, WATER_EFFECT_ZOOM)
    gl.uniform1f(waterToneLocation, WATER_EFFECT_TONE)
    gl.uniform1f(waterSaturationLocation, WATER_EFFECT_SATURATION)
    gl.uniform1f(shorelineMaskDebugViewLocation, SHORELINE_MASK_DEBUG_VIEW ? 1 : 0)

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

    // SOT clip orientation (0 = full quad)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.clipOrientation)
    gl.bufferData(gl.ARRAY_BUFFER, clipOrientation, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(6)
    gl.vertexAttribPointer(6, 1, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(6, 1)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.shorelineEdges)
    gl.bufferData(gl.ARRAY_BUFFER, shorelineEdges, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(7)
    gl.vertexAttribPointer(7, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(7, 1)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.shorelineMeta)
    gl.bufferData(gl.ARRAY_BUFFER, shorelineMeta, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(8)
    gl.vertexAttribPointer(8, 2, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(8, 1)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.shorelineLandUV)
    gl.bufferData(gl.ARRAY_BUFFER, shorelineLandUV, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(9)
    gl.vertexAttribPointer(9, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(9, 1)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.shorelineLandColor)
    gl.bufferData(gl.ARRAY_BUFFER, shorelineLandColor, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(10)
    gl.vertexAttribPointer(10, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(10, 1)

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instances.length)

    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.useProgram(null)

    return true
  }
}
