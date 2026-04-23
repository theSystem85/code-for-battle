const DEFAULT_CONFIG = Object.freeze({
  tileSize: 64,
  sheetColumns: 16,
  sheetRows: 16,
  roadWidth: 30,
  fadeDistance: 14,
  cornerRadius: 8,
  sheetSize: 1024
})

// Bit order is fixed to TRBL:
// bit0=Top, bit1=Right, bit2=Bottom, bit3=Left.
export const ROAD_AUTOTILE_BIT_ORDER = Object.freeze(['top', 'right', 'bottom', 'left'])

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - (2 * t))
}

function distanceToRoundedBox(px, py, centerX, centerY, halfSizeX, halfSizeY, radius) {
  const dx = Math.abs(px - centerX) - Math.max(0, halfSizeX - radius)
  const dy = Math.abs(py - centerY) - Math.max(0, halfSizeY - radius)
  const qx = Math.max(dx, 0)
  const qy = Math.max(dy, 0)
  const outsideDistance = Math.hypot(qx, qy)
  const insideDistance = Math.min(Math.max(dx, dy), 0)
  return outsideDistance + insideDistance - radius
}

function normalizeConfig(config = {}) {
  const tileSize = Math.max(8, Math.floor(Number(config.tileSize) || DEFAULT_CONFIG.tileSize))
  const sheetColumns = Math.max(1, Math.floor(Number(config.sheetColumns) || DEFAULT_CONFIG.sheetColumns))
  const sheetRows = Math.max(1, Math.floor(Number(config.sheetRows) || DEFAULT_CONFIG.sheetRows))
  const sheetSize = Math.max(1, Math.floor(Number(config.sheetSize) || (tileSize * sheetColumns)))
  const maxRoadWidth = Math.max(4, tileSize - 6)
  const roadWidth = clamp(Math.floor(Number(config.roadWidth) || DEFAULT_CONFIG.roadWidth), 4, maxRoadWidth)
  const maxFadeDistance = Math.max(1, Math.floor((tileSize / 2) - 1))
  const fadeDistance = clamp(Math.floor(Number(config.fadeDistance) || DEFAULT_CONFIG.fadeDistance), 1, maxFadeDistance)
  const maxCornerRadius = Math.max(0, Math.floor(tileSize / 4))
  const cornerRadius = clamp(Math.floor(Number(config.cornerRadius) || DEFAULT_CONFIG.cornerRadius), 0, maxCornerRadius)

  return {
    tileSize,
    sheetColumns,
    sheetRows,
    sheetSize,
    roadWidth,
    fadeDistance,
    cornerRadius
  }
}

export function bitmaskToConnectivity(bitmask) {
  const normalized = clamp(Math.floor(Number(bitmask) || 0), 0, 15)
  return {
    top: (normalized & 1) !== 0,
    right: (normalized & 2) !== 0,
    bottom: (normalized & 4) !== 0,
    left: (normalized & 8) !== 0
  }
}

export function connectivityToDebugLabel(connectivity) {
  return `T${connectivity.top ? 1 : 0} R${connectivity.right ? 1 : 0} B${connectivity.bottom ? 1 : 0} L${connectivity.left ? 1 : 0}`
}

function edgeFadeMultiplier(x, y, connectivity, config) {
  let alpha = 1
  const edgeFade = config.fadeDistance
  const maxCoord = config.tileSize - 1

  if (!connectivity.top) {
    alpha *= smoothstep(0, edgeFade, y)
  }
  if (!connectivity.right) {
    alpha *= smoothstep(0, edgeFade, maxCoord - x)
  }
  if (!connectivity.bottom) {
    alpha *= smoothstep(0, edgeFade, maxCoord - y)
  }
  if (!connectivity.left) {
    alpha *= smoothstep(0, edgeFade, x)
  }
  return alpha
}

function hasConnectedArmAtPixel(x, y, center, halfRoad, connectivity) {
  if (connectivity.top && x >= center - halfRoad && x <= center + halfRoad && y <= center) return true
  if (connectivity.right && y >= center - halfRoad && y <= center + halfRoad && x >= center) return true
  if (connectivity.bottom && x >= center - halfRoad && x <= center + halfRoad && y >= center) return true
  if (connectivity.left && y >= center - halfRoad && y <= center + halfRoad && x <= center) return true
  return false
}

