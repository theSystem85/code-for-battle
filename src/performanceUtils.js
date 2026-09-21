import { renderProfiler } from './performance/renderProfiler.js'
import { PROFILER_SPAN_IDS } from './performance/profilerIds.js'

if (typeof window !== 'undefined' && !window.performanceStatistics) {
  window.performanceStatistics = {}
}

// logs the performance of a function
// Usage: wrap your function definition with logPerformance(fnName)
// Example: const myFunction = logPerformance(function myFunction() {...});
// If the function you want to log is an arrow function, you can use it by passing the name of the function as a string in the last argument
export function logPerformance(functionToWrap, printEachCall = false, fnName = functionToWrap.name, profilerSpanId = null) {
  const spanId = profilerSpanId || renderProfiler.registerLegacySpan(fnName)
  return function(...args) {
    if (!renderProfiler.isEnabled() || spanId === null) return functionToWrap.apply(this, args)

    const isFrame = spanId === PROFILER_SPAN_IDS.FRAME
    if (isFrame) renderProfiler.beginFrame(args[0])
    const token = renderProfiler.startSpan(spanId)
    let duration = 0
    try {
      return functionToWrap.apply(this, args)
    } finally {
      duration = renderProfiler.endSpan(token)
      if (typeof window !== 'undefined') {
        const statistics = window.performanceStatistics || (window.performanceStatistics = {})
        const current = statistics[fnName]
        if (current) {
          current.durationMax = Math.max(current.durationMax, duration)
          current.durationTotal += duration
          current.callCount++
          current.durationAvg = current.durationTotal / current.callCount
        } else {
          statistics[fnName] = {
            durationMax: duration,
            durationAvg: duration,
            durationTotal: duration,
            callCount: 1
          }
        }

        if (printEachCall) {
          try {
            window.logger?.(`${fnName} took ${JSON.stringify(statistics[fnName])}, args: ${JSON.stringify(args)}, `)
          } catch {
            // Debug logging must not alter the wrapped function's return/error behavior.
          }
        }
      }
      if (isFrame) renderProfiler.endFrame()
    }
  }
}

export function resetPerformanceStatistics() {
  if (typeof window === 'undefined' || !window.performanceStatistics) return
  for (const name of Object.keys(window.performanceStatistics)) delete window.performanceStatistics[name]
}
