import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logPerformance, resetPerformanceStatistics } from '../../src/performanceUtils.js'
import {
  isFunctionTimingEnabled,
  resetFunctionTimingForTests,
  setFunctionTimingEnabled
} from '../../src/performance/functionTiming.js'

describe('function timing preference', () => {
  beforeEach(() => {
    resetFunctionTimingForTests()
    resetPerformanceStatistics()
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
    expect(window.performanceStatistics.enabled.callCount).toBe(1)
    expect(localStorage.getItem('codeForBattle.functionTimingsEnabled')).toBe('true')

    setFunctionTimingEnabled(false)
    expect(wrapped()).toBe(7)
    expect(window.performanceStatistics.enabled.callCount).toBe(1)
    expect(localStorage.getItem('codeForBattle.functionTimingsEnabled')).toBe('false')
  })

  it('preserves this, return identity, and error identity', () => {
    const result = { ok: true }
    const owner = {
      value: 4,
      call: logPerformance(function call(increment) {
        this.value += increment
        return result
      })
    }
    setFunctionTimingEnabled(true)

    expect(owner.call(3)).toBe(result)
    expect(owner.value).toBe(7)
    expect(window.performanceStatistics.call.callCount).toBe(1)

    const error = new Error('expected')
    const failing = logPerformance(() => { throw error }, false, 'failing')
    expect(() => failing()).toThrow(error)
    expect(window.performanceStatistics.failing.callCount).toBe(1)
  })

  it('does not read the clock or replace the statistics object while disabled', () => {
    const statistics = window.performanceStatistics
    const nowSpy = vi.spyOn(performance, 'now')
    const wrapped = logPerformance(() => 42, false, 'disabled-clock')

    expect(wrapped()).toBe(42)
    expect(nowSpy).not.toHaveBeenCalled()
    expect(window.performanceStatistics).toBe(statistics)
  })
})
