const ROAD_BITS = Object.freeze({
  top: 1 << 0,
  right: 1 << 1,
  bottom: 1 << 2,
  left: 1 << 3
})

export const ROAD_BIT_ORDER_LABEL = 'Bit order: top=1 (2^0), right=2 (2^1), bottom=4 (2^2), left=8 (2^3)'

const DEFAULT_CONFIG = Object.freeze({
  tileSize: 64,
  columns: 16,
  rows: 16,
  roadWidth: 26,
  fadeDistance: 12,
  cornerRadius: 0,
  background: '#000000',
  roadColor: '#ffffff',
  requiredPatterns: 16
})

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function bitmaskToConnectivity(bitmask) {
  const safeMask = Number.isFinite(bitmask) ? (bitmask & 0b1111) : 0
  return {
    top: (safeMask & ROAD_BITS.top) !== 0,
    right: (safeMask & ROAD_BITS.right) !== 0,
    bottom: (safeMask & ROAD_BITS.bottom) !== 0,
    left: (safeMask & ROAD_BITS.left) !== 0
  }
}

export function connectivityToDebugLabel(connectivity) {
  return `T${connectivity.top ? 1 : 0} R${connectivity.right ? 1 : 0} B${connectivity.bottom ? 1 : 0} L${connectivity.left ? 1 : 0}`
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = clamp(radius, 0, Math.floor(Math.min(width, height) / 2))
  if (safeRadius <= 0) {
    ctx.fillRect(x, y, width, height)
    return
  }
  ctx.beginPath()
  ctx.moveTo(x + safeRadius, y)
  ctx.lineTo(x + width - safeRadius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  ctx.lineTo(x + width, y + height - safeRadius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  ctx.lineTo(x + safeRadius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  ctx.lineTo(x, y + safeRadius)
  ctx.quadraticCurveTo(x, y, x + safeRadius, y)
  ctx.closePath()
  ctx.fill()
}

function buildConfig(config = {}) {
  const tileSize = clamp(Number.parseInt(config.tileSize, 10) || DEFAULT_CONFIG.tileSize, 16, 512)
  const columns = clamp(Number.parseInt(config.columns, 10) || DEFAULT_CONFIG.columns, 1, 64)
  const rows = clamp(Number.parseInt(config.rows, 10) || DEFAULT_CONFIG.rows, 1, 64)
  const maxRoadWidth = Math.max(4, tileSize - 8)
  const roadWidth = clamp(Number.parseInt(config.roadWidth, 10) || DEFAULT_CONFIG.roadWidth, 4, maxRoadWidth)
  const maxFade = Math.max(1, Math.floor((tileSize - roadWidth) / 2) - 1)
  const fadeDistance = clamp(Number.parseInt(config.fadeDistance, 10) || DEFAULT_CONFIG.fadeDistance, 1, maxFade)
  const cornerRadius = clamp(Number.parseInt(config.cornerRadius, 10) || DEFAULT_CONFIG.cornerRadius, 0, Math.floor(roadWidth / 2))
  return {
    ...DEFAULT_CONFIG,
    ...config,
    tileSize,
    columns,
    rows,
    roadWidth,
    fadeDistance,
    cornerRadius,
    sheetWidth: columns * tileSize,
    sheetHeight: rows * tileSize
  }
}

function renderTileToContext(ctx, bitmask, config) {
  const connectivity = bitmaskToConnectivity(bitmask)
  const tileSize = config.tileSize
  const center = Math.floor(tileSize / 2)
  const halfRoad = Math.floor(config.roadWidth / 2)
  const roadLeft = center - halfRoad
  const roadTop = center - halfRoad

  ctx.fillStyle = config.background
  ctx.fillRect(0, 0, tileSize, tileSize)

  ctx.fillStyle = config.roadColor
  drawRoundedRect(ctx, roadLeft, roadTop, config.roadWidth, config.roadWidth, config.cornerRadius)

  if (connectivity.top) {
    drawRoundedRect(ctx, roadLeft, 0, config.roadWidth, center, Math.min(config.cornerRadius, Math.floor(config.roadWidth / 4)))
  }
  if (connectivity.right) {
    drawRoundedRect(ctx, center, roadTop, tileSize - center, config.roadWidth, Math.min(config.cornerRadius, Math.floor(config.roadWidth / 4)))
  }
  if (connectivity.bottom) {
    drawRoundedRect(ctx, roadLeft, center, config.roadWidth, tileSize - center, Math.min(config.cornerRadius, Math.floor(config.roadWidth / 4)))
  }
  if (connectivity.left) {
    drawRoundedRect(ctx, 0, roadTop, center, config.roadWidth, Math.min(config.cornerRadius, Math.floor(config.roadWidth / 4)))
  }

  const fade = config.fadeDistance

  if (!connectivity.top) {
    const topGrad = ctx.createLinearGradient(0, roadTop, 0, roadTop - fade)
    topGrad.addColorStop(0, 'rgba(255,255,255,1)')
    topGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = topGrad
    ctx.fillRect(roadLeft, Math.max(0, roadTop - fade), config.roadWidth, fade)
  }

  if (!connectivity.bottom) {
    const bottomGrad = ctx.createLinearGradient(0, roadTop + config.roadWidth, 0, roadTop + config.roadWidth + fade)
    bottomGrad.addColorStop(0, 'rgba(255,255,255,1)')
    bottomGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = bottomGrad
    ctx.fillRect(roadLeft, roadTop + config.roadWidth, config.roadWidth, Math.min(fade, tileSize - (roadTop + config.roadWidth)))
  }

  if (!connectivity.left) {
    const leftGrad = ctx.createLinearGradient(roadLeft, 0, roadLeft - fade, 0)
    leftGrad.addColorStop(0, 'rgba(255,255,255,1)')
    leftGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = leftGrad
    ctx.fillRect(Math.max(0, roadLeft - fade), roadTop, fade, config.roadWidth)
  }

  if (!connectivity.right) {
    const rightGrad = ctx.createLinearGradient(roadLeft + config.roadWidth, 0, roadLeft + config.roadWidth + fade, 0)
    rightGrad.addColorStop(0, 'rgba(255,255,255,1)')
    rightGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = rightGrad
    ctx.fillRect(roadLeft + config.roadWidth, roadTop, Math.min(fade, tileSize - (roadLeft + config.roadWidth)), config.roadWidth)
  }
}

export function generateRoadAutotileMaskTile(bitmask, inputConfig = {}) {
  const config = buildConfig(inputConfig)
  const canvas = document.createElement('canvas')
  canvas.width = config.tileSize
  canvas.height = config.tileSize
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) {
    throw new Error('2D canvas context unavailable for road autotile generation.')
  }
  ctx.imageSmoothingEnabled = false
  renderTileToContext(ctx, bitmask, config)
  return canvas
}

function validateConnectivityCoverage(tileMappings) {
  const masks = tileMappings.map(entry => entry.bitmask)
  const uniqueMasks = new Set(masks)
  return {
    generatedCount: tileMappings.length,
    uniqueCount: uniqueMasks.size,
    hasExactCoverage: uniqueMasks.size === 16 && uniqueMasks.has(0) && uniqueMasks.has(15)
  }
}

function getPixelBrightness(imageData, x, y) {
  const index = ((y * imageData.width) + x) * 4
  return Math.max(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2])
}

function validateEdgeCenters(sheetCanvas, config, tileMappings) {
  const ctx = sheetCanvas.getContext('2d', { alpha: true })
  if (!ctx) return { connectedCenterTouches: false, disconnectedCenterClear: false }
  const imageData = ctx.getImageData(0, 0, sheetCanvas.width, sheetCanvas.height)
  const center = Math.floor(config.tileSize / 2)
  let connectedCenterTouches = true
  let disconnectedCenterClear = true
  const connectedThreshold = 200
  const disconnectedThreshold = 8

  tileMappings.forEach(({ col, row, bitmask }) => {
    const connectivity = bitmaskToConnectivity(bitmask)
    const originX = col * config.tileSize
    const originY = row * config.tileSize
    const samples = [
      { enabled: connectivity.top, x: originX + center, y: originY },
      { enabled: connectivity.right, x: originX + config.tileSize - 1, y: originY + center },
      { enabled: connectivity.bottom, x: originX + center, y: originY + config.tileSize - 1 },
      { enabled: connectivity.left, x: originX, y: originY + center }
    ]

    samples.forEach((sample) => {
      const brightness = getPixelBrightness(imageData, sample.x, sample.y)
      if (sample.enabled && brightness < connectedThreshold) connectedCenterTouches = false
      if (!sample.enabled && brightness > disconnectedThreshold) disconnectedCenterClear = false
    })
  })

  return { connectedCenterTouches, disconnectedCenterClear }
}

function validateOutputDimensions(sheetCanvas, config) {
  return {
    width: sheetCanvas.width,
    height: sheetCanvas.height,
    isExpectedSize: sheetCanvas.width === (config.columns * config.tileSize) && sheetCanvas.height === (config.rows * config.tileSize)
  }
}

export function generateRoadAutotileMaskSheet(inputConfig = {}) {
  const config = buildConfig(inputConfig)
  const sheetCanvas = document.createElement('canvas')
  sheetCanvas.width = config.sheetWidth
  sheetCanvas.height = config.sheetHeight
  const ctx = sheetCanvas.getContext('2d', { alpha: true })
  if (!ctx) {
    throw new Error('2D canvas context unavailable for road autotile sheet generation.')
  }
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = config.background
  ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height)

  const tileMappings = []
  for (let bitmask = 0; bitmask < config.requiredPatterns; bitmask++) {
    const col = bitmask % config.columns
    const row = Math.floor(bitmask / config.columns)
    const tileCanvas = generateRoadAutotileMaskTile(bitmask, config)
    ctx.drawImage(tileCanvas, col * config.tileSize, row * config.tileSize)
    const connectivity = bitmaskToConnectivity(bitmask)
    tileMappings.push({
      bitmask,
      col,
      row,
      tileIndex: (row * config.columns) + col,
      connectivity,
      label: connectivityToDebugLabel(connectivity)
    })
  }

  const validations = {
    ...validateConnectivityCoverage(tileMappings),
    ...validateEdgeCenters(sheetCanvas, config, tileMappings),
    dimensions: validateOutputDimensions(sheetCanvas, config)
  }

  return {
    canvas: sheetCanvas,
    config,
    tileMappings,
    bitOrderLabel: ROAD_BIT_ORDER_LABEL,
    validations
  }
}
