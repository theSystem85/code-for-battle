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

const WIDE_EDGE_FADE_DIRECTIONS = Object.freeze(['left', 'top', 'right', 'bottom'])

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

function rotateConnectivity(connectivity, turnsClockwise = 0) {
  let next = { ...connectivity }
  const turns = ((turnsClockwise % 4) + 4) % 4
  for (let i = 0; i < turns; i++) {
    next = {
      top: next.left,
      right: next.top,
      bottom: next.right,
      left: next.bottom
    }
  }
  return next
}

function connectivityToBitmask(connectivity) {
  return (connectivity.top ? ROAD_BITS.top : 0) |
    (connectivity.right ? ROAD_BITS.right : 0) |
    (connectivity.bottom ? ROAD_BITS.bottom : 0) |
    (connectivity.left ? ROAD_BITS.left : 0)
}

function buildConfig(config = {}) {
  const tileSize = clamp(Number.parseInt(config.tileSize, 10) || DEFAULT_CONFIG.tileSize, 16, 512)
  const columns = clamp(Number.parseInt(config.columns, 10) || DEFAULT_CONFIG.columns, 1, 64)
  const rows = clamp(Number.parseInt(config.rows, 10) || DEFAULT_CONFIG.rows, 1, 64)
  const maxRoadWidth = Math.max(4, tileSize - 8)
  const roadWidth = clamp(Number.parseInt(config.roadWidth, 10) || DEFAULT_CONFIG.roadWidth, 4, maxRoadWidth)
  const maxFade = Math.max(0, Math.floor((tileSize - roadWidth) / 2) - 1)
  const parsedFade = Number.parseInt(config.fadeDistance, 10)
  const fadeDistance = clamp(Number.isFinite(parsedFade) ? parsedFade : DEFAULT_CONFIG.fadeDistance, 0, maxFade)
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

function drawRoadBody(ctx, x, y, width, height, color) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, width, height)
}

function drawVerticalSideFade(ctx, x, y, width, height, fadeDistance) {
  if (fadeDistance <= 0) return
  const leftFade = ctx.createLinearGradient(x, 0, x - fadeDistance, 0)
  leftFade.addColorStop(0, 'rgba(255,255,255,0.88)')
  leftFade.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = leftFade
  ctx.fillRect(Math.max(0, x - fadeDistance), y, Math.min(fadeDistance, x), height)

  const rightFade = ctx.createLinearGradient(x + width, 0, x + width + fadeDistance, 0)
  rightFade.addColorStop(0, 'rgba(255,255,255,0.88)')
  rightFade.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = rightFade
  ctx.fillRect(x + width, y, fadeDistance, height)
}

function drawHorizontalSideFade(ctx, x, y, width, height, fadeDistance) {
  if (fadeDistance <= 0) return
  const topFade = ctx.createLinearGradient(0, y, 0, y - fadeDistance)
  topFade.addColorStop(0, 'rgba(255,255,255,0.88)')
  topFade.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = topFade
  ctx.fillRect(x, Math.max(0, y - fadeDistance), width, Math.min(fadeDistance, y))

  const bottomFade = ctx.createLinearGradient(0, y + height, 0, y + height + fadeDistance)
  bottomFade.addColorStop(0, 'rgba(255,255,255,0.88)')
  bottomFade.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = bottomFade
  ctx.fillRect(x, y + height, width, fadeDistance)
}

function drawSingleEdgeFade(ctx, tileSize, direction, fadeDistance) {
  if (fadeDistance <= 0) return
  if (direction === 'left') {
    const g = ctx.createLinearGradient(0, 0, fadeDistance, 0)
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, fadeDistance, tileSize)
  }
  if (direction === 'right') {
    const g = ctx.createLinearGradient(tileSize - fadeDistance, 0, tileSize, 0)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.fillStyle = g
    ctx.fillRect(tileSize - fadeDistance, 0, fadeDistance, tileSize)
  }
  if (direction === 'top') {
    const g = ctx.createLinearGradient(0, 0, 0, fadeDistance)
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, tileSize, fadeDistance)
  }
  if (direction === 'bottom') {
    const g = ctx.createLinearGradient(0, tileSize - fadeDistance, 0, tileSize)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.fillStyle = g
    ctx.fillRect(0, tileSize - fadeDistance, tileSize, fadeDistance)
  }
}

