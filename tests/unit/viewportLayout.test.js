import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APP_HEIGHT_VAR,
  createViewportLayoutController,
  readLayoutBox,
  syncViewportLayout
} from '../../src/ui/viewportLayout.js'

function createFakeWindow({
  innerWidth = 390,
  innerHeight = 700,
  clientWidth = 390,
  clientHeight = 700,
  visualHeight = null,
  offsetTop = 0
} = {}) {
  const state = {
    innerWidth,
    innerHeight,
    clientWidth,
    clientHeight,
    visualHeight,
    offsetTop
  }
  const vars = {}
  const listeners = {}
  const visualListeners = {}
  const root = {
    get clientWidth() {
      return state.clientWidth
    },
    get clientHeight() {
      const locked = parseFloat(vars[APP_HEIGHT_VAR] || '')
      const lockedHeight = Number.isFinite(locked) ? locked : 0
      return Math.max(state.clientHeight, lockedHeight)
    },
    style: {
      getPropertyValue(name) {
        return vars[name] || ''
      },
      setProperty(name, value) {
        vars[name] = value
      },
      removeProperty(name) {
        delete vars[name]
      }
    }
  }

  const win = {
    get innerWidth() {
      return state.innerWidth
    },
    get innerHeight() {
      return state.innerHeight
    },
    visualViewport: {
      get width() {
        return state.innerWidth
      },
      get height() {
        return state.visualHeight == null ? state.innerHeight : state.visualHeight
      },
      get offsetTop() {
        return state.offsetTop
      },
      get offsetLeft() {
        return 0
      },
      addEventListener(type, handler) {
        visualListeners[type] = visualListeners[type] || []
        visualListeners[type].push(handler)
      },
      removeEventListener(type, handler) {
        visualListeners[type] = (visualListeners[type] || []).filter(item => item !== handler)
      }
    },
    document: {
      documentElement: root,
      readyState: 'loading'
    },
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || []
      listeners[type].push(handler)
    },
    removeEventListener(type, handler) {
      listeners[type] = (listeners[type] || []).filter(item => item !== handler)
    },
    state,
    vars,
    listeners,
    visualListeners
  }

  return win
}

describe('viewport layout measurement', () => {
  it('uses the largest of inner, visual, and laid-out heights', () => {
    const win = createFakeWindow({
      innerHeight: 700,
      visualHeight: 844,
      clientHeight: 720
    })

    expect(readLayoutBox(win).height).toBe(844)
    expect(readLayoutBox(win).width).toBe(390)
  })

  it('grows --app-height when the live viewport is taller than the document', () => {
    const win = createFakeWindow({ innerHeight: 844, clientHeight: 700 })

    const box = syncViewportLayout(win)

    expect(win.vars[APP_HEIGHT_VAR]).toBe('844px')
    expect(box.height).toBe(844)
    expect(box.changed).toBe(true)
  })

  it('does not pin a stale short innerHeight over a taller document', () => {
    const win = createFakeWindow({ innerHeight: 700, clientHeight: 844 })

    const box = syncViewportLayout(win)

    expect(win.vars[APP_HEIGHT_VAR]).toBeUndefined()
    expect(box.height).toBe(844)
  })

  it('prefers a taller visualViewport over a stale innerHeight', () => {
    const win = createFakeWindow({
      innerHeight: 700,
      visualHeight: 844,
      clientHeight: 700
    })

    syncViewportLayout(win)

    expect(win.vars[APP_HEIGHT_VAR]).toBe('844px')
    expect(readLayoutBox(win).height).toBe(844)
  })

  it('drops the pixel lock on a real shrink so dynamic viewport units can take over', () => {
    const win = createFakeWindow({ innerHeight: 700, clientHeight: 700 })
    win.vars[APP_HEIGHT_VAR] = '844px'

    const box = syncViewportLayout(win, { allowShrink: true })

    expect(win.vars[APP_HEIGHT_VAR]).toBeUndefined()
    expect(box.changed).toBe(true)
    expect(box.height).toBe(700)
  })

  it('keeps a taller document when a settle pass sees a stale short viewport', () => {
    const win = createFakeWindow({ innerHeight: 700, clientHeight: 844 })
    win.vars[APP_HEIGHT_VAR] = '900px'

    syncViewportLayout(win, { allowShrink: false })

    expect(win.vars[APP_HEIGHT_VAR]).toBe('900px')
    expect(readLayoutBox(win).height).toBe(900)
  })
})

describe('viewport layout controller', () => {
  let controller = null

  afterEach(() => {
    controller?.dispose()
    controller = null
    vi.restoreAllMocks()
  })

  function install(win, { onChange, settleDelays = [] } = {}) {
    const frames = []
    const timeouts = []
    controller = createViewportLayoutController({
      win,
      onChange,
      settleDelays,
      requestFrame(callback) {
        frames.push(callback)
        return frames.length
      },
      cancelFrame(handle) {
        frames[handle - 1] = null
      },
      scheduleTimeout(callback, delay) {
        const id = timeouts.length + 1
        timeouts.push({ id, callback, delay })
        return id
      },
      cancelTimeout(id) {
        const entry = timeouts.find(item => item.id === id)
        if (entry) entry.callback = null
      }
    })
    return { frames, timeouts }
  }

  it('coalesces resize bursts into one frame and refreshes once', () => {
    const win = createFakeWindow({ innerHeight: 700, clientHeight: 700 })
    const sizes = []
    const { frames } = install(win, {
      onChange(size) {
        sizes.push(size.height)
      }
    })

    expect(sizes).toEqual([700])
    const framesBeforeResize = frames.length
    win.state.innerHeight = 844
    win.state.clientHeight = 844
    win.listeners.resize.forEach(handler => handler())
    win.listeners.resize.forEach(handler => handler())
    expect(sizes).toEqual([700])

    const pending = frames.slice(framesBeforeResize).filter(Boolean)
    expect(pending).toHaveLength(1)
    pending[0]()

    expect(sizes).toEqual([700, 844])
  })

  it('picks up a viewport that grows after load without a resize event', () => {
    const win = createFakeWindow({ innerHeight: 640, clientHeight: 640 })
    const sizes = []
    const { timeouts } = install(win, {
      settleDelays: [120, 700],
      onChange(size) {
        sizes.push(size.height)
      }
    })

    expect(sizes).toEqual([640])
    expect(timeouts.map(entry => entry.delay)).toEqual([120, 700])

    win.state.innerHeight = 844
    win.state.clientHeight = 844
    timeouts[0].callback()

    expect(sizes).toEqual([640, 844])
    timeouts[1].callback()
    expect(sizes).toEqual([640, 844])
  })

  it('listens for visual viewport, orientation, pageshow, and load', () => {
    const win = createFakeWindow()
    install(win, { onChange() {} })

    expect(win.listeners.resize).toHaveLength(1)
    expect(win.listeners.orientationchange).toHaveLength(1)
    expect(win.listeners.pageshow).toHaveLength(1)
    expect(win.listeners.load).toHaveLength(1)
    expect(win.visualListeners.resize).toHaveLength(1)
  })

  it('does not publish another change after dispose', () => {
    const win = createFakeWindow({ innerHeight: 700, clientHeight: 700 })
    const sizes = []
    const { frames } = install(win, {
      onChange(size) {
        sizes.push(size.height)
      }
    })
    const resize = win.listeners.resize[0]
    controller.dispose()

    win.state.innerHeight = 844
    resize()
    frames.filter(Boolean).forEach(callback => callback())

    expect(sizes).toEqual([700])
    expect(win.listeners.resize).toHaveLength(0)
  })
})
