const marks = []
let origin = 0

function recording() {
  return typeof globalThis !== 'undefined' && globalThis.__RECORD_BOOT_TIMING === true
}

export function bootMark(name, extra = null) {
  if (!recording()) return
  const now = performance.now()
  if (!origin) origin = now
  const entry = { name, t: Math.round((now - origin) * 10) / 10 }
  if (extra && typeof extra === 'object') Object.assign(entry, extra)
  marks.push(entry)
  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.__bootTiming = { origin, marks }
  }
}

export function bootSpan(name, fn) {
  bootMark(`${name}:start`)
  const result = fn()
  if (result && typeof result.then === 'function') {
    return result.then(value => {
      bootMark(`${name}:end`)
      return value
    }, error => {
      bootMark(`${name}:error`)
      throw error
    })
  }
  bootMark(`${name}:end`)
  return result
}
