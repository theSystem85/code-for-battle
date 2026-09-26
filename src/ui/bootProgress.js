// Boot progress is weighted by cold-load phase durations measured on 2026-09-26
// (headless Chrome, cache disabled, local Vite). Ratios, not the absolute
// milliseconds, drive the bar. See specs/080-loading-screen.md.

const COMPLETION_CAP = 0.994

const WEBGL_EXPECTED_MS = Object.freeze({
  storage: 46,
  assets: 2047,
  map: 130,
  systems: 15,
  present: 400
})

const WEBGPU_EXPECTED_MS = Object.freeze({
  storage: 40,
  backend: 140,
  assets: 2050,
  map: 120,
  systems: 15,
  present: 1860
})

const PHASE_DETAILS = Object.freeze({
  storage: 'Restoring command data',
  backend: 'Selecting the renderer',
  assets: 'Loading battlefield assets',
  map: 'Generating the map',
  systems: 'Bringing command systems online',
  present: 'Compiling the renderer',
  ready: 'Forces deployed'
})

export const GPU_BOOT_STEP_WEIGHTS = Object.freeze([752, 708, 403])

export function gpuBootFraction(completedSteps) {
  const total = GPU_BOOT_STEP_WEIGHTS.reduce((sum, weight) => sum + weight, 0)
  let done = 0
  const steps = Math.max(0, Math.min(GPU_BOOT_STEP_WEIGHTS.length, completedSteps))
  for (let index = 0; index < steps; index++) done += GPU_BOOT_STEP_WEIGHTS[index]
  return done / total
}

export function asymptoticPhaseFraction(elapsedMs, expectedMs, cap = 0.985) {
  const expected = Math.max(1, Number(expectedMs) || 1)
  const tau = expected / 3
  const value = 1 - Math.exp(-Math.max(0, Number(elapsedMs) || 0) / tau)
  if (!Number.isFinite(value)) return 0
  return Math.min(cap, Math.max(0, value))
}

function clamp01(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(1, number))
}

function nowMs(now) {
  if (Number.isFinite(now)) return now
  return typeof performance !== 'undefined' ? performance.now() : 0
}

function phaseTemplate(id, expectedMs, extra = {}) {
  return {
    id,
    expectedMs,
    smooth: Boolean(extra.smooth),
    detail: extra.detail || PHASE_DETAILS[id] || 'Preparing the battlefield',
    state: 'pending',
    startedAt: 0,
    fraction: null,
    parts: extra.parts ? extra.parts.map(part => ({
      id: part.id,
      expectedMs: part.expectedMs,
      smooth: Boolean(part.smooth),
      state: 'pending',
      startedAt: 0,
      fraction: null
    })) : null
  }
}

export function bootPhasesForBackend(backend) {
  if (backend === 'webgl') {
    return [
      phaseTemplate('storage', WEBGL_EXPECTED_MS.storage, { smooth: true }),
      phaseTemplate('assets', WEBGL_EXPECTED_MS.assets, {
        parts: [
          { id: 'sprites', expectedMs: 1920 },
          { id: 'textures', expectedMs: 1810, smooth: true }
        ]
      }),
      phaseTemplate('map', WEBGL_EXPECTED_MS.map, { smooth: true }),
      phaseTemplate('systems', WEBGL_EXPECTED_MS.systems, { smooth: true }),
      phaseTemplate('present', WEBGL_EXPECTED_MS.present, { smooth: true })
    ]
  }

  return [
    phaseTemplate('storage', WEBGPU_EXPECTED_MS.storage, { smooth: true }),
    phaseTemplate('backend', WEBGPU_EXPECTED_MS.backend, { smooth: true }),
    phaseTemplate('assets', WEBGPU_EXPECTED_MS.assets, {
      parts: [
        { id: 'sprites', expectedMs: 1950 },
        { id: 'textures', expectedMs: 1840, smooth: true }
      ]
    }),
    phaseTemplate('map', WEBGPU_EXPECTED_MS.map, { smooth: true }),
    phaseTemplate('systems', WEBGPU_EXPECTED_MS.systems, { smooth: true }),
    phaseTemplate('present', WEBGPU_EXPECTED_MS.present, {
      parts: [
        { id: 'gpu', expectedMs: 1860, smooth: true },
        { id: 'frame', expectedMs: 470, smooth: true }
      ]
    })
  ]
}

