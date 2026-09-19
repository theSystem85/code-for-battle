import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { isFunctionTimingEnabled, resetFunctionTimingForTests } from '../../src/performance/functionTiming.js'
import { renderProfiler } from '../../src/performance/renderProfiler.js'
import { PerformanceDialog } from '../../src/ui/performanceDialog.js'

describe('PerformanceDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="performanceDialog" class="performance-dialog"></div>'
    localStorage.removeItem('codeForBattle.functionTimingsEnabled')
    gameState.performanceVisible = false
    resetFunctionTimingForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    gameState.performanceVisible = false
    resetFunctionTimingForTests()
  })

  it('toggles and persists function timing without starting a recording', () => {
    const dialog = new PerformanceDialog()
    const checkbox = document.getElementById('perfFunctionTimings')
    checkbox.checked = true
    checkbox.dispatchEvent(new window.Event('change'))

    expect(isFunctionTimingEnabled()).toBe(true)
    expect(localStorage.getItem('codeForBattle.functionTimingsEnabled')).toBe('true')
    expect(window.performanceStatistics).toEqual({})
    expect(dialog.intervalId).toBeNull()
  })

  it('does not snapshot, sort, or update table DOM while hidden or disabled', () => {
    const dialog = new PerformanceDialog()
    const snapshotSpy = vi.spyOn(renderProfiler, 'getSnapshot')

    dialog.render()
    expect(snapshotSpy).not.toHaveBeenCalled()

    gameState.performanceVisible = true
    dialog.render()
    expect(snapshotSpy).not.toHaveBeenCalled()
    expect(document.getElementById('perfContent').textContent).toContain('Function timings are off')
  })

  it('refreshes at four hertz only while visible', () => {
    vi.useFakeTimers()
    const dialog = new PerformanceDialog()
    const renderSpy = vi.spyOn(dialog, 'render')

    gameState.performanceVisible = true
    dialog.start()
    expect(renderSpy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(renderSpy).toHaveBeenCalledTimes(5)

    dialog.stop()
    vi.advanceTimersByTime(1000)
    expect(renderSpy).toHaveBeenCalledTimes(5)
  })
})
