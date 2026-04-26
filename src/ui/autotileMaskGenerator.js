// Deterministic 4-bit order (LSB→MSB): top=1, right=2, bottom=4, left=8
export const ROAD_AUTOTILE_BIT_ORDER = Object.freeze(['top', 'right', 'bottom', 'left'])

export const ROAD_AUTOTILE_GENERATOR_TYPE = 'road-4bit-mask'

export const ROAD_AUTOTILE_DEFAULT_CONFIG = Object.freeze({
  generatorType: ROAD_AUTOTILE_GENERATOR_TYPE,
  tileSize: 64,
  columns: 16,
  rows: 16,
  sheetWidth: 1024,
  sheetHeight: 1024,
  roadWidth: 24,
  fadeDistance: 14,
  cornerRadius: 6
})

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export function normalizeRoadAutotileConfig(raw = {}) {
  const tileSize = ROAD_AUTOTILE_DEFAULT_CONFIG.tileSize
  const columns = ROAD_AUTOTILE_DEFAULT_CONFIG.columns
  const rows = ROAD_AUTOTILE_DEFAULT_CONFIG.rows
  const sheetWidth = ROAD_AUTOTILE_DEFAULT_CONFIG.sheetWidth
  const sheetHeight = ROAD_AUTOTILE_DEFAULT_CONFIG.sheetHeight
  const maxRoadWidth = Math.max(4, tileSize - 4)
  return {
    generatorType: ROAD_AUTOTILE_GENERATOR_TYPE,
    tileSize,
    columns,
    rows,
    sheetWidth,
    sheetHeight,
    roadWidth: Math.floor(clampNumber(raw.roadWidth, 4, maxRoadWidth, ROAD_AUTOTILE_DEFAULT_CONFIG.roadWidth)),
    fadeDistance: Math.floor(clampNumber(raw.fadeDistance, 1, tileSize / 2, ROAD_AUTOTILE_DEFAULT_CONFIG.fadeDistance)),
    cornerRadius: Math.floor(clampNumber(raw.cornerRadius, 0, tileSize / 2, ROAD_AUTOTILE_DEFAULT_CONFIG.cornerRadius))
  }
}

export function bitmaskToConnectivity(bitmask) {
  const normalizedMask = Math.max(0, Math.min(15, Math.floor(bitmask) || 0))
  return {
    top: Boolean(normalizedMask & 0b0001),
    right: Boolean(normalizedMask & 0b0010),
    bottom: Boolean(normalizedMask & 0b0100),
    left: Boolean(normalizedMask & 0b1000)
  }
}

export function connectivityToDebugLabel(connectivity) {
  return `T${connectivity.top ? 1 : 0} R${connectivity.right ? 1 : 0} B${connectivity.bottom ? 1 : 0} L${connectivity.left ? 1 : 0}`
}

function computeDirectionalContribution(connectivity, config, x, y) {
  const center = (config.tileSize - 1) / 2
  const halfRoad = config.roadWidth / 2
  const inVerticalBand = Math.abs(x - center) <= halfRoad
  const inHorizontalBand = Math.abs(y - center) <= halfRoad
  let alpha = 0

  if (inVerticalBand) {
    if (y <= center) {
      if (connectivity.top) {
        alpha = Math.max(alpha, 1)
      } else {
        const fade = Math.max(1, config.fadeDistance)
        alpha = Math.max(alpha, Math.max(0, Math.min(1, y / fade)))
      }
    }

    if (y >= center) {
      if (connectivity.bottom) {
        alpha = Math.max(alpha, 1)
      } else {
        const fade = Math.max(1, config.fadeDistance)
        const distFromBottom = (config.tileSize - 1) - y
        alpha = Math.max(alpha, Math.max(0, Math.min(1, distFromBottom / fade)))
      }
    }
  }

  if (inHorizontalBand) {
    if (x >= center) {
      if (connectivity.right) {
        alpha = Math.max(alpha, 1)
      } else {
        const fade = Math.max(1, config.fadeDistance)
        const distFromRight = (config.tileSize - 1) - x
        alpha = Math.max(alpha, Math.max(0, Math.min(1, distFromRight / fade)))
      }
    }

    if (x <= center) {
      if (connectivity.left) {
        alpha = Math.max(alpha, 1)
      } else {
        const fade = Math.max(1, config.fadeDistance)
        alpha = Math.max(alpha, Math.max(0, Math.min(1, x / fade)))
      }
    }
  }

  return alpha
}

function applyCornerSmoothing(alpha, config, x, y) {
  if (alpha <= 0 || config.cornerRadius <= 0) return alpha
  const center = (config.tileSize - 1) / 2
  const halfRoad = config.roadWidth / 2
  const cornerRadius = config.cornerRadius

  const dx = Math.max(0, Math.abs(x - center) - halfRoad)
  const dy = Math.max(0, Math.abs(y - center) - halfRoad)
  if (dx <= 0 || dy <= 0) return alpha

  const distance = Math.sqrt((dx * dx) + (dy * dy))
  if (distance <= 0) return alpha
  const edgeAlpha = Math.max(0, Math.min(1, 1 - (distance / Math.max(1, cornerRadius))))
  return Math.min(alpha, edgeAlpha)
}

