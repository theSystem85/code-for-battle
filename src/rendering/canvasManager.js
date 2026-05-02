// canvasManager.js
// Handle canvas setup, resizing, and management
import { MOBILE_CANVAS_PIXEL_RATIO_CAP } from '../config.js'

export class CanvasManager {
  constructor() {
    this.gameCanvas = document.getElementById('gameCanvas')
    this.gameCtx = this.gameCanvas ? this.gameCanvas.getContext('2d') : null
    this.gameGlCanvas = document.getElementById('gameCanvasGL')
    this.gameGl = this.initializeGlContext()
    this.minimapCanvas = document.getElementById('minimap')
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null
    this.adaptivePixelRatioCap = MOBILE_CANVAS_PIXEL_RATIO_CAP
    this.pixelRatio = this.resolvePixelRatio()
    this.lastAdaptivePixelRatioCheck = 0

    this.setupEventListeners()
  }

  isTouchLayout() {
    const body = typeof document !== 'undefined' ? document.body : null
    return Boolean(
      body?.classList.contains('is-touch') ||
      body?.classList.contains('mobile-landscape') ||
      body?.classList.contains('mobile-portrait')
    )
  }

  resolvePixelRatio(rawPixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1) {
    const configuredCap = Number.isFinite(MOBILE_CANVAS_PIXEL_RATIO_CAP) ? MOBILE_CANVAS_PIXEL_RATIO_CAP : 1
    const adaptiveCap = Number.isFinite(this.adaptivePixelRatioCap) ? this.adaptivePixelRatioCap : configuredCap
    const cap = Math.min(configuredCap, adaptiveCap)
    return Math.max(1, Math.min(rawPixelRatio || 1, cap))
  }

  resetAdaptivePixelRatioCap() {
    this.adaptivePixelRatioCap = MOBILE_CANVAS_PIXEL_RATIO_CAP
    this.resizeCanvases()
  }

  updateAdaptivePixelRatio(fps, now = performance.now()) {
    const rawPixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    if (!this.isTouchLayout() || rawPixelRatio <= 1 || !Number.isFinite(fps) || fps <= 0) {
      return false
    }

    if (now - this.lastAdaptivePixelRatioCheck < 1500) {
      return false
    }
    this.lastAdaptivePixelRatioCheck = now

    let nextCap = this.adaptivePixelRatioCap
    if (fps < 18) {
      nextCap = Math.max(1, this.adaptivePixelRatioCap - 0.5)
    } else if (fps > 45) {
      nextCap = Math.min(MOBILE_CANVAS_PIXEL_RATIO_CAP, this.adaptivePixelRatioCap + 0.5)
    }

    if (Math.abs(nextCap - this.adaptivePixelRatioCap) < 0.01) {
      return false
    }

    this.adaptivePixelRatioCap = nextCap
    this.resizeCanvases()
    return true
  }

