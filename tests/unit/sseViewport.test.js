import { describe, it, expect } from 'vitest'
import { bindSseSplit, bindSseViewport } from '../../src/ui/sseViewport.js'

function pointer(element, type, id, x, y) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y })
  element.dispatchEvent(event)
}

describe('SSE input-driven viewport', () => {
  function viewport() {
    const element = document.createElement('div')
    element.getBoundingClientRect = () => ({ left: 10, top: 20, height: 400 })
    element.setPointerCapture = () => {}
    let view = { x: 0, y: 0, scale: 1 }
    bindSseViewport(element, () => view, value => { view = value })
    return { element, read: () => view }
  }
  it('pans with wheel deltas and preserves the image coordinate under ctrl-wheel zoom', () => {
    const { element, read } = viewport()
    element.dispatchEvent(new window.WheelEvent('wheel', { deltaX: 20, deltaY: 30, cancelable: true }))
    expect(read()).toEqual({ x: -20, y: -30, scale: 1 })
    const before = read()
    element.dispatchEvent(new window.WheelEvent('wheel', { clientX: 110, clientY: 120, deltaY: -30, ctrlKey: true, cancelable: true }))
    expect(read().scale).toBeGreaterThan(1)
    expect((100 - read().x) / read().scale).toBeCloseTo((100 - before.x) / before.scale)
    expect((100 - read().y) / read().scale).toBeCloseTo((100 - before.y) / before.scale)
  })
  it('anchors pointer pinch zoom at the moving two-finger centre', () => {
    const { element, read } = viewport()
    pointer(element, 'pointerdown', 1, 60, 120)
    pointer(element, 'pointerdown', 2, 160, 120)
    pointer(element, 'pointermove', 2, 260, 120)
    expect(read()).toEqual({ x: -50, y: -100, scale: 2 })
    pointer(element, 'pointermove', 1, 80, 140)
    pointer(element, 'pointerup', 1, 80, 140)
    const finished = read()
    pointer(element, 'pointermove', 2, 300, 200)
    expect(read()).toBe(finished)
  })
  it('bounds and persists the separator ratio and handles touch dragging', () => {
    localStorage.removeItem('sse.splitRatio')
    const workspace = document.createElement('div')
    workspace.getBoundingClientRect = () => ({ top: 20, height: 400 })
    const source = document.createElement('section')
    workspace.appendChild(source)
    const apply = bindSseSplit(workspace, source)
    expect(apply(2)).toBe(0.85)
    expect(localStorage.getItem('sse.splitRatio')).toBe('0.85')
    const divider = workspace.firstElementChild
    divider.setPointerCapture = () => {}
    pointer(divider, 'pointerdown', 1, 0, 100)
    pointer(divider, 'pointermove', 1, 0, 180)
    expect(localStorage.getItem('sse.splitRatio')).toBe('0.4')
    pointer(divider, 'pointerup', 1, 0, 180)
    divider.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(Number(localStorage.getItem('sse.splitRatio'))).toBeCloseTo(0.45)
    localStorage.removeItem('sse.splitRatio')
  })
})