function partInner(part, now) {
  if (part.state === 'done') return 1
  const smoothValue = part.smooth
    ? asymptoticPhaseFraction(now - part.startedAt, part.expectedMs)
    : null
  if (part.fraction == null) return smoothValue ?? 0
  const reported = Math.min(0.999, clamp01(part.fraction))
  if (smoothValue == null) return reported
  return Math.max(reported, smoothValue)
}

function phaseInner(phase, now) {
  if (phase.state === 'done') return 1
  if (phase.parts?.length) {
    const horizon = Math.max(...phase.parts.map(part => part.expectedMs), 1)
    let remaining = 0
    for (const part of phase.parts) {
      remaining = Math.max(remaining, part.expectedMs * (1 - partInner(part, now)))
    }
    return Math.min(0.999, Math.max(0, 1 - remaining / horizon))
  }
  if (phase.smooth || phase.fraction == null) {
    return asymptoticPhaseFraction(now - phase.startedAt, phase.expectedMs)
  }
  return Math.min(0.999, clamp01(phase.fraction))
}

export function createBootProgress(phases, options = {}) {
  const items = phases.map(phase => ({
    ...phase,
    parts: phase.parts ? phase.parts.map(part => ({ ...part })) : null
  }))
  let displayed = clamp01(options.floor ?? 0)
  let finished = false
  let activeId = items.find(phase => phase.state === 'active')?.id || 'boot'

  function findPhase(id) {
    return items.find(phase => phase.id === id) || null
  }

  function totalMs() {
    return items.reduce((sum, phase) => sum + Math.max(0, phase.expectedMs), 0) || 1
  }

  function compute(now) {
    const total = totalMs()
    let cursor = 0
    for (const phase of items) {
      if (phase.expectedMs <= 0) continue
      const share = phase.expectedMs / total
      if (phase.state === 'pending') break
      if (phase.state === 'done') {
        cursor += share
        continue
      }
      cursor += share * phaseInner(phase, now)
      break
    }
    return cursor
  }

  function activateParts(phase, now) {
    if (!phase.parts) return
    for (const part of phase.parts) {
      if (part.state === 'pending') {
        part.state = 'active'
        part.startedAt = now
      }
    }
  }

  const model = {
    get phaseId() {
      return finished ? 'ready' : activeId
    },
    get detail() {
      if (finished) return PHASE_DETAILS.ready
      return findPhase(activeId)?.detail || PHASE_DETAILS[activeId] || 'Preparing the battlefield'
    },
    isComplete() {
      return finished
    },
    hasPhase(id) {
      return Boolean(findPhase(id))
    },
    hasPart(phaseId, partId) {
      return Boolean(findPhase(phaseId)?.parts?.some(part => part.id === partId))
    },
    isPhaseDone(id) {
      const phase = findPhase(id)
      return !phase || phase.state === 'done' || phase.expectedMs <= 0
    },
    start(id, now) {
      const at = nowMs(now)
      const phase = findPhase(id)
      if (!phase || phase.state === 'done' || phase.expectedMs <= 0) return
      if (phase.state === 'pending') {
        phase.state = 'active'
        phase.startedAt = at
        activateParts(phase, at)
      }
      activeId = id
    },
    setFraction(id, fraction, now) {
      const phase = findPhase(id)
      if (!phase || phase.state === 'done') return
      if (phase.state === 'pending') model.start(id, now)
      phase.fraction = clamp01(fraction)
    },
    setPartFraction(phaseId, partId, fraction, now) {
      const at = nowMs(now)
      const phase = findPhase(phaseId)
      const part = phase?.parts?.find(item => item.id === partId)
      if (!phase || !part || part.state === 'done' || phase.state === 'done') return
      if (phase.state === 'pending') model.start(phaseId, at)
      if (part.state === 'pending') {
        part.state = 'active'
        part.startedAt = at
      }
      part.fraction = clamp01(fraction)
    },
    finishPart(phaseId, partId, now) {
      const phase = findPhase(phaseId)
      const part = phase?.parts?.find(item => item.id === partId)
      if (!phase || !part) return
      if (phase.state === 'pending') model.start(phaseId, now)
      part.state = 'done'
      part.fraction = 1
      if (phase.parts.every(item => item.state === 'done')) model.finish(phaseId, now)
    },
    finish(id, now) {
      const at = nowMs(now)
      const phase = findPhase(id)
      if (!phase || phase.state === 'done') return
      if (phase.state === 'pending') phase.startedAt = at
      phase.state = 'done'
      phase.fraction = 1
      if (phase.parts) {
        for (const part of phase.parts) {
          part.state = 'done'
          part.fraction = 1
        }
      }
      const next = items.find(item => item.state !== 'done' && item.expectedMs > 0)
      if (next) activeId = next.id
    },
    applyWebGLProfile() {
      const backend = findPhase('backend')
      if (backend) {
        backend.expectedMs = 0
        backend.state = 'done'
      }
      const present = findPhase('present')
      if (present && present.state !== 'done') {
        present.expectedMs = WEBGL_EXPECTED_MS.present
        present.smooth = true
        present.parts = null
        present.fraction = null
      }
    },
    sample(now) {
      const at = nowMs(now)
      if (finished) return 1
      const next = Math.min(COMPLETION_CAP, Math.max(displayed, compute(at)))
      displayed = next
      return displayed
    },
    finishAll() {
      for (const phase of items) {
        phase.state = 'done'
        phase.fraction = 1
        if (phase.parts) {
          for (const part of phase.parts) {
            part.state = 'done'
            part.fraction = 1
          }
        }
      }
      finished = true
      displayed = 1
      activeId = 'ready'
      return 1
    }
  }

  return model
}

