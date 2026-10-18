import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachAutomationViewport, classifyAutomationDevice } from '../../src/ui/policies/automationViewport.js'

describe('Automation hardware classification', () => {
  it.each([
    [{ userAgent: 'iPhone', screenWidth: 844, screenHeight: 390 }, 'phone'],
    [{ userAgent: 'iPod' }, 'phone'],
    [{ userAgent: 'iPad', mobile: true, screenWidth: 320 }, 'tablet'],
    [{ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5, mobile: true }, 'tablet'],
    [{ userAgent: 'Android Mobile' }, 'phone'],
    [{ userAgent: 'Android', mobile: true }, 'tablet'],
    [{ userAgent: 'Silk Tablet', mobile: true }, 'tablet'],
    [{ mobile: true }, 'phone'],
    [{ mobile: false, coarsePointer: true, maxTouchPoints: 5, screenWidth: 390, screenHeight: 844 }, 'desktop'],
    [{ coarsePointer: true, maxTouchPoints: 5, screenWidth: 390, screenHeight: 844 }, 'phone'],
    [{ coarsePointer: true, maxTouchPoints: 5, screenWidth: 844, screenHeight: 390 }, 'phone'],
    [{ coarsePointer: true, maxTouchPoints: 5, screenWidth: 768, screenHeight: 1024 }, 'desktop'],
    [{ coarsePointer: true, maxTouchPoints: 5, screenWidth: 600, screenHeight: 1024 }, 'desktop'],
    [{ coarsePointer: true, maxTouchPoints: 0, screenWidth: 390, screenHeight: 844 }, 'desktop'],
    [{ coarsePointer: true, maxTouchPoints: 5 }, 'desktop'],
    [{ screenWidth: 390, screenHeight: 844 }, 'desktop']
  ])('[U00317] classifies %j as %s', (signals, expected) => expect(classifyAutomationDevice(signals)).toBe(expected))
})

describe('Automation viewport lifecycle', () => {
  let cleanup
  afterEach(() => {
    cleanup?.()
    cleanup = null
    document.body.replaceChildren()
    document.body.removeAttribute('style')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function mount(device = 'phone') {
    document.body.innerHTML = '<button id="opener">Edit</button><div id="existing" inert></div><div class="policy-editor-backdrop"><div class="policy-editor"><button id="first">Toggle</button><input id="input"><button id="last">Save</button></div></div>'
    document.getElementById('opener').focus()
    const viewport = Object.assign(new window.EventTarget(), { offsetTop: 0, offsetLeft: 0, width: 390, height: 844 })
    const scrollTo = vi.fn()
    const win = {
      innerHeight: 844, innerWidth: 390, scrollX: 13, scrollY: 27, visualViewport: viewport,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), scrollTo,
      requestAnimationFrame: vi.fn(() => 1), cancelAnimationFrame: vi.fn(),
      getComputedStyle: window.getComputedStyle.bind(window)
    }
    const backdrop = document.querySelector('.policy-editor-backdrop')
    const dialog = document.querySelector('.policy-editor')
    cleanup = attachAutomationViewport(backdrop, dialog, { win, classify: () => device })
    return { viewport, win, scrollTo, backdrop, dialog }
  }

  it('[U00318] fits the visual viewport across keyboard opening and landscape rotation without changing device', () => {
    const { viewport, backdrop } = mount()
    expect(backdrop.classList.contains('automation-phone')).toBe(true)
    expect(backdrop.style.getPropertyValue('--automation-viewport-height')).toBe('844px')
    Object.assign(viewport, { height: 320, offsetTop: 44 })
    viewport.dispatchEvent(new Event('resize'))
    expect(backdrop.style.getPropertyValue('--automation-viewport-height')).toBe('320px')
    expect(backdrop.style.getPropertyValue('--automation-viewport-top')).toBe('44px')
    expect(backdrop.style.getPropertyValue('--automation-viewport-bottom')).toBe('480px')
    Object.assign(viewport, { height: 390, width: 844, offsetTop: 0 })
    viewport.dispatchEvent(new Event('resize'))
    expect(backdrop.classList.contains('automation-phone')).toBe(true)
    expect(backdrop.style.getPropertyValue('--automation-viewport-width')).toBe('844px')
  })

  it('[U00319] never gives tablets phone styling even with a narrow keyboard viewport', () => {
    const { viewport, backdrop } = mount('tablet')
    Object.assign(viewport, { width: 320, height: 200 })
    viewport.dispatchEvent(new Event('resize'))
    expect(backdrop.classList.contains('automation-phone')).toBe(false)
    expect(backdrop.style.getPropertyValue('--automation-viewport-height')).toBe('200px')
  })

  it('[U00320] traps keyboard and programmatic focus and preserves background inert flags', () => {
    mount()
    const first = document.getElementById('first')
    const last = document.getElementById('last')
    last.focus()
    last.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(first)
    first.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(last)
    document.getElementById('opener').focus()
    expect(document.activeElement).toBe(first)
    expect(document.getElementById('opener').hasAttribute('inert')).toBe(true)
  })

  it('[U00321] restores focus, scroll, inline styles and removes listeners and viewport state on teardown', () => {
    const { viewport, backdrop, win, scrollTo } = mount()
    cleanup()
    expect(document.activeElement.id).toBe('opener')
    expect(document.body.getAttribute('style')).toBe(null)
    expect(document.getElementById('opener').hasAttribute('inert')).toBe(false)
    expect(document.getElementById('existing').hasAttribute('inert')).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith(13, 27)
    expect(win.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(backdrop.classList.contains('automation-phone')).toBe(false)
    viewport.dispatchEvent(new Event('resize'))
    expect(backdrop.style.getPropertyValue('--automation-viewport-height')).toBe('')
    cleanup()
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })
})
