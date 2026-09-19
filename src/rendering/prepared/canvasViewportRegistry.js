import { FrameViewport } from './frameViewport.js'

const canvasRecords = new WeakMap()

function parseCssPixels(value) {
  if (typeof value !== 'string' || value.length === 0) return 0
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function createRecord() {
  return {
    viewport: new FrameViewport(),
    logicalSize: {
      width: 0,
      height: 0,
      pixelRatio: 1,
      revision: 0
    },
    playableWidth: 0,
    playableHeight: 0,
    densityGeneration: 0,
    backingWidth: -1,
    backingHeight: -1
  }
}

function getOrCreateRecord(canvas) {
  let record = canvasRecords.get(canvas)
  if (!record) {
    record = createRecord()
    canvasRecords.set(canvas, record)
  }
  return record
}

function updateRecord(
  record,
  logicalWidth,
  logicalHeight,
  backingWidth,
  backingHeight,
  density,
  playableWidth,
  playableHeight,
  densityGeneration,
  worldLeft,
  worldTop
) {
  const changed = record.viewport.update({
    logicalWidth,
    logicalHeight,
    backingWidth,
    backingHeight,
    density,
    worldLeft,
    worldTop
  })

  record.backingWidth = backingWidth
  record.backingHeight = backingHeight
  record.playableWidth = playableWidth
  record.playableHeight = playableHeight
  record.densityGeneration = densityGeneration
  if (changed) {
    record.logicalSize.width = logicalWidth
    record.logicalSize.height = logicalHeight
    record.logicalSize.pixelRatio = density
    record.logicalSize.revision = record.viewport.revision
  }
  return record
}

export function publishCanvasViewport(canvas, {
  logicalWidth,
  logicalHeight,
  backingWidth = canvas?.width || 0,
  backingHeight = canvas?.height || 0,
  density = 1,
  playableWidth = logicalWidth,
  playableHeight = logicalHeight,
  densityGeneration = 0,
  worldLeft = 0,
  worldTop = 0
}) {
  if (!canvas) return null
  return updateRecord(
    getOrCreateRecord(canvas),
    logicalWidth,
    logicalHeight,
    backingWidth,
    backingHeight,
    density,
    playableWidth,
    playableHeight,
    densityGeneration,
    worldLeft,
    worldTop
  )
}

function refreshUnmanagedCanvasRecord(canvas, record, fallbackDensity) {
  const backingWidth = Number.isFinite(canvas.width) ? canvas.width : 0
  const backingHeight = Number.isFinite(canvas.height) ? canvas.height : 0
  if (
    record.viewport.revision > 0 &&
    record.backingWidth === backingWidth &&
    record.backingHeight === backingHeight
  ) {
    return record
  }

  const styleWidth = parseCssPixels(canvas.style?.width)
  const styleHeight = parseCssPixels(canvas.style?.height)
  const clientWidth = Number.isFinite(canvas.clientWidth) ? canvas.clientWidth : 0
  const clientHeight = Number.isFinite(canvas.clientHeight) ? canvas.clientHeight : 0
  let logicalWidth = styleWidth || clientWidth
  let logicalHeight = styleHeight || clientHeight
  let density = Number.isFinite(fallbackDensity) && fallbackDensity > 0 ? fallbackDensity : 1

  if (logicalWidth > 0 && backingWidth > 0) {
    density = backingWidth / logicalWidth
  } else if (backingWidth > 0) {
    logicalWidth = backingWidth / density
  }
  if (logicalHeight <= 0 && backingHeight > 0) {
    logicalHeight = backingHeight / density
  }

  return updateRecord(
    record,
    logicalWidth,
    logicalHeight,
    backingWidth,
    backingHeight,
    density,
    logicalWidth,
    logicalHeight,
    0,
    0,
    0
  )
}

export function getCanvasViewportRecord(canvas, fallbackDensity = 1) {
  if (!canvas) return null
  const record = getOrCreateRecord(canvas)
  return refreshUnmanagedCanvasRecord(canvas, record, fallbackDensity)
}

export function updateCanvasWorldViewport(canvas, worldLeft, worldTop) {
  const record = canvas ? canvasRecords.get(canvas) : null
  if (!record) return false
  const viewport = record.viewport
  const changed = viewport.update({
    logicalWidth: viewport.logicalWidth,
    logicalHeight: viewport.logicalHeight,
    backingWidth: viewport.backingWidth,
    backingHeight: viewport.backingHeight,
    density: viewport.density,
    worldLeft,
    worldTop
  })
  if (changed) record.logicalSize.revision = viewport.revision
  return changed
}

export function clearCanvasViewportRegistryForTests() {
  // WeakMap entries intentionally follow canvas lifetime and cannot be enumerated.
}
