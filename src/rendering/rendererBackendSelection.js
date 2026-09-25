import { uiText } from '../ui/uiText.js'

export const RENDERER_CHOICE_AUTO = 'auto'
export const RENDERER_CHOICE_WEBGL = 'webgl'
export const RENDERER_CHOICE_WEBGPU = 'webgpu'
export const WEBGPU_PROBE_TIMEOUT_MS = 1000

const FALLBACK_REASON_KEYS = {
  'not-ready': 'settings.renderer.reason.notReady',
  'validation-pending': 'settings.renderer.reason.validationPending',
  'texture-sync-failed': 'settings.renderer.reason.textureSyncFailed',
  'no-instances': 'settings.renderer.reason.noInstances',
  restore: 'settings.renderer.reason.restore'
}

// One object for the life of the page. renderGame updates it at most once per
// frame and only the four fields below, so the settings line and the FPS
// widget can read the same record without allocating a replacement.
const rendererFrameReport = {
  drawing: null,
  phase: null,
  reasonCode: null,
  failureSummary: null,
  reasonText: null
}
let lastLoggedFallbackKey = null

function withTimeout(promise, timeoutMs) {
  return new Promise(resolve => {
    let settled = false
    const finish = value => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(undefined), timeoutMs)
    Promise.resolve(promise).then(value => finish(value)).catch(() => finish(undefined))
  })
}

export function normalizeRendererBackendChoice(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === RENDERER_CHOICE_AUTO || normalized === 'automatic') return RENDERER_CHOICE_AUTO
  if (normalized === RENDERER_CHOICE_WEBGL || normalized === 'webgl2') return RENDERER_CHOICE_WEBGL
  if (normalized === RENDERER_CHOICE_WEBGPU) return RENDERER_CHOICE_WEBGPU
  return null
}

/**
 * Legacy graphics blobs persisted `rendererBackend` on every graphics save.
 * The in-memory default was always `webgl`, and the loader coerced every
 * other value except `webgpu` to `webgl`. A stored `webgl` therefore matches
 * both an explicit dropdown change and an untouched default. `webgpu` could
 * only be written by choosing WebGPU. Missing choice metadata treats `webgpu`
 * as explicit and everything else as automatic.
 */
export function migrateRendererBackendChoice(stored) {
  if (!stored || typeof stored !== 'object') return RENDERER_CHOICE_AUTO
  const choice = normalizeRendererBackendChoice(stored.rendererBackendChoice)
  if (choice) return choice
  if (stored.rendererBackend === RENDERER_CHOICE_WEBGPU) return RENDERER_CHOICE_WEBGPU
  return RENDERER_CHOICE_AUTO
}

export function resolveRequestedRendererBackend(choice, webgpuAvailable) {
  if (choice === RENDERER_CHOICE_WEBGL) return RENDERER_CHOICE_WEBGL
  return webgpuAvailable ? RENDERER_CHOICE_WEBGPU : RENDERER_CHOICE_WEBGL
}

