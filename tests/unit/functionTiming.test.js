import { beforeEach, describe, expect, it } from 'vitest'
import { logPerformance } from '../../src/performanceUtils.js'
import {
  isFunctionTimingEnabled,
  resetFunctionTimingForTests,
  setFunctionTimingEnabled
} from '../../src/performance/functionTiming.js'

describe('function timing preference', () => {
  beforeEach(() => {
    resetFunctionTimingForTests()
    window.performanceStatistics = {}
    localStorage.removeItem('codeForBattle.functionTimingsEnabled')
  })

  it('keeps timing disabled by default and does not allocate statistics on calls', () => {
    const wrapped = logPerformance(() => 42, false, 'disabled')

    expect(isFunctionTimingEnabled()).toBe(false)
    expect(wrapped()).toBe(42)
    expect(window.performanceStatistics).toEqual({})
  })

  it('records only while enabled and persists the preference, without persisting traces', () => {
    const wrapped = logPerformance(() => 7, false, 'enabled')

    setFunctionTimingEnabled(true)
    expect(wrapped()).toBe(7)
    expect(window.performanceStatistics.enabled.callCount).toBe(2)
    expect(localStorage.getItem('codeForBattle.functionTimingsEnabled')).toBe('true')

    setFunctionTimingEnabled(false)
    expect(wrapped()).toBe(7)
    expect(window.performanceStatistics.enabled.callCount).toBe(2)
    expect(localStorage.getItem('codeForBattle.functionTimingsEnabled')).toBe('false')
  })
})
