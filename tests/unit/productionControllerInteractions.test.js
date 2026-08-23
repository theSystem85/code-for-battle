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

  it('leaves mouse pointers to native desktop click and drag handling', () => {
    const activation = vi.fn()
    button.addEventListener('production-button-activate', activation)

    dispatchPointer(button, 'pointerdown', { pointerType: 'mouse' })
    dispatchPointer(window, 'pointerup', { pointerType: 'mouse' })

    expect(controller.mobileDragState).toBeNull()
    expect(activation).not.toHaveBeenCalled()
  })

  it('does not activate when release displacement proves a coalesced scroll drag', () => {
    const activation = vi.fn()
    button.addEventListener('production-button-activate', activation)

    dispatchPointer(button, 'pointerdown', { clientX: 20, clientY: 20 })
    dispatchPointer(window, 'pointerup', { clientX: 20, clientY: 26 })
    button.click()

    expect(activation).not.toHaveBeenCalled()
  })

  function moveButtonToPortraitProductionBar() {
    const mobileContainer = document.createElement('div')
    mobileContainer.id = 'mobileBuildMenuContainer'
    const production = document.createElement('div')
    production.id = 'production'
    mobileContainer.appendChild(production)
    production.appendChild(button)
    document.body.appendChild(mobileContainer)
    document.body.className = 'mobile-portrait sidebar-condensed'
    production.getBoundingClientRect = () => ({
      left: 0,
      right: 300,
      top: 0,
      bottom: 100,
      width: 300,
      height: 100
    })
    return production
  }

  function moveButtonToLandscapeProductionBar() {
    const production = moveButtonToPortraitProductionBar()
    const mobileContainer = document.getElementById('mobileBuildMenuContainer')
    mobileContainer.dataset.orientation = 'landscape'
    document.body.className = 'mobile-landscape'
    return production
  }

  it('does not activate when portrait scroll position changes without move or scroll events', () => {
    const production = moveButtonToPortraitProductionBar()
    const activation = vi.fn()
    button.addEventListener('production-button-activate', activation)

    dispatchPointer(button, 'pointerdown', { clientX: 20, clientY: 20 })
    expect(controller.mobileDragState.interactionElement).toBe(production)
    production.scrollLeft = 40
    dispatchPointer(window, 'pointerup', { clientX: 20, clientY: 20 })
    button.click()

    expect(activation).not.toHaveBeenCalled()
  })

  it('keeps consecutive portrait upper and lower taps immediately responsive', () => {
    moveButtonToPortraitProductionBar()
    const activations = []
    button.addEventListener('production-button-activate', event => activations.push(event.detail.clientY))

    dispatchPointer(button, 'pointerdown', { clientY: 20 })
    dispatchPointer(window, 'pointerup', { clientY: 20 })
    dispatchPointer(button, 'pointerdown', { clientY: 80 })
    dispatchPointer(window, 'pointerup', { clientY: 80 })

    expect(activations).toEqual([20, 80])
    expect(isUpperHalfClick(null, { detail: { clientY: activations[0] } }, button)).toBe(true)
    expect(isUpperHalfClick(null, { detail: { clientY: activations[1] } }, button)).toBe(false)
  })

  it('cancels a landscape tap when vertical scrolling arrives after pointerup', () => {
    const production = moveButtonToLandscapeProductionBar()
    const pendingTimers = []
    const setTimer = vi.spyOn(window, 'setTimeout')
      .mockImplementation(callback => pendingTimers.push(callback))
    const activation = vi.fn()
    button.addEventListener('production-button-activate', activation)

    dispatchPointer(button, 'pointerdown', { clientX: 20, clientY: 20 })
    dispatchPointer(window, 'pointerup', { clientX: 20, clientY: 20 })
    expect(activation).not.toHaveBeenCalled()

    production.scrollTop = 40
    production.dispatchEvent(new window.Event('scroll'))
    pendingTimers.shift()()

    expect(activation).not.toHaveBeenCalled()
    setTimer.mockRestore()
  })

  it('keeps consecutive landscape taps lossless after scroll classification', () => {
    moveButtonToLandscapeProductionBar()
    const pendingTimers = []
    const setTimer = vi.spyOn(window, 'setTimeout')
      .mockImplementation(callback => pendingTimers.push(callback))
    const activations = []
    button.addEventListener('production-button-activate', event => activations.push(event.detail.clientY))

    dispatchPointer(button, 'pointerdown', { clientY: 20 })
    dispatchPointer(window, 'pointerup', { clientY: 20 })
    dispatchPointer(button, 'pointerdown', { clientY: 80 })
    dispatchPointer(window, 'pointerup', { clientY: 80 })
    while (pendingTimers.length > 0) {
      pendingTimers.shift()()
    }

    expect(activations).toEqual([20, 80])
    setTimer.mockRestore()
  })
})
