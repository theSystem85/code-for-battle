import { describe, expect, it, vi } from 'vitest'
import { handleProductionStackWheel } from '../../src/ui/productionControllerButtonSetup.js'

function wheel(options = {}) {
  return new window.WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    ...options
  })
}

describe('production stack wheel input', () => {
  it('[U06521] leaves ordinary wheel scrolling untouched', () => {
    const increase = vi.fn()
    const decrease = vi.fn()
    const event = wheel({ deltaY: -40 })

    expect(handleProductionStackWheel(event, { increase, decrease })).toBe(false)
    expect(increase).not.toHaveBeenCalled()
    expect(decrease).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('[U06522] adjusts stacks only with Shift and follows the dominant wheel axis', () => {
    const increase = vi.fn()
    const decrease = vi.fn()
    const scrollUp = wheel({ shiftKey: true, deltaY: -40, deltaX: 2 })
    const scrollDown = wheel({ shiftKey: true, deltaY: 30, deltaX: -2 })
    const horizontalOnly = wheel({ shiftKey: true, deltaX: -25 })

    handleProductionStackWheel(scrollUp, { increase, decrease })
    handleProductionStackWheel(scrollDown, { increase, decrease })
    handleProductionStackWheel(horizontalOnly, { increase, decrease })

    expect(increase).toHaveBeenCalledTimes(2)
    expect(decrease).toHaveBeenCalledTimes(1)
    expect(scrollUp.defaultPrevented).toBe(true)
    expect(scrollDown.defaultPrevented).toBe(true)
    expect(horizontalOnly.defaultPrevented).toBe(true)
  })
})