export function summarizeWebGPUFailure(message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim()
  const lower = text.toLowerCase()
  if (!text) return 'initialization failed'
  if (lower.includes('texturesample') || lower.includes('wgsl') || lower.includes('shader')) return 'shader validation'
  if (lower.includes('pipeline')) return 'pipeline validation'
  if (lower.includes('no webgpu adapter') || lower.includes('no adapter')) return 'no adapter'
  if (lower.includes('device request') || lower.includes('requestdevice')) return 'device request failed'
  if (lower.includes('canvas context') || lower.includes('getcontext')) return 'canvas context failed'
  if (lower.includes('device lost') || lower.includes('destroyed') || lower.includes('instance reference')) return 'device lost'
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

export function webgpuFallbackReasonLabel(code, failureSummary = '', locale = 'en') {
  if (!code) return ''
  if (code === 'failed') {
    const summary = String(failureSummary || '').trim()
    return summary || uiText('settings.renderer.reason.initializationFailed', locale)
  }
  const key = FALLBACK_REASON_KEYS[code]
  return key ? uiText(key, locale) : String(code)
}

export function getRendererFrameReport() {
  return rendererFrameReport
}

export function resetRendererFrameReport() {
  rendererFrameReport.drawing = null
  rendererFrameReport.phase = null
  rendererFrameReport.reasonCode = null
  rendererFrameReport.failureSummary = null
  rendererFrameReport.reasonText = null
  lastLoggedFallbackKey = null
}

/**
 * Records the backend that actually drew the latest terrain frame.
 * Called once per frame. Returns false when nothing changed so callers can
 * skip the settings DOM write. A WebGL handoff is logged once per reason change.
 */
export function recordRendererFrame({
  drawing = null,
  phase = null,
  reasonCode = null,
  failureSummary = null,
  log = console.warn
} = {}) {
  const nextDrawing = drawing || null
  const nextPhase = phase || null
  const nextReason = reasonCode || null
  const nextSummary = failureSummary || null
  if (
    rendererFrameReport.drawing === nextDrawing &&
    rendererFrameReport.phase === nextPhase &&
    rendererFrameReport.reasonCode === nextReason &&
    rendererFrameReport.failureSummary === nextSummary
  ) {
    return false
  }

  rendererFrameReport.drawing = nextDrawing
  rendererFrameReport.phase = nextPhase
  rendererFrameReport.reasonCode = nextReason
  rendererFrameReport.failureSummary = nextSummary
  rendererFrameReport.reasonText = (nextPhase === 'fallback' || nextPhase === 'starting')
    ? webgpuFallbackReasonLabel(nextReason, nextSummary, 'en')
    : null

  if (rendererFrameReport.reasonText) {
    const key = `${nextReason}|${rendererFrameReport.reasonText}`
    if (lastLoggedFallbackKey !== key) {
      lastLoggedFallbackKey = key
      log(`[WebGPU] frame fell back to WebGL: ${rendererFrameReport.reasonText}`)
    }
  } else {
    lastLoggedFallbackKey = null
  }
  return true
}

export function classifyRendererBackendStatus({ choice, requested, active, failureSummary, frame } = {}) {
  if (choice === RENDERER_CHOICE_WEBGL) return { id: 'webgl' }

  const webgpuRequested = choice === RENDERER_CHOICE_WEBGPU || requested === RENDERER_CHOICE_WEBGPU
  if (!webgpuRequested) return { id: 'unavailable' }

  const report = frame || null
  if (report?.phase === 'fallback') {
    if (report.reasonCode === 'failed') {
      return { id: 'failed', failureSummary: report.failureSummary || failureSummary || '' }
    }
    return {
      id: 'fallback',
      reasonCode: report.reasonCode,
      failureSummary: report.failureSummary || null
    }
  }
  if (report?.phase === 'starting') return { id: 'starting' }
  if (report?.phase === 'active' || report?.drawing === RENDERER_CHOICE_WEBGPU) return { id: 'active' }

  if (active === RENDERER_CHOICE_WEBGL || (choice === RENDERER_CHOICE_WEBGPU && requested === RENDERER_CHOICE_WEBGL)) {
    if (failureSummary) return { id: 'failed', failureSummary }
    return { id: 'did-not-initialize' }
  }
  return { id: 'starting' }
}

function fillReason(template, reason) {
  return String(template || '').replaceAll('{reason}', reason || '')
}

export function formatRendererBackendStatus(status, locale = 'en') {
  const text = key => uiText(key, locale)
  switch (status?.id) {
    case 'webgl':
      return text('settings.renderer.usingWebgl')
    case 'active':
      return text('settings.renderer.usingWebgpu')
    case 'unavailable':
      return text('settings.renderer.unavailable')
    case 'did-not-initialize':
      return text('settings.renderer.didNotInitialize')
    case 'failed':
      return fillReason(
        text('settings.renderer.failed'),
        status.failureSummary || webgpuFallbackReasonLabel('failed', '', locale)
      )
    case 'fallback':
      return fillReason(
        text('settings.renderer.fallback'),
        webgpuFallbackReasonLabel(status.reasonCode, status.failureSummary, locale)
      )
    case 'starting':
    default:
      return text('settings.renderer.starting')
  }
}

export function formatRendererOverlayBackend(frame, locale = 'en') {
  const drawing = frame?.drawing
  const name = drawing === RENDERER_CHOICE_WEBGPU
    ? 'WebGPU'
    : drawing === RENDERER_CHOICE_WEBGL
      ? 'WebGL'
      : 'CPU'
  const showReason = frame?.phase === 'fallback' || frame?.phase === 'starting'
  if (!showReason) return `Renderer: ${name}`
  const reason = webgpuFallbackReasonLabel(frame.reasonCode, frame.failureSummary, locale)
  return reason ? `Renderer: ${name} (${reason})` : `Renderer: ${name}`
}

export function describeRendererBackendStatus({
  choice,
  requested,
  active,
  failureSummary,
  frame,
  locale = 'en'
} = {}) {
  return formatRendererBackendStatus(
    classifyRendererBackendStatus({ choice, requested, active, failureSummary, frame }),
    locale
  )
}

function destroyDevice(device) {
  try {
    device?.destroy?.()
  } catch {
    // A failed destroy still means this probe must not keep the device.
  }
}

export async function probeWebGPUAvailability(gpu = globalThis.navigator?.gpu, {
  timeoutMs = WEBGPU_PROBE_TIMEOUT_MS
} = {}) {
  if (!gpu || typeof gpu.requestAdapter !== 'function') return false

  const adapter = await withTimeout(
    Promise.resolve().then(() => gpu.requestAdapter({ powerPreference: 'high-performance' })),
    timeoutMs
  )
  if (!adapter || typeof adapter.requestDevice !== 'function') return false

  const devicePromise = Promise.resolve().then(() => adapter.requestDevice()).catch(() => null)
  const device = await withTimeout(devicePromise, timeoutMs)
  if (!device) {
    devicePromise.then(lateDevice => destroyDevice(lateDevice)).catch(() => {})
    return false
  }

  destroyDevice(device)
  await withTimeout(device.lost, timeoutMs)
  return true
}