function renderBitmaskTile(ctx, bitmask, config) {
  const connectivity = bitmaskToConnectivity(bitmask)
  const tileSize = config.tileSize
  const center = Math.floor(tileSize / 2)
  const halfRoad = Math.floor(config.roadWidth / 2)
  const roadLeft = center - halfRoad
  const roadTop = center - halfRoad

  drawRoadBody(ctx, roadLeft, roadTop, config.roadWidth, config.roadWidth, config.roadColor)
  drawVerticalSideFade(ctx, roadLeft, roadTop, config.roadWidth, config.roadWidth, config.fadeDistance)
  drawHorizontalSideFade(ctx, roadLeft, roadTop, config.roadWidth, config.roadWidth, config.fadeDistance)

  if (connectivity.top) {
    drawRoadBody(ctx, roadLeft, 0, config.roadWidth, center, config.roadColor)
    drawVerticalSideFade(ctx, roadLeft, 0, config.roadWidth, center, config.fadeDistance)
  }
  if (connectivity.bottom) {
    drawRoadBody(ctx, roadLeft, center, config.roadWidth, tileSize - center, config.roadColor)
    drawVerticalSideFade(ctx, roadLeft, center, config.roadWidth, tileSize - center, config.fadeDistance)
  }
  if (connectivity.left) {
    drawRoadBody(ctx, 0, roadTop, center, config.roadWidth, config.roadColor)
    drawHorizontalSideFade(ctx, 0, roadTop, center, config.roadWidth, config.fadeDistance)
  }
  if (connectivity.right) {
    drawRoadBody(ctx, center, roadTop, tileSize - center, config.roadWidth, config.roadColor)
    drawHorizontalSideFade(ctx, center, roadTop, tileSize - center, config.roadWidth, config.fadeDistance)
  }
}

function renderTileToContext(ctx, tileSpec, config) {
  ctx.fillStyle = config.background
  ctx.fillRect(0, 0, config.tileSize, config.tileSize)

  if (tileSpec.kind === 'full-fill') {
    ctx.fillStyle = config.roadColor
    ctx.fillRect(0, 0, config.tileSize, config.tileSize)
    return
  }

  if (tileSpec.kind === 'wide-edge-fade') {
    ctx.fillStyle = config.roadColor
    ctx.fillRect(0, 0, config.tileSize, config.tileSize)
    drawSingleEdgeFade(ctx, config.tileSize, tileSpec.fadeEdge, config.fadeDistance)
    return
  }

  renderBitmaskTile(ctx, tileSpec.bitmask, config)
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
  renderTileToContext(ctx, { kind: 'bitmask', bitmask }, config)
  return canvas
}

