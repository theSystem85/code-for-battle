import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/replaySystem.js', () => ({ isReplayModeActive: () => false }))
vi.mock('../../src/gameState.js', () => ({
  gameState: {
    gamePaused: false,
    draggedUnitType: null,
    draggedUnitButton: null
  }
}))

import {
  attachMobileDragHandlers,
  isUpperHalfClick
} from '../../src/ui/productionControllerInteractions.js'

function dispatchPointer(target, type, options) {
  const event = new window.Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 20,
    clientY: 20,
    ...options
  })
  target.dispatchEvent(event)
}

describe('production button pointer activation', () => {
  let button
  let scroller
  let controller

  beforeEach(() => {
    document.body.innerHTML = '<div id="sidebar"><div id="sidebarScroll"><button></button></div></div>'
    button = document.querySelector('button')
    scroller = document.getElementById('sidebarScroll')
    button.getBoundingClientRect = () => ({ left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 })
    scroller.getBoundingClientRect = () => ({ left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 })
    controller = {
      suppressNextClick: false,
      mobileDragState: null,
      lastMobileEdgeScrollTime: null,
      updateMobileDragHover: vi.fn()
    }
    window.PointerEvent = window.PointerEvent || window.Event
    attachMobileDragHandlers(controller, button, { kind: 'unit', type: 'destroyer' })
  })

  it('emits every rapid tap immediately with its release coordinate', () => {
    const activations = []
    button.addEventListener('production-button-activate', event => activations.push(event.detail.clientY))

    dispatchPointer(button, 'pointerdown', { clientY: 20 })
    dispatchPointer(window, 'pointerup', { clientY: 20 })
    button.click() // compatibility click is ignored
    dispatchPointer(button, 'pointerdown', { clientY: 80 })
    dispatchPointer(window, 'pointerup', { clientY: 80 })
    button.click()

    expect(activations).toEqual([20, 80])
    expect(isUpperHalfClick(null, { detail: { clientY: activations[1] } }, button)).toBe(false)
  })

  it('does not activate after action-bar movement or scrolling', () => {
    const activation = vi.fn()
    button.addEventListener('production-button-activate', activation)

    dispatchPointer(button, 'pointerdown', { clientX: 20 })
    dispatchPointer(window, 'pointermove', { clientX: 40 })
    scroller.scrollLeft = 20
    scroller.dispatchEvent(new window.Event('scroll'))
    dispatchPointer(window, 'pointerup', { clientX: 40 })
    button.click()

    expect(activation).not.toHaveBeenCalled()
  })
})
