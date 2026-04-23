const ROAD_BIT_ORDER = Object.freeze([
  { key: 'top', short: 'T', bit: 1 },
  { key: 'right', short: 'R', bit: 2 },
  { key: 'bottom', short: 'B', bit: 4 },
  { key: 'left', short: 'L', bit: 8 }
])

export const ROAD_AUTOTILE_BIT_ORDER_LABEL = 'Bit order: T=1, R=2, B=4, L=8 (TRBL)'

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function clampFloat(value, min, max, fallback) {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export function bitmaskToConnectivity(bitmask) {
  const normalized = clampInt(bitmask, 0, 15, 0)
  return {
    top: (normalized & 1) !== 0,
    right: (normalized & 2) !== 0,
    bottom: (normalized & 4) !== 0,
    left: (normalized & 8) !== 0
  }
}

export function connectivityToDebugLabel(connectivity) {
  return ROAD_BIT_ORDER
    .map(({ key, short }) => `${short}${connectivity?.[key] ? 1 : 0}`)
    .join(' ')
}

function getDefaultConfig(input = {}) {
  const tileSize = clampInt(input.tileSize, 8, 256, 64)
  const columns = clampInt(input.columns, 1, 64, 16)
  const rows = clampInt(input.rows, 1, 64, 16)
  const roadWidth = clampInt(input.roadWidth, 4, tileSize - 2, Math.floor(tileSize * 0.52))
  const maxFade = Math.max(2, Math.floor((tileSize / 2) - 2))
  return {
    tileSize,
    columns,
    rows,
    roadWidth: Math.min(roadWidth, tileSize - 2),
    fadeDistance: clampInt(input.fadeDistance, 1, maxFade, Math.floor(tileSize * 0.2)),
    cornerRadius: clampFloat(input.cornerRadius, 0, tileSize / 4, 0),
    requiredMaskCount: 16
  }
}

function fillRoundedRect(ctx, x, y, width, height, radius) {
  if (!radius || radius <= 0) {
    ctx.fillRect(x, y, width, height)
    return
  }
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

function drawDisconnectedFade(ctx, direction, tileSize, halfRoad, fadeDistance) {
  const center = Math.floor(tileSize / 2)
  const borderGap = 1
  const maxSpan = Math.max(1, Math.floor((tileSize / 2) - halfRoad - borderGap))
  const effectiveFade = Math.min(Math.max(1, fadeDistance), maxSpan)
  const solidSpan = Math.max(0, maxSpan - effectiveFade)

  if (direction === 'top') {
    const x = center - halfRoad
    const ySolid = center - halfRoad - solidSpan
    if (solidSpan > 0) ctx.fillRect(x, ySolid, halfRoad * 2, solidSpan)
    const grad = ctx.createLinearGradient(0, ySolid, 0, ySolid - effectiveFade)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(x, ySolid - effectiveFade, halfRoad * 2, effectiveFade)
    return
  }

  if (direction === 'bottom') {
    const x = center - halfRoad
    const ySolid = center + halfRoad
    if (solidSpan > 0) ctx.fillRect(x, ySolid, halfRoad * 2, solidSpan)
    const grad = ctx.createLinearGradient(0, ySolid + solidSpan, 0, ySolid + solidSpan + effectiveFade)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(x, ySolid + solidSpan, halfRoad * 2, effectiveFade)
    return
  }

  if (direction === 'left') {
    const y = center - halfRoad
    const xSolid = center - halfRoad - solidSpan
    if (solidSpan > 0) ctx.fillRect(xSolid, y, solidSpan, halfRoad * 2)
    const grad = ctx.createLinearGradient(xSolid, 0, xSolid - effectiveFade, 0)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(xSolid - effectiveFade, y, effectiveFade, halfRoad * 2)
    return
  }

  const y = center - halfRoad
  const xSolid = center + halfRoad
  if (solidSpan > 0) ctx.fillRect(xSolid, y, solidSpan, halfRoad * 2)
  const grad = ctx.createLinearGradient(xSolid + solidSpan, 0, xSolid + solidSpan + effectiveFade, 0)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(xSolid + solidSpan, y, effectiveFade, halfRoad * 2)
}

export function generateRoadAutotileMaskTile(bitmask, config = {}) {
  const normalizedConfig = getDefaultConfig(config)
  const tileCanvas = document.createElement('canvas')
  tileCanvas.width = normalizedConfig.tileSize
  tileCanvas.height = normalizedConfig.tileSize
  const ctx = tileCanvas.getContext('2d', { alpha: true })
  if (!ctx) {
    return { canvas: tileCanvas, connectivity: bitmaskToConnectivity(bitmask), debugLabel: connectivityToDebugLabel(bitmaskToConnectivity(bitmask)) }
  }

  const connectivity = bitmaskToConnectivity(bitmask)
  const halfRoad = Math.max(2, Math.floor(normalizedConfig.roadWidth / 2))
  const center = Math.floor(normalizedConfig.tileSize / 2)

  ctx.clearRect(0, 0, normalizedConfig.tileSize, normalizedConfig.tileSize)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, normalizedConfig.tileSize, normalizedConfig.tileSize)
  ctx.imageSmoothingEnabled = false

  ctx.fillStyle = '#ffffff'
  fillRoundedRect(
    ctx,
    center - halfRoad,
    center - halfRoad,
    halfRoad * 2,
    halfRoad * 2,
    normalizedConfig.cornerRadius
  )

  if (connectivity.top) {
    fillRoundedRect(ctx, center - halfRoad, 0, halfRoad * 2, center, normalizedConfig.cornerRadius)
  } else {
    drawDisconnectedFade(ctx, 'top', normalizedConfig.tileSize, halfRoad, normalizedConfig.fadeDistance)
  }

  ctx.fillStyle = '#ffffff'
  if (connectivity.bottom) {
    fillRoundedRect(ctx, center - halfRoad, center, halfRoad * 2, normalizedConfig.tileSize - center, normalizedConfig.cornerRadius)
  } else {
    drawDisconnectedFade(ctx, 'bottom', normalizedConfig.tileSize, halfRoad, normalizedConfig.fadeDistance)
  }

  ctx.fillStyle = '#ffffff'
  if (connectivity.left) {
    fillRoundedRect(ctx, 0, center - halfRoad, center, halfRoad * 2, normalizedConfig.cornerRadius)
  } else {
    drawDisconnectedFade(ctx, 'left', normalizedConfig.tileSize, halfRoad, normalizedConfig.fadeDistance)
  }

  ctx.fillStyle = '#ffffff'
  if (connectivity.right) {
    fillRoundedRect(ctx, center, center - halfRoad, normalizedConfig.tileSize - center, halfRoad * 2, normalizedConfig.cornerRadius)
  } else {
    drawDisconnectedFade(ctx, 'right', normalizedConfig.tileSize, halfRoad, normalizedConfig.fadeDistance)
  }

  return {
    canvas: tileCanvas,
    connectivity,
    debugLabel: connectivityToDebugLabel(connectivity)
  }
}

export function generateRoadAutotileMaskSheet(config = {}) {
  const normalizedConfig = getDefaultConfig(config)
  const sheetCanvas = document.createElement('canvas')
  sheetCanvas.width = normalizedConfig.columns * normalizedConfig.tileSize
  sheetCanvas.height = normalizedConfig.rows * normalizedConfig.tileSize
  const ctx = sheetCanvas.getContext('2d', { alpha: true })
  if (!ctx) {
    return { canvas: sheetCanvas, tileEntries: [], config: normalizedConfig, validation: { valid: false, errors: ['2D context unavailable'] } }
  }

  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height)

  const tileEntries = []
  for (let bitmask = 0; bitmask < normalizedConfig.requiredMaskCount; bitmask++) {
    const col = bitmask % normalizedConfig.columns
    const row = Math.floor(bitmask / normalizedConfig.columns)
    const { canvas, connectivity, debugLabel } = generateRoadAutotileMaskTile(bitmask, normalizedConfig)
    const x = col * normalizedConfig.tileSize
    const y = row * normalizedConfig.tileSize
    ctx.drawImage(canvas, x, y)
    tileEntries.push({ bitmask, col, row, connectivity, debugLabel, index: bitmask })
  }

  const validation = validateRoadAutotileSheet({ canvas: sheetCanvas, tileEntries, config: normalizedConfig })
  return { canvas: sheetCanvas, tileEntries, config: normalizedConfig, validation }
}