function buildColumnLayout() {
  const empty = { top: false, right: false, bottom: false, left: false }
  const cap = { top: true, right: false, bottom: false, left: false }
  const straight = { top: true, right: false, bottom: true, left: false }
  const corner = { top: true, right: true, bottom: false, left: false }
  const tJunction = { top: true, right: true, bottom: true, left: false }
  const cross = { top: true, right: true, bottom: true, left: true }

  const layout = [
    { columnKey: 'empty', source: empty, rows: 1, base: true },
    { columnKey: 'cap', source: cap, rows: 4, base: true },
    { columnKey: 'straight', source: straight, rows: 2, base: true },
    { columnKey: 'corner', source: corner, rows: 4, base: true },
    { columnKey: 't_junction', source: tJunction, rows: 4, base: true },
    { columnKey: 'cross', source: cross, rows: 1, base: true },
    { columnKey: 'full_fill', source: null, rows: 1, base: false, kind: 'full-fill' },
    { columnKey: 'wide_edge_fade', source: null, rows: 4, base: false, kind: 'wide-edge-fade' }
  ]

  const tileSpecs = []
  layout.forEach((column, col) => {
    for (let row = 0; row < column.rows; row++) {
      if (column.kind === 'full-fill') {
        tileSpecs.push({ col, row, kind: 'full-fill', columnKey: column.columnKey, rotation: 0, debugLabel: 'FULL' })
        continue
      }
      if (column.kind === 'wide-edge-fade') {
        const fadeEdge = WIDE_EDGE_FADE_DIRECTIONS[row]
        tileSpecs.push({
          col,
          row,
          kind: 'wide-edge-fade',
          fadeEdge,
          columnKey: column.columnKey,
          rotation: row,
          debugLabel: `FULL F${fadeEdge[0].toUpperCase()}`
        })
        continue
      }
      const rotationTurns = row
      const rotated = rotateConnectivity(column.source, rotationTurns)
      const bitmask = connectivityToBitmask(rotated)
      tileSpecs.push({
        col,
        row,
        kind: 'bitmask',
        bitmask,
        connectivity: rotated,
        columnKey: column.columnKey,
        rotation: rotationTurns,
        base: true,
        debugLabel: connectivityToDebugLabel(rotated)
      })
    }
  })

  return tileSpecs
}

function validateConnectivityCoverage(baseMappings) {
  const masks = baseMappings.map(entry => entry.bitmask)
  const uniqueMasks = new Set(masks)
  return {
    generatedCount: uniqueMasks.size,
    uniqueCount: uniqueMasks.size,
    hasExactCoverage: uniqueMasks.size === 16 && uniqueMasks.has(0) && uniqueMasks.has(15)
  }
}

function getPixelBrightness(imageData, x, y) {
  const index = ((y * imageData.width) + x) * 4
  return Math.max(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2])
}

function validateEdgeCenters(sheetCanvas, config, baseMappings) {
  const ctx = sheetCanvas.getContext('2d', { alpha: true })
  if (!ctx) return { connectedCenterTouches: false, disconnectedCenterClear: false }
  const imageData = ctx.getImageData(0, 0, sheetCanvas.width, sheetCanvas.height)
  const center = Math.floor(config.tileSize / 2)
  let connectedCenterTouches = true
  let disconnectedCenterClear = true
  const connectedThreshold = 200
  const disconnectedThreshold = 8

  baseMappings.forEach(({ col, row, bitmask }) => {
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

  const layoutSpecs = buildColumnLayout()
  const tileMappings = []
  const baseMappingsByMask = new Map()

  layoutSpecs.forEach((spec) => {
    const tileCanvas = document.createElement('canvas')
    tileCanvas.width = config.tileSize
    tileCanvas.height = config.tileSize
    const tileCtx = tileCanvas.getContext('2d', { alpha: true })
    if (!tileCtx) return
    tileCtx.imageSmoothingEnabled = false
    renderTileToContext(tileCtx, spec, config)

    const x = spec.col * config.tileSize
    const y = spec.row * config.tileSize
    ctx.drawImage(tileCanvas, x, y)

    const tileMapping = {
      ...spec,
      tileIndex: (spec.row * config.columns) + spec.col,
      label: spec.debugLabel,
      connectivity: spec.kind === 'bitmask' ? bitmaskToConnectivity(spec.bitmask) : null
    }
    tileMappings.push(tileMapping)

    if (spec.kind === 'bitmask' && !baseMappingsByMask.has(spec.bitmask)) {
      baseMappingsByMask.set(spec.bitmask, tileMapping)
    }
  })

  const baseMappings = [...baseMappingsByMask.values()]
  const validations = {
    ...validateConnectivityCoverage(baseMappings),
    ...validateEdgeCenters(sheetCanvas, config, baseMappings),
    dimensions: validateOutputDimensions(sheetCanvas, config)
  }

  return {
    canvas: sheetCanvas,
    config,
    tileMappings,
    baseMappings,
    bitOrderLabel: ROAD_BIT_ORDER_LABEL,
    validations
  }
}