export function generateRoadAutotileMaskTile(bitmask, config = {}) {
  const normalizedConfig = normalizeConfig(config)
  const connectivity = bitmaskToConnectivity(bitmask)
  const tileSize = normalizedConfig.tileSize
  const center = Math.floor(tileSize / 2)
  const halfRoad = normalizedConfig.roadWidth / 2
  const coreHalfSize = Math.max(2, (normalizedConfig.roadWidth / 2) + 1)
  const pixels = new Uint8ClampedArray(tileSize * tileSize)

  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      const idx = (y * tileSize) + x
      let alpha = 0
      const distance = distanceToRoundedBox(
        x + 0.5,
        y + 0.5,
        center,
        center,
        coreHalfSize,
        coreHalfSize,
        normalizedConfig.cornerRadius
      )
      if (distance <= 0) {
        alpha = 1
      }

      if (hasConnectedArmAtPixel(x, y, center, halfRoad, connectivity)) {
        alpha = 1
      } else if (alpha > 0) {
        alpha *= edgeFadeMultiplier(x, y, connectivity, normalizedConfig)
      }

      pixels[idx] = Math.round(clamp(alpha, 0, 1) * 255)
    }
  }

  return {
    bitmask: clamp(Math.floor(Number(bitmask) || 0), 0, 15),
    connectivity,
    label: connectivityToDebugLabel(connectivity),
    tileSize,
    pixels
  }
}

function createTilePlacement(index, columns) {
  return {
    x: (index % columns),
    y: Math.floor(index / columns)
  }
}

export function generateRoadAutotileMaskSheet(config = {}) {
  const normalizedConfig = normalizeConfig(config)
  const sheetWidth = normalizedConfig.sheetColumns * normalizedConfig.tileSize
  const sheetHeight = normalizedConfig.sheetRows * normalizedConfig.tileSize
  const requiredSheetSize = DEFAULT_CONFIG.sheetSize

  if (sheetWidth !== requiredSheetSize || sheetHeight !== requiredSheetSize) {
    throw new Error(`Road autotile sheet must be exactly 1024x1024. Got ${sheetWidth}x${sheetHeight}.`)
  }

  const sheetPixels = new Uint8ClampedArray(sheetWidth * sheetHeight)
  const tileDescriptors = []

  for (let bitmask = 0; bitmask < 16; bitmask++) {
    const tile = generateRoadAutotileMaskTile(bitmask, normalizedConfig)
    const placement = createTilePlacement(bitmask, normalizedConfig.sheetColumns)
    tileDescriptors.push({
      index: bitmask,
      bitmask,
      connectivity: tile.connectivity,
      label: tile.label,
      col: placement.x,
      row: placement.y
    })

    for (let y = 0; y < normalizedConfig.tileSize; y++) {
      for (let x = 0; x < normalizedConfig.tileSize; x++) {
        const sourceIdx = (y * normalizedConfig.tileSize) + x
        const targetX = (placement.x * normalizedConfig.tileSize) + x
        const targetY = (placement.y * normalizedConfig.tileSize) + y
        const targetIdx = (targetY * sheetWidth) + targetX
        sheetPixels[targetIdx] = tile.pixels[sourceIdx]
      }
    }
  }

  const validation = validateRoadAutotileMaskSheet({
    config: normalizedConfig,
    width: sheetWidth,
    height: sheetHeight,
    pixels: sheetPixels,
    tiles: tileDescriptors
  })

  return {
    config: normalizedConfig,
    width: sheetWidth,
    height: sheetHeight,
    pixels: sheetPixels,
    tiles: tileDescriptors,
    validation
  }
}

function samplePixel(sheet, col, row, x, y) {
  const px = (col * sheet.config.tileSize) + x
  const py = (row * sheet.config.tileSize) + y
  const idx = (py * sheet.width) + px
  return sheet.pixels[idx] || 0
}

export function validateRoadAutotileMaskSheet(sheet) {
  const errors = []
  const bitmasks = sheet.tiles.map(tile => tile.bitmask)
  const uniquePatterns = new Set(bitmasks)

  if (sheet.width !== 1024 || sheet.height !== 1024) {
    errors.push(`Invalid export size ${sheet.width}x${sheet.height}; expected 1024x1024.`)
  }
  if (sheet.tiles.length !== 16) {
    errors.push(`Expected 16 generated tiles, got ${sheet.tiles.length}.`)
  }
  if (uniquePatterns.size !== 16) {
    errors.push('Duplicated connectivity pattern detected in generated sheet.')
  }

  const center = Math.floor(sheet.config.tileSize / 2)
  sheet.tiles.forEach((tile) => {
    const edgeSamples = {
      top: samplePixel(sheet, tile.col, tile.row, center, 0),
      right: samplePixel(sheet, tile.col, tile.row, sheet.config.tileSize - 1, center),
      bottom: samplePixel(sheet, tile.col, tile.row, center, sheet.config.tileSize - 1),
      left: samplePixel(sheet, tile.col, tile.row, 0, center)
    }

    ROAD_AUTOTILE_BIT_ORDER.forEach((edge) => {
      const connected = Boolean(tile.connectivity[edge])
      const value = edgeSamples[edge]
      if (connected && value === 0) {
        errors.push(`Tile ${tile.index} (${tile.label}) does not touch ${edge} border center.`)
      }
      if (!connected && value !== 0) {
        errors.push(`Tile ${tile.index} (${tile.label}) incorrectly reaches ${edge} border center.`)
      }
    })
  })

  return {
    valid: errors.length === 0,
    errors,
    uniquePatternCount: uniquePatterns.size,
    generatedPatternCount: sheet.tiles.length
  }
}