export function validateRoadAutotileSheet({ canvas, tileEntries, config }) {
  const errors = []
  const unique = new Set((tileEntries || []).map(entry => entry.bitmask))

  if (unique.size !== 16) {
    errors.push(`Expected 16 unique bitmasks, got ${unique.size}`)
  }

  if ((tileEntries || []).length !== 16) {
    errors.push(`Expected 16 generated tiles, got ${(tileEntries || []).length}`)
  }

  const expectedWidth = config.columns * config.tileSize
  const expectedHeight = config.rows * config.tileSize
  if (!canvas || canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
    errors.push(`Expected ${expectedWidth}x${expectedHeight} export, got ${canvas?.width || 0}x${canvas?.height || 0}`)
  }

  const ctx = canvas?.getContext?.('2d', { willReadFrequently: true })
  if (ctx) {
    for (const entry of tileEntries || []) {
      const startX = entry.col * config.tileSize
      const startY = entry.row * config.tileSize
      const center = Math.floor(config.tileSize / 2)
      const probes = {
        top: [startX + center, startY],
        right: [startX + config.tileSize - 1, startY + center],
        bottom: [startX + center, startY + config.tileSize - 1],
        left: [startX, startY + center]
      }

      for (const { key } of ROAD_BIT_ORDER) {
        const [px, py] = probes[key]
        const pixel = ctx.getImageData(px, py, 1, 1).data
        const bright = pixel[0] > 200
        if (entry.connectivity[key] && !bright) {
          errors.push(`Tile ${entry.bitmask} missing ${key} edge touch at border center`)
        }
        if (!entry.connectivity[key] && bright) {
          errors.push(`Tile ${entry.bitmask} leaked ${key} edge to border center`)
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export function isWebpCanvasExportSupported() {
  const canvas = document.createElement('canvas')
  return canvas.toDataURL('image/webp').startsWith('data:image/webp')
}
