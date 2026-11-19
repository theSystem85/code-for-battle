import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { getPlayableViewportHeight, getPlayableViewportWidth } from '../utils/layoutMetrics.js'
import { getCurrentGame, mapGrid, units } from '../main.js'
import { updateBenchmarkCountdownAverage } from '../ui/benchmarkModal.js'

const FRAME_TIME_MIN_THRESHOLD = 0.0001
const FALLBACK_FRAME_TIME_MS = 1000 / 60
const CAMERA_RETARGET_INTERVAL_MS = 5000
const CAMERA_EASE_DURATION_MS = 1500
const COMBAT_DISTANCE_THRESHOLD = TILE_SIZE * 10
const COMBAT_DISTANCE_THRESHOLD_SQ = COMBAT_DISTANCE_THRESHOLD * COMBAT_DISTANCE_THRESHOLD
const CLUSTER_SIZE_PX = TILE_SIZE * 12
const CAMERA_VELOCITY_EPSILON = 0.05

let activeSession = null
const cameraFocusState = {
  targetX: null,
  targetY: null,
  transitionStartX: null,
  transitionStartY: null,
  transitionStartTime: 0,
  desiredScrollX: null,
  desiredScrollY: null,
  lastRetargetTime: 0,
  active: false,
  manualOverride: false
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function resetCameraFocusInternal() {
  cameraFocusState.targetX = null
  cameraFocusState.targetY = null
  cameraFocusState.transitionStartX = null
  cameraFocusState.transitionStartY = null
  cameraFocusState.transitionStartTime = 0
  cameraFocusState.desiredScrollX = null
  cameraFocusState.desiredScrollY = null
  cameraFocusState.lastRetargetTime = 0
  cameraFocusState.active = false
  cameraFocusState.manualOverride = false
}

function easeInOutCubic(t) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function hasManualScrollActivity() {
  const keyScroll = gameState.keyScroll || {}
  if (gameState.isRightDragging) return true
  if (keyScroll.up || keyScroll.down || keyScroll.left || keyScroll.right) return true
  const velocity = gameState.dragVelocity || { x: 0, y: 0 }
  return Math.abs(velocity.x) > CAMERA_VELOCITY_EPSILON || Math.abs(velocity.y) > CAMERA_VELOCITY_EPSILON
}

function findCombatFocusTarget() {
  if (!Array.isArray(units) || units.length === 0 || !Array.isArray(mapGrid) || mapGrid.length === 0) {
    return null
  }

  const clusters = new Map()

  for (const unit of units) {
    if (!unit || unit.destroyed || !unit.target) {
      continue
    }

    const target = unit.target
    if (!target || target.destroyed || target.owner === unit.owner) {
      continue
    }

    const targetX = typeof target.x === 'number' ? target.x : null
    const targetY = typeof target.y === 'number' ? target.y : null
    const unitX = typeof unit.x === 'number' ? unit.x : null
    const unitY = typeof unit.y === 'number' ? unit.y : null

    if (unitX === null || unitY === null || targetX === null || targetY === null) {
      continue
    }

    const dx = targetX - unitX
    const dy = targetY - unitY
    const distanceSq = dx * dx + dy * dy
    if (distanceSq > COMBAT_DISTANCE_THRESHOLD_SQ) {
      continue
    }

    const centerX = (unitX + targetX) / 2
    const centerY = (unitY + targetY) / 2
    const cellX = Math.floor(centerX / CLUSTER_SIZE_PX)
    const cellY = Math.floor(centerY / CLUSTER_SIZE_PX)
    const key = `${cellX},${cellY}`

    let cell = clusters.get(key)
    if (!cell) {
      cell = { weight: 0, sumX: 0, sumY: 0 }
      clusters.set(key, cell)
    }

    cell.weight += 1
    cell.sumX += centerX
    cell.sumY += centerY
  }

  let bestCluster = null
  for (const cell of clusters.values()) {
    if (!bestCluster || cell.weight > bestCluster.weight) {
      bestCluster = cell
    }
  }

  if (!bestCluster) {
    return null
  }

  return {
    x: bestCluster.sumX / bestCluster.weight,
    y: bestCluster.sumY / bestCluster.weight
  }
}

function beginCameraTransition(gameCanvas, mapWidthPx, mapHeightPx, timestamp) {
  const viewportWidth = getPlayableViewportWidth(gameCanvas)
  const viewportHeight = getPlayableViewportHeight(gameCanvas)

  const desiredScrollX = clamp(
    cameraFocusState.targetX - viewportWidth / 2,
    0,
    Math.max(0, mapWidthPx - viewportWidth)
  )
  const desiredScrollY = clamp(
    cameraFocusState.targetY - viewportHeight / 2,
    0,
    Math.max(0, mapHeightPx - viewportHeight)
  )

  cameraFocusState.transitionStartX = gameState.scrollOffset.x
  cameraFocusState.transitionStartY = gameState.scrollOffset.y
  cameraFocusState.transitionStartTime = timestamp
  cameraFocusState.desiredScrollX = desiredScrollX
  cameraFocusState.desiredScrollY = desiredScrollY
}

function updateBenchmarkCameraFocus(timestamp) {
  if (!cameraFocusState.active || !gameState.benchmarkActive) {
    return
  }

  if (cameraFocusState.manualOverride || hasManualScrollActivity()) {
    cameraFocusState.manualOverride = true
    return
  }

  const game = getCurrentGame()
  const canvasManager = game && game.canvasManager
  const gameCanvas = canvasManager && canvasManager.getGameCanvas ? canvasManager.getGameCanvas() : null
  if (!gameCanvas || !Array.isArray(mapGrid) || mapGrid.length === 0) {
    return
  }

  const mapWidthPx = (mapGrid[0]?.length || 0) * TILE_SIZE
  const mapHeightPx = mapGrid.length * TILE_SIZE

  const needsNewTarget = (
    cameraFocusState.targetX === null ||
    cameraFocusState.targetY === null ||
    timestamp - cameraFocusState.lastRetargetTime >= CAMERA_RETARGET_INTERVAL_MS
  )

  if (needsNewTarget) {
    const target = findCombatFocusTarget()
    if (!target) {
      return
    }

    cameraFocusState.targetX = target.x
    cameraFocusState.targetY = target.y
    cameraFocusState.lastRetargetTime = timestamp
    beginCameraTransition(gameCanvas, mapWidthPx, mapHeightPx, timestamp)
  } else if (cameraFocusState.desiredScrollX === null || cameraFocusState.desiredScrollY === null) {
    beginCameraTransition(gameCanvas, mapWidthPx, mapHeightPx, timestamp)
  }

  if (cameraFocusState.desiredScrollX === null || cameraFocusState.desiredScrollY === null) {
    return
  }

  if (cameraFocusState.transitionStartX === null || cameraFocusState.transitionStartY === null) {
    cameraFocusState.transitionStartX = gameState.scrollOffset.x
    cameraFocusState.transitionStartY = gameState.scrollOffset.y
    cameraFocusState.transitionStartTime = timestamp
  }

  const elapsed = timestamp - cameraFocusState.transitionStartTime
  const progress = easeInOutCubic(Math.min(1, elapsed / CAMERA_EASE_DURATION_MS))

  const nextScrollX = cameraFocusState.transitionStartX +
    (cameraFocusState.desiredScrollX - cameraFocusState.transitionStartX) * progress
  const nextScrollY = cameraFocusState.transitionStartY +
    (cameraFocusState.desiredScrollY - cameraFocusState.transitionStartY) * progress

  gameState.scrollOffset.x = nextScrollX
  gameState.scrollOffset.y = nextScrollY

  if (progress >= 1) {
    cameraFocusState.transitionStartX = gameState.scrollOffset.x
    cameraFocusState.transitionStartY = gameState.scrollOffset.y
  }
}

function finalizeSession(session, finalTimestamp = null) {
  if (!session) return

  const effectiveTimestamp = finalTimestamp || session.lastFrameTimestamp || performance.now()
  const intervalElapsed = effectiveTimestamp - session.intervalStart
  const framesInInterval = session.frameCount - session.lastIntervalFrameCount
  if (framesInInterval > 0 && intervalElapsed > 0) {
    const fps = (framesInInterval * 1000) / intervalElapsed
    session.intervalAverages.push({
      time: (effectiveTimestamp - session.startTime) / 1000,
      fps
    })
  }

  const averageFps = session.frameCount > 0 ? session.fpsSum / session.frameCount : 0
  const result = {
    durationMs: effectiveTimestamp - session.startTime,
    frames: session.frameCount,
    averageFps,
    minFps: session.minFps === Infinity ? 0 : session.minFps,
    maxFps: session.maxFps,
    intervalAverages: session.intervalAverages
  }

  const resolve = session.resolve
  activeSession = null
  resetCameraFocusInternal()
  resolve(result)
}

export function notifyBenchmarkFrame({ timestamp, frameTime }) {
  if (!activeSession || !Number.isFinite(timestamp) || !Number.isFinite(frameTime)) {
    return
  }

  const session = activeSession
  const normalizedFrameTime = frameTime >= FRAME_TIME_MIN_THRESHOLD
    ? frameTime
    : (session.lastFrameTime || FALLBACK_FRAME_TIME_MS)

  const effectiveTimestamp = Number.isFinite(session.lastFrameTimestamp) && timestamp <= session.lastFrameTimestamp
    ? session.lastFrameTimestamp + normalizedFrameTime
    : timestamp

  if (!session.startTime) {
    session.startTime = effectiveTimestamp
    session.intervalStart = effectiveTimestamp
    session.lastIntervalFrameCount = 0
  }

  session.lastFrameTimestamp = effectiveTimestamp
  session.lastFrameTime = normalizedFrameTime

  updateBenchmarkCameraFocus(effectiveTimestamp)

  const fps = normalizedFrameTime > 0 ? 1000 / normalizedFrameTime : 0
  session.frameCount += 1
  session.fpsSum += fps
  session.minFps = Math.min(session.minFps, fps)
  session.maxFps = Math.max(session.maxFps, fps)

  const runningAverage = session.frameCount > 0 ? session.fpsSum / session.frameCount : 0
  updateBenchmarkCountdownAverage(runningAverage)

  const intervalElapsed = effectiveTimestamp - session.intervalStart
  if (intervalElapsed >= session.intervalDuration) {
    const framesInInterval = session.frameCount - session.lastIntervalFrameCount
    const intervalFps = framesInInterval > 0 && intervalElapsed > 0
      ? (framesInInterval * 1000) / intervalElapsed
      : 0

    session.intervalAverages.push({
      time: (effectiveTimestamp - session.startTime) / 1000,
      fps: intervalFps
    })

    session.intervalStart = effectiveTimestamp
    session.lastIntervalFrameCount = session.frameCount
  }

  if (effectiveTimestamp - session.startTime >= session.durationMs) {
    finalizeSession(session, effectiveTimestamp)
  }
}

export function startBenchmarkSession(durationMs = 60000, intervalMs = 1000, { autoFocus = true } = {}) {
  if (activeSession) {
    return Promise.resolve(null)
  }

  let resolve
  const promise = new Promise((res) => { resolve = res })

  resetCameraFocusInternal()
  activeSession = {
    startTime: null,
    lastFrameTimestamp: null,
    intervalStart: null,
    durationMs,
    intervalDuration: intervalMs,
    frameCount: 0,
    fpsSum: 0,
    minFps: Infinity,
    maxFps: 0,
    lastIntervalFrameCount: 0,
    intervalAverages: [],
    lastFrameTime: null,
    resolve
  }

  cameraFocusState.active = autoFocus
  cameraFocusState.manualOverride = false

  return promise
}

export function isBenchmarkRunning() {
  return Boolean(activeSession)
}

export function cancelBenchmarkSession() {
  if (!activeSession) return null
  const session = activeSession
  cameraFocusState.active = false
  finalizeSession(session, session.lastFrameTimestamp || performance.now())
  return session
}

export function resetBenchmarkCameraFocus() {
  resetCameraFocusInternal()
}

export function notifyBenchmarkManualCameraControl() {
  if (!cameraFocusState.manualOverride) {
    cameraFocusState.manualOverride = true
  }
}