export function generateRoadAutotileMaskTile(bitmask, rawConfig = {}) {
  const config = normalizeRoadAutotileConfig(rawConfig)
  const connectivity = bitmaskToConnectivity(bitmask)
  const tileSize = config.tileSize
  const pixels = new Uint8ClampedArray(tileSize * tileSize * 4)

  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      let alpha = computeDirectionalContribution(connectivity, config, x, y)
      alpha = applyCornerSmoothing(alpha, config, x, y)
      const value = Math.max(0, Math.min(255, Math.round(alpha * 255)))
      const idx = (y * tileSize + x) * 4
      pixels[idx] = value
      pixels[idx + 1] = value
      pixels[idx + 2] = value
      pixels[idx + 3] = 255
    }
  }

  return {
    bitmask: Math.max(0, Math.min(15, Math.floor(bitmask) || 0)),
    connectivity,
    width: tileSize,
    height: tileSize,
    pixels
  }
}

function createCanvas(width, height) {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }

  if (typeof globalThis !== 'undefined' && typeof globalThis.OffscreenCanvas !== 'undefined') {
    return new globalThis.OffscreenCanvas(width, height)
  }

  throw new Error('Canvas API is not available in this environment.')
}

export function validateRoadAutotileMaskSheet(sheet, rawConfig = {}) {
  const config = normalizeRoadAutotileConfig(rawConfig)
  const errors = []
  const seen = new Set(sheet?.tileMap?.map(entry => entry.bitmask) || [])

  if (seen.size !== 16) {
    errors.push(`Expected 16 unique bitmasks but got ${seen.size}.`)
  }

  for (let mask = 0; mask < 16; mask++) {
    if (!seen.has(mask)) {
      errors.push(`Missing bitmask ${mask}.`)
    }
  }

  if (!sheet?.canvas || sheet.canvas.width !== config.sheetWidth || sheet.canvas.height !== config.sheetHeight) {
    errors.push(`Sheet must be exactly ${config.sheetWidth}x${config.sheetHeight}.`)
  }

  const tileCenter = Math.floor(config.tileSize / 2)
  sheet?.tileMap?.forEach((entry) => {
    const tile = entry.tile
    const read = (x, y) => {
      const idx = (y * tile.width + x) * 4
      return tile.pixels[idx]
    }
    const borderSamples = {
      top: read(tileCenter, 0),
      right: read(tile.width - 1, tileCenter),
      bottom: read(tileCenter, tile.height - 1),
      left: read(0, tileCenter)
    }

    ROAD_AUTOTILE_BIT_ORDER.forEach((edge) => {
      const connected = entry.connectivity[edge]
      const value = borderSamples[edge]
      if (connected && value < 250) {
        errors.push(`Bitmask ${entry.bitmask}: connected ${edge} edge does not touch border center.`)
      }
      if (!connected && value > 0) {
        errors.push(`Bitmask ${entry.bitmask}: non-connected ${edge} edge reaches border center.`)
      }
    })
  })

  return {
    valid: errors.length === 0,
    errors
  }
}

export function generateRoadAutotileMaskSheet(rawConfig = {}) {
  const config = normalizeRoadAutotileConfig(rawConfig)
  const canvas = createCanvas(config.sheetWidth, config.sheetHeight)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Unable to get 2D context for autotile sheet generation.')
  }

  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, config.sheetWidth, config.sheetHeight)

  const tileMap = []
  for (let bitmask = 0; bitmask < 16; bitmask++) {
    const tile = generateRoadAutotileMaskTile(bitmask, config)
    const col = bitmask % config.columns
    const row = Math.floor(bitmask / config.columns)
    const offsetX = col * config.tileSize
    const offsetY = row * config.tileSize
    for (let y = 0; y < tile.height; y++) {
      for (let x = 0; x < tile.width; x++) {
        const idx = (y * tile.width + x) * 4
        const value = tile.pixels[idx]
        if (value <= 0) continue
        ctx.fillStyle = `rgb(${value}, ${value}, ${value})`
        ctx.fillRect(offsetX + x, offsetY + y, 1, 1)
      }
    }
    tileMap.push({
      bitmask,
      connectivity: tile.connectivity,
      col,
      row,
      tile
    })
  }

  const validation = validateRoadAutotileMaskSheet({ canvas, tileMap }, config)
  return {
    config,
    canvas,
    tileMap,
    validation,
    bitOrderDescription: 'Bit order (LSB→MSB): Top=1, Right=2, Bottom=4, Left=8'
  }
}
