import { beforeEach, describe, expect, it, vi } from 'vitest'
import { attachMobileDragHandlers } from '../../src/ui/productionControllerInteractions.js'
import { gameState } from '../../src/gameState.js'

function pointerEvent(type, properties) {
  const event = new window.Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, properties)
  return event
}

describe('mobile production button interactions', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="mobileBuildMenuContainer">
        <div id="production"><button data-unit-type="tank"></button></div>
      </div>`
    document.body.className = 'mobile-landscape'
    vi.stubGlobal('PointerEvent', window.Event)
    window.PointerEvent = window.Event
    gameState.gamePaused = false
  })

  it('suppresses the synthetic click emitted after dragging the build bar to scroll', () => {
    const button = document.querySelector('button')
    const production = document.getElementById('production')
    production.getBoundingClientRect = () => ({ left: 0, right: 300, top: 0, bottom: 100 })
    const controller = { suppressNextClick: false }
    const build = vi.fn()

    attachMobileDragHandlers(controller, button, { kind: 'unit', type: 'tank' })
    button.addEventListener('click', build)

    button.dispatchEvent(pointerEvent('pointerdown', {
      pointerType: 'touch', pointerId: 7, clientX: 100, clientY: 50
    }))
    window.dispatchEvent(pointerEvent('pointermove', {
      pointerType: 'touch', pointerId: 7, clientX: 101, clientY: 65
    }))
    window.dispatchEvent(pointerEvent('pointerup', {
      pointerType: 'touch', pointerId: 7, clientX: 101, clientY: 65
    }))
    button.click()

    expect(build).not.toHaveBeenCalled()
    expect(controller.suppressNextClick).toBe(false)
  })

  it('suppresses a unit click when native scrolling cancels its pointer gesture', () => {
    const button = document.querySelector('button')
    const production = document.getElementById('production')
    production.getBoundingClientRect = () => ({ left: 0, right: 300, top: 0, bottom: 100 })
    const controller = { suppressNextClick: false }
    const build = vi.fn()

    attachMobileDragHandlers(controller, button, { kind: 'unit', type: 'tank' })
    button.addEventListener('click', build)
    button.dispatchEvent(pointerEvent('pointerdown', {
      pointerType: 'touch', pointerId: 8, clientX: 100, clientY: 50
    }))
    production.scrollTop = 40
    production.dispatchEvent(new window.Event('scroll'))
    window.dispatchEvent(pointerEvent('pointercancel', {
      pointerType: 'touch', pointerId: 8, clientX: 100, clientY: 50
    }))
    button.click()

    expect(build).not.toHaveBeenCalled()
    expect(controller.suppressNextClick).toBe(false)
  })

  it('allows movement below 5px but suppresses movement at the 5px threshold', () => {
    const button = document.querySelector('button')
    const production = document.getElementById('production')
    production.getBoundingClientRect = () => ({ left: 0, right: 300, top: 0, bottom: 100 })
    const controller = { suppressNextClick: false }
    const build = vi.fn()

    attachMobileDragHandlers(controller, button, { kind: 'unit', type: 'tank' })
    button.addEventListener('click', build)

    button.dispatchEvent(pointerEvent('pointerdown', {
      pointerType: 'touch', pointerId: 9, clientX: 100, clientY: 50
    }))
    window.dispatchEvent(pointerEvent('pointerup', {
      pointerType: 'touch', pointerId: 9, clientX: 104, clientY: 50
    }))
    button.click()
    expect(build).toHaveBeenCalledTimes(1)

    button.dispatchEvent(pointerEvent('pointerdown', {
      pointerType: 'touch', pointerId: 10, clientX: 100, clientY: 50
    }))
    window.dispatchEvent(pointerEvent('pointerup', {
      pointerType: 'touch', pointerId: 10, clientX: 105, clientY: 50
    }))
    button.click()
    expect(build).toHaveBeenCalledTimes(1)
  })
})
