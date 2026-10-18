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
  it('[U04199] pans with wheel deltas and preserves the image coordinate under ctrl-wheel zoom', () => {
    const { element, read } = viewport()
    element.dispatchEvent(new window.WheelEvent('wheel', { deltaX: 20, deltaY: 30, cancelable: true }))
    expect(read()).toEqual({ x: -20, y: -30, scale: 1 })
    const before = read()
    element.dispatchEvent(new window.WheelEvent('wheel', { clientX: 110, clientY: 120, deltaY: -30, ctrlKey: true, cancelable: true }))
    expect(read().scale).toBeGreaterThan(1)
    expect((100 - read().x) / read().scale).toBeCloseTo((100 - before.x) / before.scale)
    expect((100 - read().y) / read().scale).toBeCloseTo((100 - before.y) / before.scale)
  })
  it('[U04200] normalizes line and page wheel deltas and prevents page scrolling', () => {
    const { element, read } = viewport()
    Object.defineProperty(element, 'clientHeight', { value: 400 })
    const lines = new window.WheelEvent('wheel', { deltaX: 2, deltaY: 3, deltaMode: 1, cancelable: true })
    element.dispatchEvent(lines)
    expect(lines.defaultPrevented).toBe(true)
    expect(read()).toEqual({ x: -32, y: -48, scale: 1 })
    element.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 1, deltaMode: 2 }))
    expect(read()).toEqual({ x: -32, y: -448, scale: 1 })
  })
  it('[U04201] anchors pointer pinch zoom at the moving two-finger centre', () => {
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
  it('[U04202] bounds and persists the separator ratio and handles touch dragging', () => {
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

describe('SSE zoom helpers and alternative gestures', () => {
  it('[U04203] clamps zoom while preserving the anchor and synchronizes input in both directions', async() => {
    const { zoomSseView, bindSseZoomInput } = await import('../../src/ui/sseViewport.js')
    const original = { x: 25, y: -40, scale: 2 }
    const zoomed = zoomSseView(original, 100, 80, 120)
    expect(zoomed.scale).toBe(8)
    expect((80 - zoomed.x) / zoomed.scale).toBe((80 - original.x) / original.scale)
    expect((120 - zoomed.y) / zoomed.scale).toBe((120 - original.y) / original.scale)
    expect(zoomSseView(original, -1, 0, 0).scale).toBe(0.1)
    const element = document.createElement('div')
    const input = document.createElement('input')
    input.type = 'number'
    let view = original
    let calls = 0
    const sync = bindSseZoomInput(input, element, () => view, next => { view = next; calls++; sync() })
    expect(input.value).toBe('200')
    input.value = '350'
    input.dispatchEvent(new Event('input'))
    expect(view.scale).toBe(3.5)
    expect(calls).toBe(1)
    view = zoomed
    sync()
    expect(input.value).toBe('800')
    expect(calls).toBe(1)
  })

  it('[U04204] handles TouchEvent pinch and Safari relative gesture scales', () => {
    const element = document.createElement('div')
    element.getBoundingClientRect = () => ({ left: 0, top: 0 })
    let view = { x: 0, y: 0, scale: 1 }
    bindSseViewport(element, () => view, next => { view = next })
    const touch = (type, points) => {
      const event = new Event(type, { cancelable: true })
      Object.defineProperty(event, 'touches', { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) })
      element.dispatchEvent(event)
      return event
    }
    touch('touchstart', [[50, 100], [150, 100]])
    expect(touch('touchmove', [[50, 100], [250, 100]]).defaultPrevented).toBe(true)
    expect(view).toEqual({ x: -50, y: -100, scale: 2 })
    touch('touchend', [])
    for (const [type, scale] of [['gesturestart', 1], ['gesturechange', 1.5], ['gesturechange', 2], ['gestureend', 2]]) {
      const event = new Event(type, { cancelable: true })
      Object.assign(event, { scale, clientX: 150, clientY: 100 })
      element.dispatchEvent(event)
    }
    expect(view.scale).toBe(4)
  })
})
