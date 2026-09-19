import { isFunctionTimingEnabled } from './performance/functionTiming.js'

if (typeof window !== 'undefined' && !window.performanceStatistics) {
  window.performanceStatistics = {}
}

// logs the performance of a function
// Usage: wrap your function definition with logPerformance(fnName)
// Example: const myFunction = logPerformance(function myFunction() {...});
// If the function you want to log is an arrow function, you can use it by passing the name of the function as a string in the last argument
export function logPerformance(functionToWrap, printEachCall = false, fnName = functionToWrap.name) {
  return function(...args) {
    if (!isFunctionTimingEnabled()) return functionToWrap(...args)

    const start = performance.now()
    const result = functionToWrap(...args)
    const end = performance.now()
    const duration = end - start

    // Store performance statistics
    if (typeof window === 'undefined') return result
    if (!window.performanceStatistics[fnName]) {
      window.performanceStatistics[fnName] = {
        durationMax: duration,
        durationAvg: duration,
        callCount: 1
      }
    }
    window.performanceStatistics[fnName] = {
      durationMax: Math.max(window.performanceStatistics[fnName].durationMax, duration),
      durationAvg: (window.performanceStatistics[fnName].durationAvg * window.performanceStatistics[fnName].callCount + duration) / (window.performanceStatistics[fnName].callCount + 1),
      callCount: window.performanceStatistics[fnName].callCount + 1
    }

    if (printEachCall) {
      window.logger(`${fnName} took ${JSON.stringify(window.performanceStatistics[fnName])}, args: ${JSON.stringify(args)}, `)
    }

    return result
  }
}
