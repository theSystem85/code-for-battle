import { beforeEach, describe, expect, it, vi } from 'vitest'

const { applyMobileSidebarLayoutMock } = vi.hoisted(() => ({
  applyMobileSidebarLayoutMock: vi.fn()
}))

vi.mock('../../src/ui/mobileLayout.js', () => ({
  applyMobileSidebarLayout: applyMobileSidebarLayoutMock
}))

import { updateMobileLayoutClasses } from '../../src/ui/deviceLifecycle.js'

describe('deviceLifecycle mobile layout detection', () => {
  let isTouch = true
  let isPortrait = false

  beforeEach(() => {
    isTouch = true
    isPortrait = false

    document.body.className = ''
    document.body.style.cssText = ''
    document.body.classList.add('is-touch')

    applyMobileSidebarLayoutMock.mockClear()

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 844
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 390
    })

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      writable: true,
      value: null
    })

    window.matchMedia = vi.fn().mockImplementation((query) => {
      const matches = query.includes('(pointer: coarse)')
        ? isTouch
        : query.includes('(orientation: portrait)')
          ? isPortrait
          : false
      return {
        matches,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    })
  })

  it('keeps phone landscape touch devices in mobile landscape mode', () => {
    isPortrait = false
    updateMobileLayoutClasses()

    expect(document.body.classList.contains('mobile-landscape')).toBe(true)
    expect(document.body.classList.contains('mobile-portrait')).toBe(false)
    expect(applyMobileSidebarLayoutMock).toHaveBeenCalledWith('landscape')
  })

  it('switches touch tablets in landscape to desktop sidebar behavior', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1024
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 768
    })

    updateMobileLayoutClasses()

    expect(document.body.classList.contains('mobile-landscape')).toBe(false)
    expect(document.body.classList.contains('mobile-portrait')).toBe(false)
    expect(applyMobileSidebarLayoutMock).toHaveBeenCalledWith(null)
  })

  it('still applies mobile portrait mode on touch portrait devices', () => {
    isPortrait = true
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 768
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 1024
    })

    updateMobileLayoutClasses()

    expect(document.body.classList.contains('mobile-portrait')).toBe(true)
    expect(document.body.classList.contains('mobile-landscape')).toBe(false)
    expect(applyMobileSidebarLayoutMock).toHaveBeenCalledWith('portrait')
  })
})