let activeBootProgress = null

export function beginBootProgress(now = 0) {
  lastBootPaintPercent = -1
  activeBootProgress = createBootProgress(bootPhasesForBackend('webgpu'), { floor: 0.04, now })
  return activeBootProgress
}

export function getBootProgress() {
  return activeBootProgress
}

export function resetBootProgressForTests() {
  activeBootProgress = null
}

export function yieldBootPaint() {
  if (!activeBootProgress || activeBootProgress.isComplete()) return Promise.resolve()
  return new Promise(resolve => {
    requestAnimationFrame(() => resolve())
  })
}

let lastBootPaintPercent = -1

function paintBootProgress(now) {
  const boot = activeBootProgress
  if (!boot || boot.isComplete()) return
  if (typeof document === 'undefined') return
  const progress = boot.sample(now)
  const whole = Math.round(progress * 100)
  if (whole === lastBootPaintPercent) return
  lastBootPaintPercent = whole
  const bar = document.getElementById('loadingScreenBar')
  const percent = document.getElementById('loadingScreenPercent')
  const track = document.getElementById('loadingScreenTrack')
  const detail = document.getElementById('loadingScreenDetail')
  const root = document.getElementById('loadingScreen')
  if (!bar || root?.classList.contains('loading-screen--hidden')) return
  const rounded = Math.round(progress * 1000) / 10
  bar.style.width = `${rounded}%`
  bar.classList.remove('is-indeterminate')
  if (percent) percent.textContent = `${whole}%`
  if (detail) detail.textContent = boot.detail
  if (root) root.dataset.phase = boot.phaseId
  if (track) {
    track.setAttribute('aria-valuenow', String(whole))
    track.setAttribute('aria-valuetext', `${whole} percent`)
  }
}

export function reportBootSprites(completed, total) {
  const boot = activeBootProgress
  if (!boot) return
  const fraction = total > 0 ? completed / total : 1
  boot.setPartFraction('assets', 'sprites', fraction)
  paintBootProgress()
  if (globalThis.__RECORD_BOOT_TIMING && (completed % 50 === 0 || completed === total)) {
    const samples = globalThis.__bootSpriteSamples || (globalThis.__bootSpriteSamples = [])
    samples.push({
      completed,
      total,
      shown: Math.round(boot.sample() * 1000) / 10
    })
  }
}

export function reportBootTextures(fraction) {
  activeBootProgress?.setPartFraction('assets', 'textures', fraction)
}

export function reportBootGpuSteps(completedSteps) {
  activeBootProgress?.setPartFraction('present', 'gpu', gpuBootFraction(completedSteps))
}

export function finishBootGpu() {
  activeBootProgress?.finishPart('present', 'gpu')
}

export function finishBootFrame() {
  const boot = activeBootProgress
  if (!boot || boot.isPhaseDone('present')) return
  if (boot.hasPart('present', 'frame')) {
    boot.finishPart('present', 'frame')
    return
  }
  boot.finish('present')
}

export function waitForBootPhase(id, timeoutMs = 20000) {
  const boot = activeBootProgress
  if (!boot || boot.isPhaseDone(id) || boot.isComplete()) return Promise.resolve()
  return new Promise(resolve => {
    const started = performance.now()
    const tick = () => {
      if (!activeBootProgress || activeBootProgress.isPhaseDone(id) || activeBootProgress.isComplete()) {
        resolve()
        return
      }
      if (performance.now() - started >= timeoutMs) {
        activeBootProgress.finish(id)
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    tick()
  })
}
