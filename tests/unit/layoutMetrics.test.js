import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Import test utilities
import '../setup.js'

// Import functions to test
import {
  getSidebarWidth,
  getSafeAreaInset,
  getMobileActionBarWidth,
  getCanvasLogicalWidth,
  getCanvasLogicalHeight,
  getMobileLandscapeRightUiWidth,
  getPlayableViewportWidth,
  getPlayableViewportHeight
} from '../../src/utils/layoutMetrics.js'

describe('layoutMetrics.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset document state
    document.documentElement.style.cssText = ''
    document.body.style.cssText = ''
    document.body.className = ''
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getSidebarWidth', () => {
    it('[U02315] should return default width when no root style is available', () => {
      const originalDocumentElement = document.documentElement
      Object.defineProperty(document, 'documentElement', {
        value: null,
        writable: true,
        configurable: true
      })

      const width = getSidebarWidth()

      expect(width).toBe(250)

      Object.defineProperty(document, 'documentElement', {
        value: originalDocumentElement,
        writable: true,
        configurable: true
      })
    })

    it('[U02316] should return custom sidebar width from CSS variable', () => {
      const mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle')
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: (prop) => {
          if (prop === '--sidebar-width') return '300px'
          return ''
        }
      })

      const width = getSidebarWidth()

      expect(width).toBe(300)
    })

    it('[U02317] should return default when CSS variable is invalid', () => {
      const mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle')
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: (prop) => {
          if (prop === '--sidebar-width') return 'invalid'
          return ''
        }
      })

      const width = getSidebarWidth()

      expect(width).toBe(250)
    })

    it('[U02318] should return default when CSS variable is zero', () => {
      const mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle')
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: (prop) => {
          if (prop === '--sidebar-width') return '0'
          return ''
        }
      })

      const width = getSidebarWidth()

      expect(width).toBe(250)
    })
  })

  describe('getSafeAreaInset', () => {
    it('[U02319] should return 0 when body is not available', () => {
      const originalBody = document.body
      Object.defineProperty(document, 'body', {
        value: null,
        writable: true,
        configurable: true
      })

      const inset = getSafeAreaInset('top')

      expect(inset).toBe(0)

      Object.defineProperty(document, 'body', {
        value: originalBody,
        writable: true,
        configurable: true
      })
    })

    it('[U02320] should return safe area inset for top', () => {
      const mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle')
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: (prop) => {
          if (prop === '--safe-area-top') return '44px'
          return ''
        }
      })

      const inset = getSafeAreaInset('top')

      expect(inset).toBe(44)
    })

    it('[U02321] should return safe area inset for all sides', () => {
      const mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle')
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: (prop) => {
          const values = {
            '--safe-area-top': '44px',
            '--safe-area-bottom': '34px',
            '--safe-area-left': '0px',
            '--safe-area-right': '0px'
          }
          return values[prop] || ''
        }
      })

      expect(getSafeAreaInset('top')).toBe(44)
      expect(getSafeAreaInset('bottom')).toBe(34)
      expect(getSafeAreaInset('left')).toBe(0)
      expect(getSafeAreaInset('right')).toBe(0)
    })
  })

  describe('getMobileActionBarWidth', () => {
    it('[U02322] should return 0 when document is undefined', () => {
      const originalDocument = globalThis.document
      Object.defineProperty(globalThis, 'document', {
        value: undefined,
        writable: true,
        configurable: true
      })

      const width = getMobileActionBarWidth()

      expect(width).toBe(0)

      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        writable: true,
        configurable: true
      })
    })

    it('[U02323] should return 0 when not in mobile landscape mode', () => {
      document.body.classList.remove('mobile-landscape')

      const width = getMobileActionBarWidth()

      expect(width).toBe(0)
    })

    it('[U02324] should return 0 when controls element does not exist', () => {
      document.body.classList.add('mobile-landscape')

      const width = getMobileActionBarWidth()

      expect(width).toBe(0)
    })

    it('[U02325] should return 0 when controls are hidden', () => {
      document.body.classList.add('mobile-landscape')
      const controls = document.createElement('div')
      controls.id = 'mobileSidebarControls'
      controls.setAttribute('aria-hidden', 'true')
      document.body.appendChild(controls)

      const width = getMobileActionBarWidth()

      expect(width).toBe(0)
    })

    it('[U02326] should return width of visible controls in mobile landscape', () => {
      document.body.classList.add('mobile-landscape')
      const controls = document.createElement('div')
      controls.id = 'mobileSidebarControls'
      controls.setAttribute('aria-hidden', 'false')
      Object.defineProperty(controls, 'getBoundingClientRect', {
        value: () => ({ width: 200, height: 600 })
      })
      document.body.appendChild(controls)

      const width = getMobileActionBarWidth()

      expect(width).toBe(200)
    })
  })

  describe('getCanvasLogicalWidth', () => {
    it('[U02327] should return canvas style width if available', () => {
      const canvas = document.createElement('canvas')
      canvas.style.width = '1024px'

      const width = getCanvasLogicalWidth(canvas)

      expect(width).toBe(1024)
    })

    it('[U02328] should return canvas clientWidth if style width not available', () => {
      const canvas = document.createElement('canvas')
      Object.defineProperty(canvas, 'clientWidth', {
        value: 800,
        writable: true
      })

      const width = getCanvasLogicalWidth(canvas)

      expect(width).toBe(800)
    })

    it('[U02329] should return canvas bounding rect width as fallback', () => {
      const canvas = document.createElement('canvas')
      Object.defineProperty(canvas, 'clientWidth', { value: 0 })
      Object.defineProperty(canvas, 'getBoundingClientRect', {
        value: () => ({ width: 900, height: 600 })
      })

      const width = getCanvasLogicalWidth(canvas)

      expect(width).toBe(900)
    })

    it('[U02330] should calculate from window width minus sidebar when no canvas provided', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 1920,
        writable: true,
        configurable: true
      })

      const width = getCanvasLogicalWidth(null)

      expect(width).toBeGreaterThan(0)
      expect(width).toBeLessThanOrEqual(1920)
    })
  })

  describe('getCanvasLogicalHeight', () => {
    it('[U02331] should return canvas style height if available', () => {
      const canvas = document.createElement('canvas')
      canvas.style.height = '768px'

      const height = getCanvasLogicalHeight(canvas)

      expect(height).toBe(768)
    })

    it('[U02332] should return canvas clientHeight if style height not available', () => {
      const canvas = document.createElement('canvas')
      Object.defineProperty(canvas, 'clientHeight', {
        value: 600,
        writable: true
      })

      const height = getCanvasLogicalHeight(canvas)

      expect(height).toBe(600)
    })

    it('[U02333] should return canvas bounding rect height as fallback', () => {
      const canvas = document.createElement('canvas')
      Object.defineProperty(canvas, 'clientHeight', { value: 0 })
      Object.defineProperty(canvas, 'getBoundingClientRect', {
        value: () => ({ width: 1024, height: 768 })
      })

      const height = getCanvasLogicalHeight(canvas)

      expect(height).toBe(768)
    })

    it('[U02334] should return window innerHeight when no canvas provided', () => {
      Object.defineProperty(window, 'innerHeight', {
        value: 1080,
        writable: true,
        configurable: true
      })

      const height = getCanvasLogicalHeight(null)

      expect(height).toBe(1080)
    })
  })

  describe('getMobileLandscapeRightUiWidth', () => {
    it('[U02335] should return 0 when not in mobile landscape mode', () => {
      document.body.classList.remove('mobile-landscape')

      const width = getMobileLandscapeRightUiWidth()

      expect(width).toBe(0)
    })

    it('[U02336] should return 0 when build menu does not exist', () => {
      document.body.classList.add('mobile-landscape')

      const width = getMobileLandscapeRightUiWidth()

      expect(width).toBe(0)
    })

    it('[U02337] should return 0 when build menu is hidden', () => {
      document.body.classList.add('mobile-landscape')
      const buildMenu = document.createElement('div')
      buildMenu.id = 'mobileBuildMenuContainer'
      buildMenu.setAttribute('aria-hidden', 'true')
      document.body.appendChild(buildMenu)

      const width = getMobileLandscapeRightUiWidth()

      expect(width).toBe(0)
    })

    it('[U02338] should return width of visible build menu', () => {
      document.body.classList.add('mobile-landscape')
      const buildMenu = document.createElement('div')
      buildMenu.id = 'mobileBuildMenuContainer'
      buildMenu.setAttribute('aria-hidden', 'false')
      Object.defineProperty(buildMenu, 'getBoundingClientRect', {
        value: () => ({ width: 300, height: 800 })
      })
      document.body.appendChild(buildMenu)

      const width = getMobileLandscapeRightUiWidth()

      expect(width).toBe(300)
    })
  })

  describe('getPlayableViewportWidth', () => {
    it('[U02339] should return 0 when logical width is 0', () => {
      const canvas = document.createElement('canvas')
      Object.defineProperty(canvas, 'clientWidth', { value: 0 })
      Object.defineProperty(window, 'innerWidth', { value: 0, writable: true, configurable: true })

      const width = getPlayableViewportWidth(canvas)

      expect(width).toBe(0)
    })

    it('[U02340] should subtract safe area insets from logical width', () => {
      const canvas = document.createElement('canvas')
      canvas.style.width = '1920px'

      const mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle')
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: (prop) => {
          if (prop === '--safe-area-left') return '20px'
          if (prop === '--safe-area-right') return '20px'
          return ''
        }
      })

      const width = getPlayableViewportWidth(canvas)

      expect(width).toBe(1920 - 20 - 20)
    })

    it('[U02341] should use maximum of safe area and UI width for right obstruction', () => {
      const canvas = document.createElement('canvas')
      canvas.style.width = '1920px'

      document.body.classList.add('mobile-landscape')
      const buildMenu = document.createElement('div')
      buildMenu.id = 'mobileBuildMenuContainer'
      buildMenu.setAttribute('aria-hidden', 'false')
      Object.defineProperty(buildMenu, 'getBoundingClientRect', {
        value: () => ({ width: 400, height: 800 })
      })
      document.body.appendChild(buildMenu)

      const mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle')
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: (prop) => {
          if (prop === '--safe-area-left') return '20px'
          if (prop === '--safe-area-right') return '30px'
          return ''
        }
      })

      const width = getPlayableViewportWidth(canvas)

      // Should use 400 (UI width) instead of 30 (safe area)
      expect(width).toBe(1920 - 20 - 400)
    })
  })

  describe('getPlayableViewportHeight', () => {
    it('[U02342] should return 0 when logical height is 0', () => {
      const canvas = document.createElement('canvas')
      Object.defineProperty(canvas, 'clientHeight', { value: 0 })
      Object.defineProperty(window, 'innerHeight', { value: 0, writable: true, configurable: true })

      const height = getPlayableViewportHeight(canvas)

      expect(height).toBe(0)
    })

    it('[U02343] should subtract safe area insets from logical height', () => {
      const canvas = document.createElement('canvas')
      canvas.style.height = '1080px'

      const mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle')
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: (prop) => {
          if (prop === '--safe-area-top') return '44px'
          if (prop === '--safe-area-bottom') return '34px'
          return ''
        }
      })

      const height = getPlayableViewportHeight(canvas)

      expect(height).toBe(1080 - 44 - 34)
    })

    it('[U02344] should not go below 0', () => {
      const canvas = document.createElement('canvas')
      canvas.style.height = '50px'

      const mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle')
      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: (prop) => {
          if (prop === '--safe-area-top') return '100px'
          if (prop === '--safe-area-bottom') return '100px'
          return ''
        }
      })

      const height = getPlayableViewportHeight(canvas)

      expect(height).toBe(0)
    })
  })
})
