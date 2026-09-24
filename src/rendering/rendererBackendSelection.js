export const RENDERER_CHOICE_AUTO = 'auto'
export const RENDERER_CHOICE_WEBGL = 'webgl'
export const RENDERER_CHOICE_WEBGPU = 'webgpu'
export const WEBGPU_PROBE_TIMEOUT_MS = 1000

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
  if (lower.includes('device lost')) return 'device lost'
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

export function describeRendererBackendStatus({ choice, requested, active, failureSummary } = {}) {
  if (choice === RENDERER_CHOICE_WEBGL) return 'Using WebGL.'
  if (active === RENDERER_CHOICE_WEBGPU) return 'Using WebGPU.'
  const webgpuRequested = choice === RENDERER_CHOICE_WEBGPU || requested === RENDERER_CHOICE_WEBGPU
  if (webgpuRequested && active === RENDERER_CHOICE_WEBGL) {
    if (failureSummary) return `WebGPU failed: ${failureSummary} – using WebGL`
    return 'WebGPU did not initialize. Using WebGL.'
  }
  if (webgpuRequested && active !== RENDERER_CHOICE_WEBGL) return 'Using WebGPU.'
  return 'Using WebGL. WebGPU is not available in this browser.'
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
  return true
}