  initializeGlContext() {
    if (!this.gameGlCanvas || typeof this.gameGlCanvas.getContext !== 'function') return null

    const attributes = {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    }

    let gl = this.gameGlCanvas.getContext('webgl2', attributes)
    if (!gl) {
      gl = this.gameGlCanvas.getContext('webgl', attributes)
    }
    return gl
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.resizeCanvases())
    this.resizeCanvases()
  }

  resizeCanvases() {
    const rawPixelRatio = window.devicePixelRatio || 1
    const pixelRatio = this.resolvePixelRatio(rawPixelRatio)
    this.pixelRatio = pixelRatio
    const body = document.body
    const bodyStyle = body ? window.getComputedStyle(body) : null
    const parseSafeInset = (value) => {
      if (!value) return 0
      const parsed = parseFloat(value)
      return Number.isFinite(parsed) ? parsed : 0
    }

    let safeLeft = bodyStyle ? parseSafeInset(bodyStyle.getPropertyValue('--safe-area-left')) : 0
    let safeRight = bodyStyle ? parseSafeInset(bodyStyle.getPropertyValue('--safe-area-right')) : 0
    let safeTop = bodyStyle ? parseSafeInset(bodyStyle.getPropertyValue('--safe-area-top')) : 0
    let safeBottom = bodyStyle ? parseSafeInset(bodyStyle.getPropertyValue('--safe-area-bottom')) : 0

    const isTouchLayout = body ? body.classList.contains('is-touch') : false

    const viewport = window.visualViewport

    const layoutWidthCandidates = []
    layoutWidthCandidates.push(window.innerWidth)
    if (viewport && viewport.width) {
      layoutWidthCandidates.push(viewport.width)
    }
    if (document.documentElement && document.documentElement.clientWidth) {
      layoutWidthCandidates.push(document.documentElement.clientWidth)
    }

    const validLayoutWidths = layoutWidthCandidates.filter(v => Number.isFinite(v) && v > 0)
    const layoutViewportWidth = validLayoutWidths.length
      ? Math.max(...validLayoutWidths)
      : this.gameCanvas.clientWidth || 0

    const layoutHeightCandidates = []
    layoutHeightCandidates.push(window.innerHeight)
    if (viewport && viewport.height) {
      layoutHeightCandidates.push(viewport.height)
    }
    if (document.documentElement && document.documentElement.clientHeight) {
      layoutHeightCandidates.push(document.documentElement.clientHeight)
    }

    const validLayoutHeights = layoutHeightCandidates.filter(v => Number.isFinite(v) && v > 0)
    const layoutViewportHeight = validLayoutHeights.length
      ? Math.max(...validLayoutHeights)
      : this.gameCanvas.clientHeight || 0

    const screenWidth = isTouchLayout && window.screen && window.screen.width
      ? window.screen.width / rawPixelRatio
      : 0
    const screenHeight = isTouchLayout && window.screen && window.screen.height
      ? window.screen.height / rawPixelRatio
      : 0

    if (viewport) {
      const totalWidth = Math.max(layoutViewportWidth, screenWidth)
      const totalHeight = Math.max(layoutViewportHeight, screenHeight)

      const viewportOffsetLeft = Number.isFinite(viewport.offsetLeft) ? viewport.offsetLeft : 0
      const viewportOffsetTop = Number.isFinite(viewport.offsetTop) ? viewport.offsetTop : 0
      const viewportWidth = Number.isFinite(viewport.width) ? viewport.width : 0
      const viewportHeight = Number.isFinite(viewport.height) ? viewport.height : 0

      const fallbackRight = Math.max(0, totalWidth - viewportWidth - viewportOffsetLeft)
      const fallbackBottom = Math.max(0, totalHeight - viewportHeight - viewportOffsetTop)

      safeLeft = Math.max(safeLeft, viewportOffsetLeft)
      safeRight = Math.max(safeRight, fallbackRight)
      safeTop = Math.max(safeTop, viewportOffsetTop)
      safeBottom = Math.max(safeBottom, fallbackBottom)
    }
    const sidebar = document.getElementById('sidebar')
    const rawSidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 250
    const mobileLandscape = body ? body.classList.contains('mobile-landscape') : false
    const mobilePortrait = body ? body.classList.contains('mobile-portrait') : false
    const sidebarCollapsed = body
      ? body.classList.contains('sidebar-collapsed') || body.classList.contains('sidebar-condensed')
      : false
    const reserveSidebarSpace = !mobileLandscape && !(mobilePortrait && sidebarCollapsed)
    const safeAdjustment = mobileLandscape ? safeLeft : 0
    const sidebarBaseWidth = Math.max(0, rawSidebarWidth - safeAdjustment)

    if (document.documentElement) {
      document.documentElement.style.setProperty('--sidebar-width', `${sidebarBaseWidth}px`)
    }

    const baseCanvasWidth = mobileLandscape
      ? Math.max(layoutViewportWidth + safeLeft + safeRight, screenWidth, 0)
      : layoutViewportWidth
    const baseCanvasHeight = mobileLandscape
      ? Math.max(layoutViewportHeight + safeTop + safeBottom, screenHeight, 0)
      : layoutViewportHeight

    // Set canvas display size (CSS)
    const effectiveSidebarWidth = reserveSidebarSpace ? rawSidebarWidth : 0
    const canvasCssWidth = mobileLandscape
      ? Math.max(0, baseCanvasWidth)
      : Math.max(0, layoutViewportWidth - effectiveSidebarWidth)
    const canvasCssHeight = Math.max(0, baseCanvasHeight)

    const applyCanvasLayout = (canvas) => {
      if (!canvas) return
      canvas.style.position = mobileLandscape ? 'fixed' : 'absolute'
      if (mobileLandscape) {
        canvas.style.left = `${-safeLeft}px`
        canvas.style.right = `${-safeRight}px`
      } else {
        canvas.style.left = `${effectiveSidebarWidth}px`
        canvas.style.right = 'auto'
      }
      canvas.style.width = `${canvasCssWidth}px`
      canvas.style.height = `${canvasCssHeight}px`
      canvas.style.top = mobileLandscape ? `${-safeTop}px` : '0px'
      canvas.style.bottom = mobileLandscape ? `${-safeBottom}px` : 'auto'
    }

    applyCanvasLayout(this.gameGlCanvas)
    applyCanvasLayout(this.gameCanvas)

    // Set actual pixel size scaled by device pixel ratio
    const targetWidth = Math.max(1, Math.round(canvasCssWidth * pixelRatio))
    const targetHeight = Math.max(1, Math.round(canvasCssHeight * pixelRatio))

    if (this.gameGlCanvas) {
      this.gameGlCanvas.width = targetWidth
      this.gameGlCanvas.height = targetHeight
      if (this.gameGl) {
        this.gameGl.viewport(0, 0, targetWidth, targetHeight)
      }
    }

    this.gameCanvas.width = targetWidth
    this.gameCanvas.height = targetHeight

    // Scale the drawing context to counter the device pixel ratio
    if (this.gameCtx) {
      this.gameCtx.setTransform(1, 0, 0, 1, 0, 0)
      this.gameCtx.scale(pixelRatio, pixelRatio)

      // Maintain high-quality rendering
      this.gameCtx.imageSmoothingEnabled = true
      this.gameCtx.imageSmoothingQuality = 'high'
    }

    // Set minimap size - make it fit entirely in the sidebar
    const minimapWidth = Math.max(140, Math.round(rawSidebarWidth - 20))
    const minimapHeight = Math.round(minimapWidth * 0.6)
    this.minimapCanvas.style.width = `${minimapWidth}px`
    this.minimapCanvas.style.height = `${minimapHeight}px`
    this.minimapCanvas.width = Math.max(1, Math.round(minimapWidth * pixelRatio))
    this.minimapCanvas.height = Math.max(1, Math.round(minimapHeight * pixelRatio))

    // Scale minimap context
    if (this.minimapCtx) {
      this.minimapCtx.setTransform(1, 0, 0, 1, 0, 0)
      this.minimapCtx.scale(pixelRatio, pixelRatio)
      this.minimapCtx.imageSmoothingEnabled = true
      this.minimapCtx.imageSmoothingQuality = 'high'
    }

    if (typeof document !== 'undefined') {
      if (window.gameState) {
        window.gameState.canvasPixelRatio = pixelRatio
        window.gameState.rawCanvasPixelRatio = rawPixelRatio
      }
      document.dispatchEvent(new CustomEvent('canvas-resized', {
        detail: {
          width: canvasCssWidth,
          height: canvasCssHeight,
          pixelRatio
        }
      }))
    }
  }

  getGameCanvas() {
    return this.gameCanvas
  }

  getGameContext() {
    return this.gameCtx
  }

  getGameGlContext() {
    return this.gameGl
  }

  getGameGlCanvas() {
    return this.gameGlCanvas
  }

  getMinimapCanvas() {
    return this.minimapCanvas
  }

  getMinimapContext() {
    return this.minimapCtx
  }
}
