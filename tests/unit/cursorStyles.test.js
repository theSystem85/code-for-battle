import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('cursorStyles.js', () => {
  let originalDocument
  let preloadCursorAssets
  let GAME_DEFAULT_CURSOR
  let GAME_DEFAULT_CURSOR_URL

  beforeEach(async() => {
    // Reset modules to clear cursorsPreloaded state
    vi.resetModules()

    originalDocument = globalThis.document
    globalThis.document = {
      head: {
        appendChild: vi.fn()
      },
      getElementsByTagName: vi.fn(() => [globalThis.document.head])
    }
    globalThis.document.createElement = vi.fn((tag) => {
      if (tag === 'link') {
        return {
          rel: '',
          as: '',
          href: '',
          type: ''
        }
      }
      return {}
    })
    globalThis.Image = vi.fn(function() {
      this.src = ''
    })

    // Dynamically import after resetting modules
    const module = await import('../../src/input/cursorStyles.js')
    preloadCursorAssets = module.preloadCursorAssets
    GAME_DEFAULT_CURSOR = module.GAME_DEFAULT_CURSOR
    GAME_DEFAULT_CURSOR_URL = module.GAME_DEFAULT_CURSOR_URL
  })

  afterEach(() => {
    globalThis.document = originalDocument
    vi.clearAllMocks()
  })

  describe('GAME_DEFAULT_CURSOR constant', () => {
    it('[U01134] exports the default cursor URL', () => {
      expect(GAME_DEFAULT_CURSOR_URL).toBe('/cursors/default.svg')
    })

    it('[U01135] exports the default cursor CSS string', () => {
      expect(GAME_DEFAULT_CURSOR).toBe('url("/cursors/default.svg") 6 4, auto')
    })
  })

  describe('preloadCursorAssets', () => {
    it('[U01136] preloads all cursor assets as link tags', () => {
      preloadCursorAssets()

      expect(globalThis.document.createElement).toHaveBeenCalledWith('link')
      expect(globalThis.document.head.appendChild).toHaveBeenCalled()

      const createElementCalls = globalThis.document.createElement.mock.calls.filter(call => call[0] === 'link')
      expect(createElementCalls.length).toBeGreaterThan(0)
    })

    it('[U01137] creates Image objects for each cursor URL', () => {
      preloadCursorAssets()

      expect(globalThis.Image).toHaveBeenCalled()
      expect(globalThis.Image.mock.instances.length).toBeGreaterThan(0)

      const imageInstances = globalThis.Image.mock.instances
      expect(imageInstances[0].src).toBeDefined()
    })

    it('[U01138] sets correct attributes on link elements', () => {
      const linkElements = []
      globalThis.document.createElement = vi.fn((tag) => {
        if (tag === 'link') {
          const link = {
            rel: '',
            as: '',
            href: '',
            type: ''
          }
          linkElements.push(link)
          return link
        }
        return {}
      })

      preloadCursorAssets()

      const validLinks = linkElements.filter(link => link.href)
      expect(validLinks.length).toBeGreaterThan(0)
      expect(validLinks.every(link => link.rel === 'preload')).toBe(true)
      expect(validLinks.every(link => link.as === 'image')).toBe(true)
      expect(validLinks.every(link => link.type === 'image/svg+xml')).toBe(true)
    })

    it('[U01139] does not preload twice when called multiple times', () => {
      preloadCursorAssets()
      const _firstCallCount = globalThis.document.createElement.mock.calls.length

      vi.clearAllMocks()

      preloadCursorAssets()

      expect(globalThis.document.createElement).not.toHaveBeenCalled()
      expect(globalThis.document.head.appendChild).not.toHaveBeenCalled()
    })

    it('[U01140] does nothing if document is undefined', () => {
      globalThis.document = undefined

      preloadCursorAssets()

      expect(globalThis.Image).not.toHaveBeenCalled()
    })

    it('[U01141] falls back to getElementsByTagName if document.head is undefined', () => {
      const mockHead = { appendChild: vi.fn() }
      globalThis.document.head = undefined
      globalThis.document.getElementsByTagName = vi.fn(() => [mockHead])

      preloadCursorAssets()

      expect(globalThis.document.getElementsByTagName).toHaveBeenCalledWith('head')
      expect(mockHead.appendChild).toHaveBeenCalled()
    })

    it('[U01142] skips empty href values', () => {
      const linkElements = []
      globalThis.document.createElement = vi.fn((tag) => {
        if (tag === 'link') {
          const link = {
            rel: '',
            as: '',
            href: '',
            type: ''
          }
          linkElements.push(link)
          return link
        }
        return {}
      })

      preloadCursorAssets()

      const emptyLinks = linkElements.filter(link => !link.href)
      expect(emptyLinks.length).toBe(0)
    })

    it('[U01143] handles environment without Image constructor', () => {
      globalThis.Image = undefined

      expect(() => preloadCursorAssets()).not.toThrow()
      expect(globalThis.document.head.appendChild).toHaveBeenCalled()
    })

    it('[U01144] preloads all expected cursor types', () => {
      const linkElements = []
      globalThis.document.createElement = vi.fn((tag) => {
        if (tag === 'link') {
          const link = {
            rel: '',
            as: '',
            href: '',
            type: ''
          }
          linkElements.push(link)
          return link
        }
        return {}
      })

      preloadCursorAssets()

      const hrefs = linkElements.map(link => link.href).filter(Boolean)

      expect(hrefs).toContain('/cursors/default.svg')
      expect(hrefs).toContain('/cursors/repair.svg')
      expect(hrefs).toContain('/cursors/repair_blocked.svg')
      expect(hrefs).toContain('/cursors/sell.svg')
      expect(hrefs).toContain('/cursors/sell_blocked.svg')
      expect(hrefs).toContain('/cursors/move.svg')
      expect(hrefs).toContain('/cursors/moveInto.svg')
      expect(hrefs).toContain('/cursors/move_blocked.svg')
      expect(hrefs).toContain('/cursors/attack.svg')
      expect(hrefs).toContain('/cursors/attack_blocked.svg')
      expect(hrefs).toContain('/cursors/attack_out_of_range.svg')
      expect(hrefs).toContain('/cursors/guard.svg')
    })
  })
})
